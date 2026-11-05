package io.github.salmangox.monthcalendar;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * 读手机系统日历（导入用）：手机里登录的谷歌、Outlook / Exchange、三星、各家手机自带日历都在这里。
 * 返回一段时间里的每一次发生（重复事件已经由系统展开），日期和钟点按本地时间写成字符串，网页按同一套格式导入
 * （和 iPhone / Mac 的 SysCal.swift、网页解析 .ics 的格式一样：js/calimport.js）。
 */
final class SysCal {
    private SysCal() { }

    static JSONObject read(Context c, long from, long to) {
        JSONObject out = new JSONObject();
        remCache.clear();
        try {
            ContentResolver cr = c.getContentResolver();
            JSONArray cals = new JSONArray();
            Map<Long, Boolean> seen = new HashMap<>();
            try (Cursor q = cr.query(CalendarContract.Calendars.CONTENT_URI,
                    new String[]{CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                            CalendarContract.Calendars.CALENDAR_COLOR, CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.VISIBLE},
                    null, null, null)) {
                while (q != null && q.moveToNext()) {
                    long id = q.getLong(0);
                    seen.put(id, true);
                    JSONObject k = new JSONObject();
                    k.put("id", String.valueOf(id));
                    k.put("title", q.getString(1) == null ? "" : q.getString(1));
                    k.put("color", String.format("#%06X", 0xFFFFFF & q.getInt(2)));
                    k.put("source", q.getString(3) == null ? "" : q.getString(3));
                    cals.put(k);
                }
            }
            Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
            android.content.ContentUris.appendId(b, from);
            android.content.ContentUris.appendId(b, to);
            JSONArray evs = new JSONArray();
            SimpleDateFormat dLocal = new SimpleDateFormat("yyyy-MM-dd", Locale.US), tLocal = new SimpleDateFormat("HH:mm", Locale.US);
            SimpleDateFormat dUtc = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            dUtc.setTimeZone(TimeZone.getTimeZone("UTC"));   // 全天事件存的是 UTC 的 0 点
            try (Cursor q = cr.query(b.build(),
                    new String[]{CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.DESCRIPTION,
                            CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY,
                            CalendarContract.Instances.CALENDAR_ID, CalendarContract.Instances.RRULE, CalendarContract.Instances.EVENT_LOCATION},
                    null, null, CalendarContract.Instances.BEGIN + " ASC")) {
                int n = 0;
                while (q != null && q.moveToNext() && n < 20000) {
                    n++;
                    long eid = q.getLong(0), st = q.getLong(3), en = q.getLong(4);
                    boolean all = q.getInt(5) != 0;
                    JSONObject e = new JSONObject();
                    e.put("uid", "and-" + eid);
                    e.put("cal", String.valueOf(q.getLong(6)));
                    e.put("title", q.getString(1) == null ? "" : q.getString(1));
                    String note = q.getString(2) == null ? "" : q.getString(2), loc = q.getString(8);
                    if (loc != null && !loc.isEmpty()) note = note.isEmpty() ? loc : note + "\n" + loc;
                    e.put("note", note);
                    e.put("recur", q.getString(7) != null && !q.getString(7).isEmpty());
                    if (all) {
                        e.put("allDay", true);
                        e.put("date", dUtc.format(st));
                        e.put("days", Math.max(1, Math.round((en - st) / 86400000.0)));
                    } else {
                        e.put("allDay", false);
                        e.put("date", dLocal.format(st));
                        e.put("time", tLocal.format(st));
                        e.put("endDate", dLocal.format(en));
                        e.put("endTime", tLocal.format(en));
                    }
                    Integer rem = reminder(cr, eid);
                    if (rem != null) e.put("remind", rem);
                    evs.put(e);
                }
            }
            out.put("ok", true);
            out.put("calendars", cals);
            out.put("events", evs);
        } catch (SecurityException se) {
            try { out.put("ok", false); out.put("error", "denied"); } catch (Exception ignored) { }
        } catch (Exception ex) {
            try { out.put("ok", false); out.put("error", String.valueOf(ex.getMessage())); } catch (Exception ignored) { }
        }
        return out;
    }

    private static final Map<Long, Integer> remCache = new HashMap<>();

    /** 事件的第一个提醒：提前几分钟（同一个重复事件的每一次共用，查一次就记住） */
    private static Integer reminder(ContentResolver cr, long eid) {
        if (remCache.containsKey(eid)) return remCache.get(eid);
        Integer m = null;
        try (Cursor q = cr.query(CalendarContract.Reminders.CONTENT_URI, new String[]{CalendarContract.Reminders.MINUTES},
                CalendarContract.Reminders.EVENT_ID + "=?", new String[]{String.valueOf(eid)}, CalendarContract.Reminders.MINUTES + " ASC")) {
            if (q != null && q.moveToFirst()) { int v = q.getInt(0); if (v >= 0) m = v; }
        } catch (Exception ignored) { }
        remCache.put(eid, m);
        return m;
    }
}
