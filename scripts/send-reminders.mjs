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

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'mcal-reminders',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${path}`);
  return r.json();
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
function fmt(t, h12, noHalf) {
  if (!h12) return t;
  const [h, m] = t.split(':').map(Number);
  return (noHalf ? '' : h < 12 ? '上午' : '下午') + (h % 12 || 12) + ':' + String(m).padStart(2, '0');
}
function body(e, h12) {
  const [, m, d] = e.date.split('-').map(Number);
  const same = e.endTime && (+e.time.slice(0, 2) < 12) === (+e.endTime.slice(0, 2) < 12);
  const t = e.time ? (e.endTime ? `${fmt(e.time, h12)}–${fmt(e.endTime, h12, same)}` : fmt(e.time, h12)) : '全天';
  return `${m}月${d}日 ${t}${e.note ? ' · ' + e.note : ''}`;
}

const id = await findGist();
if (!id) { console.log('没有找到月历数据。'); process.exit(0); }
const gist = await gh('/gists/' + id);
const data = await readJSON(gist.files[DATA_FILE], { events: [] });
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
    const open = (data.events || []).filter(e => e.date === ds && !e.done && !e.cal);
    const msg = open.length
      ? { title: '查看今日未完成事件', body: `今天还有 ${open.length} 件事未完成，点开查看。` }
      : { title: '今日事件已完成', body: '今天的事件都完成了。' };
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

for (const k of Object.keys(sent)) if (sent[k] < now - 3 * 864e5) { delete sent[k]; changed = true; }

const files = {};
if (changed) files[SENT_FILE] = { content: JSON.stringify({ sent }) };
if (dead.size) {
  info.subs = info.subs.filter(s => !dead.has(s.endpoint));
  files[SUBS_FILE] = { content: JSON.stringify(info, null, 1) };
}
if (Object.keys(files).length) await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files }) });
console.log(`${new Date().toISOString()} 已发送 ${count} 条提醒${dead.size ? `，移除 ${dead.size} 个失效设备` : ''}。`);
