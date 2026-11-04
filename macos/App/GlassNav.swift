import Combine
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// macOS 26 / iOS 26 起，主窗口的导航层用真正的液态玻璃（Apple 的规范：玻璃只用在导航层，内容层保持不透明），Mac 和 iPhone 共用这一份：
/// 底部菜单栏、右下角的加号、左侧日历栏都由这里的原生 SwiftUI 画，浮在网页上面，透出下面滚动的日历。
/// 网页自己的那一份在 Mac 上隐藏；点了什么、切到哪一页，都还是交给网页处理，两边状态保持一致。
@MainActor
final class NavModel: ObservableObject {
    struct Tab: Decodable, Identifiable { let page: String; let label: String; let hidden: Bool; var id: String { page } }
    struct Item: Decodable, Identifiable { let label: String; let value: String; let on: Bool?; let danger: Bool?; var id: String { value } }
    struct Row: Decodable, Identifiable {
        let id: String, name: String, color: String, kind: String, on: Bool, sub: String, inMain: Bool, notify: Bool, menu: [Item]
        var key: String { id.isEmpty ? "_main" : id }
    }
    struct Drawer: Decodable { let title, sub, recTitle, recEmpty, daysTitle: String; let main: Row; let recs, days: [Row]; let add: [Item] }

    @Published var tabs: [Tab] = []
    @Published var page = "cal"
    @Published var fab = true
    /// 网页有面板、确认框盖在上面（iPhone 的面板从底部弹出，玻璃菜单栏和加号先让开）
    @Published var cover = false
    /// 日历滑到了别的周、月：加号上方显示「回到今天」
    @Published var back = false
    /// 批量添加面板里「再加一个」按钮的位置（网页坐标）和文字；面板没开时是 nil
    @Published var addRow: CGRect?
    @Published var addLabel = ""
    @Published var drawer: Drawer?
    @Published var drawerOpen = false
    /// 日历栏被左右拉动的距离：负 = 往回推（收起），正 = 往外拉（果冻一样变宽）
    @Published var drawerPull: CGFloat = 0
    var wheeling = false
    /// 网页的弹出菜单（用原生玻璃画）：在哪个按钮下面、有哪些项
    struct Menu: Identifiable { let id: String; let items: [MenuItem]; let anchor: CGRect }
    struct MenuItem: Decodable { let label: String; let on: Bool; let danger: Bool }
    @Published var menu: Menu?

    /// 在网页里执行一段 JS（有结果时回调）
    var eval: (String, ((Any?) -> Void)?) -> Void = { _, _ in }

    /// 顶上那一条（和红黄绿按钮同一行）里，网页按钮的位置；其余地方按住可以拖动窗口
    var onDragHoles: ([CGRect]) -> Void = { _ in }

