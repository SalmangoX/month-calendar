/* 月历 · 数据层：本地存储、合并、加密令牌、GitHub Gist 同步 */
(() => {
  'use strict';
  const MC = (window.MC = {});
  MC.VERSION = '0.22.0';

  const DATA_KEY = 'mcal.data.v1';
  const SET_KEY = 'mcal.settings.v1';
  const GIST_FILE = 'mcal-calendar.json';
  const GIST_DESC = '节律 App 数据（请勿手动修改）';

  // ---------- 优先级 ----------
  MC.PRI = [
    { v: 3, name: '高', full: '高优先级', quad: '重要且紧急', roman: 'Ⅰ', color: 'var(--p3)' },
    { v: 2, name: '中', full: '中优先级', quad: '重要不紧急', roman: 'Ⅱ', color: 'var(--p2)' },
    { v: 1, name: '低', full: '低优先级', quad: '不重要但紧急', roman: 'Ⅲ', color: 'var(--p1)' },
    { v: 0, name: '无', full: '无优先级', quad: '不重要不紧急', roman: 'Ⅳ', color: 'var(--p0)' },
  ];
  MC.priOf = v => MC.PRI.find(p => p.v === v) || MC.PRI[3];

  // ---------- 颜色：浅色用 styles.css 里的 --p*；深色每个优先级有专门设计的深色调（OKLCH 里定的） ----------
  // 不是把浅色压暗（那样会发灰发棕，像氧化了），而是保持彩度、暖色适当提亮
  MC.PAL = {
    light: { 3: '#D9453E', 2: '#D88018', 1: '#3C7DC2', 0: '#979CA2' },
    dark: { 3: ['#AC312C', '#FFE2DE'], 2: ['#BB6800', '#FCE5D3'], 1: ['#255593', '#DDEBFD'], 0: ['#383B3F', '#E8E9EB'] }, // [底色, 文字]
  };
  // 任意颜色（记录日历自定义的颜色）按同一规则生成深色调：OKLCH 明度 0.45（橙黄一带提到约 0.6），彩度最多 0.15，文字是带同色的柔白
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
  MC.darkTone = hex => {
    if (toneCache.has(hex)) return toneCache.get(hex);
    const [, c, h] = toOklch(hex), warm = c < 0.03 ? 0 : Math.max(0, Math.min(1, (1 - Math.abs(h - 75) / 50) * 1.6));
    const t = c < 0.03 ? [fromOklch(0.36, c * 0.5, h), fromOklch(0.935, c * 0.3, h)]
      : [fromOklch(0.45 + 0.15 * warm, Math.min(c, 0.15), h), fromOklch(0.935, Math.min(0.035, c * 0.25), h)];
    toneCache.set(hex, t);
    return t;
  };
  // 新建记录日历的默认颜色：在可选颜色里挑和主日历（四个优先级色、主色）以及已有记录日历最不像的一个（OKLab 距离最大）
  MC.suggestCalColor = (used = []) => {
    const lab = h => { const [L, C, H] = toOklch(h); return [L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)]; };
    const dist = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100; };
    const main = [...Object.values(MC.PAL.light), '#4C6EAC'];      // 四个优先级色 + 主色（固定值，不随深浅色变）
    const free = MC.CAL_COLORS.filter(c => !used.includes(c));
    const pool = free.length ? free : MC.CAL_COLORS;
    // 先排除离主日历颜色太近的（ΔE < 11），再在剩下的里挑离主日历和已有记录日历都最远的
    const ok = pool.filter(c => Math.min(...main.map(m => dist(c, m))) >= 11);
    let best = (ok.length ? ok : pool)[0], score = -1;
    for (const c of ok.length ? ok : pool) {
      const d = Math.min(...[...main, ...used].map(m => dist(c, m)));
      if (d > score) { score = d; best = c; }
    }
    return best;
  };
  // 色条上要写的颜色变量：--c 浅色用；--cf / --ci 深色用
  MC.toneVars = e => {
    const c = MC.evColor(e), m = /^var\(--p(\d)\)$/.exec(c);
    const [f, i] = m ? MC.PAL.dark[m[1]] : MC.darkTone(c);
    return `--c:${c};--cf:${f};--ci:${i}`;
  };

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
    : [{ v: null, label: '无' }, { v: 0, label: `当天 ${MC.fmtTime('09:00')}` }, { v: 1440, label: `提前 1 天 ${MC.fmtTime('09:00')}` },
       { v: 2880, label: `提前 2 天 ${MC.fmtTime('09:00')}` }, { v: 10080, label: `提前 1 周 ${MC.fmtTime('09:00')}` }];
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
  // ---------- 12 / 24 小时制 ----------
  // 默认按设备所在地区（比如加拿大、美国用 12 小时制，中国大陆、欧洲大部分用 24 小时制），设置里可以改
  MC.region12 = (() => {
    let v = null;
    return () => {
      if (v !== null) return v;
      try {
        const lang = (navigator.languages && navigator.languages[0]) || navigator.language || 'zh-CN';
        const region = new Intl.Locale(lang).maximize().region;
        const loc = region ? new Intl.Locale('und-' + region).maximize().toString() : lang;
        const o = new Intl.DateTimeFormat(loc, { hour: 'numeric' }).resolvedOptions();
        v = o.hourCycle ? /h1[12]/.test(o.hourCycle) : !!o.hour12;
      } catch (e) {
        try { v = !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; } catch (e2) { v = false; }
      }
      return v;
    };
  })();
  // 12 / 24 小时制存在同步数据里（profile.clock），小组件和其他设备都按同一个设置显示；旧版只存在本机设置里
  MC.clockPref = () => (MC.data && MC.data.profile && MC.data.profile.clock) || MC.settings.clock || 'auto';
  MC.use12 = () => { const c = MC.clockPref(); return c === '12' ? true : c === '24' ? false : MC.region12(); };
  const half = h => (h < 12 ? '上午' : '下午');
  // '14:30' → '下午2:30'（12 小时制）或 '14:30'；noHalf：省略上午 / 下午
  // 中文：「下午2:30」；英文 / 法文：「2:30 PM」（noHalf：省略上午 / 下午或 AM / PM）
  const zh = () => MC.isZh !== false;
  MC.fmtTime = (t, noHalf) => {
    if (!t || !MC.use12()) return t || '';
    const [h, m] = t.split(':').map(Number), hm = (h % 12 || 12) + ':' + pad(m);
    if (noHalf) return hm;
    return zh() ? half(h) + hm : `${hm} ${h < 12 ? 'AM' : 'PM'}`;
  };
  MC.fmtRange = (a, b, sep = '–') => {
    if (!b) return MC.fmtTime(a);
    if (!MC.use12()) return `${a}${sep}${b}`;
    const same = half(+a.slice(0, 2)) === half(+b.slice(0, 2));
    return zh() ? `${MC.fmtTime(a)}${sep}${MC.fmtTime(b, same)}` : `${MC.fmtTime(a, same)}${sep}${MC.fmtTime(b)}`;
  };
  // 课表时间轴、时间滚轮上的「上午 9」/「9 AM」
  MC.hourLabel = (h, small) => (zh() ? (small ? `<small>${half(h)}</small>${h % 12 || 12}` : `${half(h)} ${h % 12 || 12}`) : (small ? `${h % 12 || 12}<small> ${h < 12 ? 'AM' : 'PM'}</small>` : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`));
  MC.timeLabel = e => e.time ? MC.fmtRange(e.time, e.endTime) : '';

  // ---------- 数据 ----------
  function blank() { return { version: 3, updatedAt: 0, events: [], deleted: {}, profile: { name: '', avatar: '', clock: '', lang: '', updatedAt: 0 }, daily: { on: false, time: '13:00', tz: '', updatedAt: 0 }, courses: [], coursesAt: 0, cals: [], days: [], books: [], album: { gist: '', owner: '' } }; }
  function normEvent(e) {
    const t = Date.now();
    return {
      id: e.id || MC.uid(), date: e.date, title: String(e.title || '').slice(0, 200),
      priority: [0, 1, 2, 3].includes(Number(e.priority)) ? Number(e.priority) : (Number(e.priority) === 4 && (MC.fixPri = true), 0), // 4 = 已取消的绿色优先级，改为无
      done: !!e.done, note: String(e.note || ''),
      time: /^\d{2}:\d{2}$/.test(e.time || '') ? e.time : '',
      endTime: /^\d{2}:\d{2}$/.test(e.endTime || '') && e.time ? e.endTime : '',
      remind: e.remind === null || e.remind === undefined || e.remind === '' ? null : Number(e.remind),
      days: /^\d{2}:\d{2}$/.test(e.time || '') ? 1 : Math.max(1, Math.min(60, parseInt(e.days, 10) || 1)),
      series: e.series || '',
      cal: typeof e.cal === 'string' ? e.cal.slice(0, 40) : '', // 所属日历：'' = 主日历，其余为特殊记录日历的 id
      rep: e.rep && e.rep.freq ? { freq: e.rep.freq, forever: !!e.rep.forever } : null,
      createdAt: e.createdAt || t, updatedAt: e.updatedAt || e.createdAt || t,
    };
  }
  MC.normalize = d => {
    const out = blank();
    out.updatedAt = d.updatedAt || 0;
    out.deleted = d.deleted || {};
    out.events = (d.events || []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map(normEvent);
    if (d.profile) out.profile = { name: d.profile.name || '', avatar: d.profile.avatar || '', clock: ['auto', '12', '24'].includes(d.profile.clock) ? d.profile.clock : '', lang: ['auto', 'zh-Hans', 'zh-Hant', 'en', 'fr'].includes(d.profile.lang) ? d.profile.lang : '', updatedAt: d.profile.updatedAt || 0 };
    if (Array.isArray(d.courses)) out.courses = d.courses.filter(c => c && c.code && c.day >= 1 && c.day <= 7 && /^\d{2}:\d{2}$/.test(c.start) && /^\d{2}:\d{2}$/.test(c.end))
      .map(c => ({ id: c.id || MC.uid(), code: String(c.code).slice(0, 40), type: c.type || '', day: Number(c.day), start: c.start, end: c.end, room: c.room || '',
        from: /^\d{4}-\d{2}-\d{2}$/.test(c.from || '') ? c.from : '', to: /^\d{4}-\d{2}-\d{2}$/.test(c.to || '') ? c.to : '', every: c.every === 2 ? 2 : 1 }));
    out.coursesAt = d.coursesAt || 0;
    if (Array.isArray(d.cals)) out.cals = d.cals.filter(c => c && c.id && typeof c.id === 'string').map(normCal);
    if (Array.isArray(d.days)) out.days = d.days.filter(x => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')).map(normDay);
    if (Array.isArray(d.books)) out.books = d.books.filter(x => x && x.id).map(normBook);
    if (d.album && d.album.gist) out.album = { gist: String(d.album.gist), owner: String(d.album.owner || '') };
    if (d.daily) out.daily = { on: !!d.daily.on, time: /^\d{2}:\d{2}$/.test(d.daily.time || '') ? d.daily.time : '13:00', tz: d.daily.tz || '', updatedAt: d.daily.updatedAt || 0 };
    return out;
  };
  // ---------- 特殊记录日历 ----------
  // 记录日历可选的 14 种颜色：12 个色相（OKLCH 明度 0.60、彩度 0.11，跳过会发橄榄色的黄绿一带）+ 两种中性灰，
  // 和整套配色同一个体系；浅色时白字都清楚，深色时用 MC.darkTone 生成同色的深色调
  MC.CAL_COLORS = ['#B76271', '#B86652', '#B06F35', '#539156', '#269573', '#009390', '#138DB1', '#4086BD', '#607EC2', '#8074BD', '#9B6AAB', '#AE648F', '#656970', '#627887'];
  MC.MAIN_CAL = { id: '', name: '主日历', color: 'var(--accent)' };
  function normCal(c) {
    const t = Date.now();
    return { id: String(c.id).slice(0, 40), name: String(c.name || '记录').slice(0, 24), color: /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : MC.CAL_COLORS[0],
      showInMain: !!c.showInMain, // 事件也显示在主日历里
      notify: !!c.notify,         // 这个日历的事件到点提醒
      kind: c.kind === 'days' ? 'days' : '', // 'days' = 纪念日历（倒数日 / 纪念日），其余为记录日历
      createdAt: c.createdAt || t, updatedAt: c.updatedAt || c.createdAt || t };
  }
  // ---------- 纪念日历：日子、分类 ----------
  // 日子：date 目标日 / 起始日；time 精确到分钟（选填）；rep 每周 / 每月 / 每年重复；book 分类；icon 图标（内置名或一个表情）；
  // cover 主题图片；hl 高亮颜色；pin 置顶；unit 显示单位；from1 起始日算第 1 天；notes 小纸条；photos 相册（图片本身存在单独的 Gist，见 days.js）
  const DAY_UNITS = ['d', 'w', 'm', 'y'];
  // 1.2.0 的线条图标名 → 彩色表情（之后只存表情）
  MC.DAY_LEGACY_ICONS = { heart: '❤️', ring: '💍', cake: '🎂', gift: '🎁', people: '👫', smile: '😊', home: '🏡', star: '⭐️', plane: '✈️', train: '🚄', car: '🚗', bag: '🧳',
    mountain: '🏔️', sea: '🏖️', pin: '📍', cap: '🎓', book: '📚', paper: '📝', case: '💼', clock: '⏰', flag: '🚩', music: '🎵', mic: '🎤', film: '🎬', game: '🎮',
    camera: '📷', gym: '🏋️', plant: '🌱', coffee: '☕️', paw: '🐾', cat: '🐱', dog: '🐶', lantern: '🏮', tree: '🎄', moon: '🌕', spark: '🎆' };
  function normDay(x) {
    const t = Date.now();
    return {
      id: String(x.id).slice(0, 40), cal: String(x.cal || '').slice(0, 40), title: String(x.title || '').slice(0, 120),
      date: x.date, time: /^\d{2}:\d{2}$/.test(x.time || '') ? x.time : '',
      rep: ['week', 'month', 'year'].includes(x.rep) ? x.rep : '',
      book: String(x.book || '').slice(0, 40), icon: String(x.icon || '').slice(0, 24), // 图标名（旧版存过表情，days.js 会换回对应图标）
      cover: /^(p[a-z0-9]{4,40}|c:#[0-9a-fA-F]{6})$/.test(x.cover || '') ? x.cover : '', // 主题图片：照片 id 或 c:#颜色
      cat: String(x.cat || '').slice(0, 16), sub: String(x.sub || '').slice(0, 40), // 大类、细分（细分是内置的 cat.xxx 或自定义细分 book 的 id）
      hl: /^#[0-9a-fA-F]{6}$/.test(x.hl || '') ? x.hl : '', pin: !!x.pin,
      unit: DAY_UNITS.includes(x.unit) ? x.unit : 'd', from1: !!x.from1,
      notes: (Array.isArray(x.notes) ? x.notes : []).filter(n => n && n.id).slice(0, 300)
        .map(n => ({ id: String(n.id).slice(0, 40), text: String(n.text || '').slice(0, 2000), at: Number(n.at) || t })),
      photos: (Array.isArray(x.photos) ? x.photos : []).filter(p => p && p.id).slice(0, 300)
        .map(p => ({ id: String(p.id).slice(0, 40), at: Number(p.at) || t, w: Number(p.w) || 0, h: Number(p.h) || 0 })),
      createdAt: x.createdAt || t, updatedAt: x.updatedAt || x.createdAt || t,
    };
  }
  function normBook(b) {
    const t = Date.now();
    return { id: String(b.id).slice(0, 40), cal: String(b.cal || '').slice(0, 40), name: String(b.name || '').slice(0, 24), cat: String(b.cat || 'other').slice(0, 16), // 自定义细分属于哪个大类
      createdAt: b.createdAt || t, updatedAt: b.updatedAt || b.createdAt || t };
  }
  MC.normDay = normDay;
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
        add.push(MC.makeEvent({ id, cal: e.cal, date: ds, title: e.title, note: e.note, priority: e.priority, days: e.days, time: e.time, endTime: e.endTime, remind: e.remind, series: sid, rep: e.rep, done: false }));
      }
    }
    if (add.length) MC.addEvents(add);
  };

  MC.settings = Object.assign(
    { theme: 'auto', weekStart: 0, view: 'month', tab3: 'quad', activeCal: '', clock: 'auto', gistId: '', lastSync: 0, vault: null, tokenPlain: '', quadShowDone: false, notify: false, vapidPrivate: '', deviceId: '', account: '' },
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
  // 当前在日历页显示的是哪个日历（'' = 主日历）。每个日历的事件各自独立：
  // 日历页只显示当前日历；主日历还会带上打开了「在主日历显示」的记录日历；
  // 今日页、四象限、每日提醒只看主日历自己的事件。
  MC.cal = id => (id ? MC.data.cals.find(c => c.id === id) : MC.MAIN_CAL) || null;
  MC.activeCal = () => (MC.settings.activeCal && MC.cal(MC.settings.activeCal) ? MC.settings.activeCal : '');
  MC.setActiveCal = id => { MC.settings.activeCal = id || ''; MC.saveSettings(); MC.reindex(); };
  MC.inCal = (e, id) => (e.cal || '') === (id || '');
  MC.mainEvents = () => MC.data.events.filter(e => !e.cal);
  // 记录日历的事件是否提醒：主日历永远提醒（由通知总开关控制），记录日历看自己的开关
  MC.notifies = e => !e.cal || !!(MC.cal(e.cal) || {}).notify;
  // 事件颜色：记录日历里没设优先级的事件用日历颜色
  MC.evColor = e => (e.cal && !e.priority && MC.cal(e.cal) ? MC.cal(e.cal).color : MC.priOf(e.priority).color);
  MC.byDate = new Map();    // 当前日历
  MC.mainByDate = new Map(); // 主日历自己的事件（待办）
  function indexOf(list) {
    const m = new Map();
    for (const e of list) {
      const n = e.days > 1 ? e.days : 1, d0 = parse(e.date);
      for (let k = 0; k < n; k++) { // 多天的全天事件出现在跨越的每一天
        const ds = k ? ymd(MC.addDays(d0, k)) : e.date;
        if (!m.has(ds)) m.set(ds, []);
        m.get(ds).push(e);
      }
    }
    for (const arr of m.values()) arr.sort(cmp);
    return m;
  }
  MC.reindex = () => {
    const act = MC.activeCal();
    const shown = new Set(MC.data.cals.filter(c => c.showInMain).map(c => c.id));
    MC.inMainView = e => !e.cal || shown.has(e.cal);   // 主日历看到的：主日历自己的 + 设为「在主日历显示」的记录日历
    MC.mainByDate = indexOf(MC.data.events.filter(e => !e.cal));
    MC.mainViewByDate = shown.size ? indexOf(MC.data.events.filter(MC.inMainView)) : MC.mainByDate;
    MC.byDate = act ? indexOf(MC.data.events.filter(e => e.cal === act)) : MC.mainViewByDate;
  };
  MC.reindex();
  MC.eventsOn = ds => MC.byDate.get(ds) || [];      // 当前日历
  MC.mainOn = ds => MC.mainByDate.get(ds) || [];    // 主日历自己的事件
  MC.mainViewOn = ds => MC.mainViewByDate.get(ds) || []; // 主日历看到的（含设为在主日历显示的记录日历）
  MC.countIn = id => (id && (MC.cal(id) || {}).kind === 'days'
    ? MC.data.days.filter(x => x.cal === id).length
    : MC.data.events.reduce((n, e) => n + (MC.inCal(e, id) ? 1 : 0), 0));

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
  // 撤销删除：放回原来的事件。updatedAt 要比删除时间新，其他设备同步时才会保留它
  MC.restoreEvents = list => {
    const t = Date.now() + 1, have = new Set(MC.data.events.map(e => e.id));
    for (const e of list) { delete MC.data.deleted[e.id]; if (!have.has(e.id)) MC.data.events.push({ ...e, updatedAt: t }); }
    MC.commit();
  };
  MC.setProfile = fields => { Object.assign(MC.data.profile, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.setCourses = list => { MC.data.courses = list; MC.data.coursesAt = Date.now(); MC.commit(); };
  MC.addCal = (name, color, opts = {}) => {
    const c = normCal({ id: 'c' + MC.uid(), name, color, ...opts });
    MC.data.cals.push(c); MC.commit(); return c;
  };
  MC.updateCal = (c, fields) => { Object.assign(c, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.deleteCal = id => { // 连同里面的事件一起删除
    const t = Date.now();
    for (const e of MC.data.events) if (e.cal === id) MC.data.deleted[e.id] = t;
    MC.data.events = MC.data.events.filter(e => e.cal !== id);
    for (const x of MC.data.days) if (x.cal === id) MC.data.deleted['day:' + x.id] = t;
    for (const b of MC.data.books) if (b.cal === id) MC.data.deleted['book:' + b.id] = t;
    MC.data.days = MC.data.days.filter(x => x.cal !== id);
    MC.data.books = MC.data.books.filter(b => b.cal !== id);
    MC.data.cals = MC.data.cals.filter(c => c.id !== id);
    MC.data.deleted['cal:' + id] = t;
    if (MC.settings.activeCal === id) { MC.settings.activeCal = ''; MC.saveSettings(); }
    MC.commit();
  };
  MC.addDay = fields => { const x = normDay({ ...fields, id: 'd' + MC.uid(), createdAt: Date.now(), updatedAt: Date.now() }); MC.data.days.push(x); MC.commit(); return x; };
  MC.updateDay = (x, fields) => { Object.assign(x, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.deleteDay = x => { MC.data.days = MC.data.days.filter(y => y.id !== x.id); MC.data.deleted['day:' + x.id] = Date.now(); MC.commit(); };
  MC.addBook = (cal, name, cat = 'other') => { const b = normBook({ id: 'b' + MC.uid(), cal, name, cat }); MC.data.books.push(b); MC.commit(); return b; };
  MC.updateBook = (b, fields) => { Object.assign(b, fields, { updatedAt: Date.now() }); MC.commit(); };
  MC.deleteBook = b => { // 分类删掉后，里面的日子移到「未分类」
    const t = Date.now();
    MC.data.books = MC.data.books.filter(y => y.id !== b.id); MC.data.deleted['book:' + b.id] = t;
    for (const x of MC.data.days) if (x.book === b.id) Object.assign(x, { book: '', sub: '', updatedAt: t });
    MC.commit();
  };
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
    const newerCourses = (b.coursesAt || 0) > (a.coursesAt || 0) ? b : a;
    const cmap = new Map();
    for (const c of [...(a.cals || []), ...(b.cals || [])]) {
      const old = cmap.get(c.id);
      if (!old || (c.updatedAt || 0) > (old.updatedAt || 0)) cmap.set(c.id, { ...c });
    }
    const cals = [...cmap.values()].filter(c => !(deleted['cal:' + c.id] && deleted['cal:' + c.id] >= (c.updatedAt || 0)))
      .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
    const calIds = new Set(cals.map(c => c.id));
    const kept = events.filter(e => !e.cal || calIds.has(e.cal) || !deleted['cal:' + e.cal]); // 已删除的日历里不留事件
    const byNewest = (la, lb, pre) => {
      const m = new Map();
      for (const x of [...(la || []), ...(lb || [])]) { const o = m.get(x.id); if (!o || (x.updatedAt || 0) > (o.updatedAt || 0)) m.set(x.id, { ...x }); }
      return [...m.values()].filter(x => !(deleted[pre + x.id] && deleted[pre + x.id] >= (x.updatedAt || 0)) && (calIds.has(x.cal) || !deleted['cal:' + x.cal]))
        .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
    };
    const days = byNewest(a.days, b.days, 'day:'), books = byNewest(a.books, b.books, 'book:');
    const album = (a.album && a.album.gist) ? { ...a.album } : (b.album && b.album.gist) ? { ...b.album } : { gist: '', owner: '' };
    return { version: 3, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0), events: kept, deleted, profile, daily,
      courses: (newerCourses.courses || []).map(c => ({ ...c })), coursesAt: newerCourses.coursesAt || 0, cals, days, books, album };
  };
  function signature(d) {
    const ev = [...d.events].sort((x, y) => (x.id < y.id ? -1 : 1))
      .map(e => [e.id, e.cal || '', e.date, e.days, e.rep && e.rep.forever, e.title, e.priority, e.done, e.note, e.time, e.endTime, e.remind, e.updatedAt]);
    const cs = [...(d.cals || [])].sort((x, y) => (x.id < y.id ? -1 : 1)).map(c => [c.id, c.name, c.color, !!c.showInMain, !!c.notify, c.kind || '', c.updatedAt]);
    const ds = [...(d.days || []), ...(d.books || [])].map(x => x.id + ':' + (x.updatedAt || 0)).sort();
    return JSON.stringify([ev, Object.keys(d.deleted || {}).sort(), (d.profile || {}).updatedAt || 0, (d.daily || {}).updatedAt || 0, d.coursesAt || 0, cs, ds, (d.album || {}).gist || '']);
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
    if (!f) throw new Error('这个 Gist 里没有节律数据');
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
      'X-WR-CALNAME:节律提醒', 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
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
      L.push('BEGIN:VEVENT', `UID:test-${t}@mcal`, 'DTSTAMP:' + stamp, 'SUMMARY:节律订阅提醒测试', 'DTSTART:' + st, 'DURATION:PT5M',
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
      if (!remote || MC.fixPri || signature(merged) !== signature(remote)) {
        MC.fixPri = false;
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
