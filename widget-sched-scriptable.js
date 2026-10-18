// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: graduation-cap;

/*
 * 月历 · 课表小组件（Scriptable）
 * 小号：今天的课（今天没课就显示下一个有课的日子），正在上和下一节会突出显示
 * 中号：横向本周课表；大号：整月课表
 * 每节课开始和结束时自动请求刷新；点一下小组件立即刷新并打开课表
 */
const CONFIG = {
  GIST_ID: "__GIST_ID__",
  APP_URL: "__APP_URL__",
  TOKEN: "",
};
const FILE = "mcal-calendar.json";
const WD = ["", "一", "二", "三", "四", "五", "六", "日"];
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
let HUES = new Map();
const TONE_CACHE = new Map();
const setSlots = list => { HUES = courseHues(list.map(c => c.code)); };

let forced = null;
String(args.widgetParameter || "").split(/[\s,;，]+/).forEach(p => { if (/^(light|dark)$/i.test(p)) forced = p.toLowerCase(); });
const dyn = (l, d, a = 1) => forced === "light" ? new Color(l, a) : forced === "dark" ? new Color(d, a) : Color.dynamic(new Color(l, a), new Color(d, a));
const C = {
  bg: dyn("#F4F2EF", "#1B1C21"), card: dyn("#FDFDFB", "#2A2B30"),
  text: dyn("#1B1D22", "#EEEEF1"), text2: dyn("#75777F", "#8C8E97"), accent: dyn("#52618E", "#9FADD5"),
};
const toneOf = code => { const h = HUES.has(code) ? HUES.get(code) : 240; if (!TONE_CACHE.has(h)) TONE_CACHE.set(h, courseTone(h)); return TONE_CACHE.get(h); };
const colorOf = code => toneOf(code).base;
// 小色块：浅色实色 + 白字；深色深色调 + 柔白字（和应用里的事件 / 课程色块一致）
const chipBg = (code, a = 1) => { const t = toneOf(code); return dyn(t.base, t.chipD, a); };
const chipFg = code => { const t = toneOf(code); return dyn("#FFFFFF", t.chipInkD); };
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const isoDay = d => ((d.getDay() + 6) % 7) + 1;
const ymdL = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
// 这一天有没有这节课：星期、起止日期、隔周
function onDate(c, date) {
  if (isoDay(date) !== c.day) return false;
  const ds = ymdL(date);
  if (c.from && ds < c.from) return false;
  if (c.to && ds > c.to) return false;
  if (c.every === 2 && c.from) {
    const [y, m, d] = c.from.split("-").map(Number);
    const w = Math.round((mondayOf(date) - mondayOf(new Date(y, m - 1, d))) / (7 * 864e5));
    if (w % 2) return false;
  }
  return true;
}

