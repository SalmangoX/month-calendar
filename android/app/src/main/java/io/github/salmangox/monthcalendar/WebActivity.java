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
import android.os.Handler;
import android.os.Looper;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 过渡期的网页页面（设置、日程、纪念日历、日历列表）：原生界面还没做完的页面先用 GitHub Pages 上的网页。
 * 主日历、今日、新建 / 编辑事件已经是原生的（MainActivity）；网页里回到日历或今日时关掉这里，回到原生。
 * 数据以原生为准：网页打开时从 Bridge.getData 取原生数据合并，改动通过 setData 交回原生，云端同步由原生负责。
 */
public class WebActivity extends Activity {
    static final String EXTRA_HASH = MainActivity.EXTRA_HASH;
    private static final int REQ_FILE = 11, REQ_SAVE = 12, REQ_PERM = 13, REQ_CAM = 14;
    private android.webkit.PermissionRequest camReq;

    private WebView web;
    private FrameLayout root;
    private Uri appUri;
    private ValueCallback<Uri[]> fileCb;
    private String saveContent, saveCb, pendingCb;
    /** 国内经常打不开 github.io：网页开始显示前一直是 false；镜像只试一次 */
    private boolean committed, triedMirror;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        appUri = Uri.parse(BuildConfig.APP_URL);

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
        loadApp(hash(getIntent()));

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        // 原生那边数据变了（后台同步、原生里改了事件）：让网页重新取一次
        Repo.addListener(pull);
    }

    private final Runnable pull = () -> ui.post(() -> {
        if (web != null) web.evaluateJavascript("window.MC&&MC.Native&&MC.Native.pull&&MC.Native.pull()", null);
    });

    /** 网页里回到了日历或今日：关掉网页，回原生（page = "today" 时打开原生的今日页） */
    void closeWeb(String page) {
        if (isFinishing()) return;
        if ("today".equals(page)) {
            startActivity(new Intent(this, MainActivity.class).putExtra(EXTRA_HASH, "#today").addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        }
        finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
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
            public void onPageCommitVisible(WebView v, String url) { committed = true; }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                if (!triedMirror) loadFromMirror(); else showOffline(); // GitHub Pages 打不开：先试国内镜像
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                recreate(); // 网页进程被系统回收时重新打开，而不是让 App 崩溃
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // 网页请求相机（纪念日历的透明相机）：先拿到系统的相机权限再交给网页
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest r) {
                boolean cam = false;
                for (String res : r.getResources()) if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) cam = true;
                if (!cam || r.getOrigin() == null || appUri.getHost() == null || !appUri.getHost().equalsIgnoreCase(r.getOrigin().getHost())) { r.deny(); return; }
                if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    r.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    camReq = r;
                    requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_CAM);
                }
            }

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
        if (!("https".equals(u.getScheme()) || BuildConfig.DEBUG && "http".equals(u.getScheme())) || u.getHost() == null || !u.getHost().equalsIgnoreCase(appUri.getHost())) return false;
        String base = appUri.getPath() == null ? "/" : appUri.getPath();
        String path = u.getPath() == null ? "/" : u.getPath();
        return path.startsWith(base) || (path + "/").equals(base);
    }

    void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, I18n.t("没有可以打开这个链接的应用"), Toast.LENGTH_SHORT).show();
        }
    }

    // ---------- 加载网页：GitHub Pages → 国内镜像（jsDelivr）→ 提示页（和 Mac 版一样） ----------
    private void loadApp(String hash) {
        committed = false;
        web.loadUrl(BuildConfig.APP_URL + hash);
        // 8 秒还没开始显示：只是慢（比如 GitHub 正在发布新版本）就接着等，真的连不上才换镜像
        ui.postDelayed(() -> {
            if (committed || triedMirror) return;
            Http.NET.execute(() -> {
                boolean ok = Http.reachable(BuildConfig.APP_URL + "version.json", 4);
                ui.post(() -> { if (!ok && !committed && !triedMirror) { web.stopLoading(); loadFromMirror(); } });
            });
        }, 8000);
    }

    /**
     * 国内镜像（jsDelivr，自动同步 GitHub 上的文件）：网页本身从镜像下载，脚本和样式也改成从镜像加载；
     * 地址仍然算作 GitHub Pages 那个，所以本机保存的数据、设置都在（网页的数据是按地址分开存的）
     */
    private void loadFromMirror() {
        triedMirror = true;
        String base = "https://cdn.jsdelivr.net/gh/" + BuildConfig.REPO + "@main/";
        Http.NET.execute(() -> {
            String html = Http.get(base + "index.html", 15);
            if (html == null) { ui.post(this::showOffline); return; }
            // 告诉网页真正的版本号（镜像上的源文件没盖版本号），放在最前面
            String ver = "1", vj = Http.get(base + "version.json", 8);
            if (vj != null) try { ver = new JSONObject(vj).optString("version", "1"); } catch (Exception ignored) { }
            html = html.replaceFirst("<head>", Matcher.quoteReplacement("<head><script>window.__mcMirrorVersion=" + JSONObject.quote(ver) + ";</script>"));
            // 脚本和样式每次都带上新的版本参数：不让网页视图用本机缓存里的旧脚本（新旧混在一起会白屏）
            html = html.replaceAll("\\?v=[^\"']*", Matcher.quoteReplacement("?v=" + ver + "-" + System.currentTimeMillis() / 1000));
            // 相对地址的 src / href（js、css、图标）改成镜像上的地址
            html = Pattern.compile("(src|href)=\"(?!https?:|data:|#|mailto:|/)([^\"]+)\"").matcher(html).replaceAll("$1=\"" + Matcher.quoteReplacement(base) + "$2\"");
            String page = html;
            ui.post(() -> { committed = false; web.loadDataWithBaseURL(BuildConfig.APP_URL, page, "text/html", "utf-8", null); });
        });
    }

    private void showOffline() {
        boolean dark = isDark(Store.prefs(this).getString("theme", "auto"));
        String bg = dark ? "#141416" : "#F7FAFC", fg = dark ? "#EEEEF1" : "#171B20", sub = dark ? "#8F929B" : "#6E757E", acc = dark ? "#5A77AD" : "#4C6EAC";
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:" + bg
                + ";color:" + fg + ";font-family:sans-serif;text-align:center'><div><div style='font-size:19px;font-weight:600'>" + I18n.t("连不上网络") + "</div>"
                + "<div style='margin:10px 24px 22px;color:" + sub + ";font-size:14px;line-height:1.6'>" + I18n.t("第一次打开需要联网下载节律，之后断网也能用。") + "</div>"
                + "<a href='" + BuildConfig.APP_URL + "' style='display:inline-block;padding:10px 26px;border-radius:20px;background:" + acc + ";color:#fff;text-decoration:none'>" + I18n.t("重试") + "</a></div>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    // ---------- 深浅色：状态栏、导航条跟网页一致 ----------
    private boolean isDark(String pref) {
        if ("dark".equals(pref)) return true;
        if ("light".equals(pref)) return false;
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** 状态栏那条（root 的 padding 区域）和网页页面同色；深色页面配浅色图标 */
    void applyChrome(int color, boolean dark) {
        if (root != null) root.setBackgroundColor(color);
        if (web != null) web.setBackgroundColor(color);
        WindowInsetsController ic = getWindow().getInsetsController();
        if (ic != null) {
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            ic.setSystemBarsAppearance(dark ? 0 : mask, mask);
        }
    }

    void applyTheme(String pref) {
        boolean dark = isDark(pref);
        int bg = dark ? 0xFF141416 : 0xFFF7FAFC;
        root.setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        WindowInsetsController ic = getWindow().getInsetsController();
        if (ic != null) {
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            ic.setSystemBarsAppearance(dark ? 0 : mask, mask);
        }
    }

    // ---------- 返回键：先关网页里的面板，都关了就回到原生 ----------
    private void goBack() {
        web.evaluateJavascript("(function(){try{return !!(window.MC&&MC.back&&MC.back())}catch(e){return false}})()",
                v -> { if (!"true".equals(v)) closeWeb("cal"); });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() { // Android 12 走这里，13 以上走上面注册的回调
        goBack();
    }

    // ---------- 从通知或小组件打开 ----------
    private static String hash(Intent i) {
        String h = i == null ? null : i.getStringExtra(EXTRA_HASH);
        if (h != null && h.matches("#days(-[A-Za-z0-9]{1,40})?")) return h; // 纪念日小组件：打开纪念日历（或某个日子）
        return "#set".equals(h) || "#sched".equals(h) || "#drawer".equals(h) ? h : "";
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
        Repo.removeListener(pull);
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
        if (req == REQ_CAM && camReq != null) {
            android.webkit.PermissionRequest r = camReq;
            camReq = null;
            if (results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) r.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else r.deny();
            return;
        }
        if (req == REQ_PERM && pendingCb != null) {
            String cb = pendingCb;
            pendingCb = null;
            callback(cb, status());
            Engine.refreshAsync(this);
        }
    }

    // ---------- 小组件：在 App 里直接添加到桌面 ----------
    boolean pinWidget(String kind) {
        Class<?> cls = "today".equals(kind) ? TodayWidget.class : "sched".equals(kind) ? SchedWidget.class : "days".equals(kind) ? DaysWidget.class : MonthWidget.class;
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
                        int b64 = saveContent.startsWith("data:") ? saveContent.indexOf(";base64,") : -1;
                        if (b64 > 0 && b64 < 80) out.write(android.util.Base64.decode(saveContent.substring(b64 + 8), android.util.Base64.DEFAULT)); // 图片（分享图片、相机）
                        else out.write(saveContent.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                } catch (Exception ignored) { }
            }
            finishSave(ok);
        }
    }
}
