import Foundation

/// 本地日期（年月日），和网页的 "YYYY-MM-DD" 一一对应
struct YMD: Hashable, Comparable {
    let y: Int, m: Int, d: Int

    static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }

    init(y: Int, m: Int, d: Int) { self.y = y; self.m = m; self.d = d }

    init(_ date: Date) {
        let c = YMD.cal.dateComponents([.year, .month, .day], from: date)
        self.init(y: c.year ?? 1970, m: c.month ?? 1, d: c.day ?? 1)
    }

    init?(string s: String) {
        let p = s.split(separator: "-")
        guard s.count == 10, p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        self.init(y: y, m: m, d: d)
    }

    static var today: YMD { YMD(Date()) }

    /// 当天 0 点
    var date: Date { YMD.cal.date(from: DateComponents(year: y, month: m, day: d)) ?? Date() }
    func at(minutes: Int) -> Date { YMD.cal.date(byAdding: .minute, value: minutes, to: date) ?? date }
    func adding(_ n: Int) -> YMD { YMD(YMD.cal.date(byAdding: .day, value: n, to: date) ?? date) }
    /// 周一 = 1 … 周日 = 7（和 Java 的 DayOfWeek 一致）
    var isoDay: Int { let w = YMD.cal.component(.weekday, from: date); return w == 1 ? 7 : w - 1 }
    /// 周日 = 0（和网页一致）
    var jsDay: Int { isoDay % 7 }
    var monday: YMD { adding(1 - isoDay) }
    func days(to o: YMD) -> Int { YMD.cal.dateComponents([.day], from: date, to: o.date).day ?? 0 }
    var firstOfMonth: YMD { YMD(y: y, m: m, d: 1) }
    func addingMonths(_ n: Int) -> YMD {
        let t = y * 12 + (m - 1) + n
        return YMD(y: t / 12, m: t % 12 + 1, d: 1)
    }
    var key: String { String(format: "%04d-%02d-%02d", y, m, d) }

    static func < (a: YMD, b: YMD) -> Bool { (a.y, a.m, a.d) < (b.y, b.m, b.d) }
}

/// 6×7 的月历格子：从包含 1 号的那一周的第一天开始
func monthGrid(_ ym: YMD, weekStart: Int) -> [YMD] {
    let first = ym.firstOfMonth
    let start = first.adding(-((first.jsDay - weekStart + 7) % 7))
    return (0..<42).map { start.adding($0) }
}

/// 纪念日历里的一个日子（和网页 js/days.js、安卓 Data.Day 同一套算法）
struct CDay {
    var id = "", cal = "", title = "", time = "", rep = "", hl = "", unit = "d", icon = ""
    var date = YMD(y: 1970, m: 1, d: 1)
    var pin = false, from1 = false
    /// 标题前面带上彩色表情（旧版的线条图标名不显示）
    var named: String {
        let t = title.isEmpty ? I18n.t("（无标题）") : title
        return !icon.isEmpty && icon.range(of: "^[a-z]+$", options: .regularExpression) == nil ? icon + " " + t : t
    }
    var updatedAt: Int64 = 0

    private static func clamp(_ y: Int, _ m: Int, _ d: Int) -> YMD {
        let t = y * 12 + (m - 1), yy = t / 12, mm = t % 12 + 1
        let n = YMD.cal.range(of: .day, in: .month, for: YMD(y: yy, m: mm, d: 1).date)?.count ?? 28
        return YMD(y: yy, m: mm, d: min(d, n))
    }
    /// 从 today 起的下一次（不重复的就是那一天）
    func occ(_ today: YMD) -> YMD {
        if rep.isEmpty || !(date < today) { return date }
        if rep == "week" { return date.adding((date.days(to: today) + 6) / 7 * 7) }
        if rep == "month" {
            let d = CDay.clamp(today.y, today.m, date.d)
            return d < today ? CDay.clamp(today.y, today.m + 1, date.d) : d
        }
        let d = CDay.clamp(today.y, date.m, date.d)
        return d < today ? CDay.clamp(today.y + 1, date.m, date.d) : d
    }
    /// 正数 = 还有几天，负数 = 已经几天
    func diff(_ today: YMD) -> Int { today.days(to: occ(today)) }
}

struct CEvent {
    var id = "", title = "", note = "", time = "", endTime = "", cal = ""
    var date = YMD(y: 1970, m: 1, d: 1)
    var priority = 0, days = 1
    var done = false
    var remind: Int64? = nil
    var createdAt: Int64 = 0

