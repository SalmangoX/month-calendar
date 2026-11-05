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
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val cx = 2f + (maxWidth.value - 4f) / 7f
        // 扇形打开时：右下角一层很淡的暗角接住点击，不会点穿到日历
        AnimatedVisibility(m.fanOpen && !m.cover, enter = fadeIn(), exit = fadeOut()) {
            Box(
                Modifier.fillMaxSize()
                    .drawBehind {
                        drawRect(Brush.radialGradient(
                            listOf(Color.Black.copy(alpha = if (t.dark) .45f else .14f), Color.Black.copy(alpha = if (t.dark) .15f else .03f), Color.Transparent),
                            center = Offset(size.width, size.height), radius = 420.dp.toPx(),
                        ))
                    }
                    .pointerInput(Unit) { detectTapGestures { m.setFan(false) } },
            )
        }
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
            if (v > 0.01f) {
                // 像扇子打开（和网页、iPhone 一样）：从 logo 出发，先朝第一个按钮的方向，一边往外走一边沿圆弧转到自己的位置【联动:底部悬浮控件】
                val rad = Math.toRadians(angles[0] + (angles[k] - angles[0]) * v)
                Tap(
                    Modifier.align(Alignment.Center)
                        .offset { IntOffset((cos(rad) * r * v * density.density).roundToInt(), (-sin(rad) * r * v * density.density).roundToInt()) }
                        .size((DockModel.FAN + 12).dp).graphicsLayer { alpha = v.coerceIn(0f, 1f); val s = .35f + .65f * v; scaleX = s; scaleY = s },
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
        Tap(Modifier.fillMaxSize(), label = if (m.fanOpen) tr("收起") else tr("更多"), haptic = false, onClick = { m.setFan(!m.fanOpen) }) { mod ->
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