    /// 网页每次切页、菜单栏有变化时发来：{tabs, page, fab, holes}
    func update(_ json: String) {
        struct Add: Decodable { let x, y, w, h: Double; let t: String }
        struct State: Decodable { let tabs: [Tab]; let page: String; let fab: Bool; let holes: [[Double]]?; let cover: Bool?; let back: Bool?; let add: Add? }
        guard let d = json.data(using: .utf8), let s = try? JSONDecoder().decode(State.self, from: d) else { return }
        if s.tabs.map(\.id) != tabs.map(\.id) || s.tabs.map(\.label) != tabs.map(\.label) || s.tabs.map(\.hidden) != tabs.map(\.hidden) { tabs = s.tabs }
        if page != s.page { page = s.page }
        if fab != s.fab { fab = s.fab }
        if back != (s.back ?? false) { withAnimation(.spring(response: 0.36, dampingFraction: 0.7)) { back = s.back ?? false } }
        // 面板弹出时菜单栏马上让开（0.12 秒淡出，不会和从底部升起的面板叠在一起）；面板收起后再弹回来
        if cover != (s.cover ?? false) { withAnimation(s.cover == true ? .easeOut(duration: 0.12) : .spring(response: 0.32, dampingFraction: 0.86)) { cover = s.cover ?? false } }
        let ar = s.add.map { CGRect(x: $0.x, y: $0.y, width: $0.w, height: $0.h) }
        if let t = s.add?.t, t != addLabel { addLabel = t }
        if ar != addRow { withAnimation(.spring(response: 0.34, dampingFraction: 0.72)) { addRow = ar } }
        if let h = s.holes { onDragHoles(h.compactMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }) }
    }

    func go(_ p: String) { eval("document.querySelector('#tabbar [data-page=\"\(p)\"]').click()", nil) }
    func add() { eval("document.getElementById('fab').click()", nil) }
    func goToday() { eval("document.getElementById('btnToday').click()", nil) }
    func addMore() { eval("document.getElementById('batchAddRow').click()", nil) }

    // ---------- 日历栏 ----------
    func openDrawer() {
        refresh { [weak self] in
            guard let self else { return }
            self.drawerPull = 0
            self.drawerOpen = true
            // 果冻：弹出来时往外多冲一点，再弹回
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                withAnimation(.spring(response: 0.22, dampingFraction: 0.7)) { self.drawerPull = 22 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) { withAnimation(.spring(response: 0.5, dampingFraction: 0.45)) { self.drawerPull = 0 } }
            }
        }
    }
    // ---------- iPhone：手指从网页里往右拉，侧栏跟着手指出来 ----------
    /// 侧栏整块的宽度（300 + 两边的边距）：拉动距离 = 手指移动的距离 - 这个宽度（0 = 完全拉出来）
    static let panelW: CGFloat = 320
    func pullBegin() {
        var t = Transaction(); t.disablesAnimations = true
        withTransaction(t) { drawerPull = -NavModel.panelW; drawerOpen = true }
        refresh()
    }
    func pullMove(_ dx: CGFloat) { drawerPull = dx - NavModel.panelW } // 拉过头（正数）时视图里按橡皮筋拉长
    /// 松手：拉出一半以上、或者往右甩，就弹开（带一点果冻回弹）；否则收回去
    func pullEnd(_ v: CGFloat) {
        if drawerPull > -NavModel.panelW * 0.5 || v > 450 {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.62)) { drawerPull = 0 }
        } else {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.95)) { drawerPull = -NavModel.panelW }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) { [weak self] in
                guard let self, self.drawerPull <= -NavModel.panelW + 1 else { return }
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { self.drawerOpen = false; self.drawerPull = 0 }
            }
        }
    }

    func closeDrawer() {
        drawerOpen = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in if self?.drawerOpen == false { self?.drawerPull = 0 } }
    }
    #if os(macOS)
    /// 日历栏打开时，窗口里的触控板滚动事件先到这里：左右划就拉动日历栏（往左划收起、往右划果冻拉长），
    /// 上下划不管、照常滚动列表。返回 true = 这个事件用掉了
    func drawerScroll(_ e: NSEvent) -> Bool {
        guard drawerOpen else { return false }
        if e.momentumPhase != [] { return wheeling || abs(e.scrollingDeltaX) > abs(e.scrollingDeltaY) } // 松手后的惯性：吃掉，不漏给后面
        if e.phase == .ended || e.phase == .cancelled {
            guard wheeling else { return false }
            wheeling = false
            releaseDrawer(predicted: drawerPull)
            return true
        }
        if !wheeling {
            guard abs(e.scrollingDeltaX) > 0.5, abs(e.scrollingDeltaX) > abs(e.scrollingDeltaY) * 1.2 else { return false }
            wheeling = true
        }
        drawerPull += e.isDirectionInvertedFromDevice ? e.scrollingDeltaX : -e.scrollingDeltaX
        return true
    }
    #endif

    /// 松手：往回推得够多（或甩得够快）就收起，否则带回弹落回原位
    func releaseDrawer(predicted: CGFloat) {
        wheeling = false
        if drawerPull < -70 || predicted < -200 { closeDrawer(); return }
        withAnimation(.spring(response: 0.46, dampingFraction: 0.48)) { drawerPull = 0 }
    }
    private func refresh(_ done: (() -> Void)? = nil) {
        eval("JSON.stringify(MC.Drawer.model())") { [weak self] r in
            guard let s = r as? String, let d = s.data(using: .utf8), let m = try? JSONDecoder().decode(Drawer.self, from: d) else { return }
            self?.drawer = m
            done?()
        }
    }
    func pick(_ id: String) {
        eval("MC.Drawer.pick(\(Self.q(id)))", nil)
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in self?.closeDrawer() }
    }
    /// 开关类的选项留在栏里刷新；编辑、删除会弹出网页的表单 / 确认框，先把栏收起来
    func act(_ id: String, _ v: String) {
        if v == "edit" || v == "del" { closeDrawer() }
        eval("MC.Drawer.act(\(Self.q(id)),\(Self.q(v)))", nil)
        if v == "main" || v == "notify" { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in self?.refresh() } }
    }
    func addCal(_ kind: String) { closeDrawer(); eval("MC.Drawer.add(\(Self.q(kind)))", nil) }

    // ---------- 弹出菜单 ----------
    func showMenu(id: String, json: String, anchor: CGRect) {
        guard let d = json.data(using: .utf8), let items = try? JSONDecoder().decode([MenuItem].self, from: d) else { return }
        menu = Menu(id: id, items: items, anchor: anchor)
    }
    /// 选了第几项（-1 = 点外面关掉）交回网页
    func pickMenu(_ i: Int) {
        guard let m = menu else { return }
        menu = nil
        eval("window.__mcMenuPick&&__mcMenuPick(\(Self.q(m.id)),\(i))", nil)
    }

    private static func q(_ s: String) -> String {
        let d = (try? JSONSerialization.data(withJSONObject: [s])) ?? Data("[\"\"]".utf8)
        return String(String(data: d, encoding: .utf8)!.dropFirst().dropLast())
    }

    static func icon(_ page: String) -> String {
        switch page {
        case "today": return "checkmark.square"
        case "cal": return "calendar"
        case "days": return "heart"
        case "dsum": return "square.grid.2x2"
        case "rstat": return "chart.bar"
        case "quad": return "square.grid.2x2.fill"
        case "sched": return "tablecells"
        case "set": return "gearshape"
        default: return "circle"
        }
    }
}

private extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

/// 橡皮筋：越拉越费劲（和网页的菜单栏、日历栏同一个公式）
func rubber(_ x: CGFloat, _ d: CGFloat) -> CGFloat { (1 - 1 / (x * 0.55 / d + 1)) * d }

/// 水滴透镜（GlassLens.metal）的参数跟着弹簧动画逐帧变化，和上面的玻璃气泡对齐
@available(macOS 26.0, iOS 26.0, *)
struct LensEffect: ViewModifier, Animatable {
    var cx: CGFloat, w: CGFloat, h: CGFloat, k: CGFloat
    let cy: CGFloat
    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(AnimatablePair(cx, w), AnimatablePair(h, k)) }
        set { cx = newValue.first.first; w = newValue.first.second; h = newValue.second.first; k = newValue.second.second }
    }
    func body(content: Content) -> some View {
        content.layerEffect(ShaderLibrary.glassLens(.float2(cx, cy), .float2(w, h), .float(k)),
                            maxSampleOffset: CGSize(width: 24, height: 24), isEnabled: k > 0.001)
    }
}

/// 拖动气泡经过一格时轻轻震一下（Mac 是触控板，iPhone 是 Taptic Engine）
@MainActor func navTick() {
    #if os(macOS)
    NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
    #else
    UISelectionFeedbackGenerator().selectionChanged()
    #endif
}

extension View {
    /// Esc 关掉（只有 Mac 有键盘的「退出」命令）
    @ViewBuilder func onEscape(_ f: @escaping () -> Void) -> some View {
        #if os(macOS)
        onExitCommand(perform: f)
        #else
        self
        #endif
    }
}

#if os(macOS)
/// 显示出来时，自己范围内的点击全部接住，不漏给后面的网页
class SolidHostingView<Content: View>: NSHostingView<Content> {
    override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden, let p = superview.map({ convert(point, from: $0) }), bounds.contains(p) else { return nil }
        return super.hitTest(point) ?? self
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 日历栏那一层：打开时整个窗口只和日历栏互动（触控板的左右划在 NavModel.drawerScroll 里处理）
final class DrawerHostingView<Content: View>: SolidHostingView<Content> {
    weak var nav: NavModel?
}
#endif

/// 底部菜单栏：一整条胶囊形的玻璃。点一下切页；按住左右拖，选中块浮起成一块玻璃透镜跟手走，
/// 越快拉得越长越扁、顶到两端被压扁并把整条菜单轻轻拽过去，经过的图标被放大；松手带一点回弹落到格子里（和网页原来的手感一样）
@available(macOS 26.0, iOS 26.0, *)
struct GlassTabBar: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dragX: CGFloat?   // 拖动中：选中块的中心
    @State private var vel: CGFloat = 0
    @State private var wall: CGFloat = 0  // 顶墙的距离（带正负）
    @State private var hover: String?
    @State private var down: CGPoint?
    private let pad: CGFloat = 4, h: CGFloat = TabSize.h

