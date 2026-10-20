import Foundation

/// 一周 7 天的事件排位（与网页 calendar.js 的 layWeek、安卓 WeekLanes 相同）：
/// 跨天事件先占上面的行（开始早、跨得长的在上），单天事件依次填进空位。
struct WeekLanes {
    enum Slot {
        case empty, bar, event(CEvent)
        var isEmpty: Bool { if case .empty = self { return true }; return false }
    }
    struct Bar { let e: CEvent; var c0: Int, c1: Int, slot = 0 }
    /// 一段要画出来的横条：第 a 列到第 b 列，在第 slot 行；open = 延续到上一周 / 下一周（或被「+n」截断）的一端
    struct Seg { let e: CEvent; let a: Int, b: Int, slot: Int; let openL: Bool, openR: Bool }

    var bars: [Bar] = []
    var occ: [[Slot]] = []

    private func free(_ c: Int, _ s: Int) -> Bool { s >= occ[c].count || occ[c][s].isEmpty }
    private mutating func put(_ c: Int, _ s: Int, _ v: Slot) {
        while occ[c].count <= s { occ[c].append(.empty) }
        occ[c][s] = v
    }

    static func lay(_ evsBy: [[CEvent]]) -> WeekLanes {
        var w = WeekLanes()
        w.occ = Array(repeating: [], count: evsBy.count)
        var idx: [String: Int] = [:]
        let spans: (CEvent) -> Bool = { $0.days > 1 && $0.time.isEmpty }
        for (c, list) in evsBy.enumerated() {
            for e in list where spans(e) {
                if let i = idx[e.id] { w.bars[i].c1 = c } else { idx[e.id] = w.bars.count; w.bars.append(Bar(e: e, c0: c, c1: c)) }
            }
        }
        w.bars.sort { x, y in
            if x.c0 != y.c0 { return x.c0 < y.c0 }
            if (y.c1 - y.c0) != (x.c1 - x.c0) { return (x.c1 - x.c0) > (y.c1 - y.c0) }
            return CalData.order(x.e, y.e)
        }
        for i in w.bars.indices {
            let c0 = w.bars[i].c0, c1 = w.bars[i].c1
            var s = 0
            while true {
                var ok = true
                for c in c0...c1 where !w.free(c, s) { ok = false; break }
                if ok { break }
                s += 1
            }
            w.bars[i].slot = s
            for c in c0...c1 { w.put(c, s, .bar) }
        }
        for (c, list) in evsBy.enumerated() {
            for e in list where !spans(e) {
                var s = 0
                while !w.free(c, s) { s += 1 }
                w.put(c, s, .event(e))
            }
        }
        return w
    }

    /// 按每天能显示的行数切出横条：在被「+n」挡住的日子断开，其余连成一整条
    func segments(_ lim: [Int], week0: YMD) -> [Seg] {
        var out: [Seg] = []
        for b in bars {
            var c = b.c0
            while c <= b.c1 {
                if b.slot >= lim[c] { c += 1; continue }
                var d = c
                while d + 1 <= b.c1 && b.slot < lim[d + 1] { d += 1 }
                out.append(Seg(e: b.e, a: c, b: d, slot: b.slot,
                               openL: b.e.date != week0.adding(c), openR: b.e.end != week0.adding(d)))
                c = d + 1
            }
        }
        return out
    }
}
