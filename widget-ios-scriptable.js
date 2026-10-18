// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-alt;

/*
 * 月历 · iOS 桌面小组件（Scriptable）
 * 大号：整月日历 + 彩色事件；中号：迷你月历 + 今日列表；小号：今日列表。
 * 小组件「参数」可填：Gist ID、light、dark（用空格隔开），会覆盖下方设置。
 * 浅色 / 深色默认跟随系统。
 */
const CONFIG = {
  GIST_ID: "__GIST_ID__",
  APP_URL: "__APP_URL__",
  WEEK_START: 0, // 0 = 周日开始，1 = 周一开始
  TOKEN: "",     // 可选：填了可避免 GitHub 匿名请求的频率限制
};

const FILE = "mcal-calendar.json";
const PHEX = { 3: "#D9453E", 2: "#D88018", 1: "#3C7DC2", 0: "#979CA2" };
// 深色模式专门设计的深色调 [底色, 文字]，和应用 MC.PAL.dark 一致
const PDARK = { 3: ["#AC312C", "#FFE2DE"], 2: ["#BB6800", "#FCE5D3"], 1: ["#255593", "#DDEBFD"], 0: ["#383B3F", "#E8E9EB"] };
const RANK = p => (p >= 0 && p <= 3 ? p : 0); // 只认 0–3
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const ACCENT_HEX = ["#52618E", "#8E9DCA"]; // 浅色 / 深色

// ---------- 参数 ----------
let gistId = CONFIG.GIST_ID;
let forcedTheme = null;
String(args.widgetParameter || "").split(/[\s,;，]+/).forEach(p => {
  if (/^(light|dark)$/i.test(p)) forcedTheme = p.toLowerCase();
  else if (/^[0-9a-f]{20,}$/i.test(p)) gistId = p;
});

// ---------- 颜色（跟随系统浅色 / 深色） ----------
function dyn(light, dark) {
  if (forcedTheme === "light") return light;
  if (forcedTheme === "dark") return dark;
  return Color.dynamic(light, dark);
}
const hex = (h, a) => (a == null ? new Color(h) : new Color(h, a));
const ACCENT = dyn(hex(ACCENT_HEX[0]), hex(ACCENT_HEX[1]));
const C = {
  bg: dyn(hex("#F4F2EF"), hex("#1B1C21")), // 浅色用柔和的灰白，不刺眼（横条的实色按这两个底色算，改这里要一起改 BG_L / BG_D）
  text: dyn(hex("#1B1D22"), hex("#EEEEF1")),
  text2: dyn(hex("#84868E"), hex("#8C8E97")),
  text3: dyn(hex("#C5C3C0"), hex("#494A50")),
  line: dyn(hex("#E2E0DD"), hex("#2F3035")),
};
// 事件色条，和应用里一致：浅色 = 实色底 + 白字；深色 = 专门的深色调 + 带同色的柔白字（不刺眼）
// 半透明色叠在小组件底色上的实际颜色（不透明）。横条由两段拼成、会有重叠，用不透明色重叠处才不会变亮
function over(h, a, base) {
  const n = parseInt(h.slice(1), 16), b = parseInt(base.slice(1), 16), mix = (x, y) => Math.round(x * a + y * (1 - a));
  return "#" + [mix(n >> 16, b >> 16), mix((n >> 8) & 255, (b >> 8) & 255), mix(n & 255, b & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}
const BG_L = "#F4F2EF", BG_D = "#1B1C21";
// 记录日历的颜色（和应用一致：没设优先级的记录日历事件用日历自己的颜色，深色用同一套算法生成的深色调）
let CALC = new Map();
const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), gam = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function toOklch(hex) {
  const n = parseInt(hex.slice(1), 16), r = lin((n >> 16) / 255), g = lin(((n >> 8) & 255) / 255), b = lin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function fromOklch(L, C, H) { // 超出屏幕色域时降低彩度
  for (let c = C; c >= 0; c -= 0.005) {
    const A = c * Math.cos(H * Math.PI / 180), B = c * Math.sin(H * Math.PI / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (rgb.every(v => v >= -1e-4 && v <= 1.0001)) return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, gam(v))) * 255).toString(16).padStart(2, '0')).join('');
  }
  return '#808080';
}
const toneCache = new Map();
const darkTone = hex => {
  if (toneCache.has(hex)) return toneCache.get(hex);
  const [, c, h] = toOklch(hex), warm = c < 0.03 ? 0 : Math.max(0, Math.min(1, (1 - Math.abs(h - 75) / 50) * 1.6));
  const t = c < 0.03 ? [fromOklch(0.36, c * 0.5, h), fromOklch(0.935, c * 0.3, h)]
    : [fromOklch(0.45 + 0.15 * warm, Math.min(c, 0.15), h), fromOklch(0.935, Math.min(0.035, c * 0.25), h)];
  toneCache.set(hex, t);
  return t;
};
// 新建记录日历的默认颜色：在可选颜色里挑和主日历（四个优先级色、主色）以及已有记录日历最不像的一个（OKLab 距离最大）

