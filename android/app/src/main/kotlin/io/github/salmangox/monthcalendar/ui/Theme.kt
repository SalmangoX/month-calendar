package io.github.salmangox.monthcalendar

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme

/** 颜色变量：和 styles.css 的 :root[data-theme] 一致 */
@Immutable
data class Tokens(
    val dark: Boolean,
    val bg: Color, val bgGrouped: Color, val surface: Color, val line: Color,
    val text: Color, val text2: Color, val text3: Color, val field: Color,
    val accent: Color, val accentText: Color, val selTint: Color,
    val brandA: Color, val brandMid: Color, val brandB: Color,
    val frostStrong: Color, val backdrop: Color, val danger: Color,
) {
    val brand: Brush get() = Brush.linearGradient(listOf(brandA, brandMid, brandB))
    val brandH: Brush get() = Brush.horizontalGradient(listOf(brandA, brandMid, brandB))
}

fun lerp(a: Color, b: Color, t: Float) = Color(
    a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t, a.alpha + (b.alpha - a.alpha) * t,
)

val LightTokens = Tokens(
    dark = false,
    bg = Color(0xFFF8F8FA), bgGrouped = Color(0xFFF1F1F4), surface = Color.White, line = Color(0xFFE1E7EB),
    text = Color(0xFF171B20), text2 = Color(0xFF6E757E), text3 = Color(0xFFC2C8CD), field = Color(0x17767680),
    accent = Color(0xFF4F80C4), accentText = Color(0xFF3C69AE), selTint = Color(0x1F4F80C4),
    brandA = Color(Palette.BRAND_A), brandMid = Color(Palette.BRAND_MID), brandB = Color(Palette.BRAND_B),
    frostStrong = Color(0xF7FAFBFD), backdrop = Color(0x3D101824), danger = Color(0xFFD9453E),
)

val DarkTokens = Tokens(
    dark = true,
    bg = Color(0xFF141416), bgGrouped = Color(0xFF0F0F11), surface = Color(0xFF1F1F22), line = Color(0xFF2A2A2D),
    text = Color(0xFFF5F5F7), text2 = Color(0xFF98989D), text3 = Color(0xFF58585D), field = Color(0x13FFFFFF),
    accent = Color(0xFF8DB0EA), accentText = Color(0xFFBCD2F5), selTint = Color(0x338DB0EA),
    brandA = Color(Palette.BRAND_A_DARK), brandMid = Color(Palette.BRAND_MID_DARK), brandB = Color(Palette.BRAND_B_DARK),
    frostStrong = Color(0xF5202024), backdrop = Color(0x8A030306), danger = Color(0xFFFF6B60),
)

val LocalTokens = staticCompositionLocalOf { LightTokens }
val T: Tokens @Composable get() = LocalTokens.current

/** 数字：等宽数字，和 SF 的 tabular-nums 一样跳动时不晃 */
val Num = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun CadenceTheme(dark: Boolean, content: @Composable () -> Unit) {
    val t = if (dark) DarkTokens else LightTokens
    val scheme = if (dark) darkColorScheme(primary = t.accent, background = t.bg, surface = t.surface, onSurface = t.text, onBackground = t.text)
    else lightColorScheme(primary = t.accent, background = t.bg, surface = t.surface, onSurface = t.text, onBackground = t.text)
    MaterialTheme(
        colorScheme = scheme,
        typography = MaterialTheme.typography.copy(
            bodyLarge = TextStyle(fontSize = 16.sp, color = t.text, letterSpacing = (-0.1).sp),
            titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.4).sp),
        ),
    ) { CompositionLocalProvider(LocalTokens provides t, content = content) }
}