    var end: YMD { days > 1 ? date.adding(days - 1) : date }
    var displayTitle: String { title.isEmpty ? I18n.t("（无标题）") : title }
    func timeLabel(_ h12: Bool) -> String {
        time.isEmpty ? "" : endTime.isEmpty ? fmtTime(time, h12, false) : fmtRange(time, endTime, h12)
    }
    /// 提醒时间：带时间的事件以开始时间为准，全天事件以当天 9:00 为准
    var fireTime: Date? {
        guard let r = remind else { return nil }
        let mins = time.isEmpty ? 9 * 60 : minutesOf(time)
        return date.at(minutes: mins).addingTimeInterval(-Double(r) * 60)
    }
}

struct Course {
    var id = "", code = "", type = "", room = "", start = "", end = ""
    var day = 1, startMin = 0, endMin = 0, every = 1
    var from: YMD? = nil, to: YMD? = nil

    /// 这一天有没有这节课：星期、起止日期、隔周
    func on(_ d: YMD) -> Bool {
        if d.isoDay != day { return false }
        if let f = from, d < f { return false }
        if let t = to, d > t { return false }
        if every == 2, let f = from {
            let w = f.monday.days(to: d.monday) / 7
            if w % 2 != 0 { return false }
        }
        return true
    }
}

func minutesOf(_ hhmm: String) -> Int {
    let p = hhmm.split(separator: ":")
    guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { return 0 }
    return min(h, 23) * 60 + min(m, 59)
}

private func isTime(_ s: String) -> Bool {
    s.count == 5 && s.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil
}

// ---------- 12 / 24 小时制（与网页 MC.fmtTime / fmtRange 一致） ----------
func fmtTime(_ hhmm: String, _ h12: Bool, _ noHalf: Bool) -> String {
    guard !hhmm.isEmpty, h12 else { return hhmm }
    let t = minutesOf(hhmm), h = t / 60, m = t % 60
    let hm = "\(h % 12 == 0 ? 12 : h % 12):\(m < 10 ? "0" : "")\(m)"
    if noHalf { return hm }
    return I18n.zh ? (h < 12 ? "上午" : "下午") + hm : hm + (h < 12 ? " AM" : " PM")
}

func fmtRange(_ a: String, _ b: String, _ h12: Bool) -> String {
    if !h12 { return a + "–" + b }
    let same = (minutesOf(a) < 720) == (minutesOf(b) < 720)
    return I18n.zh ? fmtTime(a, true, false) + "–" + fmtTime(b, true, same)
                   : fmtTime(a, true, same) + "–" + fmtTime(b, true, false)
}

func hourLabel(_ h: Int, _ h12: Bool) -> String {
    let hh = h % 12 == 0 ? 12 : h % 12
    if !h12 { return "\(h):00" }
    return I18n.zh ? (h < 12 ? "上午" : "下午") + "\(hh)" : "\(hh)" + (h < 12 ? " AM" : " PM")
}

// ---------- JSON 小工具 ----------
typealias JObj = [String: Any]

func jparse(_ s: String) -> JObj? {
    guard !s.isEmpty, let d = s.data(using: .utf8) else { return nil }
    return (try? JSONSerialization.jsonObject(with: d)) as? JObj
}

func jstring(_ o: Any) -> String {
    guard JSONSerialization.isValidJSONObject(o), let d = try? JSONSerialization.data(withJSONObject: o) else { return "{}" }
    return String(data: d, encoding: .utf8) ?? "{}"
}

extension Dictionary where Key == String, Value == Any {
    func str(_ k: String, _ def: String = "") -> String { self[k] as? String ?? def }
    func int(_ k: String, _ def: Int = 0) -> Int {
        if let n = self[k] as? NSNumber { return n.intValue }
        if let s = self[k] as? String, let n = Int(s) { return n }
        return def
    }
    func long(_ k: String) -> Int64 {
        if let n = self[k] as? NSNumber { return n.int64Value }
        if let s = self[k] as? String, let n = Int64(s) { return n }
        return 0
    }
    func bool(_ k: String) -> Bool { (self[k] as? NSNumber)?.boolValue ?? false }
    func obj(_ k: String) -> JObj? { self[k] as? JObj }
    func arr(_ k: String) -> [JObj] { (self[k] as? [Any])?.compactMap { $0 as? JObj } ?? [] }
}

/// 日历数据：读取网页 App 的 mcal-calendar.json（格式与 js/store.js 一致）
/// 约定：网页以后只新增字段、不改名不删除；不认识的字段直接忽略，合并时原样保留。
final class CalData {
    static let knownVersion = 3

