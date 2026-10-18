package io.github.salmangox.monthcalendar;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 课程配色（与网页 sched.js / 小组件脚本里的 courseHues、courseTone 逐行一致）：
 * 科目定「锚点色相」，再把这学期的所有课程在色环上推开——有含义（同科目颜色相近）、又整体均匀；
 * 跳过黄绿一带（深色下会发橄榄色）。每门课明度、彩度相同，只有色相不同。不依赖 Android，方便单独测试。
 */
final class CourseColors {
    private static final Object[][] FAM = {
        {240.0, new String[]{"MAT", "STA"}},
        {205.0, new String[]{"CSI", "ITI", "SEG", "CEG", "ELG", "GNG", "MCG", "CVG", "CHG"}},
        {275.0, new String[]{"PHY", "CHM", "EVS", "GEO", "ERS"}},
        {140.0, new String[]{"BIO", "BCH", "BPS", "ANP", "HSS", "NUT"}},
        {175.0, new String[]{"ECO", "ADM", "FIN"}},
        {58.0, new String[]{"ENG", "FRA", "ESL", "FLS", "LIN", "ESP", "ALL"}},
        {18.0, new String[]{"HIS", "PHI", "CLA", "REL"}},
        {310.0, new String[]{"PSY", "SOC", "POL", "CRM", "ANT"}},
        {345.0, new String[]{"ART", "MUS", "THE", "ARV"}},
    };
    private static final double G0 = 78, G1 = 138, U = 360 - (G1 - G0);
    private static final Pattern PRE = Pattern.compile("^[A-Za-z]+");

    /** 一门课的一整套颜色，下标见 BASE…BAR_D */
    static final int BASE = 0, FILL_L = 1, INK_L = 2, FILL_D = 3, INK_D = 4, CHIP_D = 5, CHIP_INK_D = 6, BAR_D = 7;

    private static double toU(double h) { return h < G0 ? h : h < G1 ? G0 : h - (G1 - G0); }
    private static double toH(double u) { return u < G0 ? u : u + (G1 - G0); }
    private static double wrap(double x) { return ((x % U) + U) % U; }
    private static double sd(double a, double b) { double d = wrap(b - a); return d > U / 2 ? d - U : d; }
    private static String pre(String c) { Matcher m = PRE.matcher(c); return m.find() ? m.group().toUpperCase() : ""; }

    private static final class It { String c; double a, p; }

    static Map<String, Double> hues(List<String> list) {
        TreeSet<String> sorted = new TreeSet<>(list);
        List<String> codes = new ArrayList<>(sorted);
        Map<String, Double> anchor = new HashMap<>();
        for (Object[] f : FAM) for (String p : (String[]) f[1]) anchor.put(p, (Double) f[0]);
        Set<Double> used = new HashSet<>();
        for (String c : codes) { Double a = anchor.get(pre(c)); if (a != null) used.add(a); }
        List<Double> free = new ArrayList<>();
        for (Object[] f : FAM) if (!used.contains((Double) f[0])) free.add((Double) f[0]);
        TreeSet<String> unk = new TreeSet<>();
        for (String c : codes) if (!anchor.containsKey(pre(c))) unk.add(pre(c));
        int ui = 0;
        for (String p : unk) { anchor.put(p, free.isEmpty() ? (Double) FAM[ui % FAM.length][0] : free.get(ui % free.size())); ui++; }
        List<It> it = new ArrayList<>();
        for (String c : codes) { It o = new It(); o.c = c; o.a = toU(anchor.get(pre(c))); it.add(o); }
        it.sort((x, y) -> x.a != y.a ? Double.compare(x.a, y.a) : x.c.compareTo(y.c));
        int n = it.size();
        Map<String, Double> out = new LinkedHashMap<>();
        if (n == 0) return out;
        double D = Math.min(60, (U / n) * 0.8);
        Map<Double, List<It>> groups = new LinkedHashMap<>();
        for (It o : it) groups.computeIfAbsent(o.a, k -> new ArrayList<>()).add(o);
        for (List<It> g : groups.values()) for (int k = 0; k < g.size(); k++) g.get(k).p = g.get(k).a + (k - (g.size() - 1) / 2.0) * D;
        for (int r = 0; r < 300; r++) {
            for (It o : it) o.p += 0.06 * sd(o.p, o.a);
            push(it, D); push(it, D); push(it, D);
        }
        for (int r = 0; r < 60; r++) push(it, D);
        for (It o : it) out.put(o.c, Math.round(toH(wrap(o.p)) * 10) / 10.0);
        return out;
    }

    private static void push(List<It> it, double D) {
        int n = it.size();
        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) {
            It A = it.get(i), B = it.get(j);
            double d = sd(A.p, B.p), ad = Math.abs(d);
            if (ad < D) { double m = (D - ad) / 2 * (d >= 0 ? 1 : -1) + (ad == 0 ? 0.01 : 0); A.p -= m; B.p += m; }
        }
    }

    /** OKLCH → 0xFFRRGGBB；超出屏幕色域时降低彩度 */
    static int oklch(double L, double C, double H) {
        for (double c = C; c >= 0; c -= 0.005) {
            double A = c * Math.cos(H * Math.PI / 180), B = c * Math.sin(H * Math.PI / 180);
            double l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
            double[] rgb = {4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s};
            boolean ok = true;
            for (double v : rgb) if (v < -1e-4 || v > 1.0001) { ok = false; break; }
            if (ok) {
                int out = 0xFF000000;
                for (int k = 0; k < 3; k++) {
                    double v = Math.min(1, Math.max(0, rgb[k]));
                    double g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
                    out |= (int) Math.round(Math.min(1, Math.max(0, g)) * 255) << (16 - 8 * k);
                }
                return out;
            }
        }
        return 0xFF808080;
    }

    static int[] tone(double h) {
        return new int[]{oklch(.64, .095, h), oklch(.955, .03, h), oklch(.42, .085, h), oklch(.30, .045, h),
                oklch(.86, .065, h), oklch(.42, .075, h), oklch(.935, .03, h), oklch(.70, .095, h)};
    }
}