const calHex = e => (e.cal && !e.priority && CALC.has(e.cal) ? CALC.get(e.cal) : null);
function barColors(p, done, out, ch) {
  const h = ch || PHEX[p] || PHEX[0], dk = ch ? darkTone(ch) : PDARK[p] || PDARK[0], c = chipColors(p, done, out, ch);
  const bgL = over(h, done ? 0.16 : out ? 0.5 : 1, BG_L), bgD = done ? over(h, 0.26, BG_D) : over(dk[0], out ? 0.45 : 1, BG_D);
  return { bg: dyn(hex(bgL), hex(bgD)), fg: c.fg };
}
function chipColors(p, done, out, ch) {
  const h = ch || PHEX[p] || PHEX[0];
  if (done) return { bg: dyn(hex(h, 0.16), hex(h, 0.26)), fg: dyn(hex(h, out ? 0.45 : 0.75), hex(h, out ? 0.45 : 0.75)) };
  const dk = ch ? darkTone(ch) : PDARK[p] || PDARK[0];
  return { bg: dyn(hex(h, out ? 0.5 : 1), hex(dk[0], out ? 0.45 : 1)), fg: dyn(Color.white(), hex(dk[1], out ? 0.5 : 1)) };
}
// 字重也和应用一致：浅色半粗、深色中等。字体不能随系统深浅自动切换，按参数或当前外观决定
const DARK_UI = forcedTheme ? forcedTheme === "dark" : (() => { try { return Device.isUsingDarkAppearance(); } catch (e) { return false; } })();
const chipFont = fs => (DARK_UI ? Font.mediumSystemFont(fs) : Font.semiboldSystemFont(fs));

// ---------- 日期 ----------
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function monthDays(y, m) {
  const off = (new Date(y, m, 1).getDay() - CONFIG.WEEK_START + 7) % 7;
  const out = [];
  for (let i = 0; i < 42; i++) out.push(new Date(y, m, 1 - off + i));
  return out;
}

// ---------- 数据 ----------
async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), "mcal-widget-cache.json");
  if (!gistId || gistId.startsWith("__")) throw new Error("还没有设置 Gist ID。\n请在节律 App 设置里「复制 iOS 小组件脚本」后重新粘贴，或在小组件参数中填写。");
  try {
    const req = new Request("https://api.github.com/gists/" + gistId);
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "mcal-scriptable" };
    if (CONFIG.TOKEN) headers.Authorization = "Bearer " + CONFIG.TOKEN;
    req.headers = headers;
    req.timeoutInterval = 12;
    const g = await req.loadJSON();
    const f = g.files && g.files[FILE];
    if (!f) throw new Error(g.message || "Gist 中没有节律数据");
    let text = f.content;
    if (f.truncated) text = await new Request(f.raw_url).loadString();
    const data = JSON.parse(text);
    fm.writeString(cachePath, text);
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), offline: true };
    throw e;
  }
}
let SHOWN = new Set();
function indexEvents(events) {
  const by = {};
  for (const e of events) {
    if (e.cal && !SHOWN.has(e.cal)) continue; // 主日历 + 设为在主日历显示的记录日历
    const n = e.days > 1 && !e.time ? e.days : 1, [y, m, d] = e.date.split("-").map(Number);
    for (let k = 0; k < n; k++) { const ds = ymd(new Date(y, m - 1, d + k)); (by[ds] = by[ds] || []).push(e); }
  }
  for (const k in by) by[k].sort((a, b) => (a.done - b.done) || (RANK(b.priority) - RANK(a.priority)) || ((a.createdAt || 0) - (b.createdAt || 0)));
  return by;
}
function monthStats(idx, y, m) {
  const prefix = `${y}-${pad(m + 1)}-`;
  let total = 0, done = 0;
  for (const k in idx) if (k.startsWith(prefix)) { total += idx[k].length; done += idx[k].filter(e => e.done).length; }
  return { total, done };
}

