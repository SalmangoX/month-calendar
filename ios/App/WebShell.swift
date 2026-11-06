import SwiftUI
import UIKit
import CoreMotion
import WebKit

/// iPhone 版的界面就是 GitHub Pages 上的网页（和 Mac、安卓同一份）：通过 window.MCNative（与 Mac 同一套接口）提供原生能力，
/// 网页里的 js/native.js 不用区分是哪一端。导航层（底部菜单栏、加号、弹出菜单、日历栏）用 Mac 版共用的原生液态玻璃。
@MainActor
final class WebController: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, UIScrollViewDelegate {
    /// 键盘弹出时 iOS 会把网页的滚动视图往上推，让输入框露出来：网页自己会处理，这里一律推回原位
    nonisolated func scrollViewDidScroll(_ sv: UIScrollView) {
        MainActor.assumeIsolated { if sv.contentOffset != .zero { sv.contentOffset = .zero } }
    }
    static let shared = WebController()
    static let bridgeVersion = 1
    static let features = ["data", "prefs", "token", "notify", "test", "sync", "feedback", "saveFile", "openUrl", "camera",
                           "http", "icloud", "glassDrawer", "sysCal"]

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
        web.scrollView.isScrollEnabled = false // 网页自己处理滚动；键盘弹出时系统也不能把整个网页往上推
        web.isInspectable = true
        super.init()
        web.scrollView.delegate = self
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
                                      : UIColor(red: 248 / 255, green: 248 / 255, blue: 250 / 255, alpha: 1)
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

