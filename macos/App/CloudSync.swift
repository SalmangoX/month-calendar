#if os(macOS)
import AppKit
#else
import UIKit
import UniformTypeIdentifiers
#endif

/// iCloud 云盘同步（免费，只要登录了 Apple ID，不需要 GitHub 或网盘账号）：
/// 用户在 iCloud 云盘里选一个文件夹，每台 Mac / iPhone 选同一个文件夹，就读写同一个 cadence-calendar.json。
/// 合并由网页的同步逻辑负责（和 GitHub、WebDAV 一样）；这里只负责选文件夹、读、写这个文件。
/// 读写都经过 NSFileCoordinator，和 iCloud 自己的同步互相让开；文件还没从 iCloud 下载下来时只报「稍后再试」，
/// 绝不拿本机数据去覆盖（不然另一台 Mac 的数据会被冲掉）。
@MainActor
final class CloudSync {
    static let shared = CloudSync()
    static let file = "cadence-calendar.json"
    private let key = "cloudSyncBookmark"
    private(set) var folder: URL?
    /// 上次读到的副本（文件名 → 修改时间）：写回主文件后只删这些，读完之后才出现的副本留到下次合并
    private var seenCopies: [String: Date] = [:]

    private init() { resolve() }

    var enabled: Bool { folder != nil }

    // 记住选的文件夹：Mac 在沙盒里要带安全范围的书签；iPhone 用普通书签（系统选择器给的地址自带访问权限）
    #if os(macOS)
    private static let bmCreate: URL.BookmarkCreationOptions = .withSecurityScope
    private static let bmResolve: URL.BookmarkResolutionOptions = .withSecurityScope
    #else
    private static let bmCreate: URL.BookmarkCreationOptions = []
    private static let bmResolve: URL.BookmarkResolutionOptions = []
    #endif

    private func use(_ u: URL) -> JObj {
        do {
            let bm = try u.bookmarkData(options: CloudSync.bmCreate, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(bm, forKey: key)
            folder = u
            return ["ok": true, "name": u.lastPathComponent]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    #if os(macOS)
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
        return use(u)
    }
    #else
    /// iPhone：系统的「选择文件夹」（在「文件」里选 iCloud 云盘里的文件夹），选好后回调 {ok, name}
    func choose(_ done: @escaping (JObj) -> Void) {
        let p = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        let d = PickerDelegate { [weak self] u in
            guard let self, let u else { done(["ok": false]); return }
            let ok = u.startAccessingSecurityScopedResource() // 第一次选好时拿到访问权，记成书签以后一直能用
            defer { if ok { u.stopAccessingSecurityScopedResource() } }
            done(self.use(u))
        }
        p.delegate = d
        objc_setAssociatedObject(p, &PickerDelegate.key, d, .OBJC_ASSOCIATION_RETAIN) // 选择器关掉前一直留着
        guard let top = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { done(["ok": false]); return }
        var vc = top
        while let n = vc.presentedViewController { vc = n }
        vc.present(p, animated: true)
    }
    #endif

    func stop() {
        UserDefaults.standard.removeObject(forKey: key)
        folder = nil
    }

    /// iPhone 网页版手动存回时，iOS 有时不替换、而是存成「cadence-calendar 2.json」这类副本：读出来一起合并，写回主文件后删掉
    private func readCopies(in dir: URL) -> [String] {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: dir.path) else { return [] }
        let stem = (CloudSync.file as NSString).deletingPathExtension
        var bodies: [String] = []
        seenCopies = [:]
        for n in names where n != CloudSync.file {
            if n.hasPrefix("." + stem) && n.hasSuffix(".json.icloud") { // 副本还没下载：先下载，下次再读
                let real = String(n.dropFirst().dropLast(".icloud".count))
                try? fm.startDownloadingUbiquitousItem(at: dir.appendingPathComponent(real))
                continue
            }
            guard n.hasPrefix(stem), n.hasSuffix(".json") else { continue }
            let u = dir.appendingPathComponent(n)
            var err: NSError?
            NSFileCoordinator().coordinate(readingItemAt: u, options: [], error: &err) { url in
                if let d = try? Data(contentsOf: url), let s = String(data: d, encoding: .utf8) {
                    bodies.append(s)
                    seenCopies[n] = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
                }
            }
        }
        return bodies
    }

    private func dropCopies(in dir: URL) {
        for (n, t) in seenCopies {
            let u = dir.appendingPathComponent(n)
            let now = (try? u.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            guard now == t else { continue } // 读完之后又变过：留到下次合并
            var err: NSError?
            NSFileCoordinator().coordinate(writingItemAt: u, options: .forDeleting, error: &err) { url in try? FileManager.default.removeItem(at: url) }
        }
        seenCopies = [:]
    }

    /// 读：{status: 200, body, etag} / 304（和 tag 一样，没变化）/ 404（还没有数据）/ 202（iCloud 还在下载，稍后再试）/ {error}
    /// 有副本时附带 copies（副本内容），并且不会返回 304，让网页合并后写回主文件
    func read(ifNot tag: String) -> JObj {
        guard let dir = folder else { return ["error": I18n.t("还没有选择 iCloud 云盘文件夹")] }
        let ok = dir.startAccessingSecurityScopedResource()
        defer { if ok { dir.stopAccessingSecurityScopedResource() } }
        let u = dir.appendingPathComponent(CloudSync.file)
        let fm = FileManager.default
        let copies = readCopies(in: dir)
        if !fm.fileExists(atPath: u.path) {
            // 「优化 Mac 存储空间」时，没下载的文件只有一个 .xxx.icloud 占位文件
            let placeholder = dir.appendingPathComponent("." + CloudSync.file + ".icloud")
            if fm.fileExists(atPath: placeholder.path) { try? fm.startDownloadingUbiquitousItem(at: u); return ["status": 202] }
            return copies.isEmpty ? ["status": 404] : ["status": 404, "copies": copies]
        }
        let v = try? u.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey, .contentModificationDateKey, .fileSizeKey])
        if let s = v?.ubiquitousItemDownloadingStatus, s != .current {
            try? fm.startDownloadingUbiquitousItem(at: u) // 云端有更新、本机还是旧的：先下载，下次再读
            if s == .notDownloaded { return ["status": 202] }
        }
        let etag = "\(v?.contentModificationDate?.timeIntervalSince1970 ?? 0)-\(v?.fileSize ?? 0)"
        if !tag.isEmpty && tag == etag && copies.isEmpty { return ["status": 304, "etag": etag] }
        var out: JObj = ["error": I18n.t("读取 iCloud 云盘失败")]
        var err: NSError?
        NSFileCoordinator().coordinate(readingItemAt: u, options: [], error: &err) { url in
            if let d = try? Data(contentsOf: url), let s = String(data: d, encoding: .utf8) { out = ["status": 200, "body": s, "etag": etag] }
        }
        if !copies.isEmpty && out["error"] == nil { out["copies"] = copies }
        return out
    }

