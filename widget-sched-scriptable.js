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
const PALETTE = ["#5D7895", "#5F9479", "#C38F45", "#BE6662", "#86769F", "#4E8C92", "#6170A3", "#9A7B5C"];

let forced = null;
String(args.widgetParameter || "").split(/[\s,;，]+/).forEach(p => { if (/^(light|dark)$/i.test(p)) forced = p.toLowerCase(); });
const dyn = (l, d) => forced === "light" ? new Color(l) : forced === "dark" ? new Color(d) : Color.dynamic(new Color(l), new Color(d));
const C = {
  bg: dyn("#F1F2F5", "#1C1C1E"), card: dyn("#FFFFFF", "#2A2B2F"),
  text: dyn("#15171C", "#EFF1F4"), text2: dyn("#777D87", "#8A9099"), accent: dyn("#56789A", "#8FA9C4"),
};
const colorOf = code => { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
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

async function loadCourses() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.cacheDirectory(), "mcal-sched-cache.json");
  if (!CONFIG.GIST_ID || CONFIG.GIST_ID.startsWith("__")) throw new Error("请在月历 设置 → 桌面小组件 里复制「iOS 课表小组件」脚本后重新粘贴。");
  try {
    const req = new Request("https://api.github.com/gists/" + CONFIG.GIST_ID);
    const h = { Accept: "application/vnd.github+json", "User-Agent": "mcal-scriptable" };
    if (CONFIG.TOKEN) h.Authorization = "Bearer " + CONFIG.TOKEN;
    req.headers = h; req.timeoutInterval = 12;
    const g = await req.loadJSON();
    const f = g.files && g.files[FILE];
    if (!f) throw new Error("没有找到月历数据");
    const text = f.truncated ? await new Request(f.raw_url).loadString() : f.content;
    const courses = (JSON.parse(text).courses || []);
    fm.writeString(cache, JSON.stringify(courses));
    return { courses, offline: false };
  } catch (e) {
    if (fm.fileExists(cache)) return { courses: JSON.parse(fm.readString(cache)), offline: true };
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
  if (state) r.backgroundColor = dyn("#E6ECF3", "#2E3A48");
  const bar = r.addStack(); bar.size = new Size(3.5, compact ? 22 : 30); bar.cornerRadius = 2; bar.backgroundColor = new Color(colorOf(c.code));
  r.addSpacer(8);
  const mid = r.addStack(); mid.layoutVertically();
  const top = mid.addStack(); top.centerAlignContent();
  addText(top, c.code, Font.semiboldSystemFont(compact ? 12 : 13.5), C.text, 1);
  if (c.type && !compact) { top.addSpacer(5); addText(top, c.type, Font.systemFont(11), C.text2, 1); }
  addText(mid, `${c.start}–${c.end}${c.room && !compact ? " · " + c.room : ""}`, Font.mediumSystemFont(compact ? 10 : 11), C.text2, 1);
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
  if (family === "large") return monthLayout(w, courses, now, offline);

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
      ch.backgroundColor = new Color(colorOf(c.code)); ch.cornerRadius = 5; ch.setPadding(2, 3, 2, 2);
      const t1 = addText(ch, c.code, Font.semiboldSystemFont(9), Color.white(), 1); t1.minimumScaleFactor = 0.8;
      addText(ch, c.start, Font.mediumSystemFont(8), new Color("#FFFFFF", 0.85), 1);
      const sp = ch.addStack(); sp.addSpacer();
      col.addSpacer(2);
    }
    if (list.length > 4) { const m = col.addStack(); m.addSpacer(); addText(m, `+${list.length - 3}`, Font.mediumSystemFont(8.5), C.text2); m.addSpacer(); }
    col.addSpacer();
  }
  w.addSpacer();
  return w;
}

// 大号：整月课表（每天显示当天的课）
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
      cell.borderColor = dyn("#DEE0E6", "#2E3035"); cell.borderWidth = 0.3;
      const nr = cell.addStack(); nr.addSpacer(2);
      if (ds === today) { const b = nr.addStack(); b.backgroundColor = C.accent; b.cornerRadius = 7; b.setPadding(0, 3, 0, 3); addText(b, String(date.getDate()), Font.boldSystemFont(9.5), Color.white()); }
      else addText(nr, String(date.getDate()), Font.mediumSystemFont(10), out ? C.text2 : C.text);
      nr.addSpacer();
      const list = courses.filter(c => onDate(c, date)).sort((a, b) => toMin(a.start) - toMin(b.start));
      for (const c of list.slice(0, 2)) {
        const ch = cell.addStack(); ch.size = new Size(0, 11); ch.backgroundColor = new Color(colorOf(c.code), out ? 0.45 : 1); ch.cornerRadius = 3; ch.setPadding(0, 2, 0, 1); ch.centerAlignContent();
        const t = addText(ch, c.code, Font.semiboldSystemFont(8), Color.white(), 1); t.minimumScaleFactor = 0.75; ch.addSpacer();
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
