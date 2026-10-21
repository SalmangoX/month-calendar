import SwiftUI

/// 课程配色（与网页 sched.js、安卓 CourseColors 逐行一致）：科目定锚点色相，再把整学期的课程在色环上推开。
enum CourseColors {
    private static let FAM: [(Double, [String])] = [
        (240, ["MAT", "STA"]),
        (205, ["CSI", "ITI", "SEG", "CEG", "ELG", "GNG", "MCG", "CVG", "CHG"]),
        (275, ["PHY", "CHM", "EVS", "GEO", "ERS"]),
        (140, ["BIO", "BCH", "BPS", "ANP", "HSS", "NUT"]),
        (175, ["ECO", "ADM", "FIN"]),
        (58, ["ENG", "FRA", "ESL", "FLS", "LIN", "ESP", "ALL"]),
        (18, ["HIS", "PHI", "CLA", "REL"]),
        (310, ["PSY", "SOC", "POL", "CRM", "ANT"]),
        (345, ["ART", "MUS", "THE", "ARV"]),
    ]
    private static let G0 = 78.0, G1 = 138.0, U = 360 - (138.0 - 78.0)

    /// 一门课的一整套颜色下标
    static let BASE = 0, FILL_L = 1, INK_L = 2, FILL_D = 3, INK_D = 4, CHIP_D = 5, CHIP_INK_D = 6, BAR_D = 7

    private static func toU(_ h: Double) -> Double { h < G0 ? h : h < G1 ? G0 : h - (G1 - G0) }
    private static func toH(_ u: Double) -> Double { u < G0 ? u : u + (G1 - G0) }
    private static func wrap(_ x: Double) -> Double { (x.truncatingRemainder(dividingBy: U) + U).truncatingRemainder(dividingBy: U) }
    private static func sd(_ a: Double, _ b: Double) -> Double { let d = wrap(b - a); return d > U / 2 ? d - U : d }
    private static func pre(_ c: String) -> String { String(c.prefix { $0.isLetter && $0.isASCII }).uppercased() }

    private final class It { var c = "", a = 0.0, p = 0.0 }

    static func hues(_ list: [String]) -> [String: Double] {
        let codes = Array(Set(list)).sorted()
        var anchor: [String: Double] = [:]
        for (h, ps) in FAM { for p in ps { anchor[p] = h } }
        var used = Set<Double>()
        for c in codes { if let a = anchor[pre(c)] { used.insert(a) } }
        let free = FAM.map { $0.0 }.filter { !used.contains($0) }
        let unk = Array(Set(codes.map(pre).filter { anchor[$0] == nil })).sorted()
        for (ui, p) in unk.enumerated() { anchor[p] = free.isEmpty ? FAM[ui % FAM.count].0 : free[ui % free.count] }
        var it: [It] = codes.map { c in let o = It(); o.c = c; o.a = toU(anchor[pre(c)] ?? 240); return o }
        it.sort { $0.a != $1.a ? $0.a < $1.a : $0.c < $1.c }
        let n = it.count
        var out: [String: Double] = [:]
        if n == 0 { return out }
        let D = min(60, (U / Double(n)) * 0.8)
        var groups: [(Double, [It])] = []
        for o in it {
            if let i = groups.firstIndex(where: { $0.0 == o.a }) { groups[i].1.append(o) } else { groups.append((o.a, [o])) }
        }
        for (_, g) in groups { for (k, o) in g.enumerated() { o.p = o.a + (Double(k) - Double(g.count - 1) / 2) * D } }
        for _ in 0..<300 {
            for o in it { o.p += 0.06 * sd(o.p, o.a) }
            push(it, D); push(it, D); push(it, D)
        }
        for _ in 0..<60 { push(it, D) }
        for o in it { out[o.c] = (toH(wrap(o.p)) * 10).rounded() / 10 }
        return out
    }

