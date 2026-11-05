package io.github.salmangox.monthcalendar

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/**
 * 原生界面的数据入口：本机 calendar.json（Store）是正本。
 * 每次改动：在原 JSON 上只改认识的字段 → 写回 Store → 刷新提醒和小组件 → 稍后同步到云端。
 * 网页过渡页面（setData）和后台同步写进 Store 时，Store.onChange 通知这里重新读取。
 */
object Repo {
    private lateinit var app: Context
    private val _data = MutableStateFlow(CalData.EMPTY)
    val data: StateFlow<CalData> = _data

    fun init(c: Context) {
        if (::app.isInitialized) return
        app = c.applicationContext
        Store.onChange = Runnable { reload() }
        if (Store.json(app).isEmpty()) I18n.set("auto") // 还没有数据时也按系统语言显示
        reload()
        Engine.BG.execute { extendSeries() }
    }

    private val listeners = java.util.concurrent.CopyOnWriteArrayList<Runnable>()
    @JvmStatic fun addListener(r: Runnable) { listeners.add(r) }
    @JvmStatic fun removeListener(r: Runnable) { listeners.remove(r) }

    private fun reload() {
        _data.value = CalData.parse(Store.json(app))
        listeners.forEach { it.run() }
    }

    /** 记一笔「本机有改动还没上传」（时间戳，同步时只清掉同步开始前的改动） */
    @JvmStatic fun markDirty(c: Context) { Store.prefs(c).edit().putLong("dirtyAt", System.currentTimeMillis()).apply() }

    /** 在当前数据上做一次修改（后台线程串行执行，和网页 setData、同步不会互相覆盖） */
    private fun mutate(block: (JSONObject) -> Unit) {
        Engine.BG.execute {
            val raw = Store.json(app)
            val o = if (raw.isEmpty()) blank() else runCatching { JSONObject(raw) }.getOrNull() ?: blank()
            block(o)
            o.put("updatedAt", System.currentTimeMillis())
            if (Store.put(app, o.toString(), true)) {
                markDirty(app)
                Engine.refresh(app)
                SyncEngine.schedule(app)
            }
        }
    }

    private fun blank() = JSONObject(
        """{"version":3,"updatedAt":0,"events":[],"deleted":{},"profile":{"name":"","avatar":"","clock":"","lang":"","updatedAt":0},
        "daily":{"on":false,"time":"13:00","tz":"","updatedAt":0},"courses":[],"coursesAt":0,"cals":[],"days":[],"books":[],"album":{"gist":"","owner":""}}"""
    )

    private fun JSONObject.events(): JSONArray = optJSONArray("events") ?: JSONArray().also { put("events", it) }
    private fun JSONObject.deleted(): JSONObject = optJSONObject("deleted") ?: JSONObject().also { put("deleted", it) }

    /** 事件的可编辑字段（新建、修改共用） */
    data class Fields(
        val title: String, val note: String, val priority: Int, val date: LocalDate, val days: Int,
        val time: String, val endTime: String, val remind: Int?, val done: Boolean = false, val rate: Int = 0,
    )

    private fun JSONObject.apply(f: Fields) {
        put("title", f.title.take(200)); put("note", f.note); put("priority", f.priority.coerceIn(0, 3))
        put("date", f.date.toString()); put("time", f.time); put("endTime", if (f.time.isEmpty()) "" else f.endTime)
        put("days", if (f.time.isEmpty()) f.days.coerceIn(1, 60) else 1)
        put("remind", f.remind ?: JSONObject.NULL); put("done", f.done)
        if (f.rate in 0..4) put("rate", f.rate)
    }

    private fun newEventJson(f: Fields, id: String, cal: String, series: String, rep: JSONObject?, now: Long) = JSONObject().apply {
        put("id", id); put("segs", JSONObject()); put("rate", 0); put("series", series); put("cal", cal)
        put("rep", rep ?: JSONObject.NULL); put("createdAt", now); put("updatedAt", now)
        apply(f)
    }

    /** 新建（可带重复规则）：和网页 buildEvents 一样，重复事件共用 series，id = series-日期；until 为空 = 一直重复 */
    fun add(f: Fields, repeat: String = "none", until: LocalDate? = null, cal: String = ""): Int {
        var dates = listOf(f.date)
        var rep: JSONObject? = null
        if (repeat != "none") {
            val forever = until == null
            dates = Dates.repeatDates(f.date, repeat, until ?: LocalDate.now().plusDays(Dates.HORIZON[repeat] ?: 730))
            rep = JSONObject().put("freq", repeat).put("forever", forever)
        }
        val series = if (rep != null) Dates.uid() else ""
        mutate { o ->
            val now = System.currentTimeMillis()
            val arr = o.events()
            for (d in dates) arr.put(newEventJson(f.copy(date = d), if (series.isNotEmpty()) "$series-$d" else Dates.uid(), cal, series, rep, now))
        }
        return dates.size
    }