    var body: some View {
        let tabs = m.tabs.filter { !$0.hidden }
        let accent = Pal(dark: scheme == .dark).accent
        GeometryReader { g in
            let n = max(1, tabs.count), w = (g.size.width - pad * 2) / CGFloat(n)
            let idx = tabs.firstIndex { $0.page == m.page } ?? 0
            let cx = dragX ?? (pad + w * CGFloat(idx) + w / 2)
            let lifted = dragX != nil
            let speed = min(1, abs(vel) / 2400), sq = min(1, abs(wall) / 40)
            let sx = (1 + speed * 0.34) * (1 - sq * 0.17) * (lifted ? 1.07 : 1)
            let sy = (1 - speed * 0.2) * (1 + sq * 0.1) * (lifted ? 1.13 : 1)
            // 底板和拖动的气泡都是系统的液态玻璃，在同一个玻璃组里并列（融合、高光由系统处理）；图标画在玻璃上面不会发糊，
            // 气泡下面图标的「水滴」折射和色散由 GlassLens.metal 做（系统玻璃不能透过另一块玻璃折射内容）。
            // 气泡一直在当前格子上，平时完全透明，按住时原地浮现（不会从窗口角落飞进来）
            let W = g.size.width, H = g.size.height
            let lensW = w * sx, lensH = h * sy
            let lensCX = wall < -0.5 ? cx - w / 2 + lensW / 2 : wall > 0.5 ? cx + w / 2 - lensW / 2 : cx
            GlassEffectContainer(spacing: 16) {
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.clear).frame(width: W, height: H).glassEffect(TabGlass.base(scheme), in: .capsule)
                    Capsule().fill(Color.clear)
                        .frame(width: w, height: h)
                        // 深色模式下：不拖的时候这块玻璃即使透明，系统也会画出一块灰色带亮边的「塑料片」，所以不拖时干脆不画玻璃
                        .glassEffect(lifted || scheme != .dark ? Glass.clear.interactive() : Glass.identity, in: .capsule)
                        .macBubbleFinish(scheme)
                        .scaleEffect(x: sx, y: sy, anchor: wall < -0.5 ? .leading : wall > 0.5 ? .trailing : .center)
                        .offset(x: cx - w / 2)
                        .opacity(lifted ? 1 : 0)
                }
            }
            .overlay(alignment: .leading) {
                ZStack(alignment: .leading) {
                    TabRest(scheme: scheme).frame(width: w, height: h).offset(x: cx - w / 2)
                        .opacity(lifted ? 0 : 1)
                    #if os(macOS)
                    // Mac：系统会把拖动的玻璃气泡和底板融成一片，看不出拖到了哪；这里单独画一滴醒目的玻璃水滴跟着手
                    TabDrop(scheme: scheme).frame(width: w, height: h)
                        .scaleEffect(x: sx, y: sy, anchor: wall < -0.5 ? .leading : wall > 0.5 ? .trailing : .center)
                        .offset(x: cx - w / 2)
                        .opacity(lifted ? 1 : 0)
                    #endif
                }
                .allowsHitTesting(false)
            }
            .overlay {
                HStack(spacing: 0) {
                    ForEach(tabs) { t in
                        let on = (lifted ? (hover ?? m.page) : m.page) == t.page
                        VStack(spacing: TabSize.gap) {
                            Image(systemName: NavModel.icon(t.page)).font(.system(size: TabSize.icon, weight: on ? .semibold : .regular)).frame(height: TabSize.iconH)
                            Text(t.label).font(.system(size: TabSize.label, weight: on ? .semibold : .medium)).lineLimit(1)
                        }
                        .foregroundStyle(on ? accent : Color.primary.opacity(0.82))
                        .frame(width: w, height: h)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(m.page == t.page ? [.isButton, .isSelected] : .isButton)
                        .accessibilityAction { m.go(t.page) }
                    }
                }
                .padding(.horizontal, pad)
                .frame(width: W, height: H)
                .modifier(LensEffect(cx: lensCX, w: lensW, h: lensH, k: lifted ? 1 : 0, cy: H / 2))
                .allowsHitTesting(false)
            }
            .frame(width: g.size.width, height: g.size.height)
            .contentShape(Capsule())
            .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { v in
                    if down == nil { down = v.startLocation }
                    guard dragX != nil || abs(v.translation.width) > 6 else { return }
                    let lo = pad + w / 2, hi = g.size.width - pad - w / 2
                    let clamped = min(hi, max(lo, v.location.x)), over = v.location.x - clamped
                    let first = dragX == nil
                    withAnimation(reduceMotion ? nil : first ? .spring(response: 0.28, dampingFraction: 0.5) : .interactiveSpring(response: 0.14, dampingFraction: 0.8)) {
                        dragX = clamped; vel = v.velocity.width; wall = over == 0 ? 0 : (over < 0 ? -1 : 1) * rubber(abs(over), 40)
                    }
                    let ti = min(n - 1, max(0, Int((clamped - pad) / w)))
                    if hover != tabs[ti].page { hover = tabs[ti].page; navTick() }
                }
                .onEnded { v in
                    down = nil
                    guard !tabs.isEmpty else { return }
                    let x = dragX ?? v.location.x
                    let target = tabs[min(n - 1, max(0, Int((x - pad) / w)))].page
                    withAnimation(reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.58)) { // 松手：带一点回弹
                        if target != m.page { m.page = target }
                        dragX = nil; vel = 0; wall = 0; hover = nil
                    }
                    m.go(target)
                })
        }
        .frame(height: h + pad * 2)
        .frame(maxWidth: 520)
        .macGlassFinish(Capsule())
        .offset(x: wall == 0 ? 0 : (wall < 0 ? -1 : 1) * rubber(abs(wall), 9)) // 顶到两端：整条菜单被轻轻拽过去
        .padding(10) // 给玻璃的阴影留位置
        .opacity(m.tabs.isEmpty ? 0 : 1)
    }
}

#if os(macOS)
/// Mac 拖动时跟手的水滴：亮一点的玻璃底 + 上亮下暗的厚边 + 上半部的高光 + 投影
struct TabDrop: View {
    let scheme: ColorScheme
    var body: some View {
        let dark = scheme == .dark
        Capsule().fill(Color.white.opacity(dark ? 0.08 : 0.5))
            .background(Capsule().fill(dark ? AnyShapeStyle(Color.black.opacity(0.25)) : AnyShapeStyle(.ultraThinMaterial)))
            .overlay(Capsule().fill(LinearGradient(colors: [.white.opacity(dark ? 0.12 : 0.7), .clear], startPoint: .top, endPoint: .center)).padding(2))
            .overlay(Capsule().strokeBorder(LinearGradient(colors: [.white.opacity(dark ? 0.55 : 1), .white.opacity(dark ? 0.08 : 0.35), .white.opacity(dark ? 0.22 : 0), .black.opacity(dark ? 0 : 0.12)], startPoint: .top, endPoint: .bottom), lineWidth: 1.2))
            .shadow(color: .black.opacity(dark ? 0.45 : 0.2), radius: 10, y: 5)
    }
}
#endif