// ---------- 12 / 24 小时制：用应用里的设置（同步数据 profile.clock），「跟随地区」时按设备地区 ----------
let CLOCK = "auto";
const region12 = () => {
  try {
    const loc = (typeof Device !== "undefined" && Device.locale ? Device.locale() : (typeof navigator !== "undefined" ? navigator.language : "")) || "";
    const parts = loc.replace("_", "-").split("-"), region = parts.length > 1 ? parts[parts.length - 1] : "";
    const tag = region ? new Intl.Locale("und-" + region).maximize().toString() : loc;
    const o = new Intl.DateTimeFormat(tag || undefined, { hour: "numeric" }).resolvedOptions();
    return o.hourCycle ? /h1[12]/.test(o.hourCycle) : !!o.hour12;
  } catch (e) { return false; }
};
const use12 = () => (CLOCK === "12" ? true : CLOCK === "24" ? false : region12());
const fmtT = (t, noHalf) => { if (!t || !use12()) return t || ""; const [h, m] = t.split(":").map(Number); return (noHalf ? "" : h < 12 ? "上午" : "下午") + (h % 12 || 12) + ":" + String(m).padStart(2, "0"); };
const fmtR = (a, b) => { if (!use12()) return `${a}–${b}`; const same = (+a.slice(0, 2) < 12) === (+b.slice(0, 2) < 12); return `${fmtT(a)}–${fmtT(b, same)}`; };
const hourLabel = h => (use12() ? `${h < 12 ? "上午" : "下午"}${h % 12 || 12}` : `${h}:00`);
async function loadCourses() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), "mcal-sched-cache.json");
  if (!CONFIG.GIST_ID || CONFIG.GIST_ID.startsWith("__")) throw new Error("请在节律 设置 → 桌面小组件 里复制「iOS 课表小组件」脚本后重新粘贴。");
  try {
    const req = new Request("https://api.github.com/gists/" + CONFIG.GIST_ID);
    const h = { Accept: "application/vnd.github+json", "User-Agent": "mcal-scriptable" };
    if (CONFIG.TOKEN) h.Authorization = "Bearer " + CONFIG.TOKEN;
    req.headers = h; req.timeoutInterval = 12;
    const g = await req.loadJSON();
    const f = g.files && g.files[FILE];
    if (!f) throw new Error("没有找到节律数据");
    const text = f.truncated ? await new Request(f.raw_url).loadString() : f.content;
    const data = JSON.parse(text), courses = (data.courses || []), clock = (data.profile && data.profile.clock) || "auto";
    fm.writeString(cache, JSON.stringify({ courses, clock }));
    return { courses, clock, offline: false };
  } catch (e) {
    if (fm.fileExists(cache)) { const c = JSON.parse(fm.readString(cache)); return Array.isArray(c) ? { courses: c, clock: "auto", offline: true } : { ...c, offline: true }; }
    throw e;
  }
}

// 今天的课；今天已经没有课了就找下一个有课的日子
function pickDay(courses, now) {
  const today = isoDay(now), nm = now.getHours() * 60 + now.getMinutes();
  for (let k = 0; k < 15; k++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k), d = isoDay(date);
    let list = courses.filter(c => onDate(c, date)).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (k === 0) { if (list.some(c => toMin(c.end) > nm)) return { label: "今天", day: d, list, isToday: true }; continue; }
    if (list.length) return { label: k === 1 ? "明天" : k < 7 ? `周${WD[d]}` : `${date.getMonth() + 1}月${date.getDate()}日`, day: d, list, isToday: false };
  }
  return null;
}

function addText(st, str, font, color, lines) { const t = st.addText(str); t.font = font; t.textColor = color; if (lines) t.lineLimit = lines; return t; }

function row(parent, c, state, compact) {
  const r = parent.addStack();
  r.centerAlignContent();
  r.setPadding(compact ? 3 : 5, 6, compact ? 3 : 5, 8);
  r.cornerRadius = 10;
  if (state) r.backgroundColor = dyn("#E3E7F2", "#2A3040");
  const bar = r.addStack(); bar.size = new Size(3.5, compact ? 22 : 30); bar.cornerRadius = 2; bar.backgroundColor = dyn(toneOf(c.code).base, toneOf(c.code).barD);
  r.addSpacer(8);
  const mid = r.addStack(); mid.layoutVertically();
  const top = mid.addStack(); top.centerAlignContent();
  addText(top, c.code, Font.semiboldSystemFont(compact ? 12 : 13.5), C.text, 1);
  if (c.type && !compact) { top.addSpacer(5); addText(top, c.type, Font.systemFont(11), C.text2, 1); }
  addText(mid, `${fmtR(c.start, c.end)}${c.room && !compact ? " · " + c.room : ""}`, Font.mediumSystemFont(compact ? 10 : 11), C.text2, 1);
  r.addSpacer();
  if (state) addText(r, state, Font.semiboldSystemFont(10), C.accent);
}

