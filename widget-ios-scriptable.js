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
const PHEX = { 3: "#E05A55", 2: "#E3A040", 1: "#4B82E8", 0: "#8D929B" };
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const ACCENT_HEX = ["#56789A", "#6A8AAB"]; // 浅色 / 深色

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
  bg: dyn(hex("#FFFFFF"), hex("#1C1C1E")),
  text: dyn(hex("#1C1C1E"), hex("#F2F2F5")),
  text2: dyn(hex("#86868C"), hex("#8E8E93")),
  text3: dyn(hex("#C3C3C8"), hex("#4A4A4F")),
  line: dyn(hex("#E6E7EB"), hex("#2E3035")),
};
function chipColors(p, done, out) {
  const h = PHEX[p] || PHEX[0];
  if (done) return { bg: dyn(hex(h, 0.16), hex(h, 0.26)), fg: dyn(hex(h, out ? 0.45 : 0.75), hex(h, out ? 0.45 : 0.75)) };
  return { bg: hex(h, out ? 0.5 : 1), fg: Color.white() };
}

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
  if (!gistId || gistId.startsWith("__")) throw new Error("还没有设置 Gist ID。\n请在月历 App 设置里「复制 iOS 小组件脚本」后重新粘贴，或在小组件参数中填写。");
  try {
    const req = new Request("https://api.github.com/gists/" + gistId);
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "mcal-scriptable" };
    if (CONFIG.TOKEN) headers.Authorization = "Bearer " + CONFIG.TOKEN;
    req.headers = headers;
    req.timeoutInterval = 12;
    const g = await req.loadJSON();
    const f = g.files && g.files[FILE];
    if (!f) throw new Error(g.message || "Gist 中没有月历数据");
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
function indexEvents(events) {
  const by = {};
  for (const e of events) (by[e.date] = by[e.date] || []).push(e);
  for (const k in by) by[k].sort((a, b) => (a.done - b.done) || (b.priority - a.priority) || ((a.createdAt || 0) - (b.createdAt || 0)));
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
  const f = 0.97; // 留一点余量，避免被系统压缩
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
function addChip(parent, e, width, h, fs, out) {
  const { bg, fg } = chipColors(e.priority, e.done, out);
  const ch = parent.addStack();
  ch.size = new Size(width, h);
  ch.backgroundColor = bg;
  ch.cornerRadius = 3;
  ch.setPadding(0, 1.5, 0, 1);
  ch.centerAlignContent();
  const tx = addText(ch, e.title, Font.semiboldSystemFont(fs), fg, { lines: 1 });
  tx.minimumScaleFactor = 0.72; // 宁可略缩小，也要把课程编号（如 ABC 1010）显示完整
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
  const padH = 6, padT = 8, padB = 6;
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
  head.size = new Size(gridW, 20);
  head.centerAlignContent();
  const st = monthStats(idx, y, m);
  const left = head.addStack(); left.size = new Size(gridW / 3, 20);
  addText(left, String(y), Font.mediumSystemFont(10), C.text2); left.addSpacer();
  const mid = head.addStack(); mid.size = new Size(gridW / 3, 20); mid.addSpacer();
  addText(mid, `${m + 1}月`, Font.boldSystemFont(15), ACCENT); mid.addSpacer();
  const right = head.addStack(); right.size = new Size(gridW / 3, 20); right.addSpacer();
  addText(right, (st.total ? `${st.done}/${st.total}` : '') + (offline ? ' 离线' : ''), Font.mediumSystemFont(10), C.text2);
  w.addSpacer(4);

  // 星期
  const wr = w.addStack();
  wr.size = new Size(gridW, 13);
  for (let i = 0; i < 7; i++) {
    const c = wr.addStack(); c.size = new Size(cw, 13); c.centerAlignContent();
    addText(c, WD[(i + CONFIG.WEEK_START) % 7], Font.mediumSystemFont(9), C.text2);
  }
  w.addSpacer(2);

  const gridH = S.lh - padT - padB - 20 - 4 - 13 - 2;
  const rowH = Math.floor(gridH / rows);
  const numH = 14, chipH = 11, gap = 1.5;
  const maxChips = Math.max(1, Math.floor((rowH - numH - 3) / (chipH + gap)));
  const grid = w.addStack();
  grid.layoutVertically();
  grid.size = new Size(gridW, rowH * rows);
  grid.borderColor = C.line; grid.borderWidth = 0.5; grid.cornerRadius = 6;
  for (let r = 0; r < rows; r++) {
    const row = grid.addStack();
    row.size = new Size(gridW, rowH);
    for (let c = 0; c < 7; c++) {
      const d = days[r * 7 + c], ds = ymd(d), out = d.getMonth() !== m, isToday = ds === t;
      const cell = row.addStack();
      cell.size = new Size(cw, rowH);
      cell.layoutVertically();
      cell.borderColor = C.line; cell.borderWidth = 0.25;
      cell.setPadding(2, 1.5, 1, 1.5);
      // 日期：靠左上；今天用主色实心圆
      const nr = cell.addStack();
      nr.size = new Size(cw - 3, numH);
      nr.centerAlignContent();
      if (isToday) {
        const badge = nr.addStack();
        badge.size = new Size(numH + 2, numH);
        badge.backgroundColor = ACCENT; badge.cornerRadius = numH / 2; badge.centerAlignContent();
        addText(badge, String(d.getDate()), Font.boldSystemFont(9.5), Color.white());
      } else {
        nr.addSpacer(2);
        addText(nr, String(d.getDate()), Font.mediumSystemFont(10), out ? C.text3 : C.text);
      }
      nr.addSpacer();
      cell.addSpacer(2);
      const evs = idx[ds] || [];
      const fit = evs.length <= maxChips ? evs.length : maxChips - 1;
      for (let k = 0; k < fit; k++) { addChip(cell, evs[k], cw - 3, chipH, 7.5, out); cell.addSpacer(gap); }
      if (fit < evs.length) {
        const mr = cell.addStack(); mr.size = new Size(cw - 3, chipH - 1);
        addText(mr, `+${evs.length - fit}`, Font.mediumSystemFont(7.5), C.text2); mr.addSpacer();
      }
      cell.addSpacer();
    }
  }
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
      cell.size = new Size(cw, rowH);
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
  for (const e of today) { if (lines >= MAX) break; listLine(right, e, rightW, null); lines++; }
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
    if (today.length > 5) addText(w, `还有 ${today.length - 5} 项`, Font.systemFont(9), C.text2);
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
  addText(w, "月历", Font.boldSystemFont(14), C.text);
  w.addSpacer(6);
  addText(w, msg, Font.systemFont(11), C.text2);
  return w;
}

// ---------- 主程序 ----------
const family = config.runsInWidget ? (config.widgetFamily || "large") : "large";
let widget;
try {
  const { data, offline } = await loadData();
  const idx = indexEvents(data.events || []);
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
      const idx = indexEvents(data.events || []);
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
