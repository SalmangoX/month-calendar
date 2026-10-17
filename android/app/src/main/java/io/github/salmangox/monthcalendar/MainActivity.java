package io.github.salmangox.monthcalendar;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * App 的界面就是你 GitHub Pages 上的网页：每次打开都加载最新版本，改网页不用重新打包 APK。
 * 这里只负责把网页装进全屏窗口，并通过 Bridge 提供原生能力（通知、精确闹钟、小组件、选文件、存文件）。
 */
public class MainActivity extends Activity {
    static final String EXTRA_HASH = "hash";
    private static final int REQ_FILE = 11, REQ_SAVE = 12, REQ_PERM = 13;

    private WebView web;
    private FrameLayout root;
    private Uri appUri;
    private ValueCallback<Uri[]> fileCb;
    private String saveContent, saveCb, pendingCb;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        appUri = Uri.parse(BuildConfig.APP_URL);
        Engine.ensureChannels(this);
        SyncJob.ensure(this);

        getWindow().setDecorFitsSystemWindows(false);
        getWindow().setNavigationBarContrastEnforced(false);
        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // 网页放在状态栏、导航条和键盘之间，不被遮挡
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsets.CONSUMED;
        });
        applyTheme(Store.prefs(this).getString("theme", "auto"));
        setupWeb();
        web.loadUrl(BuildConfig.APP_URL + hash(getIntent()));

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
    }

    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100); // 不跟随系统字体大小缩放，避免网页排版被撑乱
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " MCalAndroid/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(this), "MCNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (isApp(u)) return false;
                if (r.isForMainFrame()) openExternal(u); // 其他网站（GitHub 令牌页等）用浏览器打开
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                recreate(); // 网页进程被系统回收时重新打开，而不是让 App 崩溃
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = mimeTypes(p.getAcceptTypes());
                if (types.length == 1) {
                    i.setType(types[0]);
                } else {
                    i.setType("*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, types);
                }
                try {
                    startActivityForResult(i, REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCb = null;
                    return false;
                }
            }
        });
    }

    /** accept 里有 .json、.ics 这种扩展名时，安卓文件选择器认不出来，干脆不限制类型 */
    private static String[] mimeTypes(String[] accept) {
        List<String> out = new ArrayList<>();
        if (accept != null) {
            for (String a : accept) {
                for (String t : a.split(",")) {
                    t = t.trim();
                    if (t.isEmpty()) continue;
                    if (!t.contains("/")) return new String[]{"*/*"};
                    out.add(t);
                }
            }
        }
        return out.isEmpty() ? new String[]{"*/*"} : out.toArray(new String[0]);
    }

    private boolean isApp(Uri u) {
        if (!"https".equals(u.getScheme()) || u.getHost() == null || !u.getHost().equalsIgnoreCase(appUri.getHost())) return false;
        String base = appUri.getPath() == null ? "/" : appUri.getPath();
        String path = u.getPath() == null ? "/" : u.getPath();
        return path.startsWith(base) || (path + "/").equals(base);
    }

    void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "没有可以打开这个链接的应用", Toast.LENGTH_SHORT).show();
        }
    }

    private void showOffline() {
        boolean dark = isDark(Store.prefs(this).getString("theme", "auto"));
        String bg = dark ? "#000" : "#fff", fg = dark ? "#EFF1F4" : "#15171C", sub = dark ? "#8A9099" : "#777D87";
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:" + bg
                + ";color:" + fg + ";font-family:sans-serif;text-align:center'><div><div style='font-size:19px;font-weight:600'>连不上网络</div>"
                + "<div style='margin:10px 24px 22px;color:" + sub + ";font-size:14px;line-height:1.6'>第一次打开需要联网下载月历，之后断网也能用。</div>"
                + "<a href='" + BuildConfig.APP_URL + "' style='display:inline-block;padding:10px 26px;border-radius:20px;background:#56789A;color:#fff;text-decoration:none'>重试</a></div>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------- 深浅色：状态栏、导航条跟网页一致 ----------
    private boolean isDark(String pref) {
        if ("dark".equals(pref)) return true;
        if ("light".equals(pref)) return false;
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    void applyTheme(String pref) {
        boolean dark = isDark(pref);
        int bg = dark ? 0xFF000000 : 0xFFFFFFFF;
        root.setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        WindowInsetsController ic = getWindow().getInsetsController();
        if (ic != null) {
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            ic.setSystemBarsAppearance(dark ? 0 : mask, mask);
        }
    }

    // ---------- 返回键：先关网页里的面板，回到月历页，最后才退到后台 ----------
    private void goBack() {
        web.evaluateJavascript("(function(){try{return !!(window.MC&&MC.back&&MC.back())}catch(e){return false}})()",
                v -> { if (!"true".equals(v)) moveTaskToBack(true); });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { // Android 12 走这里，13 以上走上面注册的回调
        goBack();
    }

    // ---------- 从通知或小组件打开 ----------
    private static String hash(Intent i) {
        String h = i == null ? null : i.getStringExtra(EXTRA_HASH);
        return "#today".equals(h) || "#sched".equals(h) ? h : "";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String h = hash(intent);
        if (!h.isEmpty()) web.evaluateJavascript("window.MC&&MC.openHash&&MC.openHash(" + JSONObject.quote(h) + ")", null);
    }

    // ---------- 生命周期 ----------
    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        if (pendingCb != null) { // 从系统设置页回来：把最新的权限状态告诉网页
            String cb = pendingCb;
            pendingCb = null;
            callback(cb, status());
        }
        Engine.refreshAsync(this);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }

    // ---------- 给网页回调结果 ----------
    void callback(String id, JSONObject res) {
        if (id == null || id.isEmpty()) return;
        runOnUiThread(() -> web.evaluateJavascript("window.__mcNativeCb&&__mcNativeCb(" + JSONObject.quote(id) + ","
                + JSONObject.quote(res.toString()) + ")", null));
    }

    JSONObject status() {
        JSONObject o = new JSONObject();
        try {
            SharedPreferences p = Store.prefs(this);
            boolean n = Engine.canNotify(this);
            o.put("notif", n ? "granted" : Build.VERSION.SDK_INT >= 33 && !p.getBoolean("askedNotif", false) ? "default" : "denied");
            o.put("exact", Engine.exactAllowed(this));
            o.put("battery", getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName()));
            JSONObject w = new JSONObject();
            w.put("month", Widgets.count(this, MonthWidget.class));
            w.put("today", Widgets.count(this, TodayWidget.class));
            w.put("sched", Widgets.count(this, SchedWidget.class));
            o.put("widgets", w);
            o.put("pin", AppWidgetManager.getInstance(this).isRequestPinAppWidgetSupported());
            o.put("token", !p.getString("tok", "").isEmpty());
            o.put("pullAt", p.getLong("pullAt", 0));
            o.put("pullErr", p.getString("pullErr", ""));
            o.put("nextAlarm", p.getLong("nextAlarm", 0));
        } catch (Exception ignored) { }
        return o;
    }

    // ---------- 权限 ----------
    void request(String kind, String cb) {
        String pkg = getPackageName();
        switch (kind) {
            case "notif": {
                if (Engine.canNotify(this)) { callback(cb, status()); return; }
                SharedPreferences p = Store.prefs(this);
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && (!p.getBoolean("askedNotif", false) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
                    p.edit().putBoolean("askedNotif", true).apply();
                    pendingCb = cb;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
                    return;
                }
                openSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg), cb);
                return;
            }
            case "exact":
                if (Engine.exactAllowed(this)) { callback(cb, status()); return; }
                openSettings(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg)), cb);
                return;
            case "battery":
                if (getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(pkg)) { callback(cb, status()); return; }
                openSettings(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)), cb);
                return;
            case "channels":
                openSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg), cb);
                return;
            case "app":
                openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)), cb);
                return;
            default:
                callback(cb, status());
        }
    }

    private void openSettings(Intent i, String cb) {
        pendingCb = cb;
        try {
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            } catch (Exception e2) {
                pendingCb = null;
                callback(cb, status());
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        super.onRequestPermissionsResult(req, perms, results);
        if (req == REQ_PERM && pendingCb != null) {
            String cb = pendingCb;
            pendingCb = null;
            callback(cb, status());
            Engine.refreshAsync(this);
        }
    }

    // ---------- 小组件：在 App 里直接添加到桌面 ----------
    boolean pinWidget(String kind) {
        Class<?> cls = "today".equals(kind) ? TodayWidget.class : "sched".equals(kind) ? SchedWidget.class : MonthWidget.class;
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        return m.isRequestPinAppWidgetSupported() && m.requestPinAppWidget(new ComponentName(this, cls), null, null);
    }

    // ---------- 导出备份：保存到用户选的位置 ----------
    void saveFile(String name, String mime, String content, String cb) {
        saveContent = content;
        saveCb = cb;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime)
                .putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (ActivityNotFoundException e) {
            finishSave(false);
        }
    }

    private void finishSave(boolean ok) {
        JSONObject o = new JSONObject();
        try { o.put("ok", ok); } catch (Exception ignored) { }
        String cb = saveCb;
        saveCb = null;
        saveContent = null;
        callback(cb, o);
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req == REQ_FILE) {
            if (fileCb != null) fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCb = null;
        } else if (req == REQ_SAVE) {
            boolean ok = false;
            if (result == RESULT_OK && data != null && data.getData() != null && saveContent != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (out != null) {
                        out.write(saveContent.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                } catch (Exception ignored) { }
            }
            finishSave(ok);
        }
    }
}
