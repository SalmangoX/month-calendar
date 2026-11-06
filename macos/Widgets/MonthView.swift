import AppIntents
#if os(macOS)
import AppKit
typealias PlatformFont = NSFont
#else
import UIKit
typealias PlatformFont = UIFont
#endif
import SwiftUI
import WidgetKit

/// 整月小组件：和 iOS、安卓的整月小组件同一个样式。
/// 只显示本月所在的几周（4–6 行），这几周里前后月份的日期显示为淡色；
/// 格子够高时显示色条，跨天的全天事件画成一整条；格子矮时显示彩色圆点；再矮只显示日期
struct MonthView: View {
    let entry: CalEntry

    #if os(macOS)
    // Mac 桌面上看得比手机远，字和色条比 iOS / 安卓大一档（样式不变）
    private static let headH: CGFloat = 26, wdH: CGFloat = 15, topPad: CGFloat = 4, sp: CGFloat = 0.6
    private static let slot: CGFloat = 16.5, chipH: CGFloat = 15.5, dateH: CGFloat = 18, cellTop: CGFloat = 1.5
    private static let dateFS: CGFloat = 12.5, chipFS: CGFloat = 10.5, wdFS: CGFloat = 10, chipR: CGFloat = 3.5
    #else
    // iPhone：和网页版的 Scriptable 小组件同一套尺寸（字小一号、细，色条矮），手机上看着清爽不挤
    private static let headH: CGFloat = 19, wdH: CGFloat = 12, topPad: CGFloat = 3, sp: CGFloat = 0.5
    private static let slot: CGFloat = 14, chipH: CGFloat = 13, dateH: CGFloat = 15, cellTop: CGFloat = 2.5 // 和 Scriptable 版一样：色条 13、日期行 15
    private static let dateFS: CGFloat = 11, chipFS: CGFloat = 9, wdFS: CGFloat = 8, chipR: CGFloat = 3
    #endif

    /// 每格能放几条事件：≥1 显示色条；0 显示圆点；-1 只显示日期
    private static func capacity(_ cell: CGFloat) -> Int {
        let room = cell - cellTop - dateH
        let cap = Int(((room - 0.5) / slot).rounded(.down))
        if cap >= 1 { return min(cap, 3) }
        return room >= 7 ? 0 : -1
    }

    var body: some View {
        WidgetShell { pal in
            GeometryReader { g in
                let W = g.size.width, H = g.size.height
                let today = entry.today
                let ym = today.firstOfMonth.addingMonths(entry.moff)
                let days = monthGrid(ym, weekStart: entry.weekStart)
                let rows = (days.lastIndex { $0.m == ym.m } ?? 34) / 7 + 1 // 本月占几周就显示几行
                let cw = (W - 6 * MonthView.sp) / 7
                let rowH = (H - MonthView.topPad - MonthView.headH - MonthView.wdH - CGFloat(rows) * MonthView.sp) / CGFloat(rows)
                let cap = MonthView.capacity(rowH)
                VStack(spacing: 0) {
                    header(ym, pal)
                    HStack(spacing: MonthView.sp) {
                        ForEach(0..<7, id: \.self) { k in
                            Text(I18n.wdHead((k + entry.weekStart) % 7)).font(.system(size: MonthView.wdFS, weight: .medium)).foregroundStyle(pal.text2).frame(width: cw)
                        }
                    }
                    .frame(height: MonthView.wdH)
                    VStack(spacing: MonthView.sp) {
                        ForEach(0..<rows, id: \.self) { r in
                            week(Array(days[r * 7..<r * 7 + 7]), ym: ym, today: today, cap: cap, cw: cw, rowH: rowH, pal: pal)
                        }
                    }
                    .padding(.top, MonthView.sp)
                    // 格子不铺底色，整个小组件只有一层底（系统的小组件底）；分隔线单独画在格子之间的缝里。只画每周之间的横线，每天之间不画竖线（用户定的）【联动:小组件格线】
                    // 以前每格自己铺底色、缝里露出线的颜色，深色模式下系统给小组件底的颜色和格子的底不一样，上面的标题栏就成了一条色差
                    .background {
                        Canvas { ctx, size in
                            let sp = MonthView.sp
                            for r in 0..<rows { ctx.fill(Path(CGRect(x: 0, y: CGFloat(r) * (rowH + sp), width: size.width, height: sp)), with: .color(pal.line)) }
                        }
                    }
                }
                .padding(.top, MonthView.topPad)
            }
        }
    }

