package io.github.salmangox.monthcalendar

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 配色：和 styles.css / js/store.js 一致。
 * 优先级按色彩心理：低 = 天蓝、中 = 琥珀、高 = 朱红，无 = 中性灰；深色模式用 OKLCH 算出的深色调（MC.darkTone）。
 */
object Palette {
    val PRI = intArrayOf(0xFFA3A1AD.toInt(), 0xFF5B8FD0.toInt(), 0xFFC98A1E.toInt(), 0xFFD4472C.toInt()) // 无 低（天蓝）中（琥珀）高（朱红）
    const val CAL_DEFAULT = 0xFFB76271.toInt()

    // 品牌：logo 雾紫（左）→ 暖沙（右），加深后用于加号、选中的今天
    const val LOGO_A = 0xFF9F9DBA.toInt()
    const val LOGO_B = 0xFFE6CDB8.toInt()
    const val BRAND_A = 0xFF8E8BB8.toInt()
    const val BRAND_B = 0xFFD8B48F.toInt()
    const val BRAND_A_DARK = 0xFF9794C6.toInt()
    const val BRAND_B_DARK = 0xFFD6B28C.toInt()

    /** 事件颜色：记录日历里没设优先级的事件（开了等级评分的日历一律）用日历颜色 */
    fun evColor(e: Ev, d: CalData): Int {
        val c = d.cal(e.cal)
        return if (c != null && (d.rateOn(e.cal) || e.priority == 0)) c.color else PRI[e.priority.coerceIn(0, 3)]
    }

    private val toneCache = HashMap<Int, IntArray>()

    /** 深色模式的 [底色, 文字色]（和网页 MC.darkTone 同一规则） */
    fun darkTone(color: Int): IntArray = synchronized(toneCache) {
        toneCache.getOrPut(color) {
            val (_, c, h) = toOklch(color)
            if (c < 0.03) intArrayOf(fromOklch(0.36, c * 0.5, h), fromOklch(0.935, c * 0.3, h))
            else {
                val warm = (((1 - abs(h - 75) / 50) * 1.6).coerceIn(0.0, 1.0))
                intArrayOf(fromOklch(0.45 + 0.15 * warm, minOf(c, 0.15), h), fromOklch(0.935, minOf(0.035, c * 0.25), h))
            }
        }
    }

    private fun lin(v: Double) = if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    private fun gam(v: Double) = if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055

    private fun toOklch(argb: Int): Triple<Double, Double, Double> {
        val r = lin(((argb shr 16) and 255) / 255.0); val g = lin(((argb shr 8) and 255) / 255.0); val b = lin((argb and 255) / 255.0)
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
        val A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
        val B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        return Triple(L, hypot(A, B), (Math.toDegrees(atan2(B, A)) + 360) % 360)
    }

    private fun fromOklch(L: Double, C: Double, H: Double): Int {
        var c = C
        while (c >= 0) {
            val A = c * cos(Math.toRadians(H)); val B = c * sin(Math.toRadians(H))
            val l = (L + 0.3963377774 * A + 0.2158037573 * B).pow(3)
            val m = (L - 0.1055613458 * A - 0.0638541728 * B).pow(3)
            val s = (L - 0.0894841775 * A - 1.291485548 * B).pow(3)
            val rgb = doubleArrayOf(
                4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
            )
            if (rgb.all { it >= -1e-4 && it <= 1.0001 }) {
                val q = rgb.map { (gam(it.coerceIn(0.0, 1.0)).coerceIn(0.0, 1.0) * 255).roundToInt() }
                return (0xFF shl 24) or (q[0] shl 16) or (q[1] shl 8) or q[2]
            }
            c -= 0.005
        }
        return 0xFF808080.toInt()
    }
}
