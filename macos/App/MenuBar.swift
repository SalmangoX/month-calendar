import AppKit
import Combine
import SwiftUI

/// 菜单栏图标：点一下弹出小月历（macOS 26 起弹窗本身就是液态玻璃）
@MainActor
final class StatusBar: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let popover = NSPopover()
    private var sub: AnyCancellable?

    init(engine: Engine) {
        super.init()
        let host = NSHostingController(rootView: MenuBarView().environmentObject(engine))
        host.sizingOptions = .preferredContentSize
        popover.contentViewController = host
        popover.behavior = .transient
        popover.animates = true
        if let b = item.button {
            b.image = NSImage(systemSymbolName: "calendar", accessibilityDescription: "节律")
            b.image?.isTemplate = true
            b.imagePosition = .imageLeading
            b.target = self
            b.action = #selector(toggle(_:))
        }
        sub = engine.$data.receive(on: RunLoop.main).sink { [weak self] d in self?.badge(d) }
    }

    /// 图标旁边显示今天还有几件未完成
    private func badge(_ d: CalData) {
        let open = d.on(.today).filter { !$0.done }.count
        item.button?.title = open > 0 ? " \(open)" : ""
        item.button?.toolTip = open > 0 ? I18n.t("{0} 件未完成", open) : "节律"
    }

    @objc private func toggle(_ sender: NSStatusBarButton) {
        if popover.isShown { popover.performClose(sender); return }
        popover.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }

    func close() { popover.performClose(nil) }
}

// ---------- 液态玻璃（macOS 26）；旧系统用毛玻璃材质 ----------
extension View {
    @ViewBuilder func glassButton(prominent: Bool = false) -> some View {
        if #available(macOS 26.0, *) {
            if prominent { buttonStyle(.glassProminent) } else { buttonStyle(.glass) }
        } else {
            if prominent { buttonStyle(.borderedProminent) } else { buttonStyle(.bordered) }
        }
    }

    @ViewBuilder func glassPanel(_ radius: CGFloat) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(.regular, in: .rect(cornerRadius: radius))
        } else {
            background(.regularMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        }
    }
}

/// 几个相邻的玻璃按钮放在一起时融成一组
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 6
    @ViewBuilder var content: Content
    var body: some View {
        if #available(macOS 26.0, *) { GlassEffectContainer(spacing: spacing) { content } } else { content }
    }
}

struct MenuBarView: View {
    @EnvironmentObject var engine: Engine
    @Environment(\.colorScheme) private var scheme
    @State private var off = 0
    @State private var selected = YMD.today

    private var pal: Pal { Pal(dark: scheme == .dark) }

