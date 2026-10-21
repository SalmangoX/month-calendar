import AppKit
import WebKit

/// 主窗口：装的是 GitHub Pages 上的网页。通过 window.MCNative（与安卓同一套接口）提供原生能力，
/// 网页里的 js/native.js 不用区分是安卓还是 Mac。
@MainActor
final class MainWindowController: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let bridgeVersion = 1
    static let features = ["data", "prefs", "token", "notify", "test", "widgets", "saveFile", "openUrl", "sync", "feedback"]

    private let window: NSWindow
    private let web: WKWebView
    private let appURL: URL
    private var loaded = false
    private var pendingHash = ""
    private var triedCache = false
    private let engine = Engine.shared

    override init() {
        let s = Bundle.main.object(forInfoDictionaryKey: "CadenceAppURL") as? String ?? "https://salmangox.github.io/month-calendar/"
        appURL = URL(string: s)!

        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.applicationNameForUserAgent = "Cadence-Mac/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1")
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = CadenceWebView(frame: .zero, configuration: cfg)
        web.allowsBackForwardNavigationGestures = false
        web.underPageBackgroundColor = MainWindowController.appBg
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "节律"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = MainWindowController.appBg
        window.minSize = NSSize(width: 380, height: 560)
        window.isReleasedWhenClosed = false
        let root = NSView()
        web.frame = root.bounds
        web.autoresizingMask = [.width, .height]
        root.addSubview(web)
        window.contentView = root
        window.center()
        _ = window.setFrameAutosaveName("CadenceMain")
        super.init()

        window.delegate = self
        web.navigationDelegate = self
        web.uiDelegate = self
        cfg.userContentController.add(WeakHandler(self), name: "mc")
        installShim()
        engine.onStatus = { [weak self] in self?.pushStatus() }
        installPinch()
        web.load(URLRequest(url: appURL))
    }

    /// 触控板双指捏合：用应用级的事件监听接住（不管鼠标下面是网页的哪一层都能收到），
    /// 转成网页里的 gesturestart / gesturechange / gestureend，日历切换年 / 月 / 周、课表缩放都靠它
    private var pinchMonitor: Any?
    private var pinchScale: CGFloat = 1
    private func installPinch() {
        pinchMonitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] e in
            guard let self, e.window === self.window else { return e }
            let p = self.web.convert(e.locationInWindow, from: nil)
            guard self.web.bounds.contains(p) || e.phase != .began else { return e }
            let phase: String
            switch e.phase {
            case .began: phase = "began"; self.pinchScale = 1
            case .changed: phase = "changed"
            case .ended, .cancelled: phase = "ended"
            default: return nil
            }
            self.pinchScale = max(0.3, self.pinchScale + e.magnification)
            let y = self.web.isFlipped ? p.y : self.web.bounds.height - p.y
            self.web.evaluateJavaScript("window.MC&&MC.Native&&MC.Native.pinch&&MC.Native.pinch('\(phase)',\(self.pinchScale),\(p.x),\(y))")
            return nil
        }
    }

    @objc func newEvent() {
        show()
        web.evaluateJavaScript("(function(){var f=document.getElementById('fab');if(f)f.click();})()")
    }

    /// 和网页一致的底色，窗口标题栏、网页加载前都不会闪白
    static let appBg = NSColor(name: nil) { ap in
        ap.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(srgbRed: 5 / 255, green: 6 / 255, blue: 8 / 255, alpha: 1)
                                                         : NSColor(srgbRed: 247 / 255, green: 250 / 255, blue: 252 / 255, alpha: 1)
    }

    func show(hash: String = "") {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard !hash.isEmpty else { return }
        if loaded { openHash(hash) } else { pendingHash = hash }
    }

    func reload() {
        triedCache = false
        if web.url == nil || web.url?.host != appURL.host { web.load(URLRequest(url: appURL)) } else { web.reload() }
    }

    private func openHash(_ h: String) {
        web.evaluateJavaScript("window.MC&&MC.openHash&&MC.openHash(\(jsQuote(h)))")
    }

    // ---------- 桥接：网页里的 window.MCNative ----------
    private func info() -> JObj {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return ["platform": "mac", "app": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
                "code": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0,
                "bridge": MainWindowController.bridgeVersion, "repo": "", "os": "\(v.majorVersion).\(v.minorVersion)",
                "model": "Mac", "dataVersion": CalData.knownVersion, "features": MainWindowController.features]
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
            checkUpdate: function () { post('checkUpdate'); }
          };
        })();
        """
        ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

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
        switch name {
        case "setData": engine.put(s(0), replace: b(1))
        case "setPrefs": engine.setPrefs(s(0))
        case "setToken": engine.setToken(s(0), gistId: s(1)); pushStatus()
        case "clearAccount": engine.clearAccount(wipe: b(0)); pushStatus()
        case "haptic": NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .now)
        case "request":
            let cb = s(1)
            Task { await engine.request(s(0)); pushStatus(); callback(cb, engine.status()) }
        case "test": engine.test()
        case "testLater": engine.test(later: (a.first as? NSNumber)?.intValue ?? 10)
        case "openUrl": if let u = URL(string: s(0)) { NSWorkspace.shared.open(u) }
        case "saveFile": saveFile(name: s(0), content: s(2), cb: s(3))
        case "syncNow": Task { await engine.pull() }
        case "checkUpdate": Task { await Updater.shared.check(manual: true) }
        case "retry": reload()
        default: break
        }
    }

    private func saveFile(name: String, content: String, cb: String) {
        let p = NSSavePanel()
        p.nameFieldStringValue = name
        p.canCreateDirectories = true
        p.beginSheetModal(for: window) { [weak self] r in
            var ok = false
            if r == .OK, let u = p.url { ok = (try? content.write(to: u, atomically: true, encoding: .utf8)) != nil }
            self?.callback(cb, ["ok": ok])
        }
    }

    // ---------- 导航 ----------
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        let scheme = url.scheme?.lowercased() ?? ""
        if ["about", "data", "blob"].contains(scheme) { return .allow }
        if scheme == "http" || scheme == "https" {
            let main = action.targetFrame?.isMainFrame ?? true
            // 节律以外的网站（GitHub 设置页、帮助链接等）在默认浏览器里打开
            if action.targetFrame == nil || (main && url.host != appURL.host) {
                NSWorkspace.shared.open(url)
                return .cancel
            }
            return .allow
        }
        NSWorkspace.shared.open(url) // mailto: 等
        return .cancel
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.host == appURL.host else { return }
        loaded = true
        triedCache = false
        pushStatus()
        if !pendingHash.isEmpty { openHash(pendingHash); pendingHash = "" }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }

    /// 断网：先用上次缓存的网页，没有缓存再显示提示页
    private func failed(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return } // 交给浏览器打开的链接
        loaded = false
        if !triedCache {
            triedCache = true
            web.load(URLRequest(url: appURL, cachePolicy: .returnCacheDataDontLoad))
            return
        }
        let dark = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark">
        <style>
          body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:15px -apple-system,system-ui;
               background:\(dark ? "#050608" : "#F7FAFC");color:\(dark ? "#EEEEF1" : "#171B20")}
          .c{text-align:center;max-width:320px;padding:28px 30px;border-radius:24px;
             background:\(dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.7)");backdrop-filter:blur(30px) saturate(1.6);
             box-shadow:0 1px 0 rgba(255,255,255,\(dark ? ".08" : ".9")) inset,0 10px 40px rgba(0,0,0,\(dark ? ".5" : ".08"))}
          h1{font-size:19px;margin:0 0 8px}p{margin:0 0 18px;color:\(dark ? "#8C8E97" : "#747B83");line-height:1.5}
          button{font:600 14px -apple-system;border:0;border-radius:999px;padding:9px 22px;color:#fff;
                 background:\(dark ? "#8BA8DE" : "#4C6EAC");cursor:pointer}
        </style>
        <div class="c"><h1>\(I18n.t("连不上网络"))</h1><p>\(I18n.t("第一次打开需要联网下载节律，之后断网也能用。"))</p>
        <button onclick="webkit.messageHandlers.mc.postMessage({name:'retry'})">\(I18n.t("重试"))</button></div>
        """
        web.loadHTMLString(html, baseURL: nil)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reload() }

    // ---------- 弹窗、选文件、新窗口 ----------
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url { NSWorkspace.shared.open(u) }
        return nil
    }

    private func alert(_ msg: String, buttons: [String]) -> NSAlert {
        let a = NSAlert()
        a.messageText = msg
        buttons.forEach { a.addButton(withTitle: $0) }
        if a.buttons.count > 1 { a.buttons[1].keyEquivalent = "\u{1b}" } // 回车 = 第一个按钮，Esc = 取消
        return a
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        _ = await alert(message, buttons: [I18n.t("好")]).beginSheetModal(for: window)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await alert(message, buttons: [I18n.t("好"), I18n.t("取消")]).beginSheetModal(for: window) == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo) async -> String? {
        let a = alert(prompt, buttons: [I18n.t("好"), I18n.t("取消")])
        let f = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        f.stringValue = defaultText ?? ""
        a.accessoryView = f
        a.window.initialFirstResponder = f
        return await a.beginSheetModal(for: window) == .alertFirstButtonReturn ? f.stringValue : nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = false
        p.canChooseFiles = true
        return await p.beginSheetModal(for: window) == .OK ? p.urls : nil
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

/// 网页视图：触控板捏合不让网页内核自己处理（下面的 MainWindowController 用应用级事件监听统一接住）
final class CadenceWebView: WKWebView {
    override func magnify(with event: NSEvent) {}
}
