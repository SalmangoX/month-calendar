package io.github.salmangox.monthcalendar

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 底部悬浮控件（和 iPhone / Mac 的 GlassDock 一样）：左时钟胶囊 · 中分页点 · 右 logo 扇形 · 回到今天。
 * 网页里的那一份（#dock2）在 App 里只是 visibility:hidden（今日页展开动画还要用它的位置）；
 * 状态由 NAV_JS 发来（字段和 ios/App/WebShell.swift 的 navJS 一致），点按交给网页里同名的按钮。
 * 纪念日历也用这层（分页点是 日历 · 纪念日 · 总览 三页）。
 */
@Stable
// 【联动:底部悬浮控件】见 CLAUDE.md「联动分组」
class DockModel(private val eval: (String) -> Unit, private val tick: () -> Unit) {
    class Dock(val t: String, val ap: String, val today: Boolean, val back: String, val pager: Boolean, val n: Int, val p: Float, val set: Boolean,
               /** 扇形里有「统计」（开了等级评分的记录日历） */ val st: Boolean,
               /** 分页点亮着（正在左右切页）；false = 停下后淡下去 */ val lit: Boolean,
               /** 日历里点开某一天的卡片时，时钟和 logo 再抬高多少（dp）；-1 = 没打开 */ val pv: Float,
               /** 只有安卓用：月视图最下面那一行的顶边离 WebView 底多远（dp），时钟和 logo 整个放在这条线上面、当月虚线框里；0 = 还没量到 */ val fl: Float = 0f)

    var dock by mutableStateOf<Dock?>(null); private set
    var cover by mutableStateOf(false); private set
    var back by mutableStateOf(false); private set
    var fanOpen by mutableStateOf(false); private set
    /** 按住 logo 拖动（和网页 index.html、iPhone 的 GlassDock 一样）：手指在哪（屏幕坐标，px；null = 没在拖）、拖到了哪个扇形按钮上【联动:底部悬浮控件】 */
    var drag by mutableStateOf<Offset?>(null)
    var hot by mutableStateOf<String?>(null)
    var dragEndedAt = 0L
    /** logo 中心、底栏这一层左上角（屏幕坐标，px） */
    var logoC = Offset.Zero
    var origin = Offset.Zero
    val fx = FanFX()
    /** 拖动时后面的网页虚下去（景深）：网页的 body.fan-drag 让 .dock-scrim 带上模糊 */
    fun depth(on: Boolean) = eval("document.body.classList.toggle('fan-drag',$on)")
    fun hapticTick() = tick()
    var page = ""; private set

    /** 网页发来的状态（MCNative.nav） */
    fun update(json: String) {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return
        val d = o.optJSONObject("dock")?.let {
            Dock(it.optString("t"), it.optString("ap"), it.optBoolean("today"), it.optString("back").ifEmpty { "日历" },
                it.optBoolean("pager"), it.optInt("n", 2).coerceIn(2, 5), it.optDouble("p", 0.0).toFloat(), it.optBoolean("set"),
                it.optBoolean("st"), it.optBoolean("lit", true), it.optDouble("pv", -1.0).toFloat(), it.optDouble("fl", 0.0).toFloat())
        }
        if (d == null || d.set != dock?.set) fanOpen = false
        val pg = o.optString("page")
        if (pg != page) { fanOpen = false; page = pg }
        dock = d
        cover = o.optBoolean("cover")
        back = o.optBoolean("back")
    }

    private fun click(id: String) = eval("(function(){var b=document.getElementById('$id');if(b)b.click();})()")
    fun tapClock() { tick(); fanOpen = false; click("bubbleToday") }
    fun tapPager() { tick(); click("pager") }
    fun setFan(open: Boolean) { if (open != fanOpen) { tick(); fanOpen = open } }
    fun forceOpen() { fanOpen = true }
    fun fan(id: String) {
        fanOpen = false; tick()
        if (id == "add") click("fab") else if (id == "stat") click("fanStat") else click("fanSet")   // 设置页里它是「返回」，由网页决定回到哪一页
    }
    fun goToday() {
        tick()
        eval("(function(){var b=document.getElementById(document.body.dataset.page==='sched'?'schedBack':'calBack');if(b)b.click();})()")
    }
    /** 返回键：扇形开着先收起 */
    fun back(): Boolean { if (fanOpen) { fanOpen = false; return true }; return false }