/// 当前这一格（没在拖动时）：iPhone 是一块淡灰；Mac 的底板更透，淡灰看不出来，改成一块带高光边的浅色玻璃
struct TabRest: View {
    let scheme: ColorScheme
    var body: some View {
        #if os(macOS)
        Capsule().fill(scheme == .dark ? Color.white.opacity(0.09) : Color.white.opacity(0.62))
            .overlay(Capsule().strokeBorder(LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.2 : 0.95), .white.opacity(scheme == .dark ? 0.02 : 0), .black.opacity(scheme == .dark ? 0 : 0.07)],
                                                           startPoint: .top, endPoint: .bottom), lineWidth: 0.8))
            .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.1), radius: 3, y: 1.5)
        #else
        Capsule().fill(Color.white.opacity(scheme == .dark ? 0.06 : 0)).background(Capsule().fill(Color.black.opacity(scheme == .dark ? 0 : 0.09)))
        #endif
    }
}

extension View {
    /// Mac 上拖动的气泡：系统的 clear 玻璃在 Mac 上几乎看不见，补一圈亮边、一点高光和投影，看起来像一滴水
    @ViewBuilder func macBubbleFinish(_ scheme: ColorScheme) -> some View {
        #if os(macOS)
        self
            .overlay(Capsule().fill(LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.08 : 0.35), .clear], startPoint: .top, endPoint: .center)).allowsHitTesting(false))
            .overlay(Capsule().strokeBorder(LinearGradient(colors: scheme == .dark ? [.white.opacity(0.5), .white.opacity(0.06), .white.opacity(0.2)] : [.white.opacity(0.95), .white.opacity(0.25), .white.opacity(0.6)], startPoint: .top, endPoint: .bottom), lineWidth: 1.2).allowsHitTesting(false))
            .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
        #else
        self
        #endif
    }

    /// Mac 的系统玻璃比 iPhone 淡：边缘几乎没有高光、没有投影，窗口不在最前面时还会整个变灰（加号的蓝色也没了）。
    /// 这里在 Mac 上补一圈细细的高光边、一层柔和的投影，并且一直按「窗口在最前面」的样子画（iPhone 上什么都不加）
    @ViewBuilder func macGlassFinish<S: InsettableShape>(_ shape: S) -> some View {
        #if os(macOS)
        modifier(MacGlassFinish(shape: shape))
        #else
        self
        #endif
    }
}

#if os(macOS)
/// 深色模式下亮边要很淡（不然一圈白边像塑料壳），只在上沿留一道细高光；投影更深一点，让玻璃浮在深色背景上
struct MacGlassFinish<S: InsettableShape>: ViewModifier {
    let shape: S
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        let dark = scheme == .dark
        content
            .overlay(shape.strokeBorder(LinearGradient(colors: dark ? [.white.opacity(0.32), .white.opacity(0.04), .white.opacity(0.1)] : [.white.opacity(0.9), .white.opacity(0.2), .black.opacity(0.08)],
                                                       startPoint: .top, endPoint: .bottom), lineWidth: dark ? 0.8 : 1).allowsHitTesting(false))
            .overlay(shape.inset(by: 1).strokeBorder(Color.black.opacity(dark ? 0 : 0.05), lineWidth: 0.5).allowsHitTesting(false))
            .shadow(color: .black.opacity(dark ? 0.5 : 0.16), radius: 16, y: 6)
            .shadow(color: .black.opacity(dark ? 0.3 : 0.08), radius: 2, y: 1)
            .environment(\.appearsActive, true)
    }
}
#endif

/// 底板用哪种玻璃：iPhone 的 regular 本身就很通透；Mac 上同样的 regular 被画成一层磨砂，
/// 所以 Mac 改用更透的 clear，再叠一点点白（深色模式叠一点黑），字和图标才看得清
@available(macOS 26.0, iOS 26.0, *)
private enum TabGlass {
    static func base(_ scheme: ColorScheme) -> Glass {
        #if os(macOS)
        return .clear.tint(scheme == .dark ? Color.black.opacity(0.46) : Color.white.opacity(0.46))
        #else
        return NavGlass.chrome(scheme)
        #endif
    }
}

/// 深色模式下系统的 regular 玻璃压在近黑的底上会变成一块灰雾（像塑料）：叠一点黑，让它通透、深一些，只留边缘的高光
@available(macOS 26.0, iOS 26.0, *)
enum NavGlass {
    static func chrome(_ scheme: ColorScheme, interactive: Bool = false) -> Glass {
        let g: Glass = scheme == .dark ? .regular.tint(Color.black.opacity(0.38)) : .regular
        return interactive ? g.interactive() : g
    }
}

