package io.github.salmangox.monthcalendar

import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** 从通知、小组件、网页过渡页传来的跳转（例如 #today） */
object AppBus { val hash = MutableStateFlow<String?>(null) }

fun openWeb(c: Context, hash: String) {
    c.startActivity(Intent(c, WebActivity::class.java).putExtra(MainActivity.EXTRA_HASH, hash))
    (c as? android.app.Activity)?.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
}

@Composable
fun CadenceApp(weekStart: Int, onExit: () -> Unit) {
    val t = T
    val ctx = LocalContext.current
    val data by Repo.data.collectAsState()
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val hf = LocalHapticFeedback.current
    val toaster = remember { Toaster() }
    val editor = remember { EditorState() }
    val lens = remember { LensField() }
    var today by remember { mutableStateOf(LocalDate.now()) }
    var now by remember { mutableStateOf(LocalTime.now()) }
    LaunchedEffect(Unit) { while (true) { delay(60_000L - System.currentTimeMillis() % 60_000L); now = LocalTime.now(); today = LocalDate.now() } }

    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val dockB = maxOf(24.dp, navBottom + 10.dp) // 热区底边；圆面再往里收 6dp，离屏幕底边约 30dp
    val hit = 64.dp

    var selected by remember { mutableStateOf<LocalDate?>(null) }
    var preview by remember { mutableStateOf(false) }
    var fanOpen by remember { mutableStateOf(false) }
    var todayOpen by remember { mutableStateOf(false) }
    val todayP = remember { Animatable(0f) }
    var podRect by remember { mutableStateOf(Rect.Zero) }

    fun setToday(open: Boolean) {
        if (open == todayOpen && todayP.targetValue == (if (open) 1f else 0f)) return
        todayOpen = open; fanOpen = false
        hf.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        // 中途可以打断：从当前位置和速度接着往回走
        scope.launch { todayP.animateTo(if (open) 1f else 0f, spring(if (open) .8f else .9f, if (open) 320f else 420f)) }
    }

    fun toggleDone(e: Ev) {
        hf.performHapticFeedback(HapticFeedbackType.LongPress)
        Repo.setDone(e.id, !e.done)
    }

    LaunchedEffect(Unit) {
        AppBus.hash.collect { h ->
            if (h == null) return@collect
            AppBus.hash.value = null
            if (h == "#today") setToday(true) else if (h == "#cal") setToday(false)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(t.bg)) {
        val H = maxHeight
        val rowH = H / 6.5f
        val rowPx = with(density) { rowH.toPx() }
        val base = remember(weekStart) { Dates.weekStartOf(LocalDate.now().withDayOfMonth(1), weekStart) }
        val list = rememberLazyListState(WEEK_BASE - 1)
        val topWeek by remember(base) { derivedStateOf { base.plusWeeks((list.firstVisibleItemIndex - WEEK_BASE + if (list.firstVisibleItemScrollOffset > rowPx / 2) 1 else 0).toLong()) } }
        val focus by remember { derivedStateOf { focusMonth(topWeek) } }
        val todayIdx = weekIndex(base, Dates.weekStartOf(today, weekStart))
        val away by remember(todayIdx) { derivedStateOf { focus != YearMonth.from(today) || todayIdx < list.firstVisibleItemIndex + 1 || todayIdx > list.firstVisibleItemIndex + 5 } }
        fun goToday() {
            val idx = weekIndex(base, Dates.weekStartOf(today.withDayOfMonth(1), weekStart)) - 1
            scope.launch { list.animateScrollToItem(idx) }
        }
        val previewH = H * 0.42f
        val dockTop = H - dockB - hit
        // 选中的一周被下面的预览挡住：滚到刚好露出来
        fun reveal(d: LocalDate) {
            val idx = weekIndex(base, Dates.weekStartOf(d, weekStart))
            val visibleRows = ((dockTop - previewH - 8.dp) / rowH).toInt().coerceAtLeast(2)
            val first = list.firstVisibleItemIndex
            if (idx > first + visibleRows - 1) scope.launch { list.animateScrollToItem(idx - visibleRows + 1) }
            else if (idx < first + 1) scope.launch { list.animateScrollToItem(idx - 1) }
        }

        // ---------- 日历（整页，玻璃下面的部分带折射） ----------
        MonthView(
            list, base, rowH, data, today, if (preview) selected else null, focus,
            Modifier.refract(lens, with(density) { 11.dp.toPx() }),
            onTap = { d ->
                if (fanOpen) { fanOpen = false; return@MonthView }
                if (preview && d == selected) { preview = false } else { selected = d; preview = true; reveal(d) }
            },
            onLong = { d -> hf.performHapticFeedback(HapticFeedbackType.LongPress); editor.openNew(ctx, d, true) },
        )
        // 状态栏那一条盖住，日历其余部分整页显示
        Box(Modifier.fillMaxWidth().height(statusTop).background(t.bg))

        // ---------- 顶部：悬浮月份胶囊 + 悬浮星期条 ----------
        val halo = Shadow(if (t.dark) Color(0xCC000000) else Color(0xCCFFFFFF), blurRadius = 10f)
        var capMenu by remember { mutableStateOf(false) }
        Box(Modifier.fillMaxWidth().padding(top = statusTop + 6.dp), contentAlignment = Alignment.TopCenter) {
            Box {
                Tap(Modifier.height(54.dp).padding(horizontal = 6.dp), label = tr("选择"), onClick = { capMenu = true }) { m ->
                    Row(
                        m.lens(lens, "cap", with(density) { 19.dp.toPx() }).height(38.dp).glass(RoundedCornerShape(50), t).padding(start = 17.dp, end = 14.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        AnimatedContent(focus, transitionSpec = { (fadeIn(tween(220)) + slideInVertically { if (targetState > initialState) it / 2 else -it / 2 }) togetherWith fadeOut(tween(160)) }, label = "m") { f ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(Fmt.month(f), color = t.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp, style = TextStyle(shadow = halo))
                                Text(f.year.toString(), color = t.text2, fontSize = 15.sp, fontWeight = FontWeight.Medium, style = Num.copy(shadow = halo))
                            }
                        }
                        Canvas(Modifier.size(10.dp)) {
                            val w = size.width
                            drawLine(t.text2, androidx.compose.ui.geometry.Offset(w * .15f, w * .35f), androidx.compose.ui.geometry.Offset(w * .5f, w * .7f), 2.dp.toPx(), StrokeCap.Round)
                            drawLine(t.text2, androidx.compose.ui.geometry.Offset(w * .5f, w * .7f), androidx.compose.ui.geometry.Offset(w * .85f, w * .35f), 2.dp.toPx(), StrokeCap.Round)
                        }
                    }
                }
                DropdownMenu(capMenu, { capMenu = false }, shape = RoundedCornerShape(16.dp), containerColor = t.frostStrong) {
                    DropdownMenuItem({ Text(tr("回到今天"), color = t.text) }, onClick = { capMenu = false; goToday() })
                    DropdownMenuItem({ Text(tr("日历与纪念日…"), color = t.text) }, onClick = { capMenu = false; openWeb(ctx, "#drawer") })
                    DropdownMenuItem({ Text(tr("日程"), color = t.text) }, onClick = { capMenu = false; openWeb(ctx, "#sched") })
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = statusTop + 50.dp, start = 2.dp, end = 2.dp).height(20.dp), verticalAlignment = Alignment.CenterVertically) {
            for (k in 0 until 7) Text(
                Fmt.wdHead((weekStart + k) % 7), Modifier.weight(1f), color = t.text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, letterSpacing = .4.sp, style = TextStyle(shadow = Shadow(t.bg, blurRadius = 8f)),
            )
        }
        // 不在本月 / 本周时：右上角「今天」
        AnimatedVisibility(away && !todayOpen, Modifier.align(Alignment.TopEnd).padding(top = statusTop + 4.dp, end = 4.dp), enter = fadeIn() + scaleIn(initialScale = .6f), exit = fadeOut() + scaleOut(targetScale = .6f)) {
            Tap(Modifier.size(width = 74.dp, height = 46.dp), label = tr("回到今天"), onClick = { goToday() }) { m ->
                Box(m.lens(lens, "back", with(density) { 17.dp.toPx() }, away).height(34.dp).glass(RoundedCornerShape(50), t).padding(horizontal = 13.dp), contentAlignment = Alignment.Center) {
                    Text(tr("今天"), color = t.accentText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = halo))
                }
            }
        }

        // ---------- 当天预览：从下面升起的卡片，往下拖收起 ----------
        AnimatedVisibility(
            preview && selected != null && !todayOpen,
            Modifier.align(Alignment.BottomCenter).padding(bottom = dockB + hit + 4.dp, start = 8.dp, end = 8.dp),
            enter = slideInVertically(spring(.82f, 420f)) { it } + fadeIn(), exit = slideOutVertically(tween(220)) { it } + fadeOut(tween(200)),
        ) {
            val d = selected ?: today
            val drag = remember { Animatable(0f) }
            val evs = data.on(d)
            Column(
                Modifier.fillMaxWidth().height(previewH).offset { IntOffset(0, drag.value.roundToInt()) }
                    .shadow(24.dp, RoundedCornerShape(28.dp), ambientColor = Color(0x40142038), spotColor = Color(0x40142038))
                    .clip(RoundedCornerShape(28.dp)).background(if (t.dark) Color(0xFF1C1C1F) else Color(0xFFFCFCFE)),
            ) {
                Row(
                    Modifier.fillMaxWidth().pointerInput(d) {
                        detectVerticalDragGestures(
                            onDragEnd = { scope.launch { if (drag.value > 90 * density.density) { preview = false; drag.snapTo(0f) } else drag.animateTo(0f, spring(.5f, 500f)) } },
                        ) { ch, dy -> ch.consume(); scope.launch { drag.snapTo((drag.value + dy).let { if (it < 0) it * .3f else it }) } }
                    }.padding(start = 20.dp, end = 8.dp, top = 14.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(Fmt.mdw(d), color = t.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        val done = evs.count { it.done }
                        Text(Fmt.rel(d, today) + if (evs.isNotEmpty()) " · " + tr("{0} 项，已完成 {1}", evs.size, done) else "", color = t.text2, fontSize = 13.sp)
                    }
                    Tap(Modifier.size(48.dp), label = tr("新建"), onClick = { editor.openNew(ctx, d, true) }) { m ->
                        Box(m.size(34.dp).clip(CircleShape).background(t.brand), contentAlignment = Alignment.Center) { PlusIcon(Color.White, 15.dp) }
                    }
                    Tap(Modifier.size(48.dp), label = tr("收起"), onClick = { preview = false }) { m ->
                        Box(m.size(34.dp).clip(CircleShape).background(t.field), contentAlignment = Alignment.Center) {
                            Canvas(Modifier.size(14.dp)) {
                                val w = size.width
                                drawLine(t.text2, androidx.compose.ui.geometry.Offset(w * .2f, w * .38f), androidx.compose.ui.geometry.Offset(w * .5f, w * .66f), 2.2.dp.toPx(), StrokeCap.Round)
                                drawLine(t.text2, androidx.compose.ui.geometry.Offset(w * .5f, w * .66f), androidx.compose.ui.geometry.Offset(w * .8f, w * .38f), 2.2.dp.toPx(), StrokeCap.Round)
                            }
                        }
                    }
                }
                if (evs.isEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(top = 26.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(tr("暂无安排"), color = t.text2, fontSize = 15.sp)
                        Text(tr("长按日期或点 ＋ 添加"), color = t.text3, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                } else LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 6.dp)) {
                    items(evs, key = { it.id }) { e -> EventRow(e, data, onToggle = { toggleDone(e) }, onOpen = { editor.openEdit(e) }) }
                }
            }
        }

        // ---------- logo 扇形打开时：点空白处收起 ----------
        if (fanOpen) Box(Modifier.fillMaxSize().background(t.backdrop.copy(alpha = .1f)).pointerInput(Unit) { detectTapGestures { fanOpen = false } })

        // ---------- 今日页：从时钟胶囊长出的大圆角卡片 ----------
        val p = todayP.value
        if (p > 0.001f && podRect != Rect.Zero) {
            val W = maxWidth
            val endL = 8.dp; val endT = statusTop + 6.dp; val endR = W - 8.dp; val endB = dockTop - 2.dp
            val sL = with(density) { podRect.left.toDp() }; val sT = with(density) { podRect.top.toDp() }
            val sR = with(density) { podRect.right.toDp() }; val sB = with(density) { podRect.bottom.toDp() }
            fun mix(a: Dp, b: Dp) = a + (b - a) * p
            val l = mix(sL, endL); val tp = mix(sT, endT); val r = mix(sR, endR); val b = mix(sB, endB)
            val rad = 26.dp + (34.dp - 26.dp) * p.coerceIn(0f, 1f)
            Box(Modifier.fillMaxSize().background(t.backdrop.copy(alpha = t.backdrop.alpha * .55f * p.coerceIn(0f, 1f))).pointerInput(Unit) { detectTapGestures { setToday(false) } })
            Box(
                Modifier.offset(l, tp).size(maxOf(r - l, 1.dp), maxOf(b - tp, 1.dp))
                    .shadow(30.dp * p.coerceIn(0f, 1f), RoundedCornerShape(rad), ambientColor = Color(0x55142038), spotColor = Color(0x55142038))
                    .clip(RoundedCornerShape(rad)).background(if (t.dark) Color(0xFF141416) else Color(0xFFF6F6F9))
                    .pointerInput(Unit) { detectTapGestures { } },
            ) {
                // 内容按最终大小排好，只是跟着卡片淡入、轻轻放大
                Box(
                    Modifier.size(endR - endL, endB - endT).graphicsLayer {
                        alpha = ((p - .35f) / .65f).coerceIn(0f, 1f)
                        val s = .94f + .06f * p.coerceIn(0f, 1f); scaleX = s; scaleY = s
                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 1f)
                    },
                ) {
                    TodayPage(data, weekStart, 18,
                        onOpen = { editor.openEdit(it) }, onToggle = { toggleDone(it) },
                        onMoveOverdue = { l2 -> Repo.move(l2.map { it.id }, today); toaster.show(tr("已把 {0} 个事件移到今天", l2.size)) })
                }
            }
        }

        // ---------- 底部悬浮控件：左时钟胶囊 · 中分页点 · 右 logo 扇形 ----------
        Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(bottom = dockB, start = 10.dp, end = 10.dp).height(hit)) {
            // 时钟胶囊 ↔ 返回日历
            Tap(Modifier.align(Alignment.CenterStart).height(hit), label = if (todayOpen) tr("日历") else tr("今日"), onClick = { setToday(!todayOpen) }) { m ->
                Box(
                    m.padding(6.dp).onGloballyPositioned { c -> val pp = c.positionInRoot(); podRect = Rect(pp.x, pp.y, pp.x + c.size.width, pp.y + c.size.height) }
                        .lens(lens, "pod", with(density) { 26.dp.toPx() }).height(52.dp).widthIn(min = 52.dp).glass(RoundedCornerShape(50), t)
                        .padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    AnimatedContent(todayOpen, transitionSpec = { (fadeIn(tween(260)) + scaleIn(initialScale = .72f)) togetherWith (fadeOut(tween(180)) + scaleOut(targetScale = .72f)) }, label = "pod") { open ->
                        if (open) Row(verticalAlignment = Alignment.CenterVertically) {
                            Canvas(Modifier.size(16.dp)) {
                                val w = size.width
                                drawLine(t.accentText, androidx.compose.ui.geometry.Offset(w * .62f, w * .18f), androidx.compose.ui.geometry.Offset(w * .3f, w * .5f), 2.3.dp.toPx(), StrokeCap.Round)
                                drawLine(t.accentText, androidx.compose.ui.geometry.Offset(w * .3f, w * .5f), androidx.compose.ui.geometry.Offset(w * .62f, w * .82f), 2.3.dp.toPx(), StrokeCap.Round)
                            }
                            Text(tr("日历"), color = t.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = halo), modifier = Modifier.padding(start = 3.dp))
                        } else {
                            val h12 = Fmt.h12(ctx)
                            val hm = Fmt.time(ctx, "%02d:%02d".format(now.hour, now.minute), true)
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(hm, color = t.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.4).sp, style = Num.copy(shadow = halo))
                                if (h12) Text(if (now.hour < 12) "AM" else "PM", color = t.text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp))
                            }
                        }
                    }
                }
            }
            // 分页点：日历 · 日程（日程这一页暂时打开网页版）
            val pagerA by animateFloatAsState(if (todayOpen) 0f else 1f, label = "pg")
            if (pagerA > 0.01f) Tap(Modifier.align(Alignment.Center).size(width = 76.dp, height = 48.dp).alpha(pagerA), label = tr("日程"), onClick = { openWeb(ctx, "#sched") }) { m ->
                Row(m.lens(lens, "pager", with(density) { 11.dp.toPx() }, !todayOpen).height(22.dp).glass(RoundedCornerShape(50), t).padding(horizontal = 9.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(18.dp, 6.dp).clip(CircleShape).background(t.accent))
                    Box(Modifier.size(6.dp).clip(CircleShape).background(t.accent.copy(alpha = .38f)))
                }
            }
            // logo + 扇形菜单
            Box(Modifier.align(Alignment.CenterEnd).size(hit)) {
                val fans = listOf(
                    Triple(tr("添加事件"), true) { fanOpen = false; editor.openNew(ctx, if (preview) selected ?: today else today, preview) },
                    Triple(tr("设置"), false) { fanOpen = false; openWeb(ctx, "#set") },
                )
                val angles = listOf(105.0, 165.0); val fanR = 84f
                fans.forEachIndexed { k, (label, add, fn) ->
                    val a = remember { Animatable(0f) }
                    LaunchedEffect(fanOpen) {
                        if (fanOpen) { delay((fans.size - 1 - k) * 32L); a.animateTo(1f, spring(.62f, 380f)) } else a.animateTo(0f, tween(200))
                    }
                    val v = a.value
                    if (v > 0.01f) {
                        val rad = Math.toRadians(angles[k])
                        Tap(
                            Modifier.align(Alignment.Center).offset { IntOffset((cos(rad) * fanR * v * density.density).roundToInt(), (-sin(rad) * fanR * v * density.density).roundToInt()) }
                                .size(62.dp).graphicsLayer { alpha = v.coerceIn(0f, 1f); scaleX = .35f + .65f * v; scaleY = .35f + .65f * v },
                            label = label, onClick = fn,
                        ) { m ->
                            Box(
                                (if (add) m.size(50.dp).shadow(10.dp, CircleShape, ambientColor = t.brandA, spotColor = t.brandA).clip(CircleShape).background(t.brand)
                                else m.lens(lens, "fan$k", with(density) { 25.dp.toPx() }, fanOpen).size(50.dp).glass(CircleShape, t)),
                                contentAlignment = Alignment.Center,
                            ) { if (add) PlusIcon(Color.White, 20.dp) else GearIcon(t.text, 22.dp) }
                        }
                    }
                }
                val rot by animateFloatAsState(if (fanOpen) 1f else 0f, spring(.6f, 400f), label = "lg")
                Tap(Modifier.fillMaxSize(), label = tr("更多"), onClick = { fanOpen = !fanOpen }) { m ->
                    Box(m.lens(lens, "logo", with(density) { 27.dp.toPx() }).size(54.dp).glass(CircleShape, t), contentAlignment = Alignment.Center) {
                        Image(painterResource(R.drawable.logo), null, Modifier.size(34.dp).graphicsLayer {
                            alpha = 1f - rot; rotationZ = 90f * rot; scaleX = 1f - .5f * rot; scaleY = 1f - .5f * rot
                        })
                        Canvas(Modifier.size(18.dp).graphicsLayer { alpha = rot * .85f; rotationZ = -90f * (1 - rot); scaleX = .5f + .5f * rot; scaleY = .5f + .5f * rot }) {
                            val w = size.width
                            drawLine(t.text, androidx.compose.ui.geometry.Offset(w * .15f, w * .15f), androidx.compose.ui.geometry.Offset(w * .85f, w * .85f), 2.2.dp.toPx(), StrokeCap.Round)
                            drawLine(t.text, androidx.compose.ui.geometry.Offset(w * .85f, w * .15f), androidx.compose.ui.geometry.Offset(w * .15f, w * .85f), 2.2.dp.toPx(), StrokeCap.Round)
                        }
                    }
                }
            }
        }

        ToastHost(toaster, Modifier.align(Alignment.BottomCenter).padding(bottom = dockB + hit + 12.dp, start = 16.dp, end = 16.dp))
        EditorSheet(editor, data, toaster)

        // 返回键：先收起扇形 / 今日页 / 预览；都没有时退到后台
        BackHandler { onExit() }
        BackHandler(preview) { preview = false }
        BackHandler(todayOpen) { setToday(false) }
        BackHandler(fanOpen) { fanOpen = false }
    }
}

