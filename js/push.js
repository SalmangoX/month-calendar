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

  // 安卓 App 里：通知由原生端用系统精确闹钟弹出（App 关着、断网也准时），不需要网页推送和 GitHub 定时任务
  const NATIVE = !!(MC.Native && MC.Native.on);
  Push.native = NATIVE;
  if (NATIVE) {
    const N = MC.Native;
    Push.supported = () => true;
    Push.pushSupported = () => false;
    Push.permission = () => N.status().notif || 'default';
    Push.remoteReady = () => Push.enabled();
  }

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
      h12: MC.use12(), // 推送里的时间按这台设备的 12 / 24 小时制显示
    });
    await writeSubs(info);
    MC.settings.pushReady = true;
    MC.settings.subTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; // 记录推送用的时区
    MC.settings.subH12 = MC.use12();
    MC.saveSettings();
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

  if (NATIVE) {
    const N = MC.Native;
    Push.enable = async () => {
      const st = await N.request('notif');
      if (!st || st.notif !== 'granted') throw new Error('通知权限没有打开。请在系统设置 → 应用程序 → 月历 → 通知 中允许');
      MC.settings.notify = true; MC.saveSettings();
      return true;
    };
    Push.disable = async () => { MC.settings.notify = false; MC.settings.pushReady = false; MC.saveSettings(); };
    Push.resubscribe = () => Promise.resolve(false);
    Push.regenerate = async () => false;
    Push.test = async () => { N.test(); };
  }

  // ---------- 一键设置后台提醒（用一个临时令牌自动完成 GitHub 那几步） ----------
  Push.SETUP_TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=' + encodeURIComponent('月历提醒设置（用完可删除）');
  Push.guessRepo = () => {
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return '';
    const owner = host.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return seg && !seg.includes('.') ? `${owner}/${seg}` : `${owner}/${host}`;
  };
  async function api(path, opts, token) {
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token };
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com' + path, { ...(opts || {}), headers, cache: 'no-store' });
    const t = await r.text();
    let data = {}; try { data = t ? JSON.parse(t) : {}; } catch (e) {}
    return { status: r.status, data };
  }
  const b64utf8 = str => btoa(unescape(encodeURIComponent(str)));
  let naclLib = null;
  async function seal(value, keyB64) {
    // 与 libsodium crypto_box_seal 相同（GitHub Secrets 要求的加密方式）
    if (!naclLib) {
      const [n, b] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm'),
        import('https://cdn.jsdelivr.net/npm/blakejs@1.2.1/+esm'),
      ]);
      naclLib = { nacl: n.default || n, blake2b: b.blake2b || (b.default && b.default.blake2b) };
    }
    const { nacl, blake2b } = naclLib;
    const pk = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    const eph = nacl.box.keyPair();
    const both = new Uint8Array(64); both.set(eph.publicKey); both.set(pk, 32);
    const nonce = blake2b(both, undefined, 24);
    const box = nacl.box(new TextEncoder().encode(value), nonce, pk, eph.secretKey);
    const out = new Uint8Array(32 + box.length); out.set(eph.publicKey); out.set(box, 32);
    return btoa(String.fromCharCode(...out));
  }
  async function ensureFile(repo, path, srcUrl, branch, token) {
    const cur = await api(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {}, token);
    if (cur.status === 200) return;
    const text = await (await fetch(srcUrl + '?_=' + Date.now(), { cache: 'no-store' })).text();
    const r = await api(`/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: '添加月历提醒', content: b64utf8(text), branch }) }, token);
    if (r.status >= 300) throw new Error(r.status === 403 || r.status === 404 ? '临时令牌缺少 repo 或 workflow 权限' : `上传 ${path} 失败（${r.status}）`);
  }
  Push.setupRemote = async (token, repo, step) => {
    if (!Push.enabled()) throw new Error('请先打开「提醒通知」开关');
    if (!MC.session.token) throw new Error('请先连接 GitHub 同步');
    step('检查仓库…');
    const info = await api(`/repos/${repo}`, {}, token);
    if (info.status === 401) throw new Error('临时令牌无效');
    if (info.status === 404) throw new Error(`找不到仓库 ${repo}，请检查仓库名，或令牌没有勾选 repo`);
    if (info.status >= 300) throw new Error(`GitHub 返回 ${info.status}`);
    const branch = info.data.default_branch || 'main';
    step('准备通知密钥…');
    if (!MC.settings.vapidPrivate) await subscribe(true); else await subscribe(false);
    step('上传提醒程序…');
    await ensureFile(repo, 'scripts/send-reminders.mjs', 'scripts/send-reminders.mjs', branch, token);
    await ensureFile(repo, '.github/workflows/reminders.yml', 'scripts/reminders.yml', branch, token);
    step('写入密钥…');
    const pk = await api(`/repos/${repo}/actions/secrets/public-key`, {}, token);
    if (pk.status >= 300) throw new Error('无法读取仓库的密钥配置，请确认令牌勾选了 repo');
    for (const [name, value] of [['VAPID_PRIVATE_KEY', MC.settings.vapidPrivate], ['GIST_TOKEN', MC.session.token], ['GIST_ID', MC.settings.gistId]]) {
      const r = await api(`/repos/${repo}/actions/secrets/${name}`, { method: 'PUT', body: JSON.stringify({ encrypted_value: await seal(value, pk.data.key), key_id: pk.data.key_id }) }, token);
      if (r.status >= 300) throw new Error(`写入 ${name} 失败（${r.status}）`);
    }
    step('启动定时任务…');
    await api(`/repos/${repo}/actions/workflows/reminders.yml/enable`, { method: 'PUT' }, token);
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) { // 新建的工作流需要几秒才能被 GitHub 识别
      const r = await api(`/repos/${repo}/actions/workflows/reminders.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: branch }) }, token);
      ok = r.status === 204;
      if (!ok) await new Promise(res => setTimeout(res, 3000));
    }
    MC.settings.remoteSetup = { repo, at: Date.now() }; MC.saveSettings();
    return ok;
  };

  // ---------- App 打开时的本地提醒 ----------
  const LKEY = 'mcal.localSent';
  // 每日未完成提醒的内容
  Push.digest = ds => {
    const n = MC.mainOn(ds).filter(e => !e.done).length; // 每日提醒只统计主日历
    return n ? { title: '查看今日未完成事件', body: `今天还有 ${n} 件事未完成，点开查看。` }
             : { title: '今日事件已完成', body: '今天的事件都完成了。' };
  };
  Push.bodyFor = e => `${MC.dateLabel(e.date)} ${MC.timeLabel(e) || '全天'}${e.note ? ' · ' + e.note : ''}`;
  async function checkLocal() {
    if (NATIVE) return; // 安卓 App 由原生端提醒
    if (!Push.enabled() || !('serviceWorker' in navigator)) return;
    const now = Date.now();
    let sent = {};
    try { sent = JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) {}
    const due = [];
    for (const e of MC.data.events) {
      if (e.done || !MC.notifies(e)) continue; // 记录日历没开通知就不提醒
      const ft = MC.fireTime(e);
      if (ft === null || ft > now || ft < now - 3 * 60000) continue;
      const key = `${e.id}@${ft}`;
      if (sent[key]) continue;
      sent[key] = now; due.push([e, key]);
    }
    let daily = null;
    const dl = MC.data.daily;
    if (dl && dl.on) {
      const d = new Date(), [h, m] = dl.time.split(':').map(Number);
      const ft = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
      const key = 'daily@' + MC.todayStr();
      if (ft <= now && ft > now - 3 * 60000 && !sent[key]) { sent[key] = now; daily = key; }
    }
    for (const k of Object.keys(sent)) if (sent[k] < now - 3 * 864e5) delete sent[k];
    localStorage.setItem(LKEY, JSON.stringify(sent));
    if (!due.length && !daily) return;
    const reg = await navigator.serviceWorker.ready;
    if (daily) {
      const dg = Push.digest(MC.todayStr());
      reg.showNotification(dg.title, { body: dg.body, tag: daily, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#today' } });
    }
    for (const [e, key] of due) {
      reg.showNotification(e.title, { body: Push.bodyFor(e), tag: key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } });
    }
  }
  MC.onNotifyCheck = checkLocal;
  setInterval(() => { if (document.visibilityState === 'visible') checkLocal(); }, 20000);
})();
