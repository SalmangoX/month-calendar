import AppKit
import UserNotifications

/// Mac 版原生部分的更新检查：网页每次打开都是最新的，不需要更新；
/// 只有 macos 文件夹里的原生代码改了才需要重新编译。版本号写在仓库的 macos/version.json，
/// 这里每 6 小时（以及手动「检查更新」时）对比一次，有新版本就在菜单栏提示，并发一次通知。
/// 更新 = 在终端里运行 macos/update.sh：下载最新源码 → 编译 → 替换「应用程序」里的节律 → 重新打开。
@MainActor
final class Updater: ObservableObject {
    static let shared = Updater()

    struct Latest { let version: String; let build: Int }
    @Published private(set) var latest: Latest?
    @Published private(set) var checking = false

    let repo = Bundle.main.object(forInfoDictionaryKey: "CadenceRepo") as? String ?? "SalmangoX/month-calendar"
    private var timer: Timer?

    var currentVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
    var currentBuild: Int { Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0 }
    var available: Bool { (latest?.build ?? 0) > currentBuild }
    /// 装了 Xcode：在本机下载源码编译更新（和以前一样）；没装（比如朋友的 Mac）：直接下载做好的安装包
    var canBuild: Bool { NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.dt.Xcode") != nil }
    /// 国内也能访问的镜像（jsDelivr，自动同步 GitHub 上的文件）；安装包放在 dist 分支（只保留最新一个）
    private var mirror: String { "https://cdn.jsdelivr.net/gh/\(repo)" }
    /// 在终端里粘贴运行的更新命令
    var command: String { "curl -fsSL https://raw.githubusercontent.com/\(repo)/main/macos/update.sh | bash" }

    func start() {
        Task { await check(manual: false) }
        timer = Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { _ in
            Task { @MainActor in await Updater.shared.check(manual: false) }
        }
    }

    func check(manual: Bool) async {
        guard manual || !checking else { return } // 手动检查总是执行，不被后台那次挡住
        checking = true
        defer { checking = false }
        // 先问 GitHub API：上传后立刻就能查到（raw.githubusercontent.com 有大约 5 分钟的缓存）；
        // API 每小时限 60 次，万一超了再退回 raw
        func fetch(_ url: String, _ accept: String?, needBuild: Bool = true) async -> JObj? {
            var req = URLRequest(url: URL(string: url)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
            if let a = accept { req.setValue(a, forHTTPHeaderField: "Accept") }
            guard let res = try? await URLSession.shared.data(for: req), (res.1 as? HTTPURLResponse)?.statusCode == 200,
                  let o = (try? JSONSerialization.jsonObject(with: res.0)) as? JObj, !needBuild || o.int("build") > 0 else { return nil }
            return o
        }
        // 先问 GitHub，连不上（比如在国内）再问镜像；没装 Xcode 的看做好的安装包是哪个版本
        let path = canBuild ? "macos/version.json" : "mac.json", branch = canBuild ? "main" : "dist"
        var found = await fetch("https://api.github.com/repos/\(repo)/contents/\(path)?ref=\(branch)", "application/vnd.github.raw")
        if found == nil { found = await fetch("https://raw.githubusercontent.com/\(repo)/\(branch)/\(path)", nil) }
        if found == nil { found = await fetch("\(mirror)@\(branch)/\(path)", nil) }
        guard let o = found else {
            if manual { alert(I18n.t("检查更新失败"), I18n.t("连不上 GitHub，稍后再试。")) }
            return
        }
        // 版本号三端共用仓库根目录的 version.json；macos/version.json 只放 Mac 的构建号
        var ver = await fetch("https://api.github.com/repos/\(repo)/contents/version.json?ref=main", "application/vnd.github.raw", needBuild: false)
        if ver == nil { ver = await fetch("https://raw.githubusercontent.com/\(repo)/main/version.json", nil, needBuild: false) }
        if ver == nil { ver = await fetch("\(mirror)@main/version.json", nil, needBuild: false) }
        if !canBuild, let v = found?.str("version"), !v.isEmpty { ver = ["version": v] }
        latest = Latest(version: ver?.str("version") ?? currentVersion, build: o.int("build"))
        if available {
            notifyOnce()
            if manual { install() }
        } else if manual {
            alert(I18n.t("已经是最新版本"), I18n.t("Mac 版 {0}（{1}）", currentVersion, "Mac \(currentBuild)"))
        }
    }

    /// 每个新版本只通知一次
    private func notifyOnce() {
        guard let l = latest, UserDefaults.standard.integer(forKey: "notifiedBuild") != l.build else { return }
        UserDefaults.standard.set(l.build, forKey: "notifiedBuild")
        let c = UNMutableNotificationContent()
        c.title = I18n.t("节律 Mac 版有新版本 {0}", l.version)
        c.body = I18n.t("点菜单栏的日历图标更新。")
        c.userInfo = ["hash": ""]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "update-\(l.build)", content: c, trigger: nil))
    }

    /// 复制更新命令并打开终端（App 在沙盒里，不能自己运行编译）；没装 Xcode 的直接下载安装包
    func install() {
        guard canBuild else { Task { await downloadInstaller() }; return }
        runInTerminal(command, I18n.t("更新命令已复制"), I18n.t("在打开的终端窗口里按 ⌘V 粘贴，再按回车。编译大约一两分钟，完成后节律会自动重新打开。"))
    }

    /// 一键生成可以发给别人的安装包：把「应用程序」里这份节律打包成桌面上的 .dmg（同样要在终端里运行）
    func makeInstaller() {
        runInTerminal("curl -fsSL https://raw.githubusercontent.com/\(repo)/main/macos/make-dmg.sh | bash",
                      I18n.t("打包命令已复制"), I18n.t("在打开的终端窗口里按 ⌘V 粘贴，再按回车。大约半分钟后，桌面上会出现可以直接发给别人的安装包（.dmg），并自动在访达里选中。"))
    }

    /// 下载做好的安装包（经国内镜像）并打开，把节律拖进「应用程序」替换旧版就行
    private var downloading = false
    func downloadInstaller() async {
        guard !downloading else { return }
        downloading = true
        defer { downloading = false }
        var req = URLRequest(url: URL(string: "\(mirror)@dist/Cadence.dmg")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 120)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        guard let (tmp, r) = try? await URLSession.shared.download(for: req), (r as? HTTPURLResponse)?.statusCode == 200 else {
            alert(I18n.t("下载安装包失败"), I18n.t("连不上网络，稍后再试。")); return
        }
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("节律-Cadence-\(latest?.version ?? "").dmg")
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: tmp, to: dest) } catch { alert(I18n.t("下载安装包失败"), error.localizedDescription); return }
        NSWorkspace.shared.open(dest)
        alert(I18n.t("安装包已打开"), I18n.t("在打开的窗口里把节律拖到「应用程序」，选择替换，然后重新打开节律。"))
    }

    private func runInTerminal(_ cmd: String, _ title: String, _ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(cmd, forType: .string)
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"),
                                           configuration: NSWorkspace.OpenConfiguration())
        alert(title, text)
    }

    private func alert(_ title: String, _ text: String) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.addButton(withTitle: I18n.t("好"))
        a.runModal()
    }
}
