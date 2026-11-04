import SwiftUI
import UserNotifications

/// 节律 iPhone 版：网页（和 Mac、安卓同一份）+ 原生液态玻璃导航层 + 系统本地提醒。
/// 提醒在保存时就交给 iPhone 系统按时间排好（Engine 和 Mac 版共用），App 关着、断网也照样准时弹出，不需要服务器。
@main
struct CadenceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootView(c: WebController.shared, m: WebController.shared.nav)
                .onOpenURL { url in // cadence://open?hash=today
                    let hash = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "hash" }?.value ?? ""
                    WebController.shared.open(hash: hash.isEmpty || hash.hasPrefix("#") ? hash : "#" + hash)
                }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ app: UIApplication, didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in Engine.shared.start() }
        return true
    }

    /// App 开着时也弹出横幅
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// 点通知：打开对应的页面（每日提醒打开「今日」）
    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
        let hash = r.notification.request.content.userInfo["hash"] as? String ?? ""
        await MainActor.run { WebController.shared.open(hash: hash) }
    }
}

/// 网页铺满全屏；导航层是 Mac 版共用的原生液态玻璃，浮在网页上面。
/// 网页的面板从底部弹出时（新建事件、设置表单），菜单栏和加号先让开
struct RootView: View {
    let c: WebController
    @ObservedObject var m: NavModel

    var body: some View {
        ZStack(alignment: .bottom) {
            WebView(controller: c).ignoresSafeArea()
            VStack(spacing: -6) {
                HStack {
                    Spacer()
                    GlassFab(m: m).opacity(m.fab ? 1 : 0).allowsHitTesting(m.fab).padding(.trailing, 6)
                }
                GlassTabBar(m: m).padding(.horizontal, 6)
            }
            .padding(.bottom, -10) // 玻璃留给阴影的边距：贴近底部的 Home 条，和系统菜单栏一样的位置
            .offset(y: m.cover ? 160 : 0)
            .opacity(m.cover ? 0 : 1)
            .allowsHitTesting(!m.cover)
            .ignoresSafeArea(.keyboard)
            // 批量添加的「再加一个」：系统液态玻璃，画在网页按钮的位置上（网页坐标 = 屏幕坐标）
            ZStack {
                if let r = m.addRow {
                    GlassAddButton(m: m).position(x: r.midX, y: r.midY)
                        .transition(.scale(scale: 0.7).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            GlassMenu(m: m).ignoresSafeArea().allowsHitTesting(m.menu != nil)
            GlassDrawer(m: m).allowsHitTesting(m.drawerOpen)
        }
        .background(Color(uiColor: WebController.appBg))
    }
}
