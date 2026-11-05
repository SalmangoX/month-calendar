package io.github.salmangox.monthcalendar

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/** 月视图的行号 ↔ 周：第 BASE 行是 base 那一周，上下各能滚很远 */
const val WEEK_BASE = 5000
const val WEEK_COUNT = 10000

fun weekIndex(base: LocalDate, weekStart: LocalDate) = WEEK_BASE + ChronoUnit.WEEKS.between(base, weekStart).toInt()

/** 当前主要月份：从最上面一行起的 6 周里，天数最多的那个月（和网页 computeFocus 一致） */
fun focusMonth(top: LocalDate): YearMonth =
    (0 until 42).map { YearMonth.from(top.plusDays(it.toLong())) }.groupingBy { it }.eachCount().maxByOrNull { it.value }!!.key

@Immutable
private class Slot(val e: Ev, val bar: Boolean, val c0: Int = 0, val c1: Int = 0, val slot: Int = 0)

/** 给一周 7 天排位置（网页 layWeek）：跨天事件先占上面的行（开始早、跨得长的在上），单天事件依次填进空位 */
private fun layWeek(days: List<LocalDate>, data: CalData): Pair<List<Slot>, List<MutableList<Slot?>>> {
    val evsBy = days.map { data.on(it) }
    val multi = LinkedHashMap<String, IntArray>()
    val multiEv = HashMap<String, Ev>()
    evsBy.forEachIndexed { c, evs -> evs.forEach { e -> if (e.spans) { val m = multi[e.id]; if (m != null) m[1] = c else { multi[e.id] = intArrayOf(c, c); multiEv[e.id] = e } } } }
    val order = multi.entries.sortedWith(compareBy<Map.Entry<String, IntArray>> { it.value[0] }.thenByDescending { it.value[1] - it.value[0] }.thenComparator { a, b -> data.cmp.compare(multiEv[a.key]!!, multiEv[b.key]!!) })
    val occ = days.map { ArrayList<Slot?>() }
    fun MutableList<Slot?>.at(s: Int) = if (s < size) this[s] else null
    fun MutableList<Slot?>.set2(s: Int, v: Slot) { while (size <= s) add(null); this[s] = v }
    val bars = ArrayList<Slot>()
    for ((id, r) in order) {
        var s = 0
        while ((r[0]..r[1]).any { occ[it].at(s) != null }) s++
        val b = Slot(multiEv[id]!!, true, r[0], r[1], s)
        bars.add(b)
        for (c in r[0]..r[1]) occ[c].set2(s, b)
    }
    evsBy.forEachIndexed { c, evs -> evs.forEach { e -> if (!multi.containsKey(e.id)) { var s = 0; while (occ[c].at(s) != null) s++; occ[c].set2(s, Slot(e, false, slot = s)) } } }
    return bars to occ
}

@Composable
fun MonthView(
    state: LazyListState,
    base: LocalDate,
    rowH: Dp,
    data: CalData,
    today: LocalDate,
    selected: LocalDate?,
    focus: YearMonth,
    modifier: Modifier = Modifier,
    onTap: (LocalDate) -> Unit,
    onLong: (LocalDate) -> Unit,
) {
    val fling = rememberSnapFlingBehavior(state, SnapPosition.Start)
    LazyColumn(state = state, flingBehavior = fling, modifier = modifier.fillMaxSize()) {
        items(WEEK_COUNT, key = { it }) { i ->
            WeekRow(base.plusWeeks((i - WEEK_BASE).toLong()), rowH, data, today, selected, focus, onTap, onLong)
        }
    }
}