function header(w, title, sub) {
  const h = w.addStack(); h.centerAlignContent();
  addText(h, title, Font.boldSystemFont(15), C.text);
  h.addSpacer(6);
  addText(h, sub, Font.mediumSystemFont(11), C.text2);
  h.addSpacer();
}

function build(family, courses, offline) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  if (!courses.length) { w.setPadding(14, 14, 14, 14); addText(w, "课表", Font.boldSystemFont(15), C.text); w.addSpacer(6); addText(w, "还没有导入课表", Font.systemFont(12), C.text2); return w; }

  if (family === "medium") return weekLayout(w, courses, now, offline);
  if (family === "large") return gridLayout(w, courses, now, offline);

  const pick = pickDay(courses, now);
  w.setPadding(12, 12, 10, 12);
  if (!pick) { addText(w, "最近两周没有课", Font.systemFont(13), C.text2); return w; }
  header(w, pick.label, `周${WD[pick.day]}${offline ? " · 离线" : ""}`);
  w.addSpacer(6);
  let list = pick.list;
  if (pick.isToday) list = list.filter(c => toMin(c.end) > nm); // 已经结束的不再显示
  const max = family === "small" ? 2 : 3;
  let nextMarked = false;
  for (const c of list.slice(0, max)) {
    let state = "";
    if (pick.isToday && nm >= toMin(c.start)) state = "上课中";
    else if (!nextMarked) { state = pick.isToday ? `${Math.max(1, toMin(c.start) - nm) >= 60 ? Math.floor((toMin(c.start) - nm) / 60) + " 小时后" : (toMin(c.start) - nm) + " 分钟后"}` : "第一节"; nextMarked = true; }
    row(w, c, family === "small" ? "" : state, family === "small");
    w.addSpacer(3);
  }
  if (list.length > max) addText(w, `还有 ${list.length - max} 节`, Font.systemFont(10), C.text2);
  w.addSpacer();
  return w;
}

// 中号：横向本周课表（每天一列，周末有课才显示）
function weekLayout(w, courses, now, offline) {
  w.setPadding(10, 8, 8, 8);
  const mon = mondayOf(now), today = ymdL(now);
  const days = [];
  for (let d = 1; d <= 7; d++) {
    const date = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + d - 1);
    const list = courses.filter(c => onDate(c, date)).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (d <= 5 || list.length) days.push({ d, date, list });
  }
  const h = w.addStack(); h.centerAlignContent(); h.addSpacer(4);
  addText(h, "本周课表", Font.boldSystemFont(13), C.accent); h.addSpacer(6);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  addText(h, `${mon.getMonth() + 1}/${mon.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}${offline ? " · 离线" : ""}`, Font.mediumSystemFont(10), C.text2);
  h.addSpacer();
  w.addSpacer(4);
  const row = w.addStack();
  for (const { d, date, list } of days) {
    const col = row.addStack(); col.layoutVertically(); col.size = new Size(0, 0); col.setPadding(2, 1.5, 2, 1.5);
    const isToday = ymdL(date) === today;
    if (isToday) { col.backgroundColor = dyn("#E2E9F1", "#2B3644"); col.cornerRadius = 9; }
    const hd = col.addStack(); hd.addSpacer();
    addText(hd, `周${WD[d]} ${date.getDate()}`, Font.semiboldSystemFont(9.5), isToday ? C.accent : C.text2); hd.addSpacer();
    col.addSpacer(3);
    for (const c of list.slice(0, list.length > 4 ? 3 : 4)) {
      const ch = col.addStack(); ch.layoutVertically(); ch.size = new Size(0, 0);
      ch.backgroundColor = chipBg(c.code); ch.cornerRadius = 5; ch.setPadding(2, 3, 2, 2);
      const t1 = addText(ch, c.code, Font.semiboldSystemFont(9), chipFg(c.code), 1); t1.minimumScaleFactor = 0.8;
      addText(ch, fmtT(c.start, true), Font.mediumSystemFont(8), chipFg(c.code), 1);
      const sp = ch.addStack(); sp.addSpacer();
      col.addSpacer(2);
    }
    if (list.length > 4) { const m = col.addStack(); m.addSpacer(); addText(m, `+${list.length - 3}`, Font.mediumSystemFont(8.5), C.text2); m.addSpacer(); }
    col.addSpacer();
  }
  w.addSpacer();
  return w;
}

