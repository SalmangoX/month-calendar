package io.github.salmangox.monthcalendar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 提醒与刷新的核心：到点的提醒由这里弹出通知，然后用精确闹钟预约「下一个需要醒来的时间」
 * （下一个提醒、每日提醒、午夜换日、课表的上下课时间），最后刷新所有桌面小组件。
 * 闹钟、开机、改时间、数据变化、后台同步都会调用 refresh()。
 */
final class Engine {
    static final String CH_EVENT = "event", CH_DAILY = "daily", CH_TEST = "test";
    /** 手机关机、省电延迟等原因错过的提醒，2 小时内的仍然补发 */
    private static final long GRACE = 2 * 3600_000L;
    static final ExecutorService BG = Executors.newSingleThreadExecutor();

    private Engine() { }

    static void refreshAsync(Context c) {
        Context app = c.getApplicationContext();
        BG.execute(() -> refresh(app));
    }

    static synchronized void refresh(Context ctx) {
        Context c = ctx.getApplicationContext();
        Data d = Store.data(c);
        SharedPreferences p = Store.prefs(c);
        ZoneId z = ZoneId.systemDefault();
        long now = System.currentTimeMillis();
        LocalDate today = LocalDate.now(z);
        boolean notifyOn = p.getBoolean("notify", false);

        // 1. 弹出到点的提醒
        long last = p.getLong("lastHandled", 0);
        if (last <= 0 || last > now) last = now;
        long from = Math.max(last, now - GRACE);
        JSONObject sent = Data.obj(p.getString("sent", ""));
        if (sent == null) sent = new JSONObject();
        if (notifyOn && canNotify(c)) {
            for (Data.Event e : d.events) {
                if (e.done || !d.notifies(e)) continue;
                long ft = Data.fireTime(e, z);
                if (ft <= from || ft > now) continue;
                String key = e.id + "@" + ft;
                if (sent.has(key)) continue;
                showEvent(c, e, key, ft);
                put(sent, key, now);
            }
            if (d.dailyOn) {
                long ft = ZonedDateTime.of(today, d.dailyTime, z).toInstant().toEpochMilli();
                String key = "daily@" + today;
                if (ft > from && ft <= now && !sent.has(key)) {
                    showDaily(c, d, today);
                    put(sent, key, now);
                }
            }
        }
        List<String> old = new ArrayList<>();
        for (Iterator<String> it = sent.keys(); it.hasNext(); ) {
            String k = it.next();
            if (sent.optLong(k) < now - 3 * 86400000L) old.add(k);
        }
        for (String k : old) sent.remove(k);
        p.edit().putLong("lastHandled", now).putString("sent", sent.toString()).apply();

        // 2. 预约下一次醒来
        long next = today.plusDays(1).atStartOfDay(z).toInstant().toEpochMilli() + 2000; // 午夜换日
        if (notifyOn) {
            for (Data.Event e : d.events) {
                if (e.done || !d.notifies(e)) continue;
                long ft = Data.fireTime(e, z);
                if (ft > now && ft < next) next = ft;
            }
            if (d.dailyOn) {
                long ft = ZonedDateTime.of(today, d.dailyTime, z).toInstant().toEpochMilli();
                if (ft <= now) ft = ZonedDateTime.of(today.plusDays(1), d.dailyTime, z).toInstant().toEpochMilli();
                if (ft < next) next = ft;
            }
        }
        int dow = today.getDayOfWeek().getValue();
        for (Data.Course co : d.courses) { // 上课、下课时刷新课表小组件
            if (!co.on(today)) continue;
            for (int m : new int[]{co.startMin, co.endMin}) {
                long t = today.atStartOfDay(z).plusMinutes(m).toInstant().toEpochMilli();
                if (t > now && t < next) next = t;
            }
        }
        setAlarm(c, next);

        // 3. 刷新桌面小组件
        Widgets.updateAll(c);
    }

    private static void put(JSONObject o, String k, long v) {
        try { o.put(k, v); } catch (Exception ignored) { }
    }

    // ---------- 闹钟 ----------
    static boolean exactAllowed(Context c) {
        return c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    private static void setAlarm(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1,
                new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.TICK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        Store.prefs(c).edit().putLong("nextAlarm", at).apply();
    }

    /** 用和真实提醒完全相同的方式，几秒后弹一条测试通知（可以关掉 App 等它） */
    static void testLater(Context c, int seconds) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 2,
                new Intent(c, AlarmReceiver.class).setAction(AlarmReceiver.TEST),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long at = System.currentTimeMillis() + Math.max(3, seconds) * 1000L;
        if (am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    // ---------- 通知 ----------
    static boolean canNotify(Context c) {
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_EVENT) == null) {
            NotificationChannel ch = new NotificationChannel(CH_EVENT, I18n.t("事件提醒"), NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(I18n.t("设置了提醒的事件到点通知"));
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_DAILY) == null) {
            NotificationChannel ch = new NotificationChannel(CH_DAILY, I18n.t("每日未完成提醒"), NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(I18n.t("每天在设定的时间提醒查看当天未完成的事件"));
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_TEST) == null) {
            NotificationChannel ch = new NotificationChannel(CH_TEST, I18n.t("测试通知"), NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(ch);
        }
    }

    static PendingIntent openApp(Context c, String hash, int req) {
        Intent i = new Intent(c, MainActivity.class).putExtra(MainActivity.EXTRA_HASH, hash)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Notification.Builder builder(Context c, String channel) {
        ensureChannels(c);
        return new Notification.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat)
                .setColor(c.getColor(R.color.accent))
                .setAutoCancel(true)
                .setShowWhen(true);
    }

    static String bodyFor(Context c, Data.Event e) {
        String t = e.timeLabel(Data.h12(c));
        return I18n.md(e.date.getMonthValue(), e.date.getDayOfMonth()) + " " + (t.isEmpty() ? I18n.t("全天") : t)
                + (e.note.isEmpty() ? "" : " · " + e.note);
    }

    private static void showEvent(Context c, Data.Event e, String key, long when) {
        String body = bodyFor(c, e);
        Notification n = builder(c, CH_EVENT)
                .setContentTitle(e.title.isEmpty() ? I18n.t("（无标题）") : e.title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setWhen(when)
                .setContentIntent(openApp(c, "", key.hashCode()))
                .build();
        c.getSystemService(NotificationManager.class).notify(key.hashCode(), n);
    }

    private static void showDaily(Context c, Data d, LocalDate day) {
        int open = 0;
        for (Data.Event e : d.on(day)) if (!e.done) open++; // 今日任务：主日历 + 设为在主日历显示的记录日历（d.on 已按这个规则）
        String title = open > 0 ? I18n.t("查看今日未完成事件") : I18n.t("今日事件已完成");
        String body = open > 0 ? I18n.t("今天还有 {0} 件事未完成，点开查看。", open) : I18n.t("今天的事件都完成了。");
        Notification n = builder(c, CH_DAILY)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setContentIntent(openApp(c, "#today", 7))
                .build();
        c.getSystemService(NotificationManager.class).notify(("daily@" + day).hashCode(), n);
    }

    static void showTest(Context c, boolean background) {
        Notification n = builder(c, CH_TEST)
                .setContentTitle(background ? I18n.t("节律 · 后台提醒测试") : I18n.t("节律 · 测试通知"))
                .setContentText(background ? I18n.t("App 关着也能准时收到提醒。") : I18n.t("通知可以正常显示了"))
                .setContentIntent(openApp(c, "", 9))
                .build();
        c.getSystemService(NotificationManager.class).notify(background ? 9002 : 9001, n);
    }
}
