package io.github.salmangox.monthcalendar;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * 网页的 WebDAV 请求由这里代发。用 OkHttp 是因为系统自带的 HttpURLConnection 不支持 WebDAV 的 PROPFIND、MKCOL。
 * 输入 {method, url, headers, body}，返回 {status, etag, body}，出错返回 {error}（和 Mac 版一样）。
 */
final class Http {
    /** 网络请求单独几个线程：不占用 Engine.BG（存数据、刷新小组件），网慢时也不卡住它们 */
    static final ExecutorService NET = Executors.newFixedThreadPool(3);
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS).writeTimeout(25, TimeUnit.SECONDS).build();

    private Http() { }

    static JSONObject run(String json) {
        JSONObject out = new JSONObject();
        try {
            JSONObject o = new JSONObject(json);
            String url = o.optString("url", "");
            if (!url.startsWith("https://") && !url.startsWith("http://")) { out.put("error", "地址不对"); return out; }
            String method = o.optString("method", "GET").toUpperCase(Locale.ROOT);
            RequestBody body = o.isNull("body") ? null : RequestBody.create(o.optString("body", ""), MediaType.parse("application/json; charset=utf-8"));
            Request.Builder b = new Request.Builder().url(url).method(method, body);
            JSONObject h = o.optJSONObject("headers");
            if (h != null) for (Iterator<String> it = h.keys(); it.hasNext(); ) { String k = it.next(); b.header(k, h.optString(k, "")); }
            try (Response r = CLIENT.newCall(b.build()).execute()) {
                out.put("status", r.code());
                String etag = r.header("ETag");
                out.put("etag", etag == null ? "" : etag);
                out.put("body", r.body() == null ? "" : r.body().string());
            }
        } catch (Exception e) {
            try { out.put("error", "网络错误"); } catch (Exception ignored) { }
        }
        return out;
    }
}