// ---------- 尺寸（按屏幕宽度估算，单位 pt） ----------
const SIZES = { // 屏宽: [小, 中宽, 中高, 大高]
  440: [170, 364, 170, 382], 430: [170, 364, 170, 382], 428: [170, 364, 170, 382],
  414: [169, 360, 169, 379], 402: [162, 346, 162, 362], 393: [158, 338, 158, 354],
  390: [158, 338, 158, 354], 375: [155, 329, 155, 345], 360: [155, 329, 155, 345],
  320: [141, 292, 141, 311],
};
function wsize() {
  const s = Device.screenSize();
  const sw = Math.min(s.width, s.height);
  const keys = Object.keys(SIZES).map(Number).sort((a, b) => b - a);
  const k = keys.find(x => x <= sw) || keys[keys.length - 1];
  const [sm, mw, mh, lh] = SIZES[k];
  const f = 1; // 贴满整个小组件
  return { sm: sm * f, mw: mw * f, mh: mh * f, lh: lh * f };
}

// ---------- 通用部件 ----------
function addText(stack, str, font, color, opts = {}) {
  const t = stack.addText(str);
  t.font = font; t.textColor = color;
  if (opts.lines) t.lineLimit = opts.lines;
  if (opts.opacity != null) t.textOpacity = opts.opacity;
  return t;
}
function chipLabel(e) {
  const m = String(e.title).match(/^\s*([A-Za-z]{2,4})\s?(\d{4})\b/);
  let label = m ? `${m[1].toUpperCase()} ${m[2]}` : e.title;
  if (e.done) label = Array.from(label).map(c => c + "\u0336").join(""); // 已完成：删除线
  return label;
}
function addChip(parent, e, width, h, fs, out) {
  const { bg, fg } = chipColors(e.priority, e.done, out, calHex(e));
  const ch = parent.addStack();
  ch.size = new Size(width, h);
  ch.backgroundColor = bg;
  ch.cornerRadius = 3;
  ch.setPadding(0, 1.5, 0, 0.5);
  ch.centerAlignContent();
  // 课程类标题（如「MAT 2348 Mid」）在小组件里只显示课程编号，避免省略号和多余空白
  const label = chipLabel(e);
  const tx = addText(ch, label, chipFont(fs), fg, { lines: 1 });
  tx.minimumScaleFactor = 0.85;
  ch.addSpacer();
}
function addLine(w, width) {
  const l = w.addStack();
  l.size = new Size(width, 0.5);
  l.backgroundColor = C.line;
  return l;
}
function dayBadge(parent, d, size, fs, isToday, out) {
  const b = parent.addStack();
  b.size = new Size(size, size);
  b.cornerRadius = size / 2;
  b.centerAlignContent();
  if (isToday) b.backgroundColor = ACCENT;
  addText(b, String(d.getDate()), isToday ? Font.boldSystemFont(fs) : Font.mediumSystemFont(fs),
    isToday ? Color.white() : (out ? C.text3 : C.text));
}

