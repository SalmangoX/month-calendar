package io.github.salmangox.monthcalendar

import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.random.Random

/** 一个事件（只读快照，字段含义和 js/store.js 的 normEvent 一致）。改动走 Repo，原 JSON 里不认识的字段原样保留。 */
data class Ev(
    val id: String,
    val date: LocalDate,
    val title: String,
    val note: String,
    val priority: Int,
    val rate: Int,
    val done: Boolean,
    val time: String,
    val endTime: String,
    val remind: Int?,
    val days: Int,
    val cal: String,
    val series: String,
    val repFreq: String?,
    val repForever: Boolean,
    val hasSegs: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
) {
    val end: LocalDate get() = if (days > 1) date.plusDays(days - 1L) else date
    val spans: Boolean get() = days > 1 && time.isEmpty()
}

data class CalInfo(
    val id: String, val name: String, val color: Int, val showInMain: Boolean, val notify: Boolean,
    val kind: String, val rateOn: Boolean, val rateLabels: List<String>, val createdAt: Long,
)

/** 整份数据的快照：事件按日期建好索引（主日历看到的：主日历 + 设为「在主日历显示」的记录日历） */
class CalData(val events: List<Ev>, val cals: Map<String, CalInfo>, val clock: String, val lang: String) {
    private val shown = cals.values.filter { it.showInMain && it.kind != "days" }.map { it.id }.toSet()
    fun inMainView(e: Ev) = e.cal.isEmpty() || shown.contains(e.cal)
    /** 和网页 MC.cmp 一致：未完成在前，优先级高在前，有时间的按时间，最后按创建时间 */
    val cmp: Comparator<Ev> = Comparator { a, b ->
        if (a.done != b.done) return@Comparator if (a.done) 1 else -1
        val pa = if (rateOn(a.cal)) 0 else a.priority; val pb = if (rateOn(b.cal)) 0 else b.priority
        if (pa != pb) return@Comparator pb - pa
        val t = (a.time.ifEmpty { "99" }).compareTo(b.time.ifEmpty { "99" })
        if (t != 0) return@Comparator t
        a.createdAt.compareTo(b.createdAt)
    }

    private val byDate: Map<LocalDate, List<Ev>> = run {
        val m = HashMap<LocalDate, MutableList<Ev>>()
        for (e in events) {
            if (!inMainView(e)) continue
            val n = if (e.days > 1) e.days else 1
            for (k in 0 until n) m.getOrPut(e.date.plusDays(k.toLong())) { ArrayList() }.add(e)
        }
        m.values.forEach { it.sortWith(cmp) }
        m
    }
    fun on(d: LocalDate): List<Ev> = byDate[d] ?: emptyList()
    fun cal(id: String): CalInfo? = if (id.isEmpty()) null else cals[id]
    fun rateOn(id: String) = cal(id)?.let { it.kind != "days" && it.rateOn } ?: false
    fun byId(id: String) = events.firstOrNull { it.id == id }

    /** 已逾期：主日历看到的、没完成、结束日在今天之前 */
    fun overdue(today: LocalDate) = events.filter { inMainView(it) && !it.done && it.end.isBefore(today) }
        .sortedWith(compareBy<Ev> { it.date }.then(cmp))

