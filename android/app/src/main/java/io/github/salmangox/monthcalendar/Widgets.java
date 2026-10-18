package io.github.salmangox.monthcalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.util.SizeF;
import android.widget.RemoteViews;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 三种桌面小组件的绘制。只用 RemoteViews 支持的控件和方法，深浅色跟随系统自动切换。 */
final class Widgets {
    static final String ACT_PREV = "io.github.salmangox.monthcalendar.PREV";
    static final String ACT_NEXT = "io.github.salmangox.monthcalendar.NEXT";
    static final String ACT_HOME = "io.github.salmangox.monthcalendar.HOME";
    private static final String[] WD = {"日", "一", "二", "三", "四", "五", "六"};
    private static final int WHITE = 0xFFFFFFFF;
    /** 不在本月的日期：半透明灰，浅色和深色背景上都合适 */
    private static final int DIM = 0x80888890;
    private static final int[] PALETTE = {0xFF5D7895, 0xFF5F9479, 0xFFC38F45, 0xFFBE6662, 0xFF86769F, 0xFF4E8C92, 0xFF6170A3, 0xFF9A7B5C};
    private static final int[] CHIP = {R.drawable.chip_p0, R.drawable.chip_p1, R.drawable.chip_p2, R.drawable.chip_p3};
    private static final int[] SOFT = {R.drawable.chip_p0_soft, R.drawable.chip_p1_soft, R.drawable.chip_p2_soft, R.drawable.chip_p3_soft};
    private static final int[] DOT = {R.drawable.dot_p0, R.drawable.dot_p1, R.drawable.dot_p2, R.drawable.dot_p3};
    private static final int[] BAR = {R.drawable.bar_p0, R.drawable.bar_p1, R.drawable.bar_p2, R.drawable.bar_p3};
    private static final int[] PCOL = {R.color.p0, R.color.p1, R.color.p2, R.color.p3};

