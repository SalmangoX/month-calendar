package io.github.salmangox.monthcalendar;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 日历数据：读取网页 App 的 mcal-calendar.json（格式与 js/store.js 一致），以及多设备合并。
 * 约定：网页以后只新增字段、不改名不删除；这里遇到不认识的字段直接忽略，合并时原样保留。
 */
final class Data {
    /** 这一版 App 认识的数据格式版本（store.js 里的 version）。更高版本照样读取。 */
    static final int KNOWN_VERSION = 3;

    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern TIME = Pattern.compile("\\d{2}:\\d{2}");

    static final class Event {
        String id = "", title = "", note = "", time = "", endTime = "";
        String cal = ""; // 所属日历：空 = 主日历；其余是特殊记录日历
        LocalDate date;
        int priority, days = 1;
        boolean done, hasRemind;
        long remind, createdAt;

        LocalDate end() { return days > 1 ? date.plusDays(days - 1) : date; }

        String timeLabel() { return time.isEmpty() ? "" : endTime.isEmpty() ? time : time + "–" + endTime; }
    }

    static final class Course {
        String id = "", code = "", type = "", room = "", start = "", end = "";
        int day, startMin, endMin, every = 1;
        LocalDate from, to; // 课程起止日期（可为空）

        /** 这一天有没有这节课：星期、起止日期、隔周 */
        boolean on(LocalDate d) {
            if (d.getDayOfWeek().getValue() != day) return false;
            if (from != null && d.isBefore(from)) return false;
            if (to != null && d.isAfter(to)) return false;
            if (every == 2 && from != null) {
                long w = java.time.temporal.ChronoUnit.WEEKS.between(
                        from.with(java.time.DayOfWeek.MONDAY), d.with(java.time.DayOfWeek.MONDAY));
                if (w % 2 != 0) return false;
            }
            return true;
        }
    }

    final List<Event> events = new ArrayList<>();
    final List<Course> courses = new ArrayList<>();
    boolean dailyOn;
    LocalTime dailyTime = LocalTime.of(13, 0);
    int version;
    private final Map<LocalDate, List<Event>> byDate = new HashMap<>();
    /** 打开了「在主日历显示」的记录日历（小组件里和主日历一起显示） */
    final Set<String> shownCals = new HashSet<>();
    /** 打开了「通知」的记录日历 */
    final Set<String> notifyCals = new HashSet<>();

    /** 这个事件到点要不要提醒：主日历永远提醒，记录日历看自己的开关 */
    boolean notifies(Event e) { return e.cal.isEmpty() || notifyCals.contains(e.cal); }

    // ---------- 解析 ----------
    static JSONObject obj(String s) {
        if (s == null || s.isEmpty()) return null;
        try { return new JSONObject(s); } catch (JSONException e) { return null; }
    }

    static Data parse(String json) {
        Data d = new Data();
        JSONObject o = obj(json);
        if (o == null) return d;
        d.version = o.optInt("version", 0);
        JSONArray ev = o.optJSONArray("events");
        if (ev != null) {
            for (int i = 0; i < ev.length(); i++) {
                Event x = event(ev.optJSONObject(i));
                if (x != null) d.events.add(x);
            }
        }
        JSONArray cals = o.optJSONArray("cals");
        if (cals != null) {
            for (int i = 0; i < cals.length(); i++) {
                JSONObject c = cals.optJSONObject(i);
                if (c == null) continue;
                String id = c.optString("id");
                if (id.isEmpty()) continue;
                if (c.optBoolean("showInMain")) d.shownCals.add(id);
                if (c.optBoolean("notify")) d.notifyCals.add(id);
            }
        }
        JSONObject daily = o.optJSONObject("daily");
        if (daily != null) {
            d.dailyOn = daily.optBoolean("on");
            String t = daily.optString("time");
            if (TIME.matcher(t).matches()) d.dailyTime = time(t);
        }
        JSONArray cs = o.optJSONArray("courses");
        if (cs != null) {
            for (int i = 0; i < cs.length(); i++) {
                JSONObject c = cs.optJSONObject(i);
                if (c == null) continue;
                Course x = new Course();
                x.id = c.optString("id");
                x.code = c.optString("code");
                x.type = c.optString("type");
                x.room = c.optString("room");
                x.day = c.optInt("day", 0);
                x.start = c.optString("start");
                x.end = c.optString("end");
                if (x.code.isEmpty() || x.day < 1 || x.day > 7) continue;
                if (!TIME.matcher(x.start).matches() || !TIME.matcher(x.end).matches()) continue;
                x.startMin = minutes(x.start);
                x.endMin = minutes(x.end);
                try { String f = c.optString("from"); if (!f.isEmpty()) x.from = LocalDate.parse(f); } catch (Exception ignored) {}
                try { String t = c.optString("to"); if (!t.isEmpty()) x.to = LocalDate.parse(t); } catch (Exception ignored) {}
                x.every = c.optInt("every", 1) == 2 ? 2 : 1;
                d.courses.add(x);
            }
            d.courses.sort(Comparator.comparingInt((Course c) -> c.day).thenComparingInt(c -> c.startMin));
        }
        d.index();
        return d;
    }