// ---------- 大号：整月 ----------
function largeLayout(w, idx, offline) {
  // 仿 TickTick 月历小组件：只显示本月所在的几周，网格线分隔，日期靠左上，事件条铺满格宽
  const S = wsize();
  const padH = 0, padT = 4, padB = 0; // 去掉边距，网格铺满
  w.setPadding(padT, padH, padB, padH);
  const innerW = S.mw - padH * 2;
  const cw = Math.floor(innerW / 7);
  const gridW = cw * 7;
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), t = ymd(now);
  const off = (new Date(y, m, 1).getDay() - CONFIG.WEEK_START + 7) % 7;
  const rows = Math.ceil((off + new Date(y, m + 1, 0).getDate()) / 7); // 本月占几周就显示几行
  const days = monthDays(y, m).slice(0, rows * 7);

  // 标题：居中月份
  const head = w.addStack();
  head.size = new Size(0, 15);
  head.centerAlignContent();
  const st = monthStats(idx, y, m);
  const left = head.addStack(); left.size = new Size(0, 15);
  left.addSpacer(10); addText(left, String(y), Font.mediumSystemFont(9), C.text2); left.addSpacer();
  const mid = head.addStack(); mid.size = new Size(0, 15); mid.addSpacer();
  addText(mid, `${m + 1}月`, Font.boldSystemFont(12.5), ACCENT); mid.addSpacer();
  const right = head.addStack(); right.size = new Size(0, 15); right.addSpacer();
  addText(right, (st.total ? `${st.done}/${st.total}` : '') + (offline ? ' 离线' : ''), Font.mediumSystemFont(9), C.text2); right.addSpacer(10);
  w.addSpacer(1);

  // 星期
  const wr = w.addStack();
  wr.size = new Size(0, 11);
  for (let i = 0; i < 7; i++) {
    const c = wr.addStack(); c.size = new Size(0, 11); c.centerAlignContent(); c.addSpacer();
    addText(c, WD[(i + CONFIG.WEEK_START) % 7], Font.mediumSystemFont(8), C.text2); c.addSpacer();
  }
  w.addSpacer(1);

  const gridH = S.lh - padT - padB - 15 - 1 - 11 - 1;
  // 每周之间、上下各有一条 0.5 的线，也要从高度里扣掉，否则每周会比格子高一点、被下一周盖住
  const rowH = Math.floor((gridH - (rows + 1) * 0.5) / rows);
  const numH = 15, chipH = 13, gap = 1, padTop = 2.5, SEP = 0.5, STEP = chipH + gap;
  const top0 = padTop + numH + 1; // 格子里第一条事件的顶部
  // 能放几行事件：按实际画出来的日期行高度（top0）算，保证「日期 + 事件行」不会超过一周的高度
  const maxChips = Math.max(0, Math.floor((rowH - (2.5 + numH + 1)) / STEP)); // 0 = 一行事件都放不下：只在日期旁标数量
  const colW = (S.mw - SEP * 6) / 7;
  // 每一周按「横带」从上往下搭：日期带 + 若干事件行 + 剩余空白。
  // 跨天事件是横跨几列的一整个 stack（颜色随深浅色自动切换），格子之间的竖线在横条经过处自然断开
  const band = (parent, h) => { const b = parent.addStack(); b.size = new Size(S.mw, h); b.layoutHorizontally(); return b; };
  const sep = (b, h) => { const x = b.addStack(); x.size = new Size(SEP, h); x.backgroundColor = C.line; };
  const box = (b, w, h) => { const x = b.addStack(); x.size = new Size(w, h); x.layoutVertically(); return x; };
  // 今天整列叠一层淡主色（和应用里选中日期的淡底一样），一眼看到今天
  const TODAY_TINT = dyn(hex(ACCENT_HEX[0], 0.12), hex(ACCENT_HEX[1], 0.20));
  const todayCol = dss => dss.indexOf(t);
  const grid = w.addStack();
  grid.layoutVertically();
  addLine(grid, 0);
  for (let r = 0; r < rows; r++) {
    const wk = days.slice(r * 7, r * 7 + 7), dss = wk.map(ymd);
    const lay = layWeek(dss, idx);
    const lim = lay.occ.map(o => (o.length <= maxChips ? o.length : Math.max(0, maxChips - 1)));
    const hidden = lay.occ.map((o, c) => o.slice(lim[c]).filter(Boolean).length);
    const segs = barSegments(lay, dss, lim, m);
    const lanes = Math.min(maxChips, Math.max(0, ...lim.map((l, c) => l + (hidden[c] ? 1 : 0))));
    const row = grid.addStack();
    row.layoutVertically();
    row.size = new Size(S.mw, rowH);
    // 日期
    const nb = band(row, top0);
    for (let c = 0; c < 7; c++) {
      if (c) sep(nb, top0);
      const d = wk[c], out = d.getMonth() !== m, isToday = dss[c] === t;
      const cell = box(nb, colW, top0);
      if (isToday) cell.backgroundColor = TODAY_TINT;
      cell.setPadding(padTop, 1, 0, 1);
      const nr = cell.addStack();
      nr.size = new Size(0, numH);
      nr.centerAlignContent();
      if (isToday) {
        nr.addSpacer(1.5);
        const badge = nr.addStack();
        badge.size = new Size(numH + 3, numH);
        badge.backgroundColor = ACCENT; badge.cornerRadius = numH / 2; badge.centerAlignContent();
        addText(badge, String(d.getDate()), Font.boldSystemFont(10.5), Color.white());
      } else {
        nr.addSpacer(3.5);
        addText(nr, String(d.getDate()), Font.mediumSystemFont(11), out ? C.text3 : C.text);
      }
      if (!maxChips && hidden[c]) { nr.addSpacer(2); addText(nr, `+${hidden[c]}`, isToday ? Font.boldSystemFont(8) : Font.mediumSystemFont(7.5), isToday ? ACCENT : C.text2); }
      nr.addSpacer();
      // 不要在固定高度的格子里放 addSpacer()：它最少占 8pt，会把日期圆圈压扁
    }
    // 事件行
    for (let k = 0; k < lanes; k++) {
      const lb = band(row, STEP);
      for (let c = 0; c < 7;) {
        if (c) sep(lb, STEP);
        const g = segs.find(x => x.s === k && x.a === c);
        if (g) { addBar(lb, g, (g.b - g.a + 1) * colW + (g.b - g.a) * SEP); c = g.b + 1; continue; }
        const cell = box(lb, colW, STEP);
        if (dss[c] === t) cell.backgroundColor = TODAY_TINT;
        cell.setPadding(0, 1, 0, 1);
        const o = lay.occ[c][k], out = wk[c].getMonth() !== m;
        cell.topAlignContent();
        if (k < lim[c] && o && !o.bar) addChip(cell, o.e, 0, chipH, 9, out);
        else if (k === lim[c] && hidden[c]) {
          const mr = cell.addStack(); mr.size = new Size(0, chipH - 2);
          if (dss[c] === t) { // 今天还有放不下的事：主色小标签，比其他日子的灰色「+n」醒目
            const pill = mr.addStack(); pill.backgroundColor = ACCENT; pill.cornerRadius = 4; pill.setPadding(0, 3, 0, 3); pill.centerAlignContent();
            addText(pill, `+${hidden[c]}`, Font.boldSystemFont(8), Color.white());
          } else addText(mr, `+${hidden[c]}`, Font.mediumSystemFont(7.5), C.text2);
          mr.addSpacer();
        }
        c++;
      }
    }
    // 剩下的空白（竖线照常）
    const rest = rowH - top0 - lanes * STEP;
    if (rest > 0) {
      const fb = band(row, rest);
      for (let c = 0; c < 7; c++) { if (c) sep(fb, rest); const bx = box(fb, colW, rest); if (dss[c] === t) bx.backgroundColor = TODAY_TINT; }
    }
    addLine(grid, 0);
  }
}

