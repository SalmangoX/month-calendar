import SwiftUI

/// 课程配色（与网页 sched.js、安卓 CourseColors 逐行一致）：科目定锚点色相，再把整学期的课程在色环上推开。
// 【联动:课程颜色】见 CLAUDE.md「联动分组」
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
    // 【联动:深色调】见 CLAUDE.md「联动分组」
    static func darkTone(_ rgb: UInt32) -> (UInt32, UInt32) {
        let (_, c, h) = toOklch(rgb)
        if c < 0.03 { return (oklch(0.36, c * 0.5, h), oklch(0.935, c * 0.3, h)) }
        let warm = max(0, min(1, (1 - abs(h - 75) / 50) * 1.6))
        return (oklch(0.45 + 0.15 * warm, min(c, 0.15), h), oklch(0.935, min(0.035, c * 0.25), h))
    }

    static func tone(_ h: Double) -> [UInt32] {
        [oklch(0.60, 0.13, h), oklch(0.89, 0.065, h), oklch(0.28, 0.075, h), oklch(0.34, 0.075, h),
         oklch(0.97, 0.02, h), oklch(0.45, 0.09, h), oklch(0.94, 0.03, h), oklch(0.74, 0.13, h)]
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
    /// 小组件的「透明 / 着色」样式（macOS 26 起，系统设置 → 外观）：系统把背景换成液态玻璃，所有颜色都画成白色（着色时是主题色）。
    /// 这时颜色不再能区分东西，只剩不透明度：字一律实色，次要文字约 70%，色块改成约 15% 的白色淡底（和 Apple 自带小组件的透明样式一样），
    /// 白字永远不压在实色的白块上
    var glass = false

    var accentV: UInt32 { dark ? 0xFF8D_B0EA : 0xFF4F_80C4 }   // 和网页 --accent 一致（天蓝）
    var accent: Color { glass ? .white : Color(argb: accentV) }
    /// 加号这种白字的实色按钮：深色模式下用深一点、饱和一点的蓝（浅蓝配白字发灰）
    /// 课表页加号（添加课程）的绿色
    static let course = Color(argb: 0xFF34_A853)
    var fab: Color { Color(argb: dark ? 0xFF5A_93D6 : 0xFF4F_80C4) }
    /// 玻璃样式下：色条、圆点、彩色的字 → 实色白；色块的底 → 淡淡的白
    func ink(_ v: UInt32) -> Color { glass ? .white : Color(argb: v) }
    func wash(_ v: UInt32) -> Color { glass ? .white.opacity(0.15) : Color(argb: v) }
    var appBg: Color { Color(argb: dark ? 0xFF05_0608 : 0xFFF7_FAFC) }
    // iPhone / Mac 小组件：中性的底色和分隔线（和系统自带的小组件一样，不带蓝）
    var bg: Color { Color(argb: dark ? 0xFF1C_1C1E : 0xFFFB_FBFC) }
    var line: Color { glass ? .white.opacity(0.18) : Color(argb: dark ? 0xFF2C_2C2F : 0xFFEA_EAED) }
    var text: Color { glass ? .white : Color(argb: dark ? 0xFFEE_EEF1 : 0xFF17_1B20) }
    var text2: Color { glass ? .white.opacity(0.72) : Color(argb: dark ? 0xFF8C_8E97 : 0xFF74_7B83) }
    var live: Color { glass ? .white.opacity(0.16) : Color(argb: withAlpha(accentV, dark ? 0x3D : 0x29)) }
    /// 与网页一致：--accent-text、--today-dim（今天的淡主色圆）、--sel-bg（当前周的淡底）、--text2
    var accentText: Color { glass ? .white : Color(argb: dark ? 0xFFBC_D2F5 : 0xFF3C_69AE) }
    var todayDim: Color { glass ? .white.opacity(0.2) : Color(argb: withAlpha(accentV, dark ? 0x47 : 0x33)) }
    /// 当前周的底：中性的浅灰（网页 --field），不带蓝
    var weekBand: Color { glass ? .white.opacity(0.07) : Color(argb: dark ? 0x13EC_EEFA : 0x176E_7D91) }
    private var text2V: UInt32 { dark ? 0xFF8F_929B : 0xFF6E_757E }
    #if os(iOS)
    /// iPhone：今天那一格 / 那一列用中性的浅灰，不是蓝色的一片
    var todayCell: Color { glass ? .white.opacity(0.16) : Color(argb: dark ? 0x1AFF_FFFF : 0x0D00_0000) }
    #else
    var todayCell: Color { glass ? .white.opacity(0.16) : Color(argb: withAlpha(accentV, dark ? 0x33 : 0x1F)) }
    #endif
    /// 今天那一格 / 那一列的淡底：和 App 里选中的今天一样，一层很淡的品牌渐变（金黄 → 天蓝），不再是蓝色或灰色的块
    // 【联动:品牌渐变】见 CLAUDE.md「联动分组」
    var todayTint: AnyShapeStyle {
        if glass { return AnyShapeStyle(Color.white.opacity(0.16)) }
        let a: UInt32 = dark ? 0xFFE4_B96B : 0xFFE2_B562, m: UInt32 = dark ? 0xFF80_B1EC : 0xFF74_A8E6
        return AnyShapeStyle(LinearGradient(colors: [Color(argb: withAlpha(a, dark ? 0x38 : 0x29)), Color(argb: withAlpha(m, dark ? 0x2E : 0x24))],
                                            startPoint: .topLeading, endPoint: .bottomTrailing))
    }
    var dim: Color { glass ? .white.opacity(0.42) : Color(argb: 0x8088_8890) }
    /// 「今天」那个实色圆 / 小标签：玻璃样式下改成半透明的白底，上面的字才看得清
    var todayFill: Color { glass ? .white.opacity(0.3) : accent }
    /// 今天的日期圆、「还有几项」小标签：品牌渐变 金黄 → 天蓝 → 亮蓝（和 App 里选中的今天、安卓小组件一样）；玻璃样式下还是半透明白
    var todayStyle: AnyShapeStyle {
        if glass { return AnyShapeStyle(Color.white.opacity(0.3)) }
        let c: [UInt32] = dark ? [0xFFE4_B96B, 0xFF80_B1EC, 0xFF6A_99E2] : [0xFFE2_B562, 0xFF74_A8E6, 0xFF5A_8DDA]
        return AnyShapeStyle(LinearGradient(stops: [.init(color: Color(argb: c[0]), location: 0.06), .init(color: Color(argb: c[1]), location: 0.52), .init(color: Color(argb: c[2]), location: 0.96)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    /// 优先级色（和网页 --p0…--p3 一致）：无 灰 · 低 天蓝 · 中 琥珀金 · 高 朱红（色彩心理学：冷 → 暖）；深色调按同一个 OKLCH 规则算（和网页 MC.darkTone 一样）
    // 【联动:优先级颜色】见 CLAUDE.md「联动分组」
    static let P: [UInt32] = [0xFFA3_A1AD, 0xFF5B_8FD0, 0xFFC9_8A1E, 0xFFD4_472C]
    static let DARK_FILL: [UInt32] = P.map { CourseColors.darkTone($0).0 }
    static let DARK_INK: [UInt32] = P.map { CourseColors.darkTone($0).1 }
    /// 优先级色条的渐变（和网页 store.js 的 GRAD 同一组色标）：低在右端带一点中级，中两端带低级 / 高级，高在左端带一点中级
    // 【联动:优先级色条】见 CLAUDE.md「联动分组」
    static let GRAD_L: [Int: [(CGFloat, UInt32)]] = [1: [(0, 0xFF5B_8FD0), (0.75, 0xFF5B_8FD0), (0.8125, 0xFF6A_9FE0), (0.875, 0xFF77_ABED), (0.9375, 0xFFDA_A258), (1, 0xFFDA_A14F)], 2: [(0, 0xFF79_ACEF), (0.0312, 0xFFDA_A357), (0.0625, 0xFFD9_A04D), (0.0938, 0xFFD3_973A), (0.125, 0xFFC9_8A1E), (0.875, 0xFFC9_8A1E), (0.9062, 0xFFDC_8D2C), (0.9375, 0xFFEB_8D38), (0.9688, 0xFFF3_863E), (1, 0xFFF1_783E)], 3: [(0, 0xFFED_8C39), (0.0625, 0xFFF3_843E), (0.125, 0xFFF0_753D), (0.1875, 0xFFE4_6036), (0.25, 0xFFD4_472C), (1, 0xFFD4_472C)]]
    static let GRAD_D: [Int: [(CGFloat, UInt32)]] = [1: [(0, 0xFF23_5692), (0.75, 0xFF23_5692), (0.8125, 0xFF38_6AA7), (0.875, 0xFF4A_7BB8), (0.9375, 0xFFAD_7833), (1, 0xFFB1_7D2E)], 2: [(0, 0xFF4D_7DBA), (0.0312, 0xFFAD_7A31), (0.0625, 0xFFB1_7D2D), (0.0938, 0xFFB0_7A20), (0.125, 0xFFAC_7305), (0.875, 0xFFAC_7305), (0.9062, 0xFFBB_761C), (0.9375, 0xFFC6_762A), (0.9688, 0xFFCA_7030), (1, 0xFFC5_6330)], 3: [(0, 0xFFC7_752B), (0.0625, 0xFFC9_6E31), (0.125, 0xFFC3_6030), (0.1875, 0xFFB5_4D29), (0.25, 0xFFA3_351F), (1, 0xFFA3_351F)]]
    /// 红色只用于逾期、现在时间的线（和优先级无关）
    static let RED: UInt32 = 0xFFD9_453E

    /// 一个事件的颜色（记录日历没设优先级时用日历颜色）
    func base(_ e: CEvent, _ d: CalData) -> UInt32 { d.calColorOf(e) ?? Pal.P[e.priority] }

    /// 月历色条：(底色, 字色)。浅色实色 + 白字；深色深色调 + 柔白字；
    /// 已完成和网页 .chip.done 一样：同色淡底（浅色 18%、深色 28%）+ 同色偏灰的字
    func chip(_ e: CEvent, _ d: CalData, soft: Bool, out: Bool = false) -> (Color, Color) {
        let col = base(e, d)
        if glass { return soft ? (.white.opacity(0.08), .white.opacity(0.62)) : (.white.opacity(0.18), .white) }
        #if os(iOS)
        // iPhone：和以前的 Scriptable 小组件同一套规则——
        // 已完成：同色很淡的底（浅色 16%、深色 26%）+ 同色的字（75%，不是别的月份再淡到 45%）；
        // 别的月份但没完成：照常的实色块，只是整体半透明（浅色 50%、深色 45%），字还是白的 / 柔白的
        if e.done { return (Color(argb: withAlpha(col, dark ? 0x42 : 0x29)), Color(argb: col).opacity(out ? 0.45 : 0.75)) }
        if out {
            if !dark { return (Color(argb: withAlpha(col, 0x80)), .white) }
            let t: (UInt32, UInt32) = d.calColorOf(e).map { CourseColors.darkTone($0) } ?? (Pal.DARK_FILL[e.priority], Pal.DARK_INK[e.priority])
            return (Color(argb: withAlpha(t.0, 0x73)), Color(argb: t.1).opacity(0.5))
        }
        #endif
        if soft { return (Color(argb: withAlpha(col, dark ? 0x4D : 0x40)), Color(argb: col)) } // 和安卓一样
        if !dark { return (Color(argb: col), .white) }
        if let cc = d.calColorOf(e) { let t = CourseColors.darkTone(cc); return (Color(argb: t.0), Color(argb: t.1)) }
        return (Color(argb: Pal.DARK_FILL[e.priority]), Color(argb: Pal.DARK_INK[e.priority]))
    }

    /// 色条的底：优先级事件画成渐变（没完成、已完成、别的月份、淡色都用同一组色标，透明度和 chip() 里同一种情况一样），
    /// 记录日历颜色、玻璃样式还是实色。【联动:优先级色条】
    func chipFill(_ e: CEvent, _ d: CalData, soft: Bool, out: Bool = false) -> AnyShapeStyle {
        let fill = chip(e, d, soft: soft, out: out).0
        guard !glass, d.calColorOf(e) == nil, Pal.GRAD_L[e.priority] != nil else { return AnyShapeStyle(fill) }
        // (用哪组色标, 透明度)：和 chip() 的分支一一对应
        var useDark = dark, a: UInt32 = 0xFF
        #if os(iOS)
        if e.done { useDark = false; a = dark ? 0x42 : 0x29 }
        else if out { a = dark ? 0x73 : 0x80 }
        else if soft { useDark = false; a = dark ? 0x4D : 0x40 }
        #else
        if soft { useDark = false; a = dark ? 0x4D : 0x40 }
        #endif
        let g = (useDark ? Pal.GRAD_D : Pal.GRAD_L)[e.priority]!
        return AnyShapeStyle(LinearGradient(stops: g.map { .init(color: Color(argb: withAlpha($0.1, a)), location: $0.0) }, startPoint: .leading, endPoint: .trailing))
    }

    /// 课程小色块：(底色, 字色)
    func courseChip(_ code: String, _ d: CalData) -> (Color, Color) {
        let t = d.toneOf(code)
        if glass { return (.white.opacity(0.17), .white) }
        return dark ? (Color(argb: t[CourseColors.CHIP_D]), Color(argb: t[CourseColors.CHIP_INK_D])) : (Color(argb: t[CourseColors.BASE]), .white)
    }
}
