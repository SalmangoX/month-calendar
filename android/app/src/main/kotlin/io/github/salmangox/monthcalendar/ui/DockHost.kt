package io.github.salmangox.monthcalendar

import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy

/** 把原生悬浮控件（Compose）叠在 WebView 上面；没点到按钮的地方触摸照常落到网页 */
class DockHost(activity: ComponentActivity, root: FrameLayout, private val web: WebView, dark: Boolean) {
    private var darkMode by mutableStateOf(dark)
    val model = DockModel(
        eval = { js -> web.post { web.evaluateJavascript(js, null) } },
        tick = { web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) },
    )

    /** 纪念相机（原生，NativeCam.kt）：开着时整个盖在网页和底栏上面 */
    val cam = CamModel(activity) { js -> web.post { web.evaluateJavascript(js, null) } }

    init {
        val v = ComposeView(activity).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent { CadenceTheme(darkMode) { DockOverlay(model) } }
        }
        root.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val cv = ComposeView(activity).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent { if (cam.open) NativeCamScreen(cam, activity) }
        }
        root.addView(cv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    /** 返回键：相机开着先关相机 */
    fun back(): Boolean { if (cam.open) { cam.close(); return true }; return false }

    /** 网页的深浅色（MCNative.chrome 发来的页面底色）变了 */
    fun setDark(dark: Boolean) { darkMode = dark }
}