    var events: [CEvent] = []
    var courses: [Course] = []
    var courseTone: [String: [UInt32]] = [:]
    var dailyOn = false
    var dailyMin = 13 * 60
    var clock = "auto"
    var shownCals = Set<String>()
    var calColor: [String: UInt32] = [:]
    var notifyCals = Set<String>()
    var days: [CDay] = []
    var isEmpty = true
    private var byDate: [YMD: [CEvent]] = [:]

    func toneOf(_ code: String) -> [UInt32] { courseTone[code] ?? CourseColors.tone(240) }
    /// 记录日历里没设优先级的事件用日历自己的颜色
    func calColorOf(_ e: CEvent) -> UInt32? { !e.cal.isEmpty && e.priority == 0 ? calColor[e.cal] : nil }
    /// 主日历永远提醒，记录日历看自己的开关
    func notifies(_ e: CEvent) -> Bool { e.cal.isEmpty || notifyCals.contains(e.cal) }
    func visible(_ e: CEvent) -> Bool { e.cal.isEmpty || shownCals.contains(e.cal) }
    func on(_ d: YMD) -> [CEvent] { byDate[d] ?? [] }
    func courses(on d: YMD) -> [Course] { courses.filter { $0.on(d) } }

    /// 「跟随地区」= 用系统的 12 / 24 小时设置
    var h12: Bool {
        if clock == "12" { return true }
        if clock == "24" { return false }
        let f = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .current) ?? ""
        return f.contains("a")
    }

    /// 与网页 MC.cmp 相同：未完成在前，优先级高在前，有时间的按时间，最后按创建时间
    static func order(_ a: CEvent, _ b: CEvent) -> Bool {
        if a.done != b.done { return !a.done }
        if a.priority != b.priority { return a.priority > b.priority }
        let ta = a.time.isEmpty ? "99" : a.time, tb = b.time.isEmpty ? "99" : b.time
        if ta != tb { return ta < tb }
        return a.createdAt < b.createdAt
    }

    static func parse(_ json: String) -> CalData {
        let d = CalData()
        guard let o = jparse(json) else { I18n.set("auto"); return d }
        d.isEmpty = false
        var dayCals = Set<String>()
        for e in o.arr("events") { if let x = event(e) { d.events.append(x) } }
        let prof = o.obj("profile") ?? [:]
        d.clock = prof.str("clock", "auto")
        I18n.set(prof.str("lang", "auto"))
        for c in o.arr("cals") {
            let id = c.str("id"); if id.isEmpty { continue }
            if c.bool("showInMain") { d.shownCals.insert(id) }
            let col = c.str("color")
            if col.count == 7, col.hasPrefix("#"), let v = UInt32(col.dropFirst(), radix: 16) { d.calColor[id] = 0xFF00_0000 | v }
            if c.bool("notify") { d.notifyCals.insert(id) }
            if c.str("kind") == "days" { dayCals.insert(id) }
        }
        for x in o.arr("days") {
            guard let date = YMD(string: x.str("date")), dayCals.contains(x.str("cal")) else { continue }
            var y = CDay()
            y.date = date; y.id = x.str("id"); y.cal = x.str("cal"); y.title = x.str("title")
            let t = x.str("time"); y.time = isTime(t) ? t : ""
            let r = x.str("rep"); y.rep = ["week", "month", "year"].contains(r) ? r : ""
            let h = x.str("hl"); y.hl = h.count == 7 && h.hasPrefix("#") && UInt32(h.dropFirst(), radix: 16) != nil ? h : ""
            y.unit = x.str("unit", "d"); y.icon = x.str("icon"); y.pin = x.bool("pin"); y.from1 = x.bool("from1"); y.updatedAt = x.long("updatedAt")
            d.days.append(y)
        }
        if let daily = o.obj("daily") {
            d.dailyOn = daily.bool("on")
            let t = daily.str("time"); if isTime(t) { d.dailyMin = minutesOf(t) }
        }
        for c in o.arr("courses") {
            var x = Course()
            x.id = c.str("id"); x.code = c.str("code"); x.type = c.str("type"); x.room = c.str("room")
            x.day = c.int("day"); x.start = c.str("start"); x.end = c.str("end")
            if x.code.isEmpty || !(1...7).contains(x.day) || !isTime(x.start) || !isTime(x.end) { continue }
            x.startMin = minutesOf(x.start); x.endMin = minutesOf(x.end)
            x.from = YMD(string: c.str("from")); x.to = YMD(string: c.str("to"))
            x.every = c.int("every", 1) == 2 ? 2 : 1
            d.courses.append(x)
        }
        d.courses.sort { $0.day != $1.day ? $0.day < $1.day : $0.startMin < $1.startMin }
        for (code, h) in CourseColors.hues(d.courses.map { $0.code }) { d.courseTone[code] = CourseColors.tone(h) }
        // 小组件 = 主日历（加上设为在主日历显示的记录日历）；多天的全天事件出现在跨越的每一天
        for e in d.events where d.visible(e) {
            for k in 0..<e.days { d.byDate[e.date.adding(k), default: []].append(e) }
        }
        for k in d.byDate.keys { d.byDate[k]?.sort(by: order) }
        return d
    }

    private static func event(_ e: JObj) -> CEvent? {
        guard let date = YMD(string: e.str("date")) else { return nil }
        var x = CEvent()
        x.date = date
        x.id = e.str("id"); x.cal = e.str("cal"); x.title = e.str("title"); x.note = e.str("note")
        let p = e.int("priority"); x.priority = (0...3).contains(p) ? p : 0
        x.done = e.bool("done")
        let t = e.str("time"); x.time = isTime(t) ? t : ""
        let et = e.str("endTime"); x.endTime = !x.time.isEmpty && isTime(et) ? et : ""
        if let n = e["remind"] as? NSNumber { x.remind = n.int64Value }
        else if let s = e["remind"] as? String, let n = Int64(s) { x.remind = n }
        x.days = x.time.isEmpty ? max(1, min(60, e.int("days", 1))) : 1
        x.createdAt = e.long("createdAt")
        if x.id.isEmpty { x.id = "\(x.date.key)|\(x.title)|\(x.createdAt)" }
        return x
    }

    // ---------- 合并（与网页 MC.merge 相同的规则） ----------
    static func merge(_ a: JObj, _ b: JObj) -> JObj {
        let ua = a.long("updatedAt"), ub = b.long("updatedAt")
        var out = ub > ua ? b : a // 先整体复制较新的一份，不认识的字段也一起保留
        var deleted: [String: Int64] = [:]
        for src in [a, b] {
            for (k, v) in src.obj("deleted") ?? [:] {
                let n = (v as? NSNumber)?.int64Value ?? 0
                deleted[k] = max(deleted[k] ?? 0, n)
            }
        }
        func byId(_ key: String) -> [(String, JObj)] {
            var order: [String] = [], map: [String: JObj] = [:]
            for src in [a, b] {
                for e in src.arr(key) {
                    let id = e.str("id")
                    if let old = map[id] { if e.long("updatedAt") > old.long("updatedAt") { map[id] = e } }
                    else { map[id] = e; order.append(id) }
                }
            }
            return order.compactMap { id in map[id].map { (id, $0) } }
        }
        let events: [JObj] = byId("events").compactMap { id, e in
            if let t = deleted[id], t >= e.long("updatedAt") { return nil }
            return e
        }
        let cals: [JObj] = byId("cals").compactMap { id, c in
            if let t = deleted["cal:" + id], t >= c.long("updatedAt") { return nil }
            return c
        }
        let cutoff = Int64(Date().timeIntervalSince1970 * 1000) - 180 * 86_400_000
        deleted = deleted.filter { $0.value >= cutoff }
        func newer(_ k: String) -> JObj {
            guard let x = a.obj(k) else { return b.obj(k) ?? [:] }
            guard let y = b.obj(k) else { return x }
            return y.long("updatedAt") > x.long("updatedAt") ? y : x
        }
        let nc = b.long("coursesAt") > a.long("coursesAt") ? b : a
        out["version"] = max(knownVersion, max(a.int("version"), b.int("version")))
        out["updatedAt"] = max(ua, ub)
        out["events"] = events
        out["deleted"] = deleted
        out["profile"] = newer("profile")
        out["daily"] = newer("daily")
        out["courses"] = nc["courses"] as? [Any] ?? []
        out["coursesAt"] = nc.long("coursesAt")
        out["cals"] = cals
        // 纪念日历的日子、分类：同样按 id 取较新的一份（删除记录 "day:<id>" / "book:<id>"）
        out["days"] = byId("days").compactMap { id, x in
            if let t = deleted["day:" + id], t >= x.long("updatedAt") { return nil }
            return x
        }
        out["books"] = byId("books").compactMap { id, x in
            if let t = deleted["book:" + id], t >= x.long("updatedAt") { return nil }
            return x
        }
        return out
    }
}