    #if os(iOS)
    /// iPhone：和 Scriptable 小组件一样——左边年份，中间主色的月份，右边本月完成数；翻月的小箭头放在最右边
    private func header(_ ym: YMD, _ pal: Pal) -> some View {
        let st = monthStats(ym)
        return ZStack {
            Text(I18n.mon(ym.m)).font(.system(size: 12.5, weight: .bold)).foregroundStyle(pal.text).accentable()
            HStack(spacing: 0) {
                Text(String(ym.y)).font(.system(size: 9, weight: .medium)).foregroundStyle(pal.text2)
                Spacer(minLength: 0)
                if entry.moff != 0 {
                    Button(intent: ShiftMonthIntent(delta: 0)) {
                        Text(I18n.t("本月")).font(.system(size: 9, weight: .bold)).foregroundStyle(pal.text)
                            .padding(.horizontal, 5).frame(height: MonthView.headH).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).accentable()
                } else if st.1 > 0 {
                    Text("\(st.0)/\(st.1)").font(.system(size: 9, weight: .medium)).monospacedDigit().foregroundStyle(pal.text2).padding(.trailing, 3)
                }
                ForEach([-1, 1], id: \.self) { k in
                    Button(intent: ShiftMonthIntent(delta: k)) {
                        Image(systemName: k < 0 ? "chevron.left" : "chevron.right")
                            .font(.system(size: 9, weight: .semibold)).foregroundStyle(pal.text2.opacity(0.8))
                            .frame(width: 22, height: MonthView.headH).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.leading, 10).padding(.trailing, 2)
        .frame(height: MonthView.headH)
    }

    /// 本月的事件：完成了几个 / 一共几个（右上角显示）
    private func monthStats(_ ym: YMD) -> (Int, Int) {
        var seen = Set<String>(), done = 0
        var day = ym
        while day.m == ym.m {
            for e in entry.data.on(day) where seen.insert(e.id).inserted { if e.done { done += 1 } }
            day = day.adding(1)
        }
        return (done, seen.count)
    }
    #else
    private func header(_ ym: YMD, _ pal: Pal) -> some View {
        HStack(spacing: 0) {
            Text(I18n.mon(ym.m)).font(.system(size: 14, weight: .bold)).foregroundStyle(pal.text).accentable()
            Text(String(ym.y)).font(.system(size: 10.5)).foregroundStyle(pal.text2).padding(.leading, 5)
            Spacer(minLength: 0)
            if entry.moff != 0 {
                Button(intent: ShiftMonthIntent(delta: 0)) {
                    Text(I18n.t("本月")).font(.system(size: 11, weight: .bold)).foregroundStyle(pal.text)
                        .padding(.leading, 8).padding(.trailing, 6).frame(height: MonthView.headH).contentShape(Rectangle())
                }
                .buttonStyle(.plain).accentable()
            }
            ForEach([-1, 1], id: \.self) { k in
                Button(intent: ShiftMonthIntent(delta: k)) {
                    Image(systemName: k < 0 ? "chevron.left" : "chevron.right")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(pal.text2)
                        .frame(width: 34, height: MonthView.headH).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 11).padding(.trailing, 2)
        .frame(height: MonthView.headH)
    }
    #endif

    @ViewBuilder
    private func week(_ wk: [YMD], ym: YMD, today: YMD, cap: Int, cw: CGFloat, rowH: CGFloat, pal: Pal) -> some View {
        let d = entry.data
        let lay = WeekLanes.lay(wk.map { d.on($0) })
        let lim = (0..<7).map { min(lay.occ[$0].count, max(cap, 0)) }
        let segs = cap >= 1 ? lay.segments(lim, week0: wk[0]) : []
        ZStack(alignment: .topLeading) {
            HStack(spacing: MonthView.sp) {
                ForEach(0..<7, id: \.self) { k in
                    cell(wk[k], occ: lay.occ[k], lim: lim[k], ym: ym, today: today, cap: cap, cw: cw, rowH: rowH, pal: pal)
                        .frame(width: cw, height: rowH, alignment: .topLeading)
                        // 底色铺满整格（只盖住日期那一行时，下面会露出分隔线的灰色）
                        .background { if wk[k] == today { RoundedRectangle(cornerRadius: 7, style: .continuous).fill(pal.todayTint).padding(1.5) } } // 今天：圆角的品牌渐变淡底（和 App 一样）
                        .clipped()
                }
            }
            ForEach(Array(segs.enumerated()), id: \.offset) { _, s in
                bar(s, wk: wk, ym: ym, cw: cw, pal: pal)
            }
        }
        .frame(height: rowH)
        .clipped()
    }

    /// 时间行的高度、字号
    #if os(macOS)
    private static let timeH: CGFloat = 11, timeFS: CGFloat = 9
    #else
    private static let timeH: CGFloat = 9, timeFS: CGFloat = 7.5
    #endif

    /// 色条下面那一行时间：放得下完整时间段就写时间段，否则只写开始时间
    private func timeText(_ e: CEvent, width: CGFloat, h12: Bool) -> String {
        let full = e.endTime.isEmpty ? fmtTime(e.time, h12, false) : fmtRange(e.time, e.endTime, h12)
        let w = (full as NSString).size(withAttributes: [.font: PlatformFont.systemFont(ofSize: MonthView.timeFS, weight: .medium)]).width
        return w <= width ? full : fmtTime(e.time, h12, false)
    }

    private func cell(_ day: YMD, occ: [WeekLanes.Slot], lim: Int, ym: YMD, today: YMD, cap: Int, cw: CGFloat, rowH: CGFloat, pal: Pal) -> some View {
        let d = entry.data
        let isToday = day == today, inMonth = day.m == ym.m
        let hidden = cap >= 1 ? occ.dropFirst(lim).filter { !$0.isEmpty }.count : 0
        // 有时间的事件：格子里剩下的高度够，就在色条下面加一行时间（和应用一致），否则色条右端点一个小点。
        // 时间行会把下面的事件往下挤，所以只给最后一条跨天横条下面的事件加（横条按行号叠在上面）
        let lastBar = (0..<lim).last(where: { s -> Bool in if case .bar = occ[s] { return true }; return false }) ?? -1
        let timedSlots = Set((0..<lim).filter { (s: Int) -> Bool in
            guard s > lastBar, case .event(let e) = occ[s] else { return false }
            return !e.time.isEmpty
        })
        let room = rowH - MonthView.cellTop - MonthView.dateH - 0.5
        let withTime = cap >= 1 && hidden == 0 && !timedSlots.isEmpty
            && CGFloat(lim) * MonthView.slot + CGFloat(timedSlots.count) * MonthView.timeH <= room
        let dots = cap == 0 ? Array(d.on(day).filter { !$0.done }.prefix(3)) : []
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Text("\(day.d)")
                    .font(.system(size: MonthView.dateFS, weight: MonthView.dateWeight(isToday, glass: pal.glass)))
                    .foregroundStyle(isToday ? Color.white : inMonth ? pal.text : pal.dim)
                    .padding(.horizontal, 3)
                    .frame(minWidth: MonthView.dateH, minHeight: MonthView.dateH, maxHeight: MonthView.dateH)
                    .background { if isToday { RoundedRectangle(cornerRadius: MonthView.dateH / 2).fill(pal.todayStyle).accentable() } }
                    .padding(.leading, 2)
                Spacer(minLength: 0)
                if hidden > 0 {
                    // 今天还有放不下的事：用主色小标签，比其他日子的灰色「+n」醒目
                    Text(isToday ? " +\(hidden) " : "+\(hidden)")
                        .font(.system(size: MonthView.chipFS - 1, weight: isToday ? .bold : .medium))
                        .foregroundStyle(isToday ? Color.white : pal.text2)
                        .background { if isToday { RoundedRectangle(cornerRadius: 5).fill(pal.todayStyle) } }
                        .padding(.trailing, 2)
                        .lineLimit(1)
                }
            }
            .frame(height: MonthView.dateH)
            if cap >= 1 {
                ForEach(0..<lim, id: \.self) { s in
                    switch occ[s] {
                    case .event(let e):
                        VStack(alignment: .leading, spacing: 0) {
                            chip(e, soft: e.done || !inMonth, out: !inMonth, width: cw - 2, pal: pal, tm: !e.time.isEmpty && !(withTime && timedSlots.contains(s)))
                            if withTime && timedSlots.contains(s) {
                                Text(timeText(e, width: cw - 5, h12: d.h12))
                                    .font(.system(size: MonthView.timeFS, weight: .medium))
                                    .monospacedDigit()
                                    .foregroundStyle(pal.text2)
                                    .opacity(e.done || !inMonth ? 0.5 : 1)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.85)
                                    .padding(.leading, 3)
                                    .frame(width: cw, height: MonthView.timeH, alignment: .leading)
                            }
                        }
                    default: Color.clear.frame(height: MonthView.chipH) // 占位，让下面的事件和横条对齐
                    }
                }
                .padding(.top, 1)
            } else if !dots.isEmpty {
                HStack(spacing: 2) {
                    ForEach(Array(dots.enumerated()), id: \.offset) { _, e in
                        Circle().fill(pal.ink(pal.base(e, d))).frame(width: 5, height: 5)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 1)
            }
        }
        .padding(.top, MonthView.cellTop)
    }

    /// 日期的字重：Mac 照旧（今天只在玻璃样式下加粗）；iPhone 和 Scriptable 一样，日期中等粗、今天加粗
    private static func dateWeight(_ isToday: Bool, glass: Bool) -> Font.Weight {
        #if os(macOS)
        return isToday && glass ? .bold : .regular
        #else
        return isToday ? .bold : .medium
        #endif
    }

    /// 色条上的字：Mac 粗体；iPhone 和 Scriptable 一样用半粗，小字不糊
    #if os(macOS)
    private static let chipW: Font.Weight = .bold
    #else
    private static let chipW: Font.Weight = .semibold
    #endif

    /// 文字末尾 6pt 渐隐（宽度 w 内）
    static func fade(_ w: CGFloat) -> LinearGradient {
        LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: max(0, 1 - 6 / w)), .init(color: .clear, location: 1)],
                       startPoint: .leading, endPoint: .trailing)
    }