// 一整条横条。只有一边延续时，用「平的一小段 + 圆角段」稍微叠在一起，做出一边方、一边圆
function addBar(parent, g, width) {
  const e = g.e, { bg, fg } = barColors(e.priority, e.done, g.out, calHex(e)), h = 13, R = 3;
  const outer = parent.addStack();
  outer.size = new Size(width, h + 1);
  outer.layoutVertically();
  const bar = outer.addStack();
  bar.size = new Size(width, h);
  bar.setPadding(0, g.ol ? 0 : 1, 0, g.or ? 0 : 1);
  outer.topAlignContent(); // 不用 addSpacer()（最少 8pt，会把横条压扁）
  const flat = () => { const f = bar.addStack(); f.size = new Size(R + 1, h); f.backgroundColor = bg; };
  if (g.ol !== g.or) bar.spacing = -R; // 平的一段和圆角段重叠 R，盖住圆角那一侧
  if (g.ol && !g.or) flat();
  const body = bar.addStack();
  body.size = new Size(0, h);
  body.backgroundColor = bg;
  body.cornerRadius = g.ol && g.or ? 0 : R;
  body.setPadding(0, g.ol && !g.or ? 0.5 : 1.5, 0, 0.5);
  body.centerAlignContent();
  const tx = addText(body, chipLabel(e), chipFont(9), fg, { lines: 1 });
  tx.minimumScaleFactor = 0.85;
  body.addSpacer();
  if (g.or && !g.ol) flat();
}

