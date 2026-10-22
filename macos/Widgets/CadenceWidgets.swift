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
        var times: Set<Date> = [now]
        for c in d.courses(on: today) {
            for m in [c.startMin, c.endMin] {
                let t = today.at(minutes: m)
                if t > now && t < midnight { times.insert(t) }
            }
        }
        // 课表上的「现在」线：白天每 10 分钟一格
        var t = YMD.cal.date(bySetting: .second, value: 0, of: now) ?? now
        while true {
            t = t.addingTimeInterval(600)
            if t >= midnight { break }
            let h = YMD.cal.component(.hour, from: t)
            if h >= 7 && h < 23 { times.insert(t) }
        }
        let exp = Shared.offsetExpiry("moff"), off = Shared.offset("moff")
        if let e = exp, e < midnight { times.insert(e) }
        let entries = times.sorted().map { t in
            CalEntry(date: t, data: d, weekStart: Shared.weekStart, moff: exp.map { t >= $0 } == true ? 0 : off)
        }
        completion(Timeline(entries: entries, policy: .after(midnight)))
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
    @ViewBuilder var content: (Pal) -> Content
    var body: some View {
        let pal = Pal(dark: scheme == .dark)
        content(pal)
            .containerBackground(for: .widget) { pal.bg }
            .widgetURL(Shared.openURL(hash))
    }
}
