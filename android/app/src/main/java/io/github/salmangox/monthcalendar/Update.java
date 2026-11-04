package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** 应用内检查更新：查 GitHub Releases 的最新 APK，下载后调起系统安装器 */
final class Update {

    private Update() { }

    static JSONObject latest(String repo) {
        JSONObject o = new JSONObject();
        try {
            String body = Http.get("https://api.github.com/repos/" + repo + "/releases/latest", 15);
            if (body == null) { o.put("error", "连不上 GitHub"); return o; }
            JSONObject j = new JSONObject(body);
            String tag = j.optString("tag_name", "");
            int code = 0;
            String[] p = tag.split("-");
            if (p.length > 0) { try { code = Integer.parseInt(p[p.length - 1]); } catch (Exception ignored) { } }
            JSONArray assets = j.optJSONArray("assets");
            String url = "";
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.optJSONObject(i);
                    if (a.optString("name", "").endsWith(".apk")) { url = a.optString("browser_download_url", ""); break; }
                }
            }
            o.put("code", code); o.put("tag", tag); o.put("url", url);
        } catch (Exception e) {
            try { o.put("error", e.getMessage()); } catch (Exception ignored) { }
        }
        return o;
    }

    static File download(Context c, String url) throws Exception {
        File out = new File(c.getCacheDir(), "update.apk");
        OkHttpClient cl = new OkHttpClient();
        try (Response r = cl.newCall(new Request.Builder().url(url).build()).execute();
             InputStream in = r.body() == null ? null : r.body().byteStream();
             FileOutputStream fos = new FileOutputStream(out)) {
            byte[] buf = new byte[8192];
            int n;
            while (in != null && (n = in.read(buf)) > 0) fos.write(buf, 0, n);
        }
        return out;
    }

    static void install(Context c, File apk) {
        Uri uri = Uri.parse("content://" + c.getPackageName() + ".update/" + apk.getName());
        Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        c.startActivity(i);
    }
}
