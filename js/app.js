/* 月历 · 页面切换、今日、四象限、设置、锁屏、帮助、启动 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc, Push = MC.Push;
  const appUrl = () => location.href.replace(/[#?].*$/, '').replace(/index\.html$/, '');

  // ---------- 主题 ----------
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = MC.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // 和月账本一样：两个 theme-color 分别对应浅色 / 深色；手动指定外观时两者都用该颜色
    const forced = t === 'auto' ? null : (dark ? '#141416' : '#F8F8FA');
    $('#themeLight').setAttribute('content', forced || '#FFFFFF');
    $('#themeDark').setAttribute('content', forced || '#141416');
  }
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);

  // ---------- 页面 & 底部菜单栏（点击，或长按拖动切换） ----------
  let page = 'cal';
  const tabbar = $('#tabbar'), ind = $('#tabInd');
  const tabs = () => [...tabbar.querySelectorAll('button[data-page]')].filter(b => !b.hidden); // 纪念日历里只显示 日历 · 纪念日 · 设置
  const tabOf = p => tabs().find(b => b.dataset.page === p);
  // 指示块用弹簧物理驱动：拖动时跟手并按速度拉长压扁（体积守恒），顶到两端被压扁、整条菜单被轻轻拽动；
  // 松手后带一点回弹落到目标格子。按住时指示块「浮起」成一块磨砂玻璃，经过的图标被放大，像透镜。
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const J = { x: 0, v: 0, tx: 0, w: 0, lift: 0, lv: 0, tl: 0, wall: 0, bx: 0, bv: 0, tbx: 0, raf: 0, last: 0, centers: [] };
  const measureCenters = () => { J.centers = tabs().filter(b => !b.hidden).map(b => [b, b.offsetLeft + b.offsetWidth / 2]); };
  const rubber = (x, d) => (1 - 1 / (x * .55 / d + 1)) * d;
  function paintInd() {
    const speed = Math.min(1, Math.abs(J.v) / 2400);
    let sx = 1 + speed * .34, sy = 1 - speed * .2;            // 越快拉得越长、越扁
    const sq = Math.min(1, Math.abs(J.wall) / 40);              // 顶墙压扁
    sx *= 1 - sq * .17; sy *= 1 + sq * .1;
    const lift = Math.max(0, J.lift);
    const lx = 1 + J.lift * .07, ly = 1 + J.lift * .13;          // 浮起时略微鼓起
    ind.style.width = J.w + 'px';
    ind.style.transformOrigin = J.wall < -.5 ? '0% 50%' : J.wall > .5 ? '100% 50%' : '50% 50%';
    ind.style.transform = `translate3d(${J.x.toFixed(2)}px,0,0) scale(${(sx * lx).toFixed(4)},${(sy * ly).toFixed(4)})`;
    ind.style.setProperty('--lift', Math.min(1, lift).toFixed(3));
    tabbar.style.transform = Math.abs(J.bx) > .05 ? `translate3d(${J.bx.toFixed(2)}px,0,0)` : '';
    // 透镜：离指示块中心越近的图标放得越大
    const c = J.x + J.w / 2;
    for (const [b, bc] of J.centers) {
      const d = Math.abs(bc - c) / (J.w || 1);
      const k = lift > .01 ? 1 + lift * .16 * Math.max(0, 1 - d) : 1;
      const t = k > 1.001 ? `scale(${k.toFixed(3)})` : '';
      if (b.style.transform !== t) b.style.transform = t;
    }
  }
  function jellyFrame(now) {
    const dt = Math.min(.034, Math.max(.001, (now - J.last) / 1000)); J.last = now;
    const held = !!(pd && pd.dragging);
    const k = held ? 1150 : 560, c = held ? 56 : 31;            // 拖动时紧跟手指；松手时轻微过冲再回弹
    const kl = 640, cl = held ? 42 : 20;                          // 浮起 / 落下
    const kb = 700, cb = 26;                                      // 菜单栏被拽动后弹回
    const n = 4, h = dt / n;
    for (let i = 0; i < n; i++) {
      J.v += (-k * (J.x - J.tx) - c * J.v) * h; J.x += J.v * h;
      J.lv += (-kl * (J.lift - J.tl) - cl * J.lv) * h; J.lift += J.lv * h;
      J.bv += (-kb * (J.bx - J.tbx) - cb * J.bv) * h; J.bx += J.bv * h;
    }
    if (!held) J.wall *= Math.pow(.0005, dt);                     // 松手后压扁迅速恢复
    const rest = !held && Math.abs(J.x - J.tx) < .15 && Math.abs(J.v) < 4 && Math.abs(J.lift - J.tl) < .003 && Math.abs(J.lv) < .03
      && Math.abs(J.bx - J.tbx) < .05 && Math.abs(J.bv) < 2;
    if (rest) { J.x = J.tx; J.v = 0; J.lift = J.tl; J.lv = 0; J.bx = J.tbx; J.bv = 0; J.wall = 0; paintInd(); J.raf = 0; return; }
    paintInd();
    J.raf = requestAnimationFrame(jellyFrame);
  }
  function kick() {
    if (reduceMotion.matches) { J.x = J.tx; J.v = 0; J.lift = J.tl; J.bx = J.tbx; J.wall = 0; paintInd(); return; }
    if (!J.raf) { J.last = performance.now(); J.raf = requestAnimationFrame(jellyFrame); }
  }
  function placeInd(animate = true) {
    const btn = tabOf(page); if (!btn) return;
    J.tx = btn.offsetLeft; J.w = btn.offsetWidth; J.tl = 0; J.tbx = 0;
    measureCenters();
    if (!animate || !J.w) { if (J.raf) { cancelAnimationFrame(J.raf); J.raf = 0; } J.x = J.tx; J.v = 0; J.lift = 0; J.lv = 0; J.bx = 0; J.bv = 0; J.wall = 0; paintInd(); return; }
    kick();
  }
  function showPage(p) {
    page = p;
    document.body.dataset.page = p;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
    tabs().forEach(b => b.classList.toggle('on', b.dataset.page === p));
    placeInd();
    renderPage();
  }
  // 菜单第三项：四象限 / 课表 / 不显示
  const TAB3 = {
    sched: { label: '课表', svg: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.5h17M9.5 9.5v11M3.5 15h17"/></svg>' },
  };
  function applyTab3() {
    const btn = tabbar.querySelector('button[data-page="sched"]');
    // 底部第三格固定是课表（四象限已移除）
    if (MC.settings.tab3 !== 'sched') { MC.settings.tab3 = 'sched'; MC.saveSettings(); }
    const v = MC.settings.tab3;
    btn.hidden = document.body.dataset.kind === 'days' || !!recCal(); // 纪念日历的菜单里没有这一项；开了等级评分的记录日历换成「统计」
    if (v !== 'off') { btn.dataset.page = v; btn.setAttribute('aria-label', TAB3[v].label); btn.innerHTML = TAB3[v].svg + `<span>${TAB3[v].label}</span>`; }
    if (page === 'sched' && page !== v) showPage('cal'); else placeInd(false);
  }
  function renderPage() {
    if (page === 'sched') { MC.Sched.render(); return; }
    if (page === 'cal') requestAnimationFrame(() => MC.Cal.render());
    else if (page === 'days' || page === 'dsum') { if (MC.Days) MC.Days.render(); }
    else if (page === 'today') renderToday();
    else if (page === 'rstat') renderRstat();
    else renderSettings();
  }
  let pd = null;
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  let geo = null;
  function measureTabs() {
    const r = tabbar.getBoundingClientRect();
    const list = tabs();
    geo = { left: r.left - J.bx, width: tabbar.offsetWidth, w: list[0].offsetWidth, pad: list[0].offsetLeft,
      rects: list.map(b => [b.offsetLeft, b.offsetLeft + b.offsetWidth, b]) };
    measureCenters();
  }
  function tabAt(x) { // x：页面坐标
    if (!geo) measureTabs();
    const lx = x - geo.left;
    for (const [l, r, b] of geo.rects) if (lx >= l && lx <= r) return b;
    return lx < geo.rects[0][0] ? geo.rects[0][2] : geo.rects[geo.rects.length - 1][2];
  }
  function moveDrag(x) {
    if (!pd || !geo) return;
    const { left: L, width, w, pad } = geo;
    const want = x - L - w / 2, lo = pad, hi = width - pad - w;
    const clamped = Math.max(lo, Math.min(hi, want)), over = want - clamped;
    J.tx = clamped;
    J.wall = Math.sign(over) * rubber(Math.abs(over), 40);       // 顶墙压扁
    J.tbx = Math.sign(over) * rubber(Math.abs(over), 9);         // 整条菜单被轻轻拽过去
    kick();
    const h = tabAt(x);
    if (h !== pd.hover) {
      if (pd.hover) { pd.hover.classList.remove('hover'); buzz(4); }
      h.classList.add('hover'); pd.hover = h;
    }
  }
  function startDrag(x) {
    if (!pd || pd.dragging) return;
    measureTabs();
    pd.dragging = true;
    tabbar.classList.add('dragging');
    J.tl = 1; J.lv += 6;                                          // 浮起时先轻轻「噗」地鼓一下
    buzz(10);
    moveDrag(x);
  }
  function endDrag(x, commit) {
    if (!pd) return;
    clearTimeout(pd.timer);
    const wasDrag = pd.dragging, btn = pd.btn;
    pd = null;
    tabbar.classList.remove('dragging');
    tabs().forEach(b => b.classList.remove('hover'));
    if (!commit) { placeInd(); return; }
    const target = wasDrag ? tabAt(x) : btn;
    geo = null;
    if (target) showPage(target.dataset.page); else placeInd();
  }
  tabbar.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pd = { x0: e.clientX, dragging: false, btn: e.target.closest('button[data-page]'), hover: null };
    pd.timer = setTimeout(() => pd && startDrag(pd.lastX ?? pd.x0), 280);
    try { tabbar.setPointerCapture(e.pointerId); } catch (err) {}
  });
  tabbar.addEventListener('pointermove', e => {
    if (!pd) return;
    pd.lastX = e.clientX;
    if (!pd.dragging) { if (Math.abs(e.clientX - pd.x0) > 10) { clearTimeout(pd.timer); startDrag(e.clientX); } return; }
    moveDrag(e.clientX);
  });
  tabbar.addEventListener('pointerup', e => endDrag(e.clientX, true));
  tabbar.addEventListener('pointercancel', e => endDrag(e.clientX, false));
  tabbar.addEventListener('click', e => { if (e.detail === 0) { const b = e.target.closest('button[data-page]'); if (b) showPage(b.dataset.page); } });
  tabbar.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', () => placeInd(false));
  if (window.ResizeObserver) new ResizeObserver(() => { if (!pd) placeInd(false); }).observe(tabbar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeInd(false));

  MC.App = { showPage: p => showPage(p), placeInd: () => placeInd(false), page: () => page };
  $('#fab').onclick = () => page === 'sched' ? MC.Sched.add()
    : page === 'today'
    ? MC.Editor.openNew(MC.todayStr(), '')
    : MC.Editor.openNew(MC.Cal.selected(), (page === 'cal' || page === 'rstat') ? MC.activeCal() : '');
  document.body.dataset.page = page;

  MC.onChange = () => {
    MC.Drawer.paint();
    if (page === 'cal') MC.Cal.refresh(); else renderPage();
    paintTabAvatar();
  };

  // ---------- 今日（参考苹果日历的「日」视图）----------
  // 上面一条本周的日期（点一下看那一天），下面先列没有具体时间的事件（全天、待办），再是一整天的时间线：
  // 有时间段的事件按开始、结束时间画成色块，时间重叠的并排；今天有一条红色的「现在」线
  let tdDay = '', tdScrolled = '';
  const TL_H = 52; // 一小时的高度
  function renderToday() {
    const t = MC.todayStr();
    if (!tdDay || (tdDay < MC.ymd(MC.weekStartOf(new Date())) || tdDay > MC.ymd(MC.addDays(MC.weekStartOf(new Date()), 6)))) tdDay = t;
    const day = MC.parse(tdDay), isToday = tdDay === t;
    $('#todayDate').textContent = `${day.getMonth() + 1}月${day.getDate()}日 周${MC.WD[day.getDay()]}`;
    const off = Math.round((day - MC.parse(t)) / 864e5);
    $('#page-today .ptitle h1').textContent = isToday ? '今天' : off === 1 ? '明天' : off === -1 ? '昨天' : `周${MC.WD[day.getDay()]}`;
    // 本周的日期条
    const ws = MC.weekStartOf(new Date());
    let strip = '<div class="td-week">';
    for (let k = 0; k < 7; k++) {
      const d = MC.addDays(ws, k), ds = MC.ymd(d), has = MC.mainViewOn(ds).some(e => !e.done);
      strip += `<button class="td-day${ds === tdDay ? ' on' : ''}${ds === t ? ' today' : ''}" data-day="${ds}"><small>${MC.WD[d.getDay()]}</small><b>${d.getDate()}</b><i${has ? '' : ' hidden'}></i></button>`;
    }
    strip += '</div>';
    const list = MC.mainViewOn(tdDay);
    const timed = list.filter(e => e.time), untimed = list.filter(e => !e.time);
    // 上面的本周日期条、逾期、全天固定不动，只有下面的时间线滚动（滚的时候不会盖到上面）
    let h = strip;
    // 已逾期（只在看今天时）
    const overdue = isToday ? MC.data.events.filter(e => MC.inMainView(e) && !e.done && MC.endDate(e) < t).sort((a, b) => a.date.localeCompare(b.date) || MC.cmp(a, b)) : [];
    if (overdue.length) h += `<section class="sec"><h3 class="over"><span>已逾期</span><span class="sec-r"><button class="sec-act" data-sec="overdue">全部移到今天</button><span>${overdue.length}</span></span></h3><ul class="card glass-panel">${overdue.map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul></section>`;
    // 没有具体时间的（全天、待办）：未完成在前
    const allDay = [...untimed.filter(e => !e.done), ...untimed.filter(e => e.done)];
    if (allDay.length) h += `<section class="sec"><h3><span>全天</span><span>${untimed.filter(e => !e.done).length || ''}</span></h3><ul class="card glass-panel">${allDay.map(e => UI.itemHTML(e)).join('')}</ul></section>`;
    // 时间线：显示 8 点到 21 点，事件或现在的时间超出这个范围就跟着放宽
    const toMin = x => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const span = timed.map(e => { const a = toMin(e.time); let b = e.endTime ? toMin(e.endTime) : a + 30; if (b <= a) b = Math.min(1440, a + 30); return { e, a, b }; }).sort((x, y) => x.a - y.a || y.b - x.b);
    let sH = Math.min(8, ...span.map(x => Math.floor(x.a / 60)), isToday ? Math.floor(nowMin / 60) : 24);
    let eH = Math.max(21, ...span.map(x => Math.ceil(x.b / 60)), isToday ? Math.ceil((nowMin + 1) / 60) : 0);
    sH = Math.max(0, sH); eH = Math.min(24, eH);
    // 时间重叠的事件并排：按开始时间排好，一组互相重叠的事件平分宽度
    const groups = []; let g = null, gEnd = -1;
    for (const x of span) { if (!g || x.a >= gEnd) { g = []; groups.push(g); gEnd = -1; } g.push(x); gEnd = Math.max(gEnd, x.b); }
    for (const grp of groups) { const ends = []; for (const x of grp) { let k = ends.findIndex(v => v <= x.a); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = x.b; x.lane = k; } grp.forEach(x => (x.lanes = ends.length)); }
    let tl = `<div class="td-tl" style="height:${(eH - sH) * TL_H}px">`;
    for (let hr = sH; hr <= eH; hr++) tl += `<div class="td-hr" style="top:${(hr - sH) * TL_H}px"><span>${hr === 12 && !MC.use12() ? '12:00' : MC.use12() ? MC.hourLabel(hr % 24, true) : `${hr}:00`}</span></div>`;
    tl += '<ul class="td-evs">';
    for (const x of span) {
      const top = (x.a / 60 - sH) * TL_H, ht = Math.max(22, (x.b - x.a) / 60 * TL_H - 2), w = 100 / x.lanes;
      const e = x.e, tiny = ht < 38;
      tl += `<li class="item td-ev${e.done ? ' done' : ''}${tiny ? ' tiny' : ''}" data-id="${e.id}" style="--c:${MC.evColor(e)};top:${top}px;height:${ht}px;left:calc(${x.lane * w}% + 1px);width:calc(${w}% - 3px)">
        <button class="td-ev-main" data-act="open"><b>${esc(e.title)}</b>${tiny ? '' : `<small>${esc(MC.fmtRange(e.time, e.endTime))}${e.note ? ' · ' + esc(e.note) : ''}</small>`}</button>
        <button class="td-ck" data-act="toggle" aria-label="${e.done ? '标为未完成' : '完成'}"></button></li>`;
    }
    tl += '</ul>';
    if (isToday && nowMin >= sH * 60 && nowMin <= eH * 60) tl += `<div class="td-now" style="top:${(nowMin / 60 - sH) * TL_H}px"><span>${MC.fmtTime(`${MC.pad(now.getHours())}:${MC.pad(now.getMinutes())}`, true)}</span></div>`;
    tl += '</div>';
    if (!list.length && !overdue.length) h += `<p class="td-empty">${isToday ? '今天没有安排，点右下角 ＋ 添加' : '这一天没有安排'}</p>`;
    const old = $('#todayBody .td-scroll'), keep = old ? old.scrollTop : 0;
    $('#todayBody').innerHTML = `<div class="td-top">${h}</div><div class="td-scroll">${tl}</div>`;
    $('#todayBody .td-scroll').scrollTop = keep;
    // 第一次打开今天：「现在」那条线在屏幕下面看不到时，才往下滚到它在屏幕中间偏下（上面的日期条、全天事件能看到就不动）
    if (isToday && tdScrolled !== t) {
      tdScrolled = t;
      const tlEl = $('#todayBody .td-tl'), box = $('#todayBody .td-scroll');
      requestAnimationFrame(() => {
        const y = tlEl.offsetTop - box.offsetTop + (nowMin / 60 - sH) * TL_H, vh = box.clientHeight;
        if (y > vh * 0.72) box.scrollTop = y - vh * 0.6;
      });
    }
  }
  $('#todayBody').addEventListener('click', e => {
    const d = e.target.closest('[data-day]');
    if (d) { tdDay = d.dataset.day; renderToday(); return; }
    if (!e.target.closest('[data-sec="overdue"]')) return;
    const t = MC.todayStr();
    const list = MC.data.events.filter(x => MC.inMainView(x) && !x.done && MC.endDate(x) < t);
    if (list.length) UI.moveEvents(list, t, `已把 ${list.length} 个事件移到今天`);
  });
  // 时间线上的「现在」每分钟走一格
  setInterval(() => { if (page === 'today' && tdDay === MC.todayStr() && !UI.anyOpen()) renderToday(); }, 60000);
  UI.bindList($('#todayBody'));


  // ---------- 记录日历：等级统计 ----------
  // 开了「等级评分」的记录日历，底部菜单里的四象限 / 课表换成「统计」
  const rs = { range: 'month', off: 0, tab: 'all', openEv: null, allEv: false };
  const recCal = () => { const id = MC.activeCal(); return id && MC.rateOn(id) ? MC.cal(id) : null; };
  function syncRecTabs() {
    const stat = tabbar.querySelector('button[data-page="rstat"]'), t3 = tabbar.querySelector('button[data-page="sched"]');
    if (!stat || !t3 || document.body.dataset.kind === 'days') return; // 纪念日历的菜单由 days.js 管
    const rc = !!recCal();
    stat.hidden = !rc; t3.hidden = rc;
    if (!rc && page === 'rstat') showPage('cal');
    else if (rc && page === 'sched') showPage('cal');
    else { if (page === 'rstat') renderRstat(); placeInd(false); }
  }
  MC.onCalChange = syncRecTabs;
  function rsSpan(off = rs.off) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    if (rs.range === 'week') { const a = MC.addDays(MC.weekStartOf(t), off * 7); return [a, MC.addDays(a, 6)]; }
    if (rs.range === 'month') { const a = new Date(t.getFullYear(), t.getMonth() + off, 1); return [a, new Date(a.getFullYear(), a.getMonth() + 1, 0)]; }
    if (rs.range === 'year') { const y = t.getFullYear() + off; return [new Date(y, 0, 1), new Date(y, 11, 31)]; }
    return null;
  }

  // ---- 计算 ----
  const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const numDay = n => { const d = new Date(n * 864e5); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  const mean = l => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : 0);
  const avgOf = l => mean(l.map(e => e.rate));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const SLOTS = [['凌晨', 0, 6], ['早上', 6, 9], ['上午', 9, 12], ['中午', 12, 14], ['下午', 14, 18], ['晚上', 18, 22], ['深夜', 22, 24]];
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const durOf = e => { if (!e.time || !e.endTime) return null; const m = t => +t.slice(0, 2) * 60 + +t.slice(3, 5); let d = m(e.endTime) - m(e.time); if (d <= 0) d += 1440; return d; };
  const fmtDur = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? (m % 60) + '分' : ''}` : `${m}分钟`; };
  const hhLabel = h => `${Math.floor(h / 2)}:${h % 2 ? '30' : '00'}`;
  const offLabel = i => (i === 0 ? '开始' : i % 2 ? `${i > 1 ? Math.floor(i / 2) + '小时' : ''}30分` : `${i / 2}小时`);
  function slope(pts) { // 最小二乘斜率
    const n = pts.length; if (n < 3) return null;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
    return sxx ? sxy / sxx : null;
  }
  // 每半小时一段：没单独评的段跟着整条事件的等级
  function segPoints(evs) {
    const pts = [];
    for (const e of evs) MC.segBlocks(e.time, e.endTime).forEach((b, i) => { const v = MC.segVal(e, b.k); if (v) pts.push({ e, clock: b.a % 1440, hh: Math.floor((b.a % 1440) / 30), idx: i, v }); });
    return pts;
  }
  // 时间分桶（趋势线用）
  function bins(evs, span) {
    const x0 = span ? dayNum(MC.ymd(span[0])) : dayNum(evs[0].date), x1 = span ? dayNum(MC.ymd(span[1])) : dayNum(evs[evs.length - 1].date);
    const unit = rs.range === 'year' ? 'm' : span ? 'd' : x1 - x0 <= 62 ? 'd' : x1 - x0 <= 1100 ? 'm' : 'y', out = [];
    if (unit === 'd') for (let x = x0; x <= x1; x++) { const d = numDay(x); out.push({ x0: x, x1: x, label: `${d.getMonth() + 1}月${d.getDate()}日`, short: rs.range === 'week' ? WD[d.getDay()].slice(1) : rs.range === 'month' ? String(d.getDate()) : `${d.getMonth() + 1}/${d.getDate()}` }); }
    else {
      let d = numDay(x0); d = unit === 'm' ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), 0, 1);
      while (dayNum(MC.ymd(d)) <= x1) {
        const nx = unit === 'm' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear() + 1, 0, 1);
        out.push({ x0: dayNum(MC.ymd(d)), x1: dayNum(MC.ymd(nx)) - 1, label: unit === 'm' ? `${d.getFullYear()}年${d.getMonth() + 1}月` : `${d.getFullYear()}年`, short: unit === 'm' ? String(d.getMonth() + 1) : String(d.getFullYear()).slice(2) });
        d = nx;
      }
    }
    for (const b of out) { const l = evs.filter(e => e.rate && dayNum(e.date) >= b.x0 && dayNum(e.date) <= b.x1); b.v = l.length ? avgOf(l) : 0; b.n = l.length; }
    return out;
  }

  // ---- 图表（只画必要的东西）----
  // ---- 各页 ----
  const card = (title, body, extra = '') => `<section class="rs-card"${extra}>${title ? `<h3>${title}</h3>` : ''}${body}</section>`;
  const lvName = (labels, v) => `<span class="rs-lv lv${Math.max(1, Math.min(4, Math.round(v)))}" data-uc>${MC.esc(labels[Math.max(1, Math.min(4, Math.round(v))) - 1])}</span>`;
  const lvText = (labels, v) => `<span class="rs-t lv${Math.max(1, Math.min(4, Math.round(v)))}" data-uc>${MC.esc(labels[Math.max(1, Math.min(4, Math.round(v))) - 1])}</span>`; // 等级名用它自己的颜色
  // ---- 一眼能看懂：用日历格子 + 等级名，颜色越深 = 等级越高 ----
  const MIN_N = 3; // 少于 3 段 / 条的不参与「最好 / 最差」，避免一两条记录说了算
  const lvOf = v => Math.max(1, Math.min(4, Math.round(v)));
  const short = (labels, v) => MC.esc(labels[lvOf(v) - 1].slice(0, 3));
  const legend = labels => `<div class="rs-legend"><span><i class="lv0"></i>没记录</span>${MC.RATE_ORDER.map(v => `<span><i class="lv${v}"></i><b data-uc>${MC.esc(labels[v - 1])}</b></span>`).join('')}</div>`;   // 从左到右 = 从低到高（没记录放最左），和选等级的条一样
  const pickList = l => `<ul class="rs-list">${[...l].reverse().map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul>`;
  // ---- 时段热力图：列 = 日期 / 星期几 / 月份，行 = 半小时；格子颜色越深 = 等级越高 ----
  function heatmap(id, cols, pts, labels, minN) {
    const cp = cols.map(col => pts.filter(col.test));
    const used = cp.flat();
    if (!used.length) return '<p class="rs-hint">这段时间没有带开始和结束时间的已评级记录，这张图需要时间段</p>';
    const hs = used.map(p => p.hh);
    let h0 = Math.min(...hs), h1 = Math.max(...hs); h0 -= h0 % 2; if (h1 % 2 === 0) h1++;
    const n = cols.length;
    let html = `<div class="hm" style="grid-template-columns:2.8em repeat(${n},minmax(${n > 8 ? 22 : 30}px,1fr))"><span></span>`;
    html += cols.map(col => `<div class="hm-h lv${col.avg ? lvOf(col.avg) : 0}"><b>${col.head}</b>${col.sub ? `<small>${col.sub}</small>` : ''}</div>`).join('');
    const cells = [];
    for (let h = h0; h <= h1; h++) {
      html += `<span class="hm-t">${h % 2 ? '' : `${h / 2}:00`}</span>`;
      cols.forEach((col, ci) => {
        const l = cp[ci].filter(p => p.hh === h), v = l.length ? mean(l.map(p => p.v)) : 0, key = `${id}${ci}:${h}`;
        if (l.length) cells.push({ col, h, l, v });
        html += `<button class="hm-c lv${v ? lvOf(v) : 0}${l.length && l.length < minN ? ' few' : ''}${rs.pick === key ? ' sel' : ''}" data-pick="${key}" aria-label="${col.name} ${hhLabel(h)}"></button>`;
      });
    }
    html += '</div>';
    // 一句话：最好 / 最差的格子（样本够的）
    let pool = cells.filter(x => x.l.length >= minN); if (pool.length < 2) pool = cells;
    pool.sort((a, b) => b.v - a.v || b.l.length - a.l.length);
    const said = x => `${x.col.name} ${hhLabel(x.h)}「${lvText(labels, x.v)}」`;
    const say = pool.length >= 2 ? `<p class="rs-say3">最好：${said(pool[0])}<br>最差：${said(pool[pool.length - 1])}</p>` : '';
    let det = `<p class="rs-hint">点格子看是哪些记录${minN > 1 ? `；颜色发淡的格子不到 ${minN} 段，只能参考` : ''}</p>`;
    if (rs.pick && rs.pick.startsWith(id)) {
      const [ci, h] = rs.pick.slice(id.length).split(':').map(Number), x = cells.find(c => c.col === cols[ci] && c.h === h);
      if (x) det = `<div class="rs-pickd"><p><b>${x.col.name} ${hhLabel(h)}–${hhLabel(h + 1)}</b>　平均 ${f1(x.v)}，算作「${lvText(labels, x.v)}」· ${x.l.length} 段，来自：</p>${pickList([...new Set(x.l.map(p => p.e))])}</div>`;
    }
    return say + `<div class="hm-wrap">${html}</div>` + legend(labels) + det;
  }
  const WDS = '日一二三四五六';
  function weekdayCols(rated, ws) {
    return [0, 1, 2, 3, 4, 5, 6].map(i => { const wd = (ws + i) % 7, l = rated.filter(e => MC.parse(e.date).getDay() === wd);
      return { head: WDS[wd], name: '周' + WDS[wd], avg: l.length ? avgOf(l) : 0, test: p => MC.parse(p.e.date).getDay() === wd }; });
  }
  const monthCols = (rated, keys, multiYear) => keys.map(k => { const l = rated.filter(e => e.date.startsWith(k));
    return { head: keys.length > 8 ? String(+k.slice(5)) : `${+k.slice(5)}月`, sub: multiYear && (k.endsWith('-01') || k === keys[0]) ? k.slice(2, 4) + '年' : '', name: `${multiYear ? k.slice(0, 4) + '年' : ''}${+k.slice(5)}月`, avg: l.length ? avgOf(l) : 0, test: p => p.e.date.startsWith(k) }; });
  function timeMap(c, evs, rated, span, labels) {
    const pts = segPoints(evs), ws = MC.settings.weekStart || 0;
    if (rs.range === 'week') { // 这周的 7 天：每列是具体的那一天
      const cols = []; for (let d = new Date(span[0]); d <= span[1]; d = MC.addDays(d, 1)) { const ds = MC.ymd(d), l = rated.filter(e => e.date === ds);
        cols.push({ head: WDS[d.getDay()], sub: String(d.getDate()), name: `${d.getMonth() + 1}月${d.getDate()}日`, avg: l.length ? avgOf(l) : 0, test: p => p.e.date === ds }); }
      return card('这周每天各时段的状态', heatmap('w', cols, pts, labels, 1));
    }
    if (rs.range === 'month') return card('这个月平均下来：周几 × 时段', heatmap('m', weekdayCols(rated, ws), pts, labels, 2));
    if (rs.range === 'year') {
      const y = span[0].getFullYear(), keys = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
      return card(`${y}年每个月平均下来的时段状态`, heatmap('y', monthCols(rated, keys, false), pts, labels, 2));
    }
    // 全部：上面是每个月的时段状态，下面选一个月看它的「周几 × 时段」
    const ks = [...new Set(rated.map(e => e.date.slice(0, 7)))].sort();
    if (!ks.length) return '';
    const keys = []; for (let d = new Date(+ks[0].slice(0, 4), +ks[0].slice(5) - 1, 1); MC.ymd(d).slice(0, 7) <= ks[ks.length - 1]; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) keys.push(MC.ymd(d).slice(0, 7));
    const multiYear = keys[0].slice(0, 4) !== keys[keys.length - 1].slice(0, 4);
    if (!rs.allMonth || !ks.includes(rs.allMonth)) rs.allMonth = ks[ks.length - 1];
    const mk = rs.allMonth, mRated = rated.filter(e => e.date.startsWith(mk)), mPts = pts.filter(p => p.e.date.startsWith(mk));
    const chips = `<div class="rs-mchips">${ks.map(k => `<button data-month="${k}"${k === mk ? ' class="on"' : ''}>${multiYear ? k.slice(2, 4) + '年' : ''}${+k.slice(5)}月</button>`).join('')}</div>`;
    return card('每个月平均下来的时段状态', heatmap('a', monthCols(rated, keys, multiYear), pts, labels, 2))
      + card(`${multiYear ? mk.slice(0, 4) + '年' : ''}${+mk.slice(5)}月平均下来：周几 × 时段`, chips + heatmap('b', weekdayCols(mRated, ws), mPts, labels, 2));
  }
  function pageAll(c, evs, rated, span, labels) {
    const avg = avgOf(rated), done = evs.filter(e => e.done).length;
    let cmp = '';
    if (span && rated.length) {
      const p = rsSpan(rs.off - 1), a = MC.ymd(p[0]), b = MC.ymd(p[1]);
      const prev = MC.data.events.filter(e => e.cal === c.id && e.rate && e.date >= a && e.date <= b && e.date <= MC.todayStr());
      if (prev.length) { const d = avg - avgOf(prev), w = { week: '上周', month: '上个月', year: '去年' }[rs.range]; cmp = Math.abs(d) < .05 ? `和${w}差不多` : `比${w}${d > 0 ? '好' : '差'} ${f1(Math.abs(d))}`; }
    }
    const max = Math.max(1, ...[1, 2, 3, 4].map(v => rated.filter(e => e.rate === v).length));
    const dist = [4, 3, 2, 1].map(v => { const k = rated.filter(e => e.rate === v).length;
      return `<div class="rs-dr"><span data-uc>${MC.esc(labels[v - 1])}</span><i><b class="lv${v}" style="width:${(k / max * 100).toFixed(1)}%"></b></i><em>${k} 条</em></div>`; }).join('');
    const hero = `<section class="rs-hero">
        <p class="rs-say">${rated.length ? `整体是「${lvText(labels, avg)}」` : '还没有评级'}</p>
        <div class="rs-big">${rated.length ? f1(avg) : '–'}<small> / 4</small></div>
        <div class="rs-sub">${[`${evs.length} 条记录`, `完成 ${Math.round(done / evs.length * 100)}%`, evs.length - rated.length ? `${evs.length - rated.length} 条没评级` : '', cmp].filter(Boolean).join(' · ')}</div>
        ${rated.length ? `<div class="rs-dist">${dist}</div>` : ''}
      </section>`;
    if (!rated.length) return hero;
    // 亮点：只用样本够的数据，并写明是几条算出来的
    const facts = [];
    const sp = segPoints(evs), slots = SLOTS.map(s => ({ s, l: sp.filter(p => p.clock >= s[1] * 60 && p.clock < s[2] * 60) })).filter(x => x.l.length >= MIN_N);
    if (slots.length >= 2) { const b = slots.sort((x, y) => mean(y.l.map(p => p.v)) - mean(x.l.map(p => p.v)))[0], v = mean(b.l.map(p => p.v)); facts.push(['状态最好的时段', `${b.s[0]}　${lvText(labels, v)}`, `${b.l.length} 个半小时`]); }
    const wd = [0, 1, 2, 3, 4, 5, 6].map(d => ({ d, l: rated.filter(e => MC.parse(e.date).getDay() === d) })).filter(x => x.l.length >= MIN_N);
    if (wd.length >= 3) { const b = wd.sort((x, y) => avgOf(y.l) - avgOf(x.l))[0]; facts.push(['状态最好的星期', `${WD[b.d]}　${lvText(labels, avgOf(b.l))}`, `${b.l.length} 条`]); }
    const g = new Map(); rated.forEach(e => { const k = e.title.trim(); g.set(k, [...(g.get(k) || []), e]); });
    const gs = [...g.entries()].filter(([, l]) => l.length >= MIN_N);
    if (gs.length >= 2) { const b = gs.sort((x, y) => avgOf(y[1]) - avgOf(x[1]))[0]; facts.push(['评价最高的事件', `<span data-uc>${MC.esc(b[0])}</span>　${lvText(labels, avgOf(b[1]))}`, `${b[1].length} 次`]); }
    const fc = facts.length ? card('', facts.map(([k, v, n]) => `<div class="rs-kv"><span>${k}</span><b>${v}<small>${n}</small></b></div>`).join('')) : '';
    return hero + timeMap(c, evs, rated, span, labels) + fc;
  }
  // 时段：按钟点排成一张「时间表」，每格写着等级名和段数，一看就知道几点状态好
  function pageSlot(c, evs, labels) {
    const pts = segPoints(evs);
    if (!pts.length) return `<div class="rs-empty">还没有带开始和结束时间、评了级的记录</div>`;
    const avgP = l => mean(l.map(p => p.v)), byH = new Map();
    pts.forEach(p => byH.set(p.hh, [...(byH.get(p.hh) || []), p]));
    const range = h => `${hhLabel(h)}–${hhLabel(h + 1)}`;
    // 最好 / 最差：只看至少 MIN_N 段的半小时；都不够时退一步但标明「记录少」
    let pool = [...byH.entries()].filter(([, l]) => l.length >= MIN_N), few = false;
    if (pool.length < 2) { pool = [...byH.entries()]; few = true; }
    pool.sort((a, b) => avgP(b[1]) - avgP(a[1]) || b[1].length - a[1].length);
    const say = (h, l) => `<b>${range(h)}</b>　「${lvText(labels, avgP(l))}」<small>平均 ${f1(avgP(l))} · ${l.length} 段</small>`;
    const sum = pool.length >= 2 ? card('', `<div class="rs-kv"><span>状态最好</span><span class="rs-v">${say(...pool[0])}</span></div><div class="rs-kv"><span>状态最差</span><span class="rs-v">${say(...pool[pool.length - 1])}</span></div>`
      + (few ? `<p class="rs-hint">每个半小时的记录都还很少（不到 ${MIN_N} 段），结论只能参考</p>` : '')) : '';
    // 时间表：每行一个钟点，左右两格是 :00 和 :30
    const hs = [...byH.keys()], h0 = Math.floor(Math.min(...hs) / 2), h1 = Math.floor(Math.max(...hs) / 2);
    let rows = '';
    for (let H = h0; H <= h1; H++) {
      rows += `<div class="rs-tr"><span class="rs-th">${H}:00</span>${[H * 2, H * 2 + 1].map(h => { const l = byH.get(h) || [], v = l.length ? avgP(l) : 0;
        return `<button class="rs-tc lv${v ? lvOf(v) : 0}${l.length && l.length < MIN_N ? ' few' : ''}${rs.pick === 'h' + h ? ' sel' : ''}" data-pick="h${h}">${v ? `<b data-uc>${short(labels, v)}</b><small>${l.length} 段</small>` : ''}</button>`; }).join('')}</div>`;
    }
    let det = `<p class="rs-hint">每格是这半小时所有记录的平均；虚线格记录少于 ${MIN_N} 段。点格子看是哪些记录</p>`;
    if (rs.pick && rs.pick[0] === 'h') {
      const h = +rs.pick.slice(1), l = byH.get(h) || [];
      det = l.length ? `<div class="rs-pickd"><p><b>${range(h)}</b>　平均 ${f1(avgP(l))}，算作「${lvText(labels, avgP(l))}」· ${l.length} 段，来自这些记录：</p>${pickList([...new Set(l.map(p => p.e))])}</div>` : '';
    }
    const table = card('每个半小时的状态', `<div class="rs-tt">${rows}</div>${legend(labels)}${det}`);
    // 开始之后：第几个半小时，用横条 + 等级名
    const maxI = Math.min(11, Math.max(...pts.map(p => p.idx)));
    let after = '';
    if (maxI >= 1) {
      const span2 = i => (i === 0 ? '开始后 0–30 分' : `开始后 ${offLabel(i)}–${offLabel(i + 1)}`.replace('开始–', ''));
      const lines = []; for (let i = 0; i <= maxI; i++) { const l = pts.filter(p => p.idx === i); if (l.length) lines.push({ i, l, v: avgP(l) }); }
      const vl = lines.filter(x => x.l.length >= MIN_N).length >= 2 ? lines.filter(x => x.l.length >= MIN_N) : lines;
      const firstV = vl[0].v, lastV = vl[vl.length - 1].v, d = lastV - firstV;
      const verdict = Math.abs(d) < .3 ? '从头到尾差不多' : d < 0 ? `越往后越差：刚开始是「${lvText(labels, firstV)}」，到后面降到「${lvText(labels, lastV)}」` : `越往后越好：刚开始是「${lvText(labels, firstV)}」，后面升到「${lvText(labels, lastV)}」`;
      after = card('做一件事时，开始之后的变化', `<p class="rs-say2">${verdict}</p>` + lines.map(x => `<div class="rs-dr rs-dr2"><span>${span2(x.i)}</span><i><b class="lv${lvOf(x.v)}" style="width:${(x.v / 4 * 100).toFixed(1)}%"></b></i><em><span data-uc>${short(labels, x.v)}</span><small>${x.l.length} 段</small></em></div>`).join(''));
    }
    return sum + table + after;
  }
  function pageEv(c, evs, labels) {
    const g = new Map(); evs.forEach(e => { const k = e.title.trim(); g.set(k, [...(g.get(k) || []), e]); });
    const pre = new Set((c.presets || []).map(p => p.name));
    const list = [...g.entries()].map(([name, l]) => ({ name, l, r: l.filter(e => e.rate) })).sort((x, y) => y.l.length - x.l.length || avgOf(y.r) - avgOf(x.r)).slice(0, 50);
    const rows = list.map(x => {
      const open = rs.openEv === x.name;
      let det = '';
      if (open) {
        const dl = x.l.map(durOf).filter(d => d !== null), sp = segPoints(x.l);
        const sl = SLOTS.map(s => ({ s, l: sp.filter(p => p.clock >= s[1] * 60 && p.clock < s[2] * 60) })).filter(y => y.l.length).sort((a, b) => mean(b.l.map(p => p.v)) - mean(a.l.map(p => p.v)));
        const cells = [['完成', `${Math.round(x.l.filter(e => e.done).length / x.l.length * 100)}%`], dl.length ? ['平均时长', fmtDur(mean(dl))] : null, sl.length > 1 ? ['最好时段', sl[0].s[0]] : null].filter(Boolean);
        const shown = rs.allEv ? [...x.l].reverse() : [...x.l].reverse().slice(0, 5);
        det = `<div class="rs-det"><div class="rs-cells">${cells.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
          <ul class="rs-list">${shown.map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul>
          ${x.l.length > 5 ? `<button class="rs-more" data-more>${rs.allEv ? '收起' : `查看全部 ${x.l.length} 条`}</button>` : ''}</div>`;
      }
      return `<div class="rs-ev${open ? ' open' : ''}"><button class="rs-evh" data-ev="${MC.esc(x.name)}">
          <span class="rs-evn"><span data-uc>${MC.esc(x.name)}</span>${pre.has(x.name) ? '<i class="rs-dot" title="常用事件"></i>' : ''}</span>
          <span class="rs-evc">${x.l.length} 次</span>
          <b${x.r.length ? ` class="rs-t lv${lvOf(avgOf(x.r))}"` : ''}>${x.r.length ? f1(avgOf(x.r)) : '–'}</b>
        </button>${det}</div>`;
    }).join('');
    return `<section class="rs-card rs-evs">${rows}</section>`;
  }
  // 备注：哪些词常和高分 / 低分一起出现
  const STOP = new Set(('的 了 是 我 你 他 她 它 们 也 很 都 就 在 和 与 及 或 有 没 不 这 那 个 一 一个 一些 还 又 再 被 把 给 让 吧 吗 呢 啊 呀 哦 嗯 着 过 到 说 要 会 能 可以 觉得 感觉 比较 有点 一点 非常 特别 真的 然后 但是 但 而且 因为 所以 如果 什么 怎么 自己 没有 就是 还是 已经 之后 之前 时候 今天 昨天 明天 '
    + 'the a an and or of to in is it this that for on with was are be i my me so very but not').split(' '));
  let segr = null; try { segr = new Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) {}
  function tokens(s) {
    const out = new Set(), txt = String(s || '').toLowerCase();
    const add = w => { w = w.trim(); if (!w || STOP.has(w) || /^[\d.,:]+$/.test(w)) return; if (!/[\u3400-\u9fff]/.test(w) && w.length < 3) return; out.add(w.slice(0, 16)); };
    if (segr) { // 词典里没有的词会被切成单字：连续的单个汉字拼回一个词
      let run = ''; const flush = () => { if (run) add(run); run = ''; };
      for (const t of segr.segment(txt)) { if (!t.isWordLike) { flush(); continue; } const w = t.segment; if (w.length === 1 && /[\u3400-\u9fff]/.test(w) && !STOP.has(w)) run += w; else { flush(); add(w); } }
      flush();
    } else {
      (txt.match(/[a-z\u00c0-\u024f0-9']+/g) || []).forEach(add);
      (txt.match(/[\u3400-\u9fff]+/g) || []).forEach(r => { if (r.length === 1) add(r); for (let i = 0; i + 1 < r.length; i++) add(r.slice(i, i + 2)); });
    }
    return out;
  }
  function pageNote(c, rated) {
    const withNote = rated.filter(e => e.note);
    if (!withNote.length) return `<div class="rs-empty">这段时间的已评级记录还没有写备注</div>`;
    const m = new Map();
    for (const e of withNote) for (const w of tokens(e.note)) m.set(w, [...(m.get(w) || []), e]);
    const all = avgOf(rated), min = withNote.length >= 8 ? 2 : 1;
    const ws = [...m.entries()].filter(([, l]) => l.length >= min).map(([w, l]) => ({ w, n: l.length, v: avgOf(l) }));
    const hi = ws.filter(x => x.v > all + .1).sort((a, b) => b.v - a.v || b.n - a.n).slice(0, 8);
    const lo = ws.filter(x => x.v < all - .1).sort((a, b) => a.v - b.v || b.n - a.n).slice(0, 8);
    const chips = l => `<div class="rs-chips">${l.map(x => `<span class="rs-chip lv${lvOf(x.v)}"><span data-uc>${MC.esc(x.w)}</span><em>${f1(x.v)}</em></span>`).join('')}</div>`;
    const nn = rated.filter(e => !e.note);
    return (hi.length ? card('高分时常写到', chips(hi)) : '') + (lo.length ? card('低分时常写到', chips(lo)) : '')
      + (!hi.length && !lo.length ? `<div class="rs-empty">备注还太少，看不出规律</div>` : '')
      + (nn.length ? `<p class="rs-foot">写了备注的平均 ${f1(avgOf(withNote))}，没写的 ${f1(avgOf(nn))}</p>` : '');
  }

  const RS_TABS = [['all', '概览'], ['slot', '时段'], ['ev', '事件'], ['note', '备注']];
  function renderRstat() {
    const c = recCal();
    if (!c) { $('#rsBody').innerHTML = '<div class="rs-empty">当前日历没有开等级评分</div>'; return; }
    const span = rsSpan(), labels = MC.rateLabels(c.id);
    $('#rsName').textContent = c.name;
    $('#page-rstat').style.setProperty('--c', c.color);
    $('#rsTabs').innerHTML = RS_TABS.map(([v, l]) => `<button data-v="${v}"${v === rs.tab ? ' class="on"' : ''}>${l}</button>`).join('');
    $('#rsSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === rs.range));
    $('#rsNav').hidden = !span;
    if (span) $('#rsLabel').textContent = rs.range === 'week' ? `${MC.dateLabel(MC.ymd(span[0]))} – ${MC.dateLabel(MC.ymd(span[1]))}` : rs.range === 'month' ? `${span[0].getFullYear()}年${span[0].getMonth() + 1}月` : `${span[0].getFullYear()}年`;
    const a = span ? MC.ymd(span[0]) : '', b = span ? MC.ymd(span[1]) : '';
    const today = MC.todayStr();
    const evs = MC.data.events.filter(e => e.cal === c.id && e.date <= today && (!span || (e.date >= a && e.date <= b)))
      .sort((x, y) => x.date.localeCompare(y.date) || (x.time || '').localeCompare(y.time || ''));
    const rated = evs.filter(e => e.rate);
    try {
      $('#rsBody').innerHTML = !evs.length ? '<div class="rs-empty">这段时间还没有记录</div>'
        : rs.tab === 'slot' ? pageSlot(c, evs, labels) : rs.tab === 'ev' ? pageEv(c, evs, labels) : rs.tab === 'note' ? pageNote(c, rated) : pageAll(c, evs, rated, span, labels);
    } catch (err) { // 出错时不留白页：把原因显示出来
      console.error(err);
      $('#rsBody').innerHTML = `<div class="rs-empty">统计页出错了：${MC.esc(err && err.message || err)}<br><small>多半是有文件没更新到同一版本，把最新的包整个覆盖后刷新</small></div>`;
    }
  }
  UI.bindList($('#rsBody'));
  $('#rsBody').addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { rs.allEv = !rs.allEv; renderRstat(); return; }
    const mo = e.target.closest('[data-month]');
    if (mo) { rs.allMonth = mo.dataset.month; rs.pick = null; renderRstat(); return; }
    const pk = e.target.closest('[data-pick]');
    if (pk) { rs.pick = rs.pick === pk.dataset.pick ? null : pk.dataset.pick; renderRstat(); return; }
    const h = e.target.closest('.rs-evh'); if (!h) return;
    rs.openEv = rs.openEv === h.dataset.ev ? null : h.dataset.ev; rs.allEv = false; renderRstat();
  });
  $('#rsTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rs.tab = b.dataset.v; rs.pick = null; renderRstat(); $('.rs-scroll').scrollTop = 0; });
  $('#rsSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rs.range = b.dataset.v; rs.off = 0; rs.pick = null; renderRstat(); });
  $('#rsPrev').onclick = () => { rs.off--; rs.pick = null; renderRstat(); };
  $('#rsNext').onclick = () => { rs.off++; rs.pick = null; renderRstat(); };

  // ---------- 头像 / 昵称 ----------
  const initial = () => (MC.data.profile.name || '我').trim().slice(0, 1).toUpperCase();
  function paintAvatar(el) {
    const a = MC.data.profile.avatar;
    el.innerHTML = a ? `<img src="${a}" alt="">` : `<span>${esc(initial())}</span>`;
  }
  function paintTabAvatar() {
    const a = MC.data.profile.avatar;
    $('#tabAvatar').hidden = !a; $('#tabGear').style.display = a ? 'none' : '';
    if (a) $('#tabAvatar').style.backgroundImage = `url("${a}")`;
  }
  $('#avatarBtn').onclick = () => {
    if (!MC.data.profile.avatar) { $('#avatarFile').click(); return; }
    UI.menu($('#avatarBtn'), [{ label: '更换头像', value: 'change' }, { label: '移除头像', value: 'remove' }], v => {
      if (v === 'change') $('#avatarFile').click();
      else { MC.setProfile({ avatar: '' }); renderSettings(); }
    });
  };
  $('#avatarFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const S = 192, c = document.createElement('canvas');
      c.width = c.height = S;
      const k = Math.max(S / img.width, S / img.height);
      const w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      MC.setProfile({ avatar: c.toDataURL('image/jpeg', 0.85) });
      URL.revokeObjectURL(img.src);
      renderSettings();
    };
    img.onerror = () => UI.toast('无法读取这张图片');
    img.src = URL.createObjectURL(f);
  };
  $('#nickInput').addEventListener('change', () => {
    MC.setProfile({ name: $('#nickInput').value.trim().slice(0, 20) });
    renderSettings();
  });
  $('#nickInput').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  // ---------- 设置 ----------
  let iosScript = '', workflowYml = '';
  // 图标：实心的形状（.f），线条加粗（.s），细节用底块颜色挖空（.k / .k2），见 styles.css 的 .sicon
  const IC = {
    globe: '<svg viewBox="0 0 24 24"><circle class="f" cx="12" cy="12" r="8.5"/><path class="k" d="M3.5 12h17M12 3.5c2.5 2.4 3.7 5.2 3.7 8.5s-1.2 6.1-3.7 8.5c-2.5-2.4-3.7-5.2-3.7-8.5s1.2-6.1 3.7-8.5z"/></svg>',
    theme: '<svg viewBox="0 0 24 24"><circle class="s" cx="12" cy="12" r="7.6"/><path class="f" d="M12 4.4a7.6 7.6 0 0 1 0 15.2z"/></svg>',
    week: '<svg viewBox="0 0 24 24"><rect class="f" x="3.5" y="5" width="17" height="15.5" rx="3.6"/><path class="k" d="M3.5 10h17"/><path class="s" d="M8.5 3v3.6M15.5 3v3.6"/><circle class="k2" cx="8.5" cy="14.5" r="1.3"/><circle class="k2" cx="12" cy="14.5" r="1.3"/><circle class="k2" cx="15.5" cy="14.5" r="1.3"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path class="s" d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path class="s" d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path class="f" d="M7.5 19a4.75 4.75 0 0 1-.6-9.46 5.8 5.8 0 0 1 11.2 1.55A3.95 3.95 0 0 1 17.6 19z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path class="s" d="M19 12a7 7 0 1 1-2.05-4.95"/><path class="f" d="M20 3.5v6.2h-6.2z"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path class="s" d="M4 8.5h11M20 15.5H9"/><path class="f" d="M14 4.5l6 4-6 4zM10 11.5l-6 4 6 4z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect class="f" x="5" y="10" width="14" height="10.5" rx="2.8"/><path class="s" d="M8.3 10V8a3.7 3.7 0 0 1 7.4 0v2"/></svg>',
    lockNow: '<svg viewBox="0 0 24 24"><rect class="f" x="5" y="10" width="14" height="10.5" rx="2.8"/><path class="s" d="M8.3 10V8a3.7 3.7 0 0 1 7.4 0v2"/><path class="k" d="M12 13.7v3"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle class="f" cx="8.2" cy="12" r="4.4"/><circle class="k2" cx="7.4" cy="12" r="1.4"/><path class="s" d="M12 12h8.5M17.4 12v3.2M20.5 12v2.4"/></svg>',
    unlink: '<svg viewBox="0 0 24 24"><path class="s" d="M10 14l-1 1a3 3 0 0 1-4.2-4.2l2-2M14 10l1-1a3 3 0 0 1 4.2 4.2l-2 2M5 5l14 14"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path class="f" d="M12 3.2a6 6 0 0 0-6 6v5.3l-1.8 2.3c-.4.5 0 1.2.6 1.2h14.4c.6 0 1-.7.6-1.2L18 14.5V9.2a6 6 0 0 0-6-6z"/><path class="f" d="M9.6 19.4h4.8a2.4 2.4 0 0 1-4.8 0z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path class="f" d="M3.8 11.3L20.2 4.2c.5-.2 1 .3.8.8l-7.1 16.4c-.3.6-1.2.5-1.3-.1l-1.5-5.7-5.7-1.5c-.6-.2-.7-1-.1-1.3z"/><path class="k" d="M11.2 14.1l4-4"/></svg>',
    laptop: '<svg viewBox="0 0 24 24"><rect class="f" x="4.5" y="5" width="15" height="10.8" rx="2.2"/><path class="s" d="M2.8 18.8h18.4"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect class="f" x="6.5" y="2.5" width="11" height="19" rx="3"/><path class="k" d="M10.6 18.2h2.8"/></svg>',
    android: '<svg viewBox="0 0 24 24"><path class="f" d="M5 11a7 7 0 0 1 14 0v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18z"/><path class="s" d="M8 4.2l1.5 2M16 4.2l-1.5 2"/><circle class="k2" cx="9.6" cy="12" r="1.1"/><circle class="k2" cx="14.4" cy="12" r="1.1"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path class="f" d="M5 12.5h3.5v4.5h7v-4.5H19v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path class="s" d="M12 14V4.2M8.2 7.8L12 4l3.8 3.8"/></svg>',
    import: '<svg viewBox="0 0 24 24"><path class="f" d="M5 12.5h3.5v4.5h7v-4.5H19v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path class="s" d="M12 3.8v10M8.2 10.2L12 14l3.8-3.8"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect class="f" x="4" y="4" width="7" height="7" rx="2"/><rect class="f" x="13" y="4" width="7" height="7" rx="2"/><rect class="f" x="4" y="13" width="7" height="7" rx="2"/><rect class="f" x="13" y="13" width="7" height="7" rx="2"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle class="f" cx="12" cy="12" r="4.4"/><path class="s" d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle class="f" cx="12" cy="12" r="8.6"/><path class="k" d="M12 7.2V12l3.2 2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path class="f" d="M12 20.5s-7.8-4.6-7.8-10.6a4.3 4.3 0 0 1 7.8-2.6 4.3 4.3 0 0 1 7.8 2.6c0 6-7.8 10.6-7.8 10.6z"/></svg>',
  };
  const CHEV = '<span class="chev"><svg viewBox="0 0 8 13"><path d="M1.5 1.5l5 5-5 5"/></svg></span>';
  // 图标颜色：中性的灰底块 + 实心、饱和的彩色图形（App 里所有图标底块都是这一套）。[浅色, 深色]
  const SET_TONES = { rose: ['#E04A63', '#FF6F86'], coral: ['#E25B3A', '#FF8366'], apricot: ['#E08A16', '#FFB547'], sage: ['#2FA352', '#58D27C'], jade: ['#109E8C', '#3FD3BE'], teal: ['#1A93B8', '#4CC3E2'], sky: ['#2F7BE0', '#5EA8FF'], periwinkle: ['#5260DB', '#8492FF'], lavender: ['#8A55DB', '#B48CFF'], orchid: ['#BD48BA', '#E27BDD'] };
  const DT = s => (MC.Days ? MC.Days.T(s) : s); // 纪念日历（js/days.js）的文字
  function srow(o) {
    const sub = o.sub ? `<small>${esc(o.sub)}</small>` : '';
    const val = o.val ? `<span class="sval">${esc(o.val)}</span>` : '';
    const help = o.help ? `<button class="help" data-help="${o.help}" aria-label="查看步骤">?</button>` : '';
    const right = o.sw !== undefined
      ? `<input type="checkbox" class="switch" id="${o.sw}" ${o.swOn ? 'checked' : ''}>${help}`
      : `${val}${help}${o.chev === false ? '' : CHEV}`;
    // 图标风格和应用一致（同色淡底 + 同色线条），每一项一种颜色：十种颜色在 OKLCH 里明度、彩度相同，只是色相不同，
    // 大致按含义分（通知珊瑚、每日杏色、同步玉青……），同一组里相邻两项颜色一定不同；深色模式用稍亮的同色。危险操作用红
    const t = SET_TONES[o.tone];
    const icStyle = t ? `--icl:${t[0]};--icd:${t[1]}` : o.tone === 'danger' ? '--icl:var(--red);--icd:var(--red)' : '--icl:var(--accent);--icd:var(--accent)';
    const inner = `<span class="sicon" style="${icStyle}">${IC[o.icon]}</span><span class="slabel">${esc(o.label)}${sub}</span>${right}`;
    return o.sw !== undefined
      ? `<label class="srow">${inner}</label>`
      : `<div class="srow tap${o.danger ? ' danger' : ''}" role="button" tabindex="0" data-act="${o.act}">${inner}</div>`;
  }
  const group = (title, rows, hint) =>
    `<div class="sgroup-title">${title}</div><div class="sgroup">${rows.join('')}</div>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}`;
  function syncText() {
    if (!MC.vault.connected()) return ['未连接同步', ''];
    if (MC.vault.locked()) return ['已锁定', ''];
    if (MC.syncState.busy) return ['同步中…', 'busy'];
    if (MC.syncState.error) return [MC.syncState.error, 'err'];
    return MC.settings.lastSync
      ? ['已同步 · ' + new Date(MC.settings.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 'ok']
      : ['尚未同步', ''];
  }
  function paintStatus() {
    const [t, cls] = syncText();
    $('#profileSub').textContent = t;
    $('#statusPill').className = 'status-pill' + (cls ? ' ' + cls : '');
  }
  function notifyHint() {
    const on = Push.enabled();
    if (Push.native) {
      if (!on) return MC.settings.notify && Push.permission() === 'denied' ? '通知权限被关闭了，点「提醒权限检查」重新打开。' : '设置了提醒的事件会到点通知你，App 关着、断网也会准时提醒。';
      if (MC.Native.ios || MC.Native.mac) return '保存时就按提醒时间交给系统排好，App 关着、断网也会准时提醒。';
      return '由手机系统在本机准时提醒，App 关着、断网也会响。三星手机请在「提醒权限检查」里把各项都设成 ✓。';
    }
    if (!Push.supported()) return '这个浏览器不支持通知。';
    if (Push.isIOS && !Push.standalone()) return 'iPhone 需要从主屏幕图标打开节律才能开启通知（iOS 16.4 及以上）。';
    if (!on) return MC.settings.notify && Push.permission() === 'denied' ? '通知权限被系统拒绝，请到系统设置中允许。' : '设置了提醒的事件会到点通知你。';
    if (MC.settings.remoteSetup) return 'App 关闭时由你仓库里的 GitHub 定时任务每 5 分钟检查并推送，高峰时可能晚几分钟。';
    return '目前只在 App 打开时提醒。连接 GitHub 后，App 关闭时也能收到推送。';
  }
  function nativePermSummary() {
    const st = MC.Native.status();
    const bad = [st.notif !== 'granted' && '通知', !st.exact && '精确闹钟', !st.battery && '电池'].filter(Boolean);
    return bad.length ? `需要处理：${bad.join('、')}` : '各项都已就绪';
  }
  // 「让提醒准时」（cron-job.org 每 5 分钟叫醒定时任务）也是按账号设置一次：最近 30 分钟里有被叫醒的运行，
  // 就说明已经在运行，不再显示设置步骤；哪天停了，这一行会自己回来。公开仓库不用令牌就能查，最多一小时查一次
  let boostChecking = false, boostTok = ''; // boostTok：向导里验证过的叫醒令牌，只留在内存里，用来复制 Authorization
  // since：向导里点「我设置好了」之后，只认那之后的叫醒（不受一小时只查一次的限制）
  async function checkBoost(since) {
    const S = MC.settings, repo = (S.remoteSetup && S.remoteSetup.repo) || Push.guessRepo();
    if (!repo || (!since && (boostChecking || Date.now() - (S.boostCheckedAt || 0) < (S.boostOn ? 3600e3 : 600e3)))) return false;
    boostChecking = true;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/reminders.yml/runs?event=workflow_dispatch&per_page=1`,
        { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) return false;
      const run = ((await r.json()).workflow_runs || [])[0];
      const t = run ? Date.parse(run.created_at) : 0;
      const on = !!run && Date.now() - t < 30 * 60e3;
      if (since && t < since) return false;
      const changed = on !== !!S.boostOn;
      S.boostOn = on; S.boostCheckedAt = Date.now(); MC.saveSettings();
      if (changed) renderSettings();
      return on;
    } catch (e) { return false; } finally { boostChecking = false; }
  }
  function renderSettings() {
    const pf = MC.data.profile;
    $('#avatarImg').hidden = !pf.avatar;
    if (pf.avatar) $('#avatarImg').src = pf.avatar;
    $('#avatarInitial').textContent = pf.avatar ? '' : initial();
    $('#avatarBtn').querySelector('.avatar-edit').textContent = pf.avatar ? '更换' : '添加';
    if (document.activeElement !== $('#nickInput')) $('#nickInput').value = pf.name;
    paintStatus();

    const S = MC.settings;
    let gSync = '', gWidgets = '';
    const gDisplay = group('显示与时间', [
      srow({ act: 'theme', icon: 'theme', tone: 'periwinkle', label: '外观', val: { auto: '跟随系统', light: '浅色', dark: '深色' }[S.theme] }),
      srow({ act: 'week', icon: 'week', tone: 'rose', label: '每周第一天', val: S.weekStart ? '周一' : '周日' }),
      srow({ act: 'lang', icon: 'globe', tone: 'lavender', label: '语言', val: MC.langPref() === 'auto' ? '跟随系统语言' : (MC.LANGS.find(l => l.v === MC.langPref()) || {}).label }),
      srow({ act: 'clock', icon: 'clock', tone: 'teal', label: '时间格式', val: MC.clockPref() === '12' ? '12 小时制' : MC.clockPref() === '24' ? '24 小时制' : `跟随地区（${MC.region12() ? 12 : 24} 小时）` }),
    ]);
    if (!MC.vault.connected()) {
      gSync = group('同步', [
        srow({ act: 'connect', icon: 'link', tone: 'sky', label: '连接 GitHub', sub: '用自己的令牌在多台设备间同步', help: 'sync' }),
        srow({ act: 'dav', icon: 'cloud', tone: 'teal', label: '连接 WebDAV', sub: '坚果云、Nextcloud、群晖等，国内也能用' }),
        ...(MC.Native.has('icloud') ? [srow({ act: 'icloud', icon: 'cloud', tone: 'sky', label: '使用 iCloud 云盘', sub: '苹果设备之间同步，免费，不用另外注册账号', help: 'icloud' })] : []),
      ], MC.Native.has('icloud') ? '选一种：数据存在你自己的 GitHub、网盘或 iCloud 云盘里，账号和密码只保存在这台设备上。'
        : '二选一：数据存在你自己的 GitHub 或网盘里，账号和密码只保存在这台设备上。');
    } else {
      const ic = MC.isICloud(), dav = !ic && MC.isDav();
      let host = '';
      try { host = dav ? new URL(MC.settings.dav.url).host : ''; } catch (e) {}
      const rows = [
        ic ? srow({ act: 'account', icon: 'cloud', tone: 'sky', label: 'iCloud 云盘', sub: `文件夹「${MC.settings.icloud.name || ''}」`, help: 'icloud', chev: false })
        : dav ? srow({ act: 'account', icon: 'cloud', tone: 'teal', label: 'WebDAV', sub: host, val: MC.settings.dav.user || '', chev: false })
          : srow({ act: 'account', icon: 'link', tone: 'sky', label: 'GitHub 账号', val: MC.settings.account ? '@' + MC.settings.account : '已连接', chev: false }),
        srow({ act: 'sync', icon: 'refresh', tone: 'jade', label: '立即同步', sub: syncText()[0], help: 'sync', chev: false }),
      ];
      rows.push(ic ? srow({ act: 'icloud', icon: 'export', tone: 'apricot', label: '更换文件夹' })
        : dav ? srow({ act: 'redav', icon: 'key', tone: 'apricot', label: '更换账号或密码' }) : srow({ act: 'retoken', icon: 'key', tone: 'apricot', label: '更换令牌' }));
      rows.push(srow({ act: 'switch', icon: 'swap', tone: 'periwinkle', label: '更换同步方式' })); // 已连接时也能直接换到另一种，不用先断开
      rows.push(srow({ act: 'disconnect', icon: 'unlink', tone: 'danger', label: '断开连接', danger: true, chev: false }));
      gSync = group('同步', rows, ic ? '每台 Mac 选同一个 iCloud 云盘文件夹，数据就会互相同步；同步快慢由 iCloud 决定，一般几秒到一两分钟。'
        : dav ? '账号和密码只保存在这台设备上。' : '令牌只保存在这台设备上。');
    }
    const nrows = [srow({ icon: 'bell', tone: 'coral', label: '提醒通知', sw: 'nSwitch', swOn: Push.enabled(), help: 'notify' })];
    if (Push.enabled()) nrows.push(srow({ act: 'ntest', icon: 'send', tone: 'teal', label: '发送测试通知', chev: false }));
    if (Push.native) nrows.push(srow({ act: 'nperm', icon: 'bell', tone: 'sage', label: '提醒权限检查', sub: nativePermSummary(), help: 'nperm' }));
    const dl = MC.data.daily;
    const city = (dl.tz || MC.currentTz()).split('/').pop().replace(/_/g, ' ');
    nrows.push(srow({ icon: 'sun', tone: 'apricot', label: '每日未完成提醒', sub: dl.on ? `每天 ${MC.fmtTime(dl.time)} · 按当前时区（${city}）` : '每天提醒查看当天未完成的事件', sw: 'dSwitch', swOn: dl.on }));
    if (dl.on) nrows.push(srow({ act: 'dtime', icon: 'clock', tone: 'periwinkle', label: '每日提醒时间', val: MC.fmtTime(dl.time) }));
    // 始终显示，点进去会自动补齐前置条件（连接 GitHub、通知权限）；安卓 App 由系统提醒，不需要
    if (!Push.native) {
      nrows.splice(1, 0, S.remoteSetup
        ? srow({ act: 'nsetup', icon: 'cloud', tone: 'sky', label: 'App 关闭时也提醒', sub: S.remoteSetup.repo ? `由 ${S.remoteSetup.repo} 推送` : '', val: '已设置' })
        : srow({ act: 'nsetup', icon: 'cloud', tone: 'sky', label: 'App 关闭时也提醒', sub: '点这里一键设置', val: '未设置' }));
      if (S.remoteSetup) checkBoost();
      if (S.remoteSetup && !S.boostOn) nrows.splice(2, 0, srow({ act: 'boost', icon: 'clock', tone: 'lavender', label: '让提醒准时', sub: 'GitHub 定时任务会延迟，用 cron-job.org 每 5 分钟叫醒一次', help: 'boost', chev: false }));
    }
    const gRemind = group('提醒', nrows, notifyHint());
    if (MC.Native.mac) {
      const I = MC.Native.info;
      gWidgets += group('桌面小组件', [
        srow({ act: 'mwidget', icon: 'grid', tone: 'periwinkle', label: '添加桌面小组件', sub: '整月、今日、课表、纪念日', help: 'mwidget', chev: false }),
      ], '菜单栏右上角的日历图标也能随时查看本月和当天的事件。');
      gWidgets += group('Mac App', [
        srow({ act: 'macapp', icon: 'laptop', tone: 'sage', label: 'Mac App', sub: '点一下检查更新', val: I.app || '', chev: false }),
        ...(MC.Native.has('makeInstaller') ? [srow({ act: 'macpkg', icon: 'export', tone: 'apricot', label: '生成安装包', sub: '打包成 .dmg 放在桌面，可以直接发给别人', chev: false })] : []),
      ], '改网页不需要重新编译，打开就是最新的；只有原生部分（菜单栏、小组件、提醒）改了才需要在 Mac 上重新运行 macos/build.sh。');
    } else if (MC.Native.ios) {
      gWidgets += group('iPhone App', [
        srow({ icon: 'phone', tone: 'sage', label: 'iPhone App', sub: MC.Native.info.channel === 'mac' ? 'Mac 续签时自动更新到最新版' : '在 AltStore / SideStore 里更新', val: MC.Native.info.app || '', chev: false }),
      ], '改网页不需要更新 App，打开就是最新的；只有原生部分（提醒、玻璃菜单栏）改了才需要装新的安装包。');
    } else if (MC.Native.on) {
      gWidgets += group('桌面小组件', [
        srow({ act: 'pin:month', icon: 'grid', tone: 'periwinkle', label: '整月小组件', sub: '点一下添加到桌面', help: 'nwidget', chev: false }),
        srow({ act: 'pin:today', icon: 'sun', tone: 'apricot', label: '今日小组件', sub: '今天、已逾期和接下来一周', chev: false }),
        srow({ act: 'pin:sched', icon: 'clock', tone: 'teal', label: '课表小组件', sub: '今天的课，正在上的突出显示', chev: false }),
        ...(MC.Native.has('daysWidget') ? [srow({ act: 'pin:days', icon: 'heart', tone: 'rose', label: DT('纪念日小组件'), sub: DT('置顶或最近的日子，以及接下来的几个'), chev: false })] : []),
      ], '也可以长按桌面空白处 → 小组件 → 节律，按住拖到桌面。');
      const up = MC.Native.updateAvailable(), I = MC.Native.info;
      gWidgets += group('安卓 App', [
        srow({ act: 'apk', icon: 'android', tone: 'sage', label: '安卓 App', sub: up ? `有新版本 ${up.name}，点这里下载安装` : '点这里检查 App 更新', val: I.app || '', chev: false }),
      ], '改网页不需要更新 App，打开就是最新的；只有原生部分（小组件、提醒）改了才需要装新的 APK。');
    } else gWidgets += group('桌面小组件', [
      srow({ act: 'ios', icon: 'phone', tone: 'periwinkle', label: 'iOS 小组件', sub: '复制 Scriptable 脚本', help: 'ios', chev: false }),
      srow({ act: 'android', icon: 'android', tone: 'sage', label: '安卓小组件', sub: '复制小组件链接', help: 'android', chev: false }),
      srow({ act: 'iosSched', icon: 'phone', tone: 'orchid', label: 'iOS 课表小组件', sub: '今天的课 · 点一下即刷新', help: 'iosSched', chev: false }),
      srow({ act: 'androidSched', icon: 'android', tone: 'jade', label: '安卓课表小组件', sub: '复制课表小组件链接', chev: false }),
      srow({ act: 'iosDays', icon: 'heart', tone: 'rose', label: DT('iOS 纪念日小组件'), sub: DT('复制 Scriptable 脚本'), help: 'iosDays', chev: false }),
    ]);
    const gData = group('数据', [
      srow({ act: 'export', icon: 'export', tone: 'jade', label: '导出备份', chev: false }),
      srow({ act: 'import', icon: 'import', tone: 'sky', label: '导入备份', sub: '与现有数据合并', chev: false }),
      srow({ act: 'update', icon: 'refresh', tone: 'lavender', label: '检查更新', sub: `当前版本 ${MC.versionText()}`, chev: false }),
    ]);
    // 按重要程度排：最常来设置的是提醒，其次是显示，同步、小组件和数据放后面
    // iPhone 网页版 / 浏览器：Safari 不能自己读写 iCloud 云盘，只能每次手动选文件、存回去，和 Mac 的 iCloud 云盘同步接上
    const gIcFile = MC.Native.on ? '' : group('iCloud 云盘', [
      srow({ act: 'icfile', icon: 'cloud', tone: 'sky', label: '与 iCloud 云盘同步', help: 'icloud', chev: false,
        sub: S.icFileDirty ? '手机上有改动还没存回去' : S.icFileAt ? '上次 · ' + new Date(S.icFileAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '读取 Mac 的数据，合并后存回去' }),
    ], '给 Mac 的 iCloud 云盘同步用：浏览器不能自己读写 iCloud 云盘，只能你来点。用过一次后，打开节律或手机上有改动时会自动提醒你同步。');
    const h = gSync + gIcFile + gRemind + gDisplay + gWidgets + gData; // 同步放最上面：最常要看的就是有没有同步上
    $('#setGroups').innerHTML = h;
    const total = MC.data.events.length, done = MC.data.events.filter(e => e.done).length;
    $('#statLine').innerHTML = `版本 ${MC.versionText()} · 共 ${total} 个事件，已完成 ${done} 个<small class="dbg"${showDbg ? '' : ' hidden'}>${esc(MC.screenInfo || '')}</small>`;
    if (!iosScript) fetch('widget-ios-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (iosScript = t)).catch(() => {});
    if (!workflowYml) fetch('scripts/reminders.yml', { cache: 'no-cache' }).then(r => r.text()).then(t => (workflowYml = t)).catch(() => {});
  }

  // 页脚：开发用的屏幕信息平时收起，点一下版本号显示 / 收起
  let showDbg = false;
  $('#statLine').addEventListener('click', () => { showDbg = !showDbg; const d = $('#statLine .dbg'); if (d) d.hidden = !showDbg; });
  $('#setGroups').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.srow.tap')) { e.preventDefault(); e.target.click(); } });
  $('#setGroups').addEventListener('click', async e => {
    if (e.target.closest('[data-help]')) return;
    const row = e.target.closest('[data-act]'); if (!row) return;
    const act = row.dataset.act;
    if (act.startsWith('pin:')) {
      if (!MC.Native.pinWidget(act.slice(4))) openHelp('nwidget');
      return;
    }
    if (act === 'nperm') { openHelp('nperm'); return; }
    if (act === 'mwidget') { openHelp('mwidget'); return; }
    if (act === 'macpkg') { window.MCNative.makeInstaller(); return; }
    if (act === 'macapp') {
      if (window.MCNative && window.MCNative.checkUpdate) { UI.toast('正在检查 Mac 版更新…'); window.MCNative.checkUpdate(); }
      return;
    }
    if (act === 'apk') {
      UI.toast('正在检查 App 更新…');
      try {
        const up = await MC.Native.checkUpdate(true);
        if (up) {
          if (await UI.confirm(`安卓 App 有新版本 ${up.name}。现在下载并安装？\n数据、设置和小组件都会保留。`, { ok: '更新' })) {
            const r = await MC.Native.update();
            if (r && r.msg) UI.toast(r.msg);
          }
        } else UI.toast(MC.Native.lastCheck().latest ? '已经是最新版本' : '仓库里还没有发布安卓 App');
      } catch (err) { UI.toast('检查失败：' + err.message); }
      renderSettings();
      return;
    }
    if (act === 'theme') UI.menu(row.querySelector('.sval'), [
      { label: '跟随系统', value: 'auto', on: MC.settings.theme === 'auto' },
      { label: '浅色', value: 'light', on: MC.settings.theme === 'light' },
      { label: '深色', value: 'dark', on: MC.settings.theme === 'dark' },
    ], v => { MC.settings.theme = v; MC.saveSettings(); applyTheme(); renderSettings(); });
    else if (act === 'week') UI.menu(row.querySelector('.sval'), [
      { label: '周日', value: 0, on: MC.settings.weekStart === 0 },
      { label: '周一', value: 1, on: MC.settings.weekStart === 1 },
    ], v => { MC.settings.weekStart = v; MC.saveSettings(); MC.Cal.realign(); renderSettings(); });
    else if (act === 'lang') UI.menu(row.querySelector('.sval'), [{ v: 'auto', label: '跟随系统语言' }, ...MC.LANGS].map(l => ({ label: l.label, value: l.v, on: MC.langPref() === l.v })),
      v => { if (v !== MC.langPref()) MC.setLang(v); });   // 收起的一行，点开是小菜单
    else if (act === 'clock') UI.menu(row.querySelector('.sval'), [
      { label: `跟随地区（${MC.region12() ? 12 : 24} 小时）`, value: 'auto', on: MC.clockPref() === 'auto' },
      { label: '12 小时制', value: '12', on: MC.clockPref() === '12' },
      { label: '24 小时制', value: '24', on: MC.clockPref() === '24' },
    ], v => {
      MC.settings.clock = v; MC.saveSettings(); MC.setProfile({ clock: v }); renderSettings(); // 存进同步数据，小组件也跟着变
      if (Push.enabled() && MC.settings.pushReady && MC.session.token && MC.settings.subH12 !== MC.use12()) Push.resubscribe().catch(() => {});
    });
    else if (act === 'tab3') UI.menu(row.querySelector('.sval'), [
      { label: '课表', value: 'sched', on: (MC.settings.tab3 || 'sched') === 'sched' },
      { label: '不显示', value: 'off', on: MC.settings.tab3 === 'off' },
    ], v => { MC.settings.tab3 = v; MC.settings.tab3Picked = true; MC.saveSettings(); applyTab3(); renderSettings(); });
    else if (act === 'connect' || act === 'retoken') connectForm(act === 'retoken');
    else if (act === 'dav' || act === 'redav') davForm(act === 'redav');
    else if (act === 'icloud') useICloud();
    else if (act === 'switch') {
      const ic = MC.isICloud(), dav = !ic && MC.isDav();
      UI.menu(row.querySelector('.slabel'), [
        ...(ic || dav ? [{ label: '连接 GitHub', value: 'connect' }] : []),
        ...(dav ? [] : [{ label: '连接 WebDAV', value: 'dav' }]),
        ...(!ic && MC.Native.has('icloud') ? [{ label: '使用 iCloud 云盘', value: 'icloud' }] : []),
      ], v => (v === 'connect' ? connectForm(false) : v === 'dav' ? davForm(false) : useICloud()));
    }
    else if (act === 'sync') { const ok = await MC.sync(); UI.toast(ok ? '已同步' : (MC.syncState.error || '同步失败')); renderSettings(); }
    else if (act === 'disconnect') {
      UI.menu(row.querySelector('.slabel'), [
        { label: '断开，保留本机数据', value: 'keep' },
        { label: '断开并清除本机数据', value: 'wipe' },
      ], async v => {
        if (v === 'wipe' && !(await UI.confirm('本机的事件、头像和昵称会被清除（你的 GitHub 账号里的数据不受影响），适合把设备交给别人用。继续？', { ok: '清除', danger: true }))) return;
        if (Push.enabled()) await Push.disable();
        MC.vault.disconnect();
        MC.settings.account = '';
        if (v === 'wipe') { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); MC.onChange(); if (MC.Native.on) MC.Native.wipe(); }
        MC.saveSettings();
        renderSettings(); UI.toast(v === 'wipe' ? '已断开并清除本机数据' : '已断开连接');
      });
    }
    else if (act === 'ntest') { try { await Push.test(); } catch (err) { UI.toast('发送失败：' + err.message); } }
    else if (act === 'nsetup') {
      if (!MC.vault.connected()) { UI.toast('先连接 GitHub，连接后再点一次这里'); connectForm(false); return; }
      if (!Push.enabled()) {
        try { await Push.enable(); renderSettings(); }
        catch (err) { UI.toast(err.message); return; }
      }
      // 已经设置过：重新设置会换通知密钥，其他设备要重新打开开关，所以先问一下
      if (MC.settings.remoteSetup && !(await UI.confirm('后台推送已经设置好了，每台设备打开「提醒通知」就能收到，不用再设置。只有换了仓库或推送一直收不到时才需要重新设置。要重新设置吗？', { ok: '重新设置' }))) return;
      setupForm();
    }
    else if (act === 'dtime') dailyTimeForm();
    else if (act === 'boost') openHelp('boost');
    else if (act === 'ics') {
      if (!MC.vault.connected()) { UI.toast('先连接 GitHub，连接后再点一次这里'); connectForm(false); return; }
      if (!MC.settings.account) { try { MC.settings.account = (await MC.gh('/user')).login || ''; MC.saveSettings(); } catch (e) {} }
      try { await MC.sync(); await MC.pushICS(); } catch (e) {}
      openHelp('ics');
    }
    else if (act === 'ios') copyIOS();
    else if (act === 'android') copyAndroid();
    else if (act === 'iosSched') copySched();
    else if (act === 'iosDays') copyDays();
    else if (act === 'androidSched') { if (!MC.settings.gistId) { UI.toast('请先连接 GitHub 并完成一次同步'); return; } copy(androidLink() + '&mode=sched', '已复制课表小组件链接'); }
    else if (act === 'icfile') icloudFileSync();
    else if (act === 'export') exportData();
    else if (act === 'import') $('#importFile').click();
    else if (act === 'update') {
      // 清掉旧缓存并重新下载最新版本；日历数据和令牌都保存在别处，不受影响
      if (!navigator.onLine) { UI.toast('检查更新需要联网'); return; }
      try { const r = await fetch('sw.js', { cache: 'no-store' }); if (!r.ok) throw 0; }
      catch (err) { UI.toast('连不上网站，请联网后再试'); return; }
      UI.toast('正在获取最新版本…');
      try {
        if (MC.session.token) await MC.sync();
        const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
        await Promise.all(regs.map(r => r.unregister()));
        if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
      } catch (err) {}
      // Mac App：同时检查原生部分（菜单栏、小组件、提醒）有没有新版本，结果由 App 弹窗显示
      if (MC.Native.mac && window.MCNative && window.MCNative.checkUpdate) window.MCNative.checkUpdate();
      location.replace(location.pathname + '?u=' + Date.now());
    }
  });
  $('#setGroups').addEventListener('change', async e => {
    if (e.target.id === 'dSwitch') {
      const sw = e.target; sw.disabled = true;
      try {
        if (sw.checked) {
          if (!Push.enabled()) await Push.enable();
          MC.setDaily({ on: true, tz: MC.currentTz() });
          UI.toast(`每天 ${MC.fmtTime(MC.data.daily.time)} 提醒你查看当天未完成的事件`);
        } else { MC.setDaily({ on: false }); UI.toast('已关闭每日提醒'); }
      } catch (err) { UI.toast(err.message); }
      renderSettings();
      return;
    }
    if (e.target.id !== 'nSwitch') return;
    const sw = e.target;
    sw.disabled = true;
    try {
      if (sw.checked) {
        const remote = await Push.enable();
        UI.toast(remote && MC.settings.remoteSetup ? '提醒已开启，App 关着也会推送' : remote ? '提醒已开启' : '提醒已开启（App 打开时）');
        if (Push.native) {
          const st = MC.Native.status();
          if (!st.exact || !st.battery) setTimeout(() => openHelp('nperm'), 400);
        } else if (remote && !MC.settings.remoteSetup) setTimeout(() => setupForm(), 400);
      } else { await Push.disable(); UI.toast('提醒已关闭'); }
    } catch (err) {
      UI.toast(err.message);
      if (!Push.enabled()) { MC.settings.notify = false; MC.saveSettings(); }
    }
    renderSettings();
  });
  MC.onProfileRecovered = () => { paintTabAvatar(); renderSettings(); UI.toast('已找回之前的头像和昵称'); };
  MC.onSyncStatus = () => { if (page === 'set') { paintStatus(); const r = $('#setGroups [data-act="sync"] small'); if (r) r.textContent = syncText()[0]; } };

  // ---------- 表单 ----------
  let formHandler = null;
  function openForm({ title, fields, note, extra, submit, onSubmit }) {
    $('#formTitle').textContent = title;
    $('#formSubmit').textContent = submit || '确定';
    $('#formBody').innerHTML = fields.map(f =>
      `<label class="field"><span>${f.label}</span><input id="ff_${f.id}" type="${f.type || 'text'}" value="${esc(f.val || '')}" placeholder="${esc(f.ph || '')}" autocomplete="${f.ac || 'off'}" autocapitalize="off" spellcheck="false"${f.max ? ` maxlength="${f.max}"` : ''}></label>`).join('')
      + (extra || '') + (note ? `<p class="form-note">${note}</p>` : '') + '<p class="form-err" id="formErr"></p>';
    formHandler = { onSubmit, fields };
    UI.open('formSheet');
  }
  MC.openForm = openForm;
  async function submitForm(e) {
    e && e.preventDefault();
    if (!formHandler) return;
    const vals = {};
    formHandler.fields.forEach(f => (vals[f.id] = $('#ff_' + f.id).value));
    const btn = $('#formSubmit'), label = btn.textContent;
    btn.disabled = true; btn.textContent = '处理中…'; $('#formErr').textContent = '';
    try { await formHandler.onSubmit(vals); UI.close('formSheet'); }
    catch (err) { $('#formErr').style.color = ''; $('#formErr').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  $('#formSubmit').onclick = submitForm;
  $('#formBody').addEventListener('submit', submitForm);

  function checkPw(pw, pw2) {
    if (pw !== pw2) throw new Error('两次输入的密码不一致');
    if (pw && pw.length < 4) throw new Error('密码至少 4 位');
  }
  const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=' + encodeURIComponent('月历同步');
  function connectForm(isRetoken) {
    openForm({
      title: isRetoken ? '更换令牌' : '连接 GitHub',
      submit: '连接',
      fields: [{ id: 'token', label: 'GitHub 令牌', type: 'password', ph: 'ghp_…' }],
      note: `还没有令牌？<a href="${TOKEN_URL}" target="_blank" rel="noopener">点这里去 GitHub 生成</a>（已自动勾好 gist 权限，有效期可选 No expiration），拉到底点 Generate token，复制回来粘贴即可。<br>每个人用自己的令牌，数据存在各自账号里；令牌只保存在这台设备上。`,
      onSubmit: async v => {
        const token = v.token.trim();
        if (!token) throw new Error('请粘贴 GitHub 令牌');
        const id = await MC.findGist(token); // 同时校验令牌
        let login = '';
        try { login = (await MC.gh('/user', {}, token)).login || ''; } catch (e) {}
        const switching = !!MC.settings.account && login && login !== MC.settings.account;
        const localCount = MC.data.events.length;
        if (localCount && id && (switching || !isRetoken)) {
          // 关掉对话框（点外面 / 返回）按合并处理，不会误删本机事件
          const keep = await UI.confirm(login
            ? `这台设备上已有 ${localCount} 个事件。合并到 @${login} 的账号，还是只用该账号自己的数据（本机这些事件会被清除）？`
            : `这台设备上已有 ${localCount} 个事件。合并到你的账号，还是只用账号自己的数据（本机这些事件会被清除）？`, { ok: '合并', cancel: '只用账号数据', dismiss: true });
          if (!keep) { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); }
        }
        if (switching && !id) { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); }
        MC.settings.gistId = id;
        MC.settings.account = login;
        MC.settings.dav = null; MC.settings.icloud = null; MC.davReset(); // 从 WebDAV / iCloud 换过来
        await MC.vault.save(token, '');
        const ok = await MC.sync();
        if (Push.enabled()) await Push.resubscribe();
        renderSettings();
        UI.toast(ok ? (id ? '已连接，并同步了云端数据' : '已连接，云端数据已创建') : (MC.syncState.error || '已连接'));
      },
    });
  }
  // 用 iCloud 云盘同步（Mac）：选好文件夹，和 GitHub 一样问一次「合并 / 只用云端数据」
  async function useICloud() {
    const r = await MC.Native.ask('icloudChoose');
    if (!r || !r.ok) { if (r && r.error) UI.toast(r.error); return; }
    const hasRemote = await MC.icloudHasData();
    const localCount = MC.data.events.length;
    if (localCount && hasRemote && !MC.isICloud()) {
      const keep = await UI.confirm(`这台设备上已有 ${localCount} 个事件。合并到 iCloud 云盘里的数据，还是只用 iCloud 云盘里的数据（本机这些事件会被清除）？`, { ok: '合并', cancel: '只用 iCloud 云盘数据', dismiss: true });
      if (!keep) { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); }
    }
    MC.settings.icloud = { name: r.name || '' }; MC.settings.dav = null; MC.settings.gistId = ''; MC.settings.account = '';
    MC.davReset();
    await MC.vault.save('icloud', '');
    const ok = await MC.sync();
    renderSettings();
    UI.toast(ok ? (hasRemote ? '已开始用 iCloud 云盘同步，并合并了里面的数据' : '已开始用 iCloud 云盘同步') : (MC.syncState.error || '已选择文件夹'));
  }
  // 连接 WebDAV（坚果云等）：先检查账号密码，再和 GitHub 一样问一次「合并 / 只用云端数据」
  function davForm(isRe) {
    const cur = MC.settings.dav || {};
    openForm({
      title: isRe ? '更换账号或密码' : '连接 WebDAV',
      submit: '连接',
      fields: [
        { id: 'davUrl', label: '服务器地址', ph: 'https://dav.jianguoyun.com/dav/' },
        { id: 'davUser', label: '账号', ph: '坚果云填注册邮箱' },
        { id: 'davPass', label: '密码', type: 'password', ph: '坚果云填「第三方应用密码」' },
      ],
      note: `<b>坚果云</b>：服务器地址就用上面这个；密码要用「第三方应用密码」：网页版坚果云 → 右上角账户信息 → 安全选项 → 第三方应用管理 → 添加应用，生成后复制回来。<br><b>Nextcloud / 群晖</b>：填它们给的 WebDAV 地址和账号密码。<br>数据会放在网盘里的「Cadence」文件夹；账号和密码只保存在这台设备上。`,
      onSubmit: async v => {
        const dav = { url: v.davUrl.trim() || 'https://dav.jianguoyun.com/dav/', user: v.davUser.trim() };
        const pass = v.davPass;
        if (!/^https?:\/\//i.test(dav.url)) throw new Error('服务器地址要以 https:// 开头');
        if (!dav.user || !pass) throw new Error('请填写账号和密码');
        const hasRemote = await MC.davCheck(dav, pass); // 同时校验账号密码
        const localCount = MC.data.events.length;
        if (localCount && hasRemote && !isRe) {
          const keep = await UI.confirm(`这台设备上已有 ${localCount} 个事件。合并到网盘里的数据，还是只用网盘里的数据（本机这些事件会被清除）？`, { ok: '合并', cancel: '只用网盘数据', dismiss: true });
          if (!keep) { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); }
        }
        MC.settings.dav = dav; MC.settings.icloud = null; MC.settings.gistId = ''; MC.settings.account = '';
        MC.davReset();
        await MC.vault.save(pass, '');
        const ok = await MC.sync();
        renderSettings();
        UI.toast(ok ? (hasRemote ? '已连接，并同步了网盘里的数据' : '已连接，数据已存到网盘') : (MC.syncState.error || '已连接'));
      },
    });
    if (cur.url) $('#ff_davUrl').value = cur.url;
    else $('#ff_davUrl').value = 'https://dav.jianguoyun.com/dav/';
    if (cur.user) $('#ff_davUser').value = cur.user;
  }
  function dailyTimeForm() {
    let val = MC.data.daily.time;
    $('#formTitle').textContent = '每日提醒时间';
    $('#formSubmit').textContent = '保存';
    $('#formBody').innerHTML = `<div class="group"><div class="wheel-wrap" id="dWheel"></div></div><p class="form-note">按你当前所在的时区（${esc(MC.currentTz())}）每天这个时间提醒你查看当天未完成的事件；都完成了会告诉你「今日事件已完成」。</p><p class="form-err" id="formErr"></p>`;
    formHandler = { fields: [], onSubmit: async () => { MC.setDaily({ time: val, tz: MC.currentTz() }); renderSettings(); UI.toast(`每日提醒改为 ${MC.fmtTime(val)}`); } };
    UI.open('formSheet');
    requestAnimationFrame(() => UI.timeWheel($('#dWheel'), val, '', t => { val = t; }));
  }
  function setupForm() {
    openForm({
      title: '后台提醒', submit: '开始设置',
      fields: [
        { id: 'tmp', label: '临时令牌', type: 'password', ph: 'ghp_…' },
        { id: 'repo', label: '节律所在的仓库（一般不用改）', ph: '用户名/仓库名' },
      ],
      note: `<a href="${Push.SETUP_TOKEN_URL}" target="_blank" rel="noopener">点这里去 GitHub 生成临时令牌</a>（已自动勾好所需权限），拉到底点 Generate token，复制回来粘贴。<br>App 会自动上传提醒程序、写入密钥并启动定时任务。完成后这个临时令牌就可以在 GitHub 上删除。`,
      onSubmit: async v => {
        const tmp = v.tmp.trim(), repo = v.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        if (!tmp) throw new Error('请粘贴临时令牌');
        if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('仓库格式应为：用户名/仓库名');
        const status = $('#formErr');
        const ok = await Push.setupRemote(tmp, repo, t => { status.style.color = 'var(--text2)'; status.textContent = t; });
        status.style.color = '';
        renderSettings();
        UI.toast(ok ? '后台提醒已设置好' : '已设置，定时任务几分钟后开始运行');
      },
    });
    const r = $('#ff_repo'); if (r) r.value = MC.settings.remoteSetup ? MC.settings.remoteSetup.repo : Push.guessRepo();
  }

  // ---------- 锁屏 ----------
  function showLock() {
    document.documentElement.classList.add('locked');
    paintAvatar($('#lockAvatar'));
    $('#lockName').textContent = MC.data.profile.name || '节律';
    $('#lockErr').textContent = '';
    $('#lockPw').value = '';
  }
  function hideLock() { document.documentElement.classList.remove('locked'); $('#lockPw').blur(); }
  $('#lockForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const tok = await MC.vault.unlock($('#lockPw').value);
      await MC.vault.save(tok, ''); // 不再使用开屏密码
      hideLock();
      UI.toast('已取消开屏密码，以后打开不再需要输入');
      MC.sync().then(() => Push.resubscribe());
      renderPage();
    } catch (err) {
      $('#lockErr').textContent = err.message;
      const c = $('.lock-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      $('#lockPw').select();
    }
  });
  $('#lockForgot').onclick = async () => {
    if (!(await UI.confirm('忘记密码只能清除这台设备上保存的令牌，日历数据会保留。之后需要重新连接 GitHub。继续？', { ok: '清除令牌', danger: true }))) return;
    MC.vault.disconnect();
    hideLock(); renderPage();
    UI.toast('已清除令牌，请在设置中重新连接 GitHub');
  };
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    $('#tabCalNum').textContent = new Date().getDate();
    if (MC.session.token) MC.sync();
    MC.onNotifyCheck();
    renderPage();
  });

  // ---------- 复制 ----------
  function copy(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => UI.toast(okMsg), () => fallbackCopy(text, okMsg));
    else fallbackCopy(text, okMsg);
  }
  function fallbackCopy(text, okMsg) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    UI.toast(ok ? okMsg : '复制失败，请长按文字手动复制');
  }
  const androidLink = () => `${appUrl()}widget.html?gist=${encodeURIComponent(MC.settings.gistId)}&ws=${MC.settings.weekStart}`;
  function copyIOS() {
    if (!MC.settings.gistId) { UI.toast('请先连接 GitHub 并完成一次同步'); return; }
    if (!iosScript) { UI.toast('脚本还在加载，请稍后再点一次'); return; }
    copy(iosScript.replace('"__GIST_ID__"', JSON.stringify(MC.settings.gistId))
      .replace('"__APP_URL__"', JSON.stringify(appUrl()))
      .replace('WEEK_START: 0,', `WEEK_START: ${MC.settings.weekStart},`), '已复制 iOS 小组件脚本');
  }
  let schedScript = '';
  fetch('widget-sched-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (schedScript = t)).catch(() => {});
  function copySched() {
    if (!MC.settings.gistId) { UI.toast('请先连接 GitHub 并完成一次同步'); return; }
    if (!schedScript) { UI.toast('脚本还在加载，请稍后再点一次'); return; }
    copy(schedScript.replace('"__GIST_ID__"', JSON.stringify(MC.settings.gistId)).replace('"__APP_URL__"', JSON.stringify(appUrl())), '已复制课表小组件脚本');
  }
  let daysScript = '';
  fetch('widget-days-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (daysScript = t)).catch(() => {});
  function copyDays() {
    const T = DT;
    if (!MC.settings.gistId) { UI.toast(T('请先连接 GitHub 并完成一次同步')); return; }
    if (!daysScript) { UI.toast(T('脚本还在加载，请稍后再点一次')); return; }
    copy(daysScript.replace('"__GIST_ID__"', JSON.stringify(MC.settings.gistId)).replace('"__APP_URL__"', JSON.stringify(appUrl())), T('已复制纪念日小组件脚本'));
  }
  function copyAndroid() {
    if (!MC.settings.gistId) { UI.toast('请先连接 GitHub 并完成一次同步'); return; }
    copy(androidLink(), '已复制安卓小组件链接');
  }

  // ---------- 帮助 ----------
  const HELP = {
    nperm: () => {
      const st = MC.Native.status();
      const ok = (good, yes, no, key) => good
        ? `<b style="color:var(--accent-text)">✓ ${yes}</b>`
        : `<b style="color:var(--red)">${no}</b>　<button class="chip-btn glass" data-copy="nreq:${key}">去设置</button>`;
      const when = st.pullAt ? new Date(st.pullAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const mac = MC.Native.mac || MC.Native.ios; // 苹果设备：没有精确闹钟、电池限制这些设置
      const sync = !st.token ? (MC.Native.mac ? '未连接 GitHub（只显示这台 Mac 上的数据）' : '未连接 GitHub（只显示这台手机上的数据）')
        : st.pullErr ? `<b style="color:var(--red)">${esc(st.pullErr)}</b>` : `<b style="color:var(--accent-text)">✓ ${when ? '上次 ' + when : '已连接'}</b>`;
      return {
        title: '提醒权限检查',
        html: `<p class="hint" style="margin:0 2px 14px">${mac ? (MC.Native.ios ? '提醒由 iPhone 系统按时弹出，App 关着也会提醒；下面第一项要是 ✓。' : '提醒由 macOS 按时弹出，退出节律后也会提醒；下面第一项要是 ✓。') : 'App 关着也要准时提醒，下面前三项都要是 ✓。'}</p>
        <ol class="steps">
          <li>通知：${ok(st.notif === 'granted', '已允许', '未允许', 'notif')}</li>
          ${mac ? '' : `<li>精确闹钟：${ok(st.exact, '已允许', '未允许', 'exact')}</li>
          <li>电池不受限制：${ok(st.battery, '已设置', '未设置', 'battery')}<br><small>三星手机再确认一下：设置 → 电池 → 后台使用限制，「休眠应用」和「深度休眠应用」里<b>不能有</b>节律，最好把节律加进「从不休眠的应用」。</small></li>`}
          <li>后台同步其他设备的改动：${sync}</li>
        </ol>
        <div class="help-copy"><button class="chip-btn glass" data-copy="ntest">立即测试</button><button class="chip-btn glass" data-copy="ntestBg">10 秒后测试</button><button class="chip-btn glass" data-copy="nreq:channels">通知样式</button></div>
        ${mac ? `<div class="help-tip">点「10 秒后测试」后可以退出节律，10 秒左右收到「后台提醒测试」，就说明退出后也能准时提醒。<br>想调整横幅、提示音或通知中心里的显示方式，点「通知样式」。</div>`
        : `<div class="help-tip">点「10 秒后测试」后马上回到桌面并锁屏，10 秒左右收到「后台提醒测试」，就说明 App 关着也能准时提醒。<br>想让提醒在锁屏显示、响铃或弹出横幅，点「通知样式」分别设置「事件提醒」和「每日未完成提醒」。</div>`}`,
      };
    },
    // iCloud 云盘同步：上面一张动图（iPhone、Mac 和中间的云，数据在它们之间来回流动），下面三步；网页版另外说明手动的做法
    icloud: () => ({
      title: 'iCloud 云盘同步',
      html: `<div class="ic-anim" aria-hidden="true"><svg viewBox="0 0 300 120">
        <path id="icL" class="ic-path" d="M58 78 C 90 30, 120 24, 150 30"/><path id="icR" class="ic-path" d="M242 78 C 210 30, 180 24, 150 30"/>
        <g class="ic-dev"><rect x="34" y="52" width="40" height="64" rx="9"/><rect x="48" y="56" width="12" height="3" rx="1.5" class="ic-fill"/></g>
        <g class="ic-dev"><rect x="214" y="60" width="66" height="42" rx="5"/><path d="M204 108 h86 l-6 6 h-74 z" class="ic-fill"/></g>
        <path class="ic-cloud" d="M128 40 a14 14 0 0 1 4-27 a19 19 0 0 1 36 4 a12 12 0 0 1 4 23 z"/>
        <circle r="3.5" class="ic-dot"><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#icL"/></animateMotion></circle>
        <circle r="3.5" class="ic-dot"><animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#icL"/></animateMotion></circle>
        <circle r="3.5" class="ic-dot"><animateMotion dur="2.4s" begin=".6s" repeatCount="indefinite"><mpath href="#icR"/></animateMotion></circle>
        <circle r="3.5" class="ic-dot"><animateMotion dur="2.4s" begin="1.8s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#icR"/></animateMotion></circle>
      </svg></div>
      ${MC.Native.on || !Push.isIOS ? `<ol class="steps">
        <li>每台 iPhone、Mac：设置 → 同步 → 使用 iCloud 云盘</li>
        <li>选同一个文件夹（第一次可以新建一个「节律」）</li>
        <li>完成。以后改了什么，几秒到一两分钟就会出现在其他设备上</li>
      </ol>
      <div class="help-tip">用的是这台设备已经登录的 Apple ID，不用另外注册账号。</div>` : `<ol class="steps">
        <li>点「与 iCloud 云盘同步」，在「文件」里选 Mac 同步用的 cadence-calendar.json</li>
        <li>手机上有改动时点「存回去」，存到同一个文件夹</li>
      </ol>
      <div class="help-tip">网页版不能自己读写 iCloud 云盘，所以要手动点；装了 Cadence App 就是全自动的。</div>`}`,
    }),
    mwidget: () => ({
      title: 'Mac 桌面小组件',
      html: `<ol class="steps">
        <li>在桌面空白处右键 → 编辑小组件…</li>
        <li>在小组件库里搜索「节律」，把整月、今日、课表或纪念日拖到桌面或通知中心。</li>
        <li>课表小组件：小尺寸显示今天的课，中尺寸显示本周，大尺寸显示本周课表。</li>
      </ol>
      <div class="help-tip">整月小组件右上角的 ‹ › 可以翻月，30 分钟后自动回到本月。<br>在这台 Mac 上改的事件会立刻更新到小组件；其他设备上改的，连接 GitHub 后约 15 分钟内同步过来。</div>`,
    }),
    nwidget: () => ({
      title: '安卓桌面小组件',
      html: `<ol class="steps">
        <li>在设置里点 <b>整月 / 今日 / 课表小组件</b>，弹出的窗口里点「添加」，小组件就放到桌面上了。</li>
        <li>也可以长按桌面空白处 → <b>小组件</b> → 找到「节律」，按住想要的样式拖到桌面。</li>
        <li>长按小组件可以调整大小。整月小组件格子够高时显示事件名称，格子小时显示彩色圆点；折叠屏的内屏和外屏会按各自的尺寸显示。</li>
      </ol>
      <div class="help-tip">整月小组件右上角的 ‹ › 可以翻月，30 分钟后自动回到本月；点日期区域打开节律。<br>在这台手机上改的事件会立刻更新到小组件；在 iPhone 或电脑上改的，连接 GitHub 后大约 15 分钟内同步过来，打开节律则马上同步。</div>`,
    }),
    iosDays: () => {
      const T = DT;
      return {
        title: T('iOS 纪念日小组件'),
        html: `<ol class="steps">
        <li>${T('先在「账户与同步」连接 GitHub，并同步成功一次。')}</li>
        <li>${T('点下方「复制纪念日小组件脚本」。')}</li>
        <li>${T('打开 Scriptable → 右上角 ＋ → 粘贴 → 把标题改成「纪念日」→ Done。')}</li>
        <li>${T('回到桌面长按 → 编辑 → 添加小组件 → Scriptable → 选小号、中号或大号。')}</li>
        <li>${T('长按小组件 → 编辑小组件 → Script 选「纪念日」。')}</li>
      </ol>
      <div class="help-copy"><button class="chip-btn glass" data-copy="days">${T('复制纪念日小组件脚本')}</button></div>
      <div class="help-tip">${T('小号显示置顶（没有置顶就是最近的）日子；中号和大号再列出接下来的几个。在 App 里置顶的日子会显示在这里。')}</div>`,
      };
    },
    iosSched: () => ({
      title: 'iOS 课表小组件',
      html: `<ol class="steps">
        <li>先在「账户与同步」连接 GitHub，并导入课表。</li>
        <li>点下方 <b>复制课表小组件脚本</b>。</li>
        <li>打开 Scriptable → 右上角 <b>＋</b> → 粘贴 → 点顶部标题改名为「课表」→ <b>Done</b>。</li>
        <li>回到桌面长按 → <b>编辑</b> → <b>添加小组件</b> → Scriptable → 选小号、中号或大号 → 添加。</li>
        <li>长按小组件 → <b>编辑小组件</b> → Script 选「课表」，When Interacting 保持 <b>Open App</b>。</li>
      </ol>
      <div class="help-copy"><button class="chip-btn glass" data-copy="sched">复制课表小组件脚本</button></div>
      <div class="help-tip">小号显示今天还没上完的课（今天没课就显示下一个有课的日子），正在上的课标「上课中」；中号是横向的本周课表；大号是整月课表。<br>每节课开始和结束时小组件会自动请求刷新；想立刻刷新，点一下小组件即可，它会拉取最新课表并打开节律的课表页。</div>`,
    }),
    ios: () => ({
      title: 'iOS 桌面小组件',
      html: `<ol class="steps">
        <li>先在「账户与同步」连接 GitHub，并同步成功一次。</li>
        <li>在 App Store 安装免费的 <b>Scriptable</b>。</li>
        <li>点下方 <b>复制 iOS 小组件脚本</b>（已自动填好你的数据地址）。</li>
        <li>打开 Scriptable → 右上角 <b>＋</b> → 长按空白处粘贴 → 点顶部标题改名为「节律」→ <b>Done</b>。可以点 ▶ 预览大、中、小三种尺寸。</li>
        <li>回到桌面，长按空白处 → 左上角 <b>编辑</b> → <b>添加小组件</b> → 搜索 Scriptable → 选<b>大号</b>（整月日历），也可以选中号或小号 → 添加。</li>
        <li>长按这个小组件 → <b>编辑小组件</b>：Script 选「节律」，When Interacting 保持默认的 <b>Open App</b>。之后点小组件会先拉取最新数据，再打开节律。</li>
      </ol>
      <div class="help-copy"><button class="chip-btn glass" data-copy="ios">复制 iOS 小组件脚本</button><button class="chip-btn glass" data-copy="url">复制 App 网址</button></div>
      <div class="help-tip">小组件会请求每 5 分钟刷新，但实际时间由 iOS 决定；想立刻看到最新内容，点一下小组件再回到桌面即可。小组件参数（Parameter）填 <code>dark</code> 或 <code>light</code> 可固定深浅色，不填就跟随系统。</div>`,
    }),
    android: () => ({
      title: '安卓桌面小组件',
      html: `<ol class="steps">
        <li>先在「账户与同步」连接 GitHub，并同步成功一次。</li>
        <li>安卓的 Chrome 不支持网页 App 直接做小组件。在 Play 商店搜索「web widget」或「网页小组件」，安装一个能在桌面显示网页的小组件 App。</li>
        <li>点下方 <b>复制安卓小组件链接</b>。${MC.settings.gistId ? `你的链接：<br><code>${esc(androidLink())}</code>` : ''}</li>
        <li>长按桌面空白处 → <b>小组件</b> → 找到刚装的 App，把小组件拖到桌面，按它的提示粘贴链接。尺寸建议 4×4。</li>
        <li>想固定深浅色，在链接末尾加 <code>&amp;theme=dark</code> 或 <code>&amp;theme=light</code>；不加就跟随系统。</li>
      </ol>
      <div class="help-copy"><button class="chip-btn glass" data-copy="android">复制安卓小组件链接</button></div>
      <div class="help-tip">小组件显示本月的彩色事件和完成情况，点击会打开节律。刷新频率取决于你装的小组件 App。${Push.guessRepo() ? `<br>更推荐安装 <a href="https://github.com/${esc(Push.guessRepo())}/releases/latest" target="_blank" rel="noopener">月历安卓 App</a>：自带原生小组件，提醒由手机系统准时弹出。` : ''}</div>`,
    }),
    notify: () => ({
      title: '提醒通知',
      html: `<ol class="steps">
        <li>打开 <b>提醒通知</b> 开关并允许通知。iPhone 需要 iOS 16.4 以上，并且从主屏幕图标打开节律。</li>
        <li>到这一步，App 开着时已经会准时提醒。</li>
        <li>想在 App 关闭时也收到：点 <b>一键设置：App 关闭时也提醒</b>，按提示去 GitHub 生成一个临时令牌（权限已自动勾好），粘贴回来点「开始设置」。</li>
        <li>看到「后台提醒已设置好」就完成了，临时令牌可以在 GitHub 上删除。</li>
      </ol>
      <div class="help-tip">后台提醒由你仓库里的 GitHub 定时任务每 5 分钟检查一次，高峰时可能晚几分钟。仓库 60 天没有改动时 GitHub 会暂停定时任务并发邮件提醒，点邮件里的按钮即可恢复。</div>`,
    }),
    ics: () => {
      const url = MC.icsURL();
      const web = url.replace(/^https:/, 'webcal:');
      return {
        title: '订阅到 iPhone 日历',
        html: url ? `<p class="hint" style="margin:0 2px 14px">设置了提醒的事件和每日提醒会同步到 iPhone 自带的日历，到点由系统准时弹出，节律关着、断网也会响。只需订阅一次。</p>
        <ol class="steps">
          <li>先点 <b>生成 3 分钟后的测试提醒</b>。</li>
          <li>再点 <b>订阅</b>，系统询问时点「订阅」，然后点「添加」或「完成」。</li>
          <li>等 3 分钟，收到「节律订阅提醒测试」就说明你的 iPhone 支持，以后不用再管。</li>
        </ol>
        <div class="help-copy">
          <button class="chip-btn glass" data-copy="icsTest">生成 3 分钟后的测试提醒</button>
          <a class="chip-btn glass" href="${esc(web)}" data-copy="icsSub" style="text-decoration:none;color:var(--accent-text)">订阅</a>
          <button class="chip-btn glass" data-copy="icsCopy">复制订阅链接</button>
        </div>
        <div class="help-tip">新增或修改的事件，要等 iPhone 刷新订阅后才生效（一般 15 分钟到 1 小时，可在 设置 → 日历 → 账户 → 获取新数据 里调快）。已完成的事件会自动从提醒里去掉。订阅日历里只放有提醒的事件，不会把整个月历都塞进系统日历。<br>如果测试提醒没有响：打开 设置 → 日历 → 账户 → 「月历提醒」，确认没有打开「移除提醒」；仍然不响的话，改用「让提醒准时」那个方案。</div>`
        : `<p class="hint">请先连接 GitHub 并同步成功一次。</p>`,
      };
    },
    // 让提醒准时：三步向导。令牌粘贴后当场验证（触发一次提醒，204 就对了），cron-job.org 要填的都有复制按钮，
    // 最后点「我设置好了」，自动等它第一次叫醒定时任务来确认
    boost: () => {
      const repo = (MC.settings.remoteSetup && MC.settings.remoteSetup.repo) || Push.guessRepo() || '用户名/仓库名';
      const [owner, name] = repo.split('/');
      const url = `https://api.github.com/repos/${repo}/actions/workflows/reminders.yml/dispatches`;
      const tokUrl = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
        name: '节律提醒叫醒', description: '给 cron-job.org 用，只能触发节律的提醒程序', target_name: owner || '', expires_in: 'none', actions: 'write' });
      const ok = !!boostTok;
      return {
        title: '让提醒准时',
        html: `<p class="hint" style="margin:0 2px 14px">GitHub 自带的定时会晚几个小时。用免费的 cron-job.org 每 5 分钟叫醒一次就准了。三步，只需设置一次。</p>
        <ol class="steps">
          <li><b>生成叫醒令牌</b><br><a class="chip-btn glass" href="${tokUrl}" target="_blank" rel="noopener">去 GitHub 生成</a><br>
            <small>Repository access 选 Only select repositories →<b> ${esc(name || repo)} </b>，其他都已经填好，拉到底点 Generate token，复制回来：</small>
            <label class="field" style="margin-top:8px"><input id="bstTok" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(boostTok)}"></label>
            <div class="help-copy" style="margin:8px 0 0"><button class="chip-btn glass" data-copy="bstCheck">${ok ? '✓ 令牌可以用' : '检查令牌'}</button></div>
            <p class="form-err" id="bstMsg" style="margin:6px 0 0"></p></li>
          <li><b>在 cron-job.org 新建任务</b><br><a class="chip-btn glass" href="https://console.cron-job.org/jobs/create" target="_blank" rel="noopener">打开 cron-job.org</a><small>（第一次要免费注册）</small><br>
            <small>按顺序复制粘贴：</small>
            <div class="help-copy" style="margin:8px 0 6px">
              <button class="chip-btn glass" data-copy="boostUrl">① 复制网址 → URL</button>
            </div>
            <small>Execution schedule 选 Every 5 minutes。切到 ADVANCED，Request method 选 POST，Headers 加两条：</small>
            <div class="help-copy" style="margin:8px 0 6px">
              <button class="chip-btn glass${ok ? '' : ' disabled'}" data-copy="bstAuth">② Authorization 的值</button>
              <button class="chip-btn glass" data-copy="boostAccept">③ Accept 的值</button>
            </div>
            <small>最后 Request body：</small>
            <div class="help-copy" style="margin:8px 0 0"><button class="chip-btn glass" data-copy="boostBody">④ 复制 Request body</button></div></li>
          <li><b>点 CREATE，回到这里：</b><br><div class="help-copy" style="margin:8px 0 0"><button class="chip-btn glass" data-copy="bstDone">我设置好了</button></div>
            <p class="form-err" id="bstDoneMsg" style="margin:6px 0 0"></p></li>
        </ol>
        <div class="help-tip">这个令牌只能触发这个仓库的提醒程序，碰不到其他内容，放在 cron-job.org 上也比较安全。</div>`,
        _url: url,
      };
    },
    sync: () => ({
      title: '多设备同步',
      html: `<ol class="steps">
        <li>点下方 <b>去 GitHub 生成令牌</b>（权限已自动勾好 gist），登录后 Expiration 可选 <b>No expiration</b>。</li>
        <li>拉到最下面点 <b>Generate token</b>，复制以 <code>ghp_</code> 开头的令牌。</li>
        <li>回到节律：设置 → <b>连接 GitHub</b>，粘贴令牌。</li>
        <li>其他设备粘贴<b>同一个</b>令牌即可同步。</li>
      </ol>
      <div class="help-copy"><a class="chip-btn glass" href="${TOKEN_URL}" target="_blank" rel="noopener" style="text-decoration:none">去 GitHub 生成令牌</a></div>
      <div class="help-tip">每个人用<b>自己的</b> GitHub 账号和令牌，日历数据存在各自账号下的私密 Gist 里，互不相通。令牌只有 gist 权限，碰不到你的代码仓库，只保存在这台设备上。把设备交给别人前，可以在「断开连接」里选择清除本机数据。</div>`,
    }),
  };
  function openHelp(k) {
    const h = HELP[k](); $('#helpTitle').textContent = h.title; $('#helpBody').innerHTML = h.html;
    UI.open('helpSheet');
  }
  document.addEventListener('click', e => { const h = e.target.closest('[data-help]'); if (h) { e.preventDefault(); openHelp(h.dataset.help); } });
  $('#helpBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const k = b.dataset.copy;
    if (k.startsWith('nreq:')) { await MC.Native.request(k.slice(5)); if (UI.isOpen('helpSheet')) openHelp('nperm'); renderSettings(); return; }
    if (k === 'days') { copyDays(); return; }
    if (k === 'ntest') { if (!Push.enabled()) { UI.toast('请先打开「提醒通知」开关'); return; } Push.test(); return; }
    if (k === 'ntestBg') {
      if (!Push.enabled()) { UI.toast('请先打开「提醒通知」开关'); return; }
      MC.Native.testLater(10); UI.toast('10 秒后弹出测试通知，现在可以回到桌面锁屏'); return;
    }
    if (k === 'ios') copyIOS();
    else if (k === 'android') copyAndroid();
    else if (k === 'sched') copySched();
    else if (k === 'url') copy(appUrl(), '已复制 App 网址');
    else if (k === 'icsTest') {
      MC.settings.icsTestAt = Date.now() + 3 * 60000; MC.saveSettings();
      try { await MC.pushICS(); UI.toast('测试提醒已生成，现在点「订阅」'); } catch (err) { UI.toast('生成失败：' + err.message); }
    }
    else if (k === 'icsSub') { MC.settings.icsSubscribed = true; MC.saveSettings(); setTimeout(renderSettings, 500); return; }
    else if (k === 'icsCopy') copy(MC.icsURL(), '已复制订阅链接');
    else if (k === 'boostUrl') copy(HELP.boost()._url, '已复制网址');
    else if (k === 'bstAuth') boostTok ? copy('Bearer ' + boostTok, '已复制，粘贴到 Authorization 的值') : UI.toast('先完成第 1 步：粘贴并检查令牌');
    else if (k === 'bstCheck') {
      const tok = ($('#bstTok').value || '').trim(), msg = $('#bstMsg');
      if (!tok) { msg.textContent = '先粘贴令牌'; return; }
      msg.style.color = 'var(--text2)'; msg.textContent = '正在检查…';
      // 用这个令牌触发一次提醒程序：204 就说明令牌和权限都对（顺便跑一次提醒，没有副作用）
      const r = await fetch(HELP.boost()._url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }) }).catch(() => null);
      if (r && r.status === 204) { boostTok = tok; openHelp('boost'); UI.toast('令牌可以用，接着做第 2 步'); return; }
      msg.style.color = '';
      msg.textContent = !r ? '连不上 GitHub，请检查网络' : r.status === 401 ? '令牌不对，请重新复制' : (r.status === 403 || r.status === 404) ? '权限不够：仓库要选对，Actions 要选 Read and write' : `GitHub 返回 ${r.status}`;
    }
    else if (k === 'bstDone') {
      const msg = $('#bstDoneMsg');
      msg.style.color = 'var(--text2)'; msg.textContent = '正在等 cron-job.org 第一次叫醒（最多 6 分钟，可以先关掉这里）…';
      const since = Date.now();
      for (let i = 0; i < 13; i++) {
        if (await checkBoost(since)) { boostTok = ''; if (UI.isOpen('helpSheet')) UI.close('helpSheet'); UI.toast('设置好了，提醒以后会准时'); renderSettings(); return; }
        await new Promise(res => setTimeout(res, 30000));
      }
      if (msg.isConnected) { msg.style.color = ''; msg.textContent = '6 分钟内没等到叫醒。请在 cron-job.org 点这个任务的 TEST RUN，看是不是返回 204。'; }
    }
    else if (k === 'boostAccept') copy('application/vnd.github+json', '已复制');
    else if (k === 'boostBody') copy('{"ref":"main"}', '已复制');
    else if (k === 'vapid') copy(MC.settings.vapidPrivate, '已复制通知密钥');
    else if (k === 'yml') workflowYml ? copy(workflowYml, '已复制工作流文件') : UI.toast('文件还在加载，请稍后再点一次');
    else if (k === 'regen') {
      if (!Push.enabled()) { UI.toast('请先打开提醒通知开关'); return; }
      if (!(await UI.confirm('重新生成后，需要把新密钥更新到 GitHub 的 VAPID_PRIVATE_KEY，其他设备也要重新打开提醒开关。继续？', { ok: '重新生成' }))) return;
      try { await Push.regenerate(); openHelp('notify'); UI.toast('已生成新的通知密钥'); } catch (err) { UI.toast(err.message); }
    }
  });

  // ---------- 手动与 iCloud 云盘同步（iPhone 网页版）----------
  // 第 1 步选 Mac 同步用的 cadence-calendar.json 合并进来；第 2 步把合并结果用分享面板「存储到“文件”」存回同一个文件夹。
  // iOS 没替换、存成了「cadence-calendar 2.json」也没关系：Mac 会把这类副本合并进来再删掉
  // 用过一次之后：打开节律、回到节律、手机上改了东西时，自动弹出带「同步」按钮的提示，点一下直接选文件
  function icloudFileSync() {
    if (MC.settings.icFileAt) { $('#icFile').click(); return; } // 点击里直接打开（选文件必须由点击触发）
    UI.confirm('第 1 步：在「文件」里打开 iCloud 云盘 → Mac 同步用的文件夹，选 cadence-calendar.json。', { ok: '选择文件' })
      .then(ok => ok && $('#icFile').click());
  }
  let icMerging = false, icPromptAt = 0, icEditTimer = null;
  const icManual = () => !MC.Native.on && !!MC.settings.icFileAt;
  function icPrompt(force) {
    if (!icManual() || document.visibilityState !== 'visible' || UI.anyOpen()) return;
    const dirty = !!MC.settings.icFileDirty, stale = Date.now() - MC.settings.icFileAt > 30 * 60e3;
    if (!dirty && !stale) return;
    if (!force && Date.now() - icPromptAt < 10 * 60e3) return; // 十分钟内不重复打扰
    icPromptAt = Date.now();
    UI.toast(dirty ? '手机上的改动还没存到 iCloud 云盘' : '读取 Mac 在 iCloud 云盘里的最新数据', { action: '同步', onAction: icloudFileSync, ms: 8000 });
  }
  const commitIc = MC.commit;
  MC.commit = () => {
    commitIc();
    if (!icManual() || icMerging) return;
    if (!MC.settings.icFileDirty) { MC.settings.icFileDirty = true; MC.saveSettings(); }
    clearTimeout(icEditTimer); icEditTimer = setTimeout(() => icPrompt(true), 20e3); // 改完停 20 秒再提醒，不打断连续编辑
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => icPrompt(false), 800); });
  setTimeout(() => icPrompt(true), 1500);
  $('#icFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let remote;
    try { const j = JSON.parse(await f.text()); if (!j || !Array.isArray(j.events)) throw 0; remote = MC.normalize(j); }
    catch (err) { UI.toast('这不是节律的同步文件'); return; }
    icMerging = true; MC.data = MC.merge(MC.data, remote); MC.commit(); icMerging = false;
    const done = () => { MC.settings.icFileAt = Date.now(); MC.settings.icFileDirty = false; MC.saveSettings(); renderSettings(); };
    if (MC.sameData(MC.data, remote)) { // 手机上没有 Mac 没有的改动：不用存回去
      done();
      UI.toast('已读取 Mac 的数据，手机上没有新改动，不用存回去'); return;
    }
    if (!(await UI.confirm('已合并 Mac 的数据。第 2 步：点「存回去」→「存储到“文件”」→ 选同一个文件夹 → 存储；问到时选「替换」。', { ok: '存回去', cancel: '以后再说' }))) {
      MC.settings.icFileAt = MC.settings.icFileAt || Date.now(); MC.settings.icFileDirty = true; MC.saveSettings(); renderSettings(); return;
    }
    const json = JSON.stringify({ ...MC.data, updatedAt: Date.now() });
    const file = new File([json], 'cadence-calendar.json', { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (err) {
      MC.settings.icFileAt = MC.settings.icFileAt || Date.now(); MC.settings.icFileDirty = true; MC.saveSettings(); renderSettings();
      UI.toast(err && err.name === 'AbortError' ? '还没存回去，之后会再提醒你' : (err.message || '存回去失败')); return;
    }
    done();
    UI.toast('已存回 iCloud 云盘，Mac 一般几秒到一两分钟后合并');
  };

  // ---------- 备份 ----------
  async function exportData() {
    const json = JSON.stringify(MC.data, null, 2);
    const name = `节律备份-${MC.todayStr()}.json`;
    if (MC.Native.has('saveFile')) {
      const r = await MC.Native.saveFile(name, 'application/json', json);
      if (r && r.ok) UI.toast('备份已保存');
      return;
    }
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      MC.data = MC.merge(MC.data, MC.normalize(JSON.parse(await f.text())));
      MC.commit();
      UI.toast(`已导入，共 ${MC.data.events.length} 个事件`);
    } catch (err) { UI.toast('文件格式不正确'); }
  };

  // ---------- 启动 ----------
  applyTheme();
  paintTabAvatar();
  $('#tabCalNum').textContent = new Date().getDate();
  if (MC.vault.locked()) showLock(); else document.documentElement.classList.remove('locked');
  showPage('cal');
  applyTab3();
  syncRecTabs();
  requestAnimationFrame(() => placeInd(false));
  MC.extendSeries();
  // 通知已开、但这台设备还不知道后台推送已经设置过（比如新的 iPhone）：读一次同步数据认出来，不用再设置
  if (MC.session.token) MC.sync().then(() => { MC.extendSeries(); if (Push.enabled() && !MC.settings.remoteSetup) Push.resubscribe().then(() => renderSettings()); });
  window.addEventListener('online', () => MC.session.token && MC.sync());
  // App 开着时每 15 秒检查一次云端（没变化时只是一个很小的 304 请求）
  setInterval(() => { if (document.visibilityState === 'visible' && MC.session.token && !UI.anyOpen()) MC.sync(); }, 15000);
  window.addEventListener('focus', () => MC.session.token && MC.sync());
  window.addEventListener('pageshow', () => MC.session.token && MC.sync());

  // 界面高度与安全区（状态栏不再用透明样式，避开 iOS 底部被吃掉一截的 bug）
  const probeH = css => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;width:1px;height:${css};visibility:hidden;pointer-events:none`;
    document.body.appendChild(el); const h = el.offsetHeight; el.remove(); return h;
  };
  function fixSafeArea() {
    const sb = probeH('env(safe-area-inset-bottom,0px)'), st = probeH('env(safe-area-inset-top,0px)');
    const vh = probeH('100vh');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const portrait = window.innerHeight >= window.innerWidth;
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const h = window.innerHeight;
    MC.appH = h; // 只做记录；安全区与高度完全交给 CSS 的 env() 自动计算，避免启动瞬间读到错误值后被固定住
    MC.screenInfo = `屏幕 ${screenH} · 视口 ${window.innerHeight} · 100vh ${vh} · 界面 ${h} · 安全区 ${st}/${sb}${standalone ? ' · 主屏幕模式' : ''}`;
  }
  fixSafeArea();
  requestAnimationFrame(() => { renderPage(); placeInd(false); });
  window.addEventListener('resize', () => setTimeout(() => { fixSafeArea(); renderPage(); placeInd(false); }, 100));

  // 后台检查新版本：发现新版本就自动刷新一次
  async function checkVersion() {
    if (window.__mcMirrorVersion) return; // 从国内镜像加载的：镜像本身就是最新的，不用检查
    try {
      const r = await fetch('version.json?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== MC.VERSION && sessionStorage.getItem('mcal.vreload') !== version) {
        sessionStorage.setItem('mcal.vreload', version);
        const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
        await Promise.all(regs.map(x => x.update().catch(() => {})));
        location.reload();
      }
    } catch (e) {}
  }
  setTimeout(checkVersion, 800);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  setInterval(() => { // 跨过午夜
    const d = new Date().getDate();
    if ($('#tabCalNum').textContent !== String(d)) { $('#tabCalNum').textContent = d; renderPage(); }
  }, 60000);

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
    // 新版本接管后自动刷新一次，立即显示最新界面
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || sessionStorage.getItem('mcal.reloaded')) return;
      sessionStorage.setItem('mcal.reloaded', '1');
      location.reload();
    });
    setTimeout(() => sessionStorage.removeItem('mcal.reloaded'), 10000);
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') showPage('today'); });
  }
  setTimeout(() => MC.onNotifyCheck(), 1500);
  // 每日提醒跟随当前所在时区
  const syncTz = () => {
    const tz = MC.currentTz(), d = MC.data.daily;
    if (d.on && d.tz !== tz) MC.setDaily({ tz });
    // 换了时区：更新这台设备的推送时区，事件提醒按新时区计算
    if (Push.enabled() && MC.settings.pushReady && MC.session.token && (MC.settings.subTz !== tz || MC.settings.subH12 !== MC.use12())) Push.resubscribe();
  };
  syncTz();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTz(); });
  MC.openHash = h => {
    if (h === '#today') showPage('today');
    else if (h === '#sched') { if (MC.settings.tab3 !== 'sched') { MC.settings.tab3 = 'sched'; MC.saveSettings(); applyTab3(); } showPage('sched'); }
  };
  if (location.hash === '#today' || location.hash === '#sched') { MC.openHash(location.hash); history.replaceState(null, '', location.pathname); }
  // 安卓返回键：先关菜单和面板，再回到月历页；都没有时由 App 退到后台
  MC.back = () => {
    if (UI.confirmOpen()) { UI.closeConfirm(); return true; }
    if (document.documentElement.classList.contains('locked')) return false;
    if (UI.menuOpen()) { UI.closeMenu(); return true; }
    if (UI.anyOpen()) { UI.close(); return true; }
    if (MC.Drawer.isOpen()) { MC.Drawer.close(); return true; }
    if (page !== 'cal') { showPage('cal'); return true; }
    return false;
  };
  // 键盘（电脑 / Mac App / 平板外接键盘）：N 新建 · T 今天 · Y / M / W 年月周视图 · 1–4 切换底部页面
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (document.documentElement.classList.contains('locked') || UI.anyOpen() || UI.menuOpen() || UI.confirmOpen() || MC.Drawer.isOpen()) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (document.querySelector('.dp.show, .cam.show, .pv.show')) return; // 纪念日主页、相机、看照片时不响应
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); $('#fab').click(); }
    else if (k === 't') { e.preventDefault(); if (page !== 'cal') showPage('cal'); if (document.body.dataset.kind !== 'days' && MC.Cal.goToday) MC.Cal.goToday(); }
    else if (page === 'cal' && document.body.dataset.kind !== 'days' && { y: 1, m: 1, w: 1 }[k]) { e.preventDefault(); MC.Cal.setView({ y: 'year', m: 'month', w: 'week' }[k]); }
    else if (/^[1-5]$/.test(k)) { const b = tabs()[Number(k) - 1]; if (b) { e.preventDefault(); showPage(b.dataset.page); } }
  });

  // 安卓 App：提示更新（Mac App 在本机编译，不提示）
  if (MC.Native.on && !MC.Native.mac && !MC.Native.ios) {
    if (MC.Native.outdated) setTimeout(() => UI.toast('这个版本的安卓 App 太旧了，请到 设置 → 安卓 App 更新'), 2500);
    setTimeout(() => MC.Native.checkUpdate(false).then(up => {
      if (!up || sessionStorage.getItem('mcal.apkTold') === String(up.latest)) return;
      sessionStorage.setItem('mcal.apkTold', String(up.latest));
      UI.toast(`安卓 App 有新版本 ${up.name}，到 设置 → 安卓 App 下载`);
    }).catch(() => {}), 4000);
  }
})();
