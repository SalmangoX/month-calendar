package io.github.salmangox.monthcalendar

import org.json.JSONArray
import org.json.JSONObject

/**
 * 多设备合并：逐字段照搬网页 js/store.js 的 MC.merge（对照测试见 src/test/.../CalMergeTest.kt），
 * 和网页、iPhone、Mac 用同一份 Gist / WebDAV 数据，合并结果必须完全一样。
 * 和网页唯一的不同：网页不认识的顶层字段（以后新版网页加的）从较新的一份原样带上，不丢。
 */
// 【联动:同步数据】见 CLAUDE.md「联动分组」
object CalMerge {
    private val PROFILE_KEYS = listOf("name", "avatar", "clock", "lang")
    private const val KEEP_DELETED_MS = 180L * 86_400_000L

    private fun JSONObject.arr(k: String): List<JSONObject> {
        val a = optJSONArray(k) ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }
    }

    private fun JSONObject.num(k: String): Long = when (val v = opt(k)) {
        is Number -> v.toLong()
        is String -> v.toDoubleOrNull()?.toLong() ?: 0L
        is Boolean -> if (v) 1L else 0L
        else -> 0L
    }

    private fun copy(o: JSONObject): JSONObject = JSONObject(o.toString())

    /** 按 id 取 updatedAt 较新的一份（一样新时保留先出现的），保持第一次出现的顺序 */
    private fun newest(list: List<JSONObject>): LinkedHashMap<String, JSONObject> {
        val m = LinkedHashMap<String, JSONObject>()
        for (x in list) {
            val id = x.optString("id")
            val old = m[id]
            if (old == null || x.num("updatedAt") > old.num("updatedAt")) m[id] = copy(x)
        }
        return m
    }

    @JvmStatic
    @JvmOverloads
    fun merge(a: JSONObject, b: JSONObject, now: Long = System.currentTimeMillis()): JSONObject {
        // 删除记录：两边取较晚的时间
        val deleted = LinkedHashMap<String, Long>()
        for (src in listOf(a, b)) {
            val d = src.optJSONObject("deleted") ?: continue
            for (k in d.keys()) deleted[k] = maxOf(deleted[k] ?: 0L, d.num(k))
        }
        fun gone(key: String, at: Long): Boolean { val t = deleted[key] ?: 0L; return t != 0L && t >= at }

        val events = newest(a.arr("events") + b.arr("events")).values.filter { !gone(it.optString("id"), it.num("updatedAt")) }
        val cutoff = now - KEEP_DELETED_MS
        deleted.entries.removeIf { it.value < cutoff }

        // 资料：头像、昵称、时间制、语言一项一项比较（旧数据没有分项时间，用整份的修改时间）
        val pa = a.optJSONObject("profile") ?: JSONObject()
        val pb = b.optJSONObject("profile") ?: JSONObject()
        fun pt(p: JSONObject, k: String): Long = p.optJSONObject("at")?.num(k) ?: p.num("updatedAt")
        val at = JSONObject()
        val profile = JSONObject()
        profile.put("at", at)
        profile.put("updatedAt", maxOf(pa.num("updatedAt"), pb.num("updatedAt")))
        for (k in PROFILE_KEYS) {
            val ta = pt(pa, k); val tb = pt(pb, k)
            val v = (if (tb > ta) pb else pa).opt(k)
            profile.put(k, if (v == null || v == JSONObject.NULL || v == "" || v == false) "" else v)
            at.put(k, maxOf(ta, tb))
        }

        val da = a.optJSONObject("daily"); val db = b.optJSONObject("daily")
        val daily = if ((db?.num("updatedAt") ?: 0L) > (da?.num("updatedAt") ?: 0L)) copy(db!!)
        else da?.let { copy(it) } ?: JSONObject().put("on", false).put("time", "13:00").put("tz", "").put("updatedAt", 0)

        val nc = if (b.num("coursesAt") > a.num("coursesAt")) b else a

        val cals = newest(a.arr("cals") + b.arr("cals")).values
            .filter { !gone("cal:" + it.optString("id"), it.num("updatedAt")) }
            .sortedBy { it.num("createdAt") }
        val calIds = cals.map { it.optString("id") }.toHashSet()
        fun calOk(cal: String) = calIds.contains(cal) || (deleted["cal:$cal"] ?: 0L) == 0L
        val kept = events.filter { val cal = it.optString("cal", ""); cal.isEmpty() || calOk(cal) }

        fun byNewest(key: String, pre: String) = newest(a.arr(key) + b.arr(key)).values
            .filter { !gone(pre + it.optString("id"), it.num("updatedAt")) && calOk(it.optString("cal", "")) }
            .sortedBy { it.num("createdAt") }

        val aa = a.optJSONObject("album"); val ba = b.optJSONObject("album")
        val album = when {
            aa != null && aa.optString("gist").isNotEmpty() -> copy(aa)
            ba != null && ba.optString("gist").isNotEmpty() -> copy(ba)
            else -> JSONObject().put("gist", "").put("owner", "")
        }

        // 网页不认识的顶层字段：从较新的一份带上
        val newer = if (b.num("updatedAt") > a.num("updatedAt")) b else a
        val out = JSONObject()
        for (k in newer.keys()) out.put(k, newer.get(k))
        out.put("version", 3)
        out.put("updatedAt", maxOf(a.num("updatedAt"), b.num("updatedAt")))
        out.put("events", JSONArray(kept))
        out.put("deleted", JSONObject().also { d -> deleted.forEach { (k, v) -> d.put(k, v) } })
        out.put("profile", profile)
        out.put("daily", daily)
        out.put("courses", JSONArray(nc.arr("courses").map { copy(it) }))
        out.put("coursesAt", nc.num("coursesAt"))
        out.put("cals", JSONArray(cals))
        out.put("days", JSONArray(byNewest("days", "day:")))
        out.put("books", JSONArray(byNewest("books", "book:")))
        out.put("album", album)
        return out
    }

    /** 内容指纹：两份数据实际内容一样吗（和网页 MC.sameData 判断的是同一些东西） */
    @JvmStatic
    fun signature(d: JSONObject): String {
        val ev = d.arr("events").sortedBy { it.optString("id") }.map { e ->
            listOf("id", "cal", "date", "days", "title", "priority", "rate", "segs", "done", "note", "time", "endTime", "remind", "updatedAt")
                .joinToString("\u0001") { canon(e.opt(it)) } + "\u0001" + canon(e.optJSONObject("rep")?.opt("forever"))
        }
        val cs = d.arr("cals").sortedBy { it.optString("id") }.map { canon(it) }
        val ds = (d.arr("days") + d.arr("books")).map { it.optString("id") + ":" + it.num("updatedAt") }.sorted()
        val del = d.optJSONObject("deleted")?.keys()?.asSequence()?.sorted()?.toList() ?: emptyList()
        return listOf(
            ev.joinToString("\u0002"), del.joinToString(","),
            (d.optJSONObject("profile")?.num("updatedAt") ?: 0L).toString(),
            (d.optJSONObject("daily")?.num("updatedAt") ?: 0L).toString(),
            d.num("coursesAt").toString(), cs.joinToString("\u0002"), ds.joinToString(","),
            d.optJSONObject("album")?.optString("gist") ?: "",
        ).joinToString("\u0003")
    }

    /** 键排好序的 JSON，用来比较内容 */
    @JvmStatic
    fun canon(v: Any?): String = when (v) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> v.keys().asSequence().sorted().joinToString(",", "{", "}") { JSONObject.quote(it) + ":" + canon(v.opt(it)) }
        is JSONArray -> (0 until v.length()).joinToString(",", "[", "]") { canon(v.opt(it)) }
        is String -> JSONObject.quote(v)
        is Number -> { val dv = v.toDouble(); if (dv == Math.floor(dv) && !dv.isInfinite() && Math.abs(dv) < 1e15) dv.toLong().toString() else dv.toString() }
        else -> v.toString()
    }
}