    // ---------- 纪念相机：横着拿手机时告诉网页（界面锁竖屏，按钮图标和卡片由网页转正，拍出横的照片）----------
    // 用陀螺仪的重力方向判断，不用 UIDevice.orientation：系统的竖屏锁打开时 UIDevice 一直报竖屏（用户发现要先关掉旋转锁定才转）
    private let motion = CMMotionManager()
    private var lastRot = 0
    func watchRotation(_ on: Bool) {
        if !on { motion.stopDeviceMotionUpdates(); return }
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { sendRot(lastRot); return }
        motion.deviceMotionUpdateInterval = 0.1
        motion.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let g = m?.gravity else { return }
            // 竖着拿：重力朝手机底下（y ≈ -1）；顶朝左（逆时针转了）：重力朝手机左边（x ≈ -1）→ 网页里的东西要顺时针转 90° 才正
            var r = self.lastRot
            if abs(g.x) > 0.65 && abs(g.x) > abs(g.y) * 1.3 { r = g.x < 0 ? 90 : -90 }
            else if g.y < -0.65 { r = 0 }
            if r != self.lastRot { self.lastRot = r; self.sendRot(r) }
        }
        sendRot(lastRot)
    }
    private func sendRot(_ r: Int) { web.evaluateJavaScript("window.__mcDevRot&&__mcDevRot(\(r))") }

    // ---------- 桥接：网页里的 window.MCNative ----------
    private func info() -> JObj {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return ["platform": "ios", "app": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
                "code": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0,
                "bridge": WebController.bridgeVersion, "repo": "", "os": "\(v.majorVersion).\(v.minorVersion)",
                "model": "iPhone", "dataVersion": CalData.knownVersion, "features": WebController.features,
                "channel": Bundle.main.object(forInfoDictionaryKey: "CadenceChannel") as? String ?? "sideload"] // mac = 用 Mac 直接装的
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
            drawerPull: function (p, dx, v) { post('drawerPull', [String(p), Number(dx) || 0, Number(v) || 0]); },
            http: function (j, cb) { post('http', [String(j), String(cb)]); },
            icloudChoose: function (cb) { post('icloudChoose', [String(cb)]); },
            icloudRead: function (tag, cb) { post('icloudRead', [String(tag || ''), String(cb)]); },
            icloudWrite: function (body, cb) { post('icloudWrite', [String(body), String(cb)]); },
            sysCalRead: function (j, cb) { post('sysCalRead', [String(j), String(cb)]); },
            devRot: function (on) { post('devRot', [!!on]); }   // 纪念相机：开着时原生报手机横竖（App 只竖屏，网页自己收不到）
          };
        })();
        """
        ucc.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // 网页自己的菜单栏、加号、侧栏一开始就藏起来：等网页加载完再藏，会先闪一下，和原生的玻璃菜单栏叠在一起
        ucc.addUserScript(WKUserScript(source: "(function(){var s=document.createElement('style');s.textContent='#dock,#fab,#calBack,#drawerScrim,#calDrawer{display:none!important}';(document.head||document.documentElement).appendChild(s);})();",
                                       injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.addUserScript(WKUserScript(source: WebController.navJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    /// 网页里：隐藏网页自己的菜单栏、加号和日历栏（换成原生玻璃）；切页、面板开关时把状态发给原生；弹出菜单换成原生玻璃菜单
    // 【联动:底部悬浮控件】见 CLAUDE.md「联动分组」
    static let navJS = """
    (function(){
      var H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mc;
      var tb = document.getElementById('tabbar'); if (!H || !tb || window.__mcNav) return; window.__mcNav = 1;
      var native = window.MC && MC.Drawer && MC.Drawer.model;
      var st = document.createElement('style'); st.textContent = '#dock,#fab,#calBack,#schedBack' + (native ? ',#drawerScrim,#calDrawer' : '') + '{display:none!important}#dock2,#dockScrim{visibility:hidden!important;pointer-events:none!important}#batchAddRow{visibility:hidden!important}';
      document.head.appendChild(st);
      var last = '';
      // 批量添加的「再加一个」：原生用液态玻璃画在同一个位置（网页的按钮只占位置）；面板没开、正在被拖、弹出键盘或盖了别的面板时不显示
      function addRow(){
        var s = document.getElementById('batchSheet'), b = document.getElementById('batchAddRow');
        if (!s || !b || !s.classList.contains('show') || s.style.transform || document.documentElement.classList.contains('kb-open')
            || document.querySelector('.sheet.show:not(#batchSheet)') || (window.MC && MC.UI && MC.UI.confirmOpen && MC.UI.confirmOpen())) return null;
        var x = 0, y = 0, e = b; while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; } // 不算面板弹出动画的位移，直接取停下来的位置
        return { x: x, y: y, w: b.offsetWidth, h: b.offsetHeight, t: b.textContent.trim() };
      }
      function covered(){
        var u = (window.MC && MC.UI) || {};
        return !!((u.anyOpen && u.anyOpen()) || (u.confirmOpen && u.confirmOpen()) || document.documentElement.classList.contains('locked')
          || document.querySelector('.dp.show, .cam.show, .pv.show'));
      }
      function dockState(page){
        var d2 = document.getElementById('dock2'), pt = document.getElementById('ptTime');
        if (!d2 || !pt) return null;
        var ap = pt.querySelector('small'), apt = ap ? ap.textContent : ''; var pg = document.getElementById('pager');
        return { t: pt.textContent.replace(apt, '').trim(), ap: apt, today: page === 'today', back: ((document.getElementById('ptBackTxt') || {}).textContent || '').trim() || '日历',
                 pager: !!pg && !pg.classList.contains('hide'), n: pg ? (+pg.dataset.n || 2) : 2, p: pg ? (+pg.dataset.p || 0) : 0, set: page === 'set', st: !!document.getElementById('fanStat') && !document.getElementById('fanStat').hidden, lit: !(document.getElementById('pager') || {classList: {contains: function(){ return false; }}}).classList.contains('idle'), pv: document.body.classList.contains('dock-pv') ? (parseFloat(document.body.style.getPropertyValue('--d2-pv')) || 0) : -1 };
      }
      function backShown(page){
        var id = page === 'cal' ? 'calBack' : page === 'sched' ? 'schedBack' : '', b = id && document.getElementById(id);
        return !!b && !b.hidden;
      }
      function send(){
        var tabs = [].map.call(tb.querySelectorAll('button[data-page]'), function(b){
          var l = b.querySelector('span:not(.tab-avatar)'); return { page: b.dataset.page, label: l ? l.textContent.trim() : '', hidden: !!b.hidden };
        });
        var page = document.body.dataset.page || 'cal', fab = document.getElementById('fab');
        var j = JSON.stringify({ tabs: tabs, page: page, fab: page !== 'set' && !!fab && !fab.hidden, cover: covered(), back: backShown(page), add: addRow(), dock: dockState(page) });
        if (j !== last) { last = j; try { H.postMessage({ name: 'nav', args: [j] }); } catch (e) {} }
      }
      new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
      new MutationObserver(send).observe(tb, { attributes: true, subtree: true, childList: true, characterData: true });
      var cb = document.getElementById('calBack'); if (cb) new MutationObserver(send).observe(cb, { attributes: true, attributeFilter: ['hidden'] }); // 「回到今天」出现 / 消失
      var sb = document.getElementById('schedBack'); if (sb) new MutationObserver(send).observe(sb, { attributes: true, attributeFilter: ['hidden'] }); // 日程页「回到本周」
      new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] }); // 日卡片打开时底栏挪进卡片
      var pgr = document.getElementById('pager'); if (pgr) new MutationObserver(send).observe(pgr, { attributes: true, attributeFilter: ['class', 'data-p', 'data-n'] }); // 分页点亮起 / 淡下、拖动时跟着走、页数
      var ptm = document.getElementById('ptTime'); if (ptm) new MutationObserver(send).observe(ptm, { childList: true, subtree: true, characterData: true }); // 时钟每分钟变一次
      new MutationObserver(send).observe(document.body, { attributes: true, attributeFilter: ['data-kind'] }); // 切到纪念日历：换回旧菜单栏
      var bs = document.getElementById('batchSheet'); if (bs) new MutationObserver(send).observe(bs, { attributes: true, attributeFilter: ['class', 'style'] });
      // 面板、确认框开关：类名变化时发一次（iPhone 的面板从底部弹出，玻璃菜单栏先让开）
      new MutationObserver(send).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
      if (window.MC && MC.UI && MC.UI.menu) {
        var cbs = {}, seq = 0;
        MC.UI.menu = function(anchor, items, cb){
          var r = anchor.getBoundingClientRect(), id = String(++seq);
          cbs[id] = { items: items, cb: cb };
          H.postMessage({ name: 'menu', args: [id, JSON.stringify(items.map(function(it){ return { label: String(it.label), on: !!it.on, danger: !!it.danger, sw: it.swatch ? String(it.swatch) : '' }; })), r.left, r.top, r.width, r.height] });
        };
        MC.UI.closeMenu = function(){};
        window.__mcMenuPick = function(id, i){ var m = cbs[id]; delete cbs[id]; if (m && i >= 0 && m.cb) m.cb(m.items[i].value, m.items[i]); };
      }
      send(); setTimeout(send, 600);
      if (window.MC && MC.LG) MC.LG.start(function(j){ try { H.postMessage({ name: 'lg', args: [j] }); } catch (e) {} }); // 玻璃控件换成原生液态玻璃
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
        case "lg": nav.updateLG(s(0))
        case "menu": nav.showMenu(id: s(0), json: s(1), anchor: CGRect(x: d(2), y: d(3), width: d(4), height: d(5)))
        case "http": let cb = s(1), req = s(0); Task { callback(cb, await NativeHTTP.run(req)) }
        case "icloudChoose": let cb = s(0); CloudSync.shared.choose { [weak self] r in self?.callback(cb, r) }
        case "icloudRead": callback(s(1), CloudSync.shared.read(ifNot: s(0)))
        case "icloudWrite": callback(s(1), CloudSync.shared.write(s(0)))
        case "sysCalRead": let cb = s(1), j = s(0); Task { callback(cb, await SysCal.read(j)) }   // 导入：读系统日历
        case "drawer": nav.openDrawer()
        case "devRot": watchRotation(b(0))
        case "drawerPull": // 手指从网页里拉侧栏：开始 / 拉到哪 / 松手时的速度
            switch s(0) { case "begin": nav.pullBegin(); case "move": nav.pullMove(d(1)); default: nav.pullEnd(d(2)) }
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

    // 纪念日历的透明相机：节律自己的网页直接允许（不再多弹一个「允许 xxx 使用相机」的网页框；第一次用时系统自己会问一次相机权限）
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let own = origin.host == appURL.host || origin.host == webView.url?.host
        decisionHandler(own && type == .camera ? .grant : .deny)
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