    /// tm：有具体时间但放不下时间行 → 色条右端一个小点（和应用一致）
    // 【联动:优先级色条】见 CLAUDE.md「联动分组」
    private func chip(_ e: CEvent, soft: Bool, out: Bool = false, width: CGFloat, pal: Pal, tm: Bool = false) -> some View {
        let ink = pal.chip(e, entry.data, soft: soft, out: out).1
        return Text(e.displayTitle)
            .font(.system(size: MonthView.chipFS, weight: pal.dark ? .medium : MonthView.chipW))
            .strikethrough(e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, 1.5)
            .frame(width: max(0, width - (tm ? 7 : 0) - 1.5), height: MonthView.chipH, alignment: .leading)
            .clipped()
            .mask(MonthView.fade(max(1, width - (tm ? 7 : 0) - 1.5)))   // 放不下的字在色条里面渐隐，不再一刀切到边上（像冲出格子）
            .frame(width: width, height: MonthView.chipH, alignment: .leading)
            .overlay(alignment: .trailing) {
                if tm { Circle().fill(ink).frame(width: 3.5, height: 3.5).opacity(0.75).padding(.trailing, 3) }
            }
            .background(RoundedRectangle(cornerRadius: MonthView.chipR).fill(pal.chipFill(e, entry.data, soft: soft, out: out)))
            .padding(.horizontal, 1)
            .accentable()
    }

