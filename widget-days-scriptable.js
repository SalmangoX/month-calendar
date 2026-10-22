// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: heart;

/*
 * 节律 · 纪念日小组件（Scriptable）
 * 小号：置顶（没有置顶就是最近的）一个日子，大数字；中号 / 大号：再列出接下来的几个。
 * 和应用 js/days.js 同一套算法和配色：未来 = 静蓝，过去 = 赭石，高亮色照用。
 * 小组件「参数」可填：Gist ID、light、dark（用空格隔开），会覆盖下方设置。
 */
const CONFIG = {
  GIST_ID: "__GIST_ID__",
  APP_URL: "__APP_URL__",
  TOKEN: "", // 可选：填了可避免 GitHub 匿名请求的频率限制
};
const FILE = "mcal-calendar.json";

// ---------- 语言（和应用一致：同步数据里的 profile.lang） ----------
let LANG = "zh-Hans";
function setLang(p) {
  let l = p && p !== "auto" ? p : "";
  if (!l) {
    const s = String(Device.language() || "").toLowerCase();
    l = s.startsWith("zh") ? (/tw|hk|mo|hant/.test(s) ? "zh-Hant" : "zh-Hans") : s.startsWith("fr") ? "fr" : "en";
  }
  LANG = ["zh-Hans", "zh-Hant", "en", "fr"].includes(l) ? l : "zh-Hans";
}
const TR = {
  "zh-Hant": { "纪念日": "紀念日", "还有": "還有", "已经": "已經", "周": "週", "个月": "個月", "每周": "每週", "离线": "離線", "还没有日子\n打开节律添加纪念日": "還沒有日子\n打開節律新增紀念日", "还没有设置 Gist ID。\n请在节律 设置里复制纪念日小组件脚本后重新粘贴。": "還沒有設定 Gist ID。\n請在節律 設定裡複製紀念日小元件指令碼後重新貼上。", "节律": "節律", "预览哪种尺寸？": "預覽哪種尺寸？", "大号": "大號", "中号": "中號", "小号": "小號", "Gist 中没有节律数据": "Gist 中沒有節律資料" },
  en: { "纪念日": "Days", "还有": "Coming up in", "已经": "It’s been", "第": "Day", "就是今天": "It’s today", "今天": "Today", "天": "days", "周": "weeks", "个月": "months", "年": "years", "每周": "Weekly", "每月": "Monthly", "每年": "Yearly", "离线": "Offline", "还没有日子\n打开节律添加纪念日": "No days yet\nOpen Cadence to add one", "还没有设置 Gist ID。\n请在节律 设置里复制纪念日小组件脚本后重新粘贴。": "No Gist ID yet.\nCopy the days widget script in Cadence Settings and paste it again.", "节律": "Cadence", "预览哪种尺寸？": "Preview which size?", "大号": "Large", "中号": "Medium", "小号": "Small", "取消": "Cancel", "Gist 中没有节律数据": "No Cadence data in this Gist" },
  fr: { "纪念日": "Jours", "还有": "Dans", "已经": "Depuis", "第": "Jour", "就是今天": "C’est aujourd’hui", "今天": "Aujourd’hui", "天": "jours", "周": "semaines", "个月": "mois", "年": "ans", "每周": "Chaque semaine", "每月": "Chaque mois", "每年": "Chaque année", "离线": "Hors ligne", "还没有日子\n打开节律添加纪念日": "Aucun jour\nOuvrez Cadence pour en ajouter", "还没有设置 Gist ID。\n请在节律 设置里复制纪念日小组件脚本后重新粘贴。": "Pas d’identifiant Gist.\nCopiez le script du widget dans les Réglages de Cadence et recollez-le.", "节律": "Cadence", "预览哪种尺寸？": "Quelle taille ?", "大号": "Grand", "中号": "Moyen", "小号": "Petit", "取消": "Annuler", "Gist 中没有节律数据": "Aucune donnée Cadence dans ce Gist" },
};
const tr = s => (TR[LANG] && TR[LANG][s]) || s;
const isZh = () => LANG.startsWith("zh");

