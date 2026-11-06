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
    @ObservedObject var cam = NativeCamModel.shared

    var body: some View {
        ZStack(alignment: .bottom) {
            WebView(controller: c).ignoresSafeArea()
            GlassLayer(m: m).ignoresSafeArea() // 网页里的玻璃控件：系统液态玻璃
            if m.dock != nil {
                // 新底栏：左时钟胶囊 · 中分页点 · 右 logo 扇形菜单（位置和网页 styles.css 一致）
                GeometryReader { g in
                    GlassDock(m: m, safeBottom: g.safeAreaInsets.bottom)
                        .frame(width: g.size.width, height: g.size.height + g.safeAreaInsets.bottom, alignment: .bottom)
                        .frame(maxHeight: .infinity, alignment: .top)
                }
                .ignoresSafeArea(.keyboard)
            }   // 网页还没发来底栏状态（刚打开、预加载时）什么都不画：旧的玻璃菜单栏和蓝色加号已经不用了
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
            if cam.req != nil { NativeCamView(m: cam).transition(.opacity).zIndex(10) }   // 纪念相机（原生全屏）
        }
        .background(Color(uiColor: WebController.appBg))
    }
}