    /// 跨天横条：和格子里的色条同样的颜色、圆角、字号；延续到上一周 / 下一周的一端是平的
    private func bar(_ s: WeekLanes.Seg, wk: [YMD], ym: YMD, cw: CGFloat, pal: Pal) -> some View {
        let out = !(s.a...s.b).contains { wk[$0].m == ym.m }
        let ink = pal.chip(s.e, entry.data, soft: s.e.done || out, out: out).1
        let x0 = CGFloat(s.a) * (cw + MonthView.sp) + (s.openL ? 0 : 1)
        let x1 = CGFloat(s.b) * (cw + MonthView.sp) + cw - (s.openR ? 0 : 1)
        let y = MonthView.cellTop + MonthView.dateH + 1 + CGFloat(s.slot) * MonthView.slot
        let rl: CGFloat = s.openL ? 0 : MonthView.chipR, rr: CGFloat = s.openR ? 0 : MonthView.chipR
        return Text(s.e.displayTitle)
            .font(.system(size: MonthView.chipFS, weight: pal.dark ? .medium : MonthView.chipW))
            .strikethrough(s.e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, 2.5)
            .frame(width: max(0, x1 - x0 - (s.openR ? 0 : 1.5)), height: MonthView.chipH, alignment: .leading)
            .clipped()
            .mask(MonthView.fade(max(1, x1 - x0 - (s.openR ? 0 : 1.5))))
            .frame(width: max(0, x1 - x0), height: MonthView.chipH, alignment: .leading)
            .background(UnevenRoundedRectangle(topLeadingRadius: rl, bottomLeadingRadius: rl, bottomTrailingRadius: rr, topTrailingRadius: rr).fill(pal.chipFill(s.e, entry.data, soft: s.e.done || out, out: out)))
            .accentable()
            .offset(x: x0, y: y)
    }
}
