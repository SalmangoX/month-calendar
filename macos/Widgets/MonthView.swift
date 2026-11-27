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
    private static let headH: CGFloat = 32, wdH: CGFloat = 16, topPad: CGFloat = 4, sp: CGFloat = 0.6
    private static let slot: CGFloat = 16.5, chipH: CGFloat = 15.5, dateH: CGFloat = 18, cellTop: CGFloat = 1.5
    private static let dateFS: CGFloat = 12.5, chipFS: CGFloat = 10.5, wdFS: CGFloat = 10, chipR: CGFloat = 6.5
    private static let titleFS: CGFloat = 20, browFS: CGFloat = 9.5, headPad: CGFloat = 12
    #else
    // iPhone：和网页版的 Scriptable 小组件同一套尺寸（字小一号、细，色条矮），手机上看着清爽不挤
    private static let headH: CGFloat = 23, wdH: CGFloat = 12, topPad: CGFloat = 3, sp: CGFloat = 0.5
    private static let slot: CGFloat = 14, chipH: CGFloat = 13, dateH: CGFloat = 15, cellTop: CGFloat = 2.5 // 和 Scriptable 版一样：色条 13、日期行 15
    private static let dateFS: CGFloat = 11, chipFS: CGFloat = 9, wdFS: CGFloat = 8, chipR: CGFloat = 5.5
    private static let titleFS: CGFloat = 16, browFS: CGFloat = 7.5, headPad: CGFloat = 10
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
                        // 和 App 标题板底下的星期一行一样：半粗、拉开字距，周末更淡，今天那一列更深【联动:顶部悬浮】
                        ForEach(0..<7, id: \.self) { k in
                            let wd = (k + entry.weekStart) % 7, td = entry.moff == 0 && wd == today.jsDay
                            Text(I18n.wdHead(wd)).font(.system(size: MonthView.wdFS, weight: td ? .heavy : .semibold)).tracking(MonthView.wdFS * 0.08)
                                .foregroundStyle(td ? pal.text : pal.text2).opacity(td || (wd != 0 && wd != 6) ? 1 : 0.55).frame(width: cw)
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
                    .overlay { seams(days, ym: ym, rows: rows, cw: cw, rowH: rowH, pal: pal) }
                }
                .padding(.top, MonthView.topPad)
            }
        }
    }

    /// 标题：和 App 的标题板同一套「编辑式」版式（用户选的 B）——左边大号粗体月份（中文写汉字「十一月」），
    /// 同一条基线上跟一行拉开字距的小眉题「2026　第 48 周」（本月时是今天那一周；翻到别的月份只写年份）；
    /// 右边：iPhone 本月完成数、翻到别的月份时一颗浅色「本月」胶囊、‹ ›【联动:顶部悬浮】
    private func header(_ ym: YMD, _ pal: Pal) -> some View {
        let wk = entry.moff == 0 ? Calendar(identifier: .iso8601).component(.weekOfYear, from: entry.today.date) : 0
        #if os(macOS)
        let btnFS: CGFloat = 11, chevW: CGFloat = 34
        #else
        let btnFS: CGFloat = 9, chevW: CGFloat = 22
        let st = entry.moff == 0 ? monthStats(ym) : (0, 0)
        #endif
        return HStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: MonthView.titleFS * 0.45) {
                Text(I18n.monTitle(ym.m)).font(.system(size: MonthView.titleFS, weight: .heavy)).tracking(-MonthView.titleFS * 0.04)
                    .foregroundStyle(pal.text).accentable()
                Text(I18n.eyebrow(ym.y, wk)).font(.system(size: MonthView.browFS, weight: .semibold)).tracking(MonthView.browFS * 0.16)
                    .monospacedDigit().foregroundStyle(pal.text2)
            }
            .lineLimit(1)
            Spacer(minLength: 4)
            #if os(iOS)
            if st.1 > 0 {
                Text("\(st.0)/\(st.1)").font(.system(size: 9, weight: .medium)).monospacedDigit().foregroundStyle(pal.text2).padding(.trailing, 3)
            }
            #endif
            if entry.moff != 0 {
                // 和 App 标题板右边的「今天」一样：正文色 6% 的浅色胶囊
                Button(intent: ShiftMonthIntent(delta: 0)) {
                    Text(I18n.t("本月")).font(.system(size: btnFS, weight: .semibold)).foregroundStyle(pal.text)
                        .padding(.horizontal, btnFS * 0.75).frame(height: btnFS * 1.9)
                        .background(Capsule().fill(pal.text.opacity(0.06)))
                        .frame(height: MonthView.headH).contentShape(Rectangle())
                }
                .buttonStyle(.plain).accentable()
            }
            ForEach([-1, 1], id: \.self) { k in
                Button(intent: ShiftMonthIntent(delta: k)) {
                    Image(systemName: k < 0 ? "chevron.left" : "chevron.right")
                        .font(.system(size: btnFS, weight: .semibold)).foregroundStyle(pal.text2.opacity(0.8))
                        .frame(width: chevW, height: MonthView.headH).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, MonthView.headPad).padding(.trailing, 2)
        .frame(height: MonthView.headH)
    }

    #if os(iOS)
    /// 本月的事件：完成了几个 / 一共几个（右上角显示）
    private func monthStats(_ ym: YMD) -> (Int, Int) {
        var seen = Set<String>(), done = 0
        var day = ym
        while day.m == ym.m {
            for e in entry.data.on(day) where !e.noDone && seen.insert(e.id).inserted { if e.done { done += 1 } }   // 无需完成的、纪念日不算
            day = day.adding(1)
        }
        return (done, seen.count)
    }
    #endif

    /// 月份交界线：和 App 一样，只在本月和上 / 下个月交界处画一根 Cadence logo 渐变（#9E9AC8 → #C7B3CF → #EBC7A6）的细实线，
    /// 阶梯形（calendar.js 的 drawFrame / seam）；只有一行里两个月都有时才画，最后一行贴着小组件底边的那一段不画。小组件里不流动
    private func seams(_ days: [YMD], ym: YMD, rows: Int, cw: CGFloat, rowH: CGFloat, pal: Pal) -> some View {
        let sp = MonthView.sp
        let a = days.firstIndex { $0.m == ym.m } ?? 0
        let b = (days.lastIndex { $0.m == ym.m } ?? 0) + 1
        return Canvas { ctx, size in
            let X = { (c: Int) -> CGFloat in CGFloat(c) * (cw + sp) - sp / 2 }
            let Y = { (r: Int) -> CGFloat in CGFloat(r) * (rowH + sp) + sp / 2 }
            var p = Path()
            if a % 7 != 0 {   // 第一行左边是上个月：沿上个月那几格的底边 → 交界处上到这一行的顶 → 沿本月的顶边到最右
                p.move(to: CGPoint(x: 0, y: Y(1))); p.addLine(to: CGPoint(x: X(a), y: Y(1)))
                p.addLine(to: CGPoint(x: X(a), y: Y(0))); p.addLine(to: CGPoint(x: size.width, y: Y(0)))
            }
            if b % 7 != 0 && b / 7 < rows {   // 最后一行右边是下个月：交界处从底边上到这一行的顶 → 沿下个月的顶边到最右
                let r = b / 7, c = b % 7
                p.move(to: CGPoint(x: X(c), y: size.height)); p.addLine(to: CGPoint(x: X(c), y: Y(r)))
                p.addLine(to: CGPoint(x: size.width, y: Y(r)))
            }
            let grad = Gradient(stops: [.init(color: Color(argb: 0xFF9E_9AC8), location: 0), .init(color: Color(argb: 0xFFC7_B3CF), location: 0.25),
                                        .init(color: Color(argb: 0xFFEB_C7A6), location: 0.5), .init(color: Color(argb: 0xFFC7_B3CF), location: 0.75),
                                        .init(color: Color(argb: 0xFF9E_9AC8), location: 1)])
            ctx.opacity = 0.95
            ctx.stroke(p, with: pal.glass ? .color(pal.text.opacity(0.6)) : .linearGradient(grad, startPoint: .zero, endPoint: CGPoint(x: 320, y: 0)),
                       style: StrokeStyle(lineWidth: MonthView.seamW, lineCap: .round, lineJoin: .round))
        }
        .allowsHitTesting(false)
    }
    #if os(macOS)
    private static let seamW: CGFloat = 1.5
    #else
    private static let seamW: CGFloat = 1.2
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
                        .background { if wk[k] == today { RoundedRectangle(cornerRadius: 10, style: .continuous).fill(pal.todayTint).padding(1.5) } } // 今天：圆角的品牌渐变淡底（和 App 一样）
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
            // 日期在格子里居中（和 App 的 .num 一样），放不下的「+n」叠在右上角
            Text("\(day.d)")
                .font(.system(size: MonthView.dateFS, weight: MonthView.dateWeight(isToday, glass: pal.glass)))
                .foregroundStyle(isToday ? Color.white : inMonth ? pal.text : pal.dim)
                .padding(.horizontal, 3)
                .frame(minWidth: MonthView.dateH, minHeight: MonthView.dateH, maxHeight: MonthView.dateH)
                .background { if isToday { RoundedRectangle(cornerRadius: MonthView.dateH / 2).fill(pal.todayStyle).accentable() } }
                .frame(maxWidth: .infinity)
                .overlay(alignment: .trailing) {
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
        // 只淡最后 7pt、最淡留 45%（和 App 一样；全淡到透明时正常大小下看不见字，用户嫌太过）
        LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: max(0, 1 - 7 / w)), .init(color: .black.opacity(0.45), location: 1)],
                       startPoint: .leading, endPoint: .trailing)
    }

    /// 色条上的字：中文小一号（0.947 倍，和网页 .chip .cj、安卓 chipText 一样），英文、数字不变【联动:优先级色条】
    static func chipText(_ s: String, weight: Font.Weight) -> Text {
        func cjk(_ c: Character) -> Bool { c.unicodeScalars.first.map { let v = $0.value; return (0x2E80...0x9FFF).contains(v) || (0xF900...0xFAFF).contains(v) || (0x3000...0x303F).contains(v) || (0xFF00...0xFFEF).contains(v) } ?? false }
        var out = AttributedString(), run = "", runCJK = false
        func flush() { guard !run.isEmpty else { return }; var a = AttributedString(run); a.font = .system(size: chipFS * (runCJK ? 0.947 : 1), weight: weight); out += a; run = "" }
        for ch in s { let k = cjk(ch); if k != runCJK { flush(); runCJK = k }; run.append(ch) }
        flush()
        return Text(out)
    }
    /// 分日历（记录日历、纪念日历）的事件在主日历里：左边一根竖条 + 淡底 + 同色字（和网页 .chip.sub 一样，用户定的）；玻璃样式照旧
    private func isSub(_ e: CEvent, _ pal: Pal) -> Bool { !e.cal.isEmpty && !pal.glass }
    private func subInk(_ col: UInt32, _ pal: Pal, soft: Bool) -> Color {
        if soft { return Color(argb: pal.dark ? 0xFF6E_7178 : 0xFFA4_A6AD) }
        func mix(_ b: UInt32, _ k: Double) -> Color {
            func ch(_ v: UInt32, _ sh: UInt32) -> Double { Double((v >> sh) & 0xFF) / 255 }
            return Color(red: ch(col, 16) * k + ch(b, 16) * (1 - k), green: ch(col, 8) * k + ch(b, 8) * (1 - k), blue: ch(col, 0) * k + ch(b, 0) * (1 - k))
        }
        return pal.dark ? mix(0xFFFF_FFFF, 0.5) : mix(0xFF16_141D, 0.72)
    }
    @ViewBuilder private func subFill(_ col: UInt32, soft: Bool, stripe: Bool) -> some View {
        ZStack(alignment: .leading) {
            Rectangle().fill(Color(argb: col).opacity(soft ? 0.07 : 0.2))
            if stripe { Rectangle().fill(Color(argb: col).opacity(soft ? 0.35 : 1)).frame(width: 3) }
        }
    }

    /// tm：有具体时间但放不下时间行 → 色条右端一个小点（和应用一致）
    // 【联动:优先级色条】见 CLAUDE.md「联动分组」
    private func chip(_ e: CEvent, soft: Bool, out: Bool = false, width: CGFloat, pal: Pal, tm: Bool = false) -> some View {
        let sub = isSub(e, pal), col = pal.base(e, entry.data)
        let ink = sub ? subInk(col, pal, soft: soft || out) : pal.chip(e, entry.data, soft: soft, out: out).1
        let lead: CGFloat = sub ? 4.5 : 1.5
        return MonthView.chipText(e.displayTitle, weight: pal.dark ? .medium : MonthView.chipW)
            .strikethrough(e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, lead)
            .frame(width: max(0, width - (tm ? 7 : 0) - 1.5), height: MonthView.chipH, alignment: .leading)
            .clipped()
            .mask(MonthView.fade(max(1, width - (tm ? 7 : 0) - 1.5)))   // 放不下的字在色条里面渐隐，不再一刀切到边上（像冲出格子）
            .frame(width: width, height: MonthView.chipH, alignment: .leading)
            .overlay(alignment: .trailing) {
                if tm { Circle().fill(ink).frame(width: 3.5, height: 3.5).opacity(0.75).padding(.trailing, 3) }
            }
            .background {
                if sub { subFill(col, soft: soft || out, stripe: true).clipShape(RoundedRectangle(cornerRadius: MonthView.chipR)) }
                else { RoundedRectangle(cornerRadius: MonthView.chipR).fill(pal.chipFill(e, entry.data, soft: soft, out: out)) }
            }
            .padding(.horizontal, 1)
            .accentable()
    }

    /// 跨天横条：和格子里的色条同样的颜色、圆角、字号；延续到上一周 / 下一周的一端是平的
    private func bar(_ s: WeekLanes.Seg, wk: [YMD], ym: YMD, cw: CGFloat, pal: Pal) -> some View {
        let out = !(s.a...s.b).contains { wk[$0].m == ym.m }
        let sub = isSub(s.e, pal), col = pal.base(s.e, entry.data)
        let ink = sub ? subInk(col, pal, soft: s.e.done || out) : pal.chip(s.e, entry.data, soft: s.e.done || out, out: out).1
        let x0 = CGFloat(s.a) * (cw + MonthView.sp) + (s.openL ? 0 : 1)
        let x1 = CGFloat(s.b) * (cw + MonthView.sp) + cw - (s.openR ? 0 : 1)
        let y = MonthView.cellTop + MonthView.dateH + 1 + CGFloat(s.slot) * MonthView.slot
        let rl: CGFloat = s.openL ? 0 : MonthView.chipR, rr: CGFloat = s.openR ? 0 : MonthView.chipR
        let shape = UnevenRoundedRectangle(topLeadingRadius: rl, bottomLeadingRadius: rl, bottomTrailingRadius: rr, topTrailingRadius: rr)
        return MonthView.chipText(s.e.displayTitle, weight: pal.dark ? .medium : MonthView.chipW)
            .strikethrough(s.e.done)
            .foregroundStyle(ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.leading, sub && !s.openL ? 5 : 2.5)
            .frame(width: max(0, x1 - x0 - (s.openR ? 0 : 1.5)), height: MonthView.chipH, alignment: .leading)
            .clipped()
            .mask(MonthView.fade(max(1, x1 - x0 - (s.openR ? 0 : 1.5))))
            .frame(width: max(0, x1 - x0), height: MonthView.chipH, alignment: .leading)
            .background {
                if sub { subFill(col, soft: s.e.done || out, stripe: !s.openL).clipShape(shape) }
                else { shape.fill(pal.chipFill(s.e, entry.data, soft: s.e.done || out, out: out)) }
            }
            .accentable()
            .offset(x: x0, y: y)
    }
}