// ---------- 参数 ----------
let gistId = CONFIG.GIST_ID, forcedTheme = null;
String(args.widgetParameter || "").split(/[\s,;，]+/).forEach(p => {
  if (/^(light|dark)$/i.test(p)) forcedTheme = p.toLowerCase();
  else if (/^[0-9a-f]{20,}$/i.test(p)) gistId = p;
});

// ---------- 颜色（和应用、安卓小组件一致） ----------
const dyn = (l, d) => (forcedTheme === "light" ? l : forcedTheme === "dark" ? d : Color.dynamic(l, d));
const hex = (h, a) => (a == null ? new Color(h) : new Color(h, a));
const C = {
  bg: dyn(hex("#ECF2F5"), hex("#1B1C21")),
  text: dyn(hex("#171B20"), hex("#EEEEF1")),
  text2: dyn(hex("#747B83"), hex("#8C8E97")),
  line: dyn(hex("#DAE1E5"), hex("#2F3035")),
  fut: dyn(hex("#4776B4"), hex("#8EB0E6")),
  past: dyn(hex("#B6733B"), hex("#E2A673")),
};
// 高亮色的深色调（和应用 MC.darkTone 同一算法：OKLCH 明度 0.45，橙黄一带提亮）
const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), gam = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function darkTone(h) {
  const n = parseInt(h.slice(1), 16), r = lin((n >> 16) / 255), g = lin(((n >> 8) & 255) / 255), b = lin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B), H = (Math.atan2(B, A) * 180 / Math.PI + 360) % 360, warm = c < 0.03 ? 0 : Math.max(0, Math.min(1, (1 - Math.abs(H - 75) / 50) * 1.6));
  const L = c < 0.03 ? 0.36 : 0.45 + 0.15 * warm, CC = c < 0.03 ? c * 0.5 : Math.min(c, 0.15);
  for (let k = CC; k >= 0; k -= 0.005) {
    const a2 = k * Math.cos(H * Math.PI / 180), b2 = k * Math.sin(H * Math.PI / 180);
    const l3 = (L + 0.3963377774 * a2 + 0.2158037573 * b2) ** 3, m3 = (L - 0.1055613458 * a2 - 0.0638541728 * b2) ** 3, s3 = (L - 0.0894841775 * a2 - 1.291485548 * b2) ** 3;
    const rgb = [4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3];
    if (rgb.every(v => v >= -1e-4 && v <= 1.0001)) return "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, gam(v))) * 255).toString(16).padStart(2, "0")).join("");
  }
  return h;
}
const hlColor = h => dyn(hex(h), hex(darkTone(h)));

