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
 * 透明液态玻璃：中间几乎全透，靠高光边和外侧柔和的影子显形（和网页 styles.css 末尾的 .face 一致）。
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
            if (t.dark) listOf(Color(0x1FFFFFFF), Color(0x03FFFFFF), Color(0x08FFFFFF)) else listOf(Color(0xF2FFFFFF), Color(0x52FFFFFF), Color(0x80FFFFFF)),
        ), style = Stroke(2.2.dp.toPx()))
    }
    if (!t.dark) drawOutline(outline, Color(0x14142846), style = Stroke(0.6.dp.toPx()))
}

private fun Path.asAndroidPathCompat(): android.graphics.Path = this.asAndroidPath()

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