    companion object {
        /** 尺寸和网页 styles.css 末尾、GlassNav.swift 的 DockSize 一致 */
        const val HIT = 64; const val LIFT = 40; const val SIDE = 10
        const val PILL = 52; const val LOGO = 54; const val FAN = 50; const val BACK = 46

        /** 网页加载完后注入：藏起网页自己的悬浮控件，状态变化时发给原生（和 iOS navJS 的 dockState / backShown 一样） */
        // 【联动:底部悬浮控件】见 CLAUDE.md「联动分组」
        const val NAV_JS = """
(function(){
  var N = window.MCNative; if (!N || !N.nav || window.__mcNav) return; window.__mcNav = 1;
  var last = '';
  function covered(){
    var u = (window.MC && MC.UI) || {};
    return !!((u.anyOpen && u.anyOpen()) || (u.confirmOpen && u.confirmOpen()) || document.documentElement.classList.contains('locked')
      || document.querySelector('.dp.show, .cam.show, .pv.show, #calDrawer.vis'));   // 侧拉菜单（安卓是网页画的）拉出来时，原生的时钟胶囊和 logo 也让开
  }
  function dockState(page){
    var d2 = document.getElementById('dock2'), pt = document.getElementById('ptTime');
    if (!d2 || !pt) return null;
    var ap = pt.querySelector('small'), apt = ap ? ap.textContent : ''; var pg = document.getElementById('pager');
    return { t: pt.textContent.replace(apt, '').trim(), ap: apt, today: page === 'today', back: ((document.getElementById('ptBackTxt') || {}).textContent || '').trim(),
             pager: !!pg && !pg.classList.contains('hide'), n: pg ? (+pg.dataset.n || 2) : 2, p: pg ? (+pg.dataset.p || 0) : 0, set: page === 'set',
             st: !!document.getElementById('fanStat') && !document.getElementById('fanStat').hidden,
             lit: !(document.getElementById('pager') || { classList: { contains: function(){ return false; } } }).classList.contains('idle'),
             pv: document.body.classList.contains('dock-pv') ? (parseFloat(document.body.style.getPropertyValue('--d2-pv')) || 0) : -1,
             fl: parseFloat(document.documentElement.style.getPropertyValue('--d2-floor')) || 0 };
  }
  function backShown(page){
    var id = page === 'cal' ? 'calBack' : page === 'sched' ? 'schedBack' : '', b = id && document.getElementById(id);
    return !!b && !b.hidden;
  }
  function send(){
    var page = document.body.dataset.page || 'cal';
    var j = JSON.stringify({ page: page, cover: covered(), back: backShown(page), dock: dockState(page) });
    if (j !== last) { last = j; try { N.nav(j); } catch (e) {} }
  }
  new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['data-page', 'data-kind'] });
  var cb = document.getElementById('calBack'); if (cb) new MutationObserver(send).observe(cb, { attributes: true, attributeFilter: ['hidden'] });
  var sb = document.getElementById('schedBack'); if (sb) new MutationObserver(send).observe(sb, { attributes: true, attributeFilter: ['hidden'] });
  var ptm = document.getElementById('ptTime'); if (ptm) new MutationObserver(send).observe(ptm, { childList: true, subtree: true, characterData: true });
  var pbt = document.getElementById('ptBackTxt'); if (pbt) new MutationObserver(send).observe(pbt, { childList: true, subtree: true, characterData: true });
  new MutationObserver(send).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
  new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['style'] }); // 日卡片打开时底栏挪进卡片（--d2-pv）
  var pgr = document.getElementById('pager'); if (pgr) new MutationObserver(send).observe(pgr, { attributes: true, attributeFilter: ['data-p', 'data-n'] }); // 拖动时分页点跟着走、页数
  send(); setTimeout(send, 600);
})();
"""

        /** 页面一开始就藏起网页自己的悬浮控件（等加载完再藏会先闪一下） */
        const val HIDE_CSS_JS = """(function(){if(!window.MCNative)return;var s=document.createElement('style');s.textContent='#calBack,#schedBack{display:none!important}#dock2,#dockScrim{visibility:hidden!important;pointer-events:none!important}';(document.head||document.documentElement).appendChild(s);})();"""
    }
}

private val halo @Composable get() = Shadow(if (T.dark) Color(0xCC000000) else Color(0xCCFFFFFF), blurRadius = 10f)

