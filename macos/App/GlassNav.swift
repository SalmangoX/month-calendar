import Combine
import SwiftUI

/// macOS 26 起，主窗口的导航层用真正的液态玻璃（Apple 的规范：玻璃只用在导航层，内容层保持不透明）：
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
    @Published var drawer: Drawer?
    @Published var drawerOpen = false

    /// 在网页里执行一段 JS（有结果时回调）
    var eval: (String, ((Any?) -> Void)?) -> Void = { _, _ in }

    /// 顶上那一条（和红黄绿按钮同一行）里，网页按钮的位置；其余地方按住可以拖动窗口
    var onDragHoles: ([CGRect]) -> Void = { _ in }

    /// 网页每次切页、菜单栏有变化时发来：{tabs, page, fab, holes}
    func update(_ json: String) {
        struct State: Decodable { let tabs: [Tab]; let page: String; let fab: Bool; let holes: [[Double]]? }
        guard let d = json.data(using: .utf8), let s = try? JSONDecoder().decode(State.self, from: d) else { return }
        if s.tabs.map(\.id) != tabs.map(\.id) || s.tabs.map(\.label) != tabs.map(\.label) || s.tabs.map(\.hidden) != tabs.map(\.hidden) { tabs = s.tabs }
        if page != s.page { page = s.page }
        if fab != s.fab { fab = s.fab }
        if let h = s.holes { onDragHoles(h.compactMap { $0.count == 4 ? CGRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) : nil }) }
    }

    func go(_ p: String) { eval("document.querySelector('#tabbar [data-page=\"\(p)\"]').click()", nil) }
    func add() { eval("document.getElementById('fab').click()", nil) }

    // ---------- 日历栏 ----------
    func openDrawer() { refresh { [weak self] in self?.drawerOpen = true } }
    func closeDrawer() { drawerOpen = false }
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

/// 底部菜单栏：一整条胶囊形的玻璃，当前页用主色，下面垫一块很淡的底
@available(macOS 26.0, *)
struct GlassTabBar: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let accent = Pal(dark: scheme == .dark).accent
        HStack(spacing: 2) {
            ForEach(m.tabs.filter { !$0.hidden }) { t in
                let on = t.page == m.page
                Button { m.go(t.page) } label: {
                    VStack(spacing: 3) {
                        Image(systemName: NavModel.icon(t.page)).font(.system(size: 17, weight: on ? .semibold : .regular)).frame(height: 21)
                        Text(t.label).font(.system(size: 10.5, weight: on ? .semibold : .medium)).lineLimit(1)
                    }
                    .foregroundStyle(on ? accent : Color.primary.opacity(0.82))
                    .frame(maxWidth: .infinity, minHeight: 52, maxHeight: 52)
                    .background { if on { Capsule().fill(Color.primary.opacity(0.09)) } }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .help(t.label)
            }
        }
        .animation(.smooth(duration: 0.25), value: m.page)
        .padding(4)
        .frame(maxWidth: 520)
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(10) // 给玻璃的阴影留位置
        .opacity(m.tabs.isEmpty ? 0 : 1)
    }
}

/// 右下角的加号：带主色的圆形玻璃
@available(macOS 26.0, *)
struct GlassFab: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button { m.add() } label: {
            Image(systemName: "plus").font(.system(size: 22, weight: .semibold))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.glassProminent) // Apple 的主操作按钮样式：带主色的玻璃
        .buttonBorderShape(.circle)
        .tint(Pal(dark: scheme == .dark).accent)
        .controlSize(.large)
        .padding(10)
    }
}

/// 左侧日历栏：浮在日历上的一张玻璃卡片，和网页的日历栏同样的分组和操作
@available(macOS 26.0, *)
struct GlassDrawer: View {
    @ObservedObject var m: NavModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .leading) {
            if m.drawerOpen, let d = m.drawer {
                Color.black.opacity(scheme == .dark ? 0.32 : 0.14)
                    .contentShape(Rectangle())
                    .onTapGesture { m.closeDrawer() }
                    .transition(.opacity)
                panel(d).transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .animation(.spring(response: 0.38, dampingFraction: 0.86), value: m.drawerOpen)
        .onExitCommand { m.closeDrawer() }
    }

    private func panel(_ d: NavModel.Drawer) -> some View {
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
        .frame(width: 300)
        .frame(maxHeight: .infinity)
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
        .padding(10)
        .padding(.top, 26) // 让开窗口左上角的红黄绿按钮
    }

    private func section(_ t: String) -> some View {
        Text(t).font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary).padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 4)
    }

    private func row(_ r: NavModel.Row) -> some View {
        let color = Color(hex: r.color) ?? Pal(dark: scheme == .dark).accent
        let icon = r.kind == "days" ? "heart.fill" : r.kind == "rec" ? "book.closed.fill" : "checklist"
        return HStack(spacing: 6) {
            Button { m.pick(r.id) } label: {
                HStack(spacing: 11) {
                    Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(color)
                        .frame(width: 34, height: 34)
                        .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
                .menuStyle(.button)
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