@available(macOS 26.0, iOS 26.0, *)
struct ChromeGlass<S: Shape>: ViewModifier {
    let shape: S
    var interactive = false
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View { content.glassEffect(NavGlass.chrome(scheme, interactive: interactive), in: shape) }
}

/// 底部菜单栏的尺寸：Mac 窗口宽，矮一点；iPhone 上和系统的悬浮菜单栏差不多高（不然又宽又矮，看着被压扁），图标也大一号
private enum TabSize {
    #if os(macOS)
    static let h: CGFloat = 52, icon: CGFloat = 17, iconH: CGFloat = 21, label: CGFloat = 10.5, gap: CGFloat = 3
    #else
    static let h: CGFloat = 57, icon: CGFloat = 20, iconH: CGFloat = 23, label: CGFloat = 10.5, gap: CGFloat = 3.5
    #endif
}

/// 弹出菜单的尺寸：Mac 和系统菜单一样小巧；iPhone 用手指点，行高 44、字 17（和系统的弹出菜单一样）
private enum MenuSize {
    #if os(macOS)
    static let font: CGFloat = 14, row: CGFloat = 36, padH: CGFloat = 14, minW: CGFloat = 180, maxW: CGFloat = 280
    #else
    static let font: CGFloat = 17, row: CGFloat = 44, padH: CGFloat = 16, minW: CGFloat = 220, maxW: CGFloat = 300
    #endif
}

/// 加号的大小：iPhone 上系统的玻璃按钮本身就有内边距，图形小一号，整体约 56pt（和系统的浮动按钮一样大）
private enum FabSize {
    #if os(macOS)
    static let icon: CGFloat = 22, side: CGFloat = 44, back: CGFloat = 46
    static let control = ControlSize.large
    #else
    static let icon: CGFloat = 20, side: CGFloat = 36, back: CGFloat = 46
    static let control = ControlSize.regular
    #endif
}

/// 批量添加面板底部的「再加一个」：和菜单栏同一种系统液态玻璃（网页里画不出这种玻璃，所以由原生画在网页按钮的位置上）
@available(macOS 26.0, iOS 26.0, *)
struct GlassAddButton: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Button { m.addMore() } label: {
            HStack(spacing: 7) {
                Image(systemName: "plus").font(.system(size: 16, weight: .semibold))
                Text(m.addLabel).font(.system(size: 15.5, weight: .semibold))
            }
            .foregroundStyle(Pal(dark: scheme == .dark).accent)
            .padding(.leading, 20).padding(.trailing, 24)
            .frame(height: 48)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .modifier(ChromeGlass(shape: Capsule(), interactive: true))
        .macGlassFinish(Capsule())
    }
}

/// 右下角的加号：带主色的圆形玻璃
@available(macOS 26.0, iOS 26.0, *)
struct GlassFab: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // 「回到今天」在加号正上方、和加号中线对齐：小一号的半透明液态玻璃，滑到别的周 / 月时才出现
        VStack(spacing: 12) {
            if m.back {
                Button { m.goToday() } label: {
                    Image(systemName: "arrow.uturn.backward").font(.system(size: FabSize.icon * 0.8, weight: .semibold))
                        .foregroundStyle(Color.primary.opacity(0.7))
                        .frame(width: FabSize.back, height: FabSize.back).contentShape(Circle())
                }
                .buttonStyle(.plain)
                .modifier(ChromeGlass(shape: Circle(), interactive: true))
                .macGlassFinish(Circle())
                .transition(.scale(scale: 0.6).combined(with: .opacity))
                .accessibilityLabel(Text(I18n.t("回到今天")))
            }
            fabButton
        }
    }

    @ViewBuilder private var fabButton: some View {
        #if os(macOS)
        // Mac：系统的主操作按钮在窗口不在最前面时会变成灰色，所以自己画一块带主色的玻璃（一直是蓝的）
        Button { m.add() } label: {
            Image(systemName: "plus").font(.system(size: FabSize.icon, weight: .semibold)).foregroundStyle(.white)
                .frame(width: FabSize.side + 12, height: FabSize.side + 12)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .background(Circle().fill(Pal(dark: scheme == .dark).fab)) // 实心的主色底：窗口不在最前面时系统会把玻璃的颜色去掉，这层不会
        .glassEffect(.clear.interactive(), in: .circle)
        .macGlassFinish(Circle())
        .padding(10)
        #else
        Button { m.add() } label: {
            Image(systemName: "plus").font(.system(size: FabSize.icon, weight: .semibold))
                .frame(width: FabSize.side, height: FabSize.side)
        }
        .buttonStyle(.glassProminent) // Apple 的主操作按钮样式：带主色的玻璃
        .buttonBorderShape(.circle)
        .tint(Pal(dark: scheme == .dark).fab)
        .controlSize(FabSize.control)
        .padding(10)
        #endif
    }
}