    var body: some View {
        let d = engine.data, today = YMD.today
        let ym = today.firstOfMonth.addingMonths(off)
        let ws = Shared.weekStart
        let days = monthGrid(ym, weekStart: ws)
        VStack(alignment: .leading, spacing: 10) {
            header(ym)
            VStack(spacing: 2) {
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { k in
                        Text(I18n.wdHead((k + ws) % 7)).font(.system(size: 10)).foregroundStyle(pal.text2).frame(maxWidth: .infinity)
                    }
                }
                ForEach(0..<6, id: \.self) { r in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { k in cell(days[r * 7 + k], ym, today, d) }
                    }
                }
            }
            dayList(d)
            footer
        }
        .padding(14)
        .frame(width: 304)
        .onAppear { selected = YMD.today }
    }

    private func header(_ ym: YMD) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(I18n.mon(ym.m)).font(.system(size: 17, weight: .bold)).foregroundStyle(pal.accent)
            Text(String(ym.y)).font(.system(size: 12)).foregroundStyle(pal.text2)
            Spacer()
            GlassGroup {
                HStack(spacing: 4) {
                    if off != 0 {
                        Button(I18n.t("本月")) { off = 0; selected = .today }.glassButton()
                    }
                    Button { off -= 1 } label: { Image(systemName: "chevron.left") }.glassButton()
                    Button { off += 1 } label: { Image(systemName: "chevron.right") }.glassButton()
                }
            }
            .controlSize(.small)
        }
    }

    private func cell(_ day: YMD, _ ym: YMD, _ today: YMD, _ d: CalData) -> some View {
        let isToday = day == today, isSel = day == selected, inMonth = day.m == ym.m
        let dots = d.on(day).filter { !$0.done }.prefix(3)
        return Button { selected = day } label: {
            VStack(spacing: 2) {
                Text("\(day.d)")
                    .font(.system(size: 12, weight: isToday ? .bold : .regular))
                    .foregroundStyle(isToday ? .white : inMonth ? pal.text : pal.dim)
                    .frame(width: 24, height: 24)
                    .background { if isToday { Circle().fill(pal.accent) } else if isSel { Circle().fill(pal.todayCell) } }
                HStack(spacing: 2) {
                    ForEach(Array(dots.enumerated()), id: \.offset) { _, e in
                        Circle().fill(Color(argb: pal.base(e, d))).frame(width: 4, height: 4)
                    }
                }
                .frame(height: 4)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func dayList(_ d: CalData) -> some View {
        let evs = d.on(selected), cs = d.courses(on: selected)
        VStack(alignment: .leading, spacing: 6) {
            Text(I18n.full(selected)).font(.system(size: 12, weight: .semibold)).foregroundStyle(pal.text2)
            if evs.isEmpty && cs.isEmpty {
                Text(I18n.t("没有事件")).font(.system(size: 12)).foregroundStyle(pal.text2).padding(.vertical, 6)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(cs.enumerated()), id: \.offset) { _, c in
                        let t = d.toneOf(c.code)
                        row(bar: Color(argb: t[pal.dark ? CourseColors.BAR_D : CourseColors.BASE]),
                            title: c.type.isEmpty ? c.code : c.code + "  " + I18n.t(c.type), done: false,
                            sub: fmtRange(c.start, c.end, d.h12) + (c.room.isEmpty ? "" : " · " + c.room))
                    }
                    ForEach(Array(evs.enumerated()), id: \.offset) { _, e in
                        let t = e.timeLabel(d.h12)
                        row(bar: Color(argb: e.done ? withAlpha(pal.base(e, d), 0x40) : pal.base(e, d)), title: e.displayTitle, done: e.done,
                            sub: (t.isEmpty ? I18n.t("全天") : t) + (e.days > 1 ? " · " + I18n.t("{0} 天", e.days) : "") + (e.note.isEmpty ? "" : " · " + e.note.replacingOccurrences(of: "\n", with: " ")))
                    }
                }
            }
            .frame(height: min(190, CGFloat(cs.count + evs.count) * 36))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(14)
    }

    private func row(bar: Color, title: String, done: Bool, sub: String) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(bar).frame(width: 3.5, height: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 13)).strikethrough(done).foregroundStyle(done ? pal.text2 : pal.text).lineLimit(1)
                Text(sub).font(.system(size: 11)).foregroundStyle(pal.text2).lineLimit(1)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            GlassGroup {
                HStack(spacing: 6) {
                    Button(I18n.t("打开节律")) { (NSApp.delegate as? AppDelegate)?.main.show() }
                        .glassButton(prominent: true).tint(pal.accent)
                    Button { Task { await engine.pull() } } label: {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    .glassButton()
                    .disabled(engine.syncing)
                    .help(I18n.t("立即同步"))
                    Menu {
                        Toggle(I18n.t("开机时自动启动"), isOn: Binding(get: { engine.launchAtLogin }, set: { engine.launchAtLogin = $0 }))
                        Divider()
                        Button(I18n.t("退出节律")) { NSApp.terminate(nil) }
                    } label: { Image(systemName: "ellipsis") }
                    .menuIndicator(.hidden)
                    .menuStyle(.button)
                    .glassButton()
                }
            }
            Spacer(minLength: 0)
            Text(engine.syncText).font(.system(size: 10)).foregroundStyle(pal.text2).lineLimit(2).multilineTextAlignment(.trailing)
        }
        .controlSize(.regular)
    }
}
