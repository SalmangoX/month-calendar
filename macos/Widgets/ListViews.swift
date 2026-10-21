import SwiftUI
import WidgetKit

/// 列表区域：占满剩下的空间，内容从顶部开始排，放不下的部分在底部截掉
struct TopClip<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        GeometryReader { g in
            VStack(alignment: .leading, spacing: 0) { content }
                .fixedSize(horizontal: false, vertical: true)
                .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
        }
        .clipped()
    }
}

// ---------- 今日：已逾期、今天、接下来一周 ----------
struct TodayView: View {
    let entry: CalEntry

    private enum Row { case head(String, Bool), ev(CEvent, String?) }

    private func rel(_ d: YMD, _ today: YMD) -> String {
        let n = today.days(to: d)
        return n == 0 ? I18n.t("今天") : n == 1 ? I18n.t("明天") : n == -1 ? I18n.t("昨天") : n > 0 ? I18n.t("{0} 天后", n) : I18n.t("{0} 天前", -n)
    }

    private func dayLabel(_ d: YMD, _ today: YMD) -> String {
        let n = today.days(to: d), md = I18n.full(d)
        return n == 0 ? I18n.t("今天 · {0}", md) : n == 1 ? I18n.t("明天 · {0}", md) : n == 2 ? I18n.t("后天 · {0}", md) : md
    }

    private func rows() -> [Row] {
        let d = entry.data, today = entry.today
        var out: [Row] = []
        // 已逾期：最近 30 天内结束、还没完成的
        let over = d.events.filter { e in
            !e.done && d.visible(e) && e.end < today && !(e.end < today.adding(-30))
        }.sorted { $0.date > $1.date }
        if !over.isEmpty {
            out.append(.head(I18n.t("已逾期"), true))
            out += over.prefix(10).map { Row.ev($0, rel($0.date, today)) }
        }
        let todays = d.on(today)
        if !todays.isEmpty {
            if !over.isEmpty { out.append(.head(I18n.t("今天"), false)) }
            out += todays.map { Row.ev($0, nil) }
        }
        for k in 1...7 {
            let day = today.adding(k)
            let evs = d.on(day).filter { !$0.done && !($0.date < day) } // 多天事件只在第一天列出
            if evs.isEmpty { continue }
            out.append(.head(dayLabel(day, today), false))
            out += evs.map { Row.ev($0, nil) }
        }
        return Array(out.prefix(40))
    }

    var body: some View {
        WidgetShell(hash: "today") { pal in
            let list = rows()
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(I18n.t("今天")).font(.system(size: 15, weight: .bold)).foregroundStyle(pal.text).widgetAccentable()
                    Text(I18n.full(entry.today)).font(.system(size: 11)).foregroundStyle(pal.text2).lineLimit(1)
                }
                .padding(.leading, 3).padding(.bottom, 4)
                if list.isEmpty {
                    Text(entry.data.isEmpty ? I18n.t("打开节律 App\n同步一次后这里会显示事件") : I18n.t("今天没有事件\n接下来一周也很空闲"))
                        .font(.system(size: 13)).foregroundStyle(pal.text2).multilineTextAlignment(.center).lineSpacing(3)
                        .frame(maxWidth: .infinity, maxHeight: .infinity).padding(.bottom, 10)
                } else {
                    TopClip {
                        ForEach(Array(list.enumerated()), id: \.offset) { _, r in
                            switch r {
                            case .head(let t, let overdue):
                                Text(t).font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(overdue ? Color(argb: Pal.P[3]) : pal.text2).lineLimit(1)
                                    .padding(.leading, 3).padding(.top, 7).padding(.bottom, 1)
                            case .ev(let e, let prefix):
                                eventRow(e, prefix, pal)
                            }
                        }
                    }
                }
            }
            .padding([.top, .horizontal], 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func eventRow(_ e: CEvent, _ prefix: String?, _ pal: Pal) -> some View {
        let d = entry.data, t = e.timeLabel(d.h12), col = pal.base(e, d)
        var sub = (prefix.map { $0 + " · " } ?? "") + (t.isEmpty ? I18n.t("全天") : t)
        if e.days > 1 { sub += " · " + I18n.t("{0} 天", e.days) }
        if !e.note.isEmpty { sub += " · " + e.note.replacingOccurrences(of: "\n", with: " ") }
        return HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(Color(argb: e.done ? withAlpha(col, 0x40) : col)).frame(width: 3.5, height: 28).widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                Text(e.displayTitle).font(.system(size: 13.5)).strikethrough(e.done).foregroundStyle(pal.text).lineLimit(1)
                Text(sub).font(.system(size: 11)).foregroundStyle(pal.text2).lineLimit(1)
            }
        }
        .padding(.leading, 3).padding(.vertical, 4)
    }
}

