import Combine
import SwiftUI
import ImageIO
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
    struct Item: Decodable, Identifiable { let label: String; let value: String; let on: Bool?; let danger: Bool?; let sw: Bool?; var id: String { value } }
    struct Row: Decodable, Identifiable {
        let id: String, name: String, color: String, kind: String, on: Bool, sub: String, inMain: Bool, notify: Bool, menu: [Item]
        let sf: String?   // 纪念日历自己选的图标（网页给的系统符号名）
        var key: String { id.isEmpty ? "_main" : id }
    }
    /// 新建子日历的介绍卡片用的文字（网页 MC.Drawer.model 的 kinds）
    struct Kind: Decodable { let name, desc, eg: String; let big, unit, tag: String? }
    struct Kinds: Decodable { let title, lead, cancel: String; let rec, days: Kind }
    struct Drawer: Decodable { let title, sub, recTitle, recEmpty, daysTitle: String; let main: Row; let recs, days: [Row]; let add: [Item]; let addLabel: String?; let kinds: Kinds? }

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
    /// 网页里的玻璃控件（按钮、胶囊、优先级的水滴…）：原生在同样的位置画系统的液态玻璃（网页每一帧发来位置）
    struct LGItem: Identifiable, Equatable {
        let id: Int; let rect: CGRect; let r: CGFloat; let clip: CGRect; let k: String
        /// 移动速度（点 / 毫秒）：原生按它每一帧往前推算位置
        var vx: CGFloat = 0, vy: CGFloat = 0
        /// 网页里这个控件的透明度（滚动时变淡的星期条等），原生按它画
        var alpha: CGFloat = 1
        /// 画在玻璃上面的内容（位置都是网页坐标）：每一段字、每个图标（系统符号）、选中项的浅色底块；玻璃的着色（网页原来的底色）
        var runs: [Run] = [], icons: [Icon] = [], pads: [Pad] = [], tint = ""
        struct Run: Equatable { let rect: CGRect; let t: String; let fs: CGFloat; let fw: Int; let col: String; let ls: CGFloat; let tab: Bool; let round: Bool }
        struct Icon: Equatable { let rect: CGRect; let sf: String; let col: String; let sw: CGFloat }
        struct Pad: Equatable { let rect: CGRect; let r: CGFloat; var col: String = "" }   // col：带颜色的色块（记录日历名字），空的是选中项的浅色底块
    }
    @Published var lg: [LGItem] = []
    /// 新底栏（网页 0.23 起：左时钟胶囊 · 中分页点 · 右 logo 扇形菜单）。网页发来时就画新底栏，旧网页或纪念日历是 nil，仍用旧的菜单栏和加号
    // 【联动:底部悬浮控件】见 CLAUDE.md「联动分组」
    struct Dock: Decodable, Equatable { let t: String; let ap: String; let today: Bool; let back: String; let pager: Bool; let n: Int?; let p: Double; let set: Bool; let st: Bool?; let lit: Bool?; let pv: Double? }   // st：扇形里有「统计」（开了等级评分的记录日历）
    @Published var dock: Dock?
    @Published var fanOpen = false
    /// Mac：底栏里各个按钮的位置（窗口坐标），只有点在这些地方才接住，别处的点击漏给后面的网页
    var dockRects: [String: CGRect] = [:]
    struct Hole: Equatable { let rect: CGRect; let r: CGFloat }
    @Published var lgHoles: [Hole] = []
    /// 网页发出这一批位置的时间（毫秒，和 Date 同一个时钟）
    var lgT: Double = 0
    @Published var drawer: Drawer?
    @Published var drawerOpen = false
    /// 日历栏被左右拉动的距离：负 = 往回推（收起），正 = 往外拉（果冻一样变宽）
    @Published var drawerPull: CGFloat = 0
    var wheeling = false
    /// 网页的弹出菜单（用原生玻璃画）：在哪个按钮下面、有哪些项
    struct Menu: Identifiable { let id: String; let items: [MenuItem]; let anchor: CGRect }
    struct MenuItem: Decodable {
        let label: String; let on: Bool; let danger: Bool
        /// 色块（比如高亮颜色）：#RRGGBB，画在文字左边
        let sw: String?
        var swatch: Color? {
            guard let s = sw, s.count == 7, s.hasPrefix("#"), let v = UInt32(s.dropFirst(), radix: 16) else { return nil }
            return Color(argb: 0xFF00_0000 | v)
        }
    }
    @Published var menu: Menu?

    /// 在网页里执行一段 JS（有结果时回调）
    var eval: (String, ((Any?) -> Void)?) -> Void = { _, _ in }

    /// 顶上那一条（和红黄绿按钮同一行）里，网页按钮的位置；其余地方按住可以拖动窗口
    var onDragHoles: ([CGRect]) -> Void = { _ in }

    /// 网页每次切页、菜单栏有变化时发来：{tabs, page, fab, holes}
    func update(_ json: String) {
        struct Add: Decodable { let x, y, w, h: Double; let t: String }
        struct State: Decodable { let tabs: [Tab]; let page: String; let fab: Bool; let holes: [[Double]]?; let cover: Bool?; let back: Bool?; let add: Add?; let dock: Dock? }
        guard let d = json.data(using: .utf8), let s = try? JSONDecoder().decode(State.self, from: d) else { return }
        if s.tabs.map(\.id) != tabs.map(\.id) || s.tabs.map(\.label) != tabs.map(\.label) || s.tabs.map(\.hidden) != tabs.map(\.hidden) { tabs = s.tabs }
        if fab != s.fab { fab = s.fab }
        if dock != s.dock {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.8)) { dock = s.dock }
            if s.dock == nil || s.dock?.set != dock?.set { fanOpen = false }
        }
        if page != s.page { if fanOpen { withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) { fanOpen = false } }; page = s.page }
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
    /// 回到今天 / 回到本周（日程页）：点网页里对应的按钮（它们在 App 里藏着，但还在工作）
    func goToday() { eval("(function(){var b=document.getElementById(document.body.dataset.page==='sched'?'schedBack':'calBack');if(b)b.click();})()", nil) }
    /// 新底栏的按钮：都交给网页里同名的按钮处理（切页动画、今日页展开都在网页里），原生只负责画和触感
    func tapClock() { navTick(); eval("document.getElementById('bubbleToday').click()", nil) }
    func tapPager() { navTick(); eval("document.getElementById('pager').click()", nil) }
    func setFan(_ open: Bool) {
        guard open != fanOpen else { return }
        navTick()
        withAnimation(.spring(response: open ? 0.32 : 0.24, dampingFraction: open ? 0.74 : 0.88)) { fanOpen = open }
    }
    func fan(_ id: String) {
        setFan(false)
        switch id {
        case "add": add()
        case "stat": eval("document.getElementById('fanStat').click()", nil)   // 统计页里它是「返回」
        default: eval("document.getElementById('fanSet').click()", nil)   // 设置页里它是「返回」，由网页决定回到哪一页
        }
    }
    func updateLG(_ json: String) {
        guard let d = json.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let a = o["i"] as? [[Any]] else { return }
        let f = { (v: Any) -> CGFloat in CGFloat((v as? NSNumber)?.doubleValue ?? 0) }
        let holes = (o["h"] as? [[Any]] ?? []).compactMap { $0.count >= 4 ? Hole(rect: CGRect(x: f($0[0]), y: f($0[1]), width: f($0[2]), height: f($0[3])), r: $0.count >= 5 ? f($0[4]) : 14) : nil }
        let items = a.compactMap { x -> LGItem? in
            guard x.count >= 15, x[11] is [Any] else { return nil } // 旧版网页没有发内容（也不会藏起自己的字）：不画，免得玻璃把字糊住
            var it = LGItem(id: (x[0] as? NSNumber)?.intValue ?? 0, rect: CGRect(x: f(x[1]), y: f(x[2]), width: f(x[3]), height: f(x[4])), r: f(x[5]),
                            clip: CGRect(x: f(x[6]), y: f(x[7]), width: f(x[8]), height: f(x[9])), k: x[10] as? String ?? "g")
            let rc = { (a: [Any]) in CGRect(x: f(a[0]), y: f(a[1]), width: f(a[2]), height: f(a[3])) }
            it.runs = (x[11] as? [[Any]] ?? []).compactMap { a in
                guard a.count >= 10 else { return nil }
                let fl = (a[9] as? NSNumber)?.intValue ?? 0
                return .init(rect: rc(a), t: a[4] as? String ?? "", fs: max(6, f(a[5])), fw: (a[6] as? NSNumber)?.intValue ?? 400, col: a[7] as? String ?? "", ls: f(a[8]), tab: fl & 1 != 0, round: fl & 2 != 0)
            }
            it.icons = (x[12] as? [[Any]] ?? []).compactMap { a in a.count >= 7 ? .init(rect: rc(a), sf: a[4] as? String ?? "", col: a[5] as? String ?? "", sw: f(a[6])) : nil }
            it.pads = (x[13] as? [[Any]] ?? []).compactMap { a in a.count >= 5 ? .init(rect: rc(a), r: f(a[4]), col: a.count >= 6 ? (a[5] as? String ?? "") : "") : nil }
            it.tint = x[14] as? String ?? ""
            if x.count >= 17 { it.vx = f(x[15]); it.vy = f(x[16]) }
            if x.count >= 18 { it.alpha = max(0, min(1, f(x[17]))) }
            return it
        }
        var t = Transaction(); t.disablesAnimations = true
        lgT = (o["t"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 * 1000
        withTransaction(t) { lg = items; if holes != lgHoles { lgHoles = holes } }
    }
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

    /// 侧拉菜单里：新建子日历的介绍卡片开着；某一行的「⋯」小窗口开着（行的 key）
    @Published var kindsOpen = false
    @Published var moreRow: String? = nil
    func closeDrawer() {
        kindsOpen = false; moreRow = nil
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

/// 弹出菜单的尺寸：Mac 和系统菜单一样小巧；iPhone 用手指点，行高 44、字 17（和系统的弹出菜单一样）
private enum MenuSize {
    #if os(macOS)
    static let font: CGFloat = 14, row: CGFloat = 36, padH: CGFloat = 14, minW: CGFloat = 180, maxW: CGFloat = 280
    #else
    static let font: CGFloat = 17, row: CGFloat = 44, padH: CGFloat = 16, minW: CGFloat = 220, maxW: CGFloat = 300
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

/// 网页里的玻璃控件换成系统的液态玻璃：整块玻璃精确盖在网页控件的位置上，图标（系统符号）和文字画在玻璃上面
/// （网页那边这时把自己的底、字、图标都藏起来，只负责接收点按）。每一帧跟着网页的位置走（滚动、拖动、面板弹出），
/// 被滚动区裁掉的部分也一样裁掉。优先级的水滴只在按住拖动时由这里画成透明的玻璃透镜（停着时是网页画的白色底板）
@available(macOS 26.0, iOS 26.0, *)
// 【联动:原生玻璃】见 CLAUDE.md「联动分组」
struct GlassLayer: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme
    private func glass(_ it: NavModel.LGItem) -> Glass {
        switch it.k {
        case "l": return .clear                                         // 拖动中的水滴：一滴清水
        case "p":                                                       // 照片上带字的牌子：透亮的 clear 玻璃（背后的照片清清楚楚地折射过来），着一层网页原来底色的淡色，字看得清
            return .clear // 底色由 content 里铺的那层半透明色负责（clear 玻璃的 tint 太淡，字会看不清）
        case "d": return .clear.tint(Color.black.opacity(0.12))         // 照片、相机画面上的按钮：和系统相机一样的透亮玻璃
        default:  return NavGlass.chrome(scheme)                        // 和底部菜单栏同一种玻璃
        }
    }
    static func lum(_ css: String) -> Double {
        let n = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        return n.count >= 3 ? 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2] : 0
    }
    static func light(_ css: String) -> Bool { lum(css) > 150 }
    static func gray(_ css: String) -> Bool { // 灰色系（不是蓝、橙这种有颜色的字）
        let n = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        return n.count >= 3 && (n[0...2].max()! - n[0...2].min()!) < 40
    }
    static func alpha(_ css: String) -> Double? {
        let n = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        return n.count >= 4 ? n[3] : n.count == 3 ? 1 : nil
    }
    private func weight(_ w: Int) -> Font.Weight { w >= 700 ? .bold : w >= 600 ? .semibold : w >= 500 ? .medium : .regular }
    var body: some View {
        // 有控件在动时按屏幕刷新率重画：位置 = 网页最后告诉的位置 + 速度 × 过去的时间（最多往前推 90 毫秒），停着时不重画
        let moving = m.lg.contains { $0.vx != 0 || $0.vy != 0 }
        TimelineView(.animation(minimumInterval: nil, paused: !moving)) { tl in
            let dt = CGFloat(min(90, max(0, tl.date.timeIntervalSince1970 * 1000 - m.lgT)))
            layer(dt)
        }
    }

    @ViewBuilder private func layer(_ dt: CGFloat) -> some View {
        ZStack {
            ForEach(m.lg) { it in
                let shape = RoundedRectangle(cornerRadius: it.r, style: .continuous)
                ZStack {
                    // 照片上的牌子：玻璃「下面」先垫一层网页原来的底色（半透明），玻璃把它和后面的照片一起折射，字有底衬着
                    // （放在玻璃上面的话，系统会自动把它调亮，等于没垫）
                    if it.k == "p" { // 照片上的牌子：垫一层淡淡的暗色（不管照片多亮，白字都看得清；照片还透得过来）
                        shape.fill(Color.black.opacity(0.26))
                            .frame(width: it.rect.width, height: it.rect.height)
                            .position(x: it.rect.midX, y: it.rect.midY)
                    }
                    // 照片上的大牌子：只有边缘一圈是玻璃（折射、高光、厚度都在这圈），中间不做透镜，照片不被拉歪
                    if it.k == "p" {
                        Color.clear
                            .frame(width: it.rect.width, height: it.rect.height)
                            .glassEffect(glass(it), in: shape)
                            .mask(shape.strokeBorder(Color.black, lineWidth: 7))
                            .position(x: it.rect.midX, y: it.rect.midY)
                    }
                    content(it)
                        .frame(width: it.rect.width, height: it.rect.height)
                        .glassEffect(it.k == "p" ? Glass.identity : glass(it), in: shape)
                        .macGlassFinish(shape)
                        .position(x: it.rect.midX, y: it.rect.midY)
                }
                .opacity(it.alpha * (m.drawerOpen && it.rect.maxX < NavModel.panelW + 20 ? 0 : 1))   // 侧拉菜单是透明玻璃：整个被它盖住的原生玻璃（月份胶囊）先收起来，菜单整个盖住胶囊、不透出字
                .animation(.easeOut(duration: 0.22), value: m.drawerOpen)
                .offset(x: it.vx * dt, y: it.vy * dt)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .mask { Rectangle().frame(width: it.clip.width, height: it.clip.height).position(x: it.clip.midX, y: it.clip.midY) }
            }
        }
        // 网页里盖在玻璃上面的东西（提示条）：挖掉
        .mask {
            ZStack {
                Rectangle()
                ForEach(Array(m.lgHoles.enumerated()), id: \.offset) { _, h in
                    RoundedRectangle(cornerRadius: h.r).frame(width: h.rect.width, height: h.rect.height).position(x: h.rect.midX, y: h.rect.midY).blendMode(.destinationOut)
                }
            }
            .compositingGroup()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
        .transaction { $0.animation = nil }
    }

    /// 照着网页排好的位置，把字、图标、选中项的底块一模一样画在玻璃上面
    @ViewBuilder private func content(_ it: NavModel.LGItem) -> some View {
        let o = it.rect.origin
        ZStack(alignment: .topLeading) {
            // 照片上的牌子：玻璃上铺一层网页原来的底色（半透明），背后的照片还看得见折射，字有底衬着
            Color.clear
            ForEach(Array(it.pads.enumerated()), id: \.offset) { _, p in
                RoundedRectangle(cornerRadius: p.r, style: .continuous).fill(Color(css: p.col) ?? Color.white.opacity(it.k == "d" ? 0.94 : scheme == .dark ? 0.16 : 0.5)) // 有颜色的色块照原色画；照片 / 相机上的选中项：白色，字是黑的
                    .frame(width: p.rect.width, height: p.rect.height).position(x: p.rect.midX - o.x, y: p.rect.midY - o.y)
            }
            ForEach(Array(it.icons.enumerated()), id: \.offset) { _, c in
                if c.sf.hasPrefix("data:"), let img = LGImage.get(c.sf) {
                    Image(decorative: img, scale: 3).resizable().frame(width: c.rect.width, height: c.rect.height)
                        .position(x: c.rect.midX - o.x, y: c.rect.midY - o.y)
                } else if !c.sf.hasPrefix("data:") {
                    Image(systemName: c.sf)
                        .font(.system(size: min(c.rect.width, c.rect.height) * 0.86, weight: c.sw >= 2.2 ? .semibold : .medium))
                        .foregroundStyle(Color(css: c.col) ?? .primary)
                        .position(x: c.rect.midX - o.x, y: c.rect.midY - o.y)
                }
            }
            ForEach(Array(it.runs.enumerated()), id: \.offset) { _, t in
                Text(t.t)
                    .font(.system(size: t.fs, weight: weight(t.fw), design: t.round ? .rounded : .default))
                    .monospacedDigit(t.tab)
                    .kerning(t.ls)
                    // 照片上的浅色字（灰色的日期、单位也一样）：提到接近白色，加一层淡阴影，背后再亮也看得清
                    .foregroundStyle(it.k != "g" && Self.gray(t.col) && (it.k == "p" || Self.light(t.col)) ? Color.white.opacity(Self.lum(t.col) > 215 || Self.lum(t.col) < 60 ? 1 : 0.86) : (Color(css: t.col) ?? .primary))
                    .shadow(color: .black.opacity(it.k != "g" ? 0.35 : 0), radius: 4, y: 0.5)
                    .lineLimit(1).fixedSize()
                    .position(x: t.rect.midX - o.x, y: t.rect.midY - o.y)
            }
        }
    }
}

private extension View {
    @ViewBuilder func monospacedDigit(_ on: Bool) -> some View { if on { self.monospacedDigit() } else { self } }
}

/// 网页转好的自定义图标（PNG data URL）解码一次就缓存
enum LGImage {
    nonisolated(unsafe) private static var cache: [String: CGImage] = [:]
    static func get(_ url: String) -> CGImage? {
        if let c = cache[url] { return c }
        guard let comma = url.firstIndex(of: ","), let d = Data(base64Encoded: String(url[url.index(after: comma)...])),
              let src = CGImageSourceCreateWithData(d as CFData, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        if cache.count > 200 { cache.removeAll() }
        cache[url] = img
        return img
    }
}

extension Color {
    /// CSS 的 rgb(r, g, b) / rgba(r, g, b, a)
    init?(css: String) {
        let nums = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
        guard nums.count >= 3 else { return nil }
        self.init(.sRGB, red: nums[0] / 255, green: nums[1] / 255, blue: nums[2] / 255, opacity: nums.count >= 4 ? nums[3] : 1)
    }
}

#if os(macOS)
/// 只负责画、不接收鼠标的原生层（盖在网页上）
final class PassThroughHostingView<Content: View>: NSHostingView<Content> {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}
#endif


// MARK: - 新底栏

/// 新底栏的尺寸，和网页 styles.css 末尾一致（网页的今日页从这个胶囊的位置展开，两边对得上动画才自然）
// 【联动:底部悬浮控件】见 CLAUDE.md「联动分组」
enum DockSize {
    static let hit: CGFloat = 64, lift: CGFloat = 40, side: CGFloat = 10
    static let pill: CGFloat = 52, logo: CGFloat = 54, fan: CGFloat = 50, back: CGFloat = 46
    /// 热区底边离屏幕底：至少 24，有 Home 条时再让 10
    static func bottom(_ safe: CGFloat) -> CGFloat { max(24, safe + 10) }
    /// 时钟胶囊、logo 的中轴离屏幕左 / 右边多远：日历每行左右各 2，七列等分，取第一条列线
    static func axis(_ w: CGFloat) -> CGFloat { 2 + (w - 4) / 7 }
    /// 扇形按钮沿四分之一圆弧均匀排开：两个时彼此的间距和到 logo 的间距一样；记录日历多一个中间的「统计」
    /// 扇形按钮的角度（度，逆时针，0 = 正右）和半径：展开动画沿圆弧走要用
    static func fanArc(_ n: Int) -> (a: [CGFloat], r: CGFloat) { n == 3 ? ([100, 145, 190], 88) : ([115, 175], 84) }
    static func fan(_ n: Int) -> [CGSize] {
        let (r, a): (CGFloat, [CGFloat]) = n == 3 ? (88, [100, 145, 190]) : (84, [115, 175])   // 整体相对 logo 逆时针转 10°：加号不要太高、太靠右
        return a.map { d in CGSize(width: cos(d * .pi / 180) * r, height: -sin(d * .pi / 180) * r) }
    }
}

/// 品牌色（和网页一致）：金黄 → 天蓝 → 亮蓝
// 【联动:品牌渐变】见 CLAUDE.md「联动分组」
enum Brand {
    static func a(_ dark: Bool) -> Color { Color(argb: dark ? 0xFFE4_B96B : 0xFFE2_B562) }
    static func mid(_ dark: Bool) -> Color { Color(argb: dark ? 0xFF80_B1EC : 0xFF74_A8E6) }
    static func b(_ dark: Bool) -> Color { Color(argb: dark ? 0xFF6A_99E2 : 0xFF5A_8DDA) }
    static func grad(_ dark: Bool) -> LinearGradient {
        LinearGradient(stops: [.init(color: a(dark), location: 0.06), .init(color: mid(dark), location: 0.52), .init(color: b(dark), location: 0.96)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// App 的 logo：左雾紫、右暖沙，中间一道细白线（和 icons/logo.png 一样，直接画，不用图片）
struct LogoMark: View {
    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            HStack(spacing: 0) {
                LinearGradient(colors: [Color(argb: 0xFFA9_A7C6), Color(argb: 0xFF9B_99B8)], startPoint: .top, endPoint: .bottom)
                LinearGradient(colors: [Color(argb: 0xFFEF_D6C0), Color(argb: 0xFFE2_CDBD)], startPoint: .top, endPoint: .bottom)
            }
            .overlay(Rectangle().fill(.white.opacity(0.92)).frame(width: max(1.5, w * 0.035)).padding(.vertical, w * 0.06))
            .clipShape(Circle())
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

/// 新底栏：左「时钟 / 返回」胶囊 · 中分页点 · 右 logo（点开沿圆弧弹出添加、设置；设置页多一个回到日历）。
/// 全是系统液态玻璃；扇形按钮和 logo 在同一个玻璃组里，弹出 / 收回时玻璃从 logo 里流出来、再融回去。
/// 点按交给网页里同名的按钮处理，网页那一份在 App 里只是藏起来（今日页从胶囊位置展开的动画还用它的位置）
/// 扇形按钮展开的进度 t（0 = 缩在 logo 里，1 = 到位）：沿圆弧从第一个按钮的方向 a0 转到自己的角度 a，半径从 0 长到 r【联动:底部悬浮控件】
struct FanArc: ViewModifier, Animatable {
    var t: CGFloat
    let a: CGFloat, a0: CGFloat, r: CGFloat
    var animatableData: CGFloat { get { t } set { t = newValue } }
    func body(content: Content) -> some View {
        let ang = (a0 + (a - a0) * t) * .pi / 180
        // 只用位移，不缩放：玻璃容器里的玻璃不跟着 scaleEffect 走，一缩放玻璃就会和图标错开（以前按钮旁边多出一圈小玻璃就是这个）
        return content.opacity(Double(min(1, max(0, t * 3)))).offset(x: cos(ang) * r * t, y: -sin(ang) * r * t)
    }
}

/// 扇形收起：按钮已经在自己的位置上（FanArc 的 identity 一直生效），这里只做「相对」的位移，t = 1 时什么都不加，t = 0 时退回 logo。
/// 注意：asymmetric 转场的插入、移除两个 identity 会同时生效，所以移除这一半绝不能再加一遍位置，不然按钮会跑到两倍半径的地方
struct FanBack: ViewModifier, Animatable {
    var t: CGFloat
    let a: CGFloat, r: CGFloat
    var animatableData: CGFloat { get { t } set { t = newValue } }
    func body(content: Content) -> some View {
        let ang = a * .pi / 180
        return content.opacity(Double(min(1, max(0, t * 3)))).offset(x: -cos(ang) * r * (1 - t), y: sin(ang) * r * (1 - t))
    }
}

@available(macOS 26.0, iOS 26.0, *)
struct GlassDock: View {
    @ObservedObject var m: NavModel
    var safeBottom: CGFloat = 0
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var ns

    var body: some View {
        if let d = m.dock {
            let dark = scheme == .dark, b = DockSize.bottom(safeBottom)
            ZStack(alignment: .bottom) {
                if m.fanOpen {   // 打开菜单时：一层很淡的暗角接住点击，不会点穿到日历
                    RadialGradient(colors: [.black.opacity(dark ? 0.45 : 0.14), .black.opacity(dark ? 0.15 : 0.03), .clear],
                                   center: UnitPoint(x: 1, y: 1), startRadius: 0, endRadius: 420)
                        .contentShape(Rectangle())
                        .onTapGesture { m.setFan(false) }
                        .transition(.opacity)
                        .ignoresSafeArea()
                }
                if d.pager { pager(d).padding(.bottom, b).transition(.opacity) }
                // 时钟胶囊、logo 按中轴放：左边对准周日 / 周一之间那条线，右边对准周五 / 周六之间那条线（和网页 --d2-cx 一样）。
                // 各自放在宽 2 × 中轴的框里居中，胶囊多宽中轴都不变。日历里点开某一天的卡片时（pv ≥ 0）只往上挪
                GeometryReader { g in
                    let cx = DockSize.axis(g.size.width)
                    HStack(alignment: .bottom, spacing: 0) {
                        ZStack { if !d.set { clock(d).transition(.scale(scale: 0.86).combined(with: .opacity)) } }
                            .frame(width: cx * 2)
                        Spacer(minLength: 0)
                        logoCluster(d, dark: dark).frame(width: cx * 2)
                    }
                    .frame(width: g.size.width, height: g.size.height, alignment: .bottom)
                }
                .padding(.bottom, b + DockSize.lift + CGFloat(max(0, d.pv ?? 0)))
                .animation(.spring(response: 0.45, dampingFraction: 0.85), value: d.pv)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .offset(y: m.cover ? 160 : 0)
            .opacity(m.cover ? 0 : 1)
            .allowsHitTesting(!m.cover)
        }
    }

    // 时钟胶囊：平时是现在的时间（分钟变化时数字滚动），在今日页变成「‹ 日历」
    @ViewBuilder private func clock(_ d: NavModel.Dock) -> some View {
        Button { m.tapClock() } label: {
            ZStack {
                if d.today {
                    HStack(spacing: 3) {
                        Image(systemName: "chevron.left").font(.system(size: 16, weight: .semibold)).foregroundStyle(Pal(dark: scheme == .dark).accent)
                        Text(d.back).font(.system(size: 15.5, weight: .semibold))
                    }
                    .padding(.leading, 13).padding(.trailing, 18)
                    .transition(.blurReplace)
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(d.t).font(.system(size: 18, weight: .semibold, design: .rounded)).monospacedDigit()
                            .contentTransition(.numericText())
                        if !d.ap.isEmpty { Text(d.ap).font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary) }
                    }
                    .padding(.horizontal, 18)
                    .transition(.blurReplace)
                }
            }
            .foregroundStyle(.primary)
            .frame(minWidth: DockSize.pill, minHeight: DockSize.pill, maxHeight: DockSize.pill)
            .glassEffect(NavGlass.chrome(scheme, interactive: true), in: .capsule)
            .padding((DockSize.hit - DockSize.pill) / 2)   // 热区比看到的大一圈
            .contentShape(Rectangle())
            .animation(.spring(response: 0.42, dampingFraction: 0.8), value: d.today)
            .animation(.snappy, value: d.t)
        }
        .buttonStyle(.plain)
        .modifier(DockRect(m: m, key: "clock"))
        .accessibilityLabel(Text(d.today ? d.back : "今日 \(d.t)"))
    }

    // 分页点：日历 / 日程
    @ViewBuilder private func pager(_ d: NavModel.Dock) -> some View {
        let accent = Pal(dark: scheme == .dark).accent
        Button { m.tapPager() } label: {
            HStack(spacing: 6) {
                ForEach(0..<max(2, d.n ?? 2), id: \.self) { i in   // 几页就几个点（纪念日历是三页）
                    let on = max(0, 1 - abs(d.p - Double(i)))
                    Capsule().fill(accent.opacity(0.38 + 0.62 * on)).frame(width: 6 + 12 * on, height: 6)
                }
            }
            .padding(.horizontal, 9).frame(height: 22)
            .glassEffect(NavGlass.chrome(scheme), in: .capsule)
            .opacity(d.lit == false ? 0.3 : 1)   // 左右切换时亮起，停下后淡下去（和网页一样）
            .padding(.vertical, 21).padding(.horizontal, 12)
            .contentShape(Rectangle())
            .animation(.spring(response: 0.45, dampingFraction: 0.8), value: d.p)
            .animation(.easeInOut(duration: 0.35), value: d.lit)
        }
        .buttonStyle(.plain)
        .modifier(DockRect(m: m, key: "pager"))
        .accessibilityLabel(Text("切换日历 / 日程"))
    }

    private struct FanItem: Identifiable { let id: String; let icon: String; let label: String }

    // logo + 扇形菜单 + 回到今天
    @ViewBuilder private func logoCluster(_ d: NavModel.Dock, dark: Bool) -> some View {
        let items: [FanItem] = [FanItem(id: "add", icon: "plus", label: "添加事件")]
            + (d.st == true ? [m.page == "rstat" ? FanItem(id: "stat", icon: "chevron.left", label: "返回") : FanItem(id: "stat", icon: "chart.bar", label: "统计")] : [])
            + [d.set ? FanItem(id: "set", icon: "chevron.left", label: "返回") : FanItem(id: "set", icon: "gearshape", label: "设置")]
        let arc = DockSize.fanArc(items.count)
        ZStack {
            if m.back {   // 回到今天 / 本周：平时贴在 logo 正上方；扇形弹出时被顶到扇形上方，收起时落回来
                Button { navTick(); m.goToday() } label: {
                    Image(systemName: "arrow.uturn.backward").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.primary.opacity(0.7))
                        .frame(width: DockSize.back, height: DockSize.back)
                        .glassEffect(NavGlass.chrome(scheme, interactive: true), in: .circle)
                        .padding(9).contentShape(Circle())
                }
                .buttonStyle(.plain)
                .modifier(DockRect(m: m, key: "back"))
                .offset(y: m.fanOpen ? -151 : -62)
                .animation(.spring(response: 0.32, dampingFraction: 0.72), value: m.fanOpen)
                .transition(.scale(scale: 0.6).combined(with: .opacity))
                .accessibilityLabel(Text(I18n.t("回到今天")))
            }
            GlassEffectContainer(spacing: 22) {
                ZStack {
                    if m.fanOpen {
                        ForEach(Array(items.enumerated()), id: \.element.id) { k, it in
                            Button { m.fan(it.id) } label: {
                                Image(systemName: it.icon).font(.system(size: it.id == "add" ? 21 : 19, weight: .semibold))
                                    .foregroundStyle(it.id == "add" ? Color.white : Color.primary)
                                    .frame(width: DockSize.fan, height: DockSize.fan)
                                    .background { if it.id == "add" { Circle().fill(Brand.grad(dark)) } }
                                    .glassEffect(it.id == "add" ? Glass.clear.interactive() : NavGlass.chrome(scheme, interactive: true), in: .circle)
                                    .padding(6).contentShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .modifier(DockRect(m: m, key: "fan-" + it.id))   // 在 offset 里面量，位置才包含偏移
                            // 像扇子打开（和网页一样）：从 logo 出发，先朝第一个按钮的方向，一边往外走一边沿圆弧转到自己的位置，按顺序一个接一个
                            .transition(.asymmetric(
                                insertion: .modifier(active: FanArc(t: 0, a: arc.a[k], a0: arc.a[0], r: arc.r), identity: FanArc(t: 1, a: arc.a[k], a0: arc.a[0], r: arc.r))
                                    .animation(.spring(response: 0.32, dampingFraction: 0.72).delay(Double(k) * 0.035)),   // 要干脆（用户嫌慢）
                                removal: .modifier(active: FanBack(t: 0, a: arc.a[k], r: arc.r), identity: FanBack(t: 1, a: arc.a[k], r: arc.r))
                                    .animation(.easeIn(duration: 0.16))))
                            .accessibilityLabel(Text(it.label))
                        }
                    }
                    Button { m.setFan(!m.fanOpen) } label: {
                        ZStack {
                            LogoMark().frame(width: 34, height: 34)
                                .opacity(m.fanOpen ? 0 : 1).scaleEffect(m.fanOpen ? 0.5 : 1).rotationEffect(.degrees(m.fanOpen ? 90 : 0))
                            Image(systemName: "xmark").font(.system(size: 18, weight: .semibold)).foregroundStyle(.primary)
                                .opacity(m.fanOpen ? 0.85 : 0).scaleEffect(m.fanOpen ? 1 : 0.5).rotationEffect(.degrees(m.fanOpen ? 0 : -90))
                        }
                        .frame(width: DockSize.logo, height: DockSize.logo)
                        .glassEffect(NavGlass.chrome(scheme, interactive: true), in: .circle)
                        .padding((DockSize.hit - DockSize.logo) / 2).contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .glassEffectID("logo", in: ns)
                    .modifier(DockRect(m: m, key: "logo"))
                    .accessibilityLabel(Text(m.fanOpen ? "收起" : "更多"))
                }
            }
        }
        .frame(width: DockSize.hit, height: DockSize.hit)
    }
}

/// Mac：记下底栏按钮在窗口里的位置，DockHostingView 只在这些地方接住点击
@available(macOS 26.0, iOS 26.0, *)
private struct DockRect: ViewModifier {
    let m: NavModel, key: String
    func body(content: Content) -> some View {
        #if os(macOS)
        content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { m.dockRects[key] = $0 }
            .onDisappear { m.dockRects[key] = nil }
        #else
        content
        #endif
    }
}

#if os(macOS)
/// Mac 的新底栏：铺满整个窗口，但只在按钮上接住点击；扇形菜单打开时整个窗口都接住（点空白处收起）
final class DockHostingView<Content: View>: NSHostingView<Content> {
    weak var nav: NavModel?
    override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden, let nav, nav.dock != nil, !nav.cover, let p = superview.map({ convert(point, from: $0) }), bounds.contains(p) else { return nil }
        if nav.fanOpen { return super.hitTest(point) ?? self }
        let q = isFlipped ? p : CGPoint(x: p.x, y: bounds.height - p.y)
        return nav.dockRects.values.contains { $0.contains(q) } ? (super.hitTest(point) ?? self) : nil
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
#endif


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
                                    if let c = it.swatch { RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(c, lineWidth: 2).frame(width: 22, height: 16).shadow(color: c.opacity(0.55), radius: 3) }   // 和列表里高亮的样子一样：带一点光的圆角空心框
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
// 【联动:侧拉菜单】见 CLAUDE.md「联动分组」
struct GlassDrawer: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hLock: Bool? // 这次拖动是横着的（拉侧栏）还是竖着的（滚列表）
    @Namespace private var ns
    @State private var dots: [String: CGRect] = [:]   // 每一行「⋯」的位置（drawer 坐标）
    @State private var pill: CGRect? = nil              // 「新建子日历」胶囊的位置（drawer 坐标）
    @State private var kPhase = 0                       // 介绍卡片：0 藏在胶囊里 · 1 小水滴 · 2 卡片
    @State private var kindsH: CGFloat = 400
    @State private var kTask: Task<Void, Never>? = nil
    @State private var moreShown: String? = nil         // 「⋯」小窗口正在画的那一行（收起动画放完才清掉）
    @State private var moreUp = false                   // 小窗口：false 是三个点上的一颗小水滴，true 是展开的窗口

    var body: some View {
        ZStack(alignment: .leading) {
            if m.drawerOpen, let d = m.drawer {
                // 遮罩跟着侧栏拉出来的程度变深
                let shown = max(0, min(1, 1 + min(0, m.drawerPull) / NavModel.panelW))
                Color.black.opacity((scheme == .dark ? 0.4 : 0.2) * shown)   // 遮罩稍微深一点，侧栏和后面的日历拉开层次
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
                if let key = moreShown, let r = ([d.main] + d.recs + d.days).first(where: { $0.key == key }), let a = dots[key] { moreCard(r, at: a) }
                if let pf = pill { pillAndKinds(d, pf).offset(x: min(0, m.drawerPull)).transition(.move(edge: .leading).combined(with: .opacity)) }
            }
        }
        .coordinateSpace(name: "drawer")
        .onChange(of: m.kindsOpen) { _, o in morphKinds(o) }   // 放在一直都在的这一层：卡片那一层被拿掉时也能收到
        .onChange(of: m.drawerOpen) { _, o in if !o, !m.kindsOpen { kTask?.cancel(); kPhase = 0 } }
        .onChange(of: m.moreRow) { _, k in
            // 「⋯」：先在三个点上放一颗小水滴，下一帧一口气拉伸成窗口；收起时缩回水滴，放完再拿掉
            if let k {
                var t = Transaction(); t.disablesAnimations = true
                withTransaction(t) { moreShown = k; moreUp = false }
                DispatchQueue.main.async { withAnimation(.spring(response: 0.42, dampingFraction: 0.7)) { moreUp = true } }
            } else if moreShown != nil {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { moreUp = false }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { if m.moreRow == nil { moreShown = nil } }
            }
        }
        .onPreferenceChange(DotsKey.self) { dots = $0 }
        .onPreferenceChange(PillKey.self) { pill = $0.width > 0 ? $0 : nil }
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
            // 新建子日历：这里只占位置并报出位置；胶囊本身画在 GlassDrawer 的玻璃容器里（和介绍卡片同一个容器，卡片才能从它分离出去）
            Color.clear
                .background(GeometryReader { g in Color.clear.preference(key: PillKey.self, value: g.frame(in: .named("drawer"))) })
            .frame(height: 52)
            .padding(.horizontal, 12).padding(.bottom, 12).padding(.top, 4)
        }
        .frame(width: width)
        .frame(maxHeight: .infinity)
        // 中间：一张带圆角、透光的磨砂卡片（系统磨砂材质 + 一层很淡的白 / 黑），字都在它上面，看得清
        .background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.thinMaterial)
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(scheme == .dark ? Color.black.opacity(0.18) : Color.white.opacity(0.22)))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Color.white.opacity(scheme == .dark ? 0.08 : 0.45), lineWidth: 0.6))
                .padding(7)
        }
        // 边缘：一圈透明的液态玻璃（高光和折射），露在磨砂卡片外面那 7pt。.regular 在这么大一块上会糊成一整块灰，所以用 .clear
        .glassEffect(.clear.tint(scheme == .dark ? Color.black.opacity(0.22) : Color.white.opacity(0.12)), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        // 层次感：整块浮在日历上面，投一层柔和的影子（贴近的一层浓一点、远的一层散开）
        .shadow(color: .black.opacity(scheme == .dark ? 0.45 : 0.14), radius: 30, x: 8, y: 12)
        .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.08), radius: 6, x: 1, y: 2)
        .padding(10)
        #if os(macOS)
        .padding(.top, 26) // 让开窗口左上角的红黄绿按钮
        #endif
    }

    // ---------- 「⋯」小窗口：以三个点为正中心向四周展开（靠边时往里收，不出屏幕），开关类的选项是开关，点了原地切换 ----------
    @ViewBuilder private func moreCard(_ r: NavModel.Row, at a: CGRect) -> some View {
        GeometryReader { g in
            let w: CGFloat = 248, rowH: CGFloat = 46, h = CGFloat(r.menu.count) * rowH + 12
            let x = min(max(a.midX, w / 2 + 12), g.size.width - w / 2 - 12)
            let y = min(max(a.midY, h / 2 + 50), g.size.height - h / 2 - 30)
            ZStack {
                Color.black.opacity(0.001).contentShape(Rectangle())
                    .onTapGesture { m.moreRow = nil }
                    .allowsHitTesting(moreUp)
                VStack(spacing: 0) {
                    ForEach(Array(r.menu.enumerated()), id: \.element.id) { i, it in
                        if i > 0 { Divider().padding(.leading, 16).opacity(0.5) }
                        if it.sw == true || (it.on != nil && it.danger != true) {
                            Toggle(isOn: Binding(get: { it.on ?? false }, set: { _ in navTick(); m.act(r.id, it.value) })) {
                                Text(it.label).font(.system(size: 15, weight: .medium))
                            }
                            .toggleStyle(FillToggle())
                            .padding(.horizontal, 16).frame(height: rowH)
                        } else {
                            Button {
                                m.moreRow = nil
                                m.act(r.id, it.value)
                            } label: {
                                HStack {
                                    Text(it.label).font(.system(size: 15, weight: .medium)).foregroundStyle(it.danger == true ? Color(argb: Pal.RED) : Color.primary)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 16).frame(height: rowH).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.vertical, 6)
                .frame(width: w, height: h)
                .opacity(moreUp ? 1 : 0)
                .animation(moreUp ? .easeOut(duration: 0.2).delay(0.1) : .easeIn(duration: 0.08), value: moreUp)   // 字等玻璃拉开再出来，收起时先收字
                // 玻璃本身是一颗水滴：合着时是三个点上 30pt 的小圆，弹簧一口气拉伸成窗口（带一点果冻回弹），收起时缩回小圆
                .frame(width: moreUp ? w : 30, height: moreUp ? h : 30, alignment: .center)
                .clipShape(RoundedRectangle(cornerRadius: moreUp ? 22 : 15, style: .continuous))
                .glassEffect(NavGlass.chrome(scheme), in: RoundedRectangle(cornerRadius: moreUp ? 22 : 15, style: .continuous))
                .shadow(color: .black.opacity(moreUp ? (scheme == .dark ? 0.4 : 0.14) : 0), radius: 24, y: 10)
                .position(x: moreUp ? x : a.midX, y: moreUp ? y : a.midY)
                .allowsHitTesting(moreUp)
            }
        }
    }

    // ---------- 新建子日历：胶囊和介绍卡片在同一个液态玻璃容器里 ----------
    // 卡片的玻璃一直在：合着时就是藏在胶囊里的同一颗水滴（kPhase 0），打开时一个弹簧直接拉伸成卡片（kPhase 2），收起倒过来。
    // 展开后胶囊留在原位，只剩一颗空的液态玻璃。卡片在屏幕中间稍微偏下
    @ViewBuilder private func pillAndKinds(_ d: NavModel.Drawer, _ pf: CGRect) -> some View {
        GeometryReader { g in
            let open = m.kindsOpen
            let close = { navTick(); m.kindsOpen = false }
            let w = min(420, g.size.width - 24), h = kindsH
            let cardY = min(max(g.size.height * 0.58 - h / 2, 60), g.size.height - h - 24)
            let r: CGRect = kPhase == 2 ? CGRect(x: (g.size.width - w) / 2, y: cardY, width: w, height: h)
                : kPhase == 1 ? CGRect(x: pf.midX - 46, y: pf.minY - 92, width: 92, height: 80)
                : pf.insetBy(dx: 18, dy: 4)
            let rad: CGFloat = kPhase == 2 ? 34 : r.height / 2
            ZStack(alignment: .topLeading) {
                if open {
                    Color.black.opacity(scheme == .dark ? 0.25 : 0.12).contentShape(Rectangle()).onTapGesture { close() }
                        .transition(.opacity)
                }
                // 量卡片内容的自然高度（不显示）
                if let k = d.kinds {
                    kindsContent(k, close: {}).frame(width: w).fixedSize(horizontal: false, vertical: true)
                        .hidden().allowsHitTesting(false)
                        .background(GeometryReader { q in Color.clear.preference(key: KindsHKey.self, value: q.size.height) })
                        .offset(x: -2000)
                }
                GlassEffectContainer(spacing: 44) {   // 间距大一点：离开胶囊时拉丝拉得更长
                    ZStack(alignment: .topLeading) {
                        // 那一滴 / 卡片
                        ZStack(alignment: .top) {
                            if kPhase == 2, let k = d.kinds {
                                kindsContent(k, close: close).frame(width: w, height: h)
                            }
                        }
                        .frame(width: r.width, height: r.height, alignment: .top)
                        .clipShape(RoundedRectangle(cornerRadius: rad, style: .continuous))
                        .glassEffect(NavGlass.chrome(scheme), in: RoundedRectangle(cornerRadius: rad, style: .continuous))
                        .glassEffectID("kinds", in: ns)
                        .position(x: r.midX, y: r.midY)
                        .allowsHitTesting(kPhase == 2)
                        // 胶囊：一直在原位；展开后字和加号隐去，只剩一颗空的液态玻璃
                        Button { navTick(); m.moreRow = nil; m.kindsOpen.toggle() } label: {
                            HStack(spacing: 11) {
                                Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                                    .frame(width: 36, height: 36)
                                    .background(Circle().fill(Brand.grad(scheme == .dark)))
                                    .shadow(color: Brand.a(scheme == .dark).opacity(0.35), radius: 8, y: 4)
                                Text(d.addLabel ?? d.add.first?.label ?? "").font(.system(size: 15.5, weight: .semibold)).foregroundStyle(Color.primary)
                                Spacer(minLength: 0)
                            }
                            .opacity(open ? 0 : 1)
                            .animation(.easeOut(duration: 0.2), value: open)
                            .padding(.leading, 8).padding(.trailing, 18)
                            .frame(width: pf.width, height: pf.height)
                            .contentShape(Capsule())
                            .glassEffect(NavGlass.chrome(scheme, interactive: true), in: .capsule)
                            .glassEffectID("pill", in: ns)
                            // 展开后：留下一颗空的玻璃胶囊，内侧压一层淡淡的凹陷 + 细亮边 + 投影，一眼看得出是「空了」
                            .overlay(Capsule().fill(Color.black.opacity(scheme == .dark ? 0.22 : 0.06)).padding(1.5).opacity(open ? 1 : 0))
                            .overlay(Capsule().strokeBorder(Color.white.opacity(scheme == .dark ? 0.22 : 0.7), lineWidth: 1).opacity(open ? 1 : 0))
                            .shadow(color: .black.opacity(open ? (scheme == .dark ? 0.45 : 0.16) : 0), radius: 14, y: 6)
                            .animation(.easeOut(duration: 0.3), value: open)
                        }
                        .buttonStyle(.plain)
                        .position(x: pf.midX, y: pf.midY)
                    }
                    .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
                }
            }
            .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
            .animation(.easeOut(duration: 0.25), value: open)
            .onPreferenceChange(KindsHKey.self) { if $0 > 0 { kindsH = $0 } }
            // 选了日历类型后侧拉菜单会收起、这一层被拿掉；再出现时按真实状态对齐，别把上次的卡片留在屏幕上
            .onAppear { if !m.kindsOpen && kPhase != 0 { kTask?.cancel(); var t = Transaction(); t.disablesAnimations = true; withTransaction(t) { kPhase = 0 } } }
        }
    }

    // 一步到位：一个弹簧从胶囊直接拉到卡片（中途不停）。玻璃离开胶囊时两块在同一个容器里，系统自己画出拉丝、断开，像水滴被拉出去；
    // 收起倒过来，卡片一口气缩回胶囊、融进去。中途再点会接着当前位置反向
    private func morphKinds(_ o: Bool) {
        kTask?.cancel()
        if o { withAnimation(.spring(response: 0.4, dampingFraction: 0.78)) { kPhase = 2 } }   // 干脆：0.4 秒左右到位（用户嫌长）
        else { withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) { kPhase = 0 } }
    }

    private func kindsContent(_ k: NavModel.Kinds, close: @escaping () -> Void) -> some View {
        VStack(spacing: 12) {
            ZStack {
                Text(k.title).font(.system(size: 17, weight: .bold))
                HStack {
                    Button { close() } label: {
                        Text(k.cancel).font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.primary)
                            .padding(.horizontal, 16).frame(height: 36)
                            .glassEffect(NavGlass.chrome(scheme, interactive: true), in: .capsule)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
            }
            Text(k.lead).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack(alignment: .top, spacing: 10) {   // 两张选项卡一样高
                kindOption(k.rec, art: AnyView(RecArt(dark: scheme == .dark)), tint: Color(argb: 0xFF5B_8FD0)) { m.kindsOpen = false; m.addCal("rec") }
                kindOption(k.days, art: AnyView(DaysArt(k: k.days, dark: scheme == .dark)), tint: Color(argb: 0xFFD4_6A8C)) { m.kindsOpen = false; m.addCal("days") }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .transition(.asymmetric(insertion: .opacity.animation(.easeOut(duration: 0.16).delay(0.1)),   // 内容等玻璃放大得差不多了再出来
                                removal: .opacity.animation(.easeIn(duration: 0.08))))           // 收起时先把字收掉，再缩回水滴
    }

    private func kindOption(_ k: NavModel.Kind, art: AnyView, tint: Color, pick: @escaping () -> Void) -> some View {
        Button { navTick(); pick() } label: {
            VStack(alignment: .leading, spacing: 6) {
                art.frame(height: 100).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(k.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Color.primary).padding(.horizontal, 4)
                Text(k.desc).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
                Text(k.eg).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(tint).padding(.horizontal, 4).padding(.top, 2)
            }
            .padding(10).padding(.bottom, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(argb: scheme == .dark ? 0xFF22_2226 : 0xFFFF_FFFF)).shadow(color: tint.opacity(0.14), radius: 12, y: 5))
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(PressScale())
    }

    private func section(_ t: String) -> some View {
        Text(t).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 4)
    }

    private func row(_ r: NavModel.Row) -> some View {
        let color = Color(hex: r.color) ?? Pal(dark: scheme == .dark).accent
        let icon = r.kind == "days" ? (r.sf ?? "heart.fill") : r.kind == "rec" ? "bookmark.fill" : "calendar"
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
                // 「⋯」：以这三个点为中心展开一个带开关的小窗口（GlassDrawer 的 moreCard）
                Button { navTick(); withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) { m.moreRow = m.moreRow == r.key ? nil : r.key } } label: {
                    Image(systemName: "ellipsis").font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
                        .frame(width: 36, height: 36).contentShape(Circle())
                }
                .buttonStyle(.plain)
                .background(GeometryReader { g in Color.clear.preference(key: DotsKey.self, value: [r.key: g.frame(in: .named("drawer"))]) })
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background {
            if r.on { RoundedRectangle(cornerRadius: 15, style: .continuous).fill(color.opacity(scheme == .dark ? 0.2 : 0.13)) }
        }
        .id(r.key)
    }
}

/// 侧拉菜单每一行「⋯」的位置（drawer 坐标），小窗口以它为中心展开
/// 侧拉菜单里「新建子日历」胶囊的位置（drawer 坐标）
struct KindsHKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct PillKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { let n = nextValue(); if n.width > 0 { value = n } }
}
struct DotsKey: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) { value.merge(nextValue()) { $1 } }
}
/// 「⋯」小窗口里的开关（用户定的样子）：一颗系统的透明液态玻璃水滴。关着时玻璃下面是淡淡凹陷的空底；
/// 打开后 Cadence logo 的渐变色（淡紫 → 雾紫粉 → 杏）像一团气体在玻璃下面涨开、由模糊变清晰，充满到饱满，被玻璃折射着；
/// 充满之后一个白色的小勾从左往右「画」出来，浮在玻璃上（带紫调投影）。按下去水滴被压扁一点，松手像果冻一样弹回，切换时轻震一下。
/// 颜色在玻璃下面、玻璃在最上面：体积感靠系统玻璃的折射和边缘厚度，不手画高光（和网页 .mi-sw 一样）【联动:品牌渐变】
@available(macOS 26.0, iOS 26.0, *)
struct FillToggle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View { FillToggleBody(label: AnyView(configuration.label), isOn: configuration.$isOn) }
}
struct CheckShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + r.width * 0.18, y: r.minY + r.height * 0.54))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.42, y: r.minY + r.height * 0.78))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.84, y: r.minY + r.height * 0.26))
        return p
    }
}
@available(macOS 26.0, iOS 26.0, *)
struct FillToggleBody: View {
    let label: AnyView
    @Binding var isOn: Bool
    @GestureState private var pressed = false
    @Environment(\.colorScheme) private var scheme
    static let logo = LinearGradient(colors: [Color(argb: 0xFF9E_9AC8), Color(argb: 0xFFC7_B3CF), Color(argb: 0xFFEB_C7A6)], startPoint: .leading, endPoint: .trailing)
    var body: some View {
        let dark = scheme == .dark, on = isOn
        HStack {
            label
            Spacer(minLength: 12)
            ZStack(alignment: .leading) {
                Capsule().fill(dark ? Color.black.opacity(0.28) : Color.black.opacity(0.07))   // 空的时候：淡淡凹陷的底
                GeometryReader { g in
                    Capsule().fill(FillToggleBody.logo)   // 一团彩色的气：从左边涨开、由模糊变清晰
                        .frame(width: on ? g.size.width : g.size.height * 0.6)
                        .blur(radius: on ? 0 : 8)
                        .opacity(on ? 1 : 0)
                        .animation(on ? .spring(response: 0.26, dampingFraction: 0.9) : .easeIn(duration: 0.14), value: on)   // 干脆：一下涨满，不拖
                }
                .clipShape(Capsule())
                Capsule().fill(Color.clear)   // 最上面：系统的透明液态玻璃，折射下面的颜色，像一颗水滴
                    .glassEffect(.clear.interactive(), in: Capsule())
                // 白色小勾：颜色充到一大半时从左往右画出来，底下一层带紫调的柔和投影，像压在水滴表面
                CheckShape()
                    .trim(from: 0, to: on ? 1 : 0)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                    .frame(width: 14, height: 14)
                    .shadow(color: Color(argb: 0xFF5A_4A80).opacity(0.45), radius: 1.2, y: 1)
                    .shadow(color: Color(argb: 0xFF5A_4A80).opacity(0.2), radius: 4, y: 2)
                    .frame(maxWidth: .infinity)
                    .animation(on ? .easeOut(duration: 0.15).delay(0.1) : .easeIn(duration: 0.08), value: on)   // 颜色快满时紧跟着一笔画出
            }
            .frame(width: 50, height: 28)
            // 点击反馈：按下去水滴被压扁一点（横向变宽、纵向变矮），松手像果冻一样弹回
            .scaleEffect(x: pressed ? 1.1 : 1, y: pressed ? 0.86 : 1)
            .animation(pressed ? .spring(response: 0.2, dampingFraction: 0.8) : .spring(response: 0.42, dampingFraction: 0.42), value: pressed)
        }
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0)
            .updating($pressed) { _, st, _ in st = true }
            .onEnded { v in if abs(v.translation.width) < 30 && abs(v.translation.height) < 30 { isOn.toggle() } })
    }
}
/// 按下去轻轻缩一下（介绍卡片里的两张选项卡）
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
/// 记录日历的效果图：星期点 + 几条优先级渐变色条 + 右下角等级统计柱（和网页 .ck-rec 一样）
struct RecArt: View {
    let dark: Bool
    var body: some View {
        let g = { (s: [(CGFloat, UInt32)]) in LinearGradient(stops: s.map { .init(color: Color(argb: $0.1), location: $0.0) }, startPoint: .leading, endPoint: .trailing) }
        ZStack(alignment: .bottomTrailing) {
            Color(argb: dark ? 0xFF2C_2C30 : 0xFFF1_F2F5)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 5) { ForEach(0..<7, id: \.self) { _ in Capsule().fill(Color.secondary.opacity(0.35)).frame(width: 12, height: 4) } }.padding(.bottom, 3)
                GeometryReader { geo in
                    VStack(alignment: .leading, spacing: 5) {
                        RoundedRectangle(cornerRadius: 3).fill(g(Pal.GRAD_L[1]!)).frame(width: geo.size.width * 0.62, height: 9)
                        RoundedRectangle(cornerRadius: 3).fill(g(Pal.GRAD_L[2]!)).frame(width: geo.size.width * 0.44, height: 9)
                        RoundedRectangle(cornerRadius: 3).fill(g(Pal.GRAD_L[3]!)).frame(width: geo.size.width * 0.8, height: 9)
                        RoundedRectangle(cornerRadius: 3).fill(Color(argb: 0xFF5B_A86B)).frame(width: geo.size.width * 0.36, height: 9)
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array([(0.4, 0xFF5B_A86B), (0.7, 0xFFC9_8A1E), (0.55, 0xFFE0_7A3C), (0.85, 0xFFD4_472C)].enumerated()), id: \.offset) { _, b in
                    RoundedRectangle(cornerRadius: 2).fill(Color(argb: UInt32(b.1))).frame(width: 7, height: 34 * b.0)
                }
            }
            .padding(10)
        }
    }
}
/// 纪念日历的效果图：一张带光的倒数卡（心形、大数字、重复标签，和网页 .ck-days 一样）
struct DaysArt: View {
    let k: NavModel.Kind, dark: Bool
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: dark ? [Color(argb: 0xFF8E_4A63), Color(argb: 0xFF7A_3556), Color(argb: 0xFF5C_3A78)] : [Color(argb: 0xFFF4_B3C2), Color(argb: 0xFFD4_6A8C), Color(argb: 0xFFA6_6BBE)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            Image(systemName: "heart.fill").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                .frame(width: 26, height: 26).background(Color.white.opacity(0.28), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(10)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(k.big ?? "").font(.system(size: 11, weight: .semibold))
                    Text("12").font(.system(size: 34, weight: .heavy)).kerning(-1)
                    Text(k.unit ?? "").font(.system(size: 11, weight: .semibold))
                }
                Text(k.tag ?? "").font(.system(size: 10, weight: .semibold)).padding(.horizontal, 7).padding(.vertical, 1)
                    .background(Color.white.opacity(0.25), in: Capsule())
            }
            .foregroundStyle(.white).padding(.horizontal, 12).padding(.bottom, 8)
        }
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
