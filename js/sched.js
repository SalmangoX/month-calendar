/* 月历 · 课表：周课表视图、粘贴文字 / .ics 导入、手动增改 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Sched = (MC.Sched = {});
  const DAYS = ['', '一', '二', '三', '四', '五', '六', '日'];
  const PALETTE = ['#5D7895', '#5F9479', '#C38F45', '#BE6662', '#86769F', '#4E8C92', '#6170A3', '#9A7B5C'];
  const colorOf = code => { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const pad = MC.pad;

  // ---------- 解析：粘贴的文字（uoZone 列表视图 / 通用格式） ----------
  const DAYTOK = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天])';
  const TIME_RE = new RegExp(`((?:${DAYTOK}[\\s,/、&]*)+|\\b[MTWRF]{1,5})\\s*(\\d{1,2})[:：](\\d{2})\\s*(AM|PM|am|pm)?\\s*[-–—~至到]\\s*(\\d{1,2})[:：](\\d{2})\\s*(AM|PM|am|pm)?`);
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const EN = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7 };
  function parseDays(str) {
    const out = new Set();
    if (/^[MTWRF]{1,5}$/.test(str.trim())) { for (const c of str.trim()) out.add({ M: 1, T: 2, W: 3, R: 4, F: 5 }[c]); return [...out]; }
    const re = new RegExp(DAYTOK, 'gi'); let m;
    while ((m = re.exec(str))) {
      const t = m[0];
      const cn = t.match(/[一二三四五六日天]/);
      if (cn) out.add(CN[cn[0]]); else out.add(EN[t.slice(0, 2).toLowerCase()]);
    }
    return [...out].filter(Boolean).sort();
  }
  function to24(h, m, ap) {
    h = Number(h);
    if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
    return `${pad(h)}:${m}`;
  }
  const TYPE_RE = /\b(Lecture|Laboratory|Lab|Tutorial|Discussion Group|Seminar|DGD|LEC|LAB|TUT|SEM)\b|讲座|讲课|实验|辅导|习题课|研讨/i;
  const TYPE_CN = { lecture: '讲座', lec: '讲座', laboratory: '实验', lab: '实验', tutorial: '辅导', tut: '辅导', 'discussion group': '讨论课', dgd: '讨论课', seminar: '研讨', sem: '研讨' };
  const looksRoom = s => !!s && s.length < 48 && /[A-Za-z\u4e00-\u9fa5]/.test(s)
    && (/\d/.test(s) || /\b(Hall|Building|Room|Complex|Centre|Center|Pavilion|Library|VIRT|Online|Virtual)\b|楼|室|馆/i.test(s))
    && !TIME_RE.test(s) && !/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) && !/^(staff|tba|to be announced)$/i.test(s)
    && !/^[A-Z]{3,4}\s?\d{4}/.test(s) && !/^(Enrolled|Status|Class Nbr|Section|Component)/i.test(s);
  // ---------- 课程起止日期（如 2026-09-08 - 2026-12-02、2026年9月8日至12月2日、Sep 8, 2026 - Dec 2, 2026） ----------
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const iso = (y, m, d) => `${y}-${pad(+m)}-${pad(+d)}`;
  const DATE_PATTERNS = [
    [/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*(?:[-–—~至到]|to)\s*(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})/i, m => [iso(m[1], m[2], m[3]), iso(m[4] || m[1], m[5], m[6])]],
    [/(\d{4})年(\d{1,2})月(\d{1,2})日?\s*(?:[-–—~至到])\s*(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/, m => [iso(m[1], m[2], m[3]), iso(m[4] || m[1], m[5], m[6])]],
    [/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—~]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/, m => [iso(m[3], m[1], m[2]), iso(m[6], m[4], m[5])]],
    [/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?\s*(?:[-–—~]|to)\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})/i,
      m => [iso(m[3] || m[6], MON[m[1].slice(0, 3).toLowerCase()], m[2]), iso(m[6], MON[m[4].slice(0, 3).toLowerCase()], m[5])]],
    [/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, m => [iso(m[1], m[2], m[3]), iso(m[1], m[2], m[3])]],      // 单独一天（比如某一次 lab）
    [/(\d{4})年(\d{1,2})月(\d{1,2})日/, m => [iso(m[1], m[2], m[3]), iso(m[1], m[2], m[3])]],
  ];
  function findRange(text) {
    for (const [re, fn] of DATE_PATTERNS) { const m = String(text || '').match(re); if (m) { const r = fn(m); if (r[0] <= r[1]) return { from: r[0], to: r[1] }; } }
    return null;
  }
  const EVERY2 = /隔周|单周|双周|biweekly|bi-weekly|alternate weeks|every other week|every 2 weeks/i;

  const CODE_RE = /\b([A-Za-z]{2,5})\s?(\d{3,4}[A-Za-z]?)\b/;
  const stripDT = t => t.replace(TIME_RE, ' ').replace(new RegExp(DAYTOK, 'gi'), ' ').replace(TYPE_RE, ' ')
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, ' ').replace(/[\t|,，·]+/g, ' ').replace(/\s+/g, ' ').trim();
  // 带表头的表格（从 Excel / 网页表格复制）：课程、星期、开始、结束、地点
  function parseTable(rawLines) {
    const tabbed = rawLines[0].includes('\t');
    const split = l => (tabbed ? l.split('\t') : l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map(x => x.replace(/^"|"$/g, '').trim());
    const head = split(rawLines[0]).map(h => h.toLowerCase());
    const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
    const ci = find('课程', '科目', 'course', 'subject', 'class', 'name', '名称'), di = find('星期', '周', 'day', 'weekday');
    const si = find('开始', 'start', 'begin', 'from'), ei = find('结束', 'end', 'to', 'until'), ti = find('时间', 'time');
    const ri = find('地点', '教室', 'room', 'location', 'place', 'where'), ki = find('类型', 'type', 'component');
    if (ci < 0 || di < 0 || (si < 0 && ti < 0)) return null;
    const out = [];
    for (const l of rawLines.slice(1)) {
      const c = split(l); if (!c[ci]) continue;
      const days = parseDays(c[di] || '');
      let st = '', en = '';
      const tm = (si >= 0 ? `${c[si]}-${c[ei] || ''}` : c[ti] || '').match(/(\d{1,2})[:：](\d{2})\s*(AM|PM)?\s*[-–—~至到]\s*(\d{1,2})[:：](\d{2})\s*(AM|PM)?/i);
      if (tm) { st = to24(tm[1], tm[2], tm[3] || (tm[6] && +tm[1] <= +tm[4] ? tm[6] : '')); en = to24(tm[4], tm[5], tm[6]); }
      if (!days.length || !st || toMin(en) <= toMin(st)) continue;
      const cm = c[ci].match(CODE_RE);
      const range = findRange(l) || { from: '', to: '' };
      for (const d of days) out.push({ code: cm ? `${cm[1].toUpperCase()} ${cm[2]}` : c[ci].slice(0, 24), type: ki >= 0 ? c[ki] || '' : '', day: d, start: st, end: en, room: ri >= 0 ? c[ri] || '' : '', from: range.from, to: range.to, every: EVERY2.test(l) ? 2 : 1 });
    }
    return out;
  }
  // 任意文字：学校系统、日历、自己写的都行
  Sched.parseText = text => {
    const rawLines = String(text).split(/\r?\n/).filter(l => l.trim());
    if (!rawLines.length) return [];
    const table = parseTable(rawLines);
    if (table && table.length) return dedupe(table);
    const lines = rawLines.map(l => l.replace(/\s+/g, ' ').trim());
    let code = '', type = '', lastText = '', fromHeader = false;
    const fmt = c => `${c[1].toUpperCase()} ${c[2]}`;
    const out = [];
    lines.forEach((line, i) => {
      const m = line.match(TIME_RE);
      let cm = null;
      if (!m) {
        // 课程标题行：以课程编号开头（例如「MAT 2348 - Integral Calculus」）；行中间的「Tabaret Hall 333」不算
        const c0 = line.match(CODE_RE);
        if (c0 && c0.index <= 1) { cm = c0; code = fmt(c0); fromHeader = true; }
      } else {
        const before = line.slice(0, m.index).match(CODE_RE);
        if (before) { cm = before; code = fmt(before); fromHeader = false; }
        else if (!fromHeader) {
          // 没有标题行的写法（例如「Monday 9:00-10:30 MATH 101 Room B204」）：编号写在时间后面
          const after = line.slice(m.index + m[0].length).match(CODE_RE);
          if (after) { cm = after; code = fmt(after); }
        }
      }
      const tm = line.match(TYPE_RE);
      if (tm) { const k = tm[0].toLowerCase(); type = TYPE_CN[k] || tm[0]; }
      if (!m) { if (!cm && !looksRoom(line) && line.length <= 30 && !/^\d+$/.test(line)) lastText = line; return; }
      // 同一行有课程名但没有编号：用这行除去时间和星期后的文字
      let name = code;
      if (!cm) {
        const before = stripDT(line.slice(0, m.index)), rest0 = stripDT(line.slice(m.index + m[0].length));
        if (before && !looksRoom(before)) name = before.slice(0, 24);
        else if (!code && lastText) name = lastText.slice(0, 24);
        else if (!code && rest0) name = rest0.split(' ')[0];
      }
      if (!name) return;
      const days = parseDays(m[1]);
      const start = to24(m[2], m[3], m[4] || (m[7] && Number(m[2]) <= Number(m[5]) ? m[7] : '')), end = to24(m[5], m[6], m[7]);
      if (toMin(end) <= toMin(start)) return;
      const rawM = rawLines[i].match(TIME_RE);
      const rest = rawM ? rawLines[i].slice(rawM.index + rawM[0].length) : '';
      let room = (rest.split(/\t| {2,}/).map(x => x.trim()).filter(Boolean)[0] || '').replace(/^[,，|·-]+/, '').trim();
      if (cm && room.includes(cm[0])) room = room.replace(cm[0], '').trim();
      if (!room) { const r2 = rest.replace(cm ? cm[0] : '', '').split(/\t| {2,}/).map(x => x.trim()).filter(Boolean)[0] || ''; if (looksRoom(r2)) room = r2; }
      if (!looksRoom(room)) room = looksRoom(lines[i + 1]) ? lines[i + 1] : '';
      // 起止日期：同一行，或紧接着的两行里（遇到下一节课的时间就停）
      let range = findRange(rawLines[i].slice(rawM ? rawM.index + rawM[0].length : 0)) || findRange(rawLines[i].slice(0, rawM ? rawM.index : 0));
      for (let k = 1; !range && k <= 2 && lines[i + k] && !TIME_RE.test(lines[i + k]); k++) range = findRange(lines[i + k]);
      const ctx = lines.slice(Math.max(0, i - 1), i + 2).join(' ');
      let every = EVERY2.test(ctx) ? 2 : 1, from = range ? range.from : '', to = range ? range.to : '';
      if (every === 2 && /双周/.test(ctx) && from) from = MC.ymd(MC.addDays(MC.parse(from), 7));
      for (const d of days) out.push({ code: name, type, day: d, start, end, room, from, to, every });
    });
    return dedupe(out);
  };
  function dedupe(list) {
    const seen = new Set();
    return list.filter(c => { const k = `${c.code}|${c.day}|${c.start}|${c.from || ''}|${c.to || ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // ---------- 解析：.ics 文件 ----------
  Sched.parseICS = text => {
    const raw = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let ev = null;
    const val = l => l.slice(l.indexOf(':') + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
    const dt = l => {
      const v = val(l), m = v.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
      if (!m) return null;
      let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      if (/Z$/.test(v)) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      return d;
    };
    for (const l of raw) {
      if (l === 'BEGIN:VEVENT') ev = {};
      else if (l === 'END:VEVENT' && ev) {
        if (ev.s && ev.e) {
          const cm = (ev.sum || '').match(/\b([A-Za-z]{3,4})\s?(\d{4})\b/);
          const code = cm ? `${cm[1].toUpperCase()} ${cm[2]}` : (ev.sum || '课程').slice(0, 24);
          const tm = (ev.sum || '').match(TYPE_RE);
          const days = ev.by ? parseDays(ev.by.replace(/,/g, ' ')) : [((ev.s.getDay() + 6) % 7) + 1];
          const start = `${pad(ev.s.getHours())}:${pad(ev.s.getMinutes())}`, end = `${pad(ev.e.getHours())}:${pad(ev.e.getMinutes())}`;
          const from = MC.ymd(ev.s), to = ev.by ? (ev.until || '') : from;
          if (toMin(end) > toMin(start)) for (const d of days) out.push({ code, type: tm ? (TYPE_CN[tm[0].toLowerCase()] || tm[0]) : '', day: d, start, end, room: ev.loc || '', from, to, every: ev.interval === 2 ? 2 : 1 });
        }
        ev = null;
      } else if (ev) {
        if (l.startsWith('SUMMARY')) ev.sum = val(l);
        else if (l.startsWith('LOCATION')) ev.loc = val(l);
        else if (l.startsWith('DTSTART')) ev.s = dt(l);
        else if (l.startsWith('DTEND')) ev.e = dt(l);
        else if (l.startsWith('RRULE')) {
          const v = val(l), b = v.match(/BYDAY=([A-Z,]+)/), u = v.match(/UNTIL=(\d{4})(\d{2})(\d{2})/), iv = v.match(/INTERVAL=(\d+)/);
          if (b && /FREQ=WEEKLY/.test(v)) { ev.by = b[1]; ev.until = u ? `${u[1]}-${u[2]}-${u[3]}` : ''; ev.interval = iv ? +iv[1] : 1; }
        }
      }
    }
    const seen = new Set();
    return out.filter(c => { const k = `${c.code}|${c.day}|${c.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ---------- 某一天有没有这节课：日期范围 + 隔周 ----------
  const mondayOf = d => MC.addDays(d, -((d.getDay() + 6) % 7));
  Sched.on = (c, date) => {
    const ds = MC.ymd(date);
    if (((date.getDay() + 6) % 7) + 1 !== c.day) return false;
    if (c.from && ds < c.from) return false;
    if (c.to && ds > c.to) return false;
    if (c.every === 2 && c.from) {
      const w = Math.round((mondayOf(date) - mondayOf(MC.parse(c.from))) / (7 * 864e5));
      if (w % 2) return false;
    }
    return true;
  };

  // ---------- 周课表视图（左右滑动或点箭头换周） ----------
  const HOUR = 66;
  let week = mondayOf(new Date());
  function termStart() {
    const f = (MC.data.courses || []).map(c => c.from).filter(Boolean).sort()[0];
    return f ? mondayOf(MC.parse(f)) : null;
  }
  function weekTitle() {
    const end = MC.addDays(week, 6), ts = termStart();
    const n = ts ? Math.round((week - ts) / (7 * 864e5)) + 1 : 0;
    const range = `${week.getMonth() + 1}月${week.getDate()}日 – ${end.getMonth() === week.getMonth() ? '' : end.getMonth() + 1 + '月'}${end.getDate()}日`;
    return { main: n >= 1 && n <= 30 ? `第 ${n} 周` : range, sub: n >= 1 && n <= 30 ? range : '' };
  }
  // 同一天时间重叠的课并排显示
  function lanes(list) {
    const sorted = [...list].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
    const out = []; let group = [], groupEnd = -1;
    const flush = () => {
      const ends = [];
      for (const c of group) { let k = ends.findIndex(e => e <= toMin(c.start)); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = toMin(c.end); c._lane = k; }
      for (const c of group) { c._lanes = ends.length; out.push(c); }
      group = [];
    };
    for (const c of sorted) { if (toMin(c.start) >= groupEnd && group.length) flush(); group.push({ ...c }); groupEnd = Math.max(groupEnd, toMin(c.end)); }
    if (group.length) flush();
    return out;
  }
  Sched.render = () => {
    const body = $('#schedBody');
    const all = MC.data.courses || [];
    const t = weekTitle();
    $('#schedWeekMain').textContent = t.main;
    $('#schedWeekSub').textContent = t.sub;
    const thisWeek = MC.ymd(week) === MC.ymd(mondayOf(new Date()));
    $('#schedThisWeek').hidden = thisWeek;
    $('#schedNav').hidden = !all.length;
    if (!all.length) {
      body.innerHTML = `<div class="big-empty"><span class="em-ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M9 10v10"/></svg></span>还没有课表<br><small style="color:var(--text3)">点右上角「导入」，粘贴课程表文字即可</small></div>`;
      return;
    }
    // 这一周每一天实际要上的课
    const byDay = {};
    for (let d = 1; d <= 7; d++) byDay[d] = all.filter(c => Sched.on(c, MC.addDays(week, d - 1)));
    const days = [1, 2, 3, 4, 5].concat([6, 7].filter(d => byDay[d].length)); // 周末有课才显示
    const inWeek = days.flatMap(d => byDay[d]);
    if (!inWeek.length) {
      const ts = termStart();
      body.innerHTML = `<div class="big-empty" style="padding-top:48px"><span class="em-ico"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>这一周没有课${ts && week < ts ? `<br><button class="chip-btn glass" id="schedJump" style="margin-top:12px">跳到开课第一周</button>` : ''}</div>`;
      const j = $('#schedJump'); if (j) j.onclick = () => { week = ts; Sched.render(); };
      return;
    }
    const minH = Math.min(8, ...inWeek.map(c => Math.floor(toMin(c.start) / 60)));
    const maxH = Math.max(17, ...inWeek.map(c => Math.ceil(toMin(c.end) / 60)));
    // 全览（默认）：按屏幕大小等比缩小，一屏显示整周；放大：固定尺寸，可上下左右滚动
    const fit = MC.settings.schedFit !== false;
    $('#schedFit').textContent = fit ? '放大' : '全览';
    let HOUR = 66, colw = 86, fs = 1;
    if (fit) {
      const cs = getComputedStyle(body);
      const avail = body.clientHeight - parseFloat(cs.paddingBottom) - parseFloat(cs.paddingTop) - 44;
      HOUR = Math.max(20, Math.min(66, avail / (maxH - minH)));
      colw = 0;
      fs = Math.max(.62, Math.min(1, HOUR / 60, (body.clientWidth - 40) / days.length / 86));
    }
    const todayStr = MC.todayStr();
    let head = '<div class="sc-corner"></div>';
    for (const d of days) {
      const date = MC.addDays(week, d - 1), isToday = MC.ymd(date) === todayStr;
      head += `<div class="sc-dh${isToday ? ' today' : ''}${d > 5 ? ' we' : ''}"><span>周${DAYS[d]}</span><b>${date.getMonth() + 1}/${date.getDate()}</b></div>`;
    }
    let hours = '';
    for (let h = minH; h < maxH; h++) hours += `<div class="sc-hr" style="top:${(h - minH) * HOUR}px">${h}:00</div>`;
    let cols = '', todayIdx = -1;
    days.forEach((d, idx) => {
      const date = MC.addDays(week, d - 1), isToday = MC.ymd(date) === todayStr;
      if (isToday) todayIdx = idx;
      const blocks = lanes(byDay[d]).map(c => {
        const top = (toMin(c.start) / 60 - minH) * HOUR + 1, hgt = Math.max(16, (toMin(c.end) - toMin(c.start)) / 60 * HOUR - 3);
        const w = 100 / c._lanes, left = c._lane * w;
        const lines = Math.max(1, Math.floor((hgt - 48 * fs) / (13.5 * fs)));
        return `<button class="sc-blk${c._lanes > 1 ? ' narrow' : ''}" data-id="${c.id}" style="top:${top}px;height:${hgt}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);--c:${colorOf(c.code)}">
          ${c._lanes > 1 || hgt < 40 * fs ? '' : `<small class="t">${c.start}–${c.end}</small>`}<b>${c._lanes > 1 ? esc(c.code).split(' ').join('<br>') : esc(c.code)}</b>${c.type ? `<span class="k">${esc(c.type)}${c.every === 2 ? ' · 隔周' : ''}</span>` : (c.every === 2 ? '<span class="k">隔周</span>' : '')}${c.room && hgt > 60 * fs && c._lanes === 1 ? `<span class="r" style="-webkit-line-clamp:${lines}">${esc(c.room)}</span>` : ''}</button>`;
      }).join('');
      cols += `<div class="sc-col${isToday ? ' today' : ''}">${blocks}</div>`;
    });
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const nowLine = todayIdx >= 0 && nowMin >= minH * 60 && nowMin <= maxH * 60 ? `<div class="sc-now" style="top:${(nowMin / 60 - minH) * HOUR}px;--i:${todayIdx}"></div>` : '';
    const grid0 = body.querySelector('.sc-grid'), keepX = grid0 ? grid0.scrollLeft : 0, keepY = grid0 ? grid0.scrollTop : null;
    body.innerHTML = `<div class="sc-grid${fit ? ' fit' : ''}" style="--days:${days.length};--colw:${colw}px;--fs:${fs.toFixed(3)}"><div class="sc-inner">
      <div class="sc-head">${head}</div>
      <div class="sc-main" style="height:${(maxH - minH) * HOUR}px">
        <div class="sc-hours">${hours}</div><div class="sc-cols">${cols}${nowLine}
        ${Array.from({ length: maxH - minH }, (_, i) => `<div class="sc-line" style="top:${i * HOUR}px"></div>`).join('')}</div>
      </div></div></div>`;
    const grid = body.querySelector('.sc-grid');
    grid.scrollLeft = keepX;
    const cur = body.querySelector('.sc-now');
    if (keepY !== null) grid.scrollTop = keepY;
    else if (cur) grid.scrollTop = Math.max(0, parseFloat(cur.style.top) - 140);
  };
  Sched.goto = ds => { week = mondayOf(MC.parse(ds)); Sched.render(); };
  function shiftWeek(n) {
    const body = $('#schedBody');
    week = MC.addDays(week, 7 * n);
    body.classList.remove('slide-l', 'slide-r'); void body.offsetWidth;
    body.classList.add(n > 0 ? 'slide-l' : 'slide-r');
    Sched.render();
  }
  $('#schedFit').onclick = () => { MC.settings.schedFit = MC.settings.schedFit === false; MC.saveSettings(); Sched.render(); };
  window.addEventListener('resize', () => { if (document.getElementById('page-sched').classList.contains('active')) Sched.render(); });
  $('#schedPrev').onclick = () => shiftWeek(-1);
  $('#schedNext').onclick = () => shiftWeek(1);
  $('#schedThisWeek').onclick = () => { week = mondayOf(new Date()); Sched.render(); };
  // 左右滑动换周
  (() => {
    const el = $('#schedBody'); let x0 = 0, y0 = 0, on = false;
    el.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; on = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!on) return; on = false;
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      const g = el.querySelector('.sc-grid');
      if (g && g.scrollWidth > g.clientWidth + 2) return; // 内容可以左右滚动时，滑动用来滚动内容；换周用顶部箭头
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftWeek(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  // ---------- 导入 / 编辑面板 ----------
  let parsed = [], mode = 'import', editing = null, editDay = 1, editEvery = 1;
  function openImport() {
    mode = 'import'; parsed = [];
    $('#schedTitle').textContent = '导入课表';
    $('#schedOk').textContent = '导入';
    $('#schedForm').innerHTML = `
      <p class="hint" style="margin:0 2px 10px">从学校选课系统、教务网站、Excel 表格或任何日历里复制课程表文字，粘贴到下面即可，App 会自动识别课程、星期、时间和教室。</p>
      <div class="help-tip" style="margin-bottom:10px">小技巧：网页上的课程表如果有「列表视图」，切到列表再复制，识别最准确（uoZone 就是「List View」）。<br>也可以自己一行写一节：<code>MAT 2348 周二 14:30-15:50 Tabaret 333</code><br>或从 Excel 复制带表头的表格（课程 / 星期 / 开始 / 结束 / 教室）。</div>
      <textarea id="schedText" rows="6" placeholder="在这里粘贴课程表…"></textarea>
      <div class="btn-line"><span><button class="chip-btn glass" id="schedIcs">.ics 文件</button> <button class="chip-btn glass" id="schedManual">手动添加</button></span><label class="replace-opt"><input type="checkbox" id="schedReplace" checked> 替换现有课表</label></div>
      <div id="schedPreview"></div>`;
    $('#schedText').addEventListener('input', () => { parsed = Sched.parseText($('#schedText').value); preview(); });
    $('#schedIcs').onclick = () => $('#schedFile').click();
    $('#schedManual').onclick = () => openEdit(null);
    preview();
    UI.open('schedSheet');
  }
  function preview() {
    const el = $('#schedPreview');
    if (!parsed.length) { el.innerHTML = ''; $('#schedOk').classList.add('disabled'); return; }
    $('#schedOk').classList.remove('disabled');
    $('#schedOk').textContent = `导入 ${parsed.length} 节`;
    const sorted = [...parsed].sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));
    el.innerHTML = `<p class="hint" style="margin:10px 4px 6px">识别到 ${parsed.length} 节课，确认无误后点右上角导入：</p>
      <div class="group">${sorted.map(c => `<div class="grow sc-prev"><i style="background:${colorOf(c.code)}"></i><span><b>${esc(c.code)}</b> ${esc(c.type)}<small>周${DAYS[c.day]} ${c.start}–${c.end}${c.room ? ' · ' + esc(c.room) : ''}${c.from ? ` · ${c.from.slice(5).replace('-', '/')}${c.to && c.to !== c.from ? '–' + c.to.slice(5).replace('-', '/') : ''}` : ''}${c.every === 2 ? ' · 隔周' : ''}</small></span></div>`).join('')}</div>`;
  }
  $('#schedFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    parsed = Sched.parseICS(await f.text());
    if (!parsed.length) UI.toast('文件里没有找到课程');
    preview();
  });
  function openEdit(c) {
    mode = 'edit'; editing = c || null; editDay = c ? c.day : 1;
    $('#schedTitle').textContent = c ? '编辑课程' : '添加课程';
    $('#schedOk').textContent = '保存'; $('#schedOk').classList.remove('disabled');
    $('#schedForm').innerHTML = `
      <label class="field"><span>课程</span><input id="scCode" value="${esc(c ? c.code : '')}" placeholder="例如 MAT 2348"></label>
      <label class="field"><span>类型（选填）</span><input id="scType" value="${esc(c ? c.type : '')}" placeholder="讲座 / 实验 / 辅导"></label>
      <div class="field"><span>星期</span><div class="seg" id="scDay">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button data-d="${d}" class="${d === editDay ? 'on' : ''}">${DAYS[d]}</button>`).join('')}</div></div>
      <div class="sc-times"><label class="field"><span>开始</span><input id="scStart" type="time" value="${c ? c.start : '08:30'}"></label>
      <label class="field"><span>结束</span><input id="scEnd" type="time" value="${c ? c.end : '09:50'}"></label></div>
      <label class="field"><span>地点（选填）</span><input id="scRoom" value="${esc(c ? c.room : '')}" placeholder="例如 Tabaret Hall 333"></label>
      <div class="sc-times"><label class="field"><span>开课日期（选填）</span><input id="scFrom" type="date" value="${c ? c.from || '' : ''}"></label>
      <label class="field"><span>结课日期（选填）</span><input id="scTo" type="date" value="${c ? c.to || '' : ''}"></label></div>
      <div class="field"><span>频率</span><div class="seg" id="scEvery"><button data-e="1" class="${!c || c.every !== 2 ? 'on' : ''}">每周</button><button data-e="2" class="${c && c.every === 2 ? 'on' : ''}">隔周</button></div>
      <small class="form-note">隔周以开课日期那一周为第一次上课；不填日期则以本周为第一次。</small></div>
      ${c ? '<button class="pk-clear" id="scDel">删除这节课</button>' : ''}`;
    editEvery = c && c.every === 2 ? 2 : 1;
    $('#scEvery').onclick = e => { const b = e.target.closest('button'); if (!b) return; editEvery = Number(b.dataset.e); $('#scEvery').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#scDay').onclick = e => { const b = e.target.closest('button'); if (!b) return; editDay = Number(b.dataset.d); $('#scDay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    if (c) $('#scDel').onclick = () => { MC.setCourses(MC.data.courses.filter(x => x.id !== c.id)); UI.close('schedSheet'); UI.toast('已删除'); };
    UI.open('schedSheet');
  }
  $('#schedOk').onclick = () => {
    if (mode === 'import') {
      if (!parsed.length) return;
      const items = parsed.map(c => ({ ...c, id: MC.uid() }));
      MC.setCourses($('#schedReplace').checked ? items : [...(MC.data.courses || []), ...items]);
      UI.close('schedSheet'); UI.toast(`已导入 ${items.length} 节课`);
      return;
    }
    const code = $('#scCode').value.trim(), start = $('#scStart').value, end = $('#scEnd').value;
    if (!code) { UI.toast('请填写课程'); return; }
    if (!start || !end || toMin(end) <= toMin(start)) { UI.toast('结束时间要晚于开始时间'); return; }
    let from = $('#scFrom').value, to = $('#scTo').value;
    if (from && to && to < from) { UI.toast('结课日期要晚于开课日期'); return; }
    if (editEvery === 2 && !from) from = MC.ymd(MC.addDays(mondayOf(new Date()), editDay - 1));
    const item = { id: editing ? editing.id : MC.uid(), code, type: $('#scType').value.trim(), day: editDay, start, end, room: $('#scRoom').value.trim(), from, to, every: editEvery };
    const list = (MC.data.courses || []).filter(x => !editing || x.id !== editing.id);
    MC.setCourses([...list, item]);
    UI.close('schedSheet'); UI.toast('已保存');
  };
  $('#schedImport').onclick = openImport;
  // ---------- 课程信息浮窗 ----------
  const pop = $('#cpop'), scrim = $('#cpopScrim');
  const fmtD = ds => { const d = MC.parse(ds); return `${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : ''}${d.getMonth() + 1}月${d.getDate()}日`; };
  function nextOn(c) {
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    for (let k = 0; k < 120; k++) {
      const d = MC.addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), k);
      if (Sched.on(c, d) && !(k === 0 && toMin(c.end) <= nm)) return { d, live: k === 0 && nm >= toMin(c.start) };
    }
    return null;
  }
  function closePop() { pop.classList.remove('show'); scrim.classList.remove('show'); }
  function openPop(c, el) {
    const col = colorOf(c.code), dur = toMin(c.end) - toMin(c.start), nx = nextOn(c);
    const nxText = !nx ? '本学期已结束' : nx.live ? '正在上课' : (() => { const k = Math.round((nx.d - new Date(new Date().toDateString())) / 864e5); return k === 0 ? '今天 ' + c.start : k === 1 ? '明天 ' + c.start : `${nx.d.getMonth() + 1}月${nx.d.getDate()}日（${k} 天后）`; })();
    pop.style.setProperty('--c', col);
    pop.innerHTML = `
      <div class="cp-top"><div class="cp-tag">${esc(c.type || '课程')}${c.every === 2 ? ' · 隔周' : ''}</div><button class="round cp-x" aria-label="关闭"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M6 6l12 12M18 6L6 18" stroke-width="2.4"/></svg></button></div>
      <h3>${esc(c.code)}</h3>
      <div class="cp-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg><span>周${DAYS[c.day]} ${c.start} – ${c.end}<small>${dur} 分钟</small></span></div>
      ${c.room ? `<div class="cp-row"><svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg><span>${esc(c.room)}</span></div>` : ''}
      <div class="cp-row"><svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="3.5"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5"/></svg><span>${c.from || c.to ? `${c.from ? fmtD(c.from) : '开学'} – ${c.to ? fmtD(c.to) : '结课'}` : '每周都上'}<small>${c.every === 2 ? '隔一周上一次' : '每周'}</small></span></div>
      <div class="cp-next${nx && nx.live ? ' live' : ''}">下一次：${nxText}</div>
      <div class="cp-acts"><button class="cp-edit">编辑</button></div>`;
    // 位置：贴着点开的那节课，优先显示在下方，放不下就放上方
    pop.classList.add('show'); scrim.classList.add('show');
    const r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, W = innerWidth, H = innerHeight;
    let left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), W - pw - 12);
    let top = r.bottom + 10;
    if (top + ph > H - 90) top = Math.max(12 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0), r.top - ph - 10);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : ph}px`;
    pop.querySelector('.cp-x').onclick = closePop;
    pop.querySelector('.cp-edit').onclick = () => { closePop(); openEdit(c); };
  }
  scrim.addEventListener('click', closePop);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.classList.contains('show')) closePop(); });
  $('#schedBody').addEventListener('click', e => {
    const b = e.target.closest('.sc-blk'); if (!b) return;
    const c = (MC.data.courses || []).find(x => x.id === b.dataset.id); if (c) openPop(c, b);
  });
  $('#schedBody').addEventListener('scroll', closePop, true);
})();
