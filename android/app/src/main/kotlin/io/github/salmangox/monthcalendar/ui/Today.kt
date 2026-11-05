package io.github.salmangox.monthcalendar

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime

/**
 * 今日页（参考苹果日历的「日」视图，和网页 renderToday 一致）：上面一条本周的日期，
 * 再是已逾期、全天（没有具体时间的），最后是一整天的时间线；时间重叠的并排，今天有一条「现在」线。
 */
@Composable
fun TodayPage(
    data: CalData, weekStart: Int, topPad: Int,
    onOpen: (Ev) -> Unit, onToggle: (Ev) -> Unit, onMoveOverdue: (List<Ev>) -> Unit,
) {
    val t = T
    val ctx = LocalContext.current
    var now by remember { mutableStateOf(LocalTime.now()) }
    var today by remember { mutableStateOf(LocalDate.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000L - System.currentTimeMillis() % 60_000L); now = LocalTime.now(); today = LocalDate.now() } }
    var dayStr by rememberSaveable { mutableStateOf(today.toString()) }
    val ws = Dates.weekStartOf(today, weekStart)
    var day = LocalDate.parse(dayStr)
    if (day.isBefore(ws) || day.isAfter(ws.plusDays(6))) { day = today; dayStr = today.toString() }
    val isToday = day == today
    val list = data.on(day)
    val timed = list.filter { it.time.isNotEmpty() }
    val untimed = list.filter { it.time.isEmpty() }.let { l -> l.filter { !it.done } + l.filter { it.done } }
    val overdue = if (isToday) data.overdue(today) else emptyList()
    val scroll = rememberScrollState()

    Column(Modifier.fillMaxSize()) {
        // 标题
        val off = Dates.dayDiff(day, today)
        Column(Modifier.padding(start = 22.dp, end = 22.dp, top = topPad.dp)) {
            Text(
                if (isToday) tr("今天") else if (off == 1L) tr("明天") else if (off == -1L) tr("昨天") else Fmt.wk(day),
                color = t.text, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.6).sp,
            )
            Text(Fmt.mdw(day), color = t.text2, fontSize = 15.sp, modifier = Modifier.padding(top = 1.dp))
        }
        // 本周日期条
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 12.dp)) {
            for (k in 0 until 7) {
                val d = ws.plusDays(k.toLong())
                val on = d == day; val isT = d == today
                val has = data.on(d).any { !it.done }
                Tap(Modifier.weight(1f).height(66.dp), label = Fmt.mdw(d), onClick = { dayStr = d.toString() }) { m ->
                    Column(m, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(Fmt.wdHead(Fmt.dow(d)), color = if (isT) t.accentText else t.text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(5.dp))
                        Box(
                            Modifier.size(34.dp).clip(CircleShape).then(
                                when { on && isT -> Modifier.background(t.brand); on -> Modifier.background(t.text.copy(alpha = .9f)); else -> Modifier },
                            ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(d.dayOfMonth.toString(), color = when { on -> if (t.dark && !isT) t.bg else Color.White; isT -> t.accentText; else -> t.text },
                                fontSize = 16.sp, fontWeight = if (on || isT) FontWeight.Bold else FontWeight.Medium, style = Num)
                        }
                        Spacer(Modifier.height(4.dp))
                        Box(Modifier.size(4.dp).clip(CircleShape).background(if (has) t.accent.copy(alpha = .7f) else Color.Transparent))
                    }
                }
            }
        }
        // 上面的标题、本周日期条固定不动，下面的已逾期、全天、时间线滚动
        Column(Modifier.weight(1f).verticalScroll(scroll).padding(bottom = 24.dp)) {
        // 已逾期
        if (overdue.isNotEmpty()) {
            SectionHead(tr("已逾期"), overdue.size.toString(), t.danger, action = tr("全部移到今天") to { onMoveOverdue(overdue) })
            Card(Modifier.padding(horizontal = 14.dp)) {
                overdue.forEachIndexed { i, e -> if (i > 0) Hairline(); EventRow(e, data, showDate = true, onToggle = { onToggle(e) }, onOpen = { onOpen(e) }) }
            }
            Spacer(Modifier.height(14.dp))
        }
        // 全天
        if (untimed.isNotEmpty()) {
            SectionHead(tr("全天"), untimed.count { !it.done }.takeIf { it > 0 }?.toString() ?: "", t.text2)
            Card(Modifier.padding(horizontal = 14.dp)) {
                untimed.forEachIndexed { i, e -> if (i > 0) Hairline(); EventRow(e, data, onToggle = { onToggle(e) }, onOpen = { onOpen(e) }) }
            }
            Spacer(Modifier.height(14.dp))
        }
        if (list.isEmpty() && overdue.isEmpty()) {
            Text(if (isToday) tr("今天没有安排") else tr("这一天没有安排"), color = t.text2, fontSize = 15.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        Timeline(timed, data, isToday, now, onOpen, onToggle, scroll)
        }
    }
}

@Composable
private fun SectionHead(title: String, count: String, color: Color, action: Pair<String, () -> Unit>? = null) {
    val t = T
    Row(Modifier.fillMaxWidth().padding(start = 26.dp, end = 18.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        action?.let { (label, fn) ->
            Tap(Modifier.height(36.dp), onClick = fn) { m -> Text(label, m.padding(horizontal = 8.dp), color = t.accentText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
        }
        Text(count, color = t.text2, fontSize = 13.sp, style = Num)
    }
}

private class Span(val e: Ev, val a: Int, val b: Int) { var lane = 0; var lanes = 1 }

@Composable
private fun Timeline(
    timed: List<Ev>, data: CalData, isToday: Boolean, now: LocalTime,
    onOpen: (Ev) -> Unit, onToggle: (Ev) -> Unit, scroll: androidx.compose.foundation.ScrollState,
) {
    val t = T
    val ctx = LocalContext.current
    val hourH = 52
    val nowMin = now.hour * 60 + now.minute
    val spans = timed.map { e ->
        val a = Dates.minutes(e.time); var b = if (e.endTime.isNotEmpty()) Dates.minutes(e.endTime) else a + 30
        if (b <= a) b = minOf(1440, a + 30)
        Span(e, a, b)
    }.sortedWith(compareBy<Span> { it.a }.thenByDescending { it.b })
    var sH = minOf(8, spans.minOfOrNull { it.a / 60 } ?: 24, if (isToday) nowMin / 60 else 24)
    var eH = maxOf(21, spans.maxOfOrNull { (it.b + 59) / 60 } ?: 0, if (isToday) (nowMin + 60) / 60 else 0)
    sH = maxOf(0, sH); eH = minOf(24, eH)
    // 时间重叠的事件并排：一组互相重叠的事件平分宽度
    var group = ArrayList<Span>(); var gEnd = -1
    val groups = ArrayList<ArrayList<Span>>()
    for (x in spans) { if (group.isEmpty() || x.a >= gEnd) { group = ArrayList(); groups.add(group); gEnd = -1 }; group.add(x); gEnd = maxOf(gEnd, x.b) }
    for (g in groups) { val ends = ArrayList<Int>(); for (x in g) { var k = ends.indexOfFirst { it <= x.a }; if (k < 0) { k = ends.size; ends.add(0) }; ends[k] = x.b; x.lane = k }; g.forEach { it.lanes = ends.size } }

    val density = LocalDensity.current
    var top by remember { mutableStateOf(0) }
    // 第一次打开：「现在」那条线在屏幕下面看不到时，才往下滚到它
    LaunchedEffect(isToday, top) {
        if (!isToday || top == 0) return@LaunchedEffect
        val y = top + with(density) { ((nowMin / 60f - sH) * hourH).dp.roundToPx() }
        if (y > scroll.viewportSize * 0.72f && scroll.value == 0) scroll.animateScrollTo((y - scroll.viewportSize * 0.6f).toInt().coerceAtLeast(0))
    }
    BoxWithConstraints(
        Modifier.fillMaxWidth().padding(start = 8.dp, end = 14.dp, top = 8.dp).height(((eH - sH) * hourH + 12).dp)
            .androidxOnPlaced { top = it },
    ) {
        val left = 52.dp
        val w = maxWidth - left
        for (hr in sH..eH) {
            val y = ((hr - sH) * hourH).dp
            Row(Modifier.offset(y = y - 7.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (Fmt.h12(ctx)) Data.hourLabel(hr % 24, true) else "$hr:00", color = t.text2, fontSize = 11.sp, style = Num,
                    modifier = Modifier.width(left - 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End, maxLines = 1)
                Box(Modifier.padding(start = 6.dp).weight(1f).height(0.5.dp).background(t.line))
            }
        }
        for (x in spans) {
            val e = x.e
            val y = ((x.a / 60f - sH) * hourH).dp
            val h = maxOf(22f, (x.b - x.a) / 60f * hourH - 2).dp
            val lw = w / x.lanes
            val c = Color(Palette.evColor(e, data))
            val tiny = h < 38.dp
            Box(
                Modifier.offset(x = left + lw * x.lane + 1.dp, y = y + 1.dp).width(lw - 3.dp).height(h)
                    .clip(RoundedCornerShape(8.dp)).background(c.copy(alpha = if (e.done) .1f else if (t.dark) .3f else .17f))
                    .pointerInput(e) { detectTapGestures(onTap = { onOpen(e) }) },
            ) {
                Box(Modifier.width(3.dp).height(h).background(c.copy(alpha = if (e.done) .4f else 1f)))
                Column(Modifier.padding(start = 9.dp, end = 30.dp, top = if (tiny) 3.dp else 5.dp)) {
                    Text(e.title, color = if (e.done) t.text2 else t.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = if (tiny) 1 else 2,
                        overflow = TextOverflow.Ellipsis, textDecoration = if (e.done) TextDecoration.LineThrough else null, lineHeight = 16.sp)
                    if (!tiny) Text(Fmt.evTime(ctx, e) + if (e.note.isNotEmpty()) " · " + e.note else "", color = t.text2, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Tap(Modifier.align(Alignment.TopEnd).size(34.dp), label = tr("完成"), onClick = { onToggle(e) }) { m ->
                    Canvas(m.size(16.dp)) {
                        val r = size.minDimension / 2
                        if (e.done) {
                            drawCircle(c, r)
                            val p = Path().apply { moveTo(r * .55f, r * 1.02f); lineTo(r * .88f, r * 1.36f); lineTo(r * 1.48f, r * .68f) }
                            drawPath(p, Color.White, style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round))
                        } else drawCircle(c, r - 0.8.dp.toPx(), style = Stroke(1.5.dp.toPx()))
                    }
                }
            }
        }
        if (isToday && nowMin >= sH * 60 && nowMin <= eH * 60) {
            val y = ((nowMin / 60f - sH) * hourH).dp
            Row(Modifier.offset(y = y - 8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(left - 4.dp), contentAlignment = Alignment.CenterEnd) {
                    Text(Fmt.time(ctx, "%02d:%02d".format(now.hour, now.minute), true), color = Color.White, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, style = Num,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(t.danger).padding(horizontal = 4.dp, vertical = 1.dp))
                }
                Box(Modifier.size(7.dp).clip(CircleShape).background(t.danger))
                Box(Modifier.weight(1f).height(1.5.dp).background(t.danger))
            }
        }
    }
}

/** 记下自己在滚动内容里的位置（像素） */
private fun Modifier.androidxOnPlaced(cb: (Int) -> Unit) = this.onPlaced { cb(it.positionInParent().y.toInt()) }