// 大号：本周详细课表（时间轴 + 每天一列，课程按上下课时间画成色块）
const LARGE = { 440: [364, 382], 430: [364, 382], 428: [364, 382], 414: [360, 379], 402: [344, 362], 393: [338, 354], 390: [338, 354], 375: [329, 345], 360: [329, 345], 320: [292, 311] };
function gridLayout(w, courses, now, offline) {
  const sw = Math.min(Device.screenSize().width, Device.screenSize().height);
  const key = Object.keys(LARGE).map(Number).sort((a, b) => b - a).find(x => x <= sw) || 320;
  const [W, H] = LARGE[key];
  const dark = forced ? forced === "dark" : Device.isUsingDarkAppearance();
  const P = dark ? { bg: "#1B1C21", text: "#EEEEF1", text2: "#8C8E97", line: "#2F3035", accent: "#9FADD5", today: "#2A3040" }
                 : { bg: "#F4F2EF", text: "#1B1D22", text2: "#75777F", line: "#E2E0DD", accent: "#52618E", today: "#E3E7F2" };
  const mon = mondayOf(now), todayS = ymdL(now);
  const days = [];
  let minH = 8, maxH = 18;
  for (let d = 1; d <= 7; d++) {
    const date = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + d - 1);
    const list = courses.filter(c => onDate(c, date)).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (d <= 5 || list.length) days.push({ d, date, list });
    for (const c of list) { minH = Math.min(minH, Math.floor(toMin(c.start) / 60)); maxH = Math.max(maxH, Math.ceil(toMin(c.end) / 60)); }
  }
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = false; ctx.respectScreenScale = true;
  const pad = 8, axis = 28, headH = 20, dayH = 18;
  const gx = pad + axis, gy = pad + headH + dayH, gw = W - gx - pad, gh = H - gy - pad;
  const colW = gw / days.length, hourH = gh / (maxH - minH);
  const fk = Math.max(.75, Math.min(1.05, colW / 62));
  const text = (t, x, y, w, h, font, color, align) => {
    ctx.setFont(font); ctx.setTextColor(new Color(color));
    if (align === "c") ctx.setTextAlignedCenter(); else if (align === "r") ctx.setTextAlignedRight(); else ctx.setTextAlignedLeft();
    ctx.drawTextInRect(t, new Rect(x, y, w, h));
  };
  const round = (x, y, w, h, r, color) => { const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.setFillColor(new Color(color)); ctx.fillPath(); };
  const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255]; const [ar, ag, ab] = c(A), [br, bg, bb] = c(B); return "#" + [br + (ar - br) * t, bg + (ag - bg) * t, bb + (ab - bb) * t].map(v => Math.round(v).toString(16).padStart(2, "0")).join(""); };

  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  text("本周课表", pad + 4, pad, 80, 18, Font.boldSystemFont(13), P.accent);
  text(`${mon.getMonth() + 1}/${mon.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}${offline ? " · 离线" : ""}`, pad + 70, pad + 2, 160, 16, Font.mediumSystemFont(10), P.text2);
  days.forEach((x, i) => { if (ymdL(x.date) === todayS) round(gx + i * colW + 1, pad + headH, colW - 2, H - pad - (pad + headH), 8, P.today); });
  days.forEach((x, i) => {
    const t = ymdL(x.date) === todayS;
    text(`周${WD[x.d]} ${x.date.getDate()}`, gx + i * colW, pad + headH + 3, colW, 14, t ? Font.boldSystemFont(9.5) : Font.mediumSystemFont(9.5), t ? P.accent : P.text2, "c");
  });
  for (let h = minH; h <= maxH; h++) {
    const y = gy + (h - minH) * hourH;
    ctx.setFillColor(new Color(P.line)); ctx.fillRect(new Rect(gx, y, gw, 0.6));
    if (h < maxH) text(hourLabel(h), pad, y + 1, axis - 4, 12, Font.systemFont(8.5), P.text2, "r");
  }
  for (let i = 1; i < days.length; i++) { ctx.setFillColor(new Color(P.line)); ctx.fillRect(new Rect(gx + i * colW, gy, 0.6, gh)); }
  days.forEach((x, i) => {
    // 同一时间几节课并排
    const L = x.list.map(c => ({ ...c })); let ends = [], gEnd = -1, grp = [];
    const flush = () => { grp.forEach(c => (c._n = ends.length)); grp = []; ends = []; };
    for (const c of L) {
      if (grp.length && toMin(c.start) >= gEnd) { flush(); gEnd = -1; }
      let k = ends.findIndex(e => e <= toMin(c.start)); if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = toMin(c.end); c._k = k; gEnd = Math.max(gEnd, toMin(c.end)); grp.push(c);
    }
    flush();
    for (const c of L) {
      const lw = colW / c._n, x0 = gx + i * colW + c._k * lw + 1.5, y0 = gy + (toMin(c.start) / 60 - minH) * hourH + 1;
      const bw = lw - 3, bh = (toMin(c.end) - toMin(c.start)) / 60 * hourH - 2, tn = toneOf(c.code);
      round(x0, y0, bw, bh, 5, dark ? tn.fillD : tn.fillL);   // 和应用课表一样：淡底 / 深底 + 色条
      round(x0, y0, 3, bh, 1.5, dark ? tn.barD : tn.base);
      let y = y0 + 2;
      const rows = [[c.code, Font.boldSystemFont(10 * fk), dark ? tn.inkD : tn.inkL],
        [c.type, Font.systemFont(8.5 * fk), P.text], [use12() ? `${fmtT(c.start, true)}–${fmtT(c.end, true)}` : `${c.start}–${c.end}`, Font.systemFont(8 * fk), P.text2], [c.room, Font.systemFont(8 * fk), P.text]];
      for (const [t, f, color] of rows) {
        if (!t) continue;
        const lh = f.pointSize ? f.pointSize * 1.25 : 11;
        const h = (f === rows[0][1] ? 10 : 8.5) * fk * 1.3;
        if (y + h > y0 + bh) break;
        text(t, x0 + 5, y, bw - 7, h, f, color);
        y += h;
      }
    }
  });
  w.setPadding(0, 0, 0, 0);
  w.backgroundImage = ctx.getImage();
  return w;
}