// ---------- 课表：小 = 今天（或下一个有课的日子）；中 = 本周；大 = 本周课表 ----------
struct SchedView: View {
    let entry: CalEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetShell(hash: "sched") { pal in
            switch family {
            case .systemSmall: SchedDay(entry: entry, pal: pal)
            case .systemMedium: SchedWeek(entry: entry, pal: pal)
            default: SchedGrid(entry: entry, pal: pal)
            }
        }
    }
}

struct SchedDay: View {
    let entry: CalEntry, pal: Pal

    var body: some View {
        let d = entry.data, today = entry.today
        let nm = YMD.cal.component(.hour, from: entry.date) * 60 + YMD.cal.component(.minute, from: entry.date)
        // 今天还有没上完的课就显示今天，否则找下一个有课的日子
        var label: String? = nil, sub = "", isToday = false, list: [Course] = []
        for k in 0..<15 where label == nil {
            let date = today.adding(k), l = d.courses(on: date)
            if k == 0 {
                let left = l.filter { $0.endMin > nm }
                if !left.isEmpty { label = I18n.t("今天"); isToday = true; list = left; sub = I18n.wk(date.jsDay) }
                continue
            }
            if !l.isEmpty {
                label = k == 1 ? I18n.t("明天") : k < 7 ? I18n.wk(date.jsDay) : I18n.md(date.m, date.d)
                sub = I18n.wk(date.jsDay); list = l
            }
        }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(label ?? I18n.t("课表")).font(.system(size: 15, weight: .bold)).foregroundStyle(pal.text).widgetAccentable()
                Text(label == nil ? "" : sub).font(.system(size: 11)).foregroundStyle(pal.text2)
            }
            .padding(.leading, 3).padding(.bottom, 4)
            if label == nil {
                Text(d.courses.isEmpty ? I18n.t("还没有导入课表") : I18n.t("这周没有课"))
                    .font(.system(size: 13)).foregroundStyle(pal.text2).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, maxHeight: .infinity).padding(.bottom, 10)
            } else {
                TopClip {
                    ForEach(Array(list.enumerated()), id: \.offset) { i, c in
                        let live = isToday && nm >= c.startMin
                        let firstUpcoming = list.firstIndex { !(isToday && nm >= $0.startMin) }
                        let state = live ? I18n.t("上课中") : i == firstUpcoming ? (isToday ? I18n.t("下一节") : I18n.t("第一节")) : ""
                        courseRow(c, state: state, live: live)
                    }
                }
            }
        }
        .padding([.top, .horizontal], 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func courseRow(_ c: Course, state: String, live: Bool) -> some View {
        let t = entry.data.toneOf(c.code)
        return HStack(spacing: 0) {
            Rectangle().fill(Color(argb: t[pal.dark ? CourseColors.BAR_D : CourseColors.BASE])).frame(width: 3.5, height: 30).widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                Text(c.type.isEmpty ? c.code : c.code + "  " + I18n.t(c.type)).font(.system(size: 13.5, weight: .bold)).foregroundStyle(pal.text).lineLimit(1)
                Text(fmtRange(c.start, c.end, entry.data.h12) + (c.room.isEmpty ? "" : " · " + c.room))
                    .font(.system(size: 11)).foregroundStyle(pal.text2).lineLimit(1)
            }
            .padding(.leading, 8)
            Spacer(minLength: 0)
            if !state.isEmpty {
                Text(state).font(.system(size: 10, weight: .bold)).foregroundStyle(pal.accent).padding(.leading, 6).widgetAccentable()
            }
        }
        .padding(.leading, 6).padding(.trailing, 8).padding(.vertical, 5)
        .background { if live { RoundedRectangle(cornerRadius: 10).fill(pal.live) } }
    }
}

