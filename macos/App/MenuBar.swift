import AppKit
import Combine
import SwiftUI

/// 菜单栏图标：点一下弹出小月历。
/// macOS 26 起，面板本身就是一整块液态玻璃（AppKit 的 NSGlassEffectView，Regular 样式）：直接盖在桌面上，透出后面的壁纸和窗口。
/// Regular 而不是 Clear：Apple 的规范里，有大量文字的界面用 Regular，系统会自动给上面的文字做可读性处理；
/// Clear 一直是透明的，要另加压暗层，只适合媒体背景上又粗又亮的少量元素。
/// 不再用 NSPopover：它自带一层磨砂底，玻璃叠在磨砂上就只剩磨砂的样子。旧系统用毛玻璃材质。
@MainActor
final class StatusBar: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let panel: MenuPanel
    private var monitor: Any?
    private var sub: AnyCancellable?

    init(engine: Engine) {
        var resize: (CGSize) -> Void = { _ in }
        panel = MenuPanel(root: AnyView(MenuBarView(onSize: { resize($0) }).environmentObject(engine)))
        super.init()
        resize = { [weak self] size in self?.panel.fit(size) }
        panel.onClose = { [weak self] in self?.close() }
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
        if panel.isVisible { close(); return }
        open()
    }

    /// 打开小月历（点菜单栏图标，或者 cadence://menubar，比如在快捷指令里绑一个快捷键）
    func open() {
        guard !panel.isVisible, let sender = item.button, let w = sender.window else { return }
        panel.show(below: w.convertToScreen(sender.convert(sender.bounds, to: nil)))
        // 点到别的 App 或桌面就收起（和原来的弹窗一样）
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in self?.close() }
        }
    }

    func close() {
        if let m = monitor { NSEvent.removeMonitor(m); monitor = nil }
        if panel.isVisible { panel.orderOut(nil) }
    }
}

/// 浮在菜单栏下面的无边框面板：整个面板就是一块玻璃，内容放在玻璃里
@MainActor
final class MenuPanel: NSPanel, NSWindowDelegate {
    var onClose: () -> Void = {}
    private let host: NSHostingView<AnyView>
    private var anchor = NSRect.zero

    init(root: AnyView) {
        host = NSHostingView(rootView: root)
        super.init(contentRect: NSRect(x: 0, y: 0, width: 304, height: 400), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        isFloatingPanel = true
        level = .popUpMenu
        backgroundColor = .clear
        isOpaque = false
        hasShadow = true
        isReleasedWhenClosed = false
        hidesOnDeactivate = false
        animationBehavior = .utilityWindow
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        delegate = self
        let radius: CGFloat = 22
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView()
            glass.style = .regular
            glass.cornerRadius = radius
            glass.contentView = host
            contentView = glass
        } else {
            let fx = NSVisualEffectView()
            fx.material = .popover
            fx.blendingMode = .behindWindow
            fx.state = .active
            fx.wantsLayer = true
            fx.layer?.cornerRadius = radius
            fx.layer?.masksToBounds = true
            host.translatesAutoresizingMaskIntoConstraints = false
            fx.addSubview(host)
            NSLayoutConstraint.activate([host.leadingAnchor.constraint(equalTo: fx.leadingAnchor), host.trailingAnchor.constraint(equalTo: fx.trailingAnchor),
                                         host.topAnchor.constraint(equalTo: fx.topAnchor), host.bottomAnchor.constraint(equalTo: fx.bottomAnchor)])
            contentView = fx
        }
    }

    override var canBecomeKey: Bool { true }
    override func cancelOperation(_ sender: Any?) { onClose() } // Esc 收起
    func windowDidResignKey(_ notification: Notification) { onClose() }

    /// 贴着菜单栏图标的正下方，不超出屏幕两边
    func show(below r: NSRect) {
        anchor = r
        fit(host.fittingSize)
        NSApp.activate(ignoringOtherApps: true) // 面板成为前台，玻璃才是「活」的（不在前台时系统会把玻璃画平）
        makeKeyAndOrderFront(nil)
    }

    /// 内容变高变矮时，保持顶边不动
    func fit(_ size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        let screen = (NSScreen.screens.first { $0.frame.contains(NSPoint(x: anchor.midX, y: anchor.midY)) } ?? NSScreen.main)?.visibleFrame ?? .zero
        let x = min(max(anchor.midX - size.width / 2, screen.minX + 8), screen.maxX - size.width - 8)
        let top = anchor == .zero ? frame.maxY : min(anchor.minY - 6, screen.maxY)
        setFrame(NSRect(x: x, y: top - size.height, width: size.width, height: size.height), display: true)
    }
}

// ---------- 面板里的按钮和分区：面板本身已经是玻璃，里面不再叠玻璃（Apple 的规范：玻璃不叠玻璃）----------
extension View {
    /// 标准按钮：macOS 26 上系统会自动画成液态玻璃风格的胶囊按钮
    @ViewBuilder func glassButton(prominent: Bool = false) -> some View {
        if prominent { buttonStyle(.borderedProminent) } else { buttonStyle(.bordered) }
    }

