package io.github.salmangox.monthcalendar

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * 原生主界面：主日历（月视图）、今日页、新建 / 编辑事件、底部悬浮控件。
 * 还没做成原生的页面（设置、日程、纪念日历、日历列表）用 WebActivity 打开网页版过渡。
 */
class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_HASH = "hash"
    }

    private var theme by mutableStateOf("auto")
    private var weekStart by mutableIntStateOf(0)
    private var privacyOk by mutableStateOf(false)

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        Repo.init(this)
        Engine.ensureChannels(this)
        SyncJob.ensure(this)
        readPrefs()
        privacyOk = Store.prefs(this).getLong("privacyAt", 0L) > 0L
        applyBars()
        setContent {
            CadenceTheme(isDark()) {
                CadenceApp(weekStart, onExit = { moveTaskToBack(true) })
                if (!privacyOk) PrivacyGate {
                    Store.prefs(this).edit().putLong("privacyAt", System.currentTimeMillis()).apply()
                    privacyOk = true
                }
            }
        }
        route(intent)
    }

    private fun readPrefs() {
        val p = Store.prefs(this)
        theme = p.getString("theme", "auto") ?: "auto"
        weekStart = p.getInt("weekStart", 0).coerceIn(0, 6)
    }

    private fun isDark() = when (theme) {
        "dark" -> true
        "light" -> false
        else -> (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    private fun applyBars() {
        val style = if (isDark()) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(style, style)
        window.isNavigationBarContrastEnforced = false
    }

    /** 从通知、小组件打开：#today 打开今日页；日程、纪念日历先打开网页版 */
    private fun route(i: Intent?) {
        val h = i?.getStringExtra(EXTRA_HASH) ?: return
        i.removeExtra(EXTRA_HASH)
        when {
            h == "#today" || h == "#cal" -> AppBus.hash.value = h
            h == "#sched" || h == "#set" || h == "#drawer" || h.matches(Regex("#days(-[A-Za-z0-9]{1,40})?")) -> openWeb(this, h)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        route(intent)
    }

    override fun onResume() {
        super.onResume()
        // 设置页（网页）可能改了深浅色、每周第一天
        val before = theme to weekStart
        readPrefs()
        if (before != (theme to weekStart)) applyBars()
        Engine.refreshAsync(this)
        SyncEngine.now(this) // 回到前台：拉一次其他设备的改动
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyBars()
    }
}
