// 生成合并规则的对照数据：用网页自己的 js/store.js（MC.normalize / MC.merge）算出期望结果，
// 安卓的 CalMergeTest 逐条比对，保证原生和网页合并得一模一样。
// 运行（macOS 自带 JavaScriptCore，不用装 node）：
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc scripts/merge-fixtures.js -- ../js/store.js > app/src/test/resources/merge-fixtures.json
// 或者 node：node scripts/merge-fixtures.js ../js/store.js > app/src/test/resources/merge-fixtures.json
var args = typeof arguments !== 'undefined' ? arguments : process.argv.slice(2);
var storePath = args[0];
var g = typeof globalThis !== 'undefined' ? globalThis : this;
g.window = g;
g.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
g.TextEncoder = g.TextEncoder || function () {}; g.TextDecoder = g.TextDecoder || function () {};
g.navigator = { language: 'zh-CN', languages: ['zh-CN'], onLine: true };
if (typeof load === 'function') load(storePath); else require('vm').runInThisContext(require('fs').readFileSync(storePath, 'utf8'));
var MC = g.MC;
var NOW = Date.now();

// 固定种子的伪随机，结果可复现
var seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function ts() { return NOW - Math.floor(rnd() * 5) * 1000 - (rnd() < 0.15 ? 200 * 864e5 : 0); }

var IDS = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
var CALS = ['', '', 'c1', 'c2'];
function ev(id) {
  return { id: id, date: '2026-11-0' + (1 + Math.floor(rnd() * 9)), title: pick(['A', 'B', '买菜', '开会']), priority: Math.floor(rnd() * 4),
    done: rnd() < 0.3, note: pick(['', 'n']), time: pick(['', '09:00', '14:30']), endTime: '', remind: pick([null, 0, 15]),
    days: 1, cal: pick(CALS), rate: 0, segs: {}, series: '', rep: null, createdAt: NOW - 1e6 + Math.floor(rnd() * 100), updatedAt: ts() };
}
function cal(id) { return { id: id, name: id, color: '#B76271', showInMain: rnd() < 0.5, notify: rnd() < 0.5, kind: id === 'c2' ? 'days' : '', createdAt: NOW - 2e6 + Math.floor(rnd() * 9), updatedAt: ts() }; }
function side() {
  var d = { version: 3, updatedAt: ts(), events: [], deleted: {}, cals: [], days: [], books: [],
    profile: { name: pick(['', 'Ann']), avatar: '', clock: pick(['', '12', '24']), lang: pick(['', 'en']), updatedAt: ts() },
    daily: { on: rnd() < 0.5, time: '13:00', tz: '', updatedAt: ts() },
    courses: rnd() < 0.5 ? [{ id: 'k1', code: 'MATH', type: '', day: 2, start: '09:00', end: '10:00', room: '', from: '', to: '', every: 1 }] : [],
    coursesAt: rnd() < 0.5 ? ts() : 0, album: rnd() < 0.3 ? { gist: 'g' + Math.floor(rnd() * 3), owner: 'o' } : { gist: '', owner: '' } };
  if (rnd() < 0.5) d.profile.at = { name: ts(), avatar: ts(), clock: ts(), lang: ts() };
  IDS.forEach(function (id) { if (rnd() < 0.6) d.events.push(ev(id)); if (rnd() < 0.15) d.deleted[id] = ts(); });
  ['c1', 'c2'].forEach(function (id) { if (rnd() < 0.6) d.cals.push(cal(id)); if (rnd() < 0.15) d.deleted['cal:' + id] = ts(); });
  ['d1', 'd2'].forEach(function (id) {
    if (rnd() < 0.6) d.days.push({ id: id, cal: pick(['c2', 'c1']), title: id, date: '2026-12-01', createdAt: NOW - 3e6 + Math.floor(rnd() * 9), updatedAt: ts() });
    if (rnd() < 0.15) d.deleted['day:' + id] = ts();
  });
  if (rnd() < 0.4) d.books.push({ id: 'b1', cal: 'c2', name: 'B', cat: 'other', createdAt: NOW - 4e6, updatedAt: ts() });
  return MC.normalize(d);
}

var cases = [];
for (var i = 0; i < 120; i++) {
  var a = side(), b = side();
  cases.push({ a: a, b: b, out: MC.merge(a, b) });
}
var text = JSON.stringify({ now: NOW, cases: cases });
if (typeof print === 'function' && typeof process === 'undefined') print(text); else console.log(text);