// ---------- 日期（和 js/days.js 一致） ----------
const DAY = 864e5;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const t0 = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const utc = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
const diffDays = (a, b) => Math.round(utc(b) - utc(a));
const clamp = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));
function occurrence(x, from) {
  const b = parse(x.date);
  if (!x.rep || b >= from) return b;
  if (x.rep === "week") return new Date(b.getFullYear(), b.getMonth(), b.getDate() + Math.ceil(diffDays(b, from) / 7) * 7);
  if (x.rep === "month") { let d = clamp(from.getFullYear(), from.getMonth(), b.getDate()); if (d < from) d = clamp(from.getFullYear(), from.getMonth() + 1, b.getDate()); return d; }
  let d = clamp(from.getFullYear(), b.getMonth(), b.getDate()); if (d < from) d = clamp(from.getFullYear() + 1, b.getMonth(), b.getDate()); return d;
}
function ymdDiff(a, b) {
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}
function info(x) {
  const today = t0(), occ = occurrence(x, today), diff = diffDays(today, occ);
  return { occ, diff, state: diff > 0 ? "fut" : diff === 0 ? "today" : "past" };
}
function amount(x, inf) {
  if (inf.state === "today") return { num: tr("今天"), unit: "" };
  const past = inf.state === "past", n = Math.abs(inf.diff) + (past && x.from1 ? 1 : 0);
  const dd = past ? ymdDiff(inf.occ, t0()) : ymdDiff(t0(), inf.occ);
  if (x.unit === "w" && n >= 7) return { num: Math.floor(n / 7), unit: tr("周") };
  if (x.unit === "m" && dd.y * 12 + dd.m >= 1) return { num: dd.y * 12 + dd.m, unit: tr("个月") };
  if (x.unit === "y" && dd.y >= 1) return { num: dd.y, unit: tr("年") };
  return { num: n, unit: past && x.from1 && !isZh() ? "" : tr("天") };
}
const stateWord = (x, inf) => tr(inf.state === "today" ? "就是今天" : inf.state === "fut" ? "还有" : x.from1 ? "第" : "已经");
const tone = (x, inf) => (x.hl ? hlColor(x.hl) : inf.state === "past" ? C.past : C.fut);
function dateLine(x, d) {
  const loc = { "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", en: "en", fr: "fr" }[LANG];
  let s = new Intl.DateTimeFormat(loc, { year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(d);
  if (x.rep) s += " · " + tr({ week: "每周", month: "每月", year: "每年" }[x.rep]);
  return s;
}

// ---------- 数据 ----------
async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.cacheDirectory(), "mcal-days-widget-cache.json");
  if (!gistId || gistId.startsWith("__")) throw new Error(tr("还没有设置 Gist ID。\n请在节律 设置里复制纪念日小组件脚本后重新粘贴。"));
  try {
    const req = new Request("https://api.github.com/gists/" + gistId);
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "mcal-scriptable" };
    if (CONFIG.TOKEN) headers.Authorization = "Bearer " + CONFIG.TOKEN;
    req.headers = headers; req.timeoutInterval = 12;
    const g = await req.loadJSON();
    const f = g.files && g.files[FILE];
    if (!f) throw new Error(g.message || tr("Gist 中没有节律数据"));
    const text = f.truncated ? await new Request(f.raw_url).loadString() : f.content;
    const data = JSON.parse(text);
    setLang(data.profile && data.profile.lang);
    fm.writeString(cachePath, text);
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) { const data = JSON.parse(fm.readString(cachePath)); setLang(data.profile && data.profile.lang); return { data, offline: true }; }
    throw e;
  }
}
// 置顶的放在最前，其次是最近的未来，再是最近的过去
function ordered(data) {
  const cals = new Set((data.cals || []).filter(c => c && c.kind === "days").map(c => c.id));
  const list = (data.days || []).filter(x => x && cals.has(x.cal) && /^\d{4}-\d{2}-\d{2}$/.test(x.date || "")).map(x => ({ x, inf: info(x) }));
  const fut = list.filter(o => o.inf.state !== "past").sort((a, b) => a.inf.diff - b.inf.diff);
  const past = list.filter(o => o.inf.state === "past").sort((a, b) => b.inf.diff - a.inf.diff);
  const pin = list.filter(o => o.x.pin).sort((a, b) => (b.x.updatedAt || 0) - (a.x.updatedAt || 0))[0];
  const hero = pin || fut[0] || past[0];
  return hero ? [hero, ...[...fut, ...past].filter(o => o !== hero)] : [];
}

