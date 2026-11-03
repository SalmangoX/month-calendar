import SwiftUI
import UIKit
import WebKit

/// iPhone 版的界面就是 GitHub Pages 上的网页（和 Mac、安卓同一份）：通过 window.MCNative（与 Mac 同一套接口）提供原生能力，
/// 网页里的 js/native.js 不用区分是哪一端。导航层（底部菜单栏、加号、弹出菜单、日历栏）用 Mac 版共用的原生液态玻璃。
@MainActor
final class WebController: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let shared = WebController()
    static let bridgeVersion = 1
    static let features = ["data", "prefs", "token", "notify", "test", "sync", "feedback", "saveFile", "openUrl", "camera",
                           "http", "icloud", "glassDrawer"]

    let web: WKWebView
    let nav = NavModel()
    private let appURL: URL
    private let engine = Engine.shared
    private var loaded = false
    private var pendingHash = ""
    private var triedCache = false
    private var triedMirror = false
    private var committed = false
    private var loadTimer: Timer?

    override init() {
        var s = Bundle.main.object(forInfoDictionaryKey: "CadenceAppURL") as? String ?? "https://salmangox.github.io/month-calendar/"
        #if DEBUG
        // 只在调试版：模拟器里改成本机的网页测试（xcrun simctl spawn booted defaults write io.github.salmangox.cadence devURL http://localhost:8765/）
        if let d = UserDefaults.standard.string(forKey: "devURL"), !d.isEmpty { s = d }
        #endif
        appURL = URL(string: s)!
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.applicationNameForUserAgent = "Cadence-iOS/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1")
        cfg.allowsInlineMediaPlayback = true // 纪念日历的透明相机在页面里预览
        cfg.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: cfg)
        web.isOpaque = false
        web.backgroundColor = WebController.appBg
        web.scrollView.backgroundColor = WebController.appBg
        web.scrollView.contentInsetAdjustmentBehavior = .never // 安全区由网页自己用 env(safe-area-inset-*) 处理
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false
        web.allowsLinkPreview = false
        web.isInspectable = true
        super.init()
        web.navigationDelegate = self
        web.uiDelegate = self
        cfg.userContentController.add(WeakHandler(self), name: "mc")
        nav.eval = { [weak self] js, cb in self?.web.evaluateJavaScript(js) { r, _ in cb?(r) } }
        installShim()
        engine.onStatus = { [weak self] in self?.pushStatus() }
        loadApp()
    }

    /// 和网页一致的底色，网页加载前不会闪白
    static let appBg = UIColor { t in
        t.userInterfaceStyle == .dark ? UIColor(red: 20 / 255, green: 20 / 255, blue: 22 / 255, alpha: 1)
                                      : UIColor(red: 247 / 255, green: 250 / 255, blue: 252 / 255, alpha: 1)
    }

    func open(hash: String) {
        guard !hash.isEmpty else { return }
        if loaded { web.evaluateJavaScript("window.MC&&MC.openHash&&MC.openHash(\(jsQuote(hash)))") } else { pendingHash = hash }
    }

    func reload() {
        triedCache = false
        triedMirror = false
        if web.url == nil || web.url?.host != appURL.host { loadApp() } else { web.reload() }
    }

    // ---------- 加载网页：GitHub Pages → 国内镜像 → 上次的缓存 → 提示页（和 Mac 版一样） ----------
    /// 国内经常打不开 github.io：8 秒还没开始显示，先看 GitHub 通不通，真的连不上才换镜像
    private func loadApp() {
        committed = false
        web.load(URLRequest(url: appURL))
        loadTimer?.invalidate()
        loadTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, !self.committed, !self.triedMirror else { return }
                var probe = URLRequest(url: self.appURL.appendingPathComponent("version.json"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 4)
                probe.httpMethod = "HEAD"
                if let (_, r) = try? await URLSession.shared.data(for: probe), (r as? HTTPURLResponse)?.statusCode == 200 { return }
                guard !self.committed else { return }
                self.web.stopLoading()
                self.failed(NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut))
            }
        }
    }

    /// 国内镜像（jsDelivr）：网页本身从镜像下载，脚本和样式也改成从镜像加载；地址仍然算作 GitHub Pages 那个，本机数据都在
    private func loadFromMirror() {
        let repo = Bundle.main.object(forInfoDictionaryKey: "CadenceRepo") as? String ?? "SalmangoX/month-calendar"
        let base = "https://cdn.jsdelivr.net/gh/\(repo)@main/"
        var req = URLRequest(url: URL(string: base + "index.html")!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        Task { @MainActor in
            guard let (d, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200,
                  var html = String(data: d, encoding: .utf8) else {
                self.failed(NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)); return
            }
            var ver = "1"
            if let (vd, _) = try? await URLSession.shared.data(from: URL(string: base + "version.json")!),
               let o = (try? JSONSerialization.jsonObject(with: vd)) as? [String: Any], let v = o["version"] as? String { ver = v }
            html = html.replacingOccurrences(of: "<head>", with: "<head><script>window.__mcMirrorVersion=\(jsQuote(ver));</script>", options: [], range: html.range(of: "<head>"))
            let stamp = "\(ver)-\(Int(Date().timeIntervalSince1970))"
            if let vre = try? NSRegularExpression(pattern: "\\?v=[^\"']*") {
                html = vre.stringByReplacingMatches(in: html, range: NSRange(html.startIndex..., in: html), withTemplate: "?v=\(stamp)")
            }
            let re = try! NSRegularExpression(pattern: "(src|href)=\"(?!https?:|data:|#|mailto:|/)([^\"]+)\"")
            html = re.stringByReplacingMatches(in: html, range: NSRange(html.startIndex..., in: html), withTemplate: "$1=\"\(base)$2\"")
            self.committed = false
            self.web.loadHTMLString(html, baseURL: self.appURL)
        }
    }

    // ---------- 桥接：网页里的 window.MCNative ----------
    private func info() -> JObj {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return ["platform": "ios", "app": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
                "code": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0,
                "bridge": WebController.bridgeVersion, "repo": "", "os": "\(v.majorVersion).\(v.minorVersion)",
                "model": "iPhone", "dataVersion": CalData.knownVersion, "features": WebController.features]
    }

    /// 页面一开始就注入；info / status 是同步调用，所以由原生端预先放好、有变化时推过去
    private func installShim() {
        let ucc = web.configuration.userContentController
        ucc.removeAllUserScripts()
        let js = """
        (function(){
          var H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mc;
          if (!H || window.MCNative) return;
          var S = window.__mcMac = { info: \(jstring(info())), status: \(jstring(engine.status())) };
          function post(n, a) { try { H.postMessage({ name: n, args: a || [] }); } catch (e) {} }
          window.MCNative = {
            info: function () { return JSON.stringify(S.info); },
            status: function () { return JSON.stringify(S.status); },
            setData: function (j, r) { post('setData', [String(j), !!r]); },
            setPrefs: function (j) { post('setPrefs', [String(j)]); },
            setToken: function (t, g) { post('setToken', [String(t || ''), String(g || '')]); },
            clearAccount: function (w) { post('clearAccount', [!!w]); },
            soundAllowed: function () { return true; },
            haptic: function () { post('haptic'); },
            request: function (k, cb) { post('request', [String(k), String(cb)]); },
            test: function () { post('test'); },
            testLater: function (s) { post('testLater', [Number(s) || 10]); },
            openUrl: function (u) { post('openUrl', [String(u)]); },
            pinWidget: function () { return false; },
            saveFile: function (n, m, c, cb) { post('saveFile', [String(n), String(m), String(c), String(cb)]); },
            syncNow: function () { post('syncNow'); },
            openDrawer: function () { post('drawer'); },
            http: function (j, cb) { post('http', [String(j), String(cb)]); },
            icloudChoose: function (cb) { post('icloudChoose', [String(cb)]); },
            icloudRead: function (tag, cb) { post('icloudRead', [String(tag || ''), String(cb)]); },
            icloudWrite: function (body, cb) { post('icloudWrite', [String(body), String(cb)]); }
          };
        })();
        """
        ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.addUserScript(WKUserScript(source: WebController.navJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    /// 网页里：隐藏网页自己的菜单栏、加号和日历栏（换成原生玻璃）；切页、面板开关时把状态发给原生；弹出菜单换成原生玻璃菜单
    static let navJS = """
    (function(){
      var H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mc;
      var tb = document.getElementById('tabbar'); if (!H || !tb || window.__mcNav) return; window.__mcNav = 1;
      var native = window.MC && MC.Drawer && MC.Drawer.model;
      var st = document.createElement('style'); st.textContent = '#dock,#fab' + (native ? ',#drawerScrim,#calDrawer' : '') + '{display:none!important}';
      document.head.appendChild(st);
      var last = '';
      function covered(){
        var u = (window.MC && MC.UI) || {};
        return !!((u.anyOpen && u.anyOpen()) || (u.confirmOpen && u.confirmOpen()) || document.documentElement.classList.contains('locked')
          || document.querySelector('.dp.show, .cam.show, .pv.show'));
      }
      function send(){
        var tabs = [].map.call(tb.querySelectorAll('button[data-page]'), function(b){
          var l = b.querySelector('span:not(.tab-avatar)'); return { page: b.dataset.page, label: l ? l.textContent.trim() : '', hidden: !!b.hidden };
        });
        var page = document.body.dataset.page || 'cal', fab = document.getElementById('fab');
        var j = JSON.stringify({ tabs: tabs, page: page, fab: page !== 'set' && !!fab && !fab.hidden, cover: covered() });
        if (j !== last) { last = j; try { H.postMessage({ name: 'nav', args: [j] }); } catch (e) {} }
      }
      new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
      new MutationObserver(send).observe(tb, { attributes: true, subtree: true, childList: true, characterData: true });
      // 面板、确认框开关：类名变化时发一次（iPhone 的面板从底部弹出，玻璃菜单栏先让开）
      new MutationObserver(send).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
      if (window.MC && MC.UI && MC.UI.menu) {
        var cbs = {}, seq = 0;
        MC.UI.menu = function(anchor, items, cb){
          var r = anchor.getBoundingClientRect(), id = String(++seq);
          cbs[id] = { items: items, cb: cb };
          H.postMessage({ name: 'menu', args: [id, JSON.stringify(items.map(function(it){ return { label: String(it.label), on: !!it.on, danger: !!it.danger }; })), r.left, r.top, r.width, r.height] });
        };
        MC.UI.closeMenu = function(){};
        window.__mcMenuPick = function(id, i){ var m = cbs[id]; delete cbs[id]; if (m && i >= 0 && m.cb) m.cb(m.items[i].value, m.items[i]); };
      }
      send(); setTimeout(send, 600);
    })();
    """

    private func pushStatus() {
        installShim() // 下次重新载入时也是最新的
        web.evaluateJavaScript("window.__mcMac&&(window.__mcMac.status=\(jstring(engine.status())))")
    }

    private func callback(_ id: String, _ obj: JObj) {
        guard !id.isEmpty else { return }
        web.evaluateJavaScript("window.__mcNativeCb&&__mcNativeCb(\(jsQuote(id)),\(jsQuote(jstring(obj))))")
    }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let name = body["name"] as? String else { return }
        let a = body["args"] as? [Any] ?? []
        func s(_ i: Int) -> String { i < a.count ? (a[i] as? String ?? "") : "" }
        func b(_ i: Int) -> Bool { i < a.count ? ((a[i] as? NSNumber)?.boolValue ?? false) : false }
        func d(_ i: Int) -> Double { i < a.count ? ((a[i] as? NSNumber)?.doubleValue ?? 0) : 0 }
        switch name {
        case "setData": engine.put(s(0), replace: b(1))
        case "setPrefs": engine.setPrefs(s(0))
        case "setToken": engine.setToken(s(0), gistId: s(1)); pushStatus()
        case "clearAccount": engine.clearAccount(wipe: b(0)); pushStatus()
        case "haptic": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "request":
            let cb = s(1)
            Task { await engine.request(s(0)); pushStatus(); callback(cb, engine.status()) }
        case "test": engine.test()
        case "testLater": engine.test(later: (a.first as? NSNumber)?.intValue ?? 10)
        case "openUrl": if let u = URL(string: s(0)) { UIApplication.shared.open(u) }
        case "saveFile": saveFile(name: s(0), content: s(2), cb: s(3))
        case "syncNow": Task { await engine.pull() }
        case "retry": reload()
        case "nav": nav.update(s(0))
        case "menu": nav.showMenu(id: s(0), json: s(1), anchor: CGRect(x: d(2), y: d(3), width: d(4), height: d(5)))
        case "http": let cb = s(1), req = s(0); Task { callback(cb, await NativeHTTP.run(req)) }
        case "icloudChoose": let cb = s(0); CloudSync.shared.choose { [weak self] r in self?.callback(cb, r) }
        case "icloudRead": callback(s(1), CloudSync.shared.read(ifNot: s(0)))
        case "icloudWrite": callback(s(1), CloudSync.shared.write(s(0)))
        case "drawer": nav.openDrawer()
        default: break
        }
    }

    /// 导出备份、分享图片：写成临时文件，用系统的分享面板（可以「存储到文件」、存到相册、发给别人）
    private func saveFile(name: String, content: String, cb: String) {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        var ok = false
        if content.hasPrefix("data:"), let i = content.range(of: ";base64,"), let bin = Data(base64Encoded: String(content[i.upperBound...])) {
            ok = (try? bin.write(to: u, options: .atomic)) != nil
        } else { ok = (try? content.write(to: u, atomically: true, encoding: .utf8)) != nil }
        guard ok, let top = topVC() else { callback(cb, ["ok": false]); return }
        let share = UIActivityViewController(activityItems: [u], applicationActivities: nil)
        share.completionWithItemsHandler = { [weak self] _, done, _, _ in self?.callback(cb, ["ok": done]) }
        share.popoverPresentationController?.sourceView = web
        top.present(share, animated: true)
    }

    private func topVC() -> UIViewController? {
        guard var vc = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else { return nil }
        while let n = vc.presentedViewController { vc = n }
        return vc
    }

    // 纪念日历的透明相机：只允许节律自己的网页用相机，系统会再询问一次
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == appURL.host && type == .camera ? .prompt : .deny)
    }

    // ---------- 导航 ----------
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        let scheme = url.scheme?.lowercased() ?? ""
        if ["about", "data", "blob"].contains(scheme) { return .allow }
        if scheme == "http" || scheme == "https" {
            let main = action.targetFrame?.isMainFrame ?? true
            // 节律以外的网站（GitHub 设置页、帮助链接等）在 Safari 里打开
            if action.targetFrame == nil || (main && url.host != appURL.host) {
                await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }
        await UIApplication.shared.open(url) // mailto: 等
        return .cancel
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        committed = true
        loadTimer?.invalidate()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.host == appURL.host else { return }
        loaded = true
        triedCache = false
        pushStatus()
        if !pendingHash.isEmpty { open(hash: pendingHash); pendingHash = "" }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }

    /// 打不开：先换国内镜像，再用上次缓存的网页，都不行再显示提示页
    private func failed(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return } // 交给 Safari 打开的链接
        loaded = false
        loadTimer?.invalidate()
        if !triedMirror { triedMirror = true; loadFromMirror(); return }
        if !triedCache { triedCache = true; web.load(URLRequest(url: appURL, cachePolicy: .returnCacheDataDontLoad)); return }
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
        <style>
          body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:16px -apple-system,system-ui;background:#F7FAFC;color:#171B20}
          @media (prefers-color-scheme:dark){body{background:#141416;color:#EEEEF1}p{color:#8C8E97!important}}
          .c{text-align:center;max-width:300px;padding:0 24px}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#747B83;line-height:1.5}
          button{font:600 15px -apple-system;border:0;border-radius:999px;padding:11px 26px;color:#fff;background:#4C6EAC}
        </style>
        <div class="c"><h1>\(I18n.t("连不上网络"))</h1><p>\(I18n.t("第一次打开需要联网下载节律，之后断网也能用。"))</p>
        <button onclick="webkit.messageHandlers.mc.postMessage({name:'retry'})">\(I18n.t("重试"))</button></div>
        """
        web.loadHTMLString(html, baseURL: nil)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reload() }

    // ---------- 网页的 alert / confirm / prompt：用系统的弹窗 ----------
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { c in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: I18n.t("好"), style: .default) { _ in c.resume() })
            if let t = topVC() { t.present(a, animated: true) } else { c.resume() }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { c in
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: I18n.t("取消"), style: .cancel) { _ in c.resume(returning: false) })
            a.addAction(UIAlertAction(title: I18n.t("好"), style: .default) { _ in c.resume(returning: true) })
            if let t = topVC() { t.present(a, animated: true) } else { c.resume(returning: false) }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url { UIApplication.shared.open(u) }
        return nil
    }
}

/// WKUserContentController 会强引用 handler，用一层弱引用避免循环引用
@MainActor
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}

/// Swift 字符串 → JS 字符串字面量
func jsQuote(_ s: String) -> String {
    guard let d = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed),
          let q = String(data: d, encoding: .utf8) else { return "\"\"" }
    return q
}

/// 把网页视图放进 SwiftUI
struct WebView: UIViewRepresentable {
    let controller: WebController
    func makeUIView(context: Context) -> WKWebView { controller.web }
    func updateUIView(_ v: WKWebView, context: Context) {}
}
