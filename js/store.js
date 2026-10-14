/* 月历 · 数据层：本地存储、合并、加密令牌、GitHub Gist 同步 */
(() => {
  'use strict';
  const MC = (window.MC = {});
  MC.VERSION = '0.7.2';

  const DATA_KEY = 'mcal.data.v1';
  const SET_KEY = 'mcal.settings.v1';
  const GIST_FILE = 'mcal-calendar.json';
  const GIST_DESC = '月历 App 数据（请勿手动修改）';

  // ---------- 优先级 ----------
  MC.PRI = [
    { v: 3, name: '高', full: '高优先级', quad: '重要且紧急', roman: 'Ⅰ', color: 'var(--p3)' },
    { v: 2, name: '中', full: '中优先级', quad: '重要不紧急', roman: 'Ⅱ', color: 'var(--p2)' },
    { v: 1, name: '低', full: '低优先级', quad: '不重要但紧急', roman: 'Ⅲ', color: 'var(--p1)' },
    { v: 0, name: '无', full: '无优先级', quad: '不重要不紧急', roman: 'Ⅳ', color: 'var(--p0)' },
  ];
  MC.priOf = v => MC.PRI.find(p => p.v === v) || MC.PRI[3];

  // ---------- 工具 ----------
  const pad = (MC.pad = n => String(n).padStart(2, '0'));
  const ymd = (MC.ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  const parse = (MC.parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); });
  MC.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  MC.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  MC.todayStr = () => ymd(new Date());
  MC.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  MC.weekStartOf = d => MC.addDays(d, -((d.getDay() - MC.settings.weekStart + 7) % 7));
  MC.WD = ['日', '一', '二', '三', '四', '五', '六'];
  MC.dayDiff = ds => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parse(ds) - t) / 864e5); };
  MC.relLabel = ds => {
    const n = MC.dayDiff(ds);
    return n === 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : n === -1 ? '昨天' : n > 0 ? `${n} 天后` : `${-n} 天前`;
  };
  MC.dateLabel = ds => { const d = parse(ds); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  MC.REPEATS = [
    { v: 'none', label: '不重复' }, { v: 'day', label: '每天' }, { v: 'week', label: '每周' },
    { v: '2week', label: '每两周' }, { v: 'month', label: '每月' }, { v: 'year', label: '每年' },
  ];
  MC.repeatLabel = v => (MC.REPEATS.find(r => r.v === v) || MC.REPEATS[0]).label;
  MC.defaultUntil = (ds, mode) => {
    const d = parse(ds);
    const add = { day: [0, 1], week: [0, 3], '2week': [0, 6], month: [1, 0], year: [5, 0] }[mode] || [0, 3];
    return ymd(new Date(d.getFullYear() + add[0], d.getMonth() + add[1], d.getDate()));
  };
  MC.repeatDates = (start, mode, until) => {
    if (!mode || mode === 'none' || !until || until < start) return [start];
    const s = parse(start), end = parse(until), out = [];
    for (let i = 0; i < 400; i++) {
      let d;
      if (mode === 'day') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
      else if (mode === 'week') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * 7);
      else if (mode === '2week') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * 14);
      else if (mode === 'month') { d = new Date(s.getFullYear(), s.getMonth() + i, s.getDate()); if (d.getDate() !== s.getDate()) continue; }
      else { d = new Date(s.getFullYear() + i, s.getMonth(), s.getDate()); if (d.getMonth() !== s.getMonth()) continue; }
      if (d > end) break;
      out.push(ymd(d));
    }
    return out;
  };
  // 提醒：带时间的事件以开始时间为准，全天事件以当天 9:00 为准；数值为提前的分钟数
  MC.remindOptions = hasTime => hasTime
    ? [{ v: null, label: '无' }, { v: 0, label: '准时' }, { v: 5, label: '提前 5 分钟' }, { v: 15, label: '提前 15 分钟' },
       { v: 30, label: '提前 30 分钟' }, { v: 60, label: '提前 1 小时' }, { v: 1440, label: '提前 1 天' }]
    : [{ v: null, label: '无' }, { v: 0, label: '当天 9:00' }, { v: 1440, label: '提前 1 天 9:00' },
       { v: 2880, label: '提前 2 天 9:00' }, { v: 10080, label: '提前 1 周 9:00' }];
  MC.remindLabel = (v, hasTime) => {
    if (v === null || v === undefined) return '无';
    const o = MC.remindOptions(hasTime).find(x => x.v === v);
    return o ? o.label : `提前 ${v} 分钟`;
  };
  MC.fireTime = e => {
    if (e.remind === null || e.remind === undefined) return null;
    const [y, m, d] = e.date.split('-').map(Number);
    const [h, mi] = (e.time || '09:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime() - e.remind * 60000;
  };
  MC.endDate = e => (e.days > 1 ? ymd(MC.addDays(parse(e.date), e.days - 1)) : e.date);
  MC.timeLabel = e => e.time ? (e.endTime ? `${e.time}–${e.endTime}` : e.time) : '';

  // ---------- 数据 ----------
  function blank() { return { version: 3, updatedAt: 0, events: [], deleted: {}, profile: { name: '', avatar: '', updatedAt: 0 }, daily: { on: false, time: '13:00', tz: '', updatedAt: 0 } }; }
  function normEvent(e) {
    const t = Date.now();
    return {
      id: e.id || MC.uid(), date: e.date, title: String(e.title || '').slice(0, 200),
      priority: [0, 1, 2, 3].includes(Number(e.priority)) ? Number(e.priority) : 0,
      done: !!e.done, note: String(e.note || ''),
      time: /^\d{2}:\d{2}$/.test(e.time || '') ? e.time : '',
      endTime: /^\d{2}:\d{2}$/.test(e.endTime || '') && e.time ? e.endTime : '',
      remind: e.remind === null || e.remind === undefined || e.remind === '' ? null : Number(e.remind),
      days: /^\d{2}:\d{2}$/.test(e.time || '') ? 1 : Math.max(1, Math.min(60, parseInt(e.days, 10) || 1)),
      series: e.series || '',
      rep: e.rep && e.rep.freq ? { freq: e.rep.freq, forever: !!e.rep.forever } : null,
      createdAt: e.createdAt || t, updatedAt: e.updatedAt || e.createdAt || t,
    };
  }
  MC.normalize = d => {
    const out = blank();
    out.updatedAt = d.updatedAt || 0;
    out.deleted = d.deleted || {};
    out.events = (d.events || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map(normEvent);
    if (d.profile) out.profile = { name: d.profile.name || '', avatar: d.profile.avatar || '', updatedAt: d.profile.updatedAt || 0 };
    if (d.daily) out.daily = { on: !!d.daily.on, time: /^\d{2}:\d{2}$/.test(d.daily.time || '') ? d.daily.time : '13:00', tz: d.daily.tz || '', updatedAt: d.daily.updatedAt || 0 };
    return out;
  };
  function loadData() {
    try { const d = JSON.parse(localStorage.getItem(DATA_KEY)); if (d && Array.isArray(d.events)) return MC.normalize(d); } catch (e) {}
    return blank();
  }
  MC.data = loadData();
  MC.newEvent = fields => normEvent({ ...fields, id: MC.uid(), createdAt: Date.now(), updatedAt: Date.now() });
  MC.makeEvent = fields => normEvent({ ...fields, createdAt: Date.now(), updatedAt: Date.now() }); // 保留传入的 id
  // 「一直重复」的事件：提前生成一段时间的副本，快用完时自动续上（id 固定，多台设备不会重复生成）
  MC.HORIZON = { day: 400, week: 730, '2week': 730, month: 1825, year: 7300 };
  MC.extendSeries = () => {
    const last = new Map();
    for (const e of MC.data.events) if (e.series && e.rep && e.rep.forever) { const g = last.get(e.series); if (!g || e.date > g.date) last.set(e.series, e); }
    const have = new Set(MC.data.events.map(e => e.id)), add = [], today = new Date();
    for (const [sid, e] of last) {
      const h = MC.HORIZON[e.rep.freq] || 730;
      if (e.date >= ymd(MC.addDays(today, h / 2))) continue;
      for (const ds of MC.repeatDates(e.date, e.rep.freq, ymd(MC.addDays(today, h))).slice(1)) {
        const id = `${sid}-${ds}`;
        if (have.has(id) || MC.data.deleted[id]) continue;
        add.push(MC.makeEvent({ id, date: ds, title: e.title, note: e.note, priority: e.priority, days: e.days, time: e.time, endTime: e.endTime, remind: e.remind, series: sid, rep: e.rep, done: false }));
      }
    }
    if (add.length) MC.addEvents(add);
  };

  MC.settings = Object.assign(
    { theme: 'auto', weekStart: 0, view: 'month', gistId: '', lastSync: 0, vault: null, tokenPlain: '', quadShowDone: false, notify: false, vapidPrivate: '', deviceId: '', account: '' },
    JSON.parse(localStorage.getItem(SET_KEY) || '{}')
  );
  // 从 0.1 版迁移：旧版本明文保存在 token 字段
  if (MC.settings.token && !MC.settings.vault && !MC.settings.tokenPlain) MC.settings.tokenPlain = MC.settings.token;
  delete MC.settings.token;

  MC.saveData = () => localStorage.setItem(DATA_KEY, JSON.stringify(MC.data));
  MC.saveSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(MC.settings));
  MC.saveSettings();

  const cmp = (a, b) => (a.done - b.done) || (b.priority - a.priority) || ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) || (a.createdAt - b.createdAt);
  MC.cmp = cmp;
  MC.byDate = new Map();
  MC.reindex = () => {
    MC.byDate = new Map();
    for (const e of MC.data.events) {
      const n = e.days > 1 ? e.days : 1, d0 = parse(e.date);
      for (let k = 0; k < n; k++) { // 多天的全天事件出现在跨越的每一天
        const ds = k ? ymd(MC.addDays(d0, k)) : e.date;
        if (!MC.byDate.has(ds)) MC.byDate.set(ds, []);
        MC.byDate.get(ds).push(e);
      }
    }
    for (const arr of MC.byDate.values()) arr.sort(cmp);
  };
  MC.reindex();
  MC.eventsOn = ds => MC.byDate.get(ds) || [];

  MC.onChange = () => {};
  MC.dirty = false;
  MC.commit = () => {
    MC.dirty = true;
    MC.data.updatedAt = Date.now();
    MC.saveData(); MC.reindex();
    MC.onChange();
    MC.scheduleSync();
  };
  MC.addEvents = list => { MC.data.events.push(...list); MC.commit(); };
  MC.updateEvent = (ev, fields) => { Object.assign(ev, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.deleteEvent = ev => {
    MC.data.events = MC.data.events.filter(e => e.id !== ev.id);
    MC.data.deleted[ev.id] = Date.now();
    MC.commit();
  };
  MC.setProfile = fields => { Object.assign(MC.data.profile, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.setDaily = fields => { Object.assign(MC.data.daily, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.currentTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };

  // ---------- 合并 ----------
  MC.merge = (a, b) => {
    const deleted = { ...(a.deleted || {}) };
    for (const [k, t] of Object.entries(b.deleted || {})) deleted[k] = Math.max(deleted[k] || 0, t);
    const map = new Map();
    for (const e of [...a.events, ...b.events]) {
      const old = map.get(e.id);
      if (!old || (e.updatedAt || 0) > (old.updatedAt || 0)) map.set(e.id, { ...e });
    }
    const events = [...map.values()].filter(e => !(deleted[e.id] && deleted[e.id] >= (e.updatedAt || 0)));
    const cutoff = Date.now() - 180 * 864e5;
    for (const k of Object.keys(deleted)) if (deleted[k] < cutoff) delete deleted[k];
    const pa = a.profile || {}, pb = b.profile || {};
    const profile = (pb.updatedAt || 0) > (pa.updatedAt || 0) ? { ...pb } : { ...pa };
    const da = a.daily || {}, db = b.daily || {};
    const daily = (db.updatedAt || 0) > (da.updatedAt || 0) ? { ...db } : { ...(a.daily || blank().daily) };
    return { version: 3, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0), events, deleted, profile, daily };
  };
  function signature(d) {
    const ev = [...d.events].sort((x, y) => (x.id < y.id ? -1 : 1))
      .map(e => [e.id, e.date, e.days, e.rep && e.rep.forever, e.title, e.priority, e.done, e.note, e.time, e.endTime, e.remind, e.updatedAt]);
    return JSON.stringify([ev, Object.keys(d.deleted || {}).sort(), (d.profile || {}).updatedAt || 0, (d.daily || {}).updatedAt || 0]);
  }

  // ---------- 加密保存令牌 ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function deriveKey(pw, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  MC.session = { token: MC.settings.tokenPlain || '' };
  MC.vault = {
    has: () => !!MC.settings.vault,
    connected: () => !!(MC.settings.vault || MC.settings.tokenPlain),
    locked: () => !!MC.settings.vault && !MC.session.token,
    async save(token, pw) {
      if (pw) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(pw, salt);
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
        MC.settings.vault = { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
        MC.settings.tokenPlain = '';
      } else {
        MC.settings.vault = null;
        MC.settings.tokenPlain = token;
      }
      MC.session.token = token;
      MC.saveSettings();
    },
    async unlock(pw) {
      const v = MC.settings.vault;
      if (!v) return MC.settings.tokenPlain;
      try {
        const key = await deriveKey(pw, unb64(v.salt));
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct));
        MC.session.token = dec.decode(pt);
        return MC.session.token;
      } catch (e) { throw new Error('密码不正确'); }
    },
    lock() { if (MC.settings.vault) MC.session.token = ''; },
    disconnect() {
      MC.settings.vault = null; MC.settings.tokenPlain = ''; MC.settings.gistId = ''; MC.settings.lastSync = 0;
      MC.session.token = ''; MC.saveSettings();
    },
  };

  // ---------- GitHub Gist ----------
  const gh = MC.gh = async function (path, opts = {}, token = MC.session.token) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com' + path, { ...opts, headers, cache: 'no-store' });
    if (!r.ok) {
      throw new Error(r.status === 401 ? '令牌无效或已过期'
        : r.status === 403 ? '令牌没有勾选 gist 权限，或请求过于频繁'
        : r.status === 404 ? '找不到同步数据（Gist 已被删除，或令牌属于另一个账号）'
        : `GitHub 返回 ${r.status}`);
    }
    const t = await r.text();
    return t ? JSON.parse(t) : {};
  };
  MC.findGist = async (token = MC.session.token) => {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`, {}, token);
      const hit = list.find(g => g.files && g.files[GIST_FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return '';
  };
  // 带 ETag 的条件请求：云端没变化时只返回 304，又快又不占额度
  let etag = '', lastRemote = null;
  async function readGist(id) {
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + MC.session.token };
    if (etag && lastRemote) headers['If-None-Match'] = etag;
    const r = await fetch('https://api.github.com/gists/' + id, { headers, cache: 'no-store' });
    if (r.status === 304 && lastRemote) return { remote: lastRemote, unchanged: true };
    if (!r.ok) {
      throw new Error(r.status === 401 ? '令牌无效或已过期' : r.status === 404 ? '找不到同步数据（Gist 已被删除，或令牌属于另一个账号）' : r.status === 403 ? '令牌没有勾选 gist 权限，或请求过于频繁' : `GitHub 返回 ${r.status}`);
    }
    const g = await r.json();
    const f = g.files && g.files[GIST_FILE];
    if (!f) throw new Error('这个 Gist 里没有月历数据');
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    etag = r.headers.get('ETag') || '';
    lastRemote = MC.normalize(JSON.parse(text));
    return { remote: lastRemote, unchanged: false };
  }
  async function writeGist(d) {
    const body = { files: { [GIST_FILE]: { content: JSON.stringify(d) } } };
    if (MC.settings.gistId) {
      await gh('/gists/' + MC.settings.gistId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ ...body, description: GIST_DESC, public: false }) });
      MC.settings.gistId = g.id; MC.saveSettings();
    }
  }

  // ---------- iPhone 日历订阅（ICS） ----------
  const ICS_FILE = 'mcal-calendar.ics';
  MC.ICS_FILE = ICS_FILE;
  const icsEsc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = ds => ds.replace(/-/g, '');
  const dur = min => { const neg = min < 0; min = Math.abs(min); const h = Math.floor(min / 60), m = min % 60; return `${neg ? '-' : ''}PT${h ? h + 'H' : ''}${m || !h ? m + 'M' : ''}`; };
  const stampOf = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  MC.buildICS = d => {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Month Calendar//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:月历提醒', 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
    const from = ymd(MC.addDays(new Date(), -2)), to = ymd(MC.addDays(new Date(), 400));
    const stamp = stampOf(Date.now());
    const alarm = (trigger, text) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(text), 'TRIGGER:' + trigger, 'END:VALARM'];
    for (const e of d.events) {
      if (e.done || e.remind === null || e.remind === undefined || e.date < from || e.date > to) continue;
      L.push('BEGIN:VEVENT', `UID:${e.id}@mcal`, 'DTSTAMP:' + stamp, 'SUMMARY:' + icsEsc(e.title));
      if (e.note) L.push('DESCRIPTION:' + icsEsc(e.note));
      if (e.time) {
        const st = icsDate(e.date) + 'T' + e.time.replace(':', '') + '00';
        let en = e.endTime;
        if (!en) { const [h, m] = e.time.split(':').map(Number); const t = h * 60 + m + 30; en = t >= 1440 ? '23:59' : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; }
        L.push('DTSTART:' + st, 'DTEND:' + icsDate(e.date) + 'T' + en.replace(':', '') + '00'); // 浮动时间 = 手机当前所在时区
        L.push(...alarm(dur(-e.remind), e.title));
      } else {
        L.push('DTSTART;VALUE=DATE:' + icsDate(e.date), 'DTEND;VALUE=DATE:' + icsDate(ymd(MC.addDays(parse(e.date), 1))));
        L.push(...alarm(dur(9 * 60 - e.remind), e.title)); // 全天事件：以当天 9:00 为准
      }
      L.push('END:VEVENT');
    }
    const dl = d.daily || {};
    if (dl.on) {
      const day = ymd(MC.addDays(new Date(), -1));
      L.push('BEGIN:VEVENT', 'UID:daily@mcal', 'DTSTAMP:' + stamp, 'SUMMARY:查看今日未完成事件',
        'DTSTART:' + icsDate(day) + 'T' + dl.time.replace(':', '') + '00', 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
        ...alarm('PT0M', '查看今日未完成事件'), 'END:VEVENT');
    }
    const t = MC.settings.icsTestAt;
    if (t && t > Date.now()) {
      const dt = new Date(t), st = icsDate(ymd(dt)) + 'T' + pad(dt.getHours()) + pad(dt.getMinutes()) + '00';
      L.push('BEGIN:VEVENT', `UID:test-${t}@mcal`, 'DTSTAMP:' + stamp, 'SUMMARY:月历订阅提醒测试', 'DTSTART:' + st, 'DURATION:PT5M',
        ...alarm('PT0M', '订阅成功，提醒可以正常弹出'), 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  };
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); };
  // iOS 日历订阅已停用：只把订阅文件清空一次，让已订阅的设备里那些条目消失，之后不再写入
  async function ensureICS() {
    if (!MC.settings.gistId || MC.settings.icsCleared) return;
    const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Month Calendar//CN\r\nX-WR-CALNAME:月历提醒\r\nEND:VCALENDAR\r\n';
    await gh('/gists/' + MC.settings.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [ICS_FILE]: { content: empty } } }) });
    MC.settings.icsCleared = true; MC.saveSettings();
  }
  MC.icsURL = () => MC.settings.account && MC.settings.gistId
    ? `https://gist.githubusercontent.com/${MC.settings.account}/${MC.settings.gistId}/raw/${ICS_FILE}` : '';
  MC.pushICS = async () => { MC.settings.icsHash = ''; await ensureICS(MC.data); };

  MC.syncState = { busy: false, error: '' };
  MC.onSyncStatus = () => {};
  let again = false, timer = null;
  MC.scheduleSync = () => {
    if (!MC.session.token) return;
    clearTimeout(timer);
    timer = setTimeout(() => MC.sync(), 500);
  };
  MC.sync = async () => {
    if (!MC.session.token) return false;
    if (MC.syncState.busy) { again = true; return false; }
    if (!navigator.onLine) { MC.syncState.error = '当前离线，联网后会自动同步'; MC.onSyncStatus(); return false; }
    MC.syncState.busy = true; MC.onSyncStatus();
    let ok = false;
    try {
      if (!MC.settings.gistId) { MC.settings.gistId = await MC.findGist(); MC.saveSettings(); }
      let remote = null;
      if (MC.settings.gistId) {
        const res = await readGist(MC.settings.gistId);
        remote = res.remote;
        if (res.unchanged && !MC.dirty) { // 两边都没变化，直接结束
          await ensureICS(MC.data);
          MC.settings.lastSync = Date.now(); MC.saveSettings(); MC.syncState.error = ''; ok = true;
          return ok;
        }
      }
      const merged = remote ? MC.merge(MC.data, remote) : MC.data;
      if (signature(merged) !== signature(MC.data)) {
        MC.data = merged; MC.saveData(); MC.reindex(); MC.onChange();
      }
      if (!remote || signature(merged) !== signature(remote)) {
        const out = { ...merged, updatedAt: Date.now() };
        MC.dirty = false;
        await writeGist(out);
        lastRemote = MC.normalize(out); etag = ''; // 下次重新取一次新的 ETag
      } else MC.dirty = false;
      await ensureICS(merged);
      MC.settings.lastSync = Date.now(); MC.saveSettings();
      MC.syncState.error = ''; ok = true;
    } catch (e) {
      MC.syncState.error = e.message || '同步失败';
    } finally {
      MC.syncState.busy = false; MC.onSyncStatus();
      if (again) { again = false; MC.sync(); }
    }
    return ok;
  };
})();