/// 弹出菜单：网页的「年 / 月 / 周视图」「四象限 / 课表」等菜单，用原生玻璃画，从按钮处像果冻一样弹出来
@available(macOS 26.0, iOS 26.0, *)
struct GlassMenu: View {
    @ObservedObject var m: NavModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hoverRow: Int?

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .topLeading) {
                if let mm = m.menu {
                    Color.clear.contentShape(Rectangle()).onTapGesture { m.pickMenu(-1) }
                    let w: CGFloat = max(MenuSize.minW, min(MenuSize.maxW, CGFloat(mm.items.map { $0.label.count }.max() ?? 6) * MenuSize.font + 70))
                    let hgt = CGFloat(mm.items.count) * MenuSize.row + 12
                    let below = mm.anchor.maxY + 8 + hgt < g.size.height - 8
                    // 靠左的按钮：菜单左边对齐按钮；靠右的按钮（设置里的选项值）：右边对齐按钮；中间的居中
                    let ax = mm.anchor.minX < 80 ? mm.anchor.minX : mm.anchor.midX > g.size.width * 0.6 ? mm.anchor.maxX - w : mm.anchor.midX - w / 2
                    let x = min(max(8, ax), g.size.width - w - 8)
                    let y = below ? mm.anchor.maxY + 8 : mm.anchor.minY - 8 - hgt
                    VStack(spacing: 0) {
                        ForEach(Array(mm.items.enumerated()), id: \.offset) { i, it in
                            Button { m.pickMenu(i) } label: {
                                HStack(spacing: 10) {
                                    Text(it.label).font(.system(size: MenuSize.font, weight: it.on ? .semibold : .regular)).lineLimit(1)
                                    Spacer(minLength: 8)
                                    if it.on { Image(systemName: "checkmark").font(.system(size: MenuSize.font - 1, weight: .bold)) }
                                }
                                .foregroundStyle(it.danger ? Color.red : Color.primary)
                                .padding(.horizontal, MenuSize.padH).frame(height: MenuSize.row)
                                .background { if hoverRow == i { RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.primary.opacity(0.1)) } }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .onHover { hoverRow = $0 ? i : (hoverRow == i ? nil : hoverRow) }
                        }
                    }
                    .padding(6)
                    .frame(width: w)
                    .modifier(ChromeGlass(shape: RoundedRectangle(cornerRadius: 18, style: .continuous)))
                    .offset(x: x, y: y)
                    .transition(.asymmetric(insertion: .scale(scale: 0.86, anchor: below ? .top : .bottom).combined(with: .opacity),
                                            removal: .scale(scale: 0.94, anchor: below ? .top : .bottom).combined(with: .opacity)))
                    .id(mm.id)
                }
            }
            .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.62), value: m.menu?.id) // 果冻：带一点过冲
        .onEscape { m.pickMenu(-1) }
    }
}