    private static Event event(JSONObject e) {
        if (e == null) return null;
        String ds = e.optString("date");
        if (!DATE.matcher(ds).matches()) return null;
        Event x = new Event();
        try { x.date = LocalDate.parse(ds); } catch (DateTimeException ex) { return null; }
        x.id = e.optString("id");
        x.cal = e.optString("cal", "");
        x.title = e.optString("title");
        x.note = e.optString("note");
        int p = e.optInt("priority", 0);
        x.priority = p < 0 || p > 3 ? 0 : p;
        x.done = e.optBoolean("done");
        String t = e.optString("time");
        x.time = TIME.matcher(t).matches() ? t : "";
        String et = e.optString("endTime");
        x.endTime = !x.time.isEmpty() && TIME.matcher(et).matches() ? et : "";
        Object r = e.opt("remind");
        if (r instanceof Number) {
            x.hasRemind = true;
            x.remind = ((Number) r).longValue();
        } else if (r instanceof String && !((String) r).isEmpty()) {
            try { x.remind = Long.parseLong((String) r); x.hasRemind = true; } catch (NumberFormatException ignored) { }
        }
        x.days = x.time.isEmpty() ? Math.max(1, Math.min(60, e.optInt("days", 1))) : 1;
        x.createdAt = e.optLong("createdAt", 0);
        return x;
    }

    static int minutes(String hhmm) {
        return Integer.parseInt(hhmm.substring(0, 2)) * 60 + Integer.parseInt(hhmm.substring(3, 5));
    }

    static LocalTime time(String hhmm) {
        int h = Integer.parseInt(hhmm.substring(0, 2)), m = Integer.parseInt(hhmm.substring(3, 5));
        return LocalTime.of(Math.min(h, 23), Math.min(m, 59));
    }

    // ---------- 查询 ----------
    /** 与网页 MC.cmp 相同：未完成在前，优先级高在前，有时间的按时间，最后按创建时间 */
    static final Comparator<Event> ORDER = (a, b) -> {
        if (a.done != b.done) return a.done ? 1 : -1;
        if (a.priority != b.priority) return b.priority - a.priority;
        int t = (a.time.isEmpty() ? "99" : a.time).compareTo(b.time.isEmpty() ? "99" : b.time);
        if (t != 0) return t;
        return Long.compare(a.createdAt, b.createdAt);
    };

    private void index() {
        for (Event e : events) {
            if (!e.cal.isEmpty() && !shownCals.contains(e.cal)) continue; // 小组件 = 主日历（加上设为在主日历显示的记录日历）
            for (int k = 0; k < e.days; k++) { // 多天的全天事件出现在跨越的每一天
                byDate.computeIfAbsent(e.date.plusDays(k), x -> new ArrayList<>()).add(e);
            }
        }
        for (List<Event> l : byDate.values()) l.sort(ORDER);
    }

    List<Event> on(LocalDate d) {
        List<Event> l = byDate.get(d);
        return l == null ? Collections.emptyList() : l;
    }

    /** 提醒时间：带时间的事件以开始时间为准，全天事件以当天 9:00 为准；没有提醒返回 Long.MIN_VALUE */
    static long fireTime(Event e, ZoneId z) {
        if (!e.hasRemind) return Long.MIN_VALUE;
        LocalTime t = e.time.isEmpty() ? LocalTime.of(9, 0) : time(e.time);
        return ZonedDateTime.of(e.date, t, z).toInstant().toEpochMilli() - e.remind * 60000L;
    }

