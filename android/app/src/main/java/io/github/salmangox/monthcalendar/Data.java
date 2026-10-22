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

        String timeLabel(boolean h12) { return time.isEmpty() ? "" : endTime.isEmpty() ? fmt(time, h12, false) : range(time, endTime, h12); }
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

    /** 纪念日历里的日子（和网页 js/days.js 同一套算法） */
    static final class Day {
        String id = "", cal = "", title = "", time = "", rep = "", hl = "", unit = "d", icon = "";

        /** 标题前面带上彩色表情（旧版的线条图标名不显示） */
        String named() {
            String t = title.isEmpty() ? I18n.t("（无标题）") : title;
            return !icon.isEmpty() && !icon.matches("[a-z]+") ? icon + " " + t : t;
        }
        LocalDate date;
        boolean pin, from1;
        long updatedAt;

        /** 从 today 起的下一次（不重复的就是那一天） */
        LocalDate occ(LocalDate today) {
            if (rep.isEmpty() || !date.isBefore(today)) return date;
            if ("week".equals(rep)) {
                long k = (java.time.temporal.ChronoUnit.DAYS.between(date, today) + 6) / 7;
                return date.plusWeeks(k);
            }
            if ("month".equals(rep)) {
                LocalDate d = clamp(today.getYear(), today.getMonthValue(), date.getDayOfMonth());
                return d.isBefore(today) ? clamp(today.plusMonths(1).getYear(), today.plusMonths(1).getMonthValue(), date.getDayOfMonth()) : d;
            }
            LocalDate d = clamp(today.getYear(), date.getMonthValue(), date.getDayOfMonth());
            return d.isBefore(today) ? clamp(today.getYear() + 1, date.getMonthValue(), date.getDayOfMonth()) : d;
        }

        private static LocalDate clamp(int y, int m, int d) {
            java.time.YearMonth ym = java.time.YearMonth.of(y, m);
            return ym.atDay(Math.min(d, ym.lengthOfMonth()));
        }

        /** 和今天相差几天：正数 = 还有，负数 = 已经 */
        long diff(LocalDate today) { return java.time.temporal.ChronoUnit.DAYS.between(today, occ(today)); }
    }

    final List<Day> days = new ArrayList<>();
    /** 纪念日历的名称（id → 名称） */
    final Map<String, String> dayCals = new LinkedHashMap<>();

    final List<Event> events = new ArrayList<>();
    // ---------- 12 / 24 小时制（与网页 MC.fmtTime / fmtRange 一致） ----------
    /** 应用里的设置（同步数据 profile.clock）：auto / 12 / 24；最近一次读到的数据为准 */
    static volatile String clock = "auto";
    static volatile Data CUR;
    /** 「跟随地区」= 用手机系统的 12 / 24 小时设置 */
    static boolean h12(android.content.Context c) {
        if ("12".equals(clock)) return true;
        if ("24".equals(clock)) return false;
        return !android.text.format.DateFormat.is24HourFormat(c);
    }
    /** "14:30" → "下午2:30"（12 小时制）或 "14:30"；noHalf：省略上午 / 下午 */
    static String fmt(String hhmm, boolean h12, boolean noHalf) {
        if (hhmm == null || hhmm.isEmpty() || !h12) return hhmm == null ? "" : hhmm;
        int h = Integer.parseInt(hhmm.substring(0, 2)), m = Integer.parseInt(hhmm.substring(3, 5));
        String hm = (h % 12 == 0 ? 12 : h % 12) + ":" + (m < 10 ? "0" : "") + m;
        return noHalf ? hm : I18n.zh() ? (h < 12 ? "上午" : "下午") + hm : hm + (h < 12 ? " AM" : " PM");
    }
    static String range(String a, String b, boolean h12) {
        if (!h12) return a + "–" + b;
        boolean same = (Integer.parseInt(a.substring(0, 2)) < 12) == (Integer.parseInt(b.substring(0, 2)) < 12);
        return I18n.zh() ? fmt(a, true, false) + "–" + fmt(b, true, same) : fmt(a, true, same) + "–" + fmt(b, true, false);
    }
    static String hourLabel(int h, boolean h12) { int hh = h % 12 == 0 ? 12 : h % 12; return !h12 ? h + ":00" : I18n.zh() ? (h < 12 ? "上午" : "下午") + hh : hh + (h < 12 ? " AM" : " PM"); }

    final List<Course> courses = new ArrayList<>();
    /** 课程代码 → 这门课的一整套颜色（CourseColors.BASE…BAR_D） */
    final Map<String, int[]> courseTone = new HashMap<>();
    int[] toneOf(String code) { int[] t = courseTone.get(code); return t != null ? t : CourseColors.tone(240); }
    boolean dailyOn;
    LocalTime dailyTime = LocalTime.of(13, 0);
    int version;
    private final Map<LocalDate, List<Event>> byDate = new HashMap<>();
    /** 打开了「在主日历显示」的记录日历（小组件里和主日历一起显示） */
    final Set<String> shownCals = new HashSet<>();
    /** 记录日历的颜色 */
    final Map<String, Integer> calColor = new HashMap<>();
    /** 这个事件要用日历颜色吗（和网页一致：记录日历里没设优先级的事件用日历自己的颜色）；不用时返回 null */
    Integer calColorOf(Event e) { return !e.cal.isEmpty() && e.priority == 0 ? calColor.get(e.cal) : null; }
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
        CUR = d; // 最近一次读到的数据（小组件取记录日历颜色等）
        JSONObject prof = o.optJSONObject("profile");
        clock = prof == null ? "auto" : prof.optString("clock", "auto");
        I18n.set(prof == null ? "auto" : prof.optString("lang", "auto")); // 语言和应用一致
        JSONArray cals = o.optJSONArray("cals");
        if (cals != null) {
            for (int i = 0; i < cals.length(); i++) {
                JSONObject c = cals.optJSONObject(i);
                if (c == null) continue;
                String id = c.optString("id");
                if (id.isEmpty()) continue;
                if (c.optBoolean("showInMain")) d.shownCals.add(id);
                String col = c.optString("color");
                if (col.matches("#[0-9a-fA-F]{6}")) d.calColor.put(id, 0xFF000000 | Integer.parseInt(col.substring(1), 16));
                if (c.optBoolean("notify")) d.notifyCals.add(id);
                if ("days".equals(c.optString("kind"))) d.dayCals.put(id, c.optString("name"));
            }
        }
        JSONArray ds = o.optJSONArray("days");
        if (ds != null) {
            for (int i = 0; i < ds.length(); i++) {
                JSONObject x = ds.optJSONObject(i);
                if (x == null) continue;
                String date = x.optString("date");
                if (!DATE.matcher(date).matches()) continue;
                Day y = new Day();
                try { y.date = LocalDate.parse(date); } catch (Exception e) { continue; }
                y.id = x.optString("id"); y.cal = x.optString("cal"); y.title = x.optString("title");
                String t = x.optString("time"); y.time = TIME.matcher(t).matches() ? t : "";
                y.rep = x.optString("rep"); if (!y.rep.matches("week|month|year")) y.rep = "";
                y.hl = x.optString("hl"); if (!y.hl.matches("#[0-9a-fA-F]{6}")) y.hl = "";
                y.unit = x.optString("unit", "d");
                y.pin = x.optBoolean("pin"); y.from1 = x.optBoolean("from1"); y.icon = x.optString("icon");
                y.updatedAt = x.optLong("updatedAt");
                d.days.add(y);
            }
            d.days.removeIf(y -> !d.dayCals.containsKey(y.cal));
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
            // 课程颜色：按科目定色相、整体在色环上推开（与网页 sched.js 相同的算法，见 CourseColors）
            List<String> codes = new ArrayList<>();
            for (Course x : d.courses) codes.add(x.code);
            for (Map.Entry<String, Double> e : CourseColors.hues(codes).entrySet()) d.courseTone.put(e.getKey(), CourseColors.tone(e.getValue()));
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
    private static JSONArray byId(JSONObject a, JSONObject b, String key, String pre, JSONObject deleted) {
        LinkedHashMap<String, JSONObject> m = new LinkedHashMap<>();
        for (JSONObject src : new JSONObject[]{a, b}) {
            JSONArray arr = src.optJSONArray(key);
            if (arr == null) continue;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject x = arr.optJSONObject(i);
                if (x == null) continue;
                String id = x.optString("id");
                JSONObject prev = m.get(id);
                if (prev == null || x.optLong("updatedAt") > prev.optLong("updatedAt")) m.put(id, x);
            }
        }
        JSONArray out = new JSONArray();
        for (JSONObject x : m.values()) {
            String k = pre + x.optString("id");
            if (deleted.has(k) && deleted.optLong(k) >= x.optLong("updatedAt")) continue;
            out.put(x);
        }
        return out;
    }

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
            // 纪念日历的日子、分类：同样按 id 取较新的一份（删除记录 "day:<id>" / "book:<id>"）
            out.put("days", byId(a, b, "days", "day:", deleted));
            out.put("books", byId(a, b, "books", "book:", deleted));
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
