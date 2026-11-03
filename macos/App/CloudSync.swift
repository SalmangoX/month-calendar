import AppKit

/// iCloud 云盘同步（免费，只要登录了 Apple ID，不需要 GitHub 或网盘账号）：
/// 用户在 iCloud 云盘里选一个文件夹，几台 Mac 选同一个文件夹，就读写同一个 cadence-calendar.json。
/// 合并由网页的同步逻辑负责（和 GitHub、WebDAV 一样）；这里只负责选文件夹、读、写这个文件。
/// 读写都经过 NSFileCoordinator，和 iCloud 自己的同步互相让开；文件还没从 iCloud 下载下来时只报「稍后再试」，
/// 绝不拿本机数据去覆盖（不然另一台 Mac 的数据会被冲掉）。
@MainActor
final class CloudSync {
    static let shared = CloudSync()
    static let file = "cadence-calendar.json"
    private let key = "cloudSyncBookmark"
    private(set) var folder: URL?

    private init() { resolve() }

    var enabled: Bool { folder != nil }

    /// 选文件夹（默认打开 iCloud 云盘）；返回 {ok, name}
    func choose() -> JObj {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canChooseFiles = false
        p.canCreateDirectories = true
        p.allowsMultipleSelection = false
        p.message = I18n.t("在 iCloud 云盘里选一个文件夹（比如新建一个「节律」）。每台 Mac 都选同一个文件夹，数据就会互相同步")
        p.prompt = I18n.t("选择")
        if let pw = getpwuid(getuid()) { // 沙盒里 home 是容器目录，这里取真正的用户目录
            p.directoryURL = URL(fileURLWithPath: String(cString: pw.pointee.pw_dir))
                .appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs", isDirectory: true)
        }
        NSApp.activate(ignoringOtherApps: true)
        guard p.runModal() == .OK, let u = p.url else { return ["ok": false] }
        do {
            let bm = try u.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(bm, forKey: key)
            folder = u
            return ["ok": true, "name": u.lastPathComponent]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    func stop() {
        UserDefaults.standard.removeObject(forKey: key)
        folder = nil
    }

    /// 读：{status: 200, body, etag} / 304（和 tag 一样，没变化）/ 404（还没有数据）/ 202（iCloud 还在下载，稍后再试）/ {error}
    func read(ifNot tag: String) -> JObj {
        guard let dir = folder else { return ["error": I18n.t("还没有选择 iCloud 云盘文件夹")] }
        let ok = dir.startAccessingSecurityScopedResource()
        defer { if ok { dir.stopAccessingSecurityScopedResource() } }
        let u = dir.appendingPathComponent(CloudSync.file)
        let fm = FileManager.default
        if !fm.fileExists(atPath: u.path) {
            // 「优化 Mac 存储空间」时，没下载的文件只有一个 .xxx.icloud 占位文件
            let placeholder = dir.appendingPathComponent("." + CloudSync.file + ".icloud")
            if fm.fileExists(atPath: placeholder.path) { try? fm.startDownloadingUbiquitousItem(at: u); return ["status": 202] }
            return ["status": 404]
        }
        let v = try? u.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey, .contentModificationDateKey, .fileSizeKey])
        if let s = v?.ubiquitousItemDownloadingStatus, s != .current {
            try? fm.startDownloadingUbiquitousItem(at: u) // 云端有更新、本机还是旧的：先下载，下次再读
            if s == .notDownloaded { return ["status": 202] }
        }
        let etag = "\(v?.contentModificationDate?.timeIntervalSince1970 ?? 0)-\(v?.fileSize ?? 0)"
        if !tag.isEmpty && tag == etag { return ["status": 304, "etag": etag] }
        var out: JObj = ["error": I18n.t("读取 iCloud 云盘失败")]
        var err: NSError?
        NSFileCoordinator().coordinate(readingItemAt: u, options: [], error: &err) { url in
            if let d = try? Data(contentsOf: url), let s = String(data: d, encoding: .utf8) { out = ["status": 200, "body": s, "etag": etag] }
        }
        return out
    }

    /// 写：{status: 201, etag} / {error}
    func write(_ body: String) -> JObj {
        guard let dir = folder else { return ["error": I18n.t("还没有选择 iCloud 云盘文件夹")] }
        let ok = dir.startAccessingSecurityScopedResource()
        defer { if ok { dir.stopAccessingSecurityScopedResource() } }
        let u = dir.appendingPathComponent(CloudSync.file)
        var out: JObj = ["error": I18n.t("写入 iCloud 云盘失败")]
        var err: NSError?
        NSFileCoordinator().coordinate(writingItemAt: u, options: .forReplacing, error: &err) { url in
            do {
                try Data(body.utf8).write(to: url, options: .atomic)
                let v = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                out = ["status": 201, "etag": "\(v?.contentModificationDate?.timeIntervalSince1970 ?? 0)-\(v?.fileSize ?? 0)"]
            } catch { out = ["error": I18n.t("写入 iCloud 云盘失败") + "：" + error.localizedDescription] }
        }
        return out
    }

    private func resolve() {
        guard let bm = UserDefaults.standard.data(forKey: key) else { return }
        var stale = false
        guard let u = try? URL(resolvingBookmarkData: bm, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale) else { return }
        folder = u
        if stale, let fresh = try? u.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(fresh, forKey: key)
        }
    }
}