// ---------- 跨天的全天事件：一周里连成一条横条 ----------
const spans = e => e.days > 1 && !e.time;
const endOf = e => { const [y, m, d] = e.date.split("-").map(Number); return ymd(new Date(y, m - 1, d + e.days - 1)); };
// 排位：跨天事件先占上面几行（开始早、跨得长的在上），单天事件依次填进空位
function layWeek(dss, idx) {
  const evsBy = dss.map(ds => idx[ds] || []);
  const multi = new Map();
  evsBy.forEach((evs, c) => evs.forEach(e => {
    if (!spans(e)) return;
    const b = multi.get(e); if (b) b.c1 = c; else multi.set(e, { bar: true, e, c0: c, c1: c });
  }));
  const occ = dss.map(() => []);
  const bars = [...multi.values()].sort((a, b) => (a.c0 - b.c0) || ((b.c1 - b.c0) - (a.c1 - a.c0)));
  for (const b of bars) {
    let s = 0; while (occ.slice(b.c0, b.c1 + 1).some(o => o[s])) s++;
    b.s = s; for (let c = b.c0; c <= b.c1; c++) occ[c][s] = b;
  }
  evsBy.forEach((evs, c) => evs.forEach(e => { if (multi.has(e)) return; let s = 0; while (occ[c][s]) s++; occ[c][s] = { e }; }));
  return { bars, occ };
}
// 横条在「+n」挡住的日子断开；延续到上一周 / 下一周的一端是平的
function barSegments(lay, dss, lim, month) {
  const out = [];
  for (const b of lay.bars) {
    for (let c = b.c0; c <= b.c1;) {
      if (b.s >= lim[c]) { c++; continue; }
      let d = c; while (d + 1 <= b.c1 && b.s < lim[d + 1]) d++;
      const allOut = dss.slice(c, d + 1).every(ds => Number(ds.slice(5, 7)) - 1 !== month);
      out.push({ e: b.e, s: b.s, a: c, b: d, ol: dss[c] !== b.e.date, or: dss[d] !== endOf(b.e), out: allOut });
      c = d + 1;
    }
  }
  return out;
}