@Composable
fun DockOverlay(m: DockModel) {
    val d = m.dock ?: return
    val t = T
    val coverY by animateDpAsState(if (m.cover) 160.dp else 0.dp, if (m.cover) tween(120) else spring(.86f, 420f), label = "cv")
    val coverA by animateFloatAsState(if (m.cover) 0f else 1f, if (m.cover) tween(120) else spring(.86f, 420f), label = "ca")
    val b = 24 // 热区底边离 WebView 底边（WebView 已经在导航条上面）
    // 日历里点开某一天的卡片时：时钟和 logo 往上、往里挪，整个落在卡片底部里面（和网页、iPhone 一样）
    // 时钟胶囊、logo 按中轴放：左边对准周日 / 周一之间那条线，右边对准周五 / 周六之间那条线（和网页 --d2-cx、iPhone 一样），卡片打开时只往上挪
    // 安卓的 WebView 在导航条上面、日历行高也跟着变：固定抬 40 会压到最下面那一行。按网页量的那条行线（fl）再抬，底边离线 6dp
    val base = maxOf(DockModel.LIFT.toFloat(), if (d.fl > 0f) d.fl + 6f - b else 0f)
    val lift by animateDpAsState((base + maxOf(0f, d.pv)).dp, spring(.85f, 300f), label = "lf")
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned { m.origin = it.positionInRoot() }) {
        val cx = 2f + (maxWidth.value - 4f) / 7f
        // 扇形打开时：除了 logo 和扇形这一块，整个界面都暗一点（聚光的圆心是 logo），按住拖动时再暗一点；也接住点击，不会点穿到日历【联动:底部悬浮控件】
        val dimA by animateFloatAsState(if (m.drag != null) (if (t.dark) .4f else .17f) else (if (t.dark) .32f else .12f), tween(220), label = "dim")
        AnimatedVisibility(m.fanOpen && !m.cover, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
            Box(
                Modifier.fillMaxSize()
                    .drawBehind {
                        val R = 420.dp.toPx(); val c0 = if (m.drag != null) 130.dp.toPx() else 120.dp.toPx(); val c1 = if (m.drag != null) 220.dp.toPx() else 210.dp.toPx()
                        drawRect(Brush.radialGradient(
                            0f to Color.Transparent, c0 / R to Color.Transparent, c1 / R to Color.Black.copy(alpha = dimA), 1f to Color.Black.copy(alpha = dimA * 1.15f),
                            center = m.logoC - m.origin, radius = R,
                        ))
                    }
                    .pointerInput(Unit) { detectTapGestures { m.setFan(false) } },
            )
        }
        FanTrail(m)   // 按住 logo 拖动：logo 外面那圈玻璃被拉成一滴水 + 粒子（画在按钮下面）
        Box(Modifier.fillMaxSize().offset(y = coverY).graphicsLayer { alpha = coverA }) {
            if (!m.cover) {
                if (d.pager) Pager(m, d, Modifier.align(Alignment.BottomCenter).padding(bottom = b.dp))
                if (!d.set) Box(Modifier.align(Alignment.BottomStart).padding(bottom = b.dp + lift).width((cx * 2).dp), contentAlignment = Alignment.BottomCenter) { Clock(m, d, Modifier) }
                LogoCluster(m, d, Modifier.align(Alignment.BottomEnd).padding(end = (cx - DockModel.HIT / 2f).dp, bottom = b.dp + lift))
            }
        }
    }
}

// 时钟胶囊：平时是现在的时间，在今日页变成「‹ 日历」
@Composable
private fun Clock(m: DockModel, d: DockModel.Dock, modifier: Modifier) {
    val t = T
    Tap(modifier.height(DockModel.HIT.dp), label = if (d.today) d.back else tr("今日") + " " + d.t, haptic = false, onClick = { m.tapClock() }) { mod ->
        Box(
            mod.padding(((DockModel.HIT - DockModel.PILL) / 2).dp).height(DockModel.PILL.dp).widthIn(min = DockModel.PILL.dp).glass(RoundedCornerShape(50), t),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedContent(d.today, transitionSpec = { (fadeIn(tween(260)) + scaleIn(initialScale = .72f)) togetherWith (fadeOut(tween(180)) + scaleOut(targetScale = .72f)) }, label = "pod") { today ->
                if (today) Row(Modifier.padding(start = 13.dp, end = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Canvas(Modifier.size(16.dp)) {
                        val w = size.width
                        drawLine(t.accent, Offset(w * .62f, w * .16f), Offset(w * .28f, w * .5f), 2.3.dp.toPx(), StrokeCap.Round)
                        drawLine(t.accent, Offset(w * .28f, w * .5f), Offset(w * .62f, w * .84f), 2.3.dp.toPx(), StrokeCap.Round)
                    }
                    Text(d.back, color = t.text, fontSize = 15.5.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = halo), modifier = Modifier.padding(start = 3.dp))
                } else Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.Bottom) {
                    AnimatedContent(d.t, transitionSpec = { (fadeIn(tween(220)) + scaleIn(initialScale = .9f)) togetherWith fadeOut(tween(140)) }, label = "t") { tm ->
                        Text(tm, color = t.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.4).sp, style = Num.copy(shadow = halo))
                    }
                    if (d.ap.isNotEmpty()) Text(d.ap, color = t.text2, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 3.dp, bottom = 2.dp))
                }
            }
        }
    }
}

