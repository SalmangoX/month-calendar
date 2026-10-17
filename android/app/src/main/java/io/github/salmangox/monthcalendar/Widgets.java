package io.github.salmangox.monthcalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
        for (int id : m.getAppWidgetIds(new ComponentName(c, SchedWidget.class))) updateList(c, m, id, sched(c));
    }

    static int count(Context c, Class<?> cls) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, cls)).length;
    }

    private static void updateList(Context c, AppWidgetManager m, int id, RemoteViews rv) {
        m.updateAppWidget(id, rv);
    }

    // ---------- 资源 id（42 个格子，按名字查一次后缓存） ----------
    private static int[] N, CELL, MORE, DOTS, WDAY;
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
            return monthViews(c, id, capacity(h > 0 ? h : 300));
        }
        Map<Integer, RemoteViews> byCap = new HashMap<>();
        Map<SizeF, RemoteViews> map = new HashMap<>();
        for (SizeF s : sizes) {
            int cap = capacity(s.getHeight());
            RemoteViews rv = byCap.get(cap);
            if (rv == null) { rv = monthViews(c, id, cap); byCap.put(cap, rv); }
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

    private static RemoteViews monthViews(Context c, int id, int cap) {
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
            if (evs.isEmpty()) continue;
            if (cap >= 1) {
                int show = evs.size() > cap ? cap - 1 : evs.size();
                for (int k = 0; k < show; k++) chip(c, rv, EV[i][k], evs.get(k), in);
                if (evs.size() > cap) {
                    rv.setViewVisibility(MORE[i], android.view.View.VISIBLE);
                    rv.setTextViewText(MORE[i], "+" + (evs.size() - show));
                }
            } else if (cap == 0) {
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

        rv.setOnClickPendingIntent(android.R.id.background, Engine.openApp(c, "", 100 + id));
        rv.setOnClickPendingIntent(R.id.m_prev, action(c, id, ACT_PREV, 1));
        rv.setOnClickPendingIntent(R.id.m_next, action(c, id, ACT_NEXT, 2));
        rv.setOnClickPendingIntent(R.id.m_today, action(c, id, ACT_HOME, 3));
        return rv;
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
            rv.setInt(vid, "setBackgroundResource", CHIP[e.priority]);
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
            if (e.done) continue;
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
        if (empty) rv.setTextViewText(R.id.l_empty, Store.hasData(c) ? "今天没有事件\n接下来一周也很空闲" : "打开月历 App\n同步一次后这里会显示事件");
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

    // ---------- 课表 ----------
    static int courseColor(String code) {
        long h = 0;
        for (int i = 0; i < code.length(); i++) h = (h * 31 + code.charAt(i)) & 0xFFFFFFFFL;
        return PALETTE[(int) (h % PALETTE.length)];
    }

    static RemoteViews sched(Context c) {
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
        for (int k = 0; k < 8 && label == null; k++) {
            int day = ((dow - 1 + k) % 7) + 1;
            List<Data.Course> l = new ArrayList<>();
            for (Data.Course co : d.courses) if (co.day == day) l.add(co);
            if (k == 0) {
                boolean left = false;
                for (Data.Course co : l) if (co.endMin > nm) left = true;
                if (left) { label = "今天"; pickDay = day; isToday = true; for (Data.Course co : l) if (co.endMin > nm) list.add(co); }
                continue;
            }
            if (!l.isEmpty()) { label = k == 1 ? "明天" : "周" + WD[day % 7]; pickDay = day; list = l; }
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