/// 左侧日历栏：浮在日历上的一张玻璃卡片，和网页的日历栏同样的分组和操作。
/// 弹出时带一点回弹；往右拉会像果冻一样被拉长，往左推可以收起（和网页原来的手感一样）
@available(macOS 26.0, iOS 26.0, *)
struct GlassDrawer: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hLock: Bool? // 这次拖动是横着的（拉侧栏）还是竖着的（滚列表）

    var body: some View {
        ZStack(alignment: .leading) {
            if m.drawerOpen, let d = m.drawer {
                // 遮罩跟着侧栏拉出来的程度变深
                let shown = max(0, min(1, 1 + min(0, m.drawerPull) / NavModel.panelW))
                Color.black.opacity((scheme == .dark ? 0.32 : 0.14) * shown)
                    #if os(iOS)
                    .ignoresSafeArea() // iPhone：遮罩也盖住状态栏和 Home 条那一条
                    #endif
                    .contentShape(Rectangle())
                    .onTapGesture { m.closeDrawer() }
                    .transition(.opacity)
                let stretch = rubber(max(0, m.drawerPull), 90)
                panel(d, width: 300)
                    // 往外拉：整块日历栏从左边缘被拉长（内容跟着一起变形，不会重新排版），高度略微收一点，像果冻
                    .scaleEffect(x: 1 + stretch / 300, y: 1 - stretch / 1600, anchor: .leading)
                    .offset(x: min(0, m.drawerPull)) // 往回推：整块跟着移动
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        // 打开时，在窗口任何地方（包括侧栏里面）左右拖都是拉动日历栏；和列表的上下滚动同时识别，
        // 开头先看是横着拖还是竖着拖：竖着拖只滚列表，横着拖才拉动侧栏
        .simultaneousGesture(DragGesture(minimumDistance: 10)
            .onChanged { v in
                if hLock == nil { hLock = abs(v.translation.width) > abs(v.translation.height) }
                if hLock == true { m.drawerPull = v.translation.width }
            }
            .onEnded { v in
                defer { hLock = nil }
                if hLock == true { m.releaseDrawer(predicted: v.predictedEndTranslation.width) }
            })
        .animation(reduceMotion ? nil : .spring(response: 0.46, dampingFraction: 0.72), value: m.drawerOpen) // 弹出带一点回弹
        .onEscape { m.closeDrawer() }
    }

    private func panel(_ d: NavModel.Drawer, width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 3) {
                Text(d.title).font(.system(size: 22, weight: .bold))
                Text(d.sub).font(.system(size: 12)).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    row(d.main)
                    section(d.recTitle)
                    if d.recs.isEmpty {
                        Text(d.recEmpty).font(.system(size: 12)).foregroundStyle(.secondary).padding(.horizontal, 12).padding(.vertical, 4)
                    }
                    ForEach(d.recs) { row($0) }
                    if !d.days.isEmpty {
                        section(d.daysTitle)
                        ForEach(d.days) { row($0) }
                    }
                }
                .padding(.horizontal, 10).padding(.bottom, 8)
            }
            Menu {
                ForEach(d.add) { a in Button(a.label) { m.addCal(a.value) } }
            } label: {
                Label(d.add.first?.label ?? "", systemImage: "plus")
            }
            .menuIndicator(.hidden)
            .buttonStyle(.bordered)
            .controlSize(.large)
            .fixedSize()
            .padding(16)
        }
        .frame(width: width)
        .frame(maxHeight: .infinity)
        .modifier(ChromeGlass(shape: RoundedRectangle(cornerRadius: 26, style: .continuous)))
        .padding(10)
        #if os(macOS)
        .padding(.top, 26) // 让开窗口左上角的红黄绿按钮
        #endif
    }

    private func section(_ t: String) -> some View {
        Text(t).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 4)
    }

    private func row(_ r: NavModel.Row) -> some View {
        let color = Color(hex: r.color) ?? Pal(dark: scheme == .dark).accent
        let icon = r.kind == "days" ? "heart.fill" : r.kind == "rec" ? "bookmark.fill" : "calendar"
        return HStack(spacing: 6) {
            Button { m.pick(r.id) } label: {
                HStack(spacing: 11) {
                    // 和网页同一套：中性的灰底块 + 实心、饱和的彩色图形（系统的 calendar 只有空心的，主日历自己画一个实心日历）
                    let tile = Color(argb: scheme == .dark ? 0xFF2A_2A2E : 0xFFEF_F1F4)
                    Group {
                        if r.kind == "main" { SolidCalendarGlyph(color: color, tile: tile).frame(width: 18, height: 18) }
                        else { Image(systemName: icon).font(.system(size: 16, weight: .bold)).symbolRenderingMode(.monochrome).foregroundStyle(color) }
                    }
                    .frame(width: 34, height: 34)
                    .background(tile, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        HStack(spacing: 5) {
                            Text(r.sub).lineLimit(1)
                            if r.inMain { Image(systemName: "square.3.layers.3d") }
                            if r.notify { Image(systemName: "bell") }
                        }
                        .font(.system(size: 11.5)).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    if r.on { Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(color) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if !r.menu.isEmpty {
                Menu {
                    ForEach(r.menu) { it in
                        if let on = it.on {
                            Toggle(it.label, isOn: Binding(get: { on }, set: { _ in m.act(r.id, it.value) }))
                        } else {
                            Button(it.label, role: it.danger == true ? .destructive : nil) { m.act(r.id, it.value) }
                        }
                    }
                } label: { Image(systemName: "ellipsis").frame(width: 24, height: 24) }
                #if os(macOS)
                .menuStyle(.button)
                #endif
                .menuIndicator(.hidden)
                .buttonStyle(.borderless)
                .fixedSize()
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background {
            if r.on { RoundedRectangle(cornerRadius: 15, style: .continuous).fill(color.opacity(scheme == .dark ? 0.2 : 0.13)) }
        }
        .id(r.key)
    }
}

/// 实心日历图形：彩色的日历本体，顶上的横线和三个小点用底块颜色挖空（和网页的实心日历图标一样）
struct SolidCalendarGlyph: View {
    let color: Color, tile: Color
    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: w * 0.17, style: .continuous).fill(color)
                    .frame(width: w * 0.92, height: h * 0.8).offset(x: w * 0.04, y: h * 0.17)
                Rectangle().fill(tile).frame(width: w * 0.92, height: max(1.2, h * 0.08)).offset(x: w * 0.04, y: h * 0.38)
                ForEach(0..<3, id: \.self) { i in
                    Circle().fill(tile).frame(width: w * 0.12, height: w * 0.12).offset(x: w * (0.27 + 0.2 * CGFloat(i)), y: h * 0.6)
                }
                ForEach(0..<2, id: \.self) { i in
                    Capsule().fill(color).frame(width: max(1.6, w * 0.1), height: h * 0.2).offset(x: w * (0.3 + 0.35 * CGFloat(i)), y: h * 0.05)
                }
            }
        }
    }
}