    /// 分区：在玻璃上铺一层很淡的底色，把一组内容框在一起，又不挡住玻璃的透光
    func glassPanel(_ radius: CGFloat) -> some View {
        background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// 几个相邻的按钮放在一起
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 6
    @ViewBuilder var content: Content
    var body: some View { content }
}

struct MenuBarView: View {
    @EnvironmentObject var engine: Engine
    @ObservedObject private var backup = Backup.shared
    @ObservedObject private var updater = Updater.shared
    @Environment(\.colorScheme) private var scheme
    var onSize: (CGSize) -> Void
    @State private var off = 0
    @State private var selected = YMD.today

    init(onSize: @escaping (CGSize) -> Void = { _ in }) { self.onSize = onSize }

    private var pal: Pal { Pal(dark: scheme == .dark) }
    // 文字用系统的语义颜色（primary / secondary）：在液态玻璃上系统会按背后的内容自动调整，保证看得清

    var body: some View {
        let d = engine.data, today = YMD.today
        let ym = today.firstOfMonth.addingMonths(off)
        let ws = Shared.weekStart
        let days = monthGrid(ym, weekStart: ws)
        VStack(alignment: .leading, spacing: 10) {
            if updater.available, let v = updater.latest {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.down.circle").foregroundStyle(pal.accentText)
                    Text(I18n.t("Mac 版有新版本 {0}", v.version)).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.primary)
                    Spacer(minLength: 0)
                    Button(I18n.t("更新…")) { updater.install() }.glassButton(prominent: true).tint(pal.accent).controlSize(.small)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .glassPanel(12)
            }
            header(ym)
            VStack(spacing: 2) {
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { k in
                        Text(I18n.wdHead((k + ws) % 7)).font(.system(size: 10)).foregroundStyle(Color.secondary).frame(maxWidth: .infinity)
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
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGSize.self) { $0.size } action: { onSize($0) }
        .onAppear { selected = YMD.today }
    }

    private func header(_ ym: YMD) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(I18n.mon(ym.m)).font(.system(size: 17, weight: .bold)).foregroundStyle(pal.accent)
            Text(String(ym.y)).font(.system(size: 12)).foregroundStyle(Color.secondary)
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
                    .foregroundStyle(isToday ? .white : inMonth ? Color.primary : Color(nsColor: .tertiaryLabelColor))
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
            Text(I18n.full(selected)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.secondary)
            if evs.isEmpty && cs.isEmpty {
                Text(I18n.t("没有事件")).font(.system(size: 12)).foregroundStyle(Color.secondary).padding(.vertical, 6)
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
                Text(title).font(.system(size: 13)).strikethrough(done).foregroundStyle(done ? Color.secondary : Color.primary).lineLimit(1)
                Text(sub).font(.system(size: 11)).foregroundStyle(Color.secondary).lineLimit(1)
            }
        }
    }

    private func chooseBackup() {
        (NSApp.delegate as? AppDelegate)?.closePopover()
        Task { @MainActor in Backup.shared.choose() }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            GlassGroup {
                HStack(spacing: 6) {
                    Button(I18n.t("打开节律")) { (NSApp.delegate as? AppDelegate)?.main?.show() }
                        .glassButton(prominent: true).tint(pal.accent)
                        .fixedSize() // 按钮文字完整显示，挤不下时让右边的同步时间换行
                    Button { Task { await engine.pull() } } label: {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    .glassButton()
                    .disabled(engine.syncing)
                    .help(I18n.t("立即同步"))
                    Menu {
                        Toggle(I18n.t("开机时自动启动"), isOn: Binding(get: { engine.launchAtLogin }, set: { engine.launchAtLogin = $0 }))
                        Divider()
                        if backup.enabled {
                            Section(I18n.t("iCloud 备份：{0}", backup.folderName)) {
                                if !backup.error.isEmpty { Text(backup.error) }
                                else if let t = backup.lastAt { Text(I18n.t("上次备份 {0}", t.formatted(date: .omitted, time: .shortened))) }
                                Button(I18n.t("在访达中显示")) { backup.reveal() }
                                Button(I18n.t("更换备份文件夹…")) { chooseBackup() }
                                Button(I18n.t("停止备份")) { backup.stop() }
                            }
                        } else {
                            Button(I18n.t("备份到 iCloud 云盘…")) { chooseBackup() }
                        }
                        Button(I18n.t("检查更新…")) { Task { await updater.check(manual: true) } }
                        Button(I18n.t("生成安装包…")) { updater.makeInstaller() }
                            .help(I18n.t("打包成 .dmg 放在桌面，可以直接发给别的 Mac"))
                        Divider()
                        Button(I18n.t("退出节律")) { NSApp.terminate(nil) }
                    } label: { Image(systemName: "ellipsis") }
                    .menuIndicator(.hidden)
                    .menuStyle(.button)
                    .glassButton()
                }
            }
            Spacer(minLength: 0)
            Text(engine.syncText).font(.system(size: 10)).foregroundStyle(Color.secondary).lineLimit(2).multilineTextAlignment(.trailing)
        }
        .controlSize(.regular)
    }
}