    // ---------- 合并（与网页 MC.merge 相同的规则） ----------
    static JSONObject merge(JSONObject a, JSONObject b) {
        try {
            long ua = a.optLong("updatedAt"), ub = b.optLong("updatedAt");
            // 先整体复制较新的一份，不认识的字段也一起保留
            JSONObject out = new JSONObject((ub > ua ? b : a).toString());

            JSONObject deleted = new JSONObject();
            copyMax(deleted, a.optJSONObject("deleted"));
            copyMax(deleted, b.optJSONObject("deleted"));

            LinkedHashMap<String, JSONObject> map = new LinkedHashMap<>();
            for (JSONObject src : new JSONObject[]{a, b}) {
                JSONArray ev = src.optJSONArray("events");
                if (ev == null) continue;
                for (int i = 0; i < ev.length(); i++) {
                    JSONObject e = ev.optJSONObject(i);
                    if (e == null) continue;
                    String id = e.optString("id");
                    JSONObject old = map.get(id);
                    if (old == null || e.optLong("updatedAt") > old.optLong("updatedAt")) map.put(id, e);
                }
            }
            JSONArray events = new JSONArray();
            for (JSONObject e : map.values()) {
                String id = e.optString("id");
                if (deleted.has(id) && deleted.optLong(id) >= e.optLong("updatedAt")) continue;
                events.put(e);
            }
            long cutoff = System.currentTimeMillis() - 180L * 86400000L;
            List<String> old = new ArrayList<>();
            for (Iterator<String> it = deleted.keys(); it.hasNext(); ) {
                String k = it.next();
                if (deleted.optLong(k) < cutoff) old.add(k);
            }
            for (String k : old) deleted.remove(k);

            out.put("version", Math.max(KNOWN_VERSION, Math.max(a.optInt("version"), b.optInt("version"))));
            out.put("updatedAt", Math.max(ua, ub));
            out.put("events", events);
            out.put("deleted", deleted);
            out.put("profile", newer(a.optJSONObject("profile"), b.optJSONObject("profile"), "updatedAt"));
            out.put("daily", newer(a.optJSONObject("daily"), b.optJSONObject("daily"), "updatedAt"));
            JSONObject nc = b.optLong("coursesAt") > a.optLong("coursesAt") ? b : a;
            JSONArray courses = nc.optJSONArray("courses");
            out.put("courses", courses == null ? new JSONArray() : courses);
            out.put("coursesAt", nc.optLong("coursesAt"));
            // 特殊记录日历：和事件一样按 id 取较新的一份，删除记录用 "cal:<id>"
            LinkedHashMap<String, JSONObject> cmap = new LinkedHashMap<>();
            for (JSONObject src : new JSONObject[]{a, b}) {
                JSONArray cs = src.optJSONArray("cals");
                if (cs == null) continue;
                for (int i = 0; i < cs.length(); i++) {
                    JSONObject c = cs.optJSONObject(i);
                    if (c == null) continue;
                    String id = c.optString("id");
                    JSONObject prev = cmap.get(id);
                    if (prev == null || c.optLong("updatedAt") > prev.optLong("updatedAt")) cmap.put(id, c);
                }
            }
            JSONArray cals = new JSONArray();
            for (JSONObject c : cmap.values()) {
                String k = "cal:" + c.optString("id");
                if (deleted.has(k) && deleted.optLong(k) >= c.optLong("updatedAt")) continue;
                cals.put(c);
            }
            out.put("cals", cals);
            return out;
        } catch (JSONException e) {
            return b;
        }
    }

    private static void copyMax(JSONObject into, JSONObject from) throws JSONException {
        if (from == null) return;
        for (Iterator<String> it = from.keys(); it.hasNext(); ) {
            String k = it.next();
            into.put(k, Math.max(into.optLong(k), from.optLong(k)));
        }
    }

    private static JSONObject newer(JSONObject a, JSONObject b, String key) {
        if (a == null) return b == null ? new JSONObject() : b;
        if (b == null) return a;
        return b.optLong(key) > a.optLong(key) ? b : a;
    }
}
