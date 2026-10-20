import AppKit
import Combine
import Security
import ServiceManagement
import UserNotifications
import WidgetKit

/// 提醒与刷新的核心（对应安卓 Engine）：数据变化、同步、换日、唤醒时，
/// 重新预约系统通知（App 退出后也照样准时弹出），并刷新桌面小组件。
@MainActor
final class Engine: ObservableObject {
    static let shared = Engine()

    @Published private(set) var data: CalData
    @Published private(set) var notif = "default" // granted / denied / default
    @Published private(set) var syncing = false
    @Published private(set) var syncText = ""
    /// 网页那边需要更新状态（权限、同步结果）
    var onStatus: (() -> Void)?

    private var json: String
    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []

    private init() {
        json = Shared.readJSON()
        data = CalData.parse(json)
        updateSyncText()
    }

    var prefs: UserDefaults { Shared.defaults }

    func start() {
        applyTheme(prefs.string(forKey: "theme") ?? "auto")
        timer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { _ in
            Task { @MainActor in await Engine.shared.pull() }
        }
        let nc = NotificationCenter.default, ws = NSWorkspace.shared.notificationCenter
        observers.append(nc.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) { _ in
            Task { @MainActor in Engine.shared.dayChanged() }
        })
        observers.append(nc.addObserver(forName: .NSSystemTimeZoneDidChange, object: nil, queue: .main) { _ in
            Task { @MainActor in Engine.shared.dayChanged() }
        })
        observers.append(ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in Engine.shared.dayChanged(); await Engine.shared.pull() }
        })
        observers.append(nc.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in await Engine.shared.refreshNotifStatus() }
        })
        Task {
            await refreshNotifStatus()
            await refresh()
            await pull()
        }
    }

    private func dayChanged() {
        data = CalData.parse(json) // 「今天」变了，菜单栏跟着变
        Task { await refresh() }
    }

    // ---------- 数据 ----------
    /// 网页数据有变化时调用。默认与本机已有数据合并；replace=true 时整体替换（清除本机数据时用）
    func put(_ incoming: String, replace: Bool) {
        guard let inc = jparse(incoming) else { return }
        let next: JObj
        if !replace, let cur = jparse(json) { next = CalData.merge(cur, inc) } else { next = inc }
        let out = jstring(next)
        guard out != json else { return }
        json = out
        Shared.writeJSON(out)
        data = CalData.parse(out)
        Task { await refresh() }
    }

    func clearData() {
        json = ""
        Shared.clearJSON()
        data = CalData.parse("")
        Task { await refresh() }
    }

    func setPrefs(_ s: String) {
        guard let o = jparse(s) else { return }
        prefs.set(o.int("weekStart") == 1 ? 1 : 0, forKey: "weekStart")
        let theme = o.str("theme", "auto")
        prefs.set(theme, forKey: "theme")
        prefs.set(o.bool("notify"), forKey: "notify")
        let gist = o.str("gistId")
        if !gist.isEmpty && gist != prefs.string(forKey: "gistId") { prefs.set(gist, forKey: "gistId"); prefs.removeObject(forKey: "etag") }
        applyTheme(theme)
        objectWillChange.send()
        Task { await refresh() }
    }

    func setToken(_ token: String, gistId: String) {
        Keychain.token = token
        if !gistId.isEmpty && gistId != prefs.string(forKey: "gistId") { prefs.set(gistId, forKey: "gistId"); prefs.removeObject(forKey: "etag") }
        if !token.isEmpty { Task { await pull() } }
        updateSyncText()
    }

    func clearAccount(wipe: Bool) {
        Keychain.token = ""
        for k in ["gistId", "etag", "pullAt", "pullErr"] { prefs.removeObject(forKey: k) }
        updateSyncText()
        if wipe { clearData() } else { Task { await refresh() } }
    }

    func applyTheme(_ t: String) {
        NSApp.appearance = t == "light" ? NSAppearance(named: .aqua) : t == "dark" ? NSAppearance(named: .darkAqua) : nil
    }

    func refresh() async {
        WidgetCenter.shared.reloadAllTimelines()
        await schedule()
    }

    // ---------- 通知 ----------
    private var center: UNUserNotificationCenter { UNUserNotificationCenter.current() }

    func refreshNotifStatus() async {
        let s = await center.notificationSettings()
        let v: String
        switch s.authorizationStatus {
        case .authorized, .provisional: v = "granted"
        case .denied: v = "denied"
        default: v = "default"
        }
        if v != notif { notif = v; onStatus?(); await schedule() }
    }

    /// 网页「提醒通知」开关、「去设置」按钮
    func request(_ kind: String) async {
        if kind == "notif" {
            let s = await center.notificationSettings()
            if s.authorizationStatus == .notDetermined {
                _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            } else if s.authorizationStatus == .denied {
                openNotificationSettings()
            }
        } else if kind == "channels" || kind == "app" {
            openNotificationSettings()
        }
        await refreshNotifStatus()
    }

    func openNotificationSettings() {
        let id = Bundle.main.bundleIdentifier ?? ""
        if let u = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=" + id) { NSWorkspace.shared.open(u) }
    }

    private func bodyFor(_ e: CEvent) -> String {
        let t = e.timeLabel(data.h12)
        return I18n.md(e.date.m, e.date.d) + " " + (t.isEmpty ? I18n.t("全天") : t) + (e.note.isEmpty ? "" : " · " + e.note)
    }

    /// 把接下来的提醒交给系统预约：App 退出、电脑睡眠后醒来也会弹出
    private func schedule() async {
        let pending = await center.pendingNotificationRequests()
        let ours = pending.map(\.identifier).filter { $0.hasPrefix("ev:") || $0.hasPrefix("daily@") }
        center.removePendingNotificationRequests(withIdentifiers: ours)
        guard prefs.bool(forKey: "notify"), notif == "granted" else { return }

        let d = data, now = Date()
        var reqs: [UNNotificationRequest] = []
        func at(_ t: Date) -> UNCalendarNotificationTrigger {
            UNCalendarNotificationTrigger(dateMatching: YMD.cal.dateComponents([.year, .month, .day, .hour, .minute, .second], from: t), repeats: false)
        }
        let due = d.events.filter { !$0.done && d.notifies($0) }
            .compactMap { e -> (Date, CEvent)? in
                guard let t = e.fireTime, t > now else { return nil }
                return (t, e)
            }
            .sorted { $0.0 < $1.0 }
        for (t, e) in due.prefix(48) { // 系统对预约数量有上限，只排最近的，数据一变就重排
            let c = UNMutableNotificationContent()
            c.title = e.displayTitle
            c.body = bodyFor(e)
            c.sound = .default
            c.threadIdentifier = "event"
            c.userInfo = ["hash": ""]
            reqs.append(UNNotificationRequest(identifier: "ev:\(e.id)@\(Int(t.timeIntervalSince1970))", content: c, trigger: at(t)))
        }
        if d.dailyOn {
            for k in 0..<7 {
                let day = YMD.today.adding(k), t = day.at(minutes: d.dailyMin)
                if t <= now { continue }
                let open = d.on(day).filter { !$0.done }.count
                let c = UNMutableNotificationContent()
                c.title = open > 0 ? I18n.t("查看今日未完成事件") : I18n.t("今日事件已完成")
                c.body = open > 0 ? I18n.t("今天还有 {0} 件事未完成，点开查看。", open) : I18n.t("今天的事件都完成了。")
                c.sound = .default
                c.threadIdentifier = "daily"
                c.userInfo = ["hash": "#today"]
                reqs.append(UNNotificationRequest(identifier: "daily@" + day.key, content: c, trigger: at(t)))
            }
        }
        for r in reqs { try? await center.add(r) }
    }

    func test(later seconds: Int? = nil) {
        let c = UNMutableNotificationContent()
        c.title = I18n.t(seconds == nil ? "节律 · 测试通知" : "节律 · 后台提醒测试")
        c.body = I18n.t(seconds == nil ? "通知可以正常显示了" : "App 关着也能准时收到提醒。")
        c.sound = .default
        let trig = seconds.map { UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(3, $0)), repeats: false) }
        center.add(UNNotificationRequest(identifier: "test-\(Date().timeIntervalSince1970)", content: c, trigger: trig))
    }

    // ---------- 同步 ----------
    func pull() async {
        let token = Keychain.token
        guard !token.isEmpty, !syncing else { return }
        syncing = true
        updateSyncText()
        let content = await Gist.pull(token: token, prefs: prefs, hasData: !json.isEmpty)
        if let c = content { put(c, replace: false) }
        syncing = false
        updateSyncText()
        onStatus?()
    }

    private func updateSyncText() {
        if syncing { syncText = I18n.t("同步中…"); return }
        if Keychain.token.isEmpty { syncText = I18n.t("未连接 GitHub"); return }
        if let e = prefs.string(forKey: "pullErr"), !e.isEmpty { syncText = e; return }
        let at = prefs.double(forKey: "pullAt")
        if at <= 0 { syncText = ""; return }
        let f = DateFormatter()
        f.locale = Locale(identifier: I18n.zh ? "zh_CN" : I18n.lang)
        f.setLocalizedDateFormatFromTemplate(data.h12 ? "MMMd jmm" : "MMMd HHmm")
        syncText = I18n.t("上次同步 {0}", f.string(from: Date(timeIntervalSince1970: at / 1000)))
    }

    /// 给网页「提醒权限检查」用，字段和安卓一致（Mac 没有精确闹钟和电池限制，固定为 true）
    func status() -> JObj {
        ["notif": notif, "exact": true, "battery": true, "pin": false, "widgets": [String: Int](),
         "token": !Keychain.token.isEmpty, "pullAt": prefs.double(forKey: "pullAt"),
         "pullErr": prefs.string(forKey: "pullErr") ?? ""]
    }

    // ---------- 开机启动 ----------
    var launchAtLogin: Bool {
        get { SMAppService.mainApp.status == .enabled }
        set {
            if newValue { try? SMAppService.mainApp.register() } else { try? SMAppService.mainApp.unregister() }
            objectWillChange.send()
        }
    }
}

