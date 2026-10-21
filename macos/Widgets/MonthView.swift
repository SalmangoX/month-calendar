import AppIntents
import SwiftUI
import WidgetKit

/// 整月小组件：和 iOS、安卓的整月小组件同一个样式。
/// 只显示本月所在的几周（4–6 行），这几周里前后月份的日期显示为淡色；
/// 格子够高时显示色条，跨天的全天事件画成一整条；格子矮时显示彩色圆点；再矮只显示日期
struct MonthView: View {
    let entry: CalEntry

    private static let headH: CGFloat = 26, wdH: CGFloat = 15, topPad: CGFloat = 4, sp: CGFloat = 0.6
    // Mac 桌面上看得比手机远，字和色条比 iOS / 安卓大一档（样式不变）
    private static let slot: CGFloat = 16.5, chipH: CGFloat = 15.5, dateH: CGFloat = 18, cellTop: CGFloat = 1.5

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
                            Text(I18n.wdHead((k + entry.weekStart) % 7)).font(.system(size: 10)).foregroundStyle(pal.text2).frame(width: cw)
                        }
                    }
                    .frame(height: MonthView.wdH)
                    VStack(spacing: MonthView.sp) {
                        ForEach(0..<rows, id: \.self) { r in
                            week(Array(days[r * 7..<r * 7 + 7]), ym: ym, today: today, cap: cap, cw: cw, rowH: rowH, pal: pal)
                        }
                    }
                    .padding(.top, MonthView.sp)
                    .background(pal.line)
                }
                .padding(.top, MonthView.topPad)
            }
        }
    }

    private func header(_ ym: YMD, _ pal: Pal) -> some View {
        HStack(spacing: 0) {
            Text(I18n.mon(ym.m)).font(.system(size: 14, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
            Text(String(ym.y)).font(.system(size: 10.5)).foregroundStyle(pal.text2).padding(.leading, 5)
            Spacer(minLength: 0)
            if entry.moff != 0 {
                Button(intent: ShiftMonthIntent(delta: 0)) {
                    Text(I18n.t("本月")).font(.system(size: 11, weight: .bold)).foregroundStyle(pal.accent)
                        .padding(.leading, 8).padding(.trailing, 6).frame(height: MonthView.headH).contentShape(Rectangle())
                }
                .buttonStyle(.plain).widgetAccentable()
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

    @ViewBuilder
    private func week(_ wk: [YMD], ym: YMD, today: YMD, cap: Int, cw: CGFloat, rowH: CGFloat, pal: Pal) -> some View {
        let d = entry.data
        let lay = WeekLanes.lay(wk.map { d.on($0) })
        let lim = (0..<7).map { min(lay.occ[$0].count, max(cap, 0)) }
        let segs = cap >= 1 ? lay.segments(lim, week0: wk[0]) : []
        ZStack(alignment: .topLeading) {
            HStack(spacing: MonthView.sp) {
                ForEach(0..<7, id: \.self) { k in
                    cell(wk[k], occ: lay.occ[k], lim: lim[k], ym: ym, today: today, cap: cap, cw: cw, pal: pal)
                        .frame(width: cw, height: rowH, alignment: .topLeading)
                        // 底色铺满整格（只盖住日期那一行时，下面会露出分隔线的灰色）
                        .background { ZStack { pal.bg; if wk[k] == today { pal.todayCell } } }
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

    private func cell(_ day: YMD, occ: [WeekLanes.Slot], lim: Int, ym: YMD, today: YMD, cap: Int, cw: CGFloat, pal: Pal) -> some View {
        let d = entry.data
        let isToday = day == today, inMonth = day.m == ym.m
        let hidden = cap >= 1 ? occ.dropFirst(lim).filter { !$0.isEmpty }.count : 0
        let dots = cap == 0 ? Array(d.on(day).filter { !$0.done }.prefix(3)) : []
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Text("\(day.d)")
                    .font(.system(size: 12.5))
                    .foregroundStyle(isToday ? Color.white : inMonth ? pal.text : pal.dim)
                    .padding(.horizontal, 3)
                    .frame(minWidth: 18, minHeight: MonthView.dateH, maxHeight: MonthView.dateH)
                    .background { if isToday { RoundedRectangle(cornerRadius: 9).fill(pal.accent).widgetAccentable() } }
                    .padding(.leading, 2)
                Spacer(minLength: 0)
                if hidden > 0 {
                    // 今天还有放不下的事：用主色小标签，比其他日子的灰色「+n」醒目
                    Text(isToday ? " +\(hidden) " : "+\(hidden)")
                        .font(.system(size: 9))
                        .foregroundStyle(isToday ? Color.white : pal.text2)
                        .background { if isToday { RoundedRectangle(cornerRadius: 5).fill(pal.accent) } }
                        .padding(.trailing, 2)
                        .lineLimit(1)
                }
            }
            .frame(height: MonthView.dateH)
            if cap >= 1 {
                ForEach(0..<lim, id: \.self) { s in
                    switch occ[s] {
                    case .event(let e): chip(e, soft: e.done || !inMonth, width: cw - 2, pal: pal)
                    default: Color.clear.frame(height: MonthView.chipH) // 占位，让下面的事件和横条对齐
                    }
                }
                .padding(.top, 1)
            } else if !dots.isEmpty {
                HStack(spacing: 2) {
                    ForEach(Array(dots.enumerated()), id: \.offset) { _, e in
                        Circle().fill(Color(argb: pal.base(e, d))).frame(width: 5, height: 5)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 1)
            }
        }
        .padding(.top, MonthView.cellTop)
    }

    private func chip(_ e: CEvent, soft: Bool, width: CGFloat, pal: Pal) -> some View {
        let (fill, ink) = pal.chip(e, entry.data, soft: soft)
        return Text(e.displayTitle)
            .font(.system(size: 10.5, weight: pal.dark ? .medium : .bold))
            .strikethrough(e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, 1.5)
            .frame(width: width, height: MonthView.chipH, alignment: .leading)
            .clipped()
            .background(RoundedRectangle(cornerRadius: 3.5).fill(fill))
            .padding(.horizontal, 1)
            .widgetAccentable()
    }

    /// 跨天横条：和格子里的色条同样的颜色、圆角、字号；延续到上一周 / 下一周的一端是平的
    private func bar(_ s: WeekLanes.Seg, wk: [YMD], ym: YMD, cw: CGFloat, pal: Pal) -> some View {
        let out = !(s.a...s.b).contains { wk[$0].m == ym.m }
        let (fill, ink) = pal.chip(s.e, entry.data, soft: s.e.done || out)
        let x0 = CGFloat(s.a) * (cw + MonthView.sp) + (s.openL ? 0 : 1)
        let x1 = CGFloat(s.b) * (cw + MonthView.sp) + cw - (s.openR ? 0 : 1)
        let y = MonthView.cellTop + MonthView.dateH + 1 + CGFloat(s.slot) * MonthView.slot
        let rl: CGFloat = s.openL ? 0 : 3.5, rr: CGFloat = s.openR ? 0 : 3.5
        return Text(s.e.displayTitle)
            .font(.system(size: 10.5, weight: pal.dark ? .medium : .bold))
            .strikethrough(s.e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, 2.5)
            .frame(width: max(0, x1 - x0), height: MonthView.chipH, alignment: .leading)
            .clipped()
            .background(UnevenRoundedRectangle(topLeadingRadius: rl, bottomLeadingRadius: rl, bottomTrailingRadius: rr, topTrailingRadius: rr).fill(fill))
            .widgetAccentable()
            .offset(x: x0, y: y)
    }
}
