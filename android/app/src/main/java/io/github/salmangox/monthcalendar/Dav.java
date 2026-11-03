package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** 只读地从 WebDAV（坚果云等）拉取数据（写入仍由网页负责），位置和网页一致：<地址>/Cadence/cadence-calendar.json，带 ETag。 */
final class Dav {
    private Dav() { }

    /** 成功（包括没有变化、网盘里还没有数据）返回 true；网络或服务器出错返回 false */
    static boolean pull(Context c) {
        String pass = Store.token(c);
        SharedPreferences p = Store.prefs(c);
        String base = p.getString("davURL", "").trim().replaceAll("/+$", "");
        if (pass.isEmpty() || base.isEmpty()) return true;
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(base + "/Cadence/cadence-calendar.json").openConnection();
            h.setConnectTimeout(15000);
            h.setReadTimeout(25000);
            h.setUseCaches(false);
            String auth = p.getString("davUser", "") + ":" + pass;
            h.setRequestProperty("Authorization", "Basic " + Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP));
            String etag = p.getString("davEtag", "");
            if (!etag.isEmpty() && Store.hasData(c)) h.setRequestProperty("If-None-Match", etag);
            int code = h.getResponseCode();
            if (code == 304 || code == 404) { // 404：网盘里还没有数据
                p.edit().putLong("pullAt", System.currentTimeMillis()).remove("pullErr").apply();
                return true;
            }
            if (code < 200 || code >= 300) {
                p.edit().putString("pullErr", code == 401 ? "WebDAV 账号或密码不对" : "WebDAV 服务器返回 " + code).apply();
                return false;
            }
            InputStream in = h.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) bo.write(buf, 0, n);
            Store.put(c, bo.toString("UTF-8"), false);
            String tag = h.getHeaderField("ETag");
            p.edit().putString("davEtag", tag == null ? "" : tag).putLong("pullAt", System.currentTimeMillis()).remove("pullErr").apply();
            Engine.refresh(c);
            return true;
        } catch (Exception e) {
            p.edit().putString("pullErr", "网络错误").apply();
            return false;
        } finally {
            if (h != null) h.disconnect();
        }
    }
}