// 大号（旧）：整月课表（每天显示当天的课）
function monthLayout(w, courses, now, offline) {
  w.setPadding(8, 3, 2, 3);
  const y = now.getFullYear(), m = now.getMonth(), today = ymdL(now);
  const first = new Date(y, m, 1), off = (first.getDay() + 6) % 7;
  const rows = Math.ceil((off + new Date(y, m + 1, 0).getDate()) / 7);
  const h = w.addStack(); h.centerAlignContent(); h.addSpacer(8);
  addText(h, `${m + 1}月课表`, Font.boldSystemFont(13), C.accent); h.addSpacer(6);
  addText(h, String(y) + (offline ? " · 离线" : ""), Font.mediumSystemFont(10), C.text2); h.addSpacer();
  w.addSpacer(2);
  const wr = w.addStack();
  for (let i = 1; i <= 7; i++) { const c = wr.addStack(); c.size = new Size(0, 12); c.addSpacer(); addText(c, WD[i], Font.mediumSystemFont(8.5), C.text2); c.addSpacer(); }
  const grid = w.addStack(); grid.layoutVertically();
  for (let r = 0; r < rows; r++) {
    const row = grid.addStack(); row.size = new Size(0, 0);
    for (let k = 0; k < 7; k++) {
      const date = new Date(y, m, 1 - off + r * 7 + k), ds = ymdL(date), out = date.getMonth() !== m;
      const cell = row.addStack(); cell.layoutVertically(); cell.size = new Size(0, 0); cell.setPadding(1.5, 1, 0, 1);
      cell.borderColor = dyn("#E2E0DD", "#2F3035"); cell.borderWidth = 0.3;
      const nr = cell.addStack(); nr.addSpacer(2);
      if (ds === today) { const b = nr.addStack(); b.backgroundColor = C.accent; b.cornerRadius = 7; b.setPadding(0, 3, 0, 3); addText(b, String(date.getDate()), Font.boldSystemFont(9.5), Color.white()); }
      else addText(nr, String(date.getDate()), Font.mediumSystemFont(10), out ? C.text2 : C.text);
      nr.addSpacer();
      const list = courses.filter(c => onDate(c, date)).sort((a, b) => toMin(a.start) - toMin(b.start));
      for (const c of list.slice(0, 2)) {
        const ch = cell.addStack(); ch.size = new Size(0, 11); ch.backgroundColor = chipBg(c.code, out ? 0.45 : 1); ch.cornerRadius = 3; ch.setPadding(0, 2, 0, 1); ch.centerAlignContent();
        const t = addText(ch, c.code, Font.semiboldSystemFont(8), chipFg(c.code), 1); t.minimumScaleFactor = 0.75; ch.addSpacer();
        cell.addSpacer(1);
      }
      if (list.length > 2) addText(cell, ` +${list.length - 2}`, Font.mediumSystemFont(7.5), C.text2);
      cell.addSpacer();
    }
  }
  return w;
}

