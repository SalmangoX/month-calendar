package io.github.salmangox.monthcalendar

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit

/** 新建 / 编辑事件的状态（和网页 editor.js 的 draft 一样的字段） */
@Stable
class EditorState {
    var open by mutableStateOf(false)
    var editing by mutableStateOf<Ev?>(null)
    var fromDraft by mutableStateOf(false)
    var title by mutableStateOf(""); var note by mutableStateOf("")
    var priority by mutableStateOf(0); var rate by mutableStateOf(0)
    var date by mutableStateOf(LocalDate.now()); var days by mutableStateOf(1)
    var time by mutableStateOf(""); var endTime by mutableStateOf("")
    var remind by mutableStateOf<Int?>(null)
    var repeat by mutableStateOf("none"); var until by mutableStateOf<LocalDate?>(null)
    var done by mutableStateOf(false)
    var closing = false

    fun fields() = Repo.Fields(title.trim(), note.trim(), priority, date, if (time.isEmpty()) days else 1, time, if (time.isEmpty()) "" else endTime, remind, done, rate)

    private fun reset(d: LocalDate) {
        title = ""; note = ""; priority = 0; rate = 0; date = d; days = 1; time = ""; endTime = ""; remind = null; repeat = "none"; until = null; done = false
    }

    fun openNew(c: Context, d: LocalDate, pinDate: Boolean) {
        editing = null; reset(d); fromDraft = false; closing = false
        // 没点「添加」就关掉时存的草稿：接着写
        Store.prefs(c).getString("draft", "")?.takeIf { it.isNotEmpty() }?.let { s ->
            runCatching {
                val o = JSONObject(s)
                title = o.optString("title"); note = o.optString("note"); priority = o.optInt("priority")
                date = if (pinDate) d else LocalDate.parse(o.optString("date", d.toString()))
                days = o.optInt("days", 1); time = o.optString("time"); endTime = o.optString("endTime")
                remind = if (o.isNull("remind") || !o.has("remind")) null else o.optInt("remind")
                repeat = o.optString("repeat", "none"); until = o.optString("until").takeIf { it.isNotEmpty() }?.let { LocalDate.parse(it) }
                fromDraft = true
            }
        }
        open = true
    }

    fun openEdit(e: Ev) {
        editing = e; fromDraft = false; closing = false
        title = e.title; note = e.note; priority = e.priority; rate = e.rate; date = e.date; days = e.days
        time = e.time; endTime = e.endTime; remind = e.remind; repeat = "none"; until = null; done = e.done
        open = true
    }

    fun saveDraft(c: Context) {
        val o = JSONObject().put("title", title).put("note", note).put("priority", priority).put("date", date.toString()).put("days", days)
            .put("time", time).put("endTime", endTime).put("remind", remind ?: JSONObject.NULL).put("repeat", repeat).put("until", until?.toString() ?: "")
        Store.prefs(c).edit().putString("draft", o.toString()).apply()
    }