    fun update(id: String, f: Fields) = mutate { o ->
        val arr = o.events()
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            if (e.optString("id") != id) continue
            e.apply(f)
            // 分段评价只保留当前时间段里的（和网页 MC.pruneSegs 一致）
            e.optJSONObject("segs")?.let { s -> e.put("segs", pruneSegs(s, f.time, f.endTime)) }
            e.put("updatedAt", System.currentTimeMillis())
        }
    }

    fun setDone(id: String, done: Boolean) = mutate { o -> edit(o, setOf(id)) { it.put("done", done) } }

    fun move(ids: Collection<String>, to: LocalDate) = mutate { o -> edit(o, ids.toSet()) { it.put("date", to.toString()) } }

    private fun edit(o: JSONObject, ids: Set<String>, fn: (JSONObject) -> Unit) {
        val arr = o.events(); val t = System.currentTimeMillis()
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            if (e.optString("id") in ids) { fn(e); e.put("updatedAt", t) }
        }
    }

    /** 删除，返回删掉的原 JSON（撤销用）；stopSeries：顺带让「一直重复」不再续生成 */
    fun delete(ids: Collection<String>, stopSeries: String = "", cb: (List<String>) -> Unit = {}) = mutate { o ->
        val arr = o.events(); val keep = JSONArray(); val removed = ArrayList<String>(); val t = System.currentTimeMillis()
        val set = ids.toSet()
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            if (e.optString("id") in set) { removed.add(e.toString()); o.deleted().put(e.optString("id"), t) }
            else {
                if (stopSeries.isNotEmpty() && e.optString("series") == stopSeries) e.optJSONObject("rep")?.let { r ->
                    if (r.optBoolean("forever")) { e.put("rep", JSONObject(r.toString()).put("forever", false)); e.put("updatedAt", t) }
                }
                keep.put(e)
            }
        }
        o.put("events", keep)
        cb(removed)
    }

    /** 撤销删除：放回原来的事件，updatedAt 要比删除时间新，其他设备同步时才会保留（MC.restoreEvents） */
    fun restore(raw: List<String>) = mutate { o ->
        val t = System.currentTimeMillis() + 1
        val arr = o.events(); val have = HashSet<String>()
        for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { have.add(it.optString("id")) }
        for (s in raw) {
            val e = JSONObject(s); val id = e.optString("id")
            o.deleted().remove(id)
            if (id !in have) arr.put(e.put("updatedAt", t))
        }
    }

    private fun pruneSegs(segs: JSONObject, time: String, endTime: String): JSONObject {
        val out = JSONObject()
        if (time.isEmpty() || endTime.isEmpty()) return out
        val a = Dates.minutes(time); var b = Dates.minutes(endTime); if (b <= a) b += 1440
        val keys = HashSet<String>(); var x = a; var n = 0
        while (x < b && n < 48) { keys.add(Dates.hm(x)); x += 30; n++ }
        for (k in segs.keys()) if (k in keys && segs.optInt(k) != 0) out.put(k, segs.get(k))
        return out
    }

    /** 「一直重复」的事件：快用完时自动续上（MC.extendSeries，id 固定，多台设备不会重复生成） */
    private fun extendSeries() {
        val raw = Store.json(app); if (raw.isEmpty()) return
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val arr = o.optJSONArray("events") ?: return
        val last = HashMap<String, JSONObject>(); val have = HashSet<String>()
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            have.add(e.optString("id"))
            val rep = e.optJSONObject("rep"); val sid = e.optString("series")
            if (sid.isNotEmpty() && rep != null && rep.optBoolean("forever")) {
                val g = last[sid]; if (g == null || e.optString("date") > g.optString("date")) last[sid] = e
            }
        }
        val del = o.optJSONObject("deleted") ?: JSONObject()
        val today = LocalDate.now(); val add = ArrayList<JSONObject>(); val now = System.currentTimeMillis()
        for ((sid, e) in last) {
            val freq = e.optJSONObject("rep")!!.optString("freq"); val h = Dates.HORIZON[freq] ?: 730
            val d0 = runCatching { LocalDate.parse(e.optString("date")) }.getOrNull() ?: continue
            if (!d0.isBefore(today.plusDays(h / 2))) continue
            for (d in Dates.repeatDates(d0, freq, today.plusDays(h)).drop(1)) {
                val id = "$sid-$d"
                if (id in have || del.has(id)) continue
                add.add(JSONObject(e.toString()).put("id", id).put("date", d.toString()).put("done", false).put("rate", 0).put("segs", JSONObject()).put("createdAt", now).put("updatedAt", now))
            }
        }
        if (add.isEmpty()) return
        mutate { x -> val a = x.events(); val ids = HashSet<String>(); for (i in 0 until a.length()) a.optJSONObject(i)?.let { ids.add(it.optString("id")) }; add.filter { it.optString("id") !in ids }.forEach { a.put(it) } }
    }
}
