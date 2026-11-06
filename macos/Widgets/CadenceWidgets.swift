import AppIntents
import SwiftUI
import WidgetKit

/// 三种桌面小组件，和安卓、网页同一套样式；深浅色跟随系统，macOS 26 的「清透 / 着色」样式下由系统换成玻璃
@main
struct CadenceWidgets: WidgetBundle {
    var body: some Widget {
        MonthWidget()
        TodayWidget()
        SchedWidget()
        DaysWidget()
    }
}

struct CalEntry: TimelineEntry {
    let date: Date
    let data: CalData
    let weekStart: Int
    let moff: Int
    var today: YMD { YMD(date) }
}

/// 什么时候刷新：午夜换日、课表的上下课时间、翻月 30 分钟后回到本月；数据变化时 App 会主动刷新
struct CalProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalEntry {
        CalEntry(date: Date(), data: CalData.parse(""), weekStart: 0, moff: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalEntry) -> Void) {
        completion(CalEntry(date: Date(), data: Shared.load(), weekStart: Shared.weekStart, moff: Shared.offset("moff")))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalEntry>) -> Void) {
        let now = Date(), d = Shared.load(), today = YMD(now)
        let midnight = today.adding(1).date.addingTimeInterval(2)
        // 一次只排接下来 3 小时（不再一口气排到午夜）：之前白天每 10 分钟一条、一天 90 多条，
        // 系统要把每一条都预先画好，大尺寸课表很容易超出小组件进程的内存 / 时间限制被系统结束，
        // App 退出后就只剩灰色的占位图。到点后系统会再来要下一段。
        let horizon = min(midnight, now.addingTimeInterval(3 * 3600))
        var times: Set<Date> = [now]
        for c in d.courses(on: today) {
            for m in [c.startMin, c.endMin] {
                let t = today.at(minutes: m)
                if t > now && t < horizon { times.insert(t) }
            }
        }
        // 课表上的「现在」线：白天每 10 分钟一格
        var t = YMD.cal.date(bySetting: .second, value: 0, of: now) ?? now
        while true {
            t = t.addingTimeInterval(600)
            if t >= horizon { break }
            let h = YMD.cal.component(.hour, from: t)
            if h >= 7 && h < 23 { times.insert(t) }
        }
        let exp = Shared.offsetExpiry("moff"), off = Shared.offset("moff")
        if let e = exp, e < horizon { times.insert(e) }
        let ws = Shared.weekStart
        let entries = times.sorted().map { t in
            CalEntry(date: t, data: d, weekStart: ws, moff: exp.map { t >= $0 } == true ? 0 : off)
        }
        completion(Timeline(entries: entries, policy: .after(horizon)))
    }
}

/// 整月小组件右上角的 ‹ › 和「本月」
struct ShiftMonthIntent: AppIntent {
    static var title: LocalizedStringResource = "Change month"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Delta") var delta: Int

    init() {}
    init(delta: Int) { self.delta = delta }

    func perform() async throws -> some IntentResult {
        Shared.setOffset("moff", delta == 0 ? 0 : Shared.offset("moff") + delta)
        return .result()
    }
}

struct MonthWidget: Widget {
    var body: some WidgetConfiguration {
        _ = Shared.load() // 语言跟着同步数据
        return StaticConfiguration(kind: "CadenceMonth", provider: CalProvider()) { MonthView(entry: $0) }
            .configurationDisplayName(I18n.t("整月"))
            .description(I18n.t("整月日历，右上角可以翻月"))
            .supportedFamilies([.systemMedium, .systemLarge, .systemExtraLarge])
            .contentMarginsDisabled()
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        _ = Shared.load()
        return StaticConfiguration(kind: "CadenceToday", provider: CalProvider()) { TodayView(entry: $0) }
            .configurationDisplayName(I18n.t("今日"))
            .description(I18n.t("今天、已逾期和接下来一周"))
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
            .contentMarginsDisabled()
    }
}

struct SchedWidget: Widget {
    var body: some WidgetConfiguration {
        _ = Shared.load()
        return StaticConfiguration(kind: "CadenceSched", provider: CalProvider()) { SchedView(entry: $0) }
            .configurationDisplayName(I18n.t("课表"))
            .description(I18n.t("小尺寸：今天的课；中尺寸：本周；大尺寸：本周课表"))
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
            .contentMarginsDisabled()
    }
}

/// 小组件统一的底色和点按行为
struct WidgetShell<Content: View>: View {
    var hash = ""
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetRenderingMode) private var mode
    @ViewBuilder var content: (Pal) -> Content
    var body: some View {
        // 透明 / 着色样式（系统设置 → 外观 → 图标和小组件样式）：所有颜色被画成白色，内容换成玻璃配色才看得清
        // 默认（彩色）样式下 macOS 不让桌面小组件透出壁纸（实测：透明背景会被画成纯黑，不声明背景直接报错），
        // 所以这里照旧用自己的底色；系统的液态玻璃只在「透明 / 着色」样式下出现，那时 containerBackground 这层会被换成玻璃
        let pal = Pal(dark: scheme == .dark, glass: mode != .fullColor)
        content(pal)
            // 彩色样式下自己再铺一层同样的底色：iPhone 深色模式下系统会把 containerBackground 画得比这个颜色亮一点，
            // 只有它露出来的地方（标题栏）就和下面的格子差了一截颜色
            .background { if !pal.glass { pal.bg } }
            .containerBackground(for: .widget) { pal.bg }
            .widgetURL(Shared.openURL(hash))
    }
}

extension View {
    /// 着色 / 透明样式下哪些部分算「强调色」。Mac 上不分：系统会把强调的那组画成系统强调色（多彩时就是蓝色），
    /// 整个小组件就变成一片蓝；不分组时全部画成中性的白 / 灰。iPhone 照旧分组（着色是用户自己挑的颜色）
    @ViewBuilder func accentable() -> some View {
        #if os(macOS)
        self
        #else
        self.widgetAccentable()
        #endif
    }
}
