package io.github.salmangox.monthcalendar

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 云端同步（原生是写入方）：和网页 MC.sync 同一个流程——读云端（带 ETag）→ 和本机合并 → 两边不一样才写回。
 * GitHub Gist：mcal-calendar.json；WebDAV（坚果云等）：<地址>/Cadence/cadence-calendar.json。格式和网页、iPhone、Mac 完全一样。
 * 令牌 / WebDAV 密码由网页设置页交给原生（Store.token，安卓 Keystore 加密保存）。
 */
object SyncEngine {
    private const val GIST_FILE = "mcal-calendar.json"
    private const val GIST_DESC = "节律 App 数据（请勿手动修改）"
    private const val DAV_DIR = "Cadence"
    private const val DAV_FILE = "cadence-calendar.json"

    private val exec = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).writeTimeout(25, TimeUnit.SECONDS).build()
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    data class Result(val ok: Boolean, val error: String = "", val changed: Boolean = false)

    @Volatile var busy = false; private set
    @Volatile var last: Result? = null; private set
    var onStatus: (() -> Unit)? = null

    private val pending = Runnable { exec.execute { run(app ?: return@execute) } }
    @Volatile private var app: Context? = null

    /** 本机有改动后稍等一下再同步（连续改动合成一次） */
    @JvmStatic
    fun schedule(c: Context) {
        app = c.applicationContext
        main.removeCallbacks(pending)
        main.postDelayed(pending, 1500)
    }

    /** 立刻同步（后台线程里回调结果） */
    @JvmStatic
    fun now(c: Context, cb: ((Result) -> Unit)? = null) {
        app = c.applicationContext
        exec.execute { val r = run(c.applicationContext); cb?.invoke(r) }
    }

    /** 同步一次（阻塞，给后台任务用） */
    @JvmStatic
    fun runBlocking(c: Context): Boolean = exec.submit<Result> { run(c.applicationContext) }.get().ok

    private fun status(r: Result): Result { last = r; busy = false; main.post { onStatus?.invoke() }; return r }

    private fun run(c: Context): Result {
        val p = Store.prefs(c)
        val token = Store.token(c)
        if (token.isEmpty()) return Result(true)
        busy = true; main.post { onStatus?.invoke() }
        val dav = p.getString("davURL", "")!!.isNotEmpty()
        try {
            val t0 = System.currentTimeMillis()
            val dirty = p.getLong("dirtyAt", 0L) > 0L
            val read = if (dav) davRead(c, token) else gistRead(c, token)
            if (read.unchanged && !dirty) return status(ok(p))
            val remote = read.remote
            // 云端的合并进本机：在 Store 里原子地合并，不会冲掉同步期间本机新做的改动
            val changed = remote != null && Store.put(c, remote.toString(), false)
            if (changed) Engine.refresh(c)
            val local = Store.json(c).let { if (it.isEmpty()) null else JSONObject(it) } ?: return status(ok(p))
            // 304：云端还是上次合并过的那一份，本机已经包含它的全部内容；有本机改动就写回
            if (read.unchanged || remote == null || CalMerge.signature(local) != CalMerge.signature(remote)) {
                val out = JSONObject(local.toString()).put("updatedAt", System.currentTimeMillis())
                if (dav) davWrite(c, token, out) else gistWrite(c, token, out)
            }
            if (p.getLong("dirtyAt", 0L) <= t0) p.edit().putLong("dirtyAt", 0L).apply()
            else schedule(c) // 同步期间又有改动：再来一次
            return status(ok(p).copy(changed = changed))
        } catch (e: SyncError) {
            p.edit().putString("pullErr", e.message).apply()
            return status(Result(false, e.message ?: "同步失败"))
        } catch (e: Exception) {
            p.edit().putString("pullErr", "网络错误").apply()
            return status(Result(false, "网络错误"))
        }
    }

    private fun ok(p: android.content.SharedPreferences): Result {
        p.edit().putLong("pullAt", System.currentTimeMillis()).remove("pullErr").apply()
        return Result(true)
    }

    private class SyncError(msg: String) : Exception(msg)
    private class Read(val remote: JSONObject?, val unchanged: Boolean)

    // ---------- GitHub Gist ----------
    private fun gh(token: String, url: String): Request.Builder = Request.Builder().url(url)
        .header("Accept", "application/vnd.github+json").header("User-Agent", "mcal-android")
        .header("Authorization", "Bearer $token").header("Cache-Control", "no-cache")

    private fun ghErr(code: Int) = SyncError(when (code) {
        401 -> "令牌无效或已过期"
        403 -> "令牌没有勾选 gist 权限，或请求过于频繁"
        404 -> "找不到同步数据（Gist 已被删除，或令牌属于另一个账号）"
        else -> "GitHub 返回 $code"
    })

    private fun findGist(token: String): String {
        for (page in 1..5) {
            http.newCall(gh(token, "https://api.github.com/gists?per_page=100&page=$page").build()).execute().use { r ->
                if (!r.isSuccessful) throw ghErr(r.code)
                val list = JSONArray(r.body!!.string())
                for (i in 0 until list.length()) {
                    val g = list.getJSONObject(i)
                    if (g.optJSONObject("files")?.has(GIST_FILE) == true) return g.getString("id")
                }
                if (list.length() < 100) return ""
            }
        }
        return ""
    }

    private fun gistRead(c: Context, token: String): Read {
        val p = Store.prefs(c)
        var id = p.getString("gistId", "")!!
        if (id.isEmpty()) {
            id = findGist(token)
            if (id.isEmpty()) return Read(null, false) // 第一次：云端还没有数据，下面会新建
            p.edit().putString("gistId", id).remove("etag").apply()
        }
        val etag = p.getString("etag", "")!!
        val rb = gh(token, "https://api.github.com/gists/$id")
        if (etag.isNotEmpty() && Store.hasData(c)) rb.header("If-None-Match", etag)
        http.newCall(rb.build()).execute().use { r ->
            if (r.code == 304) return Read(null, true)
            if (!r.isSuccessful) throw ghErr(r.code)
            val g = JSONObject(r.body!!.string())
            val f = g.optJSONObject("files")?.optJSONObject(GIST_FILE) ?: throw SyncError("这个 Gist 里没有节律数据")
            val text = if (f.optBoolean("truncated")) http.newCall(gh(token, f.getString("raw_url")).build()).execute().use { it.body!!.string() } else f.optString("content")
            p.edit().putString("etag", r.header("ETag") ?: "").apply()
            return Read(JSONObject(text), false)
        }
    }

    private fun gistWrite(c: Context, token: String, d: JSONObject) {
        val p = Store.prefs(c)
        val id = p.getString("gistId", "")!!
        val files = JSONObject().put(GIST_FILE, JSONObject().put("content", d.toString()))
        if (id.isNotEmpty()) {
            val body = JSONObject().put("files", files).toString().toRequestBody(JSON_TYPE)
            http.newCall(gh(token, "https://api.github.com/gists/$id").patch(body).build()).execute().use { r -> if (!r.isSuccessful) throw ghErr(r.code) }
        } else {
            val body = JSONObject().put("files", files).put("description", GIST_DESC).put("public", false).toString().toRequestBody(JSON_TYPE)
            http.newCall(gh(token, "https://api.github.com/gists").post(body).build()).execute().use { r ->
                if (!r.isSuccessful) throw ghErr(r.code)
                p.edit().putString("gistId", JSONObject(r.body!!.string()).getString("id")).apply()
            }
        }
        p.edit().remove("etag").apply() // 下次重新取一次新的 ETag（和网页一样）
    }

    // ---------- WebDAV ----------
    private fun davBase(c: Context) = Store.prefs(c).getString("davURL", "")!!.trim().trimEnd('/') + "/$DAV_DIR/"

    private fun dav(c: Context, pass: String, url: String): Request.Builder {
        val auth = Store.prefs(c).getString("davUser", "") + ":" + pass
        return Request.Builder().url(url).header("Authorization", "Basic " + Base64.encodeToString(auth.toByteArray(), Base64.NO_WRAP))
    }

    private fun davErr(s: Int) = SyncError(when (s) {
        401 -> "账号或密码不对（坚果云要用「第三方应用密码」，不是登录密码）"
        403 -> "没有权限访问这个地址"; 404 -> "找不到这个地址，请检查服务器地址"; 507 -> "网盘空间不够了"
        else -> "WebDAV 服务器返回 $s"
    })

    private fun davRead(c: Context, pass: String): Read {
        val p = Store.prefs(c)
        val etag = p.getString("davEtag", "")!!
        val rb = dav(c, pass, davBase(c) + DAV_FILE)
        if (etag.isNotEmpty() && Store.hasData(c)) rb.header("If-None-Match", etag)
        http.newCall(rb.build()).execute().use { r ->
            if (r.code == 304) return Read(null, true)
            if (r.code == 404) return Read(null, false)
            if (!r.isSuccessful) throw davErr(r.code)
            p.edit().putString("davEtag", r.header("ETag") ?: "").apply()
            return Read(JSONObject(r.body!!.string()), false)
        }
    }

    private fun davWrite(c: Context, pass: String, d: JSONObject) {
        fun put(): Int = http.newCall(dav(c, pass, davBase(c) + DAV_FILE).put(d.toString().toRequestBody(JSON_TYPE)).build()).execute().use { it.code }
        var code = put()
        if (code == 404 || code == 409) { // 文件夹还没建：建好再写一次
            val m = http.newCall(dav(c, pass, davBase(c)).method("MKCOL", null).build()).execute().use { it.code }
            if (m >= 400 && m != 405) throw davErr(m)
            code = put()
        }
        if (code !in 200..299) throw davErr(code)
        Store.prefs(c).edit().remove("davEtag").apply()
    }
}