@Composable
private fun WeekRow(
    start: LocalDate, rowH: Dp, data: CalData, today: LocalDate, selected: LocalDate?, focus: YearMonth,
    onTap: (LocalDate) -> Unit, onLong: (LocalDate) -> Unit,
) {
    val t = T
    val ctx = LocalContext.current
    val days = remember7(start)
    val (bars, occ) = layWeek(days, data)
    // 放得下就全显示；放不下时留一行显示「+n」（网页 measure / cellChips）
    val head = 42f
    val maxChips = maxOf(1, ((rowH.value - head + 2) / 17).toInt())
    val withMore = ((rowH.value - head - 12 + 2) / 17).toInt()
    val room = rowH.value - head
    val lims = occ.map { o -> if (o.size <= maxChips) o.size else maxOf(1, withMore) }
    val inFocus = days.map { YearMonth.from(it) == focus }
    val frame = if (t.dark) t.accentText.copy(alpha = .62f) else t.accent.copy(alpha = .55f)
    val density = LocalDensity.current

    BoxWithConstraints(
        Modifier.fillMaxWidth().height(rowH).padding(horizontal = 2.dp)
            .drawBehind {
                val cw = size.width / 7
                drawLine(t.line, Offset(-2.dp.toPx(), 0f), Offset(size.width + 2.dp.toPx(), 0f), 0.5.dp.toPx())
                // 选中的那天：一块平的主色淡底（今天被选中时带一点品牌暖色）
                days.forEachIndexed { c, d ->
                    if (d != selected) return@forEachIndexed
                    val tl = Offset(c * cw + 1.dp.toPx(), 2.dp.toPx()); val sz = Size(cw - 2.dp.toPx(), size.height - 4.dp.toPx())
                    if (d == today) drawRoundRect(Brush.linearGradient(listOf(t.brandA.copy(alpha = if (t.dark) .22f else .16f), t.brandB.copy(alpha = if (t.dark) .16f else .14f)), tl, tl + Offset(sz.width, sz.height)), tl, sz, CornerRadius(11.dp.toPx()))
                    else drawRoundRect(t.selTint, tl, sz, CornerRadius(11.dp.toPx()))
                }
                // 当前主要月份：一圈虚线框（逐格画边，交界处自然成阶梯）
                val i = 1.5.dp.toPx(); val dash = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))
                val st = 1.4.dp.toPx()
                fun line(a: Offset, b: Offset) = drawLine(frame, a, b, st, pathEffect = dash)
                days.forEachIndexed { c, d ->
                    if (!inFocus[c]) return@forEachIndexed
                    val x0 = c * cw; val x1 = x0 + cw
                    if (c == 0 || !inFocus[c - 1]) line(Offset(x0 + i, 0f), Offset(x0 + i, size.height))
                    if (c == 6 || !inFocus[c + 1]) line(Offset(x1 - i, 0f), Offset(x1 - i, size.height))
                    if (YearMonth.from(d.minusDays(7)) != focus) line(Offset(x0, i), Offset(x1, i))
                    if (YearMonth.from(d.plusDays(7)) != focus) line(Offset(x0, size.height - i), Offset(x1, size.height - i))
                }
            },
    ) {
        val cw = maxWidth / 7
        // 7 个格子：数字、单天事件、+n、时间
        days.forEachIndexed { c, d ->
            val out = !inFocus[c]
            Box(
                Modifier.offset(x = cw * c).width(cw).height(rowH)
                    .pointerInput(d) { detectTapGestures(onTap = { onTap(d) }, onLongPress = { onLong(d) }) },
            ) {
                if (d.dayOfMonth == 1) Text(Fmt.month(YearMonth.from(d)), Modifier.padding(start = 5.dp, top = 3.dp), color = t.accentText, fontSize = 8.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                DayNum(d, d == today, d == selected, out, Modifier.align(Alignment.TopCenter).padding(top = 6.dp))
                // 单天事件
                val o = occ[c]; val lim = lims[c]
                val shown = minOf(lim, o.size)
                var hidden = 0
                for (s in lim until o.size) if (o[s] != null) hidden++
                val more = hidden > 0 && withMore >= 1
                var lastBar = -1
                for (s in 0 until shown) if (o[s]?.bar == true) lastBar = s
                val timed = (lastBar + 1 until shown).count { o[it]?.e?.time?.isNotEmpty() == true }
                val showTimes = timed > 0 && hidden == 0 && 17 * shown - 2 + 13 * timed <= room
                var y = 39f
                Box(Modifier.alpha(if (out) .45f else 1f)) {
                    for (s in 0 until shown) {
                        val it = o[s]
                        if (it == null || it.bar) { y += 17; continue }
                        val e = it.e
                        val tm = e.time.isNotEmpty() && !(showTimes && s > lastBar)
                        Chip(e, data, Modifier.offset(y = y.dp).padding(horizontal = 3.dp).fillMaxWidth(), dot = tm)
                        y += 17
                        if (e.time.isNotEmpty() && showTimes && s > lastBar) {
                            Text(Fmt.time(ctx, e.time), Modifier.offset(y = (y - 1).dp).padding(start = 5.dp), color = t.text2, fontSize = 9.sp, lineHeight = 11.sp, maxLines = 1, style = Num, fontWeight = FontWeight.Medium, overflow = TextOverflow.Clip)
                            y += 13
                        }
                    }
                    if (more) Text("+$hidden", Modifier.offset(y = (39 + 17 * shown).dp).padding(start = 7.dp), color = t.text2, fontSize = 10.sp, lineHeight = 12.sp)
                }
            }
        }
        // 跨天的全天事件：在一周里拉成一条横条；被「+n」挡住的日子断开；从上周延续来 / 延续到下周的一端是平的
        for (b in bars) {
            var c = b.c0
            while (c <= b.c1) {
                if (b.slot >= lims[c]) { c++; continue }
                var d = c
                while (d + 1 <= b.c1 && b.slot < lims[d + 1]) d++
                val openL = days[c] != b.e.date; val openR = days[d] != b.e.end
                val il = if (openL) 0.dp else 3.dp; val ir = if (openR) 0.dp else 3.dp
                val outAll = (c..d).all { !inFocus[it] }
                Chip(
                    b.e, data,
                    Modifier.offset { with(density) { IntOffset((cw * c + il).roundToPx(), (39 + b.slot * 17).dp.roundToPx()) } }
                        .width(cw * (d - c + 1) - il - ir).alpha(if (outAll) .45f else 1f),
                    shape = RoundedCornerShape(if (openL) 0.dp else 4.5.dp, if (openR) 0.dp else 4.5.dp, if (openR) 0.dp else 4.5.dp, if (openL) 0.dp else 4.5.dp),
                    padStart = 4.dp,
                )
                c = d + 1
            }
        }
    }
}

