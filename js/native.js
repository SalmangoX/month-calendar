/* 月历 · 原生 App 桥接（安卓 App 和 Mac App 共用）
 * 只在原生 App（仓库 android / macos 文件夹编译出的 App）里生效：把数据和设置交给原生端，
 * 用于桌面小组件和系统级的准时提醒。浏览器和 iPhone 上没有 window.MCNative，这个文件什么都不做。
 * info().platform：'android'（旧版 App 没有这个字段，也当安卓）或 'mac'。
 *
 * 版本适配：App 通过 info() 报告自己的版本、接口版本和支持的功能。
 *   - 新功能用 MC.Native.has('功能名') 判断，旧版 App 没有就自动不显示。
 *   - 只有删改了已有的原生方法时，才需要把下面的 NEED_BRIDGE 加一，旧版 App 会提示更新。
 */
(() => {
  'use strict';
  const MC = window.MC;
  const N = window.MCNative;
  const NEED_BRIDGE = 1;
  const Native = (MC.Native = { on: false, info: {}, has: () => false, outdated: false });
  if (!N || typeof N.info !== 'function') return;

  let info = {};
  try { info = JSON.parse(N.info()) || {}; } catch (e) {}
  const feats = new Set(info.features || []);
  const platform = info.platform || 'android';
  Object.assign(Native, {
    on: true,
    info,
    platform,
    mac: platform === 'mac',
    has: f => feats.has(f),
    outdated: (info.bridge || 0) < NEED_BRIDGE,
    repo: info.repo || '',
  });
  document.documentElement.classList.add(platform === 'mac' ? 'in-mac' : 'in-android');

  const call = (name, ...args) => {
    try { return typeof N[name] === 'function' ? N[name](...args) : undefined; } catch (e) { return undefined; }
  };
  // 需要等结果的调用（权限、保存文件）：原生端处理完后调用 __mcNativeCb 回来
  let seq = 0;
  const waits = {};
  window.__mcNativeCb = (id, res) => {
    const w = waits[id]; delete waits[id];
    if (!w) return;
    let v = null; try { v = JSON.parse(res); } catch (e) {}
    w(v);
  };
  Native.ask = (name, ...args) => new Promise(resolve => {
    if (typeof N[name] !== 'function') { resolve(null); return; }
    const id = 'n' + (++seq);
    waits[id] = resolve;
    try { N[name](...args, id); } catch (e) { delete waits[id]; resolve(null); }
  });
  Native.status = () => { try { return JSON.parse(N.status()) || {}; } catch (e) { return {}; } };
  Native.request = kind => Native.ask('request', kind);
  Native.test = () => call('test');
  Native.testLater = sec => call('testLater', sec);
  Native.openUrl = url => call('openUrl', url);
  Native.pinWidget = kind => !!call('pinWidget', kind);
  Native.saveFile = (name, mime, text) => Native.ask('saveFile', name, mime, text);
  Native.syncNow = () => call('syncNow');
  // 完成反馈：响铃模式才允许出声；旧版 App 判断不了，就不出声
  Native.soundAllowed = () => (feats.has('feedback') ? !!call('soundAllowed') : false);
  Native.haptic = () => (feats.has('feedback') ? (call('haptic'), true) : false);

  // ---------- 数据：每次保存后（稍等一下合并多次改动）交给原生端 ----------
  let dataTimer = 0;
  const pushData = () => {
    clearTimeout(dataTimer);
    dataTimer = setTimeout(() => call('setData', JSON.stringify(MC.data), false), 400);
  };
  const saveData = MC.saveData;
  MC.saveData = () => { saveData(); pushData(); };

  // ---------- 设置 ----------
  let lastPrefs = '';
  const pushPrefs = () => {
    const S = MC.settings;
    const p = JSON.stringify({ weekStart: S.weekStart, theme: S.theme, notify: !!S.notify, gistId: S.gistId || '', account: S.account || '' });
    if (p === lastPrefs) return;
    lastPrefs = p;
    call('setPrefs', p);
  };
  const saveSettings = MC.saveSettings;
  MC.saveSettings = () => { saveSettings(); pushPrefs(); };

  // ---------- 令牌：后台拉取其他设备的改动用（原生端用手机安全芯片加密保存） ----------
  let lastTok = null;
  const pushToken = () => {
    const t = MC.session.token || '';
    if (!t || t === lastTok) return;
    lastTok = t;
    call('setToken', t, MC.settings.gistId || '');
  };
  const V = MC.vault;
  const save = V.save, unlock = V.unlock, disconnect = V.disconnect;
  V.save = async (...a) => { const r = await save.apply(V, a); pushToken(); return r; };
  V.unlock = async (...a) => { const r = await unlock.apply(V, a); pushToken(); return r; };
  V.disconnect = (...a) => { disconnect.apply(V, a); lastTok = ''; call('clearAccount', false); };
  // 「断开并清除本机数据」：原生端的数据也一起清掉
  Native.wipe = () => { clearTimeout(dataTimer); call('clearAccount', true); call('setData', JSON.stringify(MC.data), true); };

  pushPrefs();
  pushToken();
  pushData();

  // ---------- App 更新：APK 发布在仓库的 Releases，版本号就是 Actions 的运行序号（Mac App 在本机编译，不检查） ----------
  const UKEY = 'mcal.apkCheck';
  Native.apkUrl = () => `https://github.com/${Native.repo}/releases/latest/download/month-calendar.apk`;
  Native.releasesUrl = () => `https://github.com/${Native.repo}/releases`;
  Native.lastCheck = () => { try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } };
  Native.updateAvailable = () => { const s = Native.lastCheck(); return s.latest > (info.code || 0) ? s : null; };
  Native.checkUpdate = async force => {
    const st = Native.lastCheck();
    if (!force && st.at && Date.now() - st.at < 6 * 3600e3) return Native.updateAvailable();
    if (!Native.repo) return null;
    const headers = { Accept: 'application/vnd.github+json' };
    if (MC.session.token) headers.Authorization = 'Bearer ' + MC.session.token;
    const r = await fetch(`https://api.github.com/repos/${Native.repo}/releases/latest`, { headers, cache: 'no-store' });
    if (r.status === 404) { localStorage.setItem(UKEY, JSON.stringify({ at: Date.now(), latest: 0 })); return null; }
    if (!r.ok) throw new Error(`GitHub 返回 ${r.status}`);
    const j = await r.json();
    // 标签形如 android-0.9.3-5；版本号缺失时（android--5）也要能认出第几版
    const m = /^android-(.*?)-?(\d+)$/.exec(j.tag_name || '');
    const name = (m && m[1]) || ((j.name || '').match(/App\s+([\d.]+)/) || [])[1] || '';
    localStorage.setItem(UKEY, JSON.stringify({ at: Date.now(), latest: m ? Number(m[2]) : 0, name: name || `第 ${m ? m[2] : '?'} 版` }));
    return Native.updateAvailable();
  };
  Native.update = () => Native.openUrl(Native.apkUrl());
})();
