import AppKit
import UserNotifications

@main
@MainActor
enum CadenceMain {
    private static let delegate = AppDelegate()
    static func main() {
        let app = NSApplication.shared
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}

/// 节律 Mac 版：主窗口装的就是 GitHub Pages 上的网页（每次打开都是最新版，改网页不用重新编译），
/// 原生部分负责菜单栏月历、桌面小组件、系统通知和后台同步。
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private(set) var main: MainWindowController!
    private var bar: StatusBar!

    func applicationDidFinishLaunching(_ n: Notification) {
        let engine = Engine.shared // 先读一次数据：语言跟着同步数据走，菜单要用
        UNUserNotificationCenter.current().delegate = self
        NSApp.mainMenu = buildMenu()
        main = MainWindowController()
        bar = StatusBar(engine: engine)
        engine.start()
        main.show()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { main.show() }
        return true
    }

    /// 关掉窗口后留在菜单栏，继续同步和刷新小组件
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// 小组件点进来：cadence://open?hash=today
    func application(_ application: NSApplication, open urls: [URL]) {
        for u in urls where u.scheme == Shared.urlScheme {
            let h = URLComponents(url: u, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "hash" }?.value ?? ""
            main.show(hash: h.isEmpty ? "" : "#" + h)
        }
    }

    @objc func showMain(_ sender: Any?) { main.show() }
    @objc func reloadWeb(_ sender: Any?) { main.reload() }

    // ---------- 通知 ----------
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list]) // App 在前台时也弹出
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let hash = response.notification.request.content.userInfo["hash"] as? String ?? ""
        Task { @MainActor in (NSApp.delegate as? AppDelegate)?.main.show(hash: hash) }
        completionHandler()
    }

    // ---------- 菜单 ----------
    private func buildMenu() -> NSMenu {
        func t(_ s: String) -> String { I18n.t(s) }
        let menu = NSMenu()
        func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            i.target = target
            return i
        }
        func sub(_ title: String, _ items: [NSMenuItem]) -> NSMenu {
            let m = NSMenu(title: title)
            items.forEach(m.addItem)
            let host = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            host.submenu = m
            menu.addItem(host)
            return m
        }
        _ = sub("节律", [
            item(t("关于节律"), #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            .separator(),
            item(t("隐藏节律"), #selector(NSApplication.hide(_:)), "h"),
            item(t("隐藏其他"), #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item(t("全部显示"), #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            item(t("退出节律"), #selector(NSApplication.terminate(_:)), "q"),
        ])
        _ = sub(t("编辑"), [
            item(t("撤销"), Selector(("undo:")), "z"),
            item(t("重做"), Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item(t("剪切"), #selector(NSText.cut(_:)), "x"),
            item(t("拷贝"), #selector(NSText.copy(_:)), "c"),
            item(t("粘贴"), #selector(NSText.paste(_:)), "v"),
            item(t("全选"), #selector(NSText.selectAll(_:)), "a"),
        ])
        _ = sub(t("显示"), [item(t("重新载入"), #selector(reloadWeb(_:)), "r", target: self)])
        let win = sub(t("窗口"), [
            item(t("最小化"), #selector(NSWindow.performMiniaturize(_:)), "m"),
            item(t("缩放"), #selector(NSWindow.performZoom(_:))),
            item(t("关闭窗口"), #selector(NSWindow.performClose(_:)), "w"),
            .separator(),
            item(t("节律主窗口"), #selector(showMain(_:)), "0", target: self),
        ])
        NSApp.windowsMenu = win
        return menu
    }
}
