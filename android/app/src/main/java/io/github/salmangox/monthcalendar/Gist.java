package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** 只读地从 GitHub Gist 拉取月历数据（写入仍由网页负责），带 ETag，没变化时只是一个很小的 304 请求。 */
final class Gist {
    static final String FILE = "mcal-calendar.json";

    private Gist() { }

    /** 成功（包括没有变化、没连接 GitHub）返回 true；网络或 GitHub 出错返回 false */
    static boolean pull(Context c) {
        String token = Store.token(c);
        if (token.isEmpty()) return true;
        SharedPreferences p = Store.prefs(c);
        String id = p.getString("gistId", "");
        HttpURLConnection h = null;
        try {
            if (id.isEmpty()) {
                id = find(token);
                if (id.isEmpty()) return true;
                p.edit().putString("gistId", id).remove("etag").apply();
            }
            h = open("https://api.github.com/gists/" + id, token);
            String etag = p.getString("etag", "");
            if (!etag.isEmpty() && Store.hasData(c)) h.setRequestProperty("If-None-Match", etag);
            int code = h.getResponseCode();
            if (code == 304) {
                p.edit().putLong("pullAt", System.currentTimeMillis()).remove("pullErr").apply();
                return true;
            }
            if (code != 200) {
                p.edit().putString("pullErr", code == 401 ? "令牌无效或已过期" : code == 404 ? "找不到同步数据" : "GitHub 返回 " + code).apply();
                return false;
            }
            JSONObject g = new JSONObject(read(h));
            JSONObject files = g.optJSONObject("files");
            JSONObject f = files == null ? null : files.optJSONObject(FILE);
            if (f != null) {
                String content = f.optBoolean("truncated") ? get(f.getString("raw_url"), token) : f.optString("content");
                Store.put(c, content, false);
            }
            p.edit().putString("etag", h.getHeaderField("ETag") == null ? "" : h.getHeaderField("ETag"))
                    .putLong("pullAt", System.currentTimeMillis()).remove("pullErr").apply();
            Engine.refresh(c);
            return true;
        } catch (Exception e) {
            p.edit().putString("pullErr", "网络错误").apply();
            return false;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static String find(String token) throws Exception {
        for (int page = 1; page <= 5; page++) {
            HttpURLConnection h = open("https://api.github.com/gists?per_page=100&page=" + page, token);
            try {
                if (h.getResponseCode() != 200) return "";
                JSONArray list = new JSONArray(read(h));
                for (int i = 0; i < list.length(); i++) {
                    JSONObject g = list.getJSONObject(i);
                    JSONObject files = g.optJSONObject("files");
                    if (files != null && files.has(FILE)) return g.getString("id");
                }
                if (list.length() < 100) break;
            } finally {
                h.disconnect();
            }
        }
        return "";
    }

    private static HttpURLConnection open(String url, String token) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(20000);
        h.setUseCaches(false);
        h.setRequestProperty("Accept", "application/vnd.github+json");
        h.setRequestProperty("User-Agent", "mcal-android");
        if (token != null && !token.isEmpty()) h.setRequestProperty("Authorization", "Bearer " + token);
        return h;
    }

    private static String get(String url, String token) throws IOException {
        HttpURLConnection h = open(url, token);
        try { return read(h); } finally { h.disconnect(); }
    }

    private static String read(HttpURLConnection h) throws IOException {
        try (InputStream in = h.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
