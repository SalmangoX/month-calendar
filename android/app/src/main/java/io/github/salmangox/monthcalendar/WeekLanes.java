package io.github.salmangox.monthcalendar;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 一周 7 天的事件排位（与网页 calendar.js 的 layWeek 相同）：
 * 跨天事件先占上面的行（开始早、跨得长的在上），单天事件依次填进空位。
 * 不依赖 Android，方便单独测试。
 */
final class WeekLanes<T> {
    static final class Bar<T> {
        final T e;
        int c0, c1, slot;
        Bar(T e, int c) { this.e = e; c0 = c; c1 = c; }
    }

    /** 一段要画出来的横条：从第 a 列到第 b 列，在第 slot 行；open = 延续到上一周 / 下一周（或被「+n」截断）的一端 */
    static final class Seg<T> {
        final T e;
        final int a, b, slot;
        final boolean openL, openR;
        Seg(T e, int a, int b, int slot, boolean openL, boolean openR) {
            this.e = e; this.a = a; this.b = b; this.slot = slot; this.openL = openL; this.openR = openR;
        }
    }

    final List<Bar<T>> bars = new ArrayList<>();
    /** occ.get(列).get(行)：Bar、单天事件（T）或 null（空位） */
    final List<List<Object>> occ = new ArrayList<>();

    static <T> WeekLanes<T> lay(List<List<T>> evsBy, Predicate<T> spans, Comparator<T> order) {
        WeekLanes<T> w = new WeekLanes<>();
        Map<T, Bar<T>> multi = new IdentityHashMap<>();
        for (int c = 0; c < evsBy.size(); c++) {
            w.occ.add(new ArrayList<>());
            for (T e : evsBy.get(c)) {
                if (!spans.test(e)) continue;
                Bar<T> b = multi.get(e);
                if (b == null) { b = new Bar<>(e, c); multi.put(e, b); w.bars.add(b); } else b.c1 = c;
            }
        }
        w.bars.sort((x, y) -> x.c0 != y.c0 ? x.c0 - y.c0
                : (y.c1 - y.c0) != (x.c1 - x.c0) ? (y.c1 - y.c0) - (x.c1 - x.c0)
                : order.compare(x.e, y.e));
        for (Bar<T> b : w.bars) {
            int s = 0;
            while (true) {
                boolean free = true;
                for (int c = b.c0; c <= b.c1; c++) if (get(w.occ.get(c), s) != null) { free = false; break; }
                if (free) break;
                s++;
            }
            b.slot = s;
            for (int c = b.c0; c <= b.c1; c++) put(w.occ.get(c), s, b);
        }
        for (int c = 0; c < evsBy.size(); c++) {
            for (T e : evsBy.get(c)) {
                if (multi.containsKey(e)) continue;
                List<Object> o = w.occ.get(c);
                int s = 0;
                while (get(o, s) != null) s++;
                put(o, s, e);
            }
        }
        return w;
    }

    /**
     * 按每天能显示的行数切出横条：在被「+n」挡住的日子断开，其余连成一整条。
     * startsBefore / endsAfter：这个事件是否从更早开始 / 到更晚结束（在本周第一天之前 / 最后一天之后，或本段之外）。
     */
    List<Seg<T>> segments(int[] lim, ColPred<T> startsHere, ColPred<T> endsHere) {
        List<Seg<T>> out = new ArrayList<>();
        for (Bar<T> b : bars) {
            int c = b.c0;
            while (c <= b.c1) {
                if (b.slot >= lim[c]) { c++; continue; }
                int d = c;
                while (d + 1 <= b.c1 && b.slot < lim[d + 1]) d++;
                out.add(new Seg<>(b.e, c, d, b.slot, !startsHere.test(b.e, c), !endsHere.test(b.e, d)));
                c = d + 1;
            }
        }
        return out;
    }

    interface ColPred<T> { boolean test(T e, int col); }

    static boolean isBar(Object o) { return o instanceof Bar; }

    private static Object get(List<Object> l, int i) { return i < l.size() ? l.get(i) : null; }

    private static void put(List<Object> l, int i, Object v) {
        while (l.size() <= i) l.add(null);
        l.set(i, v);
    }
}