// ---------- 中号：迷你月历 + 今日 ----------
function mediumLayout(w, idx, offline) {
  const S = wsize();
  const padH = 10, padV = 10;
  w.setPadding(padV, padH, padV, padH);
  const innerW = S.mw - padH * 2;
  const leftW = Math.floor(innerW * 0.55);
  const rightW = innerW - leftW - 10;
  const cw = Math.floor(leftW / 7);
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), t = ymd(now);

  const body = w.addStack();
  body.size = new Size(innerW, S.mh - padV * 2);
  const left = body.addStack();
  left.size = new Size(leftW, S.mh - padV * 2);
  left.layoutVertically();
  body.addSpacer(10);
  const right = body.addStack();
  right.size = new Size(rightW, S.mh - padV * 2);
  right.layoutVertically();

  // 左：迷你月历
  const lh = left.addStack();
  lh.centerAlignContent();
  addText(lh, `${m + 1}月`, Font.boldSystemFont(12), C.text);
  lh.addSpacer();
  const st = monthStats(idx, y, m);
  if (st.total) addText(lh, `${st.done}/${st.total}`, Font.mediumSystemFont(9), C.text2);
  left.addSpacer(2);
  const wr = left.addStack();
  for (let i = 0; i < 7; i++) {
    const c = wr.addStack(); c.size = new Size(cw, 10); c.centerAlignContent();
    addText(c, WD[(i + CONFIG.WEEK_START) % 7], Font.systemFont(7.5), C.text2);
  }
  const rowH = Math.floor((S.mh - padV * 2 - 16 - 10 - 2) / 6);
  const days = monthDays(y, m);
  for (let r = 0; r < 6; r++) {
    const row = left.addStack();
    row.size = new Size(cw * 7, rowH);
    for (let c = 0; c < 7; c++) {
      const d = days[r * 7 + c], ds = ymd(d), out = d.getMonth() !== m;
      const cell = row.addStack();
      cell.size = new Size(cw, 0);
      cell.layoutVertically();
      const nr = cell.addStack(); nr.size = new Size(cw, rowH - 4);
      nr.addSpacer(); dayBadge(nr, d, Math.min(rowH - 4, 14), 8.5, ds === t, out); nr.addSpacer();
      const dr = cell.addStack(); dr.size = new Size(cw, 3); dr.spacing = 1.5;
      dr.addSpacer();
      (idx[ds] || []).slice(0, 3).forEach(e => {
        const dot = dr.addStack();
        dot.size = new Size(3, 3); dot.cornerRadius = 1.5;
        dot.backgroundColor = hex(PHEX[e.priority] || PHEX[0], e.done || out ? 0.3 : 1);
      });
      dr.addSpacer();
    }
  }

  // 右：今日 + 接下来
  const today = idx[t] || [];
  const rh = right.addStack();
  rh.centerAlignContent();
  addText(rh, `今天 · 周${WD[now.getDay()]}`, Font.boldSystemFont(12), C.text);
  rh.addSpacer();
  if (today.length) addText(rh, `${today.filter(e => e.done).length}/${today.length}`, Font.mediumSystemFont(9), C.text2);
  right.addSpacer(5);
  let lines = 0; const MAX = 6;
  const showN = today.length > MAX ? MAX - 1 : today.length;
  for (const e of today.slice(0, showN)) { listLine(right, e, rightW, null); lines++; }
  if (today.length > showN) { addText(right, `今天还有 ${today.length - showN} 项`, Font.semiboldSystemFont(9.5), ACCENT); lines++; }
  if (!today.length) { addText(right, "今天没有事件", Font.systemFont(11), C.text2); right.addSpacer(4); lines++; }
  if (lines < MAX) {
    const upcoming = [];
    for (let i = 1; i <= 21 && upcoming.length < MAX - lines; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      for (const e of idx[ymd(d)] || []) if (!e.done && upcoming.length < MAX - lines) upcoming.push([d, e]);
    }
    if (upcoming.length && lines < MAX - 1) {
      addText(right, "接下来", Font.semiboldSystemFont(9), C.text2);
      right.addSpacer(3);
      for (const [d, e] of upcoming.slice(0, MAX - lines - 1)) listLine(right, e, rightW, `${d.getMonth() + 1}/${d.getDate()}`);
    }
  }
  right.addSpacer();
  if (offline) addText(right, "离线 · 显示缓存", Font.systemFont(8), C.text2);
}

function listLine(parent, e, width, prefix) {
  const r = parent.addStack();
  r.size = new Size(width, 14);
  r.centerAlignContent();
  const bar = r.addStack();
  bar.size = new Size(3, 11); bar.cornerRadius = 1.5;
  bar.backgroundColor = hex(PHEX[e.priority] || PHEX[0], e.done ? 0.35 : 1);
  r.addSpacer(5);
  if (prefix) { addText(r, prefix + " ", Font.mediumSystemFont(10), C.text2); }
  addText(r, (e.done ? "✓ " : "") + e.title, Font.mediumSystemFont(11), e.done ? C.text2 : C.text, { lines: 1, opacity: e.done ? 0.7 : 1 });
  r.addSpacer();
  parent.addSpacer(2);
}

