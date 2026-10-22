import SwiftUI
import WidgetKit

/// 纪念日小组件：置顶（没有置顶就是最近的）一个日子大字显示；中、大尺寸再列出接下来的几个。
/// 和网页 js/days.js、安卓、iOS 小组件同一套算法和配色：未来 = 静蓝，过去 = 赭石，高亮色照用。
struct DaysWidget: Widget {
    var body: some WidgetConfiguration {
        _ = Shared.load()
        return StaticConfiguration(kind: "CadenceDays", provider: CalProvider()) { DaysView(entry: $0) }
            .configurationDisplayName(I18n.t("纪念日"))
            .description(I18n.t("置顶或最近的日子，以及接下来的几个"))
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
            .contentMarginsDisabled()
    }
}

struct DaysView: View {
    let entry: CalEntry
    @Environment(\.widgetFamily) private var family

    private struct Item { let x: CDay; let diff: Int }

    private func ordered() -> [Item] {
        let t = entry.today
        let all = entry.data.days.map { Item(x: $0, diff: $0.diff(t)) }
        let fut = all.filter { $0.diff >= 0 }.sorted { $0.diff < $1.diff }
        let past = all.filter { $0.diff < 0 }.sorted { $0.diff > $1.diff }
        let pin = all.filter { $0.x.pin }.max { $0.x.updatedAt < $1.x.updatedAt }
        guard let hero = pin ?? fut.first ?? past.first else { return [] }
        return [hero] + (fut + past).filter { $0.x.id != hero.x.id }
    }

    private func tone(_ i: Item, _ pal: Pal) -> Color {
        if !i.x.hl.isEmpty, let v = UInt32(i.x.hl.dropFirst(), radix: 16) {
            let c = 0xFF00_0000 | v
            return Color(argb: pal.dark ? lighten(c) : c)
        }
        return Color(argb: i.diff < 0 ? (pal.dark ? 0xFFE2_A673 : 0xFFB6_733B) : (pal.dark ? 0xFF8E_B0E6 : 0xFF47_76B4))
    }
    /// 深色背景上把高亮色提亮一点（和安卓小组件一致）
    private func lighten(_ c: UInt32) -> UInt32 {
        let r = Double((c >> 16) & 255), g = Double((c >> 8) & 255), b = Double(c & 255)
        let f = { (v: Double) -> UInt32 in UInt32(min(255, v + (255 - v) * 0.28)) }
        return 0xFF00_0000 | (f(r) << 16) | (f(g) << 8) | f(b)
    }
    private func amount(_ i: Item) -> (String, String) {
        let t = entry.today, x = i.x
        if i.diff == 0 { return (I18n.t("今天"), "") }
        let past = i.diff < 0, n = abs(i.diff) + (past && x.from1 ? 1 : 0)
        let a = past ? x.occ(t) : t, b = past ? t : x.occ(t)
        let comp = YMD.cal.dateComponents([.year, .month], from: a.date, to: b.date)
        let months = (comp.year ?? 0) * 12 + (comp.month ?? 0)
        if x.unit == "w" && n >= 7 { return ("\(n / 7)", I18n.t("周")) }
        if x.unit == "m" && months >= 1 { return ("\(months)", I18n.t("个月")) }
        if x.unit == "y" && (comp.year ?? 0) >= 1 { return ("\(comp.year ?? 0)", I18n.t("年")) }
        return ("\(n)", past && x.from1 && !I18n.zh ? "" : I18n.t("天"))
    }
    private func state(_ i: Item) -> String {
        i.diff == 0 ? I18n.t("就是今天") : i.diff > 0 ? I18n.t("还有") : i.x.from1 ? I18n.t("第") : I18n.t("已经")
    }
    private func dateLine(_ i: Item) -> String {
        let d = i.x.occ(entry.today)
        var s = I18n.zh ? "\(d.y)年" + I18n.md(d.m, d.d) : I18n.md(d.m, d.d) + ", \(d.y)"
        if !i.x.time.isEmpty { s += " " + i.x.time }
        if !i.x.rep.isEmpty { s += " · " + I18n.t(i.x.rep == "week" ? "每周" : i.x.rep == "month" ? "每月" : "每年") }
        return s
    }

    var body: some View {
        let list = ordered()
        WidgetShell(hash: list.first.map { "days-" + $0.x.id } ?? "days") { pal in
            Group {
                if list.isEmpty {
                    Text(entry.data.isEmpty ? I18n.t("打开节律 App\n同步一次后这里会显示事件") : I18n.t("还没有日子\n打开节律添加纪念日"))
                        .font(.system(size: 13)).foregroundStyle(pal.text2).multilineTextAlignment(.center).lineSpacing(3)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if family == .systemSmall {
                    hero(list[0], pal, big: false).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                } else if family == .systemMedium {
                    HStack(alignment: .top, spacing: 14) {
                        hero(list[0], pal, big: false).frame(width: 136, alignment: .leading)
                        Rectangle().fill(pal.line).frame(width: 0.5)
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(list.dropFirst().prefix(3).enumerated()), id: \.offset) { _, i in row(i, pal) }
                            Spacer(minLength: 0)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        hero(list[0], pal, big: true)
                        Rectangle().fill(pal.line).frame(height: 0.5).padding(.vertical, 10)
                        ForEach(Array(list.dropFirst().prefix(7).enumerated()), id: \.offset) { _, i in row(i, pal).padding(.bottom, 4) }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func hero(_ i: Item, _ pal: Pal, big: Bool) -> some View {
        let a = amount(i), col = tone(i, pal)
        return VStack(alignment: .leading, spacing: 0) {
            Text(i.x.named).font(.system(size: big ? 15 : 14, weight: .semibold)).foregroundStyle(pal.text).lineLimit(1)
            Text(state(i)).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(col).lineLimit(1).padding(.top, big ? 8 : 6).widgetAccentable()
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(a.0).font(.system(size: i.diff == 0 ? 30 : (big ? 52 : 42), weight: .bold, design: .rounded)).monospacedDigit()
                    .foregroundStyle(i.diff == 0 ? col : pal.text).lineLimit(1).minimumScaleFactor(0.5)
                if !a.1.isEmpty { Text(a.1).font(.system(size: 13, weight: .semibold)).foregroundStyle(pal.text2) }
            }
            Text(dateLine(i)).font(.system(size: 10.5)).foregroundStyle(pal.text2).lineLimit(1)
        }
    }

    private func row(_ i: Item, _ pal: Pal) -> some View {
        let a = amount(i), col = tone(i, pal)
        return Link(destination: Shared.openURL("days-" + i.x.id)) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2).fill(col).frame(width: 3.5, height: 26).widgetAccentable()
                VStack(alignment: .leading, spacing: 0) {
                    Text(i.x.named).font(.system(size: 12.5)).foregroundStyle(pal.text).lineLimit(1)
                    Text(state(i) + " · " + dateLine(i)).font(.system(size: 10)).foregroundStyle(pal.text2).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(a.0).font(.system(size: 16, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(col).lineLimit(1)
                if !a.1.isEmpty { Text(a.1).font(.system(size: 10)).foregroundStyle(pal.text2) }
            }
        }
    }
}