    companion object {
        val EMPTY = CalData(emptyList(), emptyMap(), "auto", "auto")
        private val DATE = Regex("\\d{4}-\\d{2}-\\d{2}")
        private val HM = Regex("\\d{2}:\\d{2}")

        fun parse(json: String): CalData {
            val o = if (json.isEmpty()) null else runCatching { JSONObject(json) }.getOrNull() ?: return EMPTY
            if (o == null) return EMPTY
            val cals = LinkedHashMap<String, CalInfo>()
            o.optJSONArray("cals")?.let { a ->
                for (i in 0 until a.length()) {
                    val c = a.optJSONObject(i) ?: continue
                    val id = c.optString("id"); if (id.isEmpty()) continue
                    val col = c.optString("color")
                    val labels = c.optJSONArray("rateLabels")
                    cals[id] = CalInfo(
                        id, c.optString("name", "记录"),
                        if (col.matches(Regex("#[0-9a-fA-F]{6}"))) (0xFF000000 or col.substring(1).toLong(16)).toInt() else Palette.CAL_DEFAULT,
                        c.optBoolean("showInMain"), c.optBoolean("notify"), c.optString("kind"),
                        c.optString("kind") != "days" && c.optBoolean("rateOn"),
                        (0 until 4).map { k -> labels?.optString(k)?.takeIf { it.isNotBlank() } ?: listOf("低", "中", "高", "超高")[k] },
                        c.optLong("createdAt"),
                    )
                }
            }
            val evs = ArrayList<Ev>()
            o.optJSONArray("events")?.let { a ->
                for (i in 0 until a.length()) parseEvent(a.optJSONObject(i) ?: continue)?.let { evs.add(it) }
            }
            val prof = o.optJSONObject("profile")
            return CalData(evs, cals, prof?.optString("clock")?.ifEmpty { "auto" } ?: "auto", prof?.optString("lang")?.ifEmpty { "auto" } ?: "auto")
        }

        fun parseEvent(e: JSONObject): Ev? {
            val ds = e.optString("date"); if (!ds.matches(DATE)) return null
            val date = runCatching { LocalDate.parse(ds) }.getOrNull() ?: return null
            val time = e.optString("time").takeIf { it.matches(HM) } ?: ""
            val r = e.opt("remind")
            val remind = when (r) { is Number -> r.toInt(); is String -> r.toIntOrNull(); else -> null }
            val p = e.optInt("priority", 0)
            val rep = e.optJSONObject("rep")
            return Ev(
                id = e.optString("id"), date = date, title = e.optString("title"), note = e.optString("note"),
                priority = if (p in 0..3) p else 0, rate = e.optInt("rate", 0).takeIf { it in 1..4 } ?: 0,
                done = e.optBoolean("done"), time = time,
                endTime = e.optString("endTime").takeIf { time.isNotEmpty() && it.matches(HM) } ?: "",
                remind = remind, days = if (time.isEmpty()) e.optInt("days", 1).coerceIn(1, 60) else 1,
                cal = e.optString("cal", ""), series = e.optString("series", ""),
                repFreq = rep?.optString("freq")?.ifEmpty { null }, repForever = rep?.optBoolean("forever") ?: false,
                hasSegs = (e.optJSONObject("segs")?.length() ?: 0) > 0,
                createdAt = e.optLong("createdAt"), updatedAt = e.optLong("updatedAt"),
            )
        }
    }
}

/** 日期、重复、提醒等小工具（和 js/store.js 同名函数一致） */
object Dates {
    fun uid(): String = java.lang.Long.toString(System.currentTimeMillis(), 36) +
        (1..6).map { "0123456789abcdefghijklmnopqrstuvwxyz"[Random.nextInt(36)] }.joinToString("")

    /** 一周从哪天开始：0 = 周日，1 = 周一（和网页 settings.weekStart 一致） */
    fun weekStartOf(d: LocalDate, weekStart: Int): LocalDate {
        val dow = d.dayOfWeek.value % 7 // 周日 = 0
        return d.minusDays(((dow - weekStart + 7) % 7).toLong())
    }

    fun dayDiff(d: LocalDate, today: LocalDate = LocalDate.now()) = ChronoUnit.DAYS.between(today, d)

    val REPEATS = listOf("none", "day", "week", "2week", "month", "year")
    val HORIZON = mapOf("day" to 400L, "week" to 730L, "2week" to 730L, "month" to 1825L, "year" to 7300L)

    fun defaultUntil(start: LocalDate, mode: String): LocalDate = when (mode) {
        "day" -> start.plusMonths(1); "week" -> start.plusMonths(3); "2week" -> start.plusMonths(6)
        "month" -> start.plusYears(1); "year" -> start.plusYears(5); else -> start.plusMonths(3)
    }

    /** MC.repeatDates：最多 400 个；每月 / 每年遇到没有这一天的月份（31 日、2 月 29 日）就跳过 */
    fun repeatDates(start: LocalDate, mode: String, until: LocalDate?): List<LocalDate> {
        if (mode == "none" || until == null || until.isBefore(start)) return listOf(start)
        val out = ArrayList<LocalDate>()
        for (i in 0 until 400) {
            val d: LocalDate = when (mode) {
                "day" -> start.plusDays(i.toLong())
                "week" -> start.plusWeeks(i.toLong())
                "2week" -> start.plusWeeks(2L * i)
                "month" -> { val m = start.withDayOfMonth(1).plusMonths(i.toLong()); if (start.dayOfMonth > m.lengthOfMonth()) continue; m.withDayOfMonth(start.dayOfMonth) }
                else -> { val y = start.withDayOfMonth(1).plusYears(i.toLong()); if (start.dayOfMonth > y.lengthOfMonth()) continue; y.withDayOfMonth(start.dayOfMonth) }
            }
            if (d.isAfter(until)) break
            out.add(d)
        }
        return out
    }

    fun minutes(hm: String) = hm.substring(0, 2).toInt() * 60 + hm.substring(3, 5).toInt()
    fun hm(min: Int): String { val m = ((min % 1440) + 1440) % 1440; return "%02d:%02d".format(m / 60, m % 60) }

    val WEEK_ORDER = listOf(DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY)
}
