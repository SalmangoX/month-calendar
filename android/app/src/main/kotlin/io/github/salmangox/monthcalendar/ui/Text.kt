package io.github.salmangox.monthcalendar

import android.content.Context
import java.time.LocalDate
import java.time.YearMonth

/** 界面文字：原文是简体中文，按同步数据里的语言（profile.lang）翻译，词表在 I18n.java */
fun tr(s: String, vararg a: Any): String = I18n.t(s, *a)

object Fmt {
    fun h12(c: Context) = Data.h12(c)
    fun time(c: Context, hm: String, noHalf: Boolean = false) = Data.fmt(hm, h12(c), noHalf)
    fun range(c: Context, a: String, b: String) = if (b.isEmpty()) time(c, a) else Data.range(a, b, h12(c))
    fun evTime(c: Context, e: Ev) = if (e.time.isEmpty()) "" else range(c, e.time, e.endTime)

    /** 0 = 周日 … 6 = 周六 */
    fun dow(d: LocalDate) = d.dayOfWeek.value % 7
    fun wdHead(i: Int): String = I18n.wdHead(i)
    fun wk(d: LocalDate): String = I18n.wk(dow(d))
    fun md(d: LocalDate): String = I18n.md(d.monthValue, d.dayOfMonth)
    fun mdw(d: LocalDate): String = md(d) + " " + wk(d)
    fun month(ym: YearMonth): String = I18n.mon(ym.monthValue)

    /** 今天 / 明天 / 后天 / 昨天 / n 天后 / n 天前 */
    fun rel(d: LocalDate, today: LocalDate = LocalDate.now()): String {
        val n = Dates.dayDiff(d, today)
        return when (n) {
            0L -> tr("今天"); 1L -> tr("明天"); 2L -> tr("后天"); -1L -> tr("昨天")
            else -> if (n > 0) tr("{0} 天后", n) else tr("{0} 天前", -n)
        }
    }

    /** 提醒选项（MC.remindOptions）：带时间的事件以开始时间为准，全天事件以当天 9:00 为准 */
    fun remindOptions(c: Context, hasTime: Boolean): List<Pair<Int?, String>> = if (hasTime) listOf(
        null to tr("无"), 0 to tr("准时"), 5 to tr("提前 5 分钟"), 15 to tr("提前 15 分钟"),
        30 to tr("提前 30 分钟"), 60 to tr("提前 1 小时"), 1440 to tr("提前 1 天"),
    ) else {
        val nine = time(c, "09:00")
        listOf(null to tr("无"), 0 to tr("当天 {0}", nine), 1440 to tr("提前 1 天 {0}", nine), 2880 to tr("提前 2 天 {0}", nine), 10080 to tr("提前 1 周 {0}", nine))
    }

    fun remindLabel(c: Context, v: Int?, hasTime: Boolean): String =
        remindOptions(c, hasTime).firstOrNull { it.first == v }?.second ?: tr("提前 {0} 分钟", v ?: 0)

    val repeatLabels = listOf("none" to "不重复", "day" to "每天", "week" to "每周", "2week" to "每两周", "month" to "每月", "year" to "每年")
    fun repeatLabel(v: String) = tr(repeatLabels.firstOrNull { it.first == v }?.second ?: "不重复")

    val priNames = listOf("无", "低", "中", "高")
}