// ---------- 小号：今日 ----------
function smallLayout(w, idx, offline) {
  w.setPadding(12, 12, 12, 12);
  const S = wsize();
  const width = S.sm - 24;
  const now = new Date(), t = ymd(now);
  const head = w.addStack();
  head.bottomAlignContent();
  addText(head, String(now.getDate()), Font.boldSystemFont(26), ACCENT);
  head.addSpacer(5);
  const hv = head.addStack(); hv.layoutVertically();
  addText(hv, `周${WD[now.getDay()]}`, Font.semiboldSystemFont(11), C.text);
  addText(hv, `${now.getMonth() + 1}月`, Font.systemFont(10), C.text2);
  head.addSpacer();
  w.addSpacer(6);
  const today = idx[t] || [];
  if (!today.length) {
    addText(w, "今天没有事件", Font.systemFont(11), C.text2);
    const next = [];
    for (let i = 1; i <= 14 && next.length < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      for (const e of idx[ymd(d)] || []) if (!e.done && next.length < 3) next.push([d, e]);
    }
    if (next.length) { w.addSpacer(4); next.forEach(([d, e]) => listLine(w, e, width, `${d.getMonth() + 1}/${d.getDate()}`)); }
  } else {
    today.slice(0, 5).forEach(e => listLine(w, e, width, null));
    if (today.length > 5) addText(w, `今天还有 ${today.length - 5} 项`, Font.semiboldSystemFont(9.5), ACCENT);
  }
  w.addSpacer();
  if (offline) addText(w, "离线", Font.systemFont(8), C.text2);
}

// ---------- 锁屏 ----------
function accessoryLayout(w, idx) {
  const today = idx[ymd(new Date())] || [];
  const left = today.filter(e => !e.done);
  addText(w, today.length ? `今天 ${today.length - left.length}/${today.length} 完成` : "今天无事件", Font.semiboldSystemFont(12), Color.white());
  left.slice(0, 2).forEach(e => addText(w, e.title, Font.systemFont(11), Color.white(), { lines: 1, opacity: 0.8 }));
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 14, 14, 14);
  addText(w, "节律", Font.boldSystemFont(14), C.text);
  w.addSpacer(6);
  addText(w, msg, Font.systemFont(11), C.text2);
  return w;
}

// ---------- 主程序 ----------
const family = config.runsInWidget ? (config.widgetFamily || "large") : "large";
let widget;
try {
  const { data, offline } = await loadData();
  const idx = (SHOWN = new Set((data.cals || []).filter(c => c && c.showInMain).map(c => c.id)), CALC = new Map((data.cals || []).filter(c => c && c.color).map(c => [c.id, c.color.toUpperCase()])), indexEvents(data.events || []));
  widget = new ListWidget();
  widget.backgroundColor = C.bg;
  if (family === "large" || family === "extraLarge") largeLayout(widget, idx, offline);
  else if (family === "medium") mediumLayout(widget, idx, offline);
  else if (family === "small") smallLayout(widget, idx, offline);
  else accessoryLayout(widget, idx);
} catch (e) {
  widget = errorWidget(String(e.message || e));
}
// 点小组件：在 Scriptable 里先拉取最新数据，再打开月历；回到桌面时小组件通常会随之刷新
widget.url = `scriptable:///run/${encodeURIComponent(Script.name())}?tap=1`;
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (args.queryParameters && args.queryParameters.tap === "1") {
  try { await loadData(); } catch (e) {}
  if (CONFIG.APP_URL && !CONFIG.APP_URL.startsWith("__")) Safari.open(CONFIG.APP_URL);
} else if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // 在 Scriptable 里直接运行时预览
  const a = new Alert();
  a.title = "预览哪种尺寸？";
  a.addAction("大号"); a.addAction("中号"); a.addAction("小号"); a.addCancelAction("取消");
  const i = await a.presentSheet();
  if (i >= 0) {
    const fam = ["large", "medium", "small"][i];
    let pw;
    try {
      const { data, offline } = await loadData();
      const idx = (SHOWN = new Set((data.cals || []).filter(c => c && c.showInMain).map(c => c.id)), CALC = new Map((data.cals || []).filter(c => c && c.color).map(c => [c.id, c.color.toUpperCase()])), indexEvents(data.events || []));
      pw = new ListWidget(); pw.backgroundColor = C.bg;
      if (fam === "large") largeLayout(pw, idx, offline);
      else if (fam === "medium") mediumLayout(pw, idx, offline);
      else smallLayout(pw, idx, offline);
    } catch (e) { pw = errorWidget(String(e.message || e)); }
    if (fam === "large") await pw.presentLarge();
    else if (fam === "medium") await pw.presentMedium();
    else await pw.presentSmall();
  }
}
Script.complete();
