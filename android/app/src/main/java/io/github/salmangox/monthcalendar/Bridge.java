package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 网页里的 window.MCNative。网页通过 info() 查看 App 版本和接口版本，按支持的功能决定怎么做；
 * 浏览器和 iPhone 上没有这个对象，网页照常运行。
 *
 * 接口版本 BRIDGE：只在删改已有方法时加一。新增方法不用改版本，在 FEATURES 里加上名字即可。
 */
final class Bridge {
    static final int BRIDGE = 1;
    private static final String[] FEATURES = {
            "data", "prefs", "token", "notify", "exact", "battery", "test", "widgets", "pin", "saveFile", "openUrl", "sync", "feedback"
    };

    private final MainActivity a;
    private final Context c;

    Bridge(MainActivity a) {
        this.a = a;
        this.c = a.getApplicationContext();
    }

    @JavascriptInterface
    public String info() {
        JSONObject o = new JSONObject();
        try {
            o.put("platform", "android");
            o.put("app", BuildConfig.VERSION_NAME);
            o.put("code", BuildConfig.VERSION_CODE);
            o.put("bridge", BRIDGE);
            o.put("repo", BuildConfig.REPO);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("dataVersion", Data.KNOWN_VERSION);
            JSONArray f = new JSONArray();
            for (String s : FEATURES) f.put(s);
            o.put("features", f);
        } catch (Exception ignored) { }
        return o.toString();
    }

    /** 网页数据有变化时调用（防抖后）。默认与本机已有数据合并；replace=true 时整体替换（清除本机数据时用） */
    @JavascriptInterface
    public void setData(String json, boolean replace) {
        Engine.BG.execute(() -> {
            Store.put(c, json, replace);
            Engine.refresh(c);
        });
    }

    /** 每周第一天、深浅色、提醒开关、Gist 等设置 */
    @JavascriptInterface
    public void setPrefs(String json) {
        JSONObject o = Data.obj(json);
        if (o == null) return;
        SharedPreferences p = Store.prefs(c);
        SharedPreferences.Editor e = p.edit();
        String theme = o.optString("theme", "auto");
        e.putInt("weekStart", o.optInt("weekStart", 0));
        e.putString("theme", theme);
        e.putBoolean("notify", o.optBoolean("notify", false));
        String gist = o.optString("gistId", "");
        if (!gist.isEmpty() && !gist.equals(p.getString("gistId", ""))) e.putString("gistId", gist).remove("etag");
        e.apply();
        a.runOnUiThread(() -> a.applyTheme(theme));
        Engine.refreshAsync(c);
    }

    /** 连接或解锁 GitHub 后把令牌交给 App，后台拉取数据用；空字符串表示清除 */
    @JavascriptInterface
    public void setToken(String token, String gistId) {
        Store.setToken(c, token);
        SharedPreferences p = Store.prefs(c);
        if (gistId != null && !gistId.isEmpty() && !gistId.equals(p.getString("gistId", ""))) {
            p.edit().putString("gistId", gistId).remove("etag").apply();
        }
        if (token != null && !token.isEmpty()) {
            SyncJob.ensure(c);
            SyncJob.now(c);
        }
    }

    /** 断开 GitHub：清除令牌和 Gist 信息。wipe=true 时连本机数据一起清除 */
    @JavascriptInterface
    public void clearAccount(boolean wipe) {
        Store.setToken(c, "");
        Store.prefs(c).edit().remove("gistId").remove("etag").remove("pullAt").remove("pullErr").apply();
        if (wipe) Store.clearData(c);
        Engine.refreshAsync(c);
    }

    /** 完成事件的音效：只有手机在「响铃」模式时才允许出声（振动、静音都不出声） */
    @JavascriptInterface
    public boolean soundAllowed() {
        android.media.AudioManager am = (android.media.AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        return am != null && am.getRingerMode() == android.media.AudioManager.RINGER_MODE_NORMAL;
    }

    /** 轻微的确认触感（跟随系统的触感反馈设置） */
    @JavascriptInterface
    public void haptic() {
        a.runOnUiThread(() -> a.getWindow().getDecorView().performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM));
    }

    @JavascriptInterface
    public String status() {
        return a.status().toString();
    }

    /** kind: notif / exact / battery / channels / app。完成后回调网页，带上最新状态 */
    @JavascriptInterface
    public void request(String kind, String cb) {
        a.runOnUiThread(() -> a.request(kind, cb));
    }

    @JavascriptInterface
    public void test() {
        Engine.showTest(c, false);
    }

    @JavascriptInterface
    public void testLater(int seconds) {
        Engine.testLater(c, seconds);
    }

    @JavascriptInterface
    public void openUrl(String url) {
        Uri u = Uri.parse(url);
        if (!"https".equals(u.getScheme())) return;
        a.runOnUiThread(() -> a.openExternal(u));
    }

    @JavascriptInterface
    public boolean pinWidget(String kind) {
        return a.pinWidget(kind);
    }

    @JavascriptInterface
    public void saveFile(String name, String mime, String content, String cb) {
        a.runOnUiThread(() -> a.saveFile(name, mime, content, cb));
    }

    @JavascriptInterface
    public void syncNow() {
        SyncJob.now(c);
    }
}
