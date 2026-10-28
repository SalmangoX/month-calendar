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
    const forced = t === 'auto' ? null : (dark ? '#050608' : '#F7FAFC');
    $('#themeLight').setAttribute('content', forced || '#FFFFFF');
    $('#themeDark').setAttribute('content', forced || '#050608');
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
    quad: { label: '四象限', svg: '<svg viewBox="0 0 24 24" class="filled"><rect x="4" y="4" width="7" height="7" rx="2.2"/><rect x="13" y="4" width="7" height="7" rx="2.2"/><rect x="4" y="13" width="7" height="7" rx="2.2"/><rect x="13" y="13" width="7" height="7" rx="2.2"/></svg>' },
    sched: { label: '课表', svg: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.5h17M9.5 9.5v11M3.5 15h17"/></svg>' },
  };
  function applyTab3() {
    const btn = tabbar.querySelector('button[data-page="quad"], button[data-page="sched"]');
    if (MC.settings.tab3 !== 'sched') MC.settings.tab3 = 'quad'; // 不再提供「不显示」，在页面左上角切换四象限 / 课表
    const v = MC.settings.tab3;
    btn.hidden = document.body.dataset.kind === 'days' || !!recCal(); // 纪念日历的菜单里没有这一项；开了等级评分的记录日历换成「统计」
    if (v !== 'off') { btn.dataset.page = v; btn.setAttribute('aria-label', TAB3[v].label); btn.innerHTML = TAB3[v].svg + `<span>${TAB3[v].label}</span>`; }
    if ((page === 'quad' || page === 'sched') && page !== v) showPage('cal'); else placeInd(false);
  }
  // 点左上角标题，弹出菜单切换四象限 / 课表
  document.querySelectorAll('.pswitch').forEach(btn => btn.addEventListener('click', () => {
    UI.menu(btn, [
      { label: '四象限', value: 'quad', on: page === 'quad' },
      { label: '课表', value: 'sched', on: page === 'sched' },
    ], v => { if (v === page) return; MC.settings.tab3 = v; MC.saveSettings(); applyTab3(); showPage(v); });
  }));
  function renderPage() {
    if (page === 'sched') { MC.Sched.render(); return; }
    if (page === 'cal') requestAnimationFrame(() => MC.Cal.render());
    else if (page === 'days' || page === 'dsum') { if (MC.Days) MC.Days.render(); }
    else if (page === 'today') renderToday();
    else if (page === 'quad') renderQuad();
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
  $('#fab').onclick = () => page === 'today'
    ? MC.Editor.openNew(MC.todayStr(), '')
    : MC.Editor.openNew(MC.Cal.selected(), page === 'cal' ? MC.activeCal() : '');
  document.body.dataset.page = page;

  MC.onChange = () => {
    MC.Drawer.paint();
    if (page === 'cal') MC.Cal.refresh(); else renderPage();
    paintTabAvatar();
  };

  // ---------- 今日 ----------
  function renderToday() {
    const d = new Date(), t = MC.todayStr();
    $('#todayDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${MC.WD[d.getDay()]}`;
    // 已逾期：最早的在最上面（含设为在主日历显示的记录日历）
    const overdue = MC.data.events.filter(e => MC.inMainView(e) && !e.done && MC.endDate(e) < t)
      .sort((a, b) => a.date.localeCompare(b.date) || MC.cmp(a, b));
    const today = MC.mainViewOn(t);
    const open = today.filter(e => !e.done), done = today.filter(e => e.done);
    // 接下来 7 天还没完成的（和今日小组件一致）
    const seen = new Set(today.map(e => e.id)), soon = [];
    for (let i = 1; i <= 7; i++) for (const e of MC.mainViewOn(MC.ymd(MC.addDays(d, i)))) if (!e.done && !seen.has(e.id)) { seen.add(e.id); soon.push(e); }
    let h = '';
    if (overdue.length) h += `<section class="sec"><h3 class="over"><span>已逾期</span><span class="sec-r"><button class="sec-act" data-sec="overdue">全部移到今天</button><span>${overdue.length}</span></span></h3><ul class="card glass-panel">${overdue.map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul></section>`;
    if (open.length) h += `<section class="sec"><h3><span>待完成</span><span>${open.length}</span></h3><ul class="card glass-panel">${open.map(e => UI.itemHTML(e)).join('')}</ul></section>`;
    if (done.length) h += `<section class="sec"><h3><span>已完成</span><span>${done.length}</span></h3><ul class="card glass-panel">${done.map(e => UI.itemHTML(e)).join('')}</ul></section>`;
    const sun = '<span class="em-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg></span>';
    const tick = '<span class="em-ico"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
    if (!today.length && !overdue.length) h = `<div class="big-empty">${sun}今天没有安排<br><small style="color:var(--text3)">点右下角 ＋ 添加</small></div>`;
    else if (!open.length && !overdue.length) h = `<div class="big-empty" style="padding:30px 20px 6px">${tick}今天的事都完成了</div>` + h;
    if (soon.length) h += `<section class="sec"><h3><span>接下来 7 天</span><span>${soon.length}</span></h3><ul class="card glass-panel">${soon.map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul></section>`;
    $('#todayBody').innerHTML = h;
  }
  $('#todayBody').addEventListener('click', e => {
    if (!e.target.closest('[data-sec="overdue"]')) return;
    const t = MC.todayStr();
    const list = MC.data.events.filter(x => MC.inMainView(x) && !x.done && MC.endDate(x) < t);
    if (list.length) UI.moveEvents(list, t, `已把 ${list.length} 个事件移到今天`);
  });
  UI.bindList($('#todayBody'));

  // ---------- 四象限 ----------
  function renderQuad() {
    const showDone = !!MC.settings.quadShowDone;
    $('#btnQuadDone').classList.toggle('on', showDone);
    $('#btnQuadDone').textContent = showDone ? '隐藏已完成' : '显示已完成';
    $('#quadBody').innerHTML = MC.PRI.map(p => {
      const list = MC.mainEvents().filter(e => e.priority === p.v && (showDone || !e.done))
        .sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
      return `<div class="qcard glass-panel" style="--c:${p.color}">
        <div class="qhead"><span class="roman">${p.roman}</span>${p.quad}<span class="cnt">${list.length || ''}</span></div>
        ${list.length ? `<ul class="qlist">${list.map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>` : `<div class="qempty">没有事件</div>`}
      </div>`;
    }).join('');
  }
  UI.bindList($('#quadBody'));

  // ---------- 记录日历：等级统计 ----------
  // 开了「等级评分」的记录日历，底部菜单里的四象限 / 课表换成「统计」：按这个日历自己的 4 个等级汇总事件
  const rs = { range: 'month', off: 0, notesOnly: false, tab: 'all', open: new Set(), openSlot: new Set(), openEv: new Set() };
  const recCal = () => { const id = MC.activeCal(); return id && MC.rateOn(id) ? MC.cal(id) : null; };
  function syncRecTabs() {
    const stat = tabbar.querySelector('button[data-page="rstat"]'), t3 = tabbar.querySelector('button[data-page="quad"], button[data-page="sched"]');
    if (!stat || !t3 || document.body.dataset.kind === 'days') return; // 纪念日历的菜单由 days.js 管
    const rc = !!recCal();
    stat.hidden = !rc; t3.hidden = rc;
    if (!rc && page === 'rstat') showPage('cal');
    else if (rc && (page === 'quad' || page === 'sched')) showPage('cal');
    else { if (page === 'rstat') renderRstat(); placeInd(false); }
  }
  MC.onCalChange = syncRecTabs;
  function rsSpan() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    if (rs.range === 'week') { const a = MC.addDays(MC.weekStartOf(t), rs.off * 7); return [a, MC.addDays(a, 6)]; }
    if (rs.range === 'month') { const a = new Date(t.getFullYear(), t.getMonth() + rs.off, 1); return [a, new Date(a.getFullYear(), a.getMonth() + 1, 0)]; }
    if (rs.range === 'year') { const y = t.getFullYear() + rs.off; return [new Date(y, 0, 1), new Date(y, 11, 31)]; }
    return null;
  }
  // ---- 统计图表与模型：等级趋势（柱 + 平均线 + 回归线）、星期分布、备注关键词 ----
  const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const numDay = n => { const d = new Date(n * 864e5); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  const avgOf = l => (l.length ? l.reduce((s, e) => s + e.rate, 0) / l.length : 0);
  const fx = (v, n = 2) => (Math.round(v * 10 ** n) / 10 ** n).toFixed(n);
  // 最小二乘直线：等级 ~ 日期
  function fitLine(pts) {
    const n = pts.length; if (n < 3) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    if (!sxx) return null;
    const b = sxy / sxx, a = my - b * mx;
    return { a, b, n, r2: syy ? (sxy * sxy) / (sxx * syy) : 0, at: x => Math.max(1, Math.min(4, a + b * x)) };
  }
  // 时间分桶：本周 / 本月按天，本年按月；全部按跨度自动选天 / 月 / 年
  function rsBins(evs, span) {
    let x0, x1;
    if (span) { x0 = dayNum(MC.ymd(span[0])); x1 = dayNum(MC.ymd(span[1])); }
    else { x0 = dayNum(evs[0].date); x1 = dayNum(evs[evs.length - 1].date); }
    const len = x1 - x0 + 1;
    const unit = rs.range === 'year' ? 'm' : span ? 'd' : len <= 62 ? 'd' : len <= 1100 ? 'm' : 'y';
    const bins = [];
    if (unit === 'd') for (let x = x0; x <= x1; x++) { const d = numDay(x); bins.push({ x0: x, x1: x, label: String(d.getDate()) }); }
    else {
      let d = numDay(x0); d = unit === 'm' ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), 0, 1);
      while (dayNum(MC.ymd(d)) <= x1) {
        const nx = unit === 'm' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear() + 1, 0, 1);
        bins.push({ x0: dayNum(MC.ymd(d)), x1: dayNum(MC.ymd(nx)) - 1, label: unit === 'm' ? `${d.getMonth() + 1}月` : String(d.getFullYear()) });
        d = nx;
      }
    }
    for (const b of bins) { b.c = [0, 0, 0, 0, 0]; b.r = []; }
    let j = 0;
    for (const e of evs) {
      const x = dayNum(e.date);
      while (j < bins.length - 1 && x > bins[j].x1) j++;
      const b = bins[j]; b.c[e.rate || 0]++; if (e.rate) b.r.push(e);
    }
    for (const b of bins) { b.n = b.c.reduce((s, v) => s + v, 0); b.avg = avgOf(b.r); }
    return { bins, unit };
  }
  const OP = [.18, .3, .5, .72, 1];
  function trendSVG(bins, color, fit) {
    const W = 340, H = 170, L = 22, R = 20, T = 10, B = 22, ih = H - T - B, n = bins.length, cw = (W - L - R) / n, bw = Math.max(2, Math.min(18, cw * .62));
    const maxC = Math.max(1, ...bins.map(b => b.n)), yR = v => T + ih * (1 - (v - 1) / 3);
    const step = Math.ceil(n / 8);
    let s = '';
    for (let r = 1; r <= 4; r++) s += `<line x1="${L}" x2="${W - R}" y1="${yR(r)}" y2="${yR(r)}" class="rs-grid"/><text x="${W - R + 5}" y="${yR(r) + 3}" class="rs-ax">${r}</text>`;
    s += `<text x="${L - 5}" y="${T + 3}" class="rs-ax" text-anchor="end">${maxC}</text><text x="${L - 5}" y="${H - B}" class="rs-ax" text-anchor="end">0</text>`;
    bins.forEach((b, i) => {
      const x = L + cw * i + (cw - bw) / 2; let y = H - B;
      for (const lv of [1, 2, 3, 4, 0]) {
        const k = b.c[lv]; if (!k) continue;
        const h = ih * k / maxC; y -= h;
        s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${lv ? color : 'var(--text2)'}" fill-opacity="${OP[lv]}"/>`;
      }
      if (i % step === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 7}" class="rs-ax" text-anchor="middle">${MC.esc(b.label)}</text>`;
    });
    const cx = b => L + cw * (bins.indexOf(b) + .5);
    if (fit) {
      const xa = (bins[0].x0 + bins[0].x1) / 2, xb = (bins[n - 1].x0 + bins[n - 1].x1) / 2;
      s += `<line x1="${cx(bins[0]).toFixed(1)}" x2="${cx(bins[n - 1]).toFixed(1)}" y1="${yR(fit.at(xa)).toFixed(1)}" y2="${yR(fit.at(xb)).toFixed(1)}" class="rs-fit"/>`;
    }
    const pts = bins.filter(b => b.r.length).map(b => [cx(b), yR(b.avg)]);
    if (pts.length > 1) s += `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" class="rs-avg"/>`;
    s += pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" class="rs-dot"/>`).join('');
    return `<svg class="rs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="等级趋势">${s}</svg>`;
  }
  function weekdaySVG(rated, color) {
    const W = 340, H = 120, T = 8, B = 30, ih = H - T - B, cw = W / 7, ws = MC.settings.weekStart || 0;
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    let s = '';
    for (let i = 0; i < 7; i++) {
      const wd = (ws + i) % 7, l = rated.filter(e => MC.parse(e.date).getDay() === wd), v = avgOf(l), x = cw * i + cw * .22, w = cw * .56;
      s += `<rect x="${x.toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${ih}" rx="5" class="rs-track"/>`;
      if (l.length) {
        const h = ih * v / 4;
        s += `<rect x="${x.toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${color}" fill-opacity="${(.3 + .7 * (v - 1) / 3).toFixed(2)}"/>`
          + `<text x="${(x + w / 2).toFixed(1)}" y="${(T + ih - h - 4).toFixed(1)}" class="rs-ax strong" text-anchor="middle">${fx(v, 1)}</text>`;
      }
      s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 15}" class="rs-ax" text-anchor="middle">周${names[wd]}</text><text x="${(x + w / 2).toFixed(1)}" y="${H - 3}" class="rs-ax dim" text-anchor="middle">${l.length ? l.length + '条' : ''}</text>`;
    }
    return `<svg class="rs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="星期分布">${s}</svg>`;
  }
  // 备注分词：浏览器支持 Intl.Segmenter 就按词切，否则汉字按两字一组、字母按单词
  const STOP = new Set(('的 了 是 我 你 他 她 它 们 也 很 都 就 在 和 与 及 或 有 没 不 这 那 个 一 一个 一些 还 又 再 被 把 给 让 吧 吗 呢 啊 呀 哦 嗯 着 过 到 说 要 会 能 可以 觉得 感觉 比较 有点 一点 非常 特别 真的 然后 但是 但 而且 因为 所以 如果 什么 怎么 自己 没有 就是 还是 已经 之后 之前 时候 今天 昨天 明天 '
    + 'the a an and or of to in is it this that for on with was are be i my me so very but not').split(' '));
  let segr = null; try { segr = new Intl.Segmenter('zh', { granularity: 'word' }); } catch (e) {}
  function tokens(s) {
    const out = new Set(), txt = String(s || '').toLowerCase();
    const add = w => { w = w.trim(); if (!w || STOP.has(w) || /^[\d.,:]+$/.test(w)) return; if (!/[\u3400-\u9fff]/.test(w) && w.length < 3) return; out.add(w.slice(0, 16)); };
    if (segr) { // 词典里没有的词会被切成单字（文笔 → 文 / 笔）：连续的单个汉字拼回一个词
      let run = '';
      const flush = () => { if (run) add(run); run = ''; };
      for (const t of segr.segment(txt)) {
        if (!t.isWordLike) { flush(); continue; }
        const w = t.segment;
        if (w.length === 1 && /[\u3400-\u9fff]/.test(w) && !STOP.has(w)) run += w; else { flush(); add(w); }
      }
      flush();
    }
    else {
      (txt.match(/[a-z\u00c0-\u024f0-9']+/g) || []).forEach(add);
      (txt.match(/[\u3400-\u9fff]+/g) || []).forEach(r => { if (r.length === 1) add(r); for (let i = 0; i + 1 < r.length; i++) add(r.slice(i, i + 2)); });
    }
    return out;
  }
  function keywordStats(evs) {
    const m = new Map();
    for (const e of evs) if (e.note) for (const w of tokens(e.note)) {
      let k = m.get(w); if (!k) m.set(w, k = { w, n: 0, r: [], lv: [0, 0, 0, 0, 0] });
      k.n++; k.lv[e.rate || 0]++; if (e.rate) k.r.push(e);
    }
    return [...m.values()].map(k => ({ ...k, avg: avgOf(k.r) }));
  }
  // ---- 时段分析：只看设了开始时间的事件（按开始时间归入时段）----
  const SLOTS = [['凌晨', 0, 6], ['早上', 6, 9], ['上午', 9, 12], ['中午', 12, 14], ['下午', 14, 18], ['晚上', 18, 22], ['深夜', 22, 24]];
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const slotOf = e => SLOTS.findIndex(s => mins(e.time) >= s[1] * 60 && mins(e.time) < s[2] * 60);
  const durOf = e => { if (!e.time || !e.endTime) return null; let d = mins(e.endTime) - mins(e.time); if (d <= 0) d += 1440; return d; };
  const fmtDur = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? (m % 60) + '分' : ''}` : `${m}分钟`; };
  function pearson(pts) {
    const n = pts.length; if (n < 5) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function heatSVG(timed, color) { // 横轴 0–23 点，纵轴等级：格子越深，那个钟点这个等级的记录越多
    const W = 340, H = 118, L = 40, T = 4, B = 18, cw = (W - L) / 24, ch = (H - T - B) / 4;
    const grid = [1, 2, 3, 4].map(() => Array(24).fill(0));
    for (const e of timed) if (e.rate) grid[e.rate - 1][+e.time.slice(0, 2)]++;
    const max = Math.max(1, ...grid.flat());
    let s = '';
    [4, 3, 2, 1].forEach((lv, r) => {
      const y = T + ch * r;
      s += `<text x="${L - 6}" y="${(y + ch / 2 + 3).toFixed(1)}" class="rs-ax" text-anchor="end">${lv}</text>`;
      for (let h = 0; h < 24; h++) {
        const k = grid[lv - 1][h];
        s += `<rect x="${(L + cw * h + .8).toFixed(1)}" y="${(y + .8).toFixed(1)}" width="${(cw - 1.6).toFixed(1)}" height="${(ch - 1.6).toFixed(1)}" rx="2.5" ${k ? `fill="${color}" fill-opacity="${(.18 + .82 * k / max).toFixed(2)}"` : 'class="rs-track"'}><title>${h}:00 · ${k}</title></rect>`;
      }
    });
    for (const h of [0, 6, 12, 18, 23]) s += `<text x="${(L + cw * (h + .5)).toFixed(1)}" y="${H - 4}" class="rs-ax" text-anchor="middle">${h}</text>`;
    return `<svg class="rs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="时段 × 等级">${s}</svg>`;
  }
  // ---- 分段评价（每半小时一段）的统计 ----
  function segPoints(evs) {
    const pts = [];
    for (const e of evs) {
      if (!e.segs || !Object.keys(e.segs).length) continue;
      MC.segBlocks(e.time, e.endTime).forEach((b, i) => { const v = e.segs[b.k]; if (v) pts.push({ e, clock: b.a % 1440, hh: Math.floor((b.a % 1440) / 30), idx: i, v }); });
    }
    return pts;
  }
  const hhLabel = h => `${Math.floor(h / 2)}:${h % 2 ? '30' : '00'}`;
  const offLabel = i => (i === 0 ? '开始' : i % 2 ? `+${i > 1 ? Math.floor(i / 2) + '小时' : ''}30分` : `+${i / 2}小时`);
  function barsSVG(cols, color, H = 130) { // cols: [{ label, v (平均等级), n }]；柱高 = 平均等级，颜色深浅 = 段数
    const W = 340, T = 14, B = 20, L = 4, ih = H - T - B, n = cols.length, cw = (W - L * 2) / n, bw = Math.max(3, Math.min(26, cw * .7));
    const maxN = Math.max(1, ...cols.map(c => c.n)), step = Math.ceil(n / 9);
    let s = '';
    for (let r = 1; r <= 4; r++) { const y = T + ih * (1 - r / 4); s += `<line x1="${L}" x2="${W - L}" y1="${y}" y2="${y}" class="rs-grid"/>`; }
    cols.forEach((c, i) => {
      const x = L + cw * i + (cw - bw) / 2;
      if (c.n) {
        const h = ih * c.v / 4;
        s += `<rect x="${x.toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" fill-opacity="${(.35 + .65 * c.n / maxN).toFixed(2)}"><title>${c.label} · ${fx(c.v, 1)} · ${c.n}</title></rect>`;
        if (n <= 16) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(T + ih - h - 3).toFixed(1)}" class="rs-ax strong" text-anchor="middle">${fx(c.v, 1)}</text>`;
      } else s += `<rect x="${x.toFixed(1)}" y="${(T + ih - 3).toFixed(1)}" width="${bw.toFixed(1)}" height="3" rx="1.5" class="rs-track"/>`;
      if (i % step === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" class="rs-ax" text-anchor="middle">${MC.esc(c.label)}</text>`;
    });
    return `<svg class="rs-svg" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }
  function segCards(c, evs, labels) {
    const pts = segPoints(evs); if (!pts.length) return '';
    const mean = pts.reduce((s, p) => s + p.v, 0) / pts.length, avgP = l => l.reduce((s, p) => s + p.v, 0) / l.length;
    // 1. 一天里每个半小时
    const lo = Math.min(...pts.map(p => p.hh)), hi = Math.max(...pts.map(p => p.hh)), a0 = Math.max(0, Math.min(lo, hi - 3)), cols = [];
    for (let h = a0; h <= Math.max(hi, a0 + 3); h++) { const l = pts.filter(p => p.hh === h); cols.push({ label: hhLabel(h), v: l.length ? avgP(l) : 0, n: l.length }); }
    const best = cols.filter(x => x.n >= 2).sort((x, y) => y.v - x.v || y.n - x.n), worst = [...best].reverse();
    // 2. 时段汇总
    const rows = SLOTS.map((s, i) => {
      const l = pts.filter(p => p.clock >= s[1] * 60 && p.clock < s[2] * 60); if (!l.length) return '';
      const open = rs.openSlot.has(i), cnt = [0, 0, 0, 0, 0]; l.forEach(p => cnt[p.v]++);
      const bar = [4, 3, 2, 1].map(lv => (cnt[lv] ? `<i style="width:${(cnt[lv] / l.length * 100).toFixed(1)}%;background:${c.color};opacity:${OP[lv]}"></i>` : '')).join('');
      const evl = [...new Set(l.map(p => p.e))].reverse();
      return `<div class="rs-item${open ? ' open' : ''}">
        <button class="rs-trow" data-slot="${i}" aria-expanded="${open}">
          <span class="rs-name">${s[0]}<small>${s[1]}–${s[2]} 点</small></span>
          <span class="rs-stack">${bar}</span>
          <span class="rs-num">${fx(avgP(l), 1)}<small>${l.length} 段</small></span>
        </button>
        ${open ? `<div class="rs-sub">${[4, 3, 2, 1].filter(lv => cnt[lv]).map(lv => `<span data-uc>${MC.esc(labels[lv - 1])}</span> ${cnt[lv]} 段`).join(' · ')} · 比平均 ${avgP(l) >= mean ? '+' : ''}${fx(avgP(l) - mean)}</div><ul class="rs-list">${evl.map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>` : ''}
      </div>`;
    }).join('');
    // 3. 开始后的变化：第几个半小时
    const maxI = Math.min(11, Math.max(...pts.map(p => p.idx))), ic = [];
    for (let i = 0; i <= maxI; i++) { const l = pts.filter(p => p.idx === i); ic.push({ label: offLabel(i), v: l.length ? avgP(l) : 0, n: l.length }); }
    const fit = fitLine(pts.filter(p => p.idx <= 11).map(p => [p.idx, p.v])), multi = new Set(pts.map(p => p.e)).size;
    let model = '';
    if (maxI < 1) model = '<p class="rs-note">事件都只有一段，还看不出开始后的变化。</p>';
    else if (!fit || pts.length < 6) model = `<p class="rs-note">分段评价还太少（${pts.length} 段），至少 6 段才估计变化。</p>`;
    else {
      const flat = Math.abs(fit.b) < .05 || fit.r2 < .05, bi = ic.map((x, i) => [x, i]).filter(([x]) => x.n >= 2).sort((x, y) => y[0].v - x[0].v)[0];
      model = `<div class="rs-kv"><span>开始后的走势</span><b>${flat ? '基本稳定' : fit.b > 0 ? '越往后越好' : '越往后越差'}</b></div>
        <div class="rs-kv"><span>每过半小时</span><b>${fit.b >= 0 ? '+' : ''}${fx(fit.b)} 级</b></div>
        ${bi ? `<div class="rs-kv"><span>状态最好的一段</span><b>${bi[0].label === '开始' ? '刚开始的半小时' : `开始后 ${bi[0].label.slice(1)}`}<small>${fx(bi[0].v, 1)}</small></b></div>` : ''}
        <p class="rs-note">拟合度 R² = ${fx(fit.r2)}${fit.r2 < .3 ? '，波动较大，仅供参考' : ''}。模型：段等级 = a + b × 第几段（${pts.length} 段，来自 ${multi} 条记录）。</p>`;
    }
    return `<div class="rs-kpis">
        <div class="rs-kpi"><b>${pts.length}</b><span>评过的半小时</span></div>
        <div class="rs-kpi"><b>${fx(mean)}</b><span>平均 ≈ <em data-uc>${MC.esc(labels[Math.round(mean) - 1])}</em></span></div>
      </div>
      <div class="rs-card glass-panel rs-pad"><div class="rs-h">一天里的状态<small>每半小时的平均等级 · 颜色越深评得越多</small></div>${barsSVG(cols, c.color)}
        ${best.length >= 2 ? `<div class="rs-kv"><span>最好的半小时</span><b>${best[0].label}<small>${fx(best[0].v, 1)} · ${best[0].n} 段</small></b></div><div class="rs-kv"><span>最差的半小时</span><b>${worst[0].label}<small>${fx(worst[0].v, 1)} · ${worst[0].n} 段</small></b></div>` : ''}
      </div>
      <div class="rs-card glass-panel rs-pad"><div class="rs-h">时段汇总<small>按每段的评价 · 点开看记录</small></div><div class="rs-tlist">${rows}</div></div>
      <div class="rs-card glass-panel rs-pad"><div class="rs-h">开始后的变化<small>第几个半小时的平均等级</small></div>${barsSVG(ic, c.color, 120)}${model}</div>`;
  }
  // 某个事件的分段曲线（事件页展开时用）
  function segLine(list) {
    const pts = segPoints(list); if (!pts.length) return '';
    const maxI = Math.min(11, Math.max(...pts.map(p => p.idx))), out = [];
    for (let i = 0; i <= maxI; i++) { const l = pts.filter(p => p.idx === i); if (l.length) out.push(`${offLabel(i)} ${fx(l.reduce((s, p) => s + p.v, 0) / l.length, 1)}`); }
    return `<div class="rs-sub">分段平均：${out.join(' · ')}</div>`;
  }
  function slotCard(c, evs, labels) {
    const timed = evs.filter(e => e.time), tr = timed.filter(e => e.rate);
    if (!timed.length) return '';
    if (!tr.length) return `<div class="rs-card glass-panel rs-pad"><div class="rs-h">时段分析</div><p class="rs-note">有 ${timed.length} 条设了时间的记录，但还没有评级。评级之后这里会按时段统计。</p></div>`;
    const mean = avgOf(tr);
    const rows = SLOTS.map((s, i) => {
      const l = timed.filter(e => slotOf(e) === i), r = l.filter(e => e.rate), open = rs.openSlot.has(i);
      if (!l.length) return '';
      const cnt = [0, 0, 0, 0, 0]; l.forEach(e => cnt[e.rate || 0]++);
      const bar = [4, 3, 2, 1, 0].map(lv => (cnt[lv] ? `<i style="width:${(cnt[lv] / l.length * 100).toFixed(1)}%;background:${lv ? c.color : 'var(--text2)'};opacity:${OP[lv]}"></i>` : '')).join('');
      const dl = l.map(durOf).filter(d => d !== null);
      return `<div class="rs-item${open ? ' open' : ''}">
        <button class="rs-trow" data-slot="${i}" aria-expanded="${open}">
          <span class="rs-name">${s[0]}<small>${s[1]}–${s[2]} 点</small></span>
          <span class="rs-stack">${bar}</span>
          <span class="rs-num">${r.length ? fx(avgOf(r), 1) : '–'}<small>${l.length} 条</small></span>
        </button>
        ${open ? `<div class="rs-sub">已评级 ${r.length} / ${l.length}${dl.length ? ` · 平均时长 ${fmtDur(dl.reduce((a, b) => a + b, 0) / dl.length)}` : ''}${r.length ? ` · 比整体平均 ${avgOf(r) >= mean ? '+' : ''}${fx(avgOf(r) - mean)}` : ''}</div><ul class="rs-list">${l.map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>` : ''}
      </div>`;
    }).join('');
    // 最好 / 最差的时段（至少 2 条已评级）
    const ss = SLOTS.map((s, i) => ({ s, r: tr.filter(e => slotOf(e) === i) })).filter(x => x.r.length >= 2).map(x => ({ ...x, a: avgOf(x.r) }));
    let best = '';
    if (ss.length >= 2) {
      ss.sort((x, y) => y.a - x.a);
      const hi = ss[0], lo = ss[ss.length - 1];
      best = `<div class="rs-kv"><span>等级最高的时段</span><b>${hi.s[0]} ${fx(hi.a, 1)}<small>${hi.r.length} 条</small></b></div>
        <div class="rs-kv"><span>等级最低的时段</span><b>${lo.s[0]} ${fx(lo.a, 1)}<small>${lo.r.length} 条</small></b></div>`;
    }
    // 时长和等级
    const dp = tr.map(e => [durOf(e), e.rate]).filter(p => p[0] !== null), r = pearson(dp);
    let dur = '';
    if (dp.length) {
      const per = [4, 3, 2, 1].map(lv => { const d = dp.filter(p => p[1] === lv).map(p => p[0]); return d.length ? `<div class="rs-kv"><span data-uc>${MC.esc(labels[lv - 1])}</span><b>${fmtDur(d.reduce((a, b) => a + b, 0) / d.length)}<small>${d.length} 条</small></b></div>` : ''; }).join('');
      const ar = r === null ? 0 : Math.abs(r);
      const desc = r === null ? `有结束时间的已评级记录还太少（${dp.length} 条），至少 5 条才计算相关性。`
        : ar < .1 ? '时长和等级基本无关。' : `${ar < .3 ? '弱' : ar < .6 ? '中等' : '强'}${r > 0 ? '正' : '负'}相关：时长越长，等级${r > 0 ? '越高' : '越低'}。`;
      dur = `<div class="rs-sh">各等级的平均时长</div>${per}<p class="rs-note">${r === null ? '' : `相关系数 r = ${fx(r)}。`}${desc}</p>`;
    }
    return `<div class="rs-card glass-panel rs-pad"><div class="rs-h">按开始时间<small>整条事件的等级 · 点开看记录</small></div>
        <div class="rs-tlist">${rows}</div>${best}
        <div class="rs-sh">钟点 × 等级<small>格子越深，那个钟点该等级的记录越多</small></div>${heatSVG(timed, c.color)}
        ${dur}
      </div>`;
  }
  function rsAnalysis(c, evs, span, labels) {
    const rated = evs.filter(e => e.rate);
    const mean = avgOf(rated), { bins, unit } = rsBins(evs, span);
    const fit = fitLine(rated.map(e => [dayNum(e.date), e.rate]));
    // 趋势模型的结论
    let model = '';
    if (!fit || fit.n < 5) model = `<p class="rs-note">已评级的记录还太少（${rated.length} 条），至少 5 条才能估计趋势。</p>`;
    else {
      const per = unit === 'd' ? 7 : 30, perName = unit === 'd' ? '每周' : '每月', slope = fit.b * per;
      const flat = Math.abs(slope) < .05 || fit.r2 < .05;
      const verdict = flat ? '基本平稳' : slope > 0 ? '在上升' : '在下降';
      const lastX = dayNum(evs[evs.length - 1].date), plen = span ? bins[bins.length - 1].x1 - bins[0].x0 + 1 : (bins[bins.length - 1].x1 - bins[bins.length - 1].x0 + 1);
      const nextX = (span ? bins[bins.length - 1].x1 : lastX) + plen / 2, pred = fit.at(nextX);
      const nextName = rs.range === 'week' ? '下周' : rs.range === 'month' ? '下个月' : rs.range === 'year' ? '明年' : unit === 'd' ? '接下来几天' : unit === 'm' ? '下个月' : '明年';
      const near = labels[Math.round(pred) - 1];
      model = `<div class="rs-kv"><span>趋势</span><b>${verdict}</b></div>
        <div class="rs-kv"><span>变化速度</span><b>${perName} ${slope >= 0 ? '+' : ''}${fx(slope)} 级</b></div>
        <div class="rs-kv"><span>拟合度 R²</span><b>${fx(fit.r2)}</b></div>
        ${flat ? '' : `<div class="rs-kv"><span>${nextName}预计平均</span><b>${fx(pred, 1)}<small data-uc>${MC.esc(near)}</small></b></div>`}
        <p class="rs-note">${fit.r2 < .3 ? '拟合度较低：等级波动大，趋势只能作参考。' : '拟合度不错，这个趋势比较可靠。'}模型：等级 = a + b × 日期（最小二乘，${fit.n} 条已评级记录）。</p>`;
    }
    // 有备注 / 没备注
    const wn = rated.filter(e => e.note), nn = rated.filter(e => !e.note);
    const noteCmp = wn.length && nn.length ? `<div class="rs-kv"><span>写了备注的平均等级</span><b>${fx(avgOf(wn))}<small>${wn.length} 条</small></b></div><div class="rs-kv"><span>没写备注的平均等级</span><b>${fx(avgOf(nn))}<small>${nn.length} 条</small></b></div>` : '';
    // 备注关键词
    const kw = keywordStats(evs), minN = kw.some(k => k.n >= 2) ? 2 : 1;
    const top = kw.filter(k => k.n >= minN).sort((x, y) => y.n - x.n || y.avg - x.avg).slice(0, 12);
    const scored = kw.filter(k => k.r.length >= 2);
    const hi = [...scored].sort((x, y) => y.avg - x.avg || y.n - x.n).filter(k => k.avg > mean).slice(0, 5);
    const lo = [...scored].sort((x, y) => x.avg - y.avg || y.n - x.n).filter(k => k.avg < mean).slice(0, 5);
    const chip = k => `<span class="rs-kw" style="--k:${k.r.length ? (.15 + .85 * (k.avg - 1) / 3).toFixed(2) : 0}"><b data-uc>${MC.esc(k.w)}</b><small>${k.r.length ? fx(k.avg, 1) : '–'}</small></span>`;
    const perLv = [4, 3, 2, 1].map(lv => {
      const ws = kw.filter(k => k.lv[lv]).sort((x, y) => y.lv[lv] - x.lv[lv] || y.n - x.n).slice(0, 5);
      return ws.length ? `<div class="rs-lvw"><span class="rs-lvn" data-uc style="--k:${OP[lv]}">${MC.esc(labels[lv - 1])}</span><span class="rs-lvl" data-uc>${ws.map(k => MC.esc(k.w)).join('、')}</span></div>` : '';
    }).join('');
    const kwCard = top.length ? `<div class="rs-card glass-panel rs-pad"><div class="rs-h">备注关键词<small>数字是含这个词的记录的平均等级</small></div>
        <div class="rs-kws">${top.map(chip).join('')}</div>
        ${hi.length ? `<div class="rs-sh">高分常见</div><div class="rs-kws">${hi.map(chip).join('')}</div>` : ''}
        ${lo.length ? `<div class="rs-sh">低分常见</div><div class="rs-kws">${lo.map(chip).join('')}</div>` : ''}
        ${perLv ? `<div class="rs-sh">各等级常用词</div>${perLv}` : ''}
      </div>` : `<div class="rs-card glass-panel rs-pad"><div class="rs-h">备注关键词</div><p class="rs-note">这段时间的记录还没有备注。写了备注之后，这里会分析哪些词常和高分、低分一起出现。</p></div>`;
    return {
      trend: `<div class="rs-card glass-panel rs-pad"><div class="rs-h">等级趋势<small>柱：各等级数量 · 实线：平均 · 虚线：趋势</small></div>${trendSVG(bins, c.color, fit && fit.n >= 5 ? fit : null)}</div>`,
      model: `<div class="rs-card glass-panel rs-pad"><div class="rs-h">趋势模型</div>${model}</div>`,
      weekday: `<div class="rs-card glass-panel rs-pad"><div class="rs-h">星期分布<small>每天的平均等级</small></div>${weekdaySVG(rated, c.color)}</div>`,
      noteCmp, kw: kwCard,
    };
  }
  // ---- 按事件统计：同名事件（常用事件）汇总 ----
  function evCard(c, evs) {
    const m = new Map();
    for (const e of evs) { const k = e.title.trim(); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    const pre = new Set((c.presets || []).map(p => p.name));
    const groups = [...m.entries()].map(([name, l]) => ({ name, l, r: l.filter(e => e.rate) })).sort((x, y) => y.l.length - x.l.length || avgOf(y.r) - avgOf(x.r));
    if (!groups.length) return '';
    const mean = avgOf(evs.filter(e => e.rate)), top = groups.slice(0, 40);
    const rows = top.map(g => {
      const open = rs.openEv.has(g.name), cnt = [0, 0, 0, 0, 0]; g.l.forEach(e => cnt[e.rate || 0]++);
      const bar = [4, 3, 2, 1, 0].map(lv => (cnt[lv] ? `<i style="width:${(cnt[lv] / g.l.length * 100).toFixed(1)}%;background:${lv ? c.color : 'var(--text2)'};opacity:${OP[lv]}"></i>` : '')).join('');
      let sub = '';
      if (open) {
        const dl = g.l.map(durOf).filter(d => d !== null), done = g.l.filter(e => e.done).length;
        const ss = SLOTS.map((s, i) => ({ s, r: g.r.filter(e => e.time && slotOf(e) === i) })).filter(x => x.r.length).sort((x, y) => avgOf(y.r) - avgOf(x.r) || y.r.length - x.r.length);
        sub = `<div class="rs-sub">${[`已完成 ${done} / ${g.l.length}`, g.r.length ? `比整体平均 ${avgOf(g.r) >= mean ? '+' : ''}${fx(avgOf(g.r) - mean)}` : '', dl.length ? `平均时长 ${fmtDur(dl.reduce((a, b) => a + b, 0) / dl.length)}` : '', ss.length > 1 ? `${ss[0].s[0]}做得最好（${fx(avgOf(ss[0].r), 1)}）` : ''].filter(Boolean).join(' · ')}</div>
          ${segLine(g.l)}<ul class="rs-list">${[...g.l].reverse().map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>`;
      }
      return `<div class="rs-item${open ? ' open' : ''}">
        <button class="rs-erow" data-ev="${MC.esc(g.name)}" aria-expanded="${open}">
          <span class="rs-name"><span data-uc>${MC.esc(g.name)}</span>${pre.has(g.name) ? '<em class="rs-pre">常用</em>' : ''}</span>
          <span class="rs-stack">${bar}</span>
          <span class="rs-num">${g.r.length ? fx(avgOf(g.r), 1) : '–'}<small>${g.l.length} 次</small></span>
        </button>${sub}
      </div>`;
    }).join('');
    return `<div class="rs-card glass-panel rs-pad"><div class="rs-h">按事件<small>同名事件放在一起 · 数字是平均等级 · 点开看详情</small></div>
      <div class="rs-tlist">${rows}</div>${groups.length > top.length ? `<p class="rs-note">只显示次数最多的 ${top.length} 个。</p>` : ''}</div>`;
  }
  const RS_TABS = [['all', '概览'], ['trend', '趋势'], ['slot', '时段'], ['ev', '事件'], ['note', '备注']];
  function renderRstat() {
    const c = recCal(); if (!c) return;
    const span = rsSpan(), labels = MC.rateLabels(c.id);
    $('#rsName').textContent = c.name;
    $('#page-rstat').style.setProperty('--c', c.color);
    $('#rsNotes').classList.toggle('on', rs.notesOnly);
    $('#rsSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === rs.range));
    $('#rsTabs').innerHTML = RS_TABS.map(([v, l]) => `<button data-v="${v}"${v === rs.tab ? ' class="on"' : ''}>${l}</button>`).join('');
    $('#rsNav').hidden = !span;
    if (span) $('#rsLabel').textContent = rs.range === 'week' ? `${MC.dateLabel(MC.ymd(span[0]))} – ${MC.dateLabel(MC.ymd(span[1]))}` : rs.range === 'month' ? `${span[0].getFullYear()}年${span[0].getMonth() + 1}月` : `${span[0].getFullYear()}年`;
    const a = span ? MC.ymd(span[0]) : '', b = span ? MC.ymd(span[1]) : '';
    const evs = MC.data.events.filter(e => e.cal === c.id && (!span || (e.date >= a && e.date <= b)) && (!rs.notesOnly || e.note))
      .sort((x, y) => x.date.localeCompare(y.date) || (x.time || '').localeCompare(y.time || ''));
    if (!evs.length) { $('#rsBody').innerHTML = `<div class="rs-empty">${rs.notesOnly ? '这段时间没有带备注的记录' : '这段时间还没有记录'}</div>`; return; }
    const ratedL = evs.filter(e => e.rate), rated = ratedL.length, done = evs.filter(e => e.done).length, mean = avgOf(ratedL);
    const hint = t => `<div class="rs-card glass-panel rs-pad"><p class="rs-note" style="margin:0">${t}</p></div>`;
    let html = '';
    if (rs.tab === 'all') {
      const by = n => evs.filter(e => (e.rate || 0) === n);
      const max = Math.max(1, ...[0, 1, 2, 3, 4].map(n => by(n).length));
      const row = n => {
        const list = by(n), d = list.filter(e => e.done).length, open = rs.open.has(n);
        const name = n ? `<span data-uc>${MC.esc(labels[n - 1])}</span>` : '未评级';
        return `<div class="rs-item${open ? ' open' : ''}" style="--c:${n ? c.color : 'var(--text2)'};--k:${n ? OP[n] : .25}">
          <button class="rs-row" data-lv="${n}" aria-expanded="${open}"${list.length ? '' : ' disabled'}>
            <span class="rs-name">${name}</span>
            <span class="rs-bar"><i style="width:${(list.length / max * 100).toFixed(1)}%"></i></span>
            <span class="rs-num">${list.length}<small>${Math.round(list.length / evs.length * 100)}%</small></span>
          </button>
          ${open && list.length ? `<div class="rs-sub">已完成 ${d} / ${list.length}</div><ul class="rs-list">${[...list].reverse().map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>` : ''}
        </div>`;
      };
      const seg = [4, 3, 2, 1, 0].map(n => { const k = by(n).length; return k ? `<i style="flex:${k};background:${n ? c.color : 'var(--text2)'};opacity:${OP[n]}"></i>` : ''; }).join('');
      html = `<div class="rs-kpis">
          <div class="rs-kpi"><b>${evs.length}</b><span>条记录</span></div>
          <div class="rs-kpi"><b>${rated ? fx(mean) : '–'}</b><span>${rated ? `平均 ≈ <em data-uc>${MC.esc(labels[Math.round(mean) - 1])}</em>` : '平均等级'}</span></div>
          <div class="rs-kpi"><b>${Math.round(done / evs.length * 100)}%</b><span>完成率</span></div>
          <div class="rs-kpi"><b>${rated}<small>/${evs.length}</small></b><span>已评级</span></div>
        </div>
        <div class="rs-card glass-panel"><div class="rs-dist">${seg}</div>${[4, 3, 2, 1, 0].map(row).join('')}</div>`;
    } else if (rs.tab === 'ev') html = evCard(c, evs);
    else if (rs.tab === 'slot') {
        const seg = segCards(c, evs, labels), whole = slotCard(c, evs, labels);
        const mode = rs.slotMode || (seg ? 'seg' : 'ev');
        html = `<div class="seg small rs-sub-seg" id="rsSlotMode"><button data-v="seg"${mode === 'seg' ? ' class="on"' : ''}>按半小时评价</button><button data-v="ev"${mode === 'ev' ? ' class="on"' : ''}>按整条事件</button></div>`
          + (mode === 'seg' ? seg || hint('还没有分段评价。编辑一条设了开始和结束时间的事件，在「分段评价」里给每半小时评级，这里就会统计。')
            : whole || hint('这段时间没有设了时间段的记录。添加事件时选上时间段，这里就会按时段统计。'));
      }
    else if (!rated) html = hint('给事件评级之后，这里会出现等级趋势、时段分析和备注关键词。');
    else {
      const p = rsAnalysis(c, evs, span, labels);
      if (rs.tab === 'trend') html = p.trend + p.model + p.weekday;
      else html = (p.noteCmp ? `<div class="rs-card glass-panel rs-pad"><div class="rs-h">备注与等级</div>${p.noteCmp}</div>` : '') + p.kw;
    }
    $('#rsBody').innerHTML = html;
  }
  UI.bindList($('#rsBody'));
  $('#rsBody').addEventListener('click', e => {
    const sm = e.target.closest('#rsSlotMode button');
    if (sm) { rs.slotMode = sm.dataset.v; rs.openSlot.clear(); renderRstat(); return; }
    const ev = e.target.closest('.rs-erow');
    if (ev) { const k = ev.dataset.ev; rs.openEv.has(k) ? rs.openEv.delete(k) : rs.openEv.add(k); renderRstat(); return; }
    const t = e.target.closest('.rs-trow');
    if (t) { const i = Number(t.dataset.slot); rs.openSlot.has(i) ? rs.openSlot.delete(i) : rs.openSlot.add(i); renderRstat(); return; }
    const r = e.target.closest('.rs-row'); if (!r) return;
    const n = Number(r.dataset.lv); rs.open.has(n) ? rs.open.delete(n) : rs.open.add(n); renderRstat();
  });
  $('#rsSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rs.range = b.dataset.v; rs.off = 0; renderRstat(); });
  $('#rsTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rs.tab = b.dataset.v; renderRstat(); $('.rs-scroll').scrollTop = 0; });
  $('#rsPrev').onclick = () => { rs.off--; renderRstat(); };
  $('#rsNext').onclick = () => { rs.off++; renderRstat(); };
  $('#rsNotes').onclick = () => { rs.notesOnly = !rs.notesOnly; renderRstat(); };
  $('#btnQuadDone').onclick = () => { MC.settings.quadShowDone = !MC.settings.quadShowDone; MC.saveSettings(); renderQuad(); };

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
  const IC = {
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.3 3.6 5 3.6 8s-1.2 5.7-3.6 8c-2.4-2.3-3.6-5-3.6-8s1.2-5.7 3.6-8z"/></svg>',
    theme: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor"/></svg>',
    week: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="3.5"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7.5 18.5a4.5 4.5 0 0 1-.5-8.97 5.5 5.5 0 0 1 10.6 1.47A3.75 3.75 0 0 1 17.25 18.5z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V9h-4.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    lockNow: '<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.2v2"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8.5" cy="12" r="3.5"/><path d="M12 12h8.5M17.5 12v3M20.5 12v2.2"/></svg>',
    unlink: '<svg viewBox="0 0 24 24"><path d="M10 14l-1 1a3 3 0 0 1-4.2-4.2l2-2M14 10l1-1a3 3 0 0 1 4.2 4.2l-2 2M5 5l14 14"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4.5 11.5l15-6.5-5.5 15-2.6-6z"/><path d="M11.4 14l3.1-3.1"/></svg>',
    laptop: '<svg viewBox="0 0 24 24"><rect x="5" y="5.5" width="14" height="10" rx="2"/><path d="M3 18.5h18"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.8"/><path d="M11 18h2"/></svg>',
    android: '<svg viewBox="0 0 24 24"><rect x="5.5" y="9" width="13" height="10" rx="2.5"/><path d="M8.5 9a3.5 3.5 0 0 1 7 0M8 4.5l1.5 2M16 4.5l-1.5 2"/><circle cx="10" cy="13" r=".6" fill="currentColor"/><circle cx="14" cy="13" r=".6" fill="currentColor"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M12 14.5V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    import: '<svg viewBox="0 0 24 24"><path d="M12 4v10.5M8 10.5l4 4 4-4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.8"/><rect x="13" y="4.5" width="6.5" height="6.5" rx="1.8"/><rect x="4.5" y="13" width="6.5" height="6.5" rx="1.8"/><rect x="13" y="13" width="6.5" height="6.5" rx="1.8"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  };
  const CHEV = '<span class="chev"><svg viewBox="0 0 8 13"><path d="M1.5 1.5l5 5-5 5"/></svg></span>';
  const SET_TONES = { rose: ['#B15D69', '#ED9EA7'], coral: ['#B16148', '#EDA28B'], apricot: ['#A76B2A', '#E2AB76'], sage: ['#4D8B50', '#91C892'], jade: ['#0D8F73', '#73CBB0'], teal: ['#008C8F', '#64CACD'], sky: ['#1D85B0', '#75C2EA'], periwinkle: ['#5679BB', '#96B8F5'], lavender: ['#7C6DB6', '#B8ADF0'], orchid: ['#9C629D', '#D7A2D8'] }; // [浅色, 深色]
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
    const icStyle = t ? `--icl:${t[0]};--icd:${t[1]}` : o.tone === 'danger' ? '--icl:var(--p3);--icd:var(--p3)' : '--icl:var(--accent);--icd:var(--accent)';
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
      ], '每个人用自己的 GitHub 令牌，令牌只保存在这台设备上。');
    } else {
      const rows = [
        srow({ act: 'account', icon: 'link', tone: 'sky', label: 'GitHub 账号', val: MC.settings.account ? '@' + MC.settings.account : '已连接', chev: false }),
        srow({ act: 'sync', icon: 'refresh', tone: 'jade', label: '立即同步', sub: syncText()[0], help: 'sync', chev: false }),
      ];
      rows.push(srow({ act: 'retoken', icon: 'key', tone: 'apricot', label: '更换令牌' }));
      rows.push(srow({ act: 'disconnect', icon: 'unlink', tone: 'danger', label: '断开连接', danger: true, chev: false }));
      gSync = group('同步', rows, '令牌只保存在这台设备上。');
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
        ? srow({ act: 'nsetup', icon: 'cloud', tone: 'sky', label: 'App 关闭时也提醒', val: '已设置' })
        : srow({ act: 'nsetup', icon: 'cloud', tone: 'sky', label: 'App 关闭时也提醒', sub: '点这里一键设置', val: '未设置' }));
      if (S.remoteSetup) nrows.splice(2, 0, srow({ act: 'boost', icon: 'clock', tone: 'lavender', label: '让提醒准时', sub: 'GitHub 定时任务会延迟，用 cron-job.org 每 5 分钟叫醒一次', help: 'boost', chev: false }));
    }
    const gRemind = group('提醒', nrows, notifyHint());
    if (MC.Native.mac) {
      const I = MC.Native.info;
      gWidgets += group('桌面小组件', [
        srow({ act: 'mwidget', icon: 'grid', tone: 'periwinkle', label: '添加桌面小组件', sub: '整月、今日、课表、纪念日', help: 'mwidget', chev: false }),
      ], '菜单栏右上角的日历图标也能随时查看本月和当天的事件。');
      gWidgets += group('Mac App', [
        srow({ act: 'macapp', icon: 'laptop', tone: 'sage', label: 'Mac App', sub: '点一下检查更新', val: `${I.app || ''}（${I.code || 0}）`, chev: false }),
      ], '改网页不需要重新编译，打开就是最新的；只有原生部分（菜单栏、小组件、提醒）改了才需要在 Mac 上重新运行 macos/build.sh。');
    } else if (MC.Native.on) {
      gWidgets += group('桌面小组件', [
        srow({ act: 'pin:month', icon: 'grid', tone: 'periwinkle', label: '整月小组件', sub: '点一下添加到桌面', help: 'nwidget', chev: false }),
        srow({ act: 'pin:today', icon: 'sun', tone: 'apricot', label: '今日小组件', sub: '今天、已逾期和接下来一周', chev: false }),
        srow({ act: 'pin:sched', icon: 'clock', tone: 'teal', label: '课表小组件', sub: '今天的课，正在上的突出显示', chev: false }),
        ...(MC.Native.has('daysWidget') ? [srow({ act: 'pin:days', icon: 'heart', tone: 'rose', label: DT('纪念日小组件'), sub: DT('置顶或最近的日子，以及接下来的几个'), chev: false })] : []),
      ], '也可以长按桌面空白处 → 小组件 → 节律，按住拖到桌面。');
      const up = MC.Native.updateAvailable(), I = MC.Native.info;
      gWidgets += group('安卓 App', [
        srow({ act: 'apk', icon: 'android', tone: 'sage', label: '安卓 App', sub: up ? `有新版本 ${up.name}，点这里下载安装` : '点这里检查 App 更新', val: `${I.app || ''}（${I.code || 0}）`, chev: false }),
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
      srow({ act: 'update', icon: 'refresh', tone: 'lavender', label: '检查更新', sub: `当前版本 ${MC.VERSION}`, chev: false }),
    ]);
    // 按重要程度排：最常来设置的是提醒，其次是显示，同步、小组件和数据放后面
    const h = gRemind + gDisplay + gSync + gWidgets + gData;
    $('#setGroups').innerHTML = h;
    const total = MC.data.events.length, done = MC.data.events.filter(e => e.done).length;
    $('#statLine').innerHTML = `版本 ${MC.VERSION} · 共 ${total} 个事件，已完成 ${done} 个<small class="dbg"${showDbg ? '' : ' hidden'}>${esc(MC.screenInfo || '')}</small>`;
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
    if (act === 'macapp') {
      if (window.MCNative && window.MCNative.checkUpdate) { UI.toast('正在检查 Mac 版更新…'); window.MCNative.checkUpdate(); }
      return;
    }
    if (act === 'apk') {
      UI.toast('正在检查 App 更新…');
      try {
        const up = await MC.Native.checkUpdate(true);
        if (up) {
          if (await UI.confirm(`安卓 App 有新版本 ${up.name}（第 ${up.latest} 版）。现在下载？\n下载完成后点通知栏里的文件安装，数据和设置都会保留。`, { ok: '下载' })) MC.Native.update();
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
      { label: '四象限', value: 'quad', on: (MC.settings.tab3 || 'quad') === 'quad' },
      { label: '课表', value: 'sched', on: MC.settings.tab3 === 'sched' },
      { label: '不显示', value: 'off', on: MC.settings.tab3 === 'off' },
    ], v => { MC.settings.tab3 = v; MC.saveSettings(); applyTab3(); renderSettings(); });
    else if (act === 'connect' || act === 'retoken') connectForm(act === 'retoken');
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
        UI.toast(remote ? '提醒已开启' : '提醒已开启（App 打开时）');
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
        await MC.vault.save(token, '');
        const ok = await MC.sync();
        if (Push.enabled()) await Push.resubscribe();
        renderSettings();
        UI.toast(ok ? (id ? '已连接，并同步了云端数据' : '已连接，云端数据已创建') : (MC.syncState.error || '已连接'));
      },
    });
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
        : `<b style="color:var(--p3)">${no}</b>　<button class="chip-btn glass" data-copy="nreq:${key}">去设置</button>`;
      const when = st.pullAt ? new Date(st.pullAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const mac = MC.Native.mac;
      const sync = !st.token ? (mac ? '未连接 GitHub（只显示这台 Mac 上的数据）' : '未连接 GitHub（只显示这台手机上的数据）')
        : st.pullErr ? `<b style="color:var(--p3)">${esc(st.pullErr)}</b>` : `<b style="color:var(--accent-text)">✓ ${when ? '上次 ' + when : '已连接'}</b>`;
      return {
        title: '提醒权限检查',
        html: `<p class="hint" style="margin:0 2px 14px">${mac ? '提醒由 macOS 按时弹出，退出节律后也会提醒；下面第一项要是 ✓。' : 'App 关着也要准时提醒，下面前三项都要是 ✓。'}</p>
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
    boost: () => {
      const repo = (MC.settings.remoteSetup && MC.settings.remoteSetup.repo) || Push.guessRepo() || '用户名/仓库名';
      const url = `https://api.github.com/repos/${repo}/actions/workflows/reminders.yml/dispatches`;
      return {
        title: '让提醒准时',
        html: `<p class="hint" style="margin:0 2px 14px">GitHub 自带的定时任务对不活跃的仓库会推迟几个小时。用免费的 cron-job.org 每 5 分钟叫醒一次提醒程序，就能准时（一般延迟 1～2 分钟）。只需设置一次。</p>
        <ol class="steps">
          <li><b>生成一个只能触发提醒的令牌</b>：GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token。Expiration 可选 No expiration；Repository access 选 <b>Only select repositories</b> → 选 <code>${esc(repo.split('/')[1] || repo)}</code>；Permissions → Repository permissions → <b>Actions</b> 设为 <b>Read and write</b>，其他不动 → Generate token，复制。</li>
          <li>打开 <a href="https://cron-job.org" target="_blank" rel="noopener">cron-job.org</a>，免费注册并登录 → <b>CREATE CRONJOB</b>。</li>
          <li><b>URL</b> 填：<br><code>${esc(url)}</code></li>
          <li><b>Execution schedule</b> 选 <b>Every 5 minutes</b>。</li>
          <li>切到 <b>ADVANCED</b>：Request method 选 <b>POST</b>；Headers 添加两条：<br><code>Authorization</code> = <code>Bearer 你的令牌</code><br><code>Accept</code> = <code>application/vnd.github+json</code><br>Request body 填：<code>{"ref":"main"}</code></li>
          <li>点 <b>CREATE</b>（可先点 TEST RUN，返回 204 就是成功）。</li>
        </ol>
        <div class="help-copy">
          <button class="chip-btn glass" data-copy="boostUrl">复制 URL</button>
          <button class="chip-btn glass" data-copy="boostAccept">复制 Accept 值</button>
          <button class="chip-btn glass" data-copy="boostBody">复制 Request body</button>
        </div>
        <div class="help-tip">这个令牌只能触发这个仓库的提醒程序，碰不到其他内容，放在 cron-job.org 上也比较安全。设置好后，GitHub 仓库的 Actions 页面会看到每隔约 5 分钟就有一次「节律提醒」的运行记录。</div>`,
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
    else if (k === 'boostUrl') copy(HELP.boost()._url, '已复制 URL');
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
  if (MC.session.token) MC.sync().then(() => MC.extendSeries());
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
    else if (k === 't') { e.preventDefault(); if (page !== 'cal') showPage('cal'); if (document.body.dataset.kind !== 'days') $('#btnToday').click(); }
    else if (page === 'cal' && document.body.dataset.kind !== 'days' && { y: 1, m: 1, w: 1 }[k]) { e.preventDefault(); MC.Cal.setView({ y: 'year', m: 'month', w: 'week' }[k]); }
    else if (/^[1-5]$/.test(k)) { const b = tabs()[Number(k) - 1]; if (b) { e.preventDefault(); showPage(b.dataset.page); } }
  });

  // 安卓 App：提示更新（Mac App 在本机编译，不提示）
  if (MC.Native.on && !MC.Native.mac) {
    if (MC.Native.outdated) setTimeout(() => UI.toast('这个版本的安卓 App 太旧了，请到 设置 → 安卓 App 更新'), 2500);
    setTimeout(() => MC.Native.checkUpdate(false).then(up => {
      if (!up || sessionStorage.getItem('mcal.apkTold') === String(up.latest)) return;
      sessionStorage.setItem('mcal.apkTold', String(up.latest));
      UI.toast(`安卓 App 有新版本 ${up.name}，到 设置 → 安卓 App 下载`);
    }).catch(() => {}), 4000);
  }
})();