    private static func push(_ it: [It], _ D: Double) {
        let n = it.count
        for i in 0..<n {
            for j in (i + 1)..<max(i + 1, n) {
                let A = it[i], B = it[j]
                let d = sd(A.p, B.p), ad = abs(d)
                if ad < D { let m = (D - ad) / 2 * (d >= 0 ? 1 : -1) + (ad == 0 ? 0.01 : 0); A.p -= m; B.p += m }
            }
        }
    }

    /// OKLCH → 0xFFRRGGBB；超出屏幕色域时降低彩度
    static func oklch(_ L: Double, _ C: Double, _ H: Double) -> UInt32 {
        var c = C
        while c >= 0 {
            let A = c * cos(H * .pi / 180), B = c * sin(H * .pi / 180)
            let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
            let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
            let s = pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
            let rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                       -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                       -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
            if rgb.allSatisfy({ $0 >= -1e-4 && $0 <= 1.0001 }) {
                var out: UInt32 = 0xFF00_0000
                for k in 0..<3 {
                    let v = min(1, max(0, rgb[k]))
                    let g = v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055
                    out |= UInt32((min(1, max(0, g)) * 255).rounded()) << UInt32(16 - 8 * k)
                }
                return out
            }
            c -= 0.005
        }
        return 0xFF80_8080
    }

    /// 0xRRGGBB → OKLCH（与网页 store.js 的 toOklch 一致）
    static func toOklch(_ rgb: UInt32) -> (Double, Double, Double) {
        var v = [Double((rgb >> 16) & 255) / 255, Double((rgb >> 8) & 255) / 255, Double(rgb & 255) / 255]
        for k in 0..<3 { v[k] = v[k] <= 0.04045 ? v[k] / 12.92 : pow((v[k] + 0.055) / 1.055, 2.4) }
        let l = cbrt(0.4122214708 * v[0] + 0.5363325363 * v[1] + 0.0514459929 * v[2])
        let m = cbrt(0.2119034982 * v[0] + 0.6806995451 * v[1] + 0.1073969566 * v[2])
        let s = cbrt(0.0883024619 * v[0] + 0.2817188376 * v[1] + 0.6299787005 * v[2])
        let L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
        let A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
        let B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        return (L, hypot(A, B), (atan2(B, A) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360))
    }

    /// 深色模式下一个颜色的深色调（底色, 文字）（与网页 MC.darkTone 相同的规则）
    static func darkTone(_ rgb: UInt32) -> (UInt32, UInt32) {
        let (_, c, h) = toOklch(rgb)
        if c < 0.03 { return (oklch(0.36, c * 0.5, h), oklch(0.935, c * 0.3, h)) }
        let warm = max(0, min(1, (1 - abs(h - 75) / 50) * 1.6))
        return (oklch(0.45 + 0.15 * warm, min(c, 0.15), h), oklch(0.935, min(0.035, c * 0.25), h))
    }

    static func tone(_ h: Double) -> [UInt32] {
        [oklch(0.64, 0.095, h), oklch(0.955, 0.03, h), oklch(0.42, 0.085, h), oklch(0.30, 0.045, h),
         oklch(0.86, 0.065, h), oklch(0.42, 0.075, h), oklch(0.935, 0.03, h), oklch(0.70, 0.095, h)]
    }
}

extension Color {
    /// 0xAARRGGBB
    init(argb v: UInt32) {
        self.init(.sRGB, red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255,
                  blue: Double(v & 255) / 255, opacity: Double((v >> 24) & 255) / 255)
    }
}

func withAlpha(_ v: UInt32, _ a: UInt32) -> UInt32 { (v & 0x00FF_FFFF) | (a << 24) }

/// 两个颜色按比例混合（t = a 的占比），和 CSS color-mix(in srgb) 一样
func mix(_ a: UInt32, _ b: UInt32, _ t: Double) -> UInt32 {
    var out: UInt32 = 0xFF00_0000
    for sh in [16, 8, 0] as [UInt32] {
        let x = Double((a >> sh) & 255), y = Double((b >> sh) & 255)
        out |= UInt32((x * t + y * (1 - t)).rounded()) << sh
    }
    return out
}