// 分页点：日历 / 日程
@Composable
private fun Pager(m: DockModel, d: DockModel.Dock, modifier: Modifier) {
    val t = T
    val p by animateFloatAsState(d.p, spring(.8f, 300f), label = "p")
    val dim by animateFloatAsState(if (d.lit) 1f else .3f, tween(350), label = "dim")   // 左右切页时亮起，停下后淡下去（和网页一样）
    Tap(modifier.height(DockModel.HIT.dp).width(84.dp).graphicsLayer { alpha = dim }, label = tr("切换日历 / 日程"), haptic = false, onClick = { m.tapPager() }) { mod ->
        Row(mod.height(22.dp).glass(RoundedCornerShape(50), t).padding(horizontal = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (i in 0 until d.n) {   // 几页就几个点（纪念日历是三页）
                val on = (1 - kotlin.math.abs(p - i)).coerceAtLeast(0f)
                Box(Modifier.size(width = (6 + 12 * on).dp, height = 6.dp).clip(CircleShape).background(t.accent.copy(alpha = .38f + .62f * on)))
            }
        }
    }
}

// logo + 扇形菜单 + 回到今天
@Composable
private fun LogoCluster(m: DockModel, d: DockModel.Dock, modifier: Modifier) {
    val t = T
    val density = LocalDensity.current
    // 设置页里「设置」换成「返回」；开了等级评分的记录日历在中间多一个「统计」（统计页里换成「返回」）
    val items = if (d.st) listOf("add", "stat", "set") else listOf("add", "set")
    val r = if (items.size == 3) 88f else 84f; val angles = if (items.size == 3) listOf(100.0, 145.0, 190.0) else listOf(115.0, 175.0)   // 整体相对 logo 逆时针转 10°
    val inStat = m.page == "rstat"
    val z by animateFloatAsState(if (m.drag != null) ZOOM else 1f, spring(.8f, 500f), label = "zm")   // 按住拖动时扇形这一块放大一点
    Box(modifier.size(DockModel.HIT.dp)) {
        // 回到今天 / 本周：平时贴在 logo 正上方；扇形弹出时被顶到扇形上方，收起时落回来
        val backY by animateDpAsState(if (m.fanOpen) (-151).dp else (-62).dp, spring(.72f, 650f), label = "by")
        AnimatedVisibility(m.back, Modifier.align(Alignment.Center).offset(y = backY), enter = fadeIn() + scaleIn(initialScale = .6f), exit = fadeOut() + scaleOut(targetScale = .6f)) {
            Tap(Modifier.size((DockModel.BACK + 18).dp), label = tr("回到今天"), haptic = false, onClick = { m.goToday() }) { mod ->
                Box(mod.size(DockModel.BACK.dp).glass(CircleShape, t), contentAlignment = Alignment.Center) { BackIcon(t.text.copy(alpha = .7f)) }
            }
        }
        items.forEachIndexed { k, id ->
            val a = remember(id) { Animatable(0f) }
            LaunchedEffect(m.fanOpen) {
                if (m.fanOpen) { delay(k * 35L); a.animateTo(1f, spring(.7f, 700f)) } else a.animateTo(0f, tween(160))   // 要干脆（用户嫌慢）   // 从上往下一个接一个展开
            }
            val v = a.value
            val hs by animateFloatAsState(if (m.hot == id) 1.26f else 1f, spring(.55f, 700f), label = "hot")   // 拖到它上面：变大
            if (v > 0.01f) {
                // 像扇子打开（和网页、iPhone 一样）：从 logo 出发，先朝第一个按钮的方向，一边往外走一边沿圆弧转到自己的位置【联动:底部悬浮控件】
                val rad = Math.toRadians(angles[0] + (angles[k] - angles[0]) * v)
                Tap(
                    Modifier.align(Alignment.Center)
                        .offset { IntOffset((cos(rad) * r * z * v * density.density).roundToInt(), (-sin(rad) * r * z * v * density.density).roundToInt()) }
                        .size((DockModel.FAN + 12).dp).graphicsLayer { alpha = v.coerceIn(0f, 1f); val s = (.35f + .65f * v) * hs * z; scaleX = s; scaleY = s },
                    label = if (id == "add") tr("添加事件") else if (id == "stat") (if (inStat) tr("返回") else tr("统计")) else if (d.set) tr("返回") else tr("设置"), haptic = false, onClick = { m.fan(id) },
                ) { mod ->
                    val face = if (id == "add") mod.size(DockModel.FAN.dp).clip(CircleShape).background(t.brand)
                    else mod.size(DockModel.FAN.dp).glass(CircleShape, t)
                    Box(face, contentAlignment = Alignment.Center) {
                        if (id == "add") PlusIcon(Color.White) else if (id == "stat") { if (inStat) ChevronIcon(t.text) else StatIcon(t.text) } else if (d.set) ChevronIcon(t.text) else GearIcon(t.text)
                    }
                }
            }
        }
        val rot by animateFloatAsState(if (m.fanOpen) 1f else 0f, spring(.6f, 400f), label = "lg")
        // 按住拖：拖起来就打开扇形、后面虚下去；手指离哪个按钮中心 46dp 以内就是它（变大、冒粒子、轻震）；松手选中它，没在按钮上就收起
        val hotR = with(density) { FAN_HOT.dp.toPx() }
        fun centers(): List<Pair<String, Offset>> = items.mapIndexed { k, id ->
            val rad = Math.toRadians(angles[k]); val px = r * ZOOM * density.density   // 拖着时扇形放大了
            id to Offset(m.logoC.x + (cos(rad) * px).toFloat(), m.logoC.y - (sin(rad) * px).toFloat())
        }
        Tap(Modifier.fillMaxSize()
            .onGloballyPositioned { val p = it.positionInRoot(); m.logoC = Offset(p.x + it.size.width / 2f, p.y + it.size.height / 2f) }
            .pointerInput(items) {
                detectDragGestures(
                    onDragStart = { at -> m.forceOpen(); m.hapticTick(); m.depth(true); m.drag = m.logoC + at - Offset(size.width / 2f, size.height / 2f) },
                    onDrag = { ch, _ ->
                        ch.consume()
                        val f = m.logoC + ch.position - Offset(size.width / 2f, size.height / 2f)
                        m.drag = f
                        val near = centers().map { (id, c) -> Triple(id, c, hypot(c.x - f.x, c.y - f.y)) }.filter { it.third < hotR }.minByOrNull { it.third }
                        if (near?.first != m.hot) {
                            m.hot = near?.first
                            if (near != null) { m.fx.burst(near.second, 18, 2.4f * density.density); m.hapticTick() }
                        }
                    },
                    onDragEnd = {
                        val h = m.hot
                        m.drag = null; m.hot = null; m.depth(false); m.dragEndedAt = System.currentTimeMillis()
                        if (h != null) m.fan(h) else m.setFan(false)
                    },
                    onDragCancel = { m.drag = null; m.hot = null; m.depth(false); m.setFan(false) },
                )
            }, label = if (m.fanOpen) tr("收起") else tr("更多"), haptic = false, onClick = { if (System.currentTimeMillis() - m.dragEndedAt > 350) m.setFan(!m.fanOpen) }) { mod ->
            Box(mod.size(DockModel.LOGO.dp).glass(CircleShape, t), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.logo), null, Modifier.size(34.dp).graphicsLayer {
                    alpha = 1f - rot; rotationZ = 90f * rot; scaleX = 1f - .5f * rot; scaleY = 1f - .5f * rot
                })
                Canvas(Modifier.size(18.dp).graphicsLayer { alpha = rot * .85f; rotationZ = -90f * (1 - rot); scaleX = .5f + .5f * rot; scaleY = .5f + .5f * rot }) {
                    val w = size.width
                    drawLine(t.text, Offset(w * .15f, w * .15f), Offset(w * .85f, w * .85f), 2.2.dp.toPx(), StrokeCap.Round)
                    drawLine(t.text, Offset(w * .85f, w * .15f), Offset(w * .15f, w * .85f), 2.2.dp.toPx(), StrokeCap.Round)
                }
            }
        }
    }
}