// ---------- 画面 ----------
function addText(stack, str, font, color, lines) {
  const t = stack.addText(String(str)); t.font = font; t.textColor = color; if (lines) t.lineLimit = lines; return t;
}
const rounded = (size, weight = "bold") => { try { return Font[weight === "bold" ? "boldRoundedSystemFont" : "semiboldRoundedSystemFont"](size); } catch (e) { return Font.boldSystemFont(size); } };
function hero(parent, o, big) {
  const { x, inf } = o, a = amount(x, inf), col = tone(x, inf);
  addText(parent, x.title || "—", Font.semiboldSystemFont(big ? 14 : 13), C.text, 1);
  parent.addSpacer(big ? 6 : 4);
  addText(parent, stateWord(x, inf), Font.semiboldSystemFont(11), col, 1);
  const row = parent.addStack(); row.bottomAlignContent();
  const n = addText(row, a.num, rounded(inf.state === "today" ? 30 : big ? 46 : 40), inf.state === "today" ? col : C.text, 1);
  n.minimumScaleFactor = 0.5;
  if (a.unit) { row.addSpacer(3); const u = row.addStack(); u.setPadding(0, 0, big ? 7 : 6, 0); addText(u, a.unit, Font.semiboldSystemFont(12), C.text2, 1); }
  addText(parent, dateLine(x, inf.occ), Font.systemFont(10), C.text2, 1);
}
function line(parent, o) {
  const { x, inf } = o, a = amount(x, inf), col = tone(x, inf);
  const r = parent.addStack(); r.centerAlignContent(); r.spacing = 8;
  const bar = r.addStack(); bar.size = new Size(3.5, 26); bar.cornerRadius = 1.75; bar.backgroundColor = col;
  const t = r.addStack(); t.layoutVertically();
  addText(t, x.title || "—", Font.mediumSystemFont(12), C.text, 1);
  addText(t, stateWord(x, inf) + " · " + dateLine(x, inf.occ), Font.systemFont(9.5), C.text2, 1);
  r.addSpacer();
  addText(r, a.num, rounded(16), col, 1);
  if (a.unit) addText(r, a.unit, Font.mediumSystemFont(9.5), C.text2, 1);
}
function build(w, family, list, offline) {
  w.backgroundColor = C.bg;
  if (!list.length) {
    w.setPadding(14, 14, 14, 14);
    addText(w, tr("纪念日"), Font.boldSystemFont(14), C.text); w.addSpacer(6);
    addText(w, tr("还没有日子\n打开节律添加纪念日"), Font.systemFont(11), C.text2);
    return;
  }
  if (family === "small") {
    w.setPadding(14, 14, 12, 14);
    hero(w, list[0], false);
    w.url = `${CONFIG.APP_URL}#days-${list[0].x.id}`;
  } else if (family === "medium") {
    w.setPadding(14, 16, 14, 16);
    const h = w.addStack(); h.spacing = 14;
    const l = h.addStack(); l.layoutVertically(); l.size = new Size(130, 0); hero(l, list[0], false);
    const div = h.addStack(); div.size = new Size(0.5, 108); div.backgroundColor = C.line;
    const r = h.addStack(); r.layoutVertically(); r.spacing = 4;
    list.slice(1, 4).forEach(o => line(r, o));
    if (list.length === 1) r.addSpacer();
  } else {
    w.setPadding(16, 16, 14, 16);
    hero(w, list[0], true);
    w.addSpacer(10);
    const sep = w.addStack(); sep.size = new Size(0, 0.5); sep.backgroundColor = C.line;
    w.addSpacer(8);
    list.slice(1, 8).forEach(o => { line(w, o); w.addSpacer(4); });
  }
  w.addSpacer();
  if (offline) addText(w, tr("离线"), Font.systemFont(8), C.text2);
}

// ---------- 主程序 ----------
const family = config.runsInWidget ? (config.widgetFamily || "small") : "medium";
async function make(fam) {
  const w = new ListWidget();
  try { const { data, offline } = await loadData(); build(w, fam, ordered(data), offline); }
  catch (e) { w.backgroundColor = C.bg; w.setPadding(14, 14, 14, 14); addText(w, tr("节律"), Font.boldSystemFont(14), C.text); w.addSpacer(6); addText(w, String(e.message || e), Font.systemFont(11), C.text2); }
  if (!w.url && CONFIG.APP_URL && !CONFIG.APP_URL.startsWith("__")) w.url = CONFIG.APP_URL + "#days";
  // 午夜换日时刷新（数字每天变一次）
  const mid = t0(); mid.setDate(mid.getDate() + 1); mid.setMinutes(1);
  w.refreshAfterDate = new Date(Math.min(mid.getTime(), Date.now() + 30 * 60 * 1000));
  return w;
}
if (config.runsInWidget) Script.setWidget(await make(family));
else {
  const a = new Alert(); a.title = tr("预览哪种尺寸？");
  a.addAction(tr("大号")); a.addAction(tr("中号")); a.addAction(tr("小号")); a.addCancelAction(tr("取消"));
  const i = await a.presentSheet();
  if (i >= 0) { const fam = ["large", "medium", "small"][i]; const w = await make(fam); if (fam === "large") await w.presentLarge(); else if (fam === "medium") await w.presentMedium(); else await w.presentSmall(); }
}
Script.complete();