/// 横向本周：每天一列，课程按时间排成色块（周末有课才显示）
struct SchedWeek: View {
    let entry: CalEntry, pal: Pal

    var body: some View {
        let d = entry.data, today = entry.today, mon = today.monday, sun = mon.adding(6)
        let cols: [(YMD, [Course])] = (0..<7).compactMap { i in
            let day = mon.adding(i), l = d.courses(on: day)
            return i < 5 || !l.isEmpty ? (day, l) : nil
        }
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(I18n.t("本周课表")).font(.system(size: 13.5, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                Text("\(mon.m)/\(mon.d) – \(sun.m)/\(sun.d)").font(.system(size: 10.5)).foregroundStyle(pal.text2)
            }
            .padding(.leading, 6).frame(height: 20)
            GeometryReader { g in
                let slotH = min(34, (g.size.height - 28 - 3 - 5 * 2) / 5)
                HStack(spacing: 0) {
                    ForEach(Array(cols.enumerated()), id: \.offset) { _, col in
                        column(col.0, col.1, isToday: col.0 == today, slotH: slotH)
                    }
                }
            }
        }
        .padding(.horizontal, 5).padding(.top, 7)
    }

    private func column(_ day: YMD, _ l: [Course], isToday: Bool, slotH: CGFloat) -> some View {
        let shown = l.count > 5 ? 4 : l.count
        return VStack(spacing: 0) {
            VStack(spacing: -2) {
                Text(I18n.wk(day.jsDay)).font(.system(size: 9.5))
                Text("\(day.d)").font(.system(size: 9.5))
            }
            .foregroundStyle(isToday ? pal.accent : pal.text2)
            .frame(height: 28)
            ForEach(0..<shown, id: \.self) { k in
                let c = l[k]
                let chip = pal.courseChip(c.code, entry.data)
                VStack(alignment: .leading, spacing: -1) {
                    Text(c.code).lineLimit(1)
                    Text(fmtTime(c.start, entry.data.h12, true)).lineLimit(1)
                }
                .font(.system(size: 8.5)).foregroundStyle(chip.1)
                .padding(.leading, 3).padding(.trailing, 2)
                .frame(maxWidth: .infinity, alignment: .leading).frame(height: slotH)
                .background(RoundedRectangle(cornerRadius: 5).fill(chip.0).widgetAccentable())
                .padding(.horizontal, 1.5).padding(.top, 2)
            }
            if l.count > 5 {
                Text("+\(l.count - 4)").font(.system(size: 8.5)).foregroundStyle(pal.text2).frame(height: slotH).padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
        .padding(.bottom, 3)
        .frame(maxWidth: .infinity)
        .background { if isToday { RoundedRectangle(cornerRadius: 9).fill(pal.live) } }
    }
}

/// 大尺寸：本周详细课表。左边时间轴、每天一列，课程按上下课时间画成色块
struct SchedGrid: View {
    let entry: CalEntry, pal: Pal

    var body: some View {
        GeometryReader { g in content(W: g.size.width, H: g.size.height) }
    }

    private func content(W: CGFloat, H: CGFloat) -> some View {
        let d = entry.data, today = entry.today, mon = today.monday, sun = mon.adding(6), h12 = d.h12
        var days: [Int] = [], per: [[Course]] = []
        var minH = 8, maxH = 18
        for i in 0..<7 {
            let l = d.courses(on: mon.adding(i))
            if i < 5 || !l.isEmpty { days.append(i); per.append(l) }
            for c in l { minH = min(minH, c.startMin / 60); maxH = max(maxH, (c.endMin + 59) / 60) }
        }
        let pad: CGFloat = 8, axis: CGFloat = 30, headH: CGFloat = 22, dayH: CGFloat = 20
        let gx = pad + axis, gy = pad + headH + dayH, gw = W - gx - pad, gh = H - gy - pad
        let colW = gw / CGFloat(days.count), hourH = gh / CGFloat(maxH - minH)
        let fk = max(0.72, min(1.1, colW / 64))
        let todayCol = days.firstIndex { mon.adding($0) == today }
        // 现在几点（和应用课表一样）：整周一条半透明的线压在课程上面，时间轴上一个时间标签
        let nm = YMD.cal.component(.hour, from: entry.date) * 60 + YMD.cal.component(.minute, from: entry.date)
        let nowCol: Int? = todayCol.flatMap { nm >= minH * 60 && nm <= maxH * 60 ? $0 : nil }
        let ny = gy + (CGFloat(nm) / 60 - CGFloat(minH)) * hourH
        let red = Color(argb: Pal.P[3])

        return ZStack(alignment: .topLeading) {
            // 今天那一列：淡淡的主色底
            if let ci = todayCol {
                RoundedRectangle(cornerRadius: 9).fill(pal.accent.opacity(pal.dark ? 0x38 / 255.0 : 0x24 / 255.0))
                    .frame(width: colW - 2, height: H - pad - (pad + headH))
                    .offset(x: gx + CGFloat(ci) * colW + 1, y: pad + headH)
                    .widgetAccentable()
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(I18n.t("本周课表")).font(.system(size: 13, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                Text("\(mon.m)/\(mon.d) – \(sun.m)/\(sun.d)").font(.system(size: 10.5)).foregroundStyle(pal.text2)
            }
            .offset(x: pad + 4, y: pad + 1)
            ForEach(Array(days.enumerated()), id: \.offset) { ci, i in
                let dd = mon.adding(i)
                let isT = dd == today
                Text(I18n.wk(dd.jsDay) + " \(dd.d)").font(.system(size: 10, weight: isT ? .bold : .regular))
                    .foregroundStyle(isT ? pal.accent : pal.text2).lineLimit(1)
                    .frame(width: colW).offset(x: gx + CGFloat(ci) * colW, y: pad + headH + 3)
            }
            // 时间轴和横线、竖线
            Path { p in
                for h in minH...maxH {
                    let y = gy + CGFloat(h - minH) * hourH
                    p.move(to: CGPoint(x: gx, y: y)); p.addLine(to: CGPoint(x: W - pad, y: y))
                }
                for ci in 1..<max(1, days.count) {
                    let x = gx + CGFloat(ci) * colW
                    p.move(to: CGPoint(x: x, y: gy)); p.addLine(to: CGPoint(x: x, y: H - pad))
                }
            }
            .stroke(pal.line, lineWidth: 0.6)
            ForEach(minH..<maxH, id: \.self) { h in
                Text(hourLabel(h, h12)).font(.system(size: 9)).foregroundStyle(pal.text2).lineLimit(1)
                    .frame(width: axis - 4, alignment: .trailing)
                    .offset(x: pad, y: gy + CGFloat(h - minH) * hourH + 1)
            }
            // 课程色块（同一时间有几节课就并排）
            ForEach(Array(per.enumerated()), id: \.offset) { ci, l in
                ForEach(Array(SchedGrid.lanes(l).enumerated()), id: \.offset) { _, b in
                    block(b.0, x: gx + CGFloat(ci) * colW + CGFloat(b.1) * colW / CGFloat(b.2), w: colW / CGFloat(b.2),
                          top: gy + (CGFloat(b.0.startMin) / 60 - CGFloat(minH)) * hourH,
                          bottom: gy + (CGFloat(b.0.endMin) / 60 - CGFloat(minH)) * hourH, fk: fk, h12: h12,
                          live: ci == nowCol && nm >= b.0.startMin && nm < b.0.endMin)
                }
            }
            if nowCol != nil {
                // 现在时间：整周一条半透明的线压在课程上面；左边一个实色的圆角时间标签，右边缘接上这条线
                Rectangle().fill(red.opacity(0.5)).frame(width: W - pad - gx, height: 1.5).offset(x: gx, y: ny - 0.75)
                Text(fmtTime(String(format: "%02d:%02d", nm / 60, nm % 60), h12, true))
                    .font(.system(size: 8, weight: .bold)).monospacedDigit().foregroundStyle(.white).lineLimit(1)
                    .padding(.horizontal, 2.5).frame(minWidth: axis - 4, minHeight: 12)
                    .background(RoundedRectangle(cornerRadius: 3.5, style: .continuous).fill(red))
                    .frame(width: axis + 2, alignment: .trailing)
                    .offset(x: gx - axis - 2, y: ny - 6)
            }
            if d.courses.isEmpty {
                Text(I18n.t("还没有导入课表")).font(.system(size: 13)).foregroundStyle(pal.text2)
                    .frame(width: W, height: H)
            }
        }
        .frame(width: W, height: H, alignment: .topLeading)
    }

    /// (课程, 第几道, 一共几道)
    private static func lanes(_ list: [Course]) -> [(Course, Int, Int)] {
        let l = list.sorted { $0.startMin < $1.startMin }
        var lane = [Int](repeating: 0, count: l.count), lanes = [Int](repeating: 1, count: l.count)
        var gStart = 0, gEnd = -1, ends: [Int] = []
        for i in 0...l.count {
            if i == l.count || (i > gStart && l[i].startMin >= gEnd) {
                for j in gStart..<i { lanes[j] = max(1, ends.count) }
                if i == l.count { break }
                gStart = i; ends = []; gEnd = -1
            }
            let c = l[i]
            var ln = ends.firstIndex { $0 <= c.startMin } ?? -1
            if ln < 0 { ln = ends.count; ends.append(0) }
            ends[ln] = c.endMin; lane[i] = ln; gEnd = max(gEnd, c.endMin)
        }
        return l.indices.map { (l[$0], lane[$0], lanes[$0]) }
    }

    private func block(_ c: Course, x: CGFloat, w: CGFloat, top: CGFloat, bottom: CGFloat, fk: CGFloat, h12: Bool, live: Bool) -> some View {
        let t = entry.data.toneOf(c.code)
        let x0 = x + 1.5, x1 = x0 + w - 3, y0 = top + 1, y1 = bottom - 1
        // 放得下几行就显示几行：代码、类型、时间、教室
        var lines: [(String, CGFloat, Font.Weight, Color)] = [
            (c.code, 11, .bold, Color(argb: t[pal.dark ? CourseColors.INK_D : CourseColors.INK_L])),
            (I18n.t(c.type), 9.5, .regular, pal.text),
            (h12 ? fmtTime(c.start, true, true) + "–" + fmtTime(c.end, true, true) : c.start + "–" + c.end, 9, .regular, pal.text2),
            (c.room, 9, .regular, pal.text),
        ]
        lines = lines.filter { !$0.0.isEmpty }
        var used: CGFloat = 2, fit: [(String, CGFloat, Font.Weight, Color)] = []
        for ln in lines {
            let h = ln.1 * fk * 1.22
            if used + h > y1 - y0 { break }
            used += h; fit.append(ln)
        }
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 6).fill(Color(argb: t[pal.dark ? CourseColors.FILL_D : CourseColors.FILL_L]))
            RoundedRectangle(cornerRadius: 1.5).fill(Color(argb: t[pal.dark ? CourseColors.BAR_D : CourseColors.BASE]))
                .frame(width: 3).widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(fit.enumerated()), id: \.offset) { _, ln in
                    Text(ln.0).font(.system(size: ln.1 * fk, weight: ln.2)).foregroundStyle(ln.3).lineLimit(1)
                }
            }
            .padding(.leading, 6).padding(.top, 2).padding(.trailing, 2)
        }
        .frame(width: max(0, x1 - x0), height: max(0, y1 - y0), alignment: .topLeading)
        .clipped()
        // 正在上的课：微微放大一点，带一层很淡的阴影
        .scaleEffect(live ? 1.03 : 1)
        .shadow(color: live ? (pal.dark ? Color.black.opacity(0.45) : Color(argb: t[CourseColors.BASE]).opacity(0.25)) : .clear, radius: 5, y: 2.5)
        .offset(x: x0, y: y0)
    }
}
