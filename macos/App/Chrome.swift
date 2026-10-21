import AppKit
import SwiftUI

/// 底部菜单栏和加号：用系统的液态玻璃（macOS 26）绘制，盖在网页上面，后面的日历内容会透过玻璃折射出来。
/// 网页把当前页、标签、头像和「有没有面板盖住」告诉这里；点按 / 拖动切换后交回网页处理。
@MainActor
final class ChromeModel: ObservableObject {
    struct Tab: Identifiable, Equatable { let page: String; let label: String; var id: String { page } }

    @Published var tabs: [Tab] = []
    @Published var page = "cal"
    @Published var avatar: NSImage?
    @Published var covered = false
    private var avatarSrc = ""

    var visible: Bool { !tabs.isEmpty && !covered }

    func update(_ json: String) {
        guard let o = jparse(json) else { return }
        tabs = o.arr("tabs").map { Tab(page: $0.str("page"), label: $0.str("label")) }.filter { !$0.page.isEmpty }
        page = o.str("page", "cal")
        covered = o.bool("covered")
        let src = o.str("avatar")
        if src != avatarSrc {
            avatarSrc = src
            if let comma = src.firstIndex(of: ","), src.hasPrefix("data:"), let d = Data(base64Encoded: String(src[src.index(after: comma)...])) {
                avatar = NSImage(data: d)
            } else { avatar = nil }
        }
    }

    func reset() { tabs = [] }
}

struct ChromeBar: View {
    @ObservedObject var model: ChromeModel
    let select: (String) -> Void
    let add: () -> Void

    @Environment(\.colorScheme) private var scheme
    @Namespace private var ns
    @State private var hover: String?
    @State private var barWidth: CGFloat = 1

    private var pal: Pal { Pal(dark: scheme == .dark) }

    var body: some View {
        GlassGroup(spacing: 14) {
            HStack(spacing: 14) {
                bar
                plus
            }
        }
        .padding(6) // 留出玻璃的阴影
        .opacity(model.visible ? 1 : 0)
        .scaleEffect(model.visible ? 1 : 0.96, anchor: .bottom)
        .animation(.smooth(duration: 0.25), value: model.visible)
    }

    private var bar: some View {
        HStack(spacing: 0) {
            ForEach(model.tabs) { t in tab(t) }
        }
        .padding(5)
        .frame(height: 60)
        .background(GeometryReader { g in Color.clear.onAppear { barWidth = g.size.width }.onChange(of: g.size.width) { _, w in barWidth = w } })
        .liquidGlass(in: Capsule())
        // 和网页一样可以按住拖动，松手切换到手指下面的那一项
        .simultaneousGesture(
            DragGesture(minimumDistance: 6)
                .onChanged { v in
                    let n = max(1, model.tabs.count)
                    let i = min(n - 1, max(0, Int((v.location.x - 5) / max(1, (barWidth - 10) / CGFloat(n)))))
                    if model.tabs.indices.contains(i), hover != model.tabs[i].page {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { hover = model.tabs[i].page }
                    }
                }
                .onEnded { _ in
                    if let h = hover { select(h) }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { hover = nil }
                }
        )
    }

    private func tab(_ t: ChromeModel.Tab) -> some View {
        let shown = hover ?? model.page
        let on = shown == t.page
        return Button {
            select(t.page)
        } label: {
            VStack(spacing: 3) {
                icon(t.page)
                Text(t.label).font(.system(size: 10, weight: .semibold)).lineLimit(1)
            }
            .foregroundStyle(on ? pal.accent : pal.text2)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Capsule())
            .background {
                if on {
                    Capsule()
                        .fill(pal.accent.opacity(hover == nil ? 0.13 : 0.2))
                        .matchedGeometryEffect(id: "sel", in: ns)
                        .scaleEffect(hover == nil ? 1 : 1.06) // 拖动时像被拿起来一点
                }
            }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: model.page)
    }

    @ViewBuilder private func icon(_ page: String) -> some View {
        switch page {
        case "set":
            if let img = model.avatar {
                Image(nsImage: img).resizable().scaledToFill().frame(width: 22, height: 22).clipShape(Circle())
                    .overlay(Circle().stroke(.foreground, lineWidth: 1.5))
            } else {
                Image(systemName: "gearshape").font(.system(size: 19, weight: .medium)).frame(height: 22)
            }
        default:
            Image(systemName: ["today": "checkmark.square", "cal": "calendar", "quad": "square.grid.2x2.fill", "sched": "tablecells"][page] ?? "circle")
                .font(.system(size: 19, weight: .medium)).frame(height: 22)
        }
    }

    private var plus: some View {
        Button(action: add) {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .liquidGlass(in: Circle(), tint: pal.accent)
        .help("⌘N")
    }
}

extension View {
    /// 系统液态玻璃（macOS 26，可交互：按下时有高光和弹性）；旧系统用毛玻璃材质
    @ViewBuilder func liquidGlass<S: Shape>(in shape: S, tint: Color? = nil) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(tint.map { Glass.regular.tint($0).interactive() } ?? Glass.regular.interactive(), in: shape)
        } else if let t = tint {
            background(shape.fill(t)).shadow(color: t.opacity(0.35), radius: 10, y: 5)
        } else {
            background(.regularMaterial, in: shape).overlay(shape.stroke(.white.opacity(0.35), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        }
    }
}

/// 盖在网页上的那一块：隐藏（有面板盖住）时点击穿到网页
final class ChromeHostingView: NSHostingView<ChromeBar> {
    var enabled: () -> Bool = { true }
    override func hitTest(_ point: NSPoint) -> NSView? { enabled() ? super.hitTest(point) : nil }
}