    private Widgets() { }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, MonthWidget.class))) m.updateAppWidget(id, month(c, id, m.getAppWidgetOptions(id)));
        for (int id : m.getAppWidgetIds(new ComponentName(c, TodayWidget.class))) updateList(c, m, id, today(c));
        for (int id : m.getAppWidgetIds(new ComponentName(c, SchedWidget.class))) m.updateAppWidget(id, sched(c, id, m.getAppWidgetOptions(id)));
    }

    static int count(Context c, Class<?> cls) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, cls)).length;
    }

    private static void updateList(Context c, AppWidgetManager m, int id, RemoteViews rv) {
        m.updateAppWidget(id, rv);
    }

    // ---------- 资源 id（42 个格子，按名字查一次后缓存） ----------
    private static int[] N, CELL, MORE, DOTS, WDAY, BARS;
    private static int[][] EV, OD;

    private static synchronized void ids(Context c) {
        if (N != null) return;
        String pkg = c.getPackageName();
        android.content.res.Resources r = c.getResources();
        N = new int[42]; CELL = new int[42]; MORE = new int[42]; DOTS = new int[42]; WDAY = new int[7];
        EV = new int[42][3]; OD = new int[42][3];
        for (int i = 0; i < 42; i++) {
            N[i] = r.getIdentifier("n" + i, "id", pkg);
            CELL[i] = r.getIdentifier("c" + i, "id", pkg);
            MORE[i] = r.getIdentifier("m" + i, "id", pkg);
            DOTS[i] = r.getIdentifier("g" + i, "id", pkg);
            for (int k = 0; k < 3; k++) {
                EV[i][k] = r.getIdentifier("e" + i + "_" + k, "id", pkg);
                OD[i][k] = r.getIdentifier("o" + i + "_" + k, "id", pkg);
            }
        }
        for (int k = 0; k < 7; k++) WDAY[k] = r.getIdentifier("wd" + k, "id", pkg);
        BARS = new int[6];
        for (int k = 0; k < 6; k++) BARS[k] = r.getIdentifier("b" + k, "id", pkg);
    }

    // ---------- 整月 ----------
    /** 这个小组件当前往前/往后翻了几个月；超过 30 分钟没动就回到本月 */
    static int offset(Context c, int id) {
        SharedPreferences p = Store.prefs(c);
        if (System.currentTimeMillis() - p.getLong("moffAt_" + id, 0) > 30 * 60_000L) return 0;
        return p.getInt("moff_" + id, 0);
    }

    static void setOffset(Context c, int id, int off) {
        Store.prefs(c).edit().putInt("moff_" + id, off).putLong("moffAt_" + id, System.currentTimeMillis()).apply();
    }

    static RemoteViews month(Context c, int id, Bundle opts) {
        ids(c);
        // 折叠屏的外屏和内屏、横竖屏尺寸不同：每种尺寸按格子高度决定每格显示几条事件
        List<SizeF> sizes = new ArrayList<>();
        if (opts != null) {
            @SuppressWarnings("deprecation")
            ArrayList<SizeF> s = opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (s != null) sizes.addAll(s);
        }
        if (sizes.isEmpty()) {
            int h = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            int w = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            return monthViews(c, id, capacity(h > 0 ? h : 300), w > 0 ? w : 320);
        }
        // 跨天横条要按实际宽度画，所以按「每格条数 + 宽度」分别生成
        Map<String, RemoteViews> byCap = new HashMap<>();
        Map<SizeF, RemoteViews> map = new HashMap<>();
        for (SizeF s : sizes) {
            int cap = capacity(s.getHeight());
            String key = cap + "x" + Math.round(s.getWidth());
            RemoteViews rv = byCap.get(key);
            if (rv == null) { rv = monthViews(c, id, cap, s.getWidth()); byCap.put(key, rv); }
            map.put(s, rv);
        }
        if (byCap.size() == 1) return byCap.values().iterator().next();
        return new RemoteViews(map);
    }

    /** 每格能放几条事件：≥1 显示色条；0 显示圆点；-1 只显示日期 */
    private static int capacity(float heightDp) {
        float cell = (heightDp - 4 - 26 - 15 - 0.6f) / 6f;
        float room = cell - 1.5f - 17f;
        int cap = (int) Math.floor((room - 0.5f) / 14.5f);
        if (cap >= 1) return Math.min(cap, 3);
        return room >= 7 ? 0 : -1;
    }

    private static RemoteViews monthViews(Context c, int id, int cap, float widthDp) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_month);
        Data d = Store.data(c);
        int ws = Store.prefs(c).getInt("weekStart", 0) == 1 ? 1 : 0;
        int off = offset(c, id);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        YearMonth ym = YearMonth.from(today).plusMonths(off);
        LocalDate first = ym.atDay(1);
        int jsDay = first.getDayOfWeek().getValue() % 7; // 周日 = 0，与网页一致
        LocalDate start = first.minusDays((jsDay - ws + 7) % 7);

        rv.setTextViewText(R.id.m_title, ym.getMonthValue() + "月");
        rv.setTextViewText(R.id.m_year, String.valueOf(ym.getYear()));
        rv.setViewVisibility(R.id.m_today, off == 0 ? android.view.View.GONE : android.view.View.VISIBLE);
        for (int k = 0; k < 7; k++) rv.setTextViewText(WDAY[k], WD[(k + ws) % 7]);

        for (int i = 0; i < 42; i++) {
            LocalDate day = start.plusDays(i);
            boolean in = day.getMonthValue() == ym.getMonthValue();
            rv.setTextViewText(N[i], String.valueOf(day.getDayOfMonth()));
            if (day.equals(today)) {
                rv.setInt(N[i], "setBackgroundResource", R.drawable.today_bg);
                rv.setTextColor(N[i], WHITE);
            } else if (!in) {
                rv.setTextColor(N[i], DIM);
            }
            List<Data.Event> evs = d.on(day);
            if (evs.isEmpty() || cap >= 1) continue; // 有色条时按周排位，见下面
            if (cap == 0) {
                int k = 0;
                for (Data.Event e : evs) {
                    if (e.done || k >= 3) continue;
                    rv.setViewVisibility(OD[i][k], android.view.View.VISIBLE);
                    rv.setImageViewResource(OD[i][k], DOT[e.priority]);
                    k++;
                }
                if (k > 0) rv.setViewVisibility(DOTS[i], android.view.View.VISIBLE);
            }
        }

        // 色条：按周排位。跨天的全天事件画成一整条横条（盖在格子上面，跨过格子之间的线），单天事件放进自己那一行
        if (cap >= 1) {
            for (int r = 0; r < 6; r++) {
                List<List<Data.Event>> evsBy = new ArrayList<>();
                for (int k = 0; k < 7; k++) evsBy.add(d.on(start.plusDays(r * 7 + k)));
                WeekLanes<Data.Event> lay = WeekLanes.lay(evsBy, e -> e.days > 1 && e.time.isEmpty(), Data.ORDER);
                int[] lim = new int[7];
                for (int k = 0; k < 7; k++) {
                    int i = r * 7 + k;
                    List<Object> o = lay.occ.get(k);
                    lim[k] = o.size() <= cap ? o.size() : cap - 1;
                    boolean in = start.plusDays(i).getMonthValue() == ym.getMonthValue();
                    for (int s = 0; s < lim[k]; s++) {
                        Object it = o.get(s);
                        if (it == null || WeekLanes.isBar(it)) rv.setViewVisibility(EV[i][s], android.view.View.INVISIBLE); // 占位，让下面的事件和横条对齐
                        else chip(c, rv, EV[i][s], (Data.Event) it, in);
                    }
                    int hidden = 0;
                    for (int s = lim[k]; s < o.size(); s++) if (o.get(s) != null) hidden++;
                    if (hidden > 0) {
                        rv.setViewVisibility(MORE[i], android.view.View.VISIBLE);
                        rv.setTextViewText(MORE[i], "+" + hidden);
                    }
                }
                final LocalDate wk0 = start.plusDays(r * 7L);
                List<WeekLanes.Seg<Data.Event>> segs = lay.segments(lim,
                        (e, col) -> e.date.equals(wk0.plusDays(col)), (e, col) -> e.end().equals(wk0.plusDays(col)));
                if (segs.isEmpty()) continue;
                int lanes = 0;
                for (WeekLanes.Seg<Data.Event> g : segs) lanes = Math.max(lanes, g.slot + 1);
                // 浅色、深色各画一张，桌面切换深浅色时自动换（和格子里的色条一样跟着系统走）
                rv.setIcon(BARS[r], "setImageIcon",
                        Icon.createWithBitmap(barsBitmap(c, segs, widthDp, lanes, wk0, ym, false)),
                        Icon.createWithBitmap(barsBitmap(c, segs, widthDp, lanes, wk0, ym, true)));
                rv.setViewLayoutHeight(BARS[r], lanes * SLOT_DP - 1f, android.util.TypedValue.COMPLEX_UNIT_DIP);
                rv.setViewVisibility(BARS[r], android.view.View.VISIBLE);
            }
        }

        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "", 100 + id));
        rv.setOnClickPendingIntent(R.id.m_prev, action(c, id, ACT_PREV, 1));
        rv.setOnClickPendingIntent(R.id.m_next, action(c, id, ACT_NEXT, 2));
        rv.setOnClickPendingIntent(R.id.m_today, action(c, id, ACT_HOME, 3));
        return rv;
    }

    /** 深色模式的色条：专门设计的深色调和文字色（与应用 MC.PAL.dark 一致），下标 = 优先级 */
    private static final int[] DARK_FILL = {0xFF383B3F, 0xFF255593, 0xFFBB6800, 0xFFAC312C};
    private static final int[] DARK_INK = {0xFFE8E9EB, 0xFFDDEBFD, 0xFFFCE5D3, 0xFFFFE2DE};

    private static int alpha(int col, int a) { return (col & 0x00FFFFFF) | (a << 24); }

    /** 格子里一行的高度：色条 13.5dp + 上间距 1dp（与 widget_month.xml 一致） */
    private static final float SLOT_DP = 14.5f;

    /**
     * 一周的跨天横条画成一张透明图：和格子里的色条同样的颜色、圆角、字号；
     * 延续到上一周 / 下一周的一端是平的。图片宽度 = 小组件宽度，7 等分对应 7 个格子。
     */
    private static Bitmap barsBitmap(Context c, List<WeekLanes.Seg<Data.Event>> segs, float widthDp, int lanes, LocalDate wk0, YearMonth ym, boolean dark) {
        // 最多按 2.5 倍画：折叠屏内屏很宽、又有好几种尺寸，太大的图会超过小组件的内存上限
        float sc = Math.min(2.5f, c.getResources().getDisplayMetrics().density);
        int W = Math.max(1, Math.round(widthDp * sc)), H = Math.max(1, Math.round((lanes * SLOT_DP - 1f) * sc));
        Bitmap bm = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        cv.scale(sc, sc);
        float cw = widthDp / 7f, h = 13.5f, rad = 3.5f;
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(9f);
        // 字重和格子里的色条一致：浅色 700、深色 500
        text.setTypeface(Typeface.create(Typeface.DEFAULT, dark ? 500 : 700, false));
        Paint.FontMetrics fm = text.getFontMetrics();
        for (WeekLanes.Seg<Data.Event> g : segs) {
            Data.Event e = g.e;
            boolean out = true; // 整段都不在本月：和格子里的色条一样变淡
            for (int k = g.a; k <= g.b; k++) if (wk0.plusDays(k).getMonthValue() == ym.getMonthValue()) { out = false; break; }
            boolean softy = e.done || out;
            float x0 = g.a * cw + (g.openL ? 0 : 1), x1 = (g.b + 1) * cw - (g.openR ? 0 : 1), y = g.slot * SLOT_DP;
            int col = c.getColor(PCOL[e.priority]);
            // 颜色和格子里的色条一样：浅色实色 + 白字；深色用专门的深色调 + 柔白字；已完成 / 不在本月用淡色（与 p*_soft 相同的透明度）
            fill.setColor(softy ? alpha(col, dark ? 0x4D : 0x40) : dark ? DARK_FILL[e.priority] : col);
            cv.drawPath(barPath(x0, y, x1 - x0, h, rad, g.openL, g.openR), fill);
            text.setColor(softy ? col : dark ? DARK_INK[e.priority] : WHITE);
            text.setStrikeThruText(e.done);
            cv.save();
            cv.clipRect(x0 + 1.5f, y, x1 - 1f, y + h);
            String title = e.title.isEmpty() ? "（无标题）" : e.title;
            cv.drawText(title, x0 + 2.5f, y + h / 2f - (fm.ascent + fm.descent) / 2f, text);
            cv.restore();
        }
        return bm;
    }

    /** 只在没有延续的一端做圆角 */
    private static android.graphics.Path barPath(float x, float y, float w, float h, float r, boolean openL, boolean openR) {
        float rl = openL ? 0 : r, rr = openR ? 0 : r;
        android.graphics.Path p = new android.graphics.Path();
        p.addRoundRect(new RectF(x, y, x + w, y + h), new float[]{rl, rl, rr, rr, rr, rr, rl, rl}, android.graphics.Path.Direction.CW);
        return p;
    }

    private static void chip(Context c, RemoteViews rv, int vid, Data.Event e, boolean inMonth) {
        String title = e.title.isEmpty() ? "（无标题）" : e.title;
        rv.setViewVisibility(vid, android.view.View.VISIBLE);
        if (e.done) {
            SpannableString s = new SpannableString(title);
            s.setSpan(new StrikethroughSpan(), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            rv.setTextViewText(vid, s);
        } else {
            rv.setTextViewText(vid, title);
        }
        if (e.done || !inMonth) {
            rv.setInt(vid, "setBackgroundResource", SOFT[e.priority]);
            rv.setTextColor(vid, c.getColor(PCOL[e.priority]));
        } else {
            rv.setInt(vid, "setBackgroundResource", CHIP[e.priority]); // 底色：深色时是 52% 透明（values-night）
            // 字色：浅色白字；深色是带 20% 事件色的柔白，和应用一致。桌面切换深浅色时自动跟着变
            rv.setColorInt(vid, "setTextColor", WHITE, DARK_INK[e.priority]);
        }
    }

    private static PendingIntent action(Context c, int id, String act, int k) {
        Intent i = new Intent(c, MonthWidget.class).setAction(act).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(c, id * 8 + k, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---------- 今日 ----------
    static String dayLabel(LocalDate d, LocalDate today) {
        long n = ChronoUnit.DAYS.between(today, d);
        String md = d.getMonthValue() + "月" + d.getDayOfMonth() + "日 周" + WD[d.getDayOfWeek().getValue() % 7];
        if (n == 0) return "今天 · " + md;
        if (n == 1) return "明天 · " + md;
        if (n == 2) return "后天 · " + md;
        return md;
    }

    private static String rel(LocalDate d, LocalDate today) {
        long n = ChronoUnit.DAYS.between(today, d);
        return n == 0 ? "今天" : n == 1 ? "明天" : n == -1 ? "昨天" : n > 0 ? n + " 天后" : (-n) + " 天前";
    }

    static RemoteViews today(Context c) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        Data d = Store.data(c);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        rv.setTextViewText(R.id.l_title, "今天");
        rv.setTextViewText(R.id.l_sub, today.getMonthValue() + "月" + today.getDayOfMonth() + "日 周" + WD[today.getDayOfWeek().getValue() % 7]);

        RemoteViews.RemoteCollectionItems.Builder b = new RemoteViews.RemoteCollectionItems.Builder()
                .setHasStableIds(false).setViewTypeCount(2);
        int n = 0;
        long key = 0;
        // 已逾期：最近 30 天内结束、还没完成的
        List<Data.Event> over = new ArrayList<>();
        for (Data.Event e : d.events) {
            if (e.done || !e.cal.isEmpty()) continue;
            LocalDate end = e.end();
            if (end.isBefore(today) && !end.isBefore(today.minusDays(30))) over.add(e);
        }
        over.sort((x, y) -> y.date.compareTo(x.date));
        if (!over.isEmpty()) {
            b.addItem(key++, header(c, "已逾期", c.getColor(R.color.p3)));
            for (Data.Event e : over) {
                if (n++ >= 10) break;
                b.addItem(key++, eventRow(c, e, rel(e.date, today)));
            }
        }
        List<Data.Event> todays = d.on(today);
        if (!todays.isEmpty()) {
            if (!over.isEmpty()) b.addItem(key++, header(c, "今天", 0));
            for (Data.Event e : todays) b.addItem(key++, eventRow(c, e, null));
        }
        int later = 0;
        for (int k = 1; k <= 7; k++) {
            LocalDate day = today.plusDays(k);
            List<Data.Event> evs = new ArrayList<>();
            for (Data.Event e : d.on(day)) if (!e.done && !e.date.isBefore(day)) evs.add(e); // 多天事件只在第一天列出
            if (evs.isEmpty()) continue;
            b.addItem(key++, header(c, dayLabel(day, today), 0));
            for (Data.Event e : evs) { b.addItem(key++, eventRow(c, e, null)); later++; }
        }
        boolean empty = over.isEmpty() && todays.isEmpty() && later == 0;
        rv.setViewVisibility(R.id.l_empty, empty ? android.view.View.VISIBLE : android.view.View.GONE);
        rv.setViewVisibility(R.id.l_list, empty ? android.view.View.GONE : android.view.View.VISIBLE);
        if (empty) rv.setTextViewText(R.id.l_empty, Store.hasData(c) ? "今天没有事件\n接下来一周也很空闲" : "打开节律 App\n同步一次后这里会显示事件");
        rv.setRemoteAdapter(R.id.l_list, b.build());
        rv.setPendingIntentTemplate(R.id.l_list, template(c, 201));
        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "#today", 202));
        rv.setOnClickPendingIntent(R.id.l_empty, Engine.openApp(c, "#today", 203));
        return rv;
    }

    private static RemoteViews header(Context c, String text, int color) {
        RemoteViews h = new RemoteViews(c.getPackageName(), R.layout.item_header);
        h.setTextViewText(R.id.it_head, text);
        if (color != 0) h.setTextColor(R.id.it_head, color);
        return h;
    }

    private static RemoteViews eventRow(Context c, Data.Event e, String prefix) {
        RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.item_event);
        String title = e.title.isEmpty() ? "（无标题）" : e.title;
        if (e.done) {
            SpannableString s = new SpannableString(title);
            s.setSpan(new StrikethroughSpan(), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            r.setTextViewText(R.id.it_title, s);
            r.setInt(R.id.it_bar, "setBackgroundResource", SOFT[e.priority]);
        } else {
            r.setTextViewText(R.id.it_title, title);
            r.setInt(R.id.it_bar, "setBackgroundResource", BAR[e.priority]);
        }
        String t = e.timeLabel();
        String sub = (prefix != null ? prefix + " · " : "") + (t.isEmpty() ? "全天" : t);
        if (e.days > 1) sub += " · " + e.days + " 天";
        if (!e.note.isEmpty()) sub += " · " + e.note.replace('\n', ' ');
        r.setTextViewText(R.id.it_sub, sub);
        r.setOnClickFillInIntent(R.id.it_root, new Intent().putExtra(MainActivity.EXTRA_HASH, "#today"));
        return r;
    }

    private static PendingIntent template(Context c, int req) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    // ---------- 课表：按小组件大小切换（2×2 单日 / 4×2 横向本周 / 4×4 整月） ----------
    private static final int DAY = 0, WEEK = 1, MONTH = 2;
    // 按形状判断，不用固定高度：三星 One UI（尤其 Fold 的内外屏）每格的高度差别很大
    // 窄（约 2 格宽）= 单日；明显横向的长条 = 本周；接近方形或更高 = 整月
    private static int schedKind(float wDp, float hDp) {
        if (wDp < 250) return DAY;
        if (hDp <= 0 || wDp / hDp >= 1.3f) return WEEK;
        return MONTH;
    }
    static RemoteViews sched(Context c, int id, Bundle opts) {
        List<SizeF> sizes = new ArrayList<>();
        if (opts != null) {
            @SuppressWarnings("deprecation")
            ArrayList<SizeF> s = opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (s != null) sizes.addAll(s);
        }
        if (sizes.isEmpty()) {
            int w = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = opts == null ? 0 : opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            int kind = schedKind(w > 0 ? w : 160, h > 0 ? h : 160);
            return kind == MONTH ? schedGrid(c, w > 0 ? w : 320, h > 0 ? h : 320) : schedOf(c, id, kind, h > 0 ? h : 300);
        }
        Map<String, RemoteViews> byKind = new HashMap<>();
        Map<SizeF, RemoteViews> map = new HashMap<>();
        for (SizeF s : sizes) {
            int kind = schedKind(s.getWidth(), s.getHeight());
            String key = kind == MONTH ? "g" + Math.round(s.getWidth()) + "x" + Math.round(s.getHeight()) : String.valueOf(kind);
            RemoteViews rv = byKind.get(key);
            if (rv == null) { rv = kind == MONTH ? schedGrid(c, s.getWidth(), s.getHeight()) : schedOf(c, id, kind, s.getHeight()); byKind.put(key, rv); }
            map.put(s, rv);
        }
        if (byKind.size() == 1) return byKind.values().iterator().next();
        return new RemoteViews(map);
    }
    private static RemoteViews schedOf(Context c, int id, int kind, float hDp) {
        if (kind == WEEK) return schedWeek(c);
        if (kind == MONTH) return schedMonth(c, id, capacity(hDp));
        return schedDay(c);
    }
    static int courseDrawable(String code) {
        long h = 0;
        for (int i = 0; i < code.length(); i++) h = (h * 31 + code.charAt(i)) & 0xFFFFFFFFL;
        return CRS[(int) (h % CRS.length)];
    }
    private static final int[] CRS = {R.drawable.crs0, R.drawable.crs1, R.drawable.crs2, R.drawable.crs3, R.drawable.crs4, R.drawable.crs5, R.drawable.crs6, R.drawable.crs7};
    private static int[] WKC, WKH, WKM;
    private static int[][] WKE;
    private static synchronized void weekIds(Context c) {
        if (WKC != null) return;
        android.content.res.Resources r = c.getResources();
        String pkg = c.getPackageName();
        WKC = new int[7]; WKH = new int[7]; WKM = new int[7]; WKE = new int[7][5];
        for (int d = 0; d < 7; d++) {
            WKC[d] = r.getIdentifier("wk_c" + d, "id", pkg);
            WKH[d] = r.getIdentifier("wk_h" + d, "id", pkg);
            WKM[d] = r.getIdentifier("wk_m" + d, "id", pkg);
            for (int k = 0; k < 5; k++) WKE[d][k] = r.getIdentifier("wk_e" + d + "_" + k, "id", pkg);
        }
    }

    /** 横向本周：每天一列，课程按时间排成色块（周末有课才显示） */
    static RemoteViews schedWeek(Context c) {
        weekIds(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_week);
        Data d = Store.data(c);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        LocalDate mon = today.minusDays(today.getDayOfWeek().getValue() - 1);
        LocalDate sun = mon.plusDays(6);
        rv.setTextViewText(R.id.wk_sub, mon.getMonthValue() + "/" + mon.getDayOfMonth() + " – " + sun.getMonthValue() + "/" + sun.getDayOfMonth());
        for (int i = 0; i < 7; i++) {
            LocalDate date = mon.plusDays(i);
            List<Data.Course> l = new ArrayList<>();
            for (Data.Course co : d.courses) if (co.on(date)) l.add(co);
            boolean show = i < 5 || !l.isEmpty();
            rv.setViewVisibility(WKC[i], show ? android.view.View.VISIBLE : android.view.View.GONE);
            if (!show) continue;
            boolean isToday = date.equals(today);
            rv.setTextViewText(WKH[i], "周" + WD[(i + 1) % 7] + "\n" + date.getDayOfMonth());
            rv.setTextColor(WKH[i], isToday ? c.getColor(R.color.accent) : c.getColor(R.color.w_text2));
            if (isToday) rv.setInt(WKC[i], "setBackgroundResource", R.drawable.wk_today);
            int shown = l.size() > 5 ? 4 : l.size();
            for (int k = 0; k < 5; k++) {
                if (k < shown) {
                    Data.Course co = l.get(k);
                    rv.setViewVisibility(WKE[i][k], android.view.View.VISIBLE);
                    rv.setTextViewText(WKE[i][k], co.code + "\n" + co.start);
                    rv.setInt(WKE[i][k], "setBackgroundResource", courseDrawable(co.code));
                } else rv.setViewVisibility(WKE[i][k], android.view.View.INVISIBLE);
            }
            if (l.size() > 5) { rv.setViewVisibility(WKM[i], android.view.View.VISIBLE); rv.setTextViewText(WKM[i], "+" + (l.size() - 4)); }
        }
        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "#sched", 304));
        return rv;
    }

    /** 整月课表：每天显示当天的课（按日期范围和隔周），可左右翻月 */
    static RemoteViews schedMonth(Context c, int id, int cap) {
        ids(c);
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_month);
        Data d = Store.data(c);
        int ws = Store.prefs(c).getInt("weekStart", 0) == 1 ? 1 : 0;
        int off = schedOffset(c, id);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        YearMonth ym = YearMonth.from(today).plusMonths(off);
        LocalDate first = ym.atDay(1);
        int jsDay = first.getDayOfWeek().getValue() % 7;
        LocalDate start = first.minusDays((jsDay - ws + 7) % 7);
        rv.setTextViewText(R.id.m_title, ym.getMonthValue() + "月课表");
        rv.setTextViewText(R.id.m_year, String.valueOf(ym.getYear()));
        rv.setViewVisibility(R.id.m_today, off == 0 ? android.view.View.GONE : android.view.View.VISIBLE);
        for (int k = 0; k < 7; k++) rv.setTextViewText(WDAY[k], WD[(k + ws) % 7]);
        int perCell = Math.max(1, cap);
        for (int i = 0; i < 42; i++) {
            LocalDate day = start.plusDays(i);
            boolean in = day.getMonthValue() == ym.getMonthValue();
            rv.setTextViewText(N[i], String.valueOf(day.getDayOfMonth()));
            if (day.equals(today)) {
                rv.setInt(N[i], "setBackgroundResource", R.drawable.today_bg);
                rv.setTextColor(N[i], WHITE);
            } else if (!in) rv.setTextColor(N[i], DIM);
            List<Data.Course> l = new ArrayList<>();
            for (Data.Course co : d.courses) if (co.on(day)) l.add(co);
            if (l.isEmpty()) continue;
            int show = l.size() > perCell ? perCell - 1 : l.size();
            for (int k = 0; k < Math.min(show, 3); k++) {
                Data.Course co = l.get(k);
                rv.setViewVisibility(EV[i][k], android.view.View.VISIBLE);
                rv.setTextViewText(EV[i][k], co.code);
                rv.setInt(EV[i][k], "setBackgroundResource", courseDrawable(co.code));
            }
            if (l.size() > show) {
                rv.setViewVisibility(MORE[i], android.view.View.VISIBLE);
                rv.setTextViewText(MORE[i], "+" + (l.size() - show));
            }
        }
        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "#sched", 305 + id));
        rv.setOnClickPendingIntent(R.id.m_prev, schedAction(c, id, ACT_PREV, 5));
        rv.setOnClickPendingIntent(R.id.m_next, schedAction(c, id, ACT_NEXT, 6));
        rv.setOnClickPendingIntent(R.id.m_today, schedAction(c, id, ACT_HOME, 7));
        return rv;
    }
    static int schedOffset(Context c, int id) {
        SharedPreferences p = Store.prefs(c);
        if (System.currentTimeMillis() - p.getLong("soffAt_" + id, 0) > 30 * 60_000L) return 0;
        return p.getInt("soff_" + id, 0);
    }
    static void setSchedOffset(Context c, int id, int off) {
        Store.prefs(c).edit().putInt("soff_" + id, off).putLong("soffAt_" + id, System.currentTimeMillis()).apply();
    }
    private static PendingIntent schedAction(Context c, int id, String act, int k) {
        Intent i = new Intent(c, SchedWidget.class).setAction(act).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(c, 50000 + id * 8 + k, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 4×4：本周详细课表。左边时间轴、每天一列，课程按上下课时间画成色块（整张画成图片，排版不受小组件限制） */
    static RemoteViews schedGrid(Context c, float wDp, float hDp) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_image);
        float dens = c.getResources().getDisplayMetrics().density;
        int W = Math.max(120, Math.round(wDp * dens)), H = Math.max(120, Math.round(hDp * dens));
        float k = 1f;
        if ((long) W * H > 2_400_000L) { k = (float) Math.sqrt(2_400_000.0 / ((long) W * H)); W = Math.round(W * k); H = Math.round(H * k); }
        final float dp = dens * k;
        Bitmap bm = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        boolean dark = (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int text = c.getColor(R.color.w_text), text2 = c.getColor(R.color.w_text2), line = c.getColor(R.color.w_line), accent = c.getColor(R.color.accent);
        int bg = dark ? 0xFF1B1C21 : 0xFFF4F2EF;

        Data d = Store.data(c);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        LocalDate mon = today.minusDays(today.getDayOfWeek().getValue() - 1);
        List<Integer> days = new ArrayList<>();
        List<List<Data.Course>> per = new ArrayList<>();
        int minH = 8, maxH = 18;
        for (int i = 0; i < 7; i++) {
            List<Data.Course> l = new ArrayList<>();
            for (Data.Course co : d.courses) if (co.on(mon.plusDays(i))) l.add(co);
            if (i < 5 || !l.isEmpty()) { days.add(i); per.add(l); }
            for (Data.Course co : l) { minH = Math.min(minH, co.startMin / 60); maxH = Math.max(maxH, (co.endMin + 59) / 60); }
        }
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float pad = 8 * dp, axis = 30 * dp, headH = 22 * dp, dayH = 20 * dp;
        float gx = pad + axis, gy = pad + headH + dayH, gw = W - gx - pad, gh = H - gy - pad;
        float colW = gw / days.size(), hourH = gh / (maxH - minH);
        float fk = Math.max(.72f, Math.min(1.1f, colW / (64 * dp)));

        // 标题
        p.setTypeface(Typeface.DEFAULT_BOLD); p.setTextSize(13 * dp); p.setColor(accent);
        cv.drawText("本周课表", pad + 4 * dp, pad + 14 * dp, p);
        float tw = p.measureText("本周课表");
        p.setTypeface(Typeface.DEFAULT); p.setTextSize(10.5f * dp); p.setColor(text2);
        LocalDate sun = mon.plusDays(6);
        cv.drawText(mon.getMonthValue() + "/" + mon.getDayOfMonth() + " – " + sun.getMonthValue() + "/" + sun.getDayOfMonth(), pad + 10 * dp + tw, pad + 14 * dp, p);

        // 今天那一列：淡淡的主色底
        for (int ci = 0; ci < days.size(); ci++) {
            if (!mon.plusDays(days.get(ci)).equals(today)) continue;
            p.setColor((accent & 0x00FFFFFF) | (dark ? 0x38000000 : 0x24000000));
            cv.drawRoundRect(new RectF(gx + ci * colW + 1, pad + headH, gx + (ci + 1) * colW - 1, H - pad), 9 * dp, 9 * dp, p);
        }
        // 星期
        p.setTextAlign(Paint.Align.CENTER);
        for (int ci = 0; ci < days.size(); ci++) {
            LocalDate dd = mon.plusDays(days.get(ci));
            boolean isT = dd.equals(today);
            p.setTypeface(isT ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT); p.setTextSize(10 * dp);
            p.setColor(isT ? accent : text2);
            cv.drawText("周" + WD[(days.get(ci) + 1) % 7] + " " + dd.getDayOfMonth(), gx + ci * colW + colW / 2, pad + headH + 13 * dp, p);
        }
        // 时间轴和横线
        p.setTextAlign(Paint.Align.RIGHT); p.setTypeface(Typeface.DEFAULT); p.setTextSize(9 * dp); p.setColor(text2);
        Paint lp = new Paint(); lp.setColor(line); lp.setStrokeWidth(Math.max(1, .6f * dp));
        for (int h = minH; h <= maxH; h++) {
            float y = gy + (h - minH) * hourH;
            cv.drawLine(gx, y, W - pad, y, lp);
            if (h < maxH) cv.drawText(h + ":00", gx - 4 * dp, y + 9 * dp, p);
        }
        for (int ci = 1; ci < days.size(); ci++) cv.drawLine(gx + ci * colW, gy, gx + ci * colW, H - pad, lp);
        p.setTextAlign(Paint.Align.LEFT);

        // 课程色块（同一时间有几节课就并排）
        for (int ci = 0; ci < days.size(); ci++) {
            List<Data.Course> l = new ArrayList<>(per.get(ci));
            l.sort((a, b) -> a.startMin - b.startMin);
            int[] lane = new int[l.size()], lanes = new int[l.size()];
            int gStart = 0, gEnd = -1; List<Integer> ends = new ArrayList<>();
            for (int i = 0; i <= l.size(); i++) {
                if (i == l.size() || (i > gStart && l.get(i).startMin >= gEnd)) {
                    for (int j = gStart; j < i; j++) lanes[j] = ends.size();
                    if (i == l.size()) break;
                    gStart = i; ends.clear(); gEnd = -1;
                }
                Data.Course co = l.get(i);
                int ln = -1;
                for (int e = 0; e < ends.size(); e++) if (ends.get(e) <= co.startMin) { ln = e; break; }
                if (ln < 0) { ln = ends.size(); ends.add(0); }
                ends.set(ln, co.endMin); lane[i] = ln; gEnd = Math.max(gEnd, co.endMin);
            }
            for (int i = 0; i < l.size(); i++) {
                Data.Course co = l.get(i);
                float lw = colW / lanes[i];
                float x0 = gx + ci * colW + lane[i] * lw + 1.5f * dp, x1 = x0 + lw - 3 * dp;
                float y0 = gy + (co.startMin / 60f - minH) * hourH + 1 * dp, y1 = gy + (co.endMin / 60f - minH) * hourH - 1 * dp;
                int col = courseColor(co.code);
                p.setColor(blend(col, bg, dark ? .30f : .20f));
                cv.drawRoundRect(new RectF(x0, y0, x1, y1), 6 * dp, 6 * dp, p);
                p.setColor(col);
                cv.drawRoundRect(new RectF(x0, y0, x0 + 3 * dp, y1), 1.5f * dp, 1.5f * dp, p);
                float tx = x0 + 6 * dp, maxW = x1 - tx - 2 * dp, y = y0 + 2 * dp;
                String[] lines = { co.code, co.type, co.start + "–" + co.end, co.room };
                float[] sizes = { 11f, 9.5f, 9f, 9f };
                for (int li = 0; li < lines.length; li++) {
                    String t = lines[li];
                    if (t == null || t.isEmpty()) continue;
                    float sz = sizes[li] * fk * dp;
                    if (y + sz * 1.15f > y1) break;
                    p.setTextSize(sz);
                    p.setTypeface(li == 0 ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
                    p.setColor(li == 0 ? (dark ? blend(col, 0xFFFFFFFF, .45f) : blend(col, 0xFF000000, .25f)) : (li == 2 ? text2 : text));
                    if (p.measureText(t) > maxW) {
                        int n = p.breakText(t, true, Math.max(0, maxW - p.measureText("…")), null);
                        t = t.substring(0, Math.max(0, n)) + "…";
                    }
                    y += sz;
                    cv.drawText(t, tx, y, p);
                    y += sz * .22f;
                }
            }
        }
        if (d.courses.isEmpty()) {
            p.setTextAlign(Paint.Align.CENTER); p.setTextSize(13 * dp); p.setColor(text2);
            cv.drawText("还没有导入课表", W / 2f, H / 2f, p);
        }
        rv.setImageViewBitmap(R.id.wi_img, bm);
        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "#sched", 306));
        return rv;
    }
    private static int blend(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bgc = (b >> 8) & 255, bb = b & 255;
        return 0xFF000000 | (Math.round(br + (ar - br) * t) << 16) | (Math.round(bgc + (ag - bgc) * t) << 8) | Math.round(bb + (ab - bb) * t);
    }

    static int courseColor(String code) {
        long h = 0;
        for (int i = 0; i < code.length(); i++) h = (h * 31 + code.charAt(i)) & 0xFFFFFFFFL;
        return PALETTE[(int) (h % PALETTE.length)];
    }

    static RemoteViews schedDay(Context c) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        Data d = Store.data(c);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        LocalTime now = LocalTime.now(ZoneId.systemDefault());
        int nm = now.getHour() * 60 + now.getMinute();
        int dow = today.getDayOfWeek().getValue();
        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "#sched", 302));
        rv.setOnClickPendingIntent(R.id.l_empty, Engine.openApp(c, "#sched", 303));
        rv.setPendingIntentTemplate(R.id.l_list, template(c, 301));

        String label = null;
        int pickDay = 0;
        boolean isToday = false;
        List<Data.Course> list = new ArrayList<>();
        // 今天还有没上完的课就显示今天，否则找下一个有课的日子
        for (int k = 0; k < 15 && label == null; k++) {
            LocalDate date = today.plusDays(k);
            int day = date.getDayOfWeek().getValue();
            List<Data.Course> l = new ArrayList<>();
            for (Data.Course co : d.courses) if (co.on(date)) l.add(co); // 按日期范围和隔周判断
            if (k == 0) {
                boolean left = false;
                for (Data.Course co : l) if (co.endMin > nm) left = true;
                if (left) { label = "今天"; pickDay = day; isToday = true; for (Data.Course co : l) if (co.endMin > nm) list.add(co); }
                continue;
            }
            if (!l.isEmpty()) { label = k == 1 ? "明天" : k < 7 ? "周" + WD[day % 7] : date.getMonthValue() + "月" + date.getDayOfMonth() + "日"; pickDay = day; list = l; }
        }
        if (d.courses.isEmpty() || label == null) {
            rv.setTextViewText(R.id.l_title, "课表");
            rv.setTextViewText(R.id.l_sub, "");
            rv.setViewVisibility(R.id.l_list, android.view.View.GONE);
            rv.setViewVisibility(R.id.l_empty, android.view.View.VISIBLE);
            rv.setTextViewText(R.id.l_empty, d.courses.isEmpty() ? "还没有导入课表" : "这周没有课");
            rv.setRemoteAdapter(R.id.l_list, new RemoteViews.RemoteCollectionItems.Builder().build());
            return rv;
        }
        rv.setTextViewText(R.id.l_title, label);
        rv.setTextViewText(R.id.l_sub, "周" + WD[pickDay % 7]);
        rv.setViewVisibility(R.id.l_empty, android.view.View.GONE);
        rv.setViewVisibility(R.id.l_list, android.view.View.VISIBLE);

        RemoteViews.RemoteCollectionItems.Builder b = new RemoteViews.RemoteCollectionItems.Builder()
                .setHasStableIds(false).setViewTypeCount(1);
        boolean nextMarked = false;
        long key = 0;
        for (Data.Course co : list) {
            RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.item_course);
            r.setInt(R.id.cs_bar, "setBackgroundColor", courseColor(co.code));
            r.setTextViewText(R.id.cs_title, co.type.isEmpty() ? co.code : co.code + "  " + co.type);
            r.setTextViewText(R.id.cs_sub, co.start + "–" + co.end + (co.room.isEmpty() ? "" : " · " + co.room));
            String state = "";
            if (isToday && nm >= co.startMin) {
                state = "上课中";
                r.setInt(R.id.cs_root, "setBackgroundResource", R.drawable.live_bg);
            } else if (!nextMarked) {
                state = isToday ? "下一节" : "第一节";
                nextMarked = true;
            }
            r.setTextViewText(R.id.cs_state, state);
            r.setOnClickFillInIntent(R.id.cs_root, new Intent().putExtra(MainActivity.EXTRA_HASH, "#sched"));
            b.addItem(key++, r);
        }
        rv.setRemoteAdapter(R.id.l_list, b.build());
        return rv;
    }
}
