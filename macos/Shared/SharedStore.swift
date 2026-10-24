import Foundation

/// App 和小组件共用的存储：App Group 容器里的 calendar.json（日历数据）和共用的偏好设置。
enum Shared {
    static let groupID = (Bundle.main.object(forInfoDictionaryKey: "CadenceAppGroup") as? String) ?? ""
    static let urlScheme = "cadence"

    static var defaults: UserDefaults {
        groupID.isEmpty || groupID.hasPrefix(".") ? .standard : (UserDefaults(suiteName: groupID) ?? .standard)
    }

    static var dir: URL { cachedDir }
    private static let cachedDir: URL = {
        if !groupID.isEmpty, !groupID.hasPrefix("."),
           let u = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) { return u }
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Cadence")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    static var dataURL: URL { dir.appendingPathComponent("calendar.json") }

    static func readJSON() -> String { (try? String(contentsOf: dataURL, encoding: .utf8)) ?? "" }
    static func writeJSON(_ s: String) { try? s.write(to: dataURL, atomically: true, encoding: .utf8) }
    static func clearJSON() { try? FileManager.default.removeItem(at: dataURL) }
    /// 读取并解析日历数据。小组件改尺寸、预览时会反复调用，所以记住上一次的结果：
    /// 文件没变（修改时间和大小都一样）就直接用，不再把整份数据重新读一遍、解析一遍
    private static var cache: (Date, Int, CalData)?
    private static let lock = NSLock()
    static func load() -> CalData {
        let a = try? FileManager.default.attributesOfItem(atPath: dataURL.path)
        let m = a?[.modificationDate] as? Date ?? .distantPast, size = (a?[.size] as? NSNumber)?.intValue ?? 0
        lock.lock(); defer { lock.unlock() }
        if let c = cache, c.0 == m, c.1 == size { I18n.set(c.2.langPref); return c.2 }
        let d = CalData.parse(readJSON())
        cache = (m, size, d)
        return d
    }

    static var weekStart: Int { defaults.integer(forKey: "weekStart") == 1 ? 1 : 0 }

    // 小组件翻月：往前/往后翻了几个月；超过 30 分钟没动就回到本月
    static let offsetTTL: TimeInterval = 30 * 60
    static func offset(_ kind: String) -> Int {
        let at = defaults.double(forKey: kind + "At")
        return Date().timeIntervalSince1970 - at > offsetTTL ? 0 : defaults.integer(forKey: kind)
    }
    static func offsetExpiry(_ kind: String) -> Date? {
        guard offset(kind) != 0 else { return nil }
        return Date(timeIntervalSince1970: defaults.double(forKey: kind + "At") + offsetTTL + 1)
    }
    static func setOffset(_ kind: String, _ v: Int) {
        defaults.set(v, forKey: kind)
        defaults.set(Date().timeIntervalSince1970, forKey: kind + "At")
    }

    /// 点小组件打开 App 的链接：cadence://open?hash=today
    static func openURL(_ hash: String = "") -> URL {
        URL(string: "\(urlScheme)://open" + (hash.isEmpty ? "" : "?hash=" + hash))!
    }
}