// 下一次需要刷新的时间：最近一节课的开始或结束，最长 30 分钟
function nextRefresh(courses) {
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), today = isoDay(now);
  const marks = courses.filter(c => onDate(c, now)).flatMap(c => [toMin(c.start), toMin(c.end)]).filter(m => m > nm).sort((a, b) => a - b);
  const mins = marks.length ? Math.min(30, marks[0] - nm) : 30;
  return new Date(Date.now() + Math.max(1, mins) * 60000);
}

const family = config.runsInWidget ? (config.widgetFamily || "small") : "small";
let widget, courses = [];
try {
  const r = await loadCourses();
  courses = r.courses;
  CLOCK = r.clock || "auto";
  setSlots(courses);
  widget = build(family, courses, r.offline);
} catch (e) {
  widget = new ListWidget(); widget.backgroundColor = C.bg; widget.setPadding(14, 14, 14, 14);
  addText(widget, "课表", Font.boldSystemFont(15), C.text); widget.addSpacer(6);
  addText(widget, String(e.message || e), Font.systemFont(11), C.text2);
}
widget.url = `scriptable:///run/${encodeURIComponent(Script.name())}?tap=1`;
widget.refreshAfterDate = nextRefresh(courses);

if (args.queryParameters && args.queryParameters.tap === "1") {
  // 点小组件：先拉取最新课表，再打开月历的课表页；回到桌面时小组件会随之刷新
  try { await loadCourses(); } catch (e) {}
  if (CONFIG.APP_URL && !CONFIG.APP_URL.startsWith("__")) Safari.open(CONFIG.APP_URL + "#sched");
} else if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  const a = new Alert(); a.title = "预览哪种尺寸？";
  a.addAction("小号"); a.addAction("中号"); a.addAction("大号"); a.addCancelAction("取消");
  const i = await a.presentSheet();
  if (i >= 0) {
    const fam = ["small", "medium", "large"][i];
    const pw = build(fam, courses, false);
    if (fam === "small") await pw.presentSmall(); else if (fam === "medium") await pw.presentMedium(); else await pw.presentLarge();
  }
}
Script.complete();