/// 与网页 styles.css、安卓 colors.xml 相同的配色；深色是专门设计的深色调（不是把浅色压暗）
struct Pal {
    let dark: Bool

    var accentV: UInt32 { dark ? 0xFF8B_A8DE : 0xFF4C_6EAC }
    var accent: Color { Color(argb: accentV) }
    var appBg: Color { Color(argb: dark ? 0xFF05_0608 : 0xFFF7_FAFC) }
    // 和安卓 colors.xml、iOS 小组件同一套颜色
    var bg: Color { Color(argb: dark ? 0xFF1B_1C21 : 0xFFEC_F2F5) }
    var line: Color { Color(argb: dark ? 0xFF29_2A2F : 0xFFDA_E1E5) }
    var text: Color { Color(argb: dark ? 0xFFEE_EEF1 : 0xFF17_1B20) }
    var text2: Color { Color(argb: dark ? 0xFF8C_8E97 : 0xFF74_7B83) }
    var live: Color { Color(argb: withAlpha(accentV, dark ? 0x3D : 0x29)) }
    /// 与网页一致：--accent-text、--today-dim（今天的淡主色圆）、--sel-bg（当前周的淡底）、--text2
    var accentText: Color { Color(argb: dark ? 0xFFAD_C5EF : 0xFF3B_5993) }
    var todayDim: Color { Color(argb: withAlpha(accentV, dark ? 0x47 : 0x33)) }
    /// 当前周的底：中性的浅灰（网页 --field），不带蓝
    var weekBand: Color { Color(argb: dark ? 0x13EC_EEFA : 0x176E_7D91) }
    private var text2V: UInt32 { dark ? 0xFF8F_929B : 0xFF6E_757E }
    var todayCell: Color { Color(argb: withAlpha(accentV, dark ? 0x33 : 0x1F)) }
    var dim: Color { Color(argb: 0x8088_8890) }

    static let P: [UInt32] = [0xFF97_9CA2, 0xFF3C_7DC2, 0xFFD8_8018, 0xFFD9_453E]
    static let DARK_FILL: [UInt32] = [0xFF38_3B3F, 0xFF25_5593, 0xFFBB_6800, 0xFFAC_312C]
    static let DARK_INK: [UInt32] = [0xFFE8_E9EB, 0xFFDD_EBFD, 0xFFFC_E5D3, 0xFFFF_E2DE]

    /// 一个事件的颜色（记录日历没设优先级时用日历颜色）
    func base(_ e: CEvent, _ d: CalData) -> UInt32 { d.calColorOf(e) ?? Pal.P[e.priority] }

    /// 月历色条：(底色, 字色)。浅色实色 + 白字；深色深色调 + 柔白字；
    /// 已完成和网页 .chip.done 一样：同色淡底（浅色 18%、深色 28%）+ 同色偏灰的字
    func chip(_ e: CEvent, _ d: CalData, soft: Bool) -> (Color, Color) {
        let col = base(e, d)
        if soft { return (Color(argb: withAlpha(col, dark ? 0x4D : 0x40)), Color(argb: col)) } // 和安卓一样
        if !dark { return (Color(argb: col), .white) }
        if let cc = d.calColorOf(e) { let t = CourseColors.darkTone(cc); return (Color(argb: t.0), Color(argb: t.1)) }
        return (Color(argb: Pal.DARK_FILL[e.priority]), Color(argb: Pal.DARK_INK[e.priority]))
    }

    /// 课程小色块：(底色, 字色)
    func courseChip(_ code: String, _ d: CalData) -> (Color, Color) {
        let t = d.toneOf(code)
        return dark ? (Color(argb: t[CourseColors.CHIP_D]), Color(argb: t[CourseColors.CHIP_INK_D])) : (Color(argb: t[CourseColors.BASE]), .white)
    }
}