/// 只读地从 GitHub Gist 拉取数据（写入仍由网页负责），带 ETag，没变化时只是一个很小的 304 请求
enum Gist {
    static let file = "mcal-calendar.json"

    /// 有新内容时返回 JSON 文本
    static func pull(token: String, prefs: UserDefaults, hasData: Bool) async -> String? {
        let now = Date().timeIntervalSince1970 * 1000
        do {
            var id = prefs.string(forKey: "gistId") ?? ""
            if id.isEmpty {
                id = try await find(token)
                if id.isEmpty { return nil }
                prefs.set(id, forKey: "gistId"); prefs.removeObject(forKey: "etag")
            }
            var req = request("https://api.github.com/gists/" + id, token)
            let etag = prefs.string(forKey: "etag") ?? ""
            if !etag.isEmpty && hasData { req.setValue(etag, forHTTPHeaderField: "If-None-Match") }
            let (body, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 304 { prefs.set(now, forKey: "pullAt"); prefs.removeObject(forKey: "pullErr"); return nil }
            guard code == 200 else {
                prefs.set(code == 401 ? I18n.t("令牌无效或已过期") : code == 404 ? I18n.t("找不到同步数据") : I18n.t("GitHub 返回 {0}", code), forKey: "pullErr")
                return nil
            }
            let g = (try? JSONSerialization.jsonObject(with: body)) as? JObj ?? [:]
            var content: String? = nil
            if let f = g.obj("files")?.obj(file) {
                if f.bool("truncated"), let raw = URL(string: f.str("raw_url")) {
                    let (b, _) = try await URLSession.shared.data(for: request(raw.absoluteString, token))
                    content = String(data: b, encoding: .utf8)
                } else { content = f.str("content") }
            }
            prefs.set((resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "ETag") ?? "", forKey: "etag")
            prefs.set(now, forKey: "pullAt"); prefs.removeObject(forKey: "pullErr")
            return content
        } catch {
            prefs.set(I18n.t("网络错误"), forKey: "pullErr")
            return nil
        }
    }

    private static func find(_ token: String) async throws -> String {
        for page in 1...5 {
            let (b, r) = try await URLSession.shared.data(for: request("https://api.github.com/gists?per_page=100&page=\(page)", token))
            guard (r as? HTTPURLResponse)?.statusCode == 200, let list = (try? JSONSerialization.jsonObject(with: b)) as? [JObj] else { return "" }
            if let g = list.first(where: { $0.obj("files")?[file] != nil }) { return g.str("id") }
            if list.count < 100 { break }
        }
        return ""
    }

    private static func request(_ url: String, _ token: String) -> URLRequest {
        var r = URLRequest(url: URL(string: url)!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        r.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        r.setValue("mcal-mac", forHTTPHeaderField: "User-Agent")
        if !token.isEmpty { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        return r
    }
}

/// GitHub 令牌存在系统钥匙串里
enum Keychain {
    private static let service = "io.github.salmangox.cadence"
    private static let account = "github-token"
    private static var cache: String?

    static var token: String {
        get {
            if let c = cache { return c }
            let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var out: AnyObject?
            let v = SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? (out as? Data).flatMap { String(data: $0, encoding: .utf8) } ?? "" : ""
            cache = v
            return v
        }
        set {
            let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
            SecItemDelete(base as CFDictionary)
            if !newValue.isEmpty {
                var add = base
                add[kSecValueData as String] = Data(newValue.utf8)
                add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
                SecItemAdd(add as CFDictionary, nil)
            }
            cache = newValue
        }
    }
}
