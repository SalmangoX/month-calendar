package io.github.salmangox.monthcalendar;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
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
            "data", "prefs", "token", "notify", "exact", "battery", "test", "widgets", "pin", "saveFile", "openUrl", "sync", "feedback", "saveImage", "camera", "daysWidget", "http", "wx", "chrome", "update", "nativeDock", "getData", "autoBackup", "sysCal"
    };

    private final MainActivity a;
    private final Context c;

    Bridge(MainActivity a) {
        this.a = a;
        this.c = a.getApplicationContext();
    }

    /** 网页把当前页的背景色告诉原生，状态栏那条就跟着页面走，不再是一条系统白 */
    @JavascriptInterface
    public void chrome(String color) {
        int c;
        try { c = Color.parseColor(color); } catch (Exception e) { return; }
        double lum = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255.0;
        a.runOnUiThread(() -> a.applyChrome(c, lum < 0.5));
    }

    /** 底部悬浮控件的状态（页面、时钟、分页点、回到今天、有没有面板盖着），原生按它画悬浮控件 */
    @JavascriptInterface
    public void nav(String json) {
        a.runOnUiThread(() -> { if (a.dock != null) a.dock.getModel().update(json); });
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

    /** 本机保存的数据：网页打开时合并进来（1.4.2-36 那一版原生界面里加的事件只存在这里，不能丢） */
    @JavascriptInterface
    public String getData() { Store.data(c); return Store.json(c); }

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
        // WebDAV（坚果云等）：记下地址和账号，后台从网盘拉取；密码和 GitHub 令牌存在同一个地方
        JSONObject dav = o.optJSONObject("dav");
        String davUrl = dav == null ? "" : dav.optString("url", ""), davUser = dav == null ? "" : dav.optString("user", "");
        if (!davUrl.equals(p.getString("davURL", "")) || !davUser.equals(p.getString("davUser", ""))) {
            e.putString("davURL", davUrl).putString("davUser", davUser).remove("davEtag");
        }
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
        Store.prefs(c).edit().remove("gistId").remove("etag").remove("pullAt").remove("pullErr")
                .remove("davURL").remove("davUser").remove("davEtag").apply();
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

    /** 手机上装了微信没有（没装时网页不显示「分享到微信」） */
    @JavascriptInterface
    public boolean wxReady() { return WeChat.ready(c); }

    /** 分享图片到微信：content 是 data:image/...;base64,...；scene 是 "session"（好友）或 "timeline"（朋友圈） */
    @JavascriptInterface
    public void wxShare(String content, String scene, String cb) {
        Engine.BG.execute(() -> {
            boolean ok = false;
            try {
                int i = content.indexOf(";base64,");
                byte[] bytes = android.util.Base64.decode(content.substring(i + 8), android.util.Base64.DEFAULT);
                ok = WeChat.shareImage(c, bytes, content.startsWith("data:image/png"), "timeline".equals(scene));
            } catch (Exception ignored) { }
            JSONObject o = new JSONObject();
            try { o.put("ok", ok); } catch (Exception ignored) { }
            a.runOnUiThread(() -> a.callback(cb, o));
        });
    }

    // ---------- 自动备份到手机文件夹 ----------
    @JavascriptInterface
    public String backupInfo() { return Backup.info(c).toString(); }

    /** 打开系统的文件夹选择器；选好后立刻备份一份，回调 {ok, folder, at} */
    @JavascriptInterface
    public void backupPick(String cb) { a.runOnUiThread(() -> a.pickBackupFolder(cb)); }

    @JavascriptInterface
    public void backupNow(String cb) {
        new Thread(() -> {
            JSONObject o = Backup.info(c);
            try { o.put("ok", Backup.write(c)); o.put("at", Store.prefs(c).getLong(Backup.KEY_AT, 0)); } catch (Exception ignored) { }
            a.callback(cb, o);
        }, "mcal-backup").start();
    }

    @JavascriptInterface
    public void backupOff() { Backup.off(c); }

    @JavascriptInterface
    public void saveFile(String name, String mime, String content, String cb) {
        a.runOnUiThread(() -> a.saveFile(name, mime, content, cb));
    }

    /** 导入：读手机系统日历（谷歌、Outlook、手机自带日历…）。第一次会问日历权限；from / to 是毫秒时间戳 */
    @JavascriptInterface
    public void sysCalRead(String json, String cb) { a.readSysCal(json, cb); }

    /** WebDAV（坚果云等）的请求由 App 代发：网页直接请求这类服务器会被浏览器的跨域限制挡住 */
    @JavascriptInterface
    public void http(String json, String cb) {
        Http.NET.execute(() -> a.callback(cb, Http.run(json)));
    }

    /** 应用内检查更新：有新版就下载并调起安装器 */
    @JavascriptInterface
    public void update(String cb) {
        Engine.BG.execute(() -> {
            JSONObject o = new JSONObject();
            try {
                JSONObject l = Update.latest(BuildConfig.REPO);
                int code = l.optInt("code", 0);
                String url = l.optString("url", "");
                if (url.isEmpty()) { o.put("ok", false); o.put("msg", l.optString("error", "没有可用的安装包")); }
                else if (code <= BuildConfig.VERSION_CODE) { o.put("ok", false); o.put("msg", "已经是最新版"); }
                else {
                    java.io.File apk = Update.download(c, url);
                    o.put("ok", true); o.put("msg", "已下载，准备安装…");
                    a.runOnUiThread(() -> Update.install(c, apk));
                }
            } catch (Exception e) { try { o.put("ok", false); o.put("msg", e.getMessage()); } catch (Exception ignored) { } }
            a.runOnUiThread(() -> a.callback(cb, o));
        });
    }

    @JavascriptInterface
    public void syncNow() {
        SyncJob.now(c);
    }
}
