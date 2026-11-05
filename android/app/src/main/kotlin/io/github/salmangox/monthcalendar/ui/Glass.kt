package io.github.salmangox.monthcalendar

import android.graphics.BlurMaskFilter
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * 透明液态玻璃：中间几乎全透，靠高光边、外侧柔和的影子和下面内容的折射显形（和网页 styles.css 末尾的 .face 一致）。
 * 折射：安卓 13 起用 AGSL 着色器，把玻璃下面的日历在靠近边缘的地方往里「弯」一点；安卓 12 只有高光边。
 */
fun Modifier.glass(shape: Shape, t: Tokens, tint: Color = Color.Transparent): Modifier = drawWithContent {
    val outline = shape.createOutline(size, layoutDirection, this)
    val path = Path().apply {
        when (outline) {
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Rounded -> addRoundRect(outline.roundRect)
            is Outline.Generic -> addPath(outline.path)
        }
    }
    // 外侧的影子（只画在玻璃外面，中间保持透明）
    drawIntoCanvas { c ->
        val nc = c.nativeCanvas
        nc.save()
        nc.clipOutPath(path.asAndroidPathCompat())
        val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = (if (t.dark) Color(0x80000000) else Color(0x29142038)).toArgb()
            maskFilter = BlurMaskFilter(14.dp.toPx(), BlurMaskFilter.Blur.NORMAL)
        }
        nc.translate(0f, 5.dp.toPx())
        nc.drawPath(path.asAndroidPathCompat(), p)
        nc.restore()
    }
    // 玻璃本体：极淡的竖向光泽
    drawOutline(outline, Brush.verticalGradient(
        if (t.dark) listOf(Color(0x14FFFFFF), Color(0x05FFFFFF), Color(0x0DFFFFFF)) else listOf(Color(0x1CFFFFFF), Color(0x05FFFFFF), Color(0x10FFFFFF)),
    ))
    if (tint != Color.Transparent) drawOutline(outline, tint)
    drawContent()
    // 高光边：上沿亮、下沿淡；外面一圈极细的暗边，压在浅色内容上也看得出轮廓
    clipPath(path) {
        drawOutline(outline, Brush.verticalGradient(
            if (t.dark) listOf(Color(0x3DFFFFFF), Color(0x0AFFFFFF), Color(0x14FFFFFF)) else listOf(Color(0xF2FFFFFF), Color(0x52FFFFFF), Color(0x80FFFFFF)),
        ), style = Stroke(2.2.dp.toPx()))
    }
    drawOutline(outline, if (t.dark) Color(0x14FFFFFF) else Color(0x14142846), style = Stroke(0.6.dp.toPx()))
}

private fun Path.asAndroidPathCompat(): android.graphics.Path = this.asAndroidPath()

/** 记下各块玻璃在屏幕上的位置，给折射着色器用 */
@Stable
class LensField {
    val rects = mutableStateMapOf<String, Pair<Rect, Float>>()
}

fun Modifier.lens(field: LensField?, key: String, radiusPx: Float, enabled: Boolean = true): Modifier =
    if (field == null) this else onGloballyPositioned { lc ->
        if (!enabled) { field.rects.remove(key); return@onGloballyPositioned }
        val p = lc.positionInRoot()
        val r = Rect(p.x, p.y, p.x + lc.size.width, p.y + lc.size.height)
        if (field.rects[key]?.first != r) field.rects[key] = r to radiusPx
    }

private const val LENS_SKSL = """
uniform shader content;
uniform float4 rects[8];
uniform float radii[8];
uniform float count;
uniform float strength;
half4 main(float2 p) {
    float2 q = p;
    float inside = 0.0;
    for (int i = 0; i < 8; i++) {
        if (float(i) < count) {
            float4 r = rects[i];
            float2 c = r.xy + r.zw * 0.5;
            float rad = min(radii[i], min(r.z, r.w) * 0.5);
            float2 h = r.zw * 0.5 - float2(rad);
            float2 d = abs(p - c) - h;
            float sd = length(max(d, float2(0.0))) + min(max(d.x, d.y), 0.0) - rad;
            if (sd < 0.0) {
                float2 s = float2(p.x >= c.x ? 1.0 : -1.0, p.y >= c.y ? 1.0 : -1.0);
                float2 n;
                if (d.x > 0.0 || d.y > 0.0) n = normalize(max(d, float2(0.0001))) * s;
                else n = d.x > d.y ? float2(s.x, 0.0) : float2(0.0, s.y);
                float band = max(7.0, rad * 0.62);
                float e = clamp(1.0 + sd / band, 0.0, 1.0);
                q = p - n * (e * e * e) * strength;
                inside = 1.0;
            }
        }
    }
    half4 col = content.eval(q);
    if (inside > 0.5) {
        half l = dot(col.rgb, half3(0.299, 0.587, 0.114));
        col.rgb = clamp(mix(half3(l), col.rgb, 1.22) * 1.03, 0.0, col.a);
    }
    return col;
}
"""

/** 给玻璃下面的内容（日历）加上折射；安卓 12 不支持着色器，原样显示 */
fun Modifier.refract(field: LensField, strengthPx: Float): Modifier =
    if (Build.VERSION.SDK_INT < 33) this else composed {
        val shader = remember { RuntimeShader(LENS_SKSL) }
        graphicsLayer {
            val list = field.rects.values.take(8)
            if (list.isEmpty()) { renderEffect = null; return@graphicsLayer }
            val rs = FloatArray(32); val rad = FloatArray(8)
            list.forEachIndexed { i, (r, k) -> rs[i * 4] = r.left; rs[i * 4 + 1] = r.top; rs[i * 4 + 2] = r.width; rs[i * 4 + 3] = r.height; rad[i] = k }
            shader.setFloatUniform("rects", rs)
            shader.setFloatUniform("radii", rad)
            shader.setFloatUniform("count", list.size.toFloat())
            shader.setFloatUniform("strength", strengthPx)
            renderEffect = RenderEffect.createRuntimeShaderEffect(shader, "content").asComposeRenderEffect()
        }
    }

/**
 * 按压反馈：按下快速缩到 0.9，松手弹簧回弹；点击区域就是这个 Box（比看到的圆面大一圈）。
 */
@Composable
fun Tap(
    modifier: Modifier = Modifier,
    label: String? = null,
    haptic: Boolean = true,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
    content: @Composable (Modifier) -> Unit,
) {
    val scale = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    val hf = LocalHapticFeedback.current
    Box(
        modifier
            .semantics { role = Role.Button; if (label != null) contentDescription = label; onClick { onClick(); true } }
            .pointerInput(onClick, onLongClick) {
                detectTapGestures(
                    onPress = {
                        scope.launch { scale.animateTo(0.9f, tween(140)) }
                        tryAwaitRelease()
                        scope.launch { scale.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMediumLow)) }
                    },
                    onLongPress = onLongClick?.let { l -> { if (haptic) hf.performHapticFeedback(HapticFeedbackType.LongPress); l() } },
                    onTap = { if (haptic) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove); onClick() },
                )
            },
        contentAlignment = Alignment.Center,
    ) { content(Modifier.graphicsLayer { scaleX = scale.value; scaleY = scale.value }) }
}