private fun remember7(start: LocalDate) = (0 until 7).map { start.plusDays(it.toLong()) }

@Composable
private fun DayNum(d: LocalDate, isToday: Boolean, sel: Boolean, out: Boolean, modifier: Modifier) {
    val t = T
    val bg: Modifier = when {
        isToday && sel -> Modifier.background(t.brand, CircleShape)
        isToday -> Modifier.scale(.86f).background(Brush.linearGradient(listOf(t.brandA.copy(alpha = .26f), t.brandB.copy(alpha = .34f))), CircleShape)
        sel -> Modifier.drawBehind { drawCircle(t.accent, radius = size.minDimension / 2 - 0.8.dp.toPx(), style = Stroke(1.6.dp.toPx())) }
        else -> Modifier
    }
    Box(modifier.size(27.dp).then(bg), contentAlignment = Alignment.Center) {
        Text(
            d.dayOfMonth.toString(),
            color = when { isToday && sel -> Color.White; isToday || sel -> t.accentText; out -> t.text3; else -> t.text },
            fontSize = 14.5.sp, lineHeight = 15.sp,
            fontWeight = if (isToday || sel) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

/** 事件色条：浅色是实色底白字；深色用专门的深色调；完成的淡一些、带删除线 */
@Composable
fun Chip(e: Ev, data: CalData, modifier: Modifier, dot: Boolean = false, shape: RoundedCornerShape = RoundedCornerShape(4.5.dp), padStart: Dp = 2.dp) {
    val t = T
    val ci = Palette.evColor(e, data)
    val c = Color(ci)
    val (bg, fg) = when {
        e.done -> c.copy(alpha = if (t.dark) .28f else .18f) to lerp(t.text2, c, .7f)
        t.dark -> Palette.darkTone(ci).let { Color(it[0]) to Color(it[1]) }
        else -> c to Color.White
    }
    Box(modifier.height(15.dp).background(bg, shape).padding(start = padStart, end = if (dot) 7.dp else 2.dp), contentAlignment = Alignment.CenterStart) {
        Text(
            e.title, color = fg, fontSize = 9.5.sp, lineHeight = 15.sp, maxLines = 1, overflow = TextOverflow.Clip, softWrap = false,
            fontWeight = if (t.dark && !e.done) FontWeight.Medium else FontWeight.SemiBold, letterSpacing = (-0.2).sp,
            textDecoration = if (e.done) TextDecoration.LineThrough else null,
        )
        if (dot) Canvas(Modifier.align(Alignment.CenterEnd).offset(x = 4.dp).size(3.dp)) { drawCircle(fg.copy(alpha = .75f)) }
    }
}
