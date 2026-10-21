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
    /// 在终端里粘贴运行的更新命令
    var command: String { "curl -fsSL https://raw.githubusercontent.com/\(repo)/main/macos/update.sh | bash" }

    func start() {
        Task { await check(manual: false) }
        timer = Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { _ in
            Task { @MainActor in await Updater.shared.check(manual: false) }
        }
    }

    func check(manual: Bool) async {
        guard !checking else { return }
        checking = true
        defer { checking = false }
        let url = URL(string: "https://raw.githubusercontent.com/\(repo)/main/macos/version.json")!
        let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        guard let res = try? await URLSession.shared.data(for: req),
              (res.1 as? HTTPURLResponse)?.statusCode == 200,
              let o = (try? JSONSerialization.jsonObject(with: res.0)) as? JObj, o.int("build") > 0 else {
            if manual { alert(I18n.t("检查更新失败"), I18n.t("连不上 GitHub，稍后再试。")) }
            return
        }
        latest = Latest(version: o.str("version"), build: o.int("build"))
        if available {
            notifyOnce()
            if manual { install() }
        } else if manual {
            alert(I18n.t("已经是最新版本"), I18n.t("Mac 版 {0}（{1}）", currentVersion, currentBuild))
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

    /// 复制更新命令并打开终端（App 在沙盒里，不能自己运行编译）
    func install() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(command, forType: .string)
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"),
                                           configuration: NSWorkspace.OpenConfiguration())
        alert(I18n.t("更新命令已复制"), I18n.t("在打开的终端窗口里按 ⌘V 粘贴，再按回车。编译大约一两分钟，完成后节律会自动重新打开。"))
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