    /// 写：{status: 201, etag} / {error}
    func write(_ body: String) -> JObj {
        guard let dir = folder else { return ["error": I18n.t("还没有选择 iCloud 云盘文件夹")] }
        let ok = dir.startAccessingSecurityScopedResource()
        defer { if ok { dir.stopAccessingSecurityScopedResource() } }
        let u = dir.appendingPathComponent(CloudSync.file)
        var out: JObj = ["error": I18n.t("写入 iCloud 云盘失败")]
        var written = false
        var err: NSError?
        NSFileCoordinator().coordinate(writingItemAt: u, options: .forReplacing, error: &err) { url in
            do {
                try Data(body.utf8).write(to: url, options: .atomic)
                let v = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                out = ["status": 201, "etag": "\(v?.contentModificationDate?.timeIntervalSince1970 ?? 0)-\(v?.fileSize ?? 0)"]
                written = true
            } catch { out = ["error": I18n.t("写入 iCloud 云盘失败") + "：" + error.localizedDescription] }
        }
        if written { dropCopies(in: dir) } // 副本已经合并进主文件了
        return out
    }

    private func resolve() {
        guard let bm = UserDefaults.standard.data(forKey: key) else { return }
        var stale = false
        guard let u = try? URL(resolvingBookmarkData: bm, options: CloudSync.bmResolve, relativeTo: nil, bookmarkDataIsStale: &stale) else { return }
        folder = u
        if stale, let fresh = try? u.bookmarkData(options: CloudSync.bmCreate, includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(fresh, forKey: key)
        }
    }
}

#if os(iOS)
/// 文件夹选择器的回调（UIKit 只弱引用 delegate，所以挂在选择器身上）
private final class PickerDelegate: NSObject, UIDocumentPickerDelegate {
    nonisolated(unsafe) static var key = 0
    let done: (URL?) -> Void
    init(_ done: @escaping (URL?) -> Void) { self.done = done }
    func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls.first) }
    func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) { done(nil) }
}
#endif
