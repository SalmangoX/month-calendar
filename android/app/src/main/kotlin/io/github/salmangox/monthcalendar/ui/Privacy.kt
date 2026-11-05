package io.github.salmangox.monthcalendar

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 第一次打开时的隐私政策（和网页 index.html 的 #pvGate 同样的内容和规则：不同意就不能用）。
 * 同意的时间记在 prefs「privacyAt」，网页过渡页面通过 Bridge.privacyAt 知道已经同意过，不再重复弹出。
 */
@Composable
fun PrivacyGate(onAgree: () -> Unit) {
    val t = T
    val ctx = LocalContext.current
    var tip by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(t.backdrop).pointerInput(Unit) { detectTapGestures { } }, contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(24.dp).widthIn(max = 420.dp).clip(RoundedCornerShape(24.dp)).background(t.surface).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(tr("隐私政策"), color = t.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(tr("开始使用前，请花一分钟了解节律如何处理你的数据："), color = t.text2, fontSize = 15.sp, lineHeight = 22.sp)
            for (s in listOf("不需要注册，不收集你的个人信息", "日程、课程、纪念日全部保存在本机", "相册只在你选择封面、导入课表、保存分享图时使用", "没有广告，没有统计分析 SDK"))
                Text("•  " + tr(s), color = t.text2, fontSize = 15.sp, lineHeight = 22.sp)
            Text(
                tr("隐私政策全文"), color = t.accentText, fontSize = 15.sp, textDecoration = TextDecoration.Underline,
                modifier = Modifier.pointerInput(Unit) { detectTapGestures {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://salmangox.github.io/month-calendar/privacy.html"))) }
                } },
            )
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tap(Modifier.weight(1f).height(52.dp), onClick = { tip = true }) { m ->
                    Box(m.fillMaxSize().clip(RoundedCornerShape(16.dp)).background(t.field), contentAlignment = Alignment.Center) {
                        Text(tr("不同意"), color = t.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Tap(Modifier.weight(1f).height(52.dp), onClick = onAgree) { m ->
                    Box(m.fillMaxSize().clip(RoundedCornerShape(16.dp)).background(t.brand), contentAlignment = Alignment.Center) {
                        Text(tr("同意并继续"), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            if (tip) Text(tr("不同意将无法使用节律。我们不会收集任何数据，日程只存在你这台设备上。"), color = t.text2, fontSize = 13.sp, lineHeight = 19.sp)
        }
    }
}