@Composable
private fun PlusIcon(c: Color) = Canvas(Modifier.size(19.dp)) {
    val w = size.width; val st = 2.4.dp.toPx()
    drawLine(c, Offset(w / 2, w * .08f), Offset(w / 2, w * .92f), st, StrokeCap.Round)
    drawLine(c, Offset(w * .08f, w / 2), Offset(w * .92f, w / 2), st, StrokeCap.Round)
}

/** 设置：和网页、iOS 同一个齿轮（网页 #fanSet 里的路径，24 × 24 坐标），按 22dp 缩放后描边 */
private val GEAR_PATH = PathParser().parsePathString("M10.40 5.08L10.75 2.48 L13.25 2.48 L13.60 5.08A7.1 7.1 0 0 1 15.76 5.98L17.84 4.38 L19.62 6.16 L18.02 8.24A7.1 7.1 0 0 1 18.92 10.40L21.52 10.75 L21.52 13.25 L18.92 13.60A7.1 7.1 0 0 1 18.02 15.76L19.62 17.84 L17.84 19.62 L15.76 18.02A7.1 7.1 0 0 1 13.60 18.92L13.25 21.52 L10.75 21.52 L10.40 18.92A7.1 7.1 0 0 1 8.24 18.02L6.16 19.62 L4.38 17.84 L5.98 15.76A7.1 7.1 0 0 1 5.08 13.60L2.48 13.25 L2.48 10.75 L5.08 10.40A7.1 7.1 0 0 1 5.98 8.24L4.38 6.16 L6.16 4.38 L8.24 5.98A7.1 7.1 0 0 1 10.40 5.08Z").toPath()
@Composable
private fun GearIcon(c: Color) = Canvas(Modifier.size(22.dp)) {
    val k = size.width / 24f
    scale(k, k, pivot = Offset.Zero) {
        drawPath(GEAR_PATH, c, style = Stroke(1.7.dp.toPx() / k, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        drawCircle(c, 3f, Offset(12f, 12f), style = Stroke(1.7.dp.toPx() / k))
    }
}

/** 记录日历的「统计」：三根高低不一的竖条 */
@Composable
private fun StatIcon(c: Color) = Canvas(Modifier.size(20.dp)) {
    val w = size.width; val st = 2.2.dp.toPx()
    drawLine(c, Offset(w * .21f, w * .83f), Offset(w * .21f, w * .46f), st, StrokeCap.Round)
    drawLine(c, Offset(w * .5f, w * .83f), Offset(w * .5f, w * .17f), st, StrokeCap.Round)
    drawLine(c, Offset(w * .79f, w * .83f), Offset(w * .79f, w * .58f), st, StrokeCap.Round)
}

/** 设置页里的「返回」：往左的尖角 */
@Composable
private fun ChevronIcon(c: Color) = Canvas(Modifier.size(20.dp)) {
    val w = size.width; val st = 2.4.dp.toPx()
    drawLine(c, Offset(w * .62f, w * .2f), Offset(w * .32f, w * .5f), st, StrokeCap.Round)
    drawLine(c, Offset(w * .32f, w * .5f), Offset(w * .62f, w * .8f), st, StrokeCap.Round)
}

/** 回到今天：一个往回的箭头（和 iOS 的 arrow.uturn.backward 一样意思） */
@Composable
private fun BackIcon(c: Color) = Canvas(Modifier.size(19.dp)) {
    val w = size.width; val st = 2.dp.toPx()
    val p = androidx.compose.ui.graphics.Path().apply {
        moveTo(w * .78f, w * .82f); lineTo(w * .78f, w * .55f)
        cubicTo(w * .78f, w * .38f, w * .66f, w * .3f, w * .5f, w * .3f); lineTo(w * .2f, w * .3f)
    }
    drawPath(p, c, style = Stroke(st, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
    drawLine(c, Offset(w * .2f, w * .3f), Offset(w * .38f, w * .12f), st, StrokeCap.Round)
    drawLine(c, Offset(w * .2f, w * .3f), Offset(w * .38f, w * .48f), st, StrokeCap.Round)
}

/** 原生悬浮控件的文字：原文是简体中文，按同步数据里的语言翻译（I18n.java） */
fun tr(s: String): String = I18n.t(s)


/** 按住 logo 拖动时的粒子：从按钮中心往外散开、越来越慢、淡掉（和网页 burst 一样）【联动:底部悬浮控件】 */
class FanFX {
    class P(val x: Float, val y: Float, val vx: Float, val vy: Float, val r: Float, val t: Long, val life: Float, val c: Int)
    val ps = ArrayList<P>()
    fun burst(at: Offset, n: Int, speed: Float) {
        val now = System.nanoTime()
        repeat(n) {
            val a = Math.random() * Math.PI * 2; val v = speed * (0.5f + Math.random().toFloat() * 1.5f)
            ps.add(P(at.x, at.y, (cos(a) * v).toFloat(), (sin(a) * v).toFloat(), (1.4f + Math.random().toFloat() * 2.4f), now, 0.38f + Math.random().toFloat() * 0.42f, (Math.random() * 3).toInt()))
        }
        while (ps.size > 220) ps.removeAt(0)
    }
    companion object { val COLS = listOf(Color(0xFF9E9AC8), Color(0xFFC7B3CF), Color(0xFFEBC7A6)) }   // Cadence logo 的雾紫 → 丁香 → 暖沙
}

/** 按住 logo 拖动：扇形放大多少；水滴的尺寸（和网页 DROP、GlassNav.swift 的 FanDropSize 一样）【联动:底部悬浮控件】 */
private const val ZOOM = 1.12f
private const val DROP_TIP = 12f; private const val DROP_TIP_HOT = 15f
/** 离 logo 中心多远断开成独立的一滴（出了扇形这一块）；手指离按钮中心多近算拖到上面（放宽，手小也点得准） */
private const val DROP_SNAP = 150f; const val FAN_HOT = 58f

/** 像水的表面张力：刚拉出来时颈很粗、根部张得开，越拉越细（不会细成一根线），拉到 snap 就断开（和网页 dropGeom 一样）；null = 还在 logo 里，FloatArray(0) = 已断开，否则 [w, a1, a2] */
private fun dropGeom(d: Float, r1: Float, r2: Float, snap: Float): FloatArray? {
    if (d <= r1 + r2 * .2f) return null
    if (d >= snap) return FloatArray(0)
    val t = ((d - r1 - r2 * .2f) / (snap - r1 - r2 * .2f)).coerceIn(0f, 1f); val e = Math.pow(t.toDouble(), 1.3).toFloat()
    return floatArrayOf(r2 * (.92f - .5f * e), 1.05f - .5f * t, Math.PI.toFloat() - (1.3f - .35f * t))
}

/** 两个圆连成一滴水：根 (c1, r1)，水滴 (c2, r2)，颈半宽 w；两边各两段二次曲线，在颈的正中相切（和网页 dropPath 同一个算法） */
private fun dropPath(c1: Offset, r1: Float, c2: Offset, r2: Float, w: Float, a1: Float, a2: Float): Path {
    val dx = c2.x - c1.x; val dy = c2.y - c1.y; val d = maxOf(1f, hypot(dx, dy)); val u = kotlin.math.atan2(dy, dx)
    val ux = dx / d; val uy = dy / d; val nx = -uy; val ny = ux
    val s1 = (r1 + d / 2) / 2; val s2 = d - (r2 + d / 2) / 2
    fun at(s: Float, k: Float) = Offset(c1.x + ux * s + nx * w * k, c1.y + uy * s + ny * w * k)
    fun on(c: Offset, r: Float, a: Float) = Offset(c.x + cos(a) * r, c.y + sin(a) * r)
    fun deg(a: Float) = Math.toDegrees(a.toDouble()).toFloat()
    return Path().apply {
        val p0 = on(c1, r1, u + a1); moveTo(p0.x, p0.y)
        at(s1, 1f).let { q -> at(d / 2, 1f).let { e -> quadraticTo(q.x, q.y, e.x, e.y) } }
        at(s2, 1f).let { q -> on(c2, r2, u + a2).let { e -> quadraticTo(q.x, q.y, e.x, e.y) } }
        arcTo(androidx.compose.ui.geometry.Rect(c2, r2), deg(u + a2), -deg(2 * a2), false)   // 绕过指尖那一头
        at(s2, -1f).let { q -> at(d / 2, -1f).let { e -> quadraticTo(q.x, q.y, e.x, e.y) } }
        at(s1, -1f).let { q -> on(c1, r1, u - a1).let { e -> quadraticTo(q.x, q.y, e.x, e.y) } }
        arcTo(androidx.compose.ui.geometry.Rect(c1, r1), deg(u - a1), -deg(2 * Math.PI.toFloat() - 2 * a1), false)   // 绕过 logo 那一头
        close()
    }
}

/** logo 外面那圈透明玻璃被手指拉过去：根就是 logo 的玻璃圆，一条细颈连着手指下面的一小滴玻璃（图标不动），水滴被按钮吸过去一点；停在按钮上时一直冒一点粒子 */
@Composable
private fun FanTrail(m: DockModel) {
    val frame = remember { mutableLongStateOf(0L) }
    val active = m.drag != null
    LaunchedEffect(active) {
        var lastEmit = 0L
        while (m.drag != null || m.fx.ps.isNotEmpty()) {
            withFrameNanos { now ->
                frame.longValue = now
                val h = m.hot
                if (m.drag != null && h != null && now - lastEmit > 80_000_000L) {
                    lastEmit = now
                    m.fx.burst(hotCenter(m, h), 2, 0.9f * android.content.res.Resources.getSystem().displayMetrics.density)   // 停在按钮上：一直冒一点
                }
            }
        }
    }
    val dark = T.dark
    Canvas(Modifier.fillMaxSize()) {
        frame.longValue   // 每一帧重画
        val o = m.origin
        val now = System.nanoTime()
        val f = m.drag
        if (f != null) {
            val l = m.logoC - o
            var t = f - o
            m.hot?.let { h -> val c = hotCenter(m, h) - o; t = Offset(t.x + (c.x - t.x) * .55f, t.y + (c.y - t.y) * .55f) }
            val r1 = (DockModel.LOGO / 2f).dp.toPx(); val r2 = (if (m.hot != null) DROP_TIP_HOT else DROP_TIP).dp.toPx()
            val g = dropGeom(hypot(t.x - l.x, t.y - l.y), r1, r2, DROP_SNAP.dp.toPx())
            if (g != null) {
                val path = if (g.isEmpty()) Path().apply { addOval(androidx.compose.ui.geometry.Rect(t, r2)) }   // 出了扇形这一块：独立的一滴
                           else dropPath(l, r1, t, r2, g[0], g[1], g[2])
                drawPath(path, Color.White.copy(alpha = if (dark) .08f else .22f))   // 透明玻璃：几乎全透
                drawPath(path, Color.White.copy(alpha = if (dark) .26f else .75f), style = Stroke(1.dp.toPx()))   // 玻璃的亮边
                drawOval(Color.White.copy(alpha = if (dark) .22f else .6f), Offset(t.x - r2 * .64f, t.y - r2 * .56f), androidx.compose.ui.geometry.Size(r2 * .64f, r2 * .4f))   // 一点高光
            }
        }
        m.fx.ps.removeAll { (now - it.t) / 1e9f > it.life }
        for (q in m.fx.ps) {
            val e = (now - q.t) / 1e9f; val k = e / q.life; val tau = .36f
            val d = tau * (1 - exp(-e / tau)) * 60f   // 越走越慢（速度按每帧算）
            drawCircle(FanFX.COLS[q.c].copy(alpha = (1 - k) * .9f), q.r.dp.toPx() * (1 - k * .5f), Offset(q.x + q.vx * d, q.y + q.vy * d) - o)
        }
    }
}

/** 扇形按钮展开到位后的中心（屏幕坐标，px）：和 LogoCluster 里的角度、半径一样 */
private fun hotCenter(m: DockModel, id: String): Offset {
    val items = if (m.dock?.st == true) listOf("add", "stat", "set") else listOf("add", "set")
    val k = items.indexOf(id).coerceAtLeast(0)
    val r = if (items.size == 3) 88f else 84f; val angles = if (items.size == 3) listOf(100.0, 145.0, 190.0) else listOf(115.0, 175.0)
    val rad = Math.toRadians(angles[k]); val dens = android.content.res.Resources.getSystem().displayMetrics.density * (if (m.drag != null) ZOOM else 1f)   // 拖着时扇形放大了
    return Offset(m.logoC.x + (cos(rad) * r * dens).toFloat(), m.logoC.y - (sin(rad) * r * dens).toFloat())
}
