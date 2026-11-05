// 月历 · 定时提醒（由 .github/workflows/reminders.yml 每 5 分钟运行）
// 读取 Gist 中的事件与推送订阅，把到点的提醒推送到每台开启了通知的设备。
import webpush from 'web-push';

const TOKEN = process.env.GIST_TOKEN;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const GIST_ID = (process.env.GIST_ID || '').trim();
const DATA_FILE = 'mcal-calendar.json';
const SUBS_FILE = 'mcal-push-subs.json';
const SENT_FILE = 'mcal-push-sent.json';
const LOOKBACK = 6 * 3600e3; // 定时任务延迟时最多补发 6 小时内的提醒

if (!TOKEN || !VAPID_PRIVATE) {
  console.log('未设置 GIST_TOKEN 或 VAPID_PRIVATE_KEY，跳过。');
  process.exit(0);
}

// GitHub 偶尔会短暂出错（网络抖动、5xx、限流）：等一会儿重试，最多 3 次
async function gh(path, opts = {}) {
  for (let i = 0; ; i++) {
    let r = null, err = null;
    try {
      r = await fetch('https://api.github.com' + path, {
        ...opts,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${TOKEN}`,
          'User-Agent': 'mcal-reminders',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) return await r.json();
    } catch (e) { err = e; }
    const what = `GitHub ${r ? r.status : (err && err.message) || '网络错误'} ${path}`;
    const transient = !r || r.status >= 500 || r.status === 429 || (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0');
    if (!transient) throw new Error(what);
    if (i >= 2) {
      // 重试后还是不行：这次先跳过，不算失败（不会每 5 分钟发一封失败邮件）；
      // 下一次运行会补发最近 6 小时内到点的提醒，已发过的有记录，不会重复
      console.log(`GitHub 暂时连不上，这次跳过，下次运行补发：${what}`);
      process.exit(0);
    }
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
}
async function findGist() {
  if (GIST_ID) return GIST_ID;
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const hit = list.find(g => g.files && g.files[DATA_FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return '';
}
async function readJSON(f, fallback) {
  if (!f) return fallback;
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(text); } catch { return fallback; }
}

// 时区换算：把某时区的本地时间换成 UTC 时间戳
function tzOffset(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
}
function localToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - tzOffset(guess, tz);
  ts = guess - tzOffset(ts, tz);
  return ts;
}
function fireTime(e, tz) {
  if (e.remind === null || e.remind === undefined || e.remind === '') return null;
  const [y, m, d] = e.date.split('-').map(Number);
  const [h, mi] = (e.time || '09:00').split(':').map(Number);
  return localToUtc(y, m, d, h, mi, tz) - Number(e.remind) * 60000;
}
// ---------- 语言（应用里的设置：同步数据 profile.lang；没设 / 跟随系统时用简体中文） ----------
let LANG = 'zh-Hans';
const TXT = {
  'zh-Hans': { hIn: n => `还有 ${n} 小时`, dIn: n => `还有 ${n} 天`, dNow: '就是今天', cIn: n => `${n} 分钟后开始`, cNow: '现在开始', allDay: '全天', openT: '查看今日未完成事件', openB: n => `今天还有 ${n} 件事未完成，点开查看。`, doneT: '今日事件已完成', doneB: '今天的事件都完成了。' },
  'zh-Hant': { hIn: n => `還有 ${n} 小時`, dIn: n => `還有 ${n} 天`, dNow: '就是今天', cIn: n => `${n} 分鐘後開始`, cNow: '現在開始', allDay: '全天', openT: '查看今日未完成事件', openB: n => `今天還有 ${n} 件事未完成，點開查看。`, doneT: '今日事件已完成', doneB: '今天的事件都完成了。' },
  en: { hIn: n => `In ${n} h`, dIn: n => `In ${n} days`, dNow: 'It’s today', cIn: n => `Starts in ${n} min`, cNow: 'Starting now', allDay: 'All day', openT: 'Check today’s open events', openB: n => `${n} things are still open today — tap to see them.`, doneT: 'All done today', doneB: 'Everything for today is done.' },
  fr: { hIn: n => `Dans ${n} h`, dIn: n => `Dans ${n} jours`, dNow: 'C’est aujourd’hui', cIn: n => `Commence dans ${n} min`, cNow: 'Commence maintenant', allDay: 'Toute la journée', openT: 'Voir les tâches du jour', openB: n => `Encore ${n} choses à faire aujourd’hui — touchez pour les voir.`, doneT: 'Tout est fait aujourd’hui', doneB: 'Tout est fait pour aujourd’hui.' },
};
const L = () => TXT[LANG] || TXT['zh-Hans'];
const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] };
const isZh = () => LANG.startsWith('zh');
function fmt(t, h12, noHalf) {
  if (!h12) return t;
  const [h, m] = t.split(':').map(Number), hm = (h % 12 || 12) + ':' + String(m).padStart(2, '0');
  return noHalf ? hm : isZh() ? (h < 12 ? '上午' : '下午') + hm : `${hm} ${h < 12 ? 'AM' : 'PM'}`;
}
function body(e, h12) {
  const [, m, d] = e.date.split('-').map(Number);
  const same = e.endTime && (+e.time.slice(0, 2) < 12) === (+e.endTime.slice(0, 2) < 12);
  const t = e.time ? (e.endTime ? (isZh() ? `${fmt(e.time, h12)}–${fmt(e.endTime, h12, same)}` : `${fmt(e.time, h12, same)}–${fmt(e.endTime, h12)}`) : fmt(e.time, h12)) : L().allDay;
  const date = LANG === 'en' ? `${MON.en[m - 1]} ${d}` : LANG === 'fr' ? `${d} ${MON.fr[m - 1]}` : `${m}月${d}日`;
  return `${date} ${t}${e.note ? ' · ' + e.note : ''}`;
}

const id = await findGist();
if (!id) { console.log('没有找到节律数据。'); process.exit(0); }
const gist = await gh('/gists/' + id);
const data = await readJSON(gist.files[DATA_FILE], { events: [] });
{ const l = data.profile && data.profile.lang; if (['zh-Hans', 'zh-Hant', 'en', 'fr'].includes(l)) LANG = l; }
const info = await readJSON(gist.files[SUBS_FILE], null);
if (!info || !info.publicKey || !(info.subs || []).length) { console.log('还没有设备开启提醒通知。'); process.exit(0); }
const sentDoc = await readJSON(gist.files[SENT_FILE], { sent: {} });
const sent = sentDoc.sent || {};

webpush.setVapidDetails(info.subject && /^https:|^mailto:/.test(info.subject) ? info.subject : 'mailto:noreply@example.com', info.publicKey, VAPID_PRIVATE);

const notifyCals = new Set((data.cals || []).filter(c => c && c.notify).map(c => c.id));
const now = Date.now();
const dead = new Set();
let count = 0, changed = false;
for (const sub of info.subs) {
  const tz = sub.tz || 'UTC';
  for (const e of data.events || []) {
    if (e.done || (e.cal && !notifyCals.has(e.cal))) continue; // 记录日历只有打开通知才提醒
    const ft = fireTime(e, tz);
    if (ft === null || ft > now || ft < now - LOOKBACK || ft < (sub.addedAt || 0)) continue;
    const tag = `${e.id}@${ft}`;
    const key = `${tag}|${sub.device || sub.endpoint.slice(-24)}`;
    if (sent[key]) continue;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title: e.title, body: body(e, !!sub.h12), tag, url: info.subject || './' }),
        { TTL: 3600, urgency: 'high' });
      count++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { dead.add(sub.endpoint); break; }
      console.log(`发送失败 ${err.statusCode || ''}: ${err.body || err.message}`);
      continue;
    }
    sent[key] = now; changed = true;
  }
}
// 每日提醒：按用户当前所在时区，在设定时间提示查看当天未完成的事件（不列出具体事件）
const daily = data.daily || {};
if (daily.on) {
  const tz = daily.tz || 'UTC';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const ds = `${p.year}-${p.month}-${p.day}`;
  const [h, mi] = (daily.time || '13:00').split(':').map(Number);
  const ft = localToUtc(+p.year, +p.month, +p.day, h, mi, tz);
  if (ft <= now && ft > now - LOOKBACK) {
    // 今日任务：主日历 + 设为在主日历显示的记录日历（和应用今日页一致）
    const shownCals = new Set((data.cals || []).filter(c => c && c.showInMain).map(c => c.id));
    const open = (data.events || []).filter(e => e.date === ds && !e.done && (!e.cal || shownCals.has(e.cal)));
    const msg = open.length ? { title: L().openT, body: L().openB(open.length) } : { title: L().doneT, body: L().doneB };
    const tag = `daily@${ds}`;
    for (const sub of info.subs) {
      if (dead.has(sub.endpoint) || ft < (sub.addedAt || 0)) continue;
      const key = `${tag}|${sub.device || sub.endpoint.slice(-24)}`;
      if (sent[key]) continue;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ ...msg, tag, url: (info.subject || './') + '#today' }), { TTL: 3600, urgency: 'high' });
        count++; sent[key] = now; changed = true;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.add(sub.endpoint);
        else console.log(`每日提醒发送失败 ${err.statusCode || ''}: ${err.body || err.message}`);
      }
    }
  }
}

// 课程提醒：日程里每节课开始前 lead 分钟（按用户当前所在时区算；晚了 20 分钟以上就不补发，上课提醒过时没用）
// 【联动:提醒】见 CLAUDE.md「联动分组」
const cr = data.courseRemind || {};
if (cr.on && Array.isArray(data.courses) && data.courses.length) {
  const tz = cr.tz || daily.tz || 'UTC', lead = Number(cr.lead) || 0;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  const ds = `${p.year}-${p.month}-${p.day}`;
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const monday = n => n - ((new Date(n * 864e5).getUTCDay() + 6) % 7);
  for (const c of data.courses) {
    if (!c || c.day !== dow || !/^\d{2}:\d{2}$/.test(c.start || '')) continue;
    if ((c.from && ds < c.from) || (c.to && ds > c.to)) continue;
    if (c.every === 2 && c.from && ((monday(dayNum(ds)) - monday(dayNum(c.from))) / 7) % 2) continue;   // 隔周（和应用 Sched.on 一样）
    const [h, mi] = c.start.split(':').map(Number);
    const ft = localToUtc(+p.year, +p.month, +p.day, h, mi, tz) - lead * 60000;
    if (ft > now || ft < now - 20 * 60000) continue;
    const tag = `course@${c.id || c.code}@${ds}@${c.start}`;
    const msg = { title: c.code + (c.type ? ' · ' + c.type : ''), body: [lead ? L().cIn(lead) : L().cNow, `${c.start}–${c.end}`, c.room].filter(Boolean).join(' · ') };
    for (const sub of info.subs) {
      if (dead.has(sub.endpoint) || ft < (sub.addedAt || 0)) continue;
      const key = `${tag}|${sub.device || sub.endpoint.slice(-24)}`;
      if (sent[key]) continue;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ ...msg, tag, url: (info.subject || './') + '#sched' }), { TTL: 1200, urgency: 'high' });
        count++; sent[key] = now; changed = true;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.add(sub.endpoint);
        else console.log(`课程提醒发送失败 ${err.statusCode || ''}: ${err.body || err.message}`);
      }
    }
  }
}

// 纪念日提醒：每个日子选的提前几天（0 = 当天），在 remindAt 钟点（按设提醒时所在的时区）；重复的日子按下一次算
{
  const pad2 = n => String(n).padStart(2, '0');
  const ymdOf = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
  const parts = s => s.split('-').map(Number);
  const addD = (s, n) => { const [y, m, d] = parts(s); return ymdOf(y, m, d + n); };
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const clampD = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, 1)); const yy = t.getUTCFullYear(), mm = t.getUTCMonth() + 1; return ymdOf(yy, mm, Math.min(d, dim(yy, mm))); };
  const occ = (x, from) => {   // 和应用 days.js 的 occurrence 一样：从 from 起的下一次
    if (!x.rep || x.date >= from) return x.date;
    const [by, bm, bd] = parts(x.date), [fy, fm, fd] = parts(from);
    if (x.rep === 'week') { const diff = (Date.UTC(fy, fm - 1, fd) - Date.UTC(by, bm - 1, bd)) / 864e5; return addD(x.date, Math.ceil(diff / 7) * 7); }
    if (x.rep === 'month') { let d = clampD(fy, fm, bd); if (d < from) d = clampD(fy, fm + 1, bd); return d; }
    let d = clampD(fy, bm, bd); if (d < from) d = clampD(fy + 1, bm, bd); return d;
  };
  const sendDay = async (x, tag, ft, msg) => {
    for (const sub of info.subs) {
      if (dead.has(sub.endpoint) || ft < (sub.addedAt || 0)) continue;
      const key = `${tag}|${sub.device || sub.endpoint.slice(-24)}`;
      if (sent[key]) continue;
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ ...msg, tag, url: (info.subject || './') + '#days-' + x.id }), { TTL: 6 * 3600, urgency: 'normal' });
        count++; sent[key] = now; changed = true;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.add(sub.endpoint);
        else console.log(`纪念日提醒发送失败 ${err.statusCode || ''}: ${err.body || err.message}`);
      }
    }
  };
  for (const x of data.days || []) {
    if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) continue;
    const hs = Array.isArray(x.remindH) ? x.remindH.filter(n => n === 1 || n === 12) : [];
    if ((!Array.isArray(x.reminds) || !x.reminds.length) && !hs.length) continue;
    const tz = x.remindTz || (data.daily || {}).tz || 'UTC';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(now)).map(z => [z.type, z.value]));
    const ds = `${p.year}-${p.month}-${p.day}`;
    const [h, mi] = (/^\d{2}:\d{2}$/.test(x.remindAt || '') ? x.remindAt : '09:00').split(':').map(Number);
    // 提前几小时：按这个日子的精确时间（没设就按当天 0 点），今天或明天那一次
    for (const hh of hs) for (const from of [ds, addD(ds, 1)]) {
      const o = occ(x, from), [oy, om, od] = parts(o), [th, tm] = (/^\d{2}:\d{2}$/.test(x.time || '') ? x.time : '00:00').split(':').map(Number);
      const ft = localToUtc(oy, om, od, th, tm, tz) - hh * 3600e3;
      if (ft > now || ft < now - 2 * 3600e3) continue;
      await sendDay(x, `day@${x.id}@${o}@h${hh}`, ft, { title: x.title || '纪念日', body: `${L().hIn(hh)} · ${LANG.startsWith('zh') ? `${om}月${od}日` : `${oy}-${pad2(om)}-${pad2(od)}`}${x.time ? ' ' + x.time : ''}` });
    }
    for (const k of x.reminds || []) {
      const o = occ(x, addD(ds, k));
      if (addD(o, -k) !== ds) continue;
      const ft = localToUtc(+p.year, +p.month, +p.day, h, mi, tz);
      if (ft > now || ft < now - LOOKBACK) continue;
      const tag = `day@${x.id}@${o}@${k}`;
      const [oy, om, od] = parts(o);
      const msg = { title: x.title || '纪念日', body: `${k ? L().dIn(k) : L().dNow} · ${LANG.startsWith('zh') ? `${om}月${od}日` : `${oy}-${pad2(om)}-${pad2(od)}`}` };
      for (const sub of info.subs) {
        if (dead.has(sub.endpoint) || ft < (sub.addedAt || 0)) continue;
        const key = `${tag}|${sub.device || sub.endpoint.slice(-24)}`;
        if (sent[key]) continue;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ ...msg, tag, url: (info.subject || './') + '#days-' + x.id }), { TTL: 6 * 3600, urgency: 'normal' });
          count++; sent[key] = now; changed = true;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) dead.add(sub.endpoint);
          else console.log(`纪念日提醒发送失败 ${err.statusCode || ''}: ${err.body || err.message}`);
        }
      }
    }
  }
}

for (const k of Object.keys(sent)) if (sent[k] < now - 3 * 864e5) { delete sent[k]; changed = true; }

const files = {};
if (changed) files[SENT_FILE] = { content: JSON.stringify({ sent }) };
if (dead.size) {
  info.subs = info.subs.filter(s => !dead.has(s.endpoint));
  files[SUBS_FILE] = { content: JSON.stringify(info, null, 1) };
}
if (Object.keys(files).length) await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files }) });
console.log(`${new Date().toISOString()} 已发送 ${count} 条提醒${dead.size ? `，移除 ${dead.size} 个失效设备` : ''}。`);
