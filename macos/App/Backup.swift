import AppKit

/// iCloud 云盘备份（免费，不需要开发者账号）：用户在 iCloud 云盘里选一个文件夹，
/// 数据每次变化后自动写一份「节律备份.json」，另在「历史」里按天各留一份，保留 14 天。
/// 只是备份，同步仍然走 GitHub；恢复时在 设置 → 导入备份 选这个文件即可（与现有数据合并）。
@MainActor
final class Backup: ObservableObject {
    static let shared = Backup()

    @Published private(set) var folder: URL?
    @Published private(set) var lastAt: Date?
    @Published private(set) var error = ""

    private let key = "backupBookmark"
    private static let latestName = "节律备份.json"
    private static let keepDays = 14
    private var latest = ""
    private var gen = 0

    private init() { resolve() }

    var enabled: Bool { folder != nil }
    var folderName: String { folder?.lastPathComponent ?? "" }

    /// 选文件夹，默认打开 iCloud 云盘
    func choose() {
        let p = NSOpenPanel()
        p.canChooseDirectories = true
        p.canChooseFiles = false
        p.canCreateDirectories = true
        p.allowsMultipleSelection = false
        p.message = I18n.t("选择 iCloud 云盘里的一个文件夹，节律会把数据自动备份到这里")
        p.prompt = I18n.t("选择")
        if let pw = getpwuid(getuid()) { // 沙盒里 home 是容器目录，这里取真正的用户目录
            p.directoryURL = URL(fileURLWithPath: String(cString: pw.pointee.pw_dir))
                .appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs", isDirectory: true)
        }
        NSApp.activate(ignoringOtherApps: true)
        guard p.runModal() == .OK, let u = p.url else { return }
        do {
            let bm = try u.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(bm, forKey: key)
            folder = u
            error = ""
            write(latest.isEmpty ? Shared.readJSON() : latest)
        } catch {
            self.error = I18n.t("备份失败：{0}", error.localizedDescription)
        }
    }

    func stop() {
        UserDefaults.standard.removeObject(forKey: key)
        folder = nil
        lastAt = nil
        error = ""
    }

    func reveal() {
        guard let u = folder else { return }
        let ok = u.startAccessingSecurityScopedResource()
        defer { if ok { u.stopAccessingSecurityScopedResource() } }
        NSWorkspace.shared.activateFileViewerSelecting([u.appendingPathComponent(Backup.latestName)])
    }

    /// 数据变化后调用；连续改动合并成一次写入
    func save(_ json: String) {
        guard !json.isEmpty else { return } // 清空数据时不覆盖备份
        latest = json
        guard folder != nil else { return }
        gen += 1
        let g = gen
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if g == self.gen { self.write(self.latest) }
        }
    }

    private func resolve() {
        guard let bm = UserDefaults.standard.data(forKey: key) else { return }
        var stale = false
        guard let u = try? URL(resolvingBookmarkData: bm, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale) else {
            error = I18n.t("找不到备份文件夹，请重新选择")
            return
        }
        folder = u
        if stale, let fresh = try? u.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(fresh, forKey: key)
        }
    }

    private func write(_ json: String) {
        guard let u = folder, !json.isEmpty else { return }
        let ok = u.startAccessingSecurityScopedResource()
        defer { if ok { u.stopAccessingSecurityScopedResource() } }
        // 和网页「导出备份」同样的格式，方便直接导入
        var text = json
        if let o = jparse(json), let d = try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys]),
           let s = String(data: d, encoding: .utf8) { text = s }
        do {
            let fm = FileManager.default
            try text.write(to: u.appendingPathComponent(Backup.latestName), atomically: true, encoding: .utf8)
            let hist = u.appendingPathComponent("历史", isDirectory: true)
            try fm.createDirectory(at: hist, withIntermediateDirectories: true)
            let today = YMD.today
            try text.write(to: hist.appendingPathComponent("节律备份-\(today.key).json"), atomically: true, encoding: .utf8)
            // 每天留一份（当天的会被当天最后一次改动覆盖），超过 14 天的删掉
            let keep = Set((0..<Backup.keepDays).map { "节律备份-\(today.adding(-$0).key).json" })
            for f in (try? fm.contentsOfDirectory(atPath: hist.path)) ?? [] where f.hasPrefix("节律备份-") && !keep.contains(f) {
                try? fm.removeItem(at: hist.appendingPathComponent(f))
            }
            lastAt = Date()
            error = ""
        } catch {
            self.error = I18n.t("备份失败：{0}", error.localizedDescription)
        }
    }
}
