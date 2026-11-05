import Foundation
import EventKit

/// 导入：读系统日历（iPhone / Mac 共用）。系统日历里有 iCloud、谷歌、Outlook / Exchange、Yahoo 等所有在「设置 → 日历 → 账户」里加过的账户。
/// 返回一段时间里的每一次发生（重复事件由系统展开），日期和钟点按本地时间写成字符串——和安卓 SysCal.java、网页解析 .ics 的格式一样（js/calimport.js）
enum SysCal {
    private static let store = EKEventStore()

    static func read(_ json: String) async -> [String: Any] {
        let o = jparse(json) ?? [:]
        let now = Date()
        let from = (o["from"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) } ?? now.addingTimeInterval(-365 * 86400)
        let to = (o["to"] as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue / 1000) } ?? now.addingTimeInterval(730 * 86400)
        // 只要读权限：第一次会弹系统的「允许访问日历」
        let granted: Bool
        do { granted = try await store.requestFullAccessToEvents() } catch { granted = false }
        guard granted else { return ["ok": false, "error": "denied"] }
        store.refreshSourcesIfNecessary()
        let cals = store.calendars(for: .event)
        let dF = DateFormatter(); dF.locale = Locale(identifier: "en_US_POSIX"); dF.dateFormat = "yyyy-MM-dd"
        let tF = DateFormatter(); tF.locale = Locale(identifier: "en_US_POSIX"); tF.dateFormat = "HH:mm"
        var calOut: [[String: Any]] = []
        for c in cals {
            calOut.append(["id": c.calendarIdentifier, "title": c.title, "color": hex(c.cgColor), "source": c.source?.title ?? ""])
        }
        // 系统一次最多查 4 年：按年分段查
        var evOut: [[String: Any]] = []
        var start = from
        while start < to && evOut.count < 20000 {
            let end = min(to, Calendar.current.date(byAdding: .year, value: 1, to: start) ?? to)
            let pred = store.predicateForEvents(withStart: start, end: end, calendars: cals)
            for e in store.events(matching: pred) {
                // 跨段的事件只在开始的那一段算一次
                guard let s = e.startDate, s >= start || start == from, var en = e.endDate else { continue }
                if e.isAllDay, en > s { en = en.addingTimeInterval(-1) }   // 全天事件的结束是第二天 0 点
                var x: [String: Any] = [
                    "uid": (e.calendarItemExternalIdentifier ?? e.eventIdentifier ?? UUID().uuidString),
                    "cal": e.calendar.calendarIdentifier, "title": e.title ?? "",
                    "note": [e.notes, e.location].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "\n"),
                    "recur": e.hasRecurrenceRules, "allDay": e.isAllDay, "date": dF.string(from: s),
                ]
                if e.isAllDay {
                    let days = (Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: s), to: Calendar.current.startOfDay(for: en)).day ?? 0) + 1
                    x["days"] = max(1, days)
                } else {
                    x["time"] = tF.string(from: s); x["endDate"] = dF.string(from: en); x["endTime"] = tF.string(from: en)
                }
                if let a = e.alarms?.first, a.absoluteDate == nil, a.relativeOffset <= 0 { x["remind"] = Int(-a.relativeOffset / 60) }
                evOut.append(x)
            }
            start = end
        }
        return ["ok": true, "calendars": calOut, "events": evOut]
    }

    private static func hex(_ c: CGColor?) -> String {
        guard let c = c, let rgb = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)?.components, rgb.count >= 3 else { return "" }
        return String(format: "#%02X%02X%02X", Int(rgb[0] * 255), Int(rgb[1] * 255), Int(rgb[2] * 255))
    }
}