@Composable
fun PlusIcon(c: Color, s: Dp) = Canvas(Modifier.size(s)) {
    val w = size.width; val st = 2.4.dp.toPx()
    drawLine(c, androidx.compose.ui.geometry.Offset(w / 2, w * .08f), androidx.compose.ui.geometry.Offset(w / 2, w * .92f), st, StrokeCap.Round)
    drawLine(c, androidx.compose.ui.geometry.Offset(w * .08f, w / 2), androidx.compose.ui.geometry.Offset(w * .92f, w / 2), st, StrokeCap.Round)
}

@Composable
fun GearIcon(c: Color, s: Dp) = Canvas(Modifier.size(s)) {
    val w = size.width; val cx = w / 2
    val st = 1.7.dp.toPx()
    for (i in 0 until 8) {
        val a = Math.toRadians(i * 45.0)
        drawLine(c, androidx.compose.ui.geometry.Offset(cx + (cos(a) * w * .3f).toFloat(), cx + (sin(a) * w * .3f).toFloat()),
            androidx.compose.ui.geometry.Offset(cx + (cos(a) * w * .45f).toFloat(), cx + (sin(a) * w * .45f).toFloat()), st * 1.6f, StrokeCap.Round)
    }
    drawCircle(c, w * .3f, style = Stroke(st))
    drawCircle(c, w * .12f, style = Stroke(st))
}
