/* 月历 · 课表：周课表视图、粘贴文字 / .ics 导入、手动增改 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Sched = (MC.Sched = {});
  const DAYS = ['', '一', '二', '三', '四', '五', '六', '日'];
  // ---------- 课程配色（应用 / 小组件共用同一套算法） ----------
  // 科目定「锚点色相」（数学 = 晴空蓝、经济 = 玉青、语言 = 杏……），再把这学期的所有课程在色环上推开：
  // 有含义（同科目颜色相近），又整体均匀（任意两门至少隔开一段距离）；跳过黄绿一带（深色下会发橄榄色）。
  // 每门课明度、彩度相同，只有色相不同，所以一样醒目。
  const CRS_FAM = [
    [240, ['MAT', 'STA']], [205, ['CSI', 'ITI', 'SEG', 'CEG', 'ELG', 'GNG', 'MCG', 'CVG', 'CHG']], [275, ['PHY', 'CHM', 'EVS', 'GEO', 'ERS']],
    [140, ['BIO', 'BCH', 'BPS', 'ANP', 'HSS', 'NUT']], [175, ['ECO', 'ADM', 'FIN']], [58, ['ENG', 'FRA', 'ESL', 'FLS', 'LIN', 'ESP', 'ALL']],
    [18, ['HIS', 'PHI', 'CLA', 'REL']], [310, ['PSY', 'SOC', 'POL', 'CRM', 'ANT']], [345, ['ART', 'MUS', 'THE', 'ARV']],
  ];
  function courseHues(list) {
    const G0 = 78, G1 = 138, U = 360 - (G1 - G0);
    const toU = h => (h < G0 ? h : h < G1 ? G0 : h - (G1 - G0)), toH = u => (u < G0 ? u : u + (G1 - G0));
    const wrap = x => ((x % U) + U) % U, sd = (a, b) => { const d = wrap(b - a); return d > U / 2 ? d - U : d; };
    const codes = [...new Set(list)].sort(), pre = c => (String(c).match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
    const anchor = new Map(); for (const [h, ps] of CRS_FAM) for (const p of ps) anchor.set(p, h);
    const used = new Set(codes.map(pre).filter(p => anchor.has(p)).map(p => anchor.get(p)));
    const free = CRS_FAM.map(f => f[0]).filter(h => !used.has(h));
    [...new Set(codes.map(pre).filter(p => !anchor.has(p)))].sort().forEach((p, i) => anchor.set(p, free.length ? free[i % free.length] : CRS_FAM[i % CRS_FAM.length][0]));
    const it = codes.map(c => ({ c, a: toU(anchor.get(pre(c))) })).sort((x, y) => x.a - y.a || (x.c < y.c ? -1 : x.c > y.c ? 1 : 0));
    const n = it.length; if (!n) return new Map();
    const D = Math.min(60, (U / n) * 0.8);
    const groups = new Map(); it.forEach(o => { if (!groups.has(o.a)) groups.set(o.a, []); groups.get(o.a).push(o); });
    for (const g of groups.values()) g.forEach((o, k) => (o.p = o.a + (k - (g.length - 1) / 2) * D));
    const push = () => { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = it[i], B = it[j], d = sd(A.p, B.p), ad = Math.abs(d);
      if (ad < D) { const m = (D - ad) / 2 * (d >= 0 ? 1 : -1) + (ad === 0 ? 0.01 : 0); A.p -= m; B.p += m; } } };
    for (let r = 0; r < 300; r++) { for (const o of it) o.p += 0.06 * sd(o.p, o.a); push(); push(); push(); }
    for (let r = 0; r < 60; r++) push();
    return new Map(it.map(o => [o.c, Math.round(toH(wrap(o.p)) * 10) / 10]));
  }
  function oklchHex(L, C, H) { // 超出屏幕色域时降低彩度
    const g = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    for (let c = C; c >= 0; c -= 0.005) {
      const A = c * Math.cos(H * Math.PI / 180), B = c * Math.sin(H * Math.PI / 180);
      const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
      const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
      if (rgb.every(v => v >= -1e-4 && v <= 1.0001)) return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, g(v))) * 255).toString(16).padStart(2, '0').toUpperCase()).join('');
    }
    return '#808080';
  }
  // 一门课的一整套颜色：浅色（淡底、深字、色条 / 小色块）、深色（深底、浅字、亮色条、深色小色块）
  const courseTone = h => ({ base: oklchHex(.64, .095, h), fillL: oklchHex(.955, .03, h), inkL: oklchHex(.42, .085, h), fillD: oklchHex(.30, .045, h),
    inkD: oklchHex(.86, .065, h), chipD: oklchHex(.42, .075, h), chipInkD: oklchHex(.935, .03, h), barD: oklchHex(.70, .095, h) });
  let hueKey = '', hues = new Map();
  const toneCache = new Map();
  const toneOf = code => {
    const codes = (MC.data.courses || []).map(c => c.code), key = [...new Set(codes)].sort().join('|');
    if (key !== hueKey) { hueKey = key; hues = courseHues(codes); }
    const h = hues.has(code) ? hues.get(code) : 240;
    if (!toneCache.has(h)) toneCache.set(h, courseTone(h));
    return toneCache.get(h);
  };
  MC.courseTone = toneOf;
  const colorOf = code => toneOf(code).base;
  // 课程块用的颜色变量：浅色 / 深色各一套，由 styles.css 按当前外观挑
  const toneVars = code => { const t = toneOf(code); return `--c:${t.base};--cfl:${t.fillL};--cil:${t.inkL};--cfd:${t.fillD};--cid:${t.inkD};--cbd:${t.barD}`; };
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
  let zoom = 1; // 1 = 全览（整周一屏显示）；>1 = 捏合放大
  // 「现在」每分钟往下走：只挪线和时间标签；跨过上下课时间时更新「正在上」的课；换日或超出时间轴范围时整页重画
  let nowState = null, lastMin = -1;
  setInterval(() => {
    if (!nowState || document.visibilityState !== 'visible' || document.body.dataset.page !== 'sched') return;
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    if (nm === lastMin) return;
    lastMin = nm;
    const S = nowState, show = nm >= S.minH * 60 && nm <= S.maxH * 60;
    if (MC.todayStr() !== S.day || show !== S.show) { Sched.render(); return; }
    if (!show) return;
    const root = $('#schedBody'), top = `${(nm / 60 - S.minH) * S.HOUR}px`;
    root.querySelectorAll('.sc-nowline, .sc-tri').forEach(el => (el.style.top = top));
    const lbl = root.querySelector('.sc-tri span');
    if (lbl) lbl.textContent = MC.fmtTime(`${MC.pad(now.getHours())}:${MC.pad(now.getMinutes())}`);
    root.querySelectorAll('.sc-col.today .sc-blk').forEach(b => b.classList.toggle('live', nm >= +b.dataset.s && nm < +b.dataset.e));
  }, 15000);
  Sched.render = () => {
    const body = $('#schedBody');
    const all = MC.data.courses || [];
    const t = weekTitle();
    $('#schedWeekMain').textContent = t.main;
    $('#schedWeekSub').textContent = t.sub;
    $('#schedThisWeek').hidden = MC.ymd(week) === MC.ymd(mondayOf(new Date()));
    $('#schedFit').hidden = zoom <= 1;
    $('#schedNav').hidden = !all.length;
    if (!all.length) {
      body.innerHTML = `<div class="big-empty"><span class="em-ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M9 10v10"/></svg></span>还没有课表<br><small style="color:var(--text3)">点右上角「导入」，粘贴课程表文字即可</small></div>`;
      return;
    }
    const byDay = {};
    for (let d = 1; d <= 7; d++) byDay[d] = all.filter(c => Sched.on(c, MC.addDays(week, d - 1)));
    const days = [1, 2, 3, 4, 5, 6, 7];
    // 周末没课：显示成两条窄列，仍然能看出今天是周几
    const wts = days.map(d => (d > 5 && !byDay[d].length ? 0.36 : 1));
    const inWeek = days.flatMap(d => byDay[d]);
    const ts = termStart();
    const minH = inWeek.length ? Math.min(8, ...inWeek.map(c => Math.floor(toMin(c.start) / 60))) : 8;
    const maxH = inWeek.length ? Math.max(17, ...inWeek.map(c => Math.ceil(toMin(c.end) / 60))) : 18;
    // 尺寸：全览时按屏幕等比缩小；放大时按倍数加大，可以滚动
    const cs = getComputedStyle(body);
    const availH = body.clientHeight - parseFloat(cs.paddingBottom) - parseFloat(cs.paddingTop) - 44;
    const h12 = MC.use12(), HW = h12 ? 40 : 36;           // 左边时间轴的宽度：12 小时制要放下「下午」
    const availW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - HW - 2;
    const sumW = wts.reduce((a, b) => a + b, 0);
    const fitHour = Math.max(20, availH / (maxH - minH)), unit = availW / sumW;
    const HOUR = fitHour * zoom;
    const fs = Math.max(.62, Math.min(1.15, Math.min(HOUR / 60, unit * zoom / 80)));
    const tpl = wts.map(w => zoom > 1 ? `minmax(${(unit * w * zoom).toFixed(1)}px, ${w}fr)` : `${w}fr`).join(' ');
    const todayStr = MC.todayStr();
    let head = '<div class="sc-corner"></div>', todayIdx = -1;
    days.forEach((d, idx) => {
      const date = MC.addDays(week, d - 1), isToday = MC.ymd(date) === todayStr;
      if (isToday) todayIdx = idx;
      const thin = wts[idx] < 1;
      head += `<div class="sc-dh${isToday ? ' today' : ''}${d > 5 ? ' we' : ''}${thin ? ' thin' : ''}"><span>${thin ? DAYS[d] : '周' + DAYS[d]}</span><b>${thin ? date.getDate() : `${date.getMonth() + 1}/${date.getDate()}`}</b></div>`;
    });
    let hours = '';
    for (let h = minH; h < maxH; h++) hours += `<div class="sc-hr" style="top:${(h - minH) * HOUR}px">${h12 ? MC.hourLabel(h, true) : `${h}:00`}</div>`;
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    // 当前时间：整周一条半透明的线压在所有课程上面；左边时间轴上一个实色的时间标签，右边缘正好接上这条线
    const showNow = nowMin >= minH * 60 && nowMin <= maxH * 60; // 换到别的周也显示「现在几点」
    const nowTop = (nowMin / 60 - minH) * HOUR;
    nowState = { minH, maxH, HOUR, day: todayStr, show: showNow };
    let cols = '';
    days.forEach((d, idx) => {
      const isToday = idx === todayIdx;
      const blocks = lanes(byDay[d]).map(c => {
        const top = (toMin(c.start) / 60 - minH) * HOUR + 1, hgt = Math.max(16, (toMin(c.end) - toMin(c.start)) / 60 * HOUR - 3);
        const w = 100 / c._lanes, left = c._lane * w;
        const lines = Math.max(1, Math.floor((hgt - 48 * fs) / (13.5 * fs)));
        const live = isToday && nowMin >= toMin(c.start) && nowMin < toMin(c.end);
        return `<button class="sc-blk${c._lanes > 1 ? ' narrow' : ''}${live ? ' live' : ''}" data-id="${c.id}" data-s="${toMin(c.start)}" data-e="${toMin(c.end)}" style="top:${top}px;height:${hgt}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);${toneVars(c.code)}">
          ${c._lanes > 1 || hgt < 40 * fs ? '' : `<small class="t">${h12 ? `${MC.fmtTime(c.start, true)}–${MC.fmtTime(c.end, true)}` : `${c.start}–${c.end}`}</small>`}<b>${c._lanes > 1 ? esc(c.code).split(' ').join('<br>') : esc(c.code)}</b>${c.type ? `<span class="k">${esc(c.type)}${c.every === 2 ? ' · 隔周' : ''}</span>` : (c.every === 2 ? '<span class="k">隔周</span>' : '')}${c.room && hgt > 60 * fs && c._lanes === 1 ? `<span class="r" style="-webkit-line-clamp:${lines}">${esc(c.room)}</span>` : ''}</button>`;
      }).join('');
      cols += `<div class="sc-col${isToday ? ' today' : ''}${wts[idx] < 1 ? ' thin' : ''}">${blocks}</div>`;
    });
    const grid0 = body.querySelector('.sc-grid'), keepX = grid0 ? grid0.scrollLeft : 0, keepY = grid0 ? grid0.scrollTop : null;
    body.innerHTML = `<div class="sc-grid${zoom > 1 ? '' : ' fit'}${h12 ? ' h12' : ''}" style="--tpl:${tpl};--fs:${fs.toFixed(3)};--hw:${HW}px"><div class="sc-inner">
      <div class="sc-head">${head}</div>
      <div class="sc-main" style="height:${(maxH - minH) * HOUR}px">
        <div class="sc-hours">${hours}${showNow ? `<div class="sc-tri" style="top:${nowTop}px"><span>${MC.fmtTime(`${MC.pad(now.getHours())}:${MC.pad(now.getMinutes())}`)}</span></div>` : ''}</div>
        <div class="sc-cols">${cols}
        ${Array.from({ length: maxH - minH }, (_, i) => `<div class="sc-line" style="top:${i * HOUR}px"></div>`).join('')}
        ${showNow ? `<div class="sc-nowline" style="top:${nowTop}px"></div>` : ''}</div>
      </div></div>
      ${!inWeek.length ? `<div class="sc-empty-week">这一周没有课${ts && week < ts ? '<button class="chip-btn glass" id="schedJump">跳到开课第一周</button>' : ''}</div>` : ''}</div>`;
    const grid = body.querySelector('.sc-grid');
    grid.scrollLeft = keepX;
    if (keepY !== null) grid.scrollTop = keepY;
    else if (zoom > 1 && showNow) grid.scrollTop = Math.max(0, nowTop - 140);
    const j = $('#schedJump'); if (j) j.onclick = () => { week = ts; Sched.render(); };
    attachPinch(grid);
  };

  // ---------- 捏合缩放：接近全览时吸附回全览 ----------
  function attachPinch(grid) {
    const inner = grid.querySelector('.sc-inner');
    let p = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    grid.addEventListener('touchstart', e => {
      if (e.touches.length !== 2) return;
      const r = grid.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      p = { d0: dist(e.touches), s: 1, cx, cy, fx: grid.scrollLeft + cx, fy: grid.scrollTop + cy };
      inner.style.transition = 'none';
      inner.style.transformOrigin = `${p.fx}px ${p.fy}px`;
    }, { passive: true });
    grid.addEventListener('touchmove', e => {
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      p.s = Math.max(1 / zoom, Math.min(3.2 / zoom, dist(e.touches) / p.d0));
      inner.style.transform = `scale(${p.s})`;
    }, { passive: false });
    const end = () => {
      if (!p) return;
      const { s: sc, fx, fy, cx, cy } = p; p = null;
      let z = zoom * sc;
      if (z < 1.18) z = 1;                       // 吸附回全览
      else if (Math.abs(z - 2) < .15) z = 2;      // 吸附到两倍
      z = Math.min(3, z);
      const ratio = z / zoom, visual = zoom * sc / z;
      zoom = z;
      Sched.render();
      const g = $('#schedBody .sc-grid'), inn = g.querySelector('.sc-inner');
      g.scrollLeft = fx * ratio - cx; g.scrollTop = fy * ratio - cy;
      // 从松手时的大小平滑过渡到吸附后的大小
      inn.style.transition = 'none';
      inn.style.transformOrigin = `${fx * ratio}px ${fy * ratio}px`;
      inn.style.transform = `scale(${visual})`;
      requestAnimationFrame(() => { inn.style.transition = 'transform .32s cubic-bezier(.25,1.2,.4,1)'; inn.style.transform = 'none'; });
    };
    grid.addEventListener('touchend', end);
    grid.addEventListener('touchcancel', end);
    // 触控板捏合（Mac 上的 Safari 和节律 App 发的是 gesture 事件）：和手指捏合一样
    if (!matchMedia('(pointer: coarse)').matches) {
      grid.addEventListener('gesturestart', e => {
        e.preventDefault();
        if (p) return;
        const r = grid.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
        p = { s: 1, cx, cy, fx: grid.scrollLeft + cx, fy: grid.scrollTop + cy, g: true };
        inner.style.transition = 'none';
        inner.style.transformOrigin = `${p.fx}px ${p.fy}px`;
      });
      grid.addEventListener('gesturechange', e => {
        e.preventDefault();
        if (!p || !p.g) return;
        p.s = Math.max(1 / zoom, Math.min(3.2 / zoom, e.scale));
        inner.style.transform = `scale(${p.s})`;
      });
      grid.addEventListener('gestureend', e => { e.preventDefault(); if (p && p.g) end(); });
      // 保险：万一没收到捏合结束，鼠标一按下就复原
      grid.addEventListener('pointerdown', () => { if (p && p.g) { p = null; inner.style.transition = ''; inner.style.transform = ''; } }, true);
    }
    // 触控板左右轻扫翻周（全览时；放大后左右滑是滚动内容）
    let hx = 0, hLock = false, hT = null;
    grid.addEventListener('wheel', e => {
      if (e.ctrlKey || zoom > 1 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
      e.preventDefault();
      if (hLock) return;
      hx += e.deltaX;
      clearTimeout(hT); hT = setTimeout(() => (hx = 0), 200);
      if (Math.abs(hx) > 60) { shiftWeek(hx > 0 ? 1 : -1); hx = 0; hLock = true; setTimeout(() => (hLock = false), 450); }
    }, { passive: false });
    grid.addEventListener('wheel', e => { // 触控板捏合
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom = Math.max(1, Math.min(3, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      clearTimeout(grid._snap);
      grid._snap = setTimeout(() => { if (zoom < 1.18) zoom = 1; Sched.render(); }, 160);
      Sched.render();
    }, { passive: false });
  }

  Sched.goto = ds => { week = mondayOf(MC.parse(ds)); Sched.render(); };
  function shiftWeek(n) {
    week = MC.addDays(week, 7 * n);
    Sched.render();
    const inn = $('#schedBody .sc-inner'); if (!inn) return;
    inn.style.transition = 'none'; inn.style.transform = `translate3d(${n * 36}px,0,0)`; inn.style.opacity = '.3';
    requestAnimationFrame(() => requestAnimationFrame(() => { inn.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1), opacity .22s'; inn.style.transform = 'none'; inn.style.opacity = '1'; }));
  }
  $('#schedFit').onclick = () => { zoom = 1; Sched.render(); };
  window.addEventListener('resize', () => { if (document.getElementById('page-sched').classList.contains('active')) Sched.render(); });
  $('#schedPrev').onclick = () => shiftWeek(-1);
  $('#schedNext').onclick = () => shiftWeek(1);
  $('#schedThisWeek').onclick = () => { week = mondayOf(new Date()); Sched.render(); };
  // 左右滑动换周：内容跟着手指走，松手后由合成器播放滑出 / 滑入（放大时左右滑动用来滚动内容）
  (() => {
    const el = $('#schedBody');
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, state = 0, inner = null;
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || zoom > 1) { state = 0; return; }
      inner = el.querySelector('.sc-inner'); if (!inner) return;
      state = 1; dx = 0; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now();
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!state || e.touches.length !== 1) { state = 0; return; }
      dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
      if (state === 1) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { state = 0; return; }
        state = 2; inner.style.transition = 'none';
      }
      e.preventDefault();
      inner.style.transform = `translate3d(${dx}px,0,0)`;
      inner.style.opacity = String(1 - Math.min(.35, Math.abs(dx) / 900));
    }, { passive: false });
    const end = () => {
      if (state !== 2) { state = 0; return; }
      state = 0;
      const v = dx / Math.max(1, performance.now() - t0), Wd = el.clientWidth;
      if (Math.abs(dx) > Wd * .22 || Math.abs(v) > .45) {
        const dir = dx < 0 ? 1 : -1;
        inner.style.transition = 'transform .2s cubic-bezier(.3,.7,.4,1), opacity .2s';
        inner.style.transform = `translate3d(${-dir * Wd}px,0,0)`; inner.style.opacity = '0';
        setTimeout(() => {
          week = MC.addDays(week, 7 * dir); Sched.render();
          const n = el.querySelector('.sc-inner'); if (!n) return;
          n.style.transition = 'none'; n.style.transform = `translate3d(${dir * Wd * .35}px,0,0)`; n.style.opacity = '0';
          requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = 'transform .32s cubic-bezier(.2,.9,.25,1), opacity .25s'; n.style.transform = 'none'; n.style.opacity = '1'; }));
        }, 190);
      } else {
        inner.style.transition = 'transform .3s cubic-bezier(.25,1.3,.4,1), opacity .2s';
        inner.style.transform = 'none'; inner.style.opacity = '1';
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  })();

  // ---------- 点「第几周」：月历里选月份和周 ----------
  let pickMonth = null;
  const wk = $('#wkpick'), wkScrim = $('#wkpickScrim');
  function renderWeekPicker() {
    const { y, m } = pickMonth, first = new Date(y, m, 1), start = mondayOf(first), t = MC.todayStr(), ts = termStart();
    let rows = '';
    for (let r = 0; r < 6; r++) {
      const mon = MC.addDays(start, r * 7);
      if (r > 3 && mon.getMonth() !== m) break;
      const cur = MC.ymd(mon) === MC.ymd(week);
      const n = ts ? Math.round((mon - ts) / 6048e5) + 1 : 0;
      let cells = '';
      for (let k = 0; k < 7; k++) {
        const d = MC.addDays(mon, k), ds = MC.ymd(d);
        const has = (MC.data.courses || []).some(c => Sched.on(c, d));
        cells += `<span class="${d.getMonth() !== m ? 'out' : ''}${ds === t ? ' today' : ''}">${d.getDate()}${has ? '<i></i>' : ''}</span>`;
      }
      rows += `<button class="wp-row${cur ? ' on' : ''}" data-mon="${MC.ymd(mon)}"><em>${n >= 1 && n <= 30 ? n : ''}</em>${cells}</button>`;
    }
    wk.innerHTML = `<div class="wp-head"><button class="nav-btn" data-pn="-1" aria-label="上个月">‹</button><b>${y}年${m + 1}月</b><button class="nav-btn" data-pn="1" aria-label="下个月">›</button></div>
      <div class="wp-week"><em>周</em>${[1, 2, 3, 4, 5, 6, 7].map(d => `<span>${DAYS[d]}</span>`).join('')}</div>${rows}`;
  }
  $('#schedWeekBtn').onclick = () => {
    pickMonth = { y: week.getFullYear(), m: MC.addDays(week, 3).getMonth() };
    if (MC.addDays(week, 3).getFullYear() !== pickMonth.y) pickMonth.y = MC.addDays(week, 3).getFullYear();
    renderWeekPicker();
    wk.classList.add('show'); wkScrim.classList.add('show');
  };
  const closeWk = () => { wk.classList.remove('show'); wkScrim.classList.remove('show'); };
  wkScrim.onclick = closeWk;
  wk.addEventListener('click', e => {
    const n = e.target.closest('[data-pn]');
    if (n) { const d = new Date(pickMonth.y, pickMonth.m + Number(n.dataset.pn), 1); pickMonth = { y: d.getFullYear(), m: d.getMonth() }; renderWeekPicker(); return; }
    const r = e.target.closest('[data-mon]');
    if (r) { week = MC.parse(r.dataset.mon); closeWk(); Sched.render(); }
  });

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
      <div class="imp-range" id="impRange" hidden>
        <p class="hint" style="margin:12px 4px 8px">有些课程没有写日期，请选择它们的上课时间：</p>
        <div class="sc-times"><label class="field"><span>从</span><input type="month" id="impFromM"></label><label class="field"><span>到</span><input type="month" id="impToM"></label></div>
        <label class="replace-opt" style="margin:2px 4px 8px"><input type="checkbox" id="impExact"> 精确到具体日期（可选）</label>
        <div class="sc-times" id="impExactBox" hidden><label class="field"><span>开课日期</span><input type="date" id="impFrom"></label><label class="field"><span>结课日期</span><input type="date" id="impTo"></label></div>
      </div>
      <div id="schedPreview"></div>`;
    const ym0 = new Date(), ym1 = new Date(ym0.getFullYear(), ym0.getMonth() + 3, 1);
    $('#impFromM').value = `${ym0.getFullYear()}-${pad(ym0.getMonth() + 1)}`;
    $('#impToM').value = `${ym1.getFullYear()}-${pad(ym1.getMonth() + 1)}`;
    $('#impExact').onchange = () => { $('#impExactBox').hidden = !$('#impExact').checked; preview(); };
    ['impFromM', 'impToM', 'impFrom', 'impTo'].forEach(id => $('#' + id).addEventListener('change', preview));
    $('#schedText').addEventListener('input', () => { parsed = Sched.parseText($('#schedText').value); preview(); });
    $('#schedIcs').onclick = () => $('#schedFile').click();
    $('#schedManual').onclick = () => openEdit(null);
    preview();
    UI.open('schedSheet');
  }
  // 没写日期的课程：用选择的月份（默认整月），勾了「精确」就用具体日期
  function fillDates(list) {
    const box = $('#impRange'); if (!box) return list;
    const missing = list.some(c => !c.from && !c.to);
    box.hidden = !missing;
    if (!missing) return list;
    let from, to;
    if ($('#impExact').checked && $('#impFrom').value) { from = $('#impFrom').value; to = $('#impTo').value || ''; }
    else {
      const fm = $('#impFromM').value, tm = $('#impToM').value;
      from = fm ? `${fm}-01` : '';
      if (tm) { const [y, m] = tm.split('-').map(Number); to = MC.ymd(new Date(y, m, 0)); } else to = '';
    }
    if (from && to && to < from) to = '';
    return list.map(c => (c.from || c.to ? c : { ...c, from, to }));
  }
  function preview() {
    const el = $('#schedPreview');
    if (!parsed.length) { el.innerHTML = ''; $('#schedOk').classList.add('disabled'); return; }
    $('#schedOk').classList.remove('disabled');
    $('#schedOk').textContent = `导入 ${parsed.length} 节`;
    const sorted = fillDates([...parsed]).sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));
    el.innerHTML = `<p class="hint" style="margin:10px 4px 6px">识别到 ${parsed.length} 节课，确认无误后点右上角导入：</p>
      <div class="group">${sorted.map(c => `<div class="grow sc-prev"><i style="background:${colorOf(c.code)}"></i><span><b>${esc(c.code)}</b> ${esc(c.type)}<small>周${DAYS[c.day]} ${MC.fmtRange(c.start, c.end)}${c.room ? ' · ' + esc(c.room) : ''}${c.from ? ` · ${c.from.slice(5).replace('-', '/')}${c.to && c.to !== c.from ? '–' + c.to.slice(5).replace('-', '/') : ''}` : ''}${c.every === 2 ? ' · 隔周' : ''}</small></span></div>`).join('')}</div>`;
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
      <div class="sc-times"><div class="field"><span>开始</span><button type="button" class="sc-tbtn" data-t="scStart">${MC.fmtTime(c ? c.start : '08:30')}</button><input type="hidden" id="scStart" value="${c ? c.start : '08:30'}"></div>
      <div class="field"><span>结束</span><button type="button" class="sc-tbtn" data-t="scEnd">${MC.fmtTime(c ? c.end : '09:50')}</button><input type="hidden" id="scEnd" value="${c ? c.end : '09:50'}"></div></div>
      <div class="group sc-wheel" id="scWheel" hidden></div>
      <label class="field"><span>地点（选填）</span><input id="scRoom" value="${esc(c ? c.room : '')}" placeholder="例如 Tabaret Hall 333"></label>
      <div class="sc-times"><label class="field"><span>开课日期（选填）</span><input id="scFrom" type="date" value="${c ? c.from || '' : ''}"></label>
      <label class="field"><span>结课日期（选填）</span><input id="scTo" type="date" value="${c ? c.to || '' : ''}"></label></div>
      <div class="field"><span>频率</span><div class="seg" id="scEvery"><button data-e="1" class="${!c || c.every !== 2 ? 'on' : ''}">每周</button><button data-e="2" class="${c && c.every === 2 ? 'on' : ''}">隔周</button></div>
      <small class="form-note">隔周以开课日期那一周为第一次上课；不填日期则以本周为第一次。</small></div>
      ${c ? '<button class="pk-clear" id="scDel">删除这节课</button>' : ''}`;
    editEvery = c && c.every === 2 ? 2 : 1;
    // 点开始 / 结束：在下面展开时间滚轮，再点一次收起
    $('#schedForm').querySelectorAll('.sc-tbtn').forEach(btn => btn.onclick = () => {
      const wheel = $('#scWheel'), on = btn.classList.contains('on');
      $('#schedForm').querySelectorAll('.sc-tbtn').forEach(x => x.classList.remove('on'));
      if (on) { wheel.hidden = true; return; }
      btn.classList.add('on'); wheel.hidden = false;
      const inp = $('#' + btn.dataset.t);
      UI.timeWheel(wheel, inp.value, '', t => { inp.value = t; btn.textContent = MC.fmtTime(t); });
    });
    $('#scEvery').onclick = e => { const b = e.target.closest('button'); if (!b) return; editEvery = Number(b.dataset.e); $('#scEvery').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#scDay').onclick = e => { const b = e.target.closest('button'); if (!b) return; editDay = Number(b.dataset.d); $('#scDay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    if (c) $('#scDel').onclick = () => { MC.setCourses(MC.data.courses.filter(x => x.id !== c.id)); UI.close('schedSheet'); UI.toast('已删除'); };
    UI.open('schedSheet');
  }
  $('#schedOk').onclick = () => {
    if (mode === 'import') {
      if (!parsed.length) return;
      const items = fillDates(parsed).map(c => ({ ...c, id: MC.uid() }));
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
    const nxText = !nx ? '本学期已结束' : nx.live ? '正在上课' : (() => { const k = Math.round((nx.d - new Date(new Date().toDateString())) / 864e5); return k === 0 ? '今天 ' + MC.fmtTime(c.start) : k === 1 ? '明天 ' + MC.fmtTime(c.start) : `${nx.d.getMonth() + 1}月${nx.d.getDate()}日（${k} 天后）`; })();
    pop.style.setProperty('--c', col);
    pop.innerHTML = `
      <div class="cp-top"><div class="cp-tag">${esc(c.type || '课程')}${c.every === 2 ? ' · 隔周' : ''}</div><button class="round cp-x" aria-label="关闭"><svg viewBox="0 0 24 24" width="15" height="15"><path d="M6 6l12 12M18 6L6 18" stroke-width="2.4"/></svg></button></div>
      <h3 data-uc>${esc(c.code)}</h3>
      <div class="cp-row"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg><span>周${DAYS[c.day]} ${MC.fmtRange(c.start, c.end, ' – ')}<small>${dur} 分钟</small></span></div>
      ${c.room ? `<div class="cp-row"><svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg><span data-uc>${esc(c.room)}</span></div>` : ''}
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
