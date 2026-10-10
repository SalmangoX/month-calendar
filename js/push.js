/* 月历 · 提醒通知
 * App 打开时：到点由本页直接弹出通知。
 * App 关闭时：订阅信息保存在 Gist（mcal-push-subs.json），由仓库里的 GitHub Actions 定时推送。
 */
(() => {
  'use strict';
  const MC = window.MC;
  const Push = (MC.Push = {});
  const SUBS_FILE = 'mcal-push-subs.json';

  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

  Push.supported = () => 'serviceWorker' in navigator && 'Notification' in window;
  Push.pushSupported = () => Push.supported() && 'PushManager' in window;
  Push.isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  Push.standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  Push.permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
  Push.enabled = () => !!MC.settings.notify && Push.permission() === 'granted';
  Push.remoteReady = () => Push.enabled() && !!MC.settings.pushReady;

  async function readSubs() {
    const g = await MC.gh('/gists/' + MC.settings.gistId);
    const f = g.files && g.files[SUBS_FILE];
    if (!f) return { publicKey: '', subject: '', subs: [] };
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    try { return JSON.parse(text); } catch (e) { return { publicKey: '', subject: '', subs: [] }; }
  }
  async function writeSubs(info) {
    await MC.gh('/gists/' + MC.settings.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [SUBS_FILE]: { content: JSON.stringify(info, null, 1) } } }) });
  }
  async function genVapid() {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    return { pub: b64url(raw), priv: jwk.d };
  }

  // 订阅推送并把订阅写入 Gist；regenerate=true 时重新生成通知密钥（其他设备需重新打开开关）
  async function subscribe(regenerate) {
    if (!Push.pushSupported() || !MC.session.token) return false;
    if (!MC.settings.gistId) { await MC.sync(); if (!MC.settings.gistId) return false; }
    const reg = await navigator.serviceWorker.ready;
    const info = await readSubs();
    if (!info.publicKey || regenerate) {
      const k = await genVapid();
      info.publicKey = k.pub;
      info.subs = [];
      MC.settings.vapidPrivate = k.priv;
      MC.saveSettings();
    }
    info.subject = location.origin + location.pathname.replace(/[^/]*$/, '');
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options && sub.options.applicationServerKey ? b64url(sub.options.applicationServerKey) : '';
      if (cur && cur !== info.publicKey) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(info.publicKey) });
    const j = sub.toJSON();
    if (!MC.settings.deviceId) MC.settings.deviceId = MC.uid();
    info.subs = (info.subs || []).filter(s => s.endpoint !== j.endpoint && s.device !== MC.settings.deviceId);
    info.subs.push({
      device: MC.settings.deviceId, endpoint: j.endpoint, keys: j.keys,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      ua: navigator.userAgent.slice(0, 120), addedAt: Date.now(),
    });
    await writeSubs(info);
    MC.settings.pushReady = true; MC.saveSettings();
    return true;
  }

  Push.enable = async () => {
    if (!Push.supported()) throw new Error('这个浏览器不支持通知');
    if (Push.isIOS && !Push.standalone()) throw new Error('iPhone 需要先「添加到主屏幕」，再从主屏幕图标打开月历，才能开启通知');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('通知权限被拒绝。请到系统设置 → 通知 → 月历 中允许通知');
    MC.settings.notify = true; MC.saveSettings();
    try { return await subscribe(false); }
    catch (e) { MC.settings.pushReady = false; MC.saveSettings(); throw new Error('通知已开启，但后台推送设置失败：' + e.message); }
  };
  Push.resubscribe = () => (Push.enabled() ? subscribe(false).catch(() => false) : Promise.resolve(false));
  Push.regenerate = () => subscribe(true);
  Push.disable = async () => {
    MC.settings.notify = false; MC.settings.pushReady = false; MC.saveSettings();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe();
        if (MC.session.token && MC.settings.gistId) {
          const info = await readSubs();
          info.subs = (info.subs || []).filter(s => s.endpoint !== ep && s.device !== MC.settings.deviceId);
          await writeSubs(info);
        }
      }
    } catch (e) {}
  };
  Push.test = async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('月历 · 测试通知', { body: '通知可以正常显示了', tag: 'mcal-test', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  };

  // ---------- App 打开时的本地提醒 ----------
  const LKEY = 'mcal.localSent';
  Push.bodyFor = e => `${MC.dateLabel(e.date)} ${MC.timeLabel(e) || '全天'}${e.note ? ' · ' + e.note : ''}`;
  async function checkLocal() {
    if (!Push.enabled() || !('serviceWorker' in navigator)) return;
    const now = Date.now();
    let sent = {};
    try { sent = JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) {}
    const due = [];
    for (const e of MC.data.events) {
      if (e.done) continue;
      const ft = MC.fireTime(e);
      if (ft === null || ft > now || ft < now - 3 * 60000) continue;
      const key = `${e.id}@${ft}`;
      if (sent[key]) continue;
      sent[key] = now; due.push([e, key]);
    }
    for (const k of Object.keys(sent)) if (sent[k] < now - 3 * 864e5) delete sent[k];
    localStorage.setItem(LKEY, JSON.stringify(sent));
    if (!due.length) return;
    const reg = await navigator.serviceWorker.ready;
    for (const [e, key] of due) {
      reg.showNotification(e.title, { body: Push.bodyFor(e), tag: key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } });
    }
  }
  MC.onNotifyCheck = checkLocal;
  setInterval(() => { if (document.visibilityState === 'visible') checkLocal(); }, 20000);
})();