    fun clearDraft(c: Context) { Store.prefs(c).edit().remove("draft").apply() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorSheet(st: EditorState, data: CalData, toaster: Toaster) {
    if (!st.open) return
    val t = T
    val ctx = LocalContext.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    val editing = st.editing
    val rated = editing != null && data.rateOn(editing.cal)

    /** 关掉：新建的内容存为草稿，编辑的修改直接保存（和网页 onComposerClosed 一样） */
    fun onDismiss(save: Boolean) {
        if (!st.open) return
        st.open = false
        if (!save) return
        val title = st.title.trim()
        if (editing == null) {
            if (title.isNotEmpty() || st.note.isNotBlank()) { st.saveDraft(ctx); toaster.show(tr("已存为草稿，下次点 ＋ 接着写")) } else st.clearDraft(ctx)
            return
        }
        val f = st.fields()
        val changed = f.title != editing.title || f.note != editing.note || f.priority != editing.priority || f.date != editing.date ||
            f.days != editing.days || f.time != editing.time || f.endTime != editing.endTime || f.remind != editing.remind || f.done != editing.done || f.rate != editing.rate
        if (!changed) return
        if (title.isEmpty()) { toaster.show(tr("名称为空，修改没有保存")); return }
        Repo.update(editing.id, f)
        toaster.show(tr("修改已自动保存"))
    }

    fun close(save: Boolean) { scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss(save) } }

    fun submit() {
        val f = st.fields()
        if (f.title.isEmpty()) { toaster.show(tr("请先填写名称")); return }
        if (editing != null) {
            Repo.update(editing.id, f); toaster.show(tr("已保存"))
        } else {
            val n = Repo.add(f, st.repeat, if (st.repeat == "none") null else st.until)
            st.clearDraft(ctx)
            toaster.show(
                if (st.repeat != "none") (if (st.until == null) tr("已添加，{0}重复", Fmt.repeatLabel(st.repeat)) else tr("已添加 {0} 个重复事件", n))
                else if (Dates.dayDiff(f.date) == 0L) tr("已添加到今天") else tr("已添加到 {0}", Fmt.md(f.date)),
            )
        }
        close(false)
    }

    fun delete() {
        val e = editing ?: return
        val later = if (e.series.isNotEmpty()) data.events.filter { it.series == e.series && !it.date.isBefore(e.date) } else emptyList()
        fun go(all: Boolean) {
            close(false)
            val ids = if (all) later.map { it.id } else listOf(e.id)
            Repo.delete(ids, stopSeries = if (all) e.series else "") { removed ->
                toaster.show(if (all) tr("已删除 {0} 个事件", removed.size) else tr("已删除「{0}」", e.title), tr("撤销") to { Repo.restore(removed) })
            }
        }
        if (later.size > 1) deleteMenu = { all -> go(all) } else go(false)
    }

    ModalBottomSheet(
        onDismissRequest = { onDismiss(true) },
        sheetState = sheet,
        containerColor = t.bgGrouped.let { if (t.dark) Color(0xFF161618) else it },
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { Box(Modifier.padding(top = 8.dp, bottom = 4.dp).size(38.dp, 5.dp).clip(CircleShape).background(t.text3)) },
        scrimColor = t.backdrop,
    ) {
        Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 18.dp)) {
            // 抬头：左「清空」（草稿时）· 标题 · 右「添加 / 保存」
            Row(Modifier.fillMaxWidth().height(52.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(84.dp)) {
                    if (st.fromDraft && editing == null) Tap(Modifier.height(44.dp), onClick = {
                        st.clearDraft(ctx); st.fromDraft = false; st.openNew(ctx, st.date, true); st.clearDraft(ctx)
                    }) { m -> Text(tr("清空"), m.padding(horizontal = 6.dp), color = t.text2, fontSize = 15.sp) }
                }
                Text(
                    if (editing != null) tr("编辑事件") else if (st.fromDraft) tr("草稿") else tr("新建事件"),
                    Modifier.weight(1f), color = t.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                )
                Box(Modifier.width(84.dp), contentAlignment = Alignment.CenterEnd) {
                    val ok = st.title.isNotBlank()
                    Tap(Modifier.height(48.dp), label = if (editing != null) tr("保存") else tr("添加"), onClick = { submit() }) { m ->
                        Box(m.alpha(if (ok) 1f else .45f).clip(RoundedCornerShape(18.dp)).background(t.brand).padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text(if (editing != null) tr("保存") else tr("添加"), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            // 名称、备注
            Card {
                Field(st.title, { st.title = it.replace("\n", "") }, tr("准备做什么？"), 19.sp, FontWeight.Medium, single = true, onDone = { submit() })
                Hairline(16)
                Field(st.note, { st.note = it }, tr("备注"), 15.sp, FontWeight.Normal)
            }
            Spacer(Modifier.height(12.dp))
            DateChips(st)
            Spacer(Modifier.height(12.dp))
            Card {
                TimeRows(st, ctx)
                Hairline(16)
                MenuRow(tr("提醒"), Fmt.remindLabel(ctx, st.remind, st.time.isNotEmpty()), Fmt.remindOptions(ctx, st.time.isNotEmpty()).map { it.second to { st.remind = it.first } })
                if (editing == null) {
                    Hairline(16)
                    MenuRow(tr("重复"), Fmt.repeatLabel(st.repeat), Fmt.repeatLabels.map { (v, l) -> tr(l) to { st.repeat = v; st.until = null } })
                    if (st.repeat != "none") {
                        Hairline(16)
                        var pick by remember { mutableStateOf(false) }
                        MenuRow(tr("结束重复"), st.until?.let { Fmt.md(it) } ?: tr("一直重复"), listOf(
                            tr("一直重复") to { st.until = null; pick = false },
                            tr("选择日期…") to { st.until = Dates.defaultUntil(st.date, st.repeat); pick = true },
                        ))
                        AnimatedVisibility(pick && st.until != null) { DateWheel(st.until ?: st.date) { st.until = it } }
                    }
                }
            }
            Spacer(Modifier.height(18.dp))
            Text(if (rated) tr("等级") else tr("优先级"), color = t.text2, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
            if (rated) PriorityBar(st.rate, { st.rate = it }, listOf(tr("无")) + data.cal(editing!!.cal)!!.rateLabels)
            else PriorityBar(st.priority, { st.priority = it })
            if (editing != null) {
                Spacer(Modifier.height(18.dp))
                Card {
                    Row(Modifier.fillMaxWidth().height(50.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("已完成"), color = t.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
                        Toggle(st.done) { st.done = it }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Card {
                    Box {
                        Tap(Modifier.fillMaxWidth().height(50.dp), onClick = { delete() }) { m ->
                            Text(tr("删除事件"), m, color = t.danger, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                        }
                        val dm = deleteMenu
                        DropdownMenu(dm != null, onDismissRequest = { deleteMenu = null }, shape = RoundedCornerShape(14.dp), containerColor = t.frostStrong) {
                            val n = editing.let { e -> data.events.count { it.series == e.series && e.series.isNotEmpty() && !it.date.isBefore(e.date) } }
                            DropdownMenuItem({ Text(tr("仅删除这一个"), color = t.text) }, onClick = { deleteMenu = null; dm?.invoke(false) })
                            DropdownMenuItem({ Text(tr("删除这个及之后的重复（{0} 个）", n), color = t.danger) }, onClick = { deleteMenu = null; dm?.invoke(true) })
                        }
                    }
                }
            }
        }
    }
}

private var deleteMenu by mutableStateOf<((Boolean) -> Unit)?>(null)

@Composable
private fun Field(v: String, on: (String) -> Unit, hint: String, size: androidx.compose.ui.unit.TextUnit, weight: FontWeight, single: Boolean = false, onDone: (() -> Unit)? = null) {
    val t = T
    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp)) {
        if (v.isEmpty()) Text(hint, color = t.text3, fontSize = size, fontWeight = weight)
        BasicTextField(
            v, on, Modifier.fillMaxWidth(), singleLine = single, maxLines = if (single) 1 else 6,
            textStyle = TextStyle(color = t.text, fontSize = size, fontWeight = weight), cursorBrush = SolidColor(t.accent),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = if (single) androidx.compose.ui.text.input.ImeAction.Done else androidx.compose.ui.text.input.ImeAction.Default),
            keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { onDone?.invoke() }),
        )
    }
}

/** 快捷日期：今天 / 明天 / 后天 / 下周一，「其他日期」展开滚轮 */
@Composable
private fun DateChips(st: EditorState) {
    val t = T
    val today = LocalDate.now()
    val quick = linkedMapOf(today to tr("今天"), today.plusDays(1) to tr("明天"), today.plusDays(2) to tr("后天"))
    val mon = today.plusDays(((8 - today.dayOfWeek.value) % 7).toLong().let { if (it == 0L) 7L else it })
    if (!quick.containsKey(mon)) quick[mon] = tr("下周一")
    var other by remember { mutableStateOf(false) }
    val custom = !quick.containsKey(st.date)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((d, l) in quick) DChip(l, "${d.monthValue}/${d.dayOfMonth}", d == st.date && !other) { st.date = d; other = false }
        DChip(if (custom) Fmt.md(st.date) else tr("其他日期"), if (custom) Fmt.wk(st.date) else "", other || custom) { other = !other }
    }
    AnimatedVisibility(other, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
        Box(Modifier.padding(top = 10.dp)) { Card { DateWheel(st.date) { st.date = it } } }
    }
}

@Composable
private fun DChip(label: String, sub: String, on: Boolean, onClick: () -> Unit) {
    val t = T
    Tap(Modifier.height(54.dp), onClick = onClick) { m ->
        Column(
            m.clip(RoundedCornerShape(14.dp)).background(if (on) t.accent.copy(alpha = if (t.dark) .28f else .14f) else if (t.dark) Color(0xFF1C1C1F) else Color.White)
                .padding(horizontal = 14.dp, vertical = 6.dp).widthIn(min = 44.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(label, color = if (on) t.accentText else t.text, fontSize = 14.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium, maxLines = 1)
            if (sub.isNotEmpty()) Text(sub, color = if (on) t.accentText.copy(alpha = .8f) else t.text2, fontSize = 11.sp, style = Num, maxLines = 1)
        }
    }
}

@Composable
fun DateWheel(value: LocalDate, onPick: (LocalDate) -> Unit) {
    val today = LocalDate.now()
    val start = today.minusDays(730)
    val count = 730 + 1830
    val idx = ChronoUnit.DAYS.between(start, value).toInt().coerceIn(0, count - 1)
    Wheel(count, idx, { i -> val d = start.plusDays(i.toLong()); (if (d.year != today.year) "${d.year} · " else "") + Fmt.mdw(d) },
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) { onPick(start.plusDays(it.toLong())) }
}

/** 时间：全天（可跨几天）或时间段（开始、结束各一组滚轮） */
@Composable
private fun TimeRows(st: EditorState, ctx: Context) {
    val t = T
    var edit by remember { mutableStateOf("") } // "start" / "end" / ""
    Row(Modifier.fillMaxWidth().height(52.dp).padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(tr("时间"), color = t.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
        Segmented(listOf(tr("全天"), tr("时间段")), if (st.time.isEmpty()) 0 else 1) { i ->
            if (i == 0) { st.time = ""; st.endTime = ""; edit = "" }
            else if (st.time.isEmpty()) {
                val h = (LocalTime.now().hour + 1) % 24
                st.time = "%02d:00".format(h); st.endTime = if (h >= 23) "23:55" else "%02d:00".format(h + 1); st.days = 1; edit = "start"
            }
        }
    }
    if (st.time.isEmpty()) {
        Hairline(16)
        Row(Modifier.fillMaxWidth().height(52.dp).padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(tr("持续"), color = t.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
            Tap(Modifier.size(44.dp), label = "−", onClick = { if (st.days > 1) st.days-- }) { m -> Text("−", m, color = if (st.days > 1) t.accentText else t.text3, fontSize = 22.sp) }
            Text(tr("{0} 天", st.days), color = t.text, fontSize = 15.sp, style = Num, modifier = Modifier.widthIn(min = 44.dp), textAlign = TextAlign.Center)
            Tap(Modifier.size(44.dp), label = "+", onClick = { if (st.days < 60) st.days++ }) { m -> Text("+", m, color = t.accentText, fontSize = 22.sp) }
        }
    } else {
        Hairline(16)
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TimePill(tr("开始"), Fmt.time(ctx, st.time), edit == "start", Modifier.weight(1f)) { edit = if (edit == "start") "" else "start" }
            TimePill(tr("结束"), if (st.endTime.isEmpty()) "—" else Fmt.time(ctx, st.endTime), edit == "end", Modifier.weight(1f)) { edit = if (edit == "end") "" else "end" }
        }
        AnimatedVisibility(edit.isNotEmpty(), enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            val cur = if (edit == "end") st.endTime.ifEmpty { st.time } else st.time
            val h0 = cur.substring(0, 2).toInt(); val m0 = cur.substring(3, 5).toInt() / 5
            androidx.compose.runtime.key(edit) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 40.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    fun setHM(h: Int?, m: Int?) {
                        val c = if (edit == "end") st.endTime.ifEmpty { st.time } else st.time
                        val nh = h ?: c.substring(0, 2).toInt(); val nm = m ?: c.substring(3, 5).toInt()
                        val v = "%02d:%02d".format(nh, nm)
                        if (edit == "end") st.endTime = v
                        else {
                            // 改开始时间：结束时间跟着平移，时长不变
                            if (st.endTime.isNotEmpty()) { val dur = Dates.minutes(st.endTime) - Dates.minutes(st.time); st.endTime = Dates.hm(Dates.minutes(v) + dur) }
                            st.time = v
                        }
                    }
                    Wheel(24, h0, { "%02d".format(it) }, Modifier.weight(1f), wrap = true) { setHM(it, null) }
                    Wheel(12, m0, { "%02d".format(it * 5) }, Modifier.weight(1f), wrap = true) { setHM(null, it * 5) }
                }
            }
        }
    }
}

@Composable
private fun TimePill(label: String, value: String, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val t = T
    Tap(modifier.height(56.dp), onClick = onClick) { m ->
        Column(m.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) t.accent.copy(alpha = if (t.dark) .26f else .12f) else t.field).padding(vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = t.text2, fontSize = 11.sp)
            Text(value, color = if (on) t.accentText else t.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, style = Num)
        }
    }
}

@Composable
fun Segmented(items: List<String>, sel: Int, onPick: (Int) -> Unit) {
    val t = T
    Row(Modifier.clip(RoundedCornerShape(10.dp)).background(t.field).padding(2.dp)) {
        items.forEachIndexed { i, s ->
            Tap(Modifier.height(40.dp), onClick = { onPick(i) }) { m ->
                Box(m.clip(RoundedCornerShape(8.dp)).background(if (i == sel) (if (t.dark) Color(0xFF636366) else Color.White) else Color.Transparent).padding(horizontal = 14.dp, vertical = 6.dp)) {
                    Text(s, color = t.text, fontSize = 13.5.sp, fontWeight = if (i == sel) FontWeight.SemiBold else FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun MenuRow(label: String, value: String, options: List<Pair<String, () -> Unit>>) {
    val t = T
    var open by remember { mutableStateOf(false) }
    Box {
        Tap(Modifier.fillMaxWidth().height(52.dp), haptic = false, onClick = { open = true }) { m ->
            Row(m.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(label, color = t.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Text(value, color = t.text2, fontSize = 15.sp, maxLines = 1)
                Text("  ⌄", color = t.text3, fontSize = 13.sp)
            }
        }
        DropdownMenu(open, { open = false }, shape = RoundedCornerShape(14.dp), containerColor = t.frostStrong, offset = androidx.compose.ui.unit.DpOffset(180.dp, 0.dp)) {
            options.forEach { (l, fn) -> DropdownMenuItem({ Text(l, color = if (l == value) t.accentText else t.text, fontWeight = if (l == value) FontWeight.SemiBold else FontWeight.Normal) }, onClick = { open = false; fn() }) }
        }
    }
}

/** 苹果式的开关 */
@Composable
fun Toggle(on: Boolean, onChange: (Boolean) -> Unit) {
    val t = T
    val x by androidx.compose.animation.core.animateDpAsState(if (on) 20.dp else 0.dp, androidx.compose.animation.core.spring(.7f, 500f), label = "tg")
    Tap(Modifier.size(width = 64.dp, height = 44.dp), onClick = { onChange(!on) }) { m ->
        Box(m.size(width = 51.dp, height = 31.dp).clip(CircleShape).background(if (on) t.brandH else androidx.compose.ui.graphics.SolidColor(t.text3.copy(alpha = .5f))).padding(2.dp)) {
            Box(Modifier.padding(start = x).size(27.dp).clip(CircleShape).background(Color.White))
        }
    }
}
