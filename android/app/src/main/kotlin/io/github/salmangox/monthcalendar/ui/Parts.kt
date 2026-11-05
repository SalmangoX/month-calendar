package io.github.salmangox.monthcalendar

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

// ---------- 事件列表的一行（UI.itemHTML）：左边圆圈勾完成，点其余地方打开编辑 ----------
@Composable
fun EventRow(e: Ev, data: CalData, showDate: Boolean = false, onToggle: () -> Unit, onOpen: () -> Unit) {
    val t = T
    val ctx = LocalContext.current
    val c = Color(Palette.evColor(e, data))
    Row(
        Modifier.fillMaxWidth().pointerInput(e, onOpen) { detectTapGestures(onTap = { onOpen() }) }.padding(end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Tap(Modifier.size(52.dp), label = if (e.done) tr("标为未完成") else tr("标为完成"), onClick = onToggle) { m ->
            Canvas(m.size(22.dp)) {
                val r = size.minDimension / 2
                if (e.done) {
                    drawCircle(c, r)
                    val p = Path().apply { moveTo(r * .55f, r * 1.02f); lineTo(r * .88f, r * 1.36f); lineTo(r * 1.48f, r * .68f) }
                    drawPath(p, Color.White, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                } else drawCircle(c, r - 0.9.dp.toPx(), style = Stroke(1.7.dp.toPx()))
            }
        }
        Column(Modifier.weight(1f).padding(vertical = 11.dp)) {
            Text(
                e.title.ifEmpty { tr("（无标题）") }, color = if (e.done) t.text2 else t.text, fontSize = 16.sp, lineHeight = 21.sp,
                textDecoration = if (e.done) TextDecoration.LineThrough else null, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val bits = ArrayList<String>()
            val cal = data.cal(e.cal)
            if (cal != null) bits.add(cal.name)
            if (showDate) bits.add(Fmt.md(e.date) + if (e.days > 1) "–" + Fmt.md(e.end) else "")
            else if (e.days > 1) bits.add(Fmt.md(e.date) + "–" + Fmt.md(e.end) + " · " + tr("共 {0} 天", e.days))
            Fmt.evTime(ctx, e).takeIf { it.isNotEmpty() }?.let { bits.add(it) }
            if (e.note.isNotEmpty()) bits.add(e.note)
            if (bits.isNotEmpty()) Text(
                bits.joinToString(" · "), color = if (showDate && !e.done && e.end.isBefore(java.time.LocalDate.now())) t.danger else t.text2,
                fontSize = 13.sp, lineHeight = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (data.rateOn(e.cal)) {
            if (e.rate > 0) Text(data.cal(e.cal)!!.rateLabels[e.rate - 1], color = c, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        } else if (e.priority > 0) PriMini(e.priority)
    }
}

/** 优先级渐变：无 → 低 → 中 → 高（和 styles.css 的 --pri-grad 一致） */
val PRI_COLORS = Palette.PRI.map { Color(it) }

/** 列表里的优先级：一根迷你渐变条，越重要露出的暖色越多 */
@Composable
fun PriMini(p: Int, w: Int = 18, h: Int = 6) {
    val t = T
    Canvas(Modifier.size(w.dp, h.dp)) {
        val r = CornerRadius(size.height / 2)
        drawRoundRect(t.text.copy(alpha = .12f), cornerRadius = r)
        drawRoundRect(Brush.horizontalGradient(PRI_COLORS, 0f, size.width), size = Size(size.width * p / 3f, size.height), cornerRadius = r)
    }
}

// ---------- 优先级拖动条：从左到右 无 → 低 → 中 → 高；渐变铺满整条、裁切露出到滑块中心 ----------
@Composable
fun PriorityBar(value: Int, onChange: (Int) -> Unit, labels: List<String> = Fmt.priNames.map { tr(it) }) {
    val t = T
    val n = labels.size - 1
    val f = remember { Animatable(value / n.toFloat()) }
    val scope = rememberCoroutineScope()
    val hf = LocalHapticFeedback.current
    var dragging by remember { mutableStateOf(false) }
    val thumbScale = remember { Animatable(1f) }
    LaunchedEffect(value) { if (!dragging) f.animateTo(value / n.toFloat(), spring(.62f, Spring.StiffnessMediumLow)) }
    val th = 28.dp; val pad = 3.dp
    Column(Modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.fillMaxWidth().height(th + pad * 2)) {
            val wPx = with(LocalDensity.current) { maxWidth.toPx() }
            val thPx = with(LocalDensity.current) { th.toPx() }; val padPx = with(LocalDensity.current) { pad.toPx() }
            val span = wPx - padPx * 2 - thPx
            fun idxAt(x: Float) = (((x - padPx - thPx / 2) / span) * n).roundToInt().coerceIn(0, n)
            var last by remember { mutableStateOf(value) }
            Canvas(
                Modifier.matchParentSize()
                    .pointerInput(n, span) {
                        detectTapGestures { o -> val i = idxAt(o.x); if (i != value) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove); onChange(i) }
                    }
                    .pointerInput(n, span) {
                        detectHorizontalDragGestures(
                            onDragStart = { dragging = true; scope.launch { thumbScale.animateTo(1.55f, spring(.55f, 400f)) } },
                            onDragEnd = {
                                dragging = false
                                val i = (f.value * n).roundToInt().coerceIn(0, n)
                                onChange(i)
                                scope.launch { thumbScale.animateTo(1f, spring(.5f)) }
                                scope.launch { f.animateTo(i / n.toFloat(), spring(.62f, Spring.StiffnessMediumLow)) }
                            },
                            onDragCancel = { dragging = false; scope.launch { thumbScale.animateTo(1f) } },
                        ) { ch, dx ->
                            ch.consume()
                            val nf = (f.value + dx / span).coerceIn(0f, 1f)
                            scope.launch { f.snapTo(nf) }
                            val i = (nf * n).roundToInt()
                            if (i != last) { last = i; hf.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
                        }
                    },
            ) {
                val full = CornerRadius(size.height / 2)
                drawRoundRect(t.field, cornerRadius = full)
                drawRoundRect(t.brandB.copy(alpha = if (t.dark) .12f else .09f), cornerRadius = full)
                val innerW = size.width - padPx * 2
                val vis = f.value * (innerW - thPx) + thPx / 2
                // 渐变铺满整条（颜色停在四个刻度上），裁切露出到滑块中心：填得越多，暖色露得越多
                val x0 = padPx + thPx / 2; val x1 = padPx + innerW - thPx / 2
                drawRoundRect(
                    Brush.horizontalGradient(colorStops = PRI_COLORS.mapIndexed { i, c -> (i / 3f) to c }.toTypedArray(), startX = x0, endX = x1),
                    Offset(padPx, padPx), Size(vis, thPx), CornerRadius(thPx / 2),
                )
                for (j in 1..n) {
                    val x = padPx + thPx / 2 + j / n.toFloat() * span
                    drawCircle(t.text.copy(alpha = .22f), 2.dp.toPx(), Offset(x, size.height / 2))
                }
                val tx = padPx + f.value * span
                val sc = thumbScale.value
                val r = thPx / 2 * sc
                val center = Offset(tx + thPx / 2, size.height / 2)
                // 滑块：透明玻璃；拖动时放大成比整根条还粗的透镜，下面的渐变透过来
                val lens = ((sc - 1f) / .55f).coerceIn(0f, 1f)
                drawCircle(Color.Black.copy(alpha = (if (t.dark) .35f else .14f) * (1 - lens * .5f)), r + 1.dp.toPx(), center + Offset(0f, 2.5.dp.toPx()))
                val top = if (t.dark) .42f - .28f * lens else .72f - .46f * lens
                val bot = if (t.dark) .22f - .18f * lens else .42f - .34f * lens
                drawCircle(Brush.verticalGradient(listOf(Color.White.copy(alpha = top), Color.White.copy(alpha = bot)), center.y - r, center.y + r), r, center)
                drawCircle(Color.White.copy(alpha = if (t.dark) .28f else .95f), r - .5.dp.toPx(), center, style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()))
            }
        }
        // 刻度文字
        BoxWithConstraints(Modifier.fillMaxWidth().height(24.dp).padding(top = 5.dp)) {
            val w = maxWidth
            labels.forEachIndexed { j, s ->
                val x = pad + th / 2 + (w - pad * 2 - th) * (j / n.toFloat())
                val on = j == value
                Box(
                    Modifier.offset(x = x - 30.dp).width(60.dp).pointerInput(j) { detectTapGestures { onChange(j) } },
                    contentAlignment = when (j) { 0 -> Alignment.CenterStart; n -> Alignment.CenterEnd; else -> Alignment.Center },
                ) {
                    Text(s, color = if (on) t.text else t.text2, fontSize = 12.5.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                        modifier = Modifier.padding(start = if (j == 0) 22.dp else 0.dp, end = if (j == n) 22.dp else 0.dp))
                }
            }
        }
    }
}

// ---------- 滚轮（时间、日期）：吸附到每一格，中间一格高亮 ----------
@Composable
fun Wheel(count: Int, initial: Int, label: (Int) -> String, modifier: Modifier = Modifier, wrap: Boolean = false, onPick: (Int) -> Unit) {
    val t = T
    val itemH = 34.dp
    val total = if (wrap) count * 400 else count
    val startIdx = if (wrap) count * 200 + initial else initial
    val st = rememberLazyListState(startIdx)
    val fling = rememberSnapFlingBehavior(st, SnapPosition.Center)
    val hf = LocalHapticFeedback.current
    val center by remember { derivedStateOf {
        val info = st.layoutInfo; val mid = (info.viewportStartOffset + info.viewportEndOffset) / 2
        info.visibleItemsInfo.minByOrNull { abs(it.offset + it.size / 2 - mid) }?.index ?: startIdx
    } }
    LaunchedEffect(st) {
        var first = true
        snapshotFlow { center }.collect { if (!first) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove); first = false }
    }
    LaunchedEffect(st) {
        snapshotFlow { st.isScrollInProgress }.collect { moving -> if (!moving) onPick(center % count) }
    }
    Box(modifier.height(itemH * 5)) {
        Box(Modifier.align(Alignment.Center).fillMaxWidth().height(itemH).background(t.field, RoundedCornerShape(10.dp)))
        LazyColumn(state = st, flingBehavior = fling, contentPadding = PaddingValues(vertical = itemH * 2), modifier = Modifier.fillMaxWidth()) {
            items(total) { i ->
                val d = abs(i - center)
                Box(Modifier.fillMaxWidth().height(itemH).graphicsLayer { alpha = if (d == 0) 1f else if (d == 1) .55f else .28f }, contentAlignment = Alignment.Center) {
                    Text(label(i % count), color = t.text, fontSize = if (d == 0) 19.sp else 17.sp, fontWeight = if (d == 0) FontWeight.Medium else FontWeight.Normal, style = Num, maxLines = 1)
                }
            }
        }
    }
}

// ---------- 提示条（可带「撤销」） ----------
@Stable
class Toaster {
    var msg by mutableStateOf<String?>(null); private set
    var action by mutableStateOf<Pair<String, () -> Unit>?>(null); private set
    var seq by mutableStateOf(0); private set
    fun show(m: String, act: Pair<String, () -> Unit>? = null) { msg = m; action = act; seq++ }
    fun hide() { msg = null; action = null }
}

@Composable
fun ToastHost(toaster: Toaster, modifier: Modifier) {
    val t = T
    LaunchedEffect(toaster.seq) { if (toaster.msg != null) { delay(if (toaster.action != null) 5000 else 2600); toaster.hide() } }
    AnimatedVisibility(
        toaster.msg != null, modifier,
        enter = fadeIn() + scaleIn(initialScale = .9f) + slideInVertically { it / 2 },
        exit = fadeOut() + scaleOut(targetScale = .94f) + slideOutVertically { it / 3 },
    ) {
        val m = toaster.msg ?: ""
        Row(
            Modifier.widthIn(max = 420.dp).shadow(16.dp, RoundedCornerShape(22.dp), ambientColor = Color(0x33142038), spotColor = Color(0x33142038))
                .clip(RoundedCornerShape(22.dp)).background(if (t.dark) Color(0xFF2A2A2E) else Color.White).padding(start = 18.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(m, color = t.text, fontSize = 14.sp, modifier = Modifier.padding(vertical = 13.dp).weight(1f, fill = false))
            toaster.action?.let { (label, fn) ->
                Tap(Modifier.height(44.dp).padding(horizontal = 4.dp), onClick = { fn(); toaster.hide() }) { m2 ->
                    Text(label, m2.padding(horizontal = 10.dp), color = t.accentText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            } ?: Spacer(Modifier.width(12.dp))
        }
    }
}

/** 分组卡片（设置项、今日页的分区） */
@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val t = T
    Box(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (t.dark) Color(0xFF1C1C1F) else Color.White)) { Column { content() } }
}

@Composable
fun Hairline(start: Int = 52) {
    val t = T
    Box(Modifier.fillMaxWidth().padding(start = start.dp).height(0.5.dp).background(t.line))
}
