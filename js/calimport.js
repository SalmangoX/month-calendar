// 从其他日历导入：.ics 文件（苹果日历、谷歌、Outlook、飞书、钉钉、企业微信、QQ 邮箱…都能导出）、
// 谷歌日历的「私密 iCal 地址」、iPhone / Mac / 安卓 App 里直接读系统日历（手机里登录的 iCloud、谷歌、Outlook / Exchange 都在里面）。
// 三种来源先整理成同一种「每一次发生」的格式，再弹一个面板：每个来源日历 / 分类单独选导到主日历、新建一个子日历、已有的子日历，或者不导。
// 事件 id 由来源的 UID + 日期 + 钟点算出来：同一份再导一次不会重复（已经删掉的也不会再冒出来）。
(() => {
  const $ = s => document.querySelector(s);
  const esc = MC.esc;
  const UI = MC.UI;
  const PAST = 365, FUTURE = 730;   // 导入的时间范围：过去一年、未来两年（重复事件在这段里展开）
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const hash = s => { let h = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h = (h * 33) ^ c; h2 = (h2 * 33) ^ c; } return (h >>> 0).toString(36) + (h2 >>> 0).toString(36); };

  // ---------- .ics 解析 ----------
  // 时区：TZID 用浏览器自带的时区数据换算成本机时间；认不出的时区（比如 Outlook 的「China Standard Time」）当作本机时间
  const tzCache = {};
  function tzOffset(tz, utcMs) {   // 这个时区在 utcMs 时比 UTC 快多少毫秒
    let f = tzCache[tz];
    if (f === undefined) { try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { f = null; } tzCache[tz] = f; }
    if (!f) return null;
    const p = {}; f.formatToParts(new Date(utcMs)).forEach(x => (p[x.type] = x.value));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
  }
  // 「墙上时间」（事件自己那个时区里的年月日时分，用一个 UTC 的 Date 装着，方便按天、按周推算）→ 真正的时刻
  // 重复事件必须在事件自己的时区里按墙上时间展开（比如上海时间每周一 10 点），展开完再换成本机时间——不然星期几、日期会错
  function convOf(z, tz) {
    if (z) return w => new Date(w.getTime());   // UTC
    if (tz && tzOffset(tz, Date.now()) !== null) return w => { const g = w.getTime(), off = tzOffset(tz, g), off2 = tzOffset(tz, g - off); return new Date(g - off2); };
    return w => new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds());   // 浮动时间 / 全天：本机
  }
  const wkey = (w, allDay) => w.toISOString().slice(0, allDay ? 10 : 16);
  // 返回 { w: 墙上时间, conv, d: 本机时间的 Date, allDay }
  function parseDT(v, params) {
    v = (v || '').trim();
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!m) return null;
    const [, Y, Mo, D, h, mi, s, z] = m;
    const allDay = !h || params.VALUE === 'DATE';
    const w = new Date(Date.UTC(+Y, +Mo - 1, +D, allDay ? 0 : +h, allDay ? 0 : +mi, allDay ? 0 : +(s || 0)));
    const conv = convOf(!allDay && !!z, !allDay && params.TZID && params.TZID.replace(/^"|"$/g, ''));
    return { w, conv, d: conv(w), allDay };
  }
  const unesc = t => (t || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  function parseDur(v) {   // -PT15M / P1D / PT1H30M → 毫秒
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((v || '').trim());
    if (!m) return null;
    const ms = ((+m[2] || 0) * 7 * 864e5) + ((+m[3] || 0) * 864e5) + ((+m[4] || 0) * 36e5) + ((+m[5] || 0) * 6e4) + ((+m[6] || 0) * 1e3);
    return m[1] === '-' ? -ms : ms;
  }
  function parseICS(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    let calName = '', cur = null, inAlarm = false, depth = [];
    const vevents = [];
    for (const raw of lines) {
      if (!raw) continue;
      const i = raw.indexOf(':'); if (i < 0) continue;
      const head = raw.slice(0, i), val = raw.slice(i + 1);
      const parts = head.split(';'), name = parts[0].toUpperCase(), params = {};
      parts.slice(1).forEach(p => { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
      if (name === 'BEGIN') { depth.push(val.toUpperCase()); if (val.toUpperCase() === 'VEVENT') cur = { exdate: [], cats: [] }; if (val.toUpperCase() === 'VALARM') inAlarm = true; continue; }
      if (name === 'END') { const t = depth.pop(); if (t === 'VEVENT' && cur) { vevents.push(cur); cur = null; } if (t === 'VALARM') inAlarm = false; continue; }
      if (!cur) { if (name === 'X-WR-CALNAME' && !calName) calName = unesc(val).trim(); continue; }
      if (inAlarm) { if (name === 'TRIGGER' && cur.alarm === undefined && params.VALUE !== 'DATE-TIME') { const ms = parseDur(val); if (ms !== null && ms <= 0) cur.alarm = Math.round(-ms / 6e4); } continue; }
      if (name === 'SUMMARY') cur.title = unesc(val).trim();
      else if (name === 'DESCRIPTION') cur.note = unesc(val).trim();
      else if (name === 'LOCATION') cur.loc = unesc(val).trim();
      else if (name === 'UID') cur.uid = val.trim();
      else if (name === 'DTSTART') cur.start = parseDT(val, params);
      else if (name === 'DTEND') cur.end = parseDT(val, params);
      else if (name === 'DURATION') cur.dur = parseDur(val);
      else if (name === 'RRULE') cur.rrule = val.trim();
      else if (name === 'EXDATE') val.split(',').forEach(v => { const x = parseDT(v, params); if (x) cur.exdate.push(x); });
      else if (name === 'RECURRENCE-ID') cur.recurId = parseDT(val, params);
      else if (name === 'STATUS') cur.status = val.trim().toUpperCase();
      else if (name === 'CATEGORIES') unesc(val).split(',').map(x => x.trim()).filter(Boolean).forEach(x => cur.cats.push(x));
    }
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - PAST);
    const to = new Date(from); to.setDate(to.getDate() + PAST + FUTURE);
    // 改过某一次的重复事件（RECURRENCE-ID）：主事件展开时跳过那一次，改过的那条单独算
    const moved = new Map();
    // 按真正的时刻比（不同的写法、时区写的同一次也认得出来）
    const tkey = x => String(x.allDay ? ymd(x.d) : x.d.getTime());
    vevents.forEach(v => { if (v.recurId && v.uid) (moved.get(v.uid) || moved.set(v.uid, new Set()).get(v.uid)).add(tkey(v.recurId)); });
    const out = [];
    for (const v of vevents) {
      if (!v.start || v.status === 'CANCELLED') continue;
      const allDay = v.start.allDay;
      let len = v.end ? v.end.w - v.start.w : v.dur != null ? v.dur : (allDay ? 864e5 : 0);   // 用墙上时间算长度（跨夏令时也不会差一小时）
      if (len < 0) len = 0;
      const group = v.cats[0] || calName || '';
      const base = { uid: v.uid || hash((v.title || '') + v.start.d.getTime()), title: v.title || '', note: [v.note, v.loc].filter(Boolean).join('\n'), cal: group,
        remind: v.alarm != null && !allDay ? v.alarm : undefined, recur: !!v.rrule };
      const skip = new Set([...(v.exdate || []).map(tkey), ...(!v.recurId && moved.get(v.uid) ? moved.get(v.uid) : [])]);
      const walls = v.rrule && !v.recurId ? expand(v.start.w, v.rrule) : [v.start.w];
      for (const w of walls) {
        const s = v.start.conv(w), e = v.start.conv(new Date(w.getTime() + len));
        if (s < from || s > to) continue;
        if (skip.has(tkey({ d: s, allDay }))) continue;
        out.push(occ(base, s, e, allDay));
      }
    }
    return { name: calName, events: out };
  }
  // 一次发生 → 和原生返回的同一种格式
  function occ(base, s, e, allDay) {
    if (allDay) {
      const days = Math.max(1, Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / 864e5));
      return { ...base, allDay: true, date: ymd(s), days };
    }
    return { ...base, allDay: false, date: ymd(s), time: hm(s), endDate: ymd(e), endTime: hm(e) };
  }
  // RRULE 展开（常见的写法都覆盖：每天 / 每周几 / 每月第几天、第几个星期几 / 每年；INTERVAL、COUNT、UNTIL）
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  // start 是墙上时间（UTC 字段）；返回的也都是墙上时间。展开到「本机两年后」再多留两天，换算成本机时间后再按范围筛
  function expand(start, rule) {
    const r = {}; rule.split(';').forEach(p => { const k = p.indexOf('='); if (k > 0) r[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
    const freq = r.FREQ, iv = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0;
    const lim = new Date(); lim.setDate(lim.getDate() + FUTURE + 2);
    const untilW = r.UNTIL ? (parseDT(r.UNTIL, {}) || {}).w : null;   // UNTIL 一般写成 UTC：按墙上时间比，差几小时不影响（只差在边界那一天）
    const limW = new Date(Date.UTC(lim.getFullYear(), lim.getMonth(), lim.getDate()));
    const end = untilW && untilW < limW ? new Date(untilW.getTime() + 864e5 - 1) : limW;
    const byday = (r.BYDAY || '').split(',').filter(Boolean).map(x => { const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(x); return m ? { n: m[1] ? +m[1] : 0, wd: WD[m[2]] } : null; }).filter(Boolean);
    const bymd = (r.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
    const Y = start.getUTCFullYear(), M = start.getUTCMonth(), D = start.getUTCDate(), h = start.getUTCHours(), mi = start.getUTCMinutes(), sec = start.getUTCSeconds();
    const at = (y, mo, d) => new Date(Date.UTC(y, mo, d, h, mi, sec));
    const dim = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const out = []; let n = 0;
    const push = d => { if (d < start || d > end) return true; n++; if (count && n > count) return false; out.push(d); return true; };
    const nth = (y, mo, wd, k) => {   // 这个月第 k 个（负数从月底数）星期 wd
      if (k > 0) { const f = new Date(Date.UTC(y, mo, 1)).getUTCDay(); const d = 1 + ((wd - f + 7) % 7) + (k - 1) * 7; return d <= dim(y, mo) ? d : 0; }
      const L = dim(y, mo), l = new Date(Date.UTC(y, mo, L)).getUTCDay(); const d = L - ((l - wd + 7) % 7) + (k + 1) * 7; return d >= 1 ? d : 0;
    };
    for (let i = 0; i < 4000; i++) {
      if (freq === 'DAILY') { const d = at(Y, M, D + i * iv); if (d > end || !push(d)) break; }
      else if (freq === 'WEEKLY') {
        const mon = at(Y, M, D - ((start.getUTCDay() + 6) % 7) + i * 7 * iv);   // 这一周的周一
        if (mon > end) break;
        const days = byday.length ? byday.map(b => (b.wd + 6) % 7).sort((a, b) => a - b) : [(start.getUTCDay() + 6) % 7];
        let stop = false;
        for (const k of days) { const d = at(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + k); if (d > end) break; if (!push(d)) { stop = true; break; } }
        if (stop) break;
      } else if (freq === 'MONTHLY') {
        const first = new Date(Date.UTC(Y, M + i * iv, 1)), y = first.getUTCFullYear(), mo = first.getUTCMonth();
        if (first > end) break;
        const ds = [];
        if (byday.length) byday.forEach(b => { if (b.n) { const d = nth(y, mo, b.wd, b.n); if (d) ds.push(d); } else for (let k = 1; k <= 5; k++) { const d = nth(y, mo, b.wd, k); if (d) ds.push(d); } });
        else if (bymd.length) bymd.forEach(x => { const L = dim(y, mo), d = x > 0 ? x : L + x + 1; if (d >= 1 && d <= L) ds.push(d); });
        else if (D <= dim(y, mo)) ds.push(D);   // 31 号这种：没有 31 号的月份跳过
        let stop = false;
        for (const d of ds.sort((a, b) => a - b)) if (!push(at(y, mo, d))) { stop = true; break; }
        if (stop) break;
      } else if (freq === 'YEARLY') {
        const y = Y + i * iv; if (new Date(Date.UTC(y, 0, 1)) > end) break;
        if (D <= dim(y, M) && !push(at(y, M, D))) break;   // 2 月 29 日这种：没有的年份跳过
      } else { push(start); break; }
      if (count && n >= count) break;
    }
    return out;
  }

  // ---------- 导入面板 ----------
  // src：{ label, calendars: [{ id, title, color, source }], events: [每一次发生] }
  // 每个来源日历一行：导到 主日历 / 新建子日历（默认叫来源的名字）/ 已有的子日历 / 不导入
  let cur = null;
  function open(src) {
    const groups = new Map();
    for (const e of src.events) {
      if (!e.title || !e.date) continue;
      const k = e.cal || '';
      if (!groups.has(k)) {
        const c = (src.calendars || []).find(x => x.id === k);
        groups.set(k, { key: k, name: (c && c.title) || k || src.label || '导入的日历', color: c && c.color, source: c && c.source, items: [], to: '' });
      }
      groups.get(k).items.push(e);
    }
    const list = [...groups.values()].filter(g => g.items.length).sort((a, b) => b.items.length - a.items.length);
    if (!list.length) { UI.toast('这里面没有找到可以导入的事件'); return; }
    // 默认：只有一个来源时导到主日历；好几个来源（不同的日历 / 分类）时各自新建一个子日历，分得清
    // 已经有同名的子日历（比如上次导过）：默认还导到它里面
    list.forEach(g => { const same = MC.data.cals.find(c => c.kind !== 'days' && c.name === String(g.name).slice(0, 30)); g.to = same ? 'cal:' + same.id : list.length === 1 ? 'main' : 'new'; });
    cur = { src, list };
    paint();
    UI.open('importSheet');
  }
  const targets = () => [{ value: 'main', label: '导到主日历' }, { value: 'new', label: '新建一个子日历' },
    ...MC.data.cals.filter(c => c.kind !== 'days').map(c => ({ value: 'cal:' + c.id, label: `导到「${c.name}」` })), { value: 'skip', label: '不导入' }];
  const targetText = g => g.to === 'main' ? '主日历' : g.to === 'new' ? '新建子日历' : g.to === 'skip' ? '不导入' : `「${(MC.cal(g.to.slice(4)) || {}).name || '子日历'}」`;
  function paint() {
    const { src, list } = cur;
    const n = list.filter(g => g.to !== 'skip').reduce((s, g) => s + g.items.length, 0);
    $('#impBody').innerHTML = `<p class="imp-lead">${esc(src.label)} · 共 ${list.reduce((s, g) => s + g.items.length, 0)} 条（过去一年到未来两年）。每个日历单独选放到哪里：</p>
      <div class="sgroup">${list.map((g, i) => `<button type="button" class="srow imp-row" data-i="${i}">
        <span class="imp-dot" style="--c:${esc(g.color || '#A3A1AD')}"></span>
        <span class="slabel" data-uc>${esc(g.name)}<small>${g.items.length} 条${g.source ? ' · ' + esc(g.source) : ''}</small></span>
        <span class="sval${g.to === 'skip' ? ' off' : ''}">${esc(targetText(g))}</span></button>`).join('')}</div>
      <p class="imp-note">同一份再导一次不会重复。导到主日历的事件可以在子日历的「⋯」里把同名的挪过去；子日历也可以整个并入主日历。</p>`;
    $('#impGo').textContent = n ? `导入 ${n} 条` : '导入';
    $('#impGo').classList.toggle('disabled', !n);
  }
  $('#impBody').addEventListener('click', e => {
    const b = e.target.closest('.imp-row'); if (!b || !cur) return;
    const g = cur.list[+b.dataset.i];
    UI.menu(b.querySelector('.sval') || b, targets().map(t => ({ ...t, on: t.value === g.to })), v => { if (v) { g.to = v; paint(); } });
  });
  $('#impGo').addEventListener('click', () => {
    if (!cur) return;
    const have = new Set(MC.data.events.map(e => e.id)), del = MC.data.deleted || {};
    const add = []; let made = 0, dup = 0;
    for (const g of cur.list) {
      if (g.to === 'skip') continue;
      const fresh = g.items.map(e => ({ e, id: 'imp' + hash([e.uid, e.date, e.time || ''].join('|')) })).filter(x => {
        if (have.has(x.id) || del[x.id]) { dup++; return false; }
        have.add(x.id); return true;
      });
      if (!fresh.length) continue;   // 全都导过了：不再新建一个空的子日历
      let cal = '';
      if (g.to === 'new') {
        const used = new Set(MC.data.cals.map(c => c.color));
        const c = MC.addCal(String(g.name).slice(0, 30), MC.suggestCalColor([...used]), { showInMain: true });
        cal = c.id; made++;
      } else if (g.to.startsWith('cal:')) cal = g.to.slice(4);
      for (const { e, id } of fresh) {
        const timed = !e.allDay && e.time;
        // 有钟点但跨了一天以上（比如出差三天）：按全天、跨几天导进来
        const span = timed && e.endDate && e.endDate > e.date ? Math.round((MC.parse(e.endDate) - MC.parse(e.date)) / 864e5) : 0;
        add.push(MC.makeEvent({
          id, cal, title: e.title, note: e.note || '', date: e.date, priority: 0,
          time: timed && span < 1 ? e.time : '', endTime: timed && span < 1 && e.endTime !== e.time ? e.endTime : '',
          days: e.allDay ? e.days || 1 : span >= 1 ? span + 1 : 1,
          remind: timed && span < 1 && e.remind != null ? e.remind : null,
          series: e.recur ? 'imp' + hash(e.uid) : '',
        }));
      }
    }
    if (add.length) MC.addEvents(add);
    MC.reindex && MC.reindex();
    UI.close('importSheet');
    if (MC.Drawer && MC.Drawer.paint) MC.Drawer.paint();
    if (MC.Cal) MC.Cal.render();
    UI.toast(add.length ? `已导入 ${add.length} 条${made ? `，新建了 ${made} 个子日历` : ''}${dup ? `（${dup} 条已经有了，跳过）` : ''}` : '都已经导入过了');
    cur = null;
  });

  // ---------- 来源 ----------
  const sysOK = () => MC.Native.on && MC.Native.has('sysCal');
  async function fromSystem() {
    const now = Date.now();
    UI.toast('正在读取系统日历…');
    const r = await MC.Native.ask('sysCalRead', JSON.stringify({ from: now - PAST * 864e5, to: now + FUTURE * 864e5 }));
    if (!r || !r.ok) {
      UI.toast(r && r.error === 'denied' ? '没有日历权限：到系统设置里允许节律读取日历后再试' : '读取系统日历失败');
      return;
    }
    UI.hideToast();
    open({ label: '系统日历', calendars: r.calendars || [], events: r.events || [] });
  }
  async function fromFile(f) {
    try {
      const p = parseICS(await f.text());
      open({ label: p.name || f.name.replace(/\.ics$/i, ''), calendars: [], events: p.events.map(e => ({ ...e, cal: e.cal || p.name || f.name.replace(/\.ics$/i, '') })) });
    } catch (e) { UI.toast('读不出这个文件，确认是 .ics 日历文件'); }
  }
  async function fromUrl(url) {
    url = url.trim().replace(/^webcal:/i, 'https:');
    if (!/^https?:\/\//i.test(url)) throw new Error('地址要以 https:// 开头');
    let text = '';
    if (MC.Native.on && MC.Native.has('http')) {
      const r = await MC.Native.ask('http', JSON.stringify({ method: 'GET', url }));
      if (!r || r.error || r.status >= 400) throw new Error(r && r.status === 404 ? '这个地址找不到日历（是不是复制错了？）' : '下载失败，检查网络或地址');
      text = r.body || '';
    } else {
      try { const r = await fetch(url); if (!r.ok) throw 0; text = await r.text(); }
      catch (e) { throw new Error('浏览器不允许网页直接下载这个地址：在谷歌日历网页版「设置 → 导入和导出 → 导出」下载 .ics 文件，再用「.ics 文件」导入'); }
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('这个地址返回的不是日历（要用「iCal 格式的私密地址」）');
    const p = parseICS(text);
    open({ label: p.name || '谷歌日历', calendars: [], events: p.events.map(e => ({ ...e, cal: e.cal || p.name || '谷歌日历' })) });
  }
  function googleForm() {
    MC.openForm({
      title: '谷歌日历', submit: '读取',
      fields: [{ id: 'url', label: '私密 iCal 地址', ph: 'https://calendar.google.com/calendar/ical/…/basic.ics' }],
      note: '谷歌日历网页版 → 左边日历名旁的 ⋮ →「设置和共享」→ 拉到「集成日历」→ 复制「iCal 格式的私密地址」，粘贴到这里。每个日历有自己的地址，可以一个一个导。<br>手机上登录了谷歌账号的话，也可以直接用「系统日历」一次全部导入。',
      onSubmit: v => fromUrl(v.url),
    });
  }
  MC.CalImport = {
    parseICS,
    // 设置里点「从其他日历导入」：先选来源
    start(anchor) {
      const items = [
        ...(sysOK() ? [{ label: '系统日历（所有账户）', value: 'sys' }] : []),   // 手机 / Mac 里登录的 iCloud、谷歌、Outlook、Exchange 都在里面
        { label: '谷歌日历（私密地址）', value: 'google' },
        { label: '.ics 日历文件', value: 'file' },
      ];
      UI.menu(anchor, items, v => {
        if (v === 'sys') fromSystem();
        else if (v === 'google') googleForm();
        else $('#icsFile').click();
      });
    },
  };
  $('#icsFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) fromFile(f); };
})();
