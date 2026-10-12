/* 月历 · 日历页：月（逐周滚动，固定 6 行）/ 周 / 年视图 + 当日预览 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Cal = (MC.Cal = {});

  const vp = $('#calViewport'), track = $('#calTrack'), body = $('#calBody'), preview = $('#preview');
  const BUF = 12; // 月视图上下各预渲染 12 周，快速甩动也不会滑到尽头
  const now0 = new Date();
  let view = ['year', 'month', 'week'].includes(MC.settings.view) ? MC.settings.view : 'month';
  let anchor = MC.weekStartOf(new Date(now0.getFullYear(), now0.getMonth(), 1)); // 月视图最上面一行的周起始日
  let weekAnchor = MC.weekStartOf(now0);
  let year = now0.getFullYear();
  let selected = MC.todayStr();
  let previewOpen = false;
  let W = 0, H = 0, rowH = 0, maxChips = 2, withMore = 1, animating = false;
  let focus = { y: now0.getFullYear(), m: now0.getMonth() };

  Cal.selected = () => selected;
  Cal.view = () => view;

  // ---------- 尺寸 ----------
  function measure() {
    W = vp.clientWidth; H = vp.clientHeight;
    rowH = H / 6;
    const head = body.classList.contains('previewing') ? 34 + 3 : 39 + 3; // 数字区 + 底部留白
    maxChips = Math.max(1, Math.floor((rowH - head + 2) / 17));
    withMore = Math.floor((rowH - head - 12 + 2) / 17);
  }
  function setT(x, y) { track.style.transform = `translate3d(${x}px,${y}px,0)`; }

  // ---------- 月视图 ----------
  let scrollY = 0; // 相对 anchor 的滚动量（像素，正数 = 往后的周）
  function computeFocus() {
    const counts = new Map();
    const top = MC.addDays(anchor, 7 * Math.round(scrollY / (rowH || 1)));
    for (let i = 0; i < 42; i++) {
      const d = MC.addDays(top, i), k = d.getFullYear() * 12 + d.getMonth();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = null, bc = -1;
    for (const [k, c] of counts) if (c > bc) { bc = c; best = k; }
    focus = { y: Math.floor(best / 12), m: best % 12 };
  }
  function chipsHTML(evs) {
    if (!evs.length) return '';
    // 放得下就全显示；放不下时留一行显示「+n」，空间太小则只显示最重要的一条
    const fit = evs.length <= maxChips ? evs.length : Math.max(1, withMore);
    let h = '';
    for (let k = 0; k < fit; k++) {
      const e = evs[k];
      h += `<div class="chip${e.done ? ' done' : ''}" style="--c:${MC.priOf(e.priority).color}">${esc(e.title)}</div>`;
    }
    if (fit < evs.length && withMore >= 1) h += `<div class="more">+${evs.length - fit}</div>`;
    return h;
  }
  function renderMonth() {
    computeFocus();
    const fk = focus.y * 12 + focus.m, t = MC.todayStr();
    const start = MC.addDays(anchor, -BUF * 7);
    let h = '';
    for (let r = 0; r < 6 + BUF * 2; r++) {
      h += `<div class="wrow" style="height:${rowH}px">`;
      for (let c = 0; c < 7; c++) {
        const d = MC.addDays(start, r * 7 + c), ds = MC.ymd(d);
        const cls = ['cell'];
        if (d.getFullYear() * 12 + d.getMonth() !== fk) cls.push('out');
        if (ds === t) cls.push('today');
        if (ds === selected) cls.push('sel');
        if (d.getDate() === 1) cls.push('first');
        h += `<div class="${cls.join(' ')}" data-date="${ds}">${d.getDate() === 1 ? `<span class="mlabel">${d.getMonth() + 1}月</span>` : ''}<div class="num">${d.getDate()}</div><div class="chips">${chipsHTML(MC.eventsOn(ds))}</div></div>`;
      }
      h += '</div>';
    }
    track.style.cssText = '';
    track.innerHTML = h;
    setT(0, -(BUF * rowH + scrollY));
    monthTitle();
  }
  function monthTitle() {
    $('#calTitle').textContent = `${focus.m + 1}月`;
    const prefix = `${focus.y}-${MC.pad(focus.m + 1)}-`;
    let total = 0, done = 0;
    for (const [k, arr] of MC.byDate) if (k.startsWith(prefix)) { total += arr.length; done += arr.filter(e => e.done).length; }
    $('#calSub').textContent = total ? `${focus.y} · 完成 ${done}/${total}` : String(focus.y);
  }
  // ---------- 物理滚动：弹簧动画，接住手指松开时的速度 ----------
  let raf = null;
  function stopAnim() { if (raf) cancelAnimationFrame(raf); raf = null; animating = false; }
  function spring(from, to, v0, onUpdate, onDone) {
    stopAnim();
    animating = true;
    const w = 0.0165;                // 固有频率（rad/ms），临界阻尼：不回弹、不拖沓
    const x0 = from - to, t0 = performance.now();
    const step = now => {
      const t = now - t0;
      const x = (x0 + (v0 + w * x0) * t) * Math.exp(-w * t);
      if (Math.abs(x) < 0.35 && t > 40) { onUpdate(to); raf = null; animating = false; onDone && onDone(); return; }
      onUpdate(to + x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  let lastFocusKey = '';
  function applyMonth() {
    setT(0, -(BUF * rowH + scrollY));
    const before = focus.y * 12 + focus.m;
    computeFocus();
    if (focus.y * 12 + focus.m !== before || lastFocusKey === '') { lastFocusKey = 'x'; monthTitle(); }
  }
  // 滚得太远时把 anchor 往前/后挪，画面不动，保证两侧始终有足够的预渲染行
  function recenter(margin = 4) {
    const k = Math.trunc(scrollY / rowH);
    if (Math.abs(k) < BUF - margin) return 0;
    anchor = MC.addDays(anchor, 7 * k);
    scrollY -= k * rowH;
    renderMonth();
    return k * rowH;
  }
  function settle() {
    const k = Math.round(scrollY / rowH);
    anchor = MC.addDays(anchor, 7 * k);
    scrollY = 0;
    renderMonth();
  }
  function snapMonth(v) { // v：滚动速度（px/ms）
    recenter(1);
    const proj = scrollY + v * 230;                      // 按速度预估惯性距离
    let n = Math.round(proj / rowH);
    const cur = scrollY / rowH;
    if (n === Math.round(cur) && Math.abs(v) > 0.25) n = v > 0 ? Math.floor(cur) + 1 : Math.ceil(cur) - 1;
    n = Math.max(-(BUF - 1), Math.min(BUF - 1, n));
    spring(scrollY, n * rowH, v, y => { scrollY = y; applyMonth(); }, settle);
  }
  function shiftRows(n) {
    recenter(1);
    const target = Math.max(-(BUF - 1), Math.min(BUF - 1, Math.round(scrollY / rowH) + n));
    spring(scrollY, target * rowH, 0, y => { scrollY = y; applyMonth(); }, settle);
  }
  function jumpToMonth(y, m) {
    const target = MC.weekStartOf(new Date(y, m, 1));
    const n = Math.round((target - MC.addDays(anchor, 7 * Math.round(scrollY / rowH))) / (7 * 864e5));
    if (n && Math.abs(n) < BUF - 1) shiftRows(n);
    else { stopAnim(); anchor = target; scrollY = 0; renderMonth(); }
  }

  // ---------- 周视图 ----------
  function weekPanelHTML(ws, left) {
    const t = MC.todayStr();
    let h = `<div class="wpanel" style="left:${left}px;width:${W}px">`;
    for (let i = 0; i < 7; i++) {
      const d = MC.addDays(ws, i), ds = MC.ymd(d);
      const cls = ['wcol'];
      if (ds === t) cls.push('today');
      if (ds === selected) cls.push('sel');
      const chips = MC.eventsOn(ds).map(e =>
        `<div class="chip${e.done ? ' done' : ''}" style="--c:${MC.priOf(e.priority).color}">${esc(e.title)}${e.time ? `<small>${esc(MC.timeLabel(e))}</small>` : ''}</div>`).join('');
      h += `<div class="${cls.join(' ')}" data-date="${ds}"><div class="wnum">${d.getDate()}</div>${chips}</div>`;
    }
    return h + '</div>';
  }
  function renderWeek() {
    track.style.cssText = `position:relative;height:100%`;
    track.innerHTML = weekPanelHTML(MC.addDays(weekAnchor, -7), 0) + weekPanelHTML(weekAnchor, W) + weekPanelHTML(MC.addDays(weekAnchor, 7), 2 * W);
    setT(-W, 0);
    const mid = MC.addDays(weekAnchor, 3), end = MC.addDays(weekAnchor, 6);
    $('#calTitle').textContent = `${mid.getMonth() + 1}月`;
    $('#calSub').textContent = `${weekAnchor.getMonth() + 1}月${weekAnchor.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`;
  }

  // ---------- 年视图 ----------
  function yearPanelHTML(y, top) {
    const now = new Date(), t = MC.todayStr();
    let h = `<div class="ypanel" style="top:${top}px">`;
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1);
      const off = (first.getDay() - MC.settings.weekStart + 7) % 7;
      let g = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(y, m, 1 - off + i), ds = MC.ymd(d);
        if (d.getMonth() !== m) { g += '<div class="md out"></div>'; continue; }
        const evs = MC.eventsOn(ds);
        let dot = '';
        if (evs.length) {
          const open = evs.filter(e => !e.done);
          const top = (open.length ? open : evs)[0];
          dot = `<i class="${open.length ? '' : 'faded'}" style="--c:${MC.priOf(top.priority).color}"></i>`;
        }
        g += `<div class="md${ds === t ? ' today' : ''}"><span>${d.getDate()}</span>${dot}</div>`;
      }
      const cur = y === now.getFullYear() && m === now.getMonth();
      h += `<div class="mini${cur ? ' cur' : ''}" data-y="${y}" data-m="${m}"><h4>${m + 1}月</h4><div class="mini-grid">${g}</div></div>`;
    }
    return h + '</div>';
  }
  function renderYear() {
    track.style.cssText = `position:relative;height:100%`;
    track.innerHTML = yearPanelHTML(year - 1, 0) + yearPanelHTML(year, H) + yearPanelHTML(year + 1, 2 * H);
    setT(0, -H);
    $('#calTitle').textContent = `${year}年`;
    const prefix = `${year}-`;
    let total = 0, done = 0;
    for (const [k, arr] of MC.byDate) if (k.startsWith(prefix)) { total += arr.length; done += arr.filter(e => e.done).length; }
    $('#calSub').textContent = total ? `完成 ${done}/${total}` : '全年';
  }

  // 周 / 年：三屏翻页（弹簧）
  let pagePos = 0;
  function setPage(p) { pagePos = p; if (view === 'week') setT(-W + p, 0); else setT(0, -H + p); }
  // 按当前位置 + 惯性预估落点：往回拉就回到原来那一周，往前过了约三分之一（或快速一甩）才翻页
  function pageTarget(pos, v, size) {
    const proj = pos + v * 230;
    if (proj <= -size * 0.35) return 1;
    if (proj >= size * 0.35) return -1;
    return 0;
  }
  function page(delta, v = 0) {
    const size = view === 'week' ? W : H;
    spring(pagePos, -delta * size, v, setPage, () => {
      if (delta) { if (view === 'week') weekAnchor = MC.addDays(weekAnchor, 7 * delta); else year += delta; }
      pagePos = 0;
      track.style.transition = 'none';
      render();
    });
  }

  // ---------- 渲染入口 ----------
  function renderWeekdays() {
    const el = $('#weekdays');
    el.classList.toggle('hide', view === 'year');
    let h = '';
    for (let i = 0; i < 7; i++) h += `<div>${MC.WD[(i + MC.settings.weekStart) % 7]}</div>`;
    el.innerHTML = h;
  }
  function render() {
    $('#viewLabel').textContent = { year: '年', month: '月', week: '周' }[view];
    $('#todayNum').textContent = new Date().getDate();
    body.classList.toggle('previewing', previewOpen && view !== 'year');
    renderWeekdays();
    measure();
    if (view === 'month') renderMonth();
    else if (view === 'week') renderWeek();
    else renderYear();
    if (previewOpen && view !== 'year') renderPreview();
  }
  Cal.render = render;
  Cal.refresh = () => { if (!animating) render(); };

  // ---------- 当日预览 ----------
  function renderPreview() {
    const d = MC.parse(selected);
    const evs = MC.eventsOn(selected);
    const done = evs.filter(e => e.done).length;
    preview.innerHTML = `
      <div class="pv-head">
        <div><h3>${d.getMonth() + 1}月${d.getDate()}日 周${MC.WD[d.getDay()]}</h3>
        <p>${MC.relLabel(selected)}${evs.length ? ` · ${evs.length} 项，已完成 ${done}` : ''}</p></div>
        <button class="round glass" id="pvClose" aria-label="收起">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" stroke-width="2.4"/></svg>
        </button>
      </div>
      ${evs.length
        ? `<ul class="pv-list">${evs.map(e => UI.itemHTML(e)).join('')}</ul>`
        : `<div class="pv-empty">暂无安排<small>点右下角 ＋ 添加</small></div>`}`;
    $('#pvClose').onclick = () => { previewOpen = false; render(); };
  }
  UI.bindList(preview);

  function select(ds) {
    if (ds === selected && previewOpen) { previewOpen = false; render(); return; }
    selected = ds;
    if (!previewOpen) { previewOpen = true; render(); return; }
    track.querySelectorAll('.sel').forEach(c => c.classList.remove('sel'));
    track.querySelectorAll(`[data-date="${ds}"]`).forEach(c => c.classList.add('sel'));
    renderPreview();
  }
  Cal.select = ds => { selected = ds; };

  // ---------- 视图切换（菜单或双指缩放） ----------
  const LEVELS = ['year', 'month', 'week'];
  const zoomEl = $('#calZoom');
  function resetZoomStyle() { zoomEl.style.transition = 'none'; zoomEl.style.transform = ''; zoomEl.style.opacity = ''; }
  function playZoom(dir) {
    zoomEl.classList.remove('zoom-in', 'zoom-out');
    void zoomEl.offsetWidth;
    zoomEl.classList.add(dir === 'in' ? 'zoom-in' : 'zoom-out');
  }
  zoomEl.addEventListener('animationend', () => zoomEl.classList.remove('zoom-in', 'zoom-out'));
  // target：{ y, m }（年视图里的某个月）或 { date }（月 / 周视图里的某一天）
  function setView(v, target) {
    if (v === view) { resetZoomStyle(); return; }
    const dir = LEVELS.indexOf(v) > LEVELS.indexOf(view) ? 'in' : 'out';
    const sd = MC.parse((target && target.date) || selected);
    if (v === 'month') {
      let ref;
      if (view === 'year') ref = target && target.m != null ? new Date(target.y, target.m, 1) : new Date(year, sd.getFullYear() === year ? sd.getMonth() : 0, 1);
      else { const mid = MC.addDays(weekAnchor, 3); ref = new Date(mid.getFullYear(), mid.getMonth(), 1); }
      anchor = MC.weekStartOf(ref); scrollY = 0;
    }
    if (v === 'week') weekAnchor = MC.weekStartOf(target && target.date ? MC.parse(target.date) : sd);
    if (v === 'year') year = view === 'month' ? focus.y : MC.addDays(weekAnchor, 3).getFullYear();
    stopAnim(); pagePos = 0;
    view = v;
    MC.settings.view = v; MC.saveSettings();
    resetZoomStyle();
    render();
    playZoom(dir);
  }
  Cal.setView = setView;
  Cal.realign = () => {
    stopAnim(); scrollY = 0; pagePos = 0;
    anchor = MC.weekStartOf(new Date(focus.y, focus.m, 1));
    weekAnchor = MC.weekStartOf(MC.parse(selected));
    render();
  };
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const mini = el.closest('.mini');
    if (mini) return { y: Number(mini.dataset.y), m: Number(mini.dataset.m) };
    const c = el.closest('[data-date]');
    return c ? { date: c.dataset.date } : null;
  }
  function zoomStep(dir, target) {
    const i = LEVELS.indexOf(view) + (dir === 'in' ? 1 : -1);
    if (i < 0 || i >= LEVELS.length) { zoomEl.style.transition = 'transform .3s var(--ease-spring), opacity .2s'; zoomEl.style.transform = ''; zoomEl.style.opacity = ''; return; }
    setView(LEVELS[i], target);
  }

  $('#btnView').onclick = () => UI.menu($('#btnView'), [
    { label: '年视图', value: 'year', on: view === 'year' },
    { label: '月视图', value: 'month', on: view === 'month' },
    { label: '周视图', value: 'week', on: view === 'week' },
  ], v => setView(v));

  $('#btnPrev').onclick = () => {
    if (animating) return;
    if (view === 'month') jumpToMonth(focus.y, focus.m - 1); else page(-1);
  };
  $('#btnNext').onclick = () => {
    if (animating) return;
    if (view === 'month') jumpToMonth(focus.y, focus.m + 1); else page(1);
  };
  $('#btnToday').onclick = () => {
    const n = new Date();
    selected = MC.todayStr();
    stopAnim(); scrollY = 0; pagePos = 0;
    anchor = MC.weekStartOf(new Date(n.getFullYear(), n.getMonth(), 1));
    weekAnchor = MC.weekStartOf(n);
    year = n.getFullYear();
    render();
  };

  // ---------- 手势 ----------
  let sx = 0, sy = 0, dx = 0, dy = 0, tracking = false, dragging = false, suppress = false, base = 0, caught = false;
  let samples = [];
  let pinch = null;
  const tdist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const velocity = () => { // 只看松手前 100ms 的速度
    const now = performance.now();
    const rec = samples.filter(p => now - p[0] < 100);
    if (rec.length < 2) return 0;
    const a = rec[0], b = rec[rec.length - 1];
    const v = (b[1] - a[1]) / Math.max(8, b[0] - a[0]);
    return Math.max(-6, Math.min(6, v));
  };
  vp.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      stopAnim();
      if (view === 'month') settle(); else { pagePos = 0; render(); }
      tracking = false; dragging = false;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const r = vp.getBoundingClientRect();
      pinch = { d0: tdist(e.touches), s: 1, target: targetAt(cx, cy) };
      zoomEl.style.transition = 'none';
      zoomEl.style.transformOrigin = `${cx - r.left}px ${cy - r.top}px`;
      return;
    }
    if (e.touches.length > 1 || pinch) return;
    caught = animating;            // 滚动中按住 = 停下，不算点击
    stopAnim();
    tracking = true; dragging = false; dx = dy = 0;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    base = view === 'month' ? scrollY : pagePos;
    samples = [[performance.now(), view === 'week' ? sx : sy]];
  }, { passive: true });
  vp.addEventListener('touchmove', e => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      pinch.s = Math.max(.55, Math.min(1.7, tdist(e.touches) / pinch.d0));
      zoomEl.style.transform = `scale(${pinch.s})`;
      zoomEl.style.opacity = String(1 - Math.min(.45, Math.abs(pinch.s - 1) * .9));
      return;
    }
    if (!tracking) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    dx = x - sx; dy = y - sy;
    const horiz = view === 'week';
    samples.push([performance.now(), horiz ? x : y]);
    if (samples.length > 12) samples.shift();
    if (!dragging) {
      const main = horiz ? dx : dy, cross = horiz ? dy : dx;
      if ((Math.abs(main) > 6 && Math.abs(main) > Math.abs(cross)) || caught) { dragging = true; track.style.transition = 'none'; }
      else return;
    }
    e.preventDefault();
    if (view === 'month') {
      scrollY = base - dy;
      const shift = recenter(4);
      if (shift) base -= shift;
      applyMonth();
    } else {
      const size = horiz ? W : H, d = horiz ? dx : dy;
      setPage(Math.max(-size, Math.min(size, base + d)));
    }
  }, { passive: false });
  const end = e => {
    if (pinch) {
      if (e && e.touches && e.touches.length >= 2) return;
      const { s: sc, target } = pinch;
      pinch = null;
      suppress = true; setTimeout(() => (suppress = false), 120);
      if (sc < .82) zoomStep('out', target);
      else if (sc > 1.22) zoomStep('in', target);
      else { zoomEl.style.transition = 'transform .3s var(--ease-spring), opacity .2s'; zoomEl.style.transform = ''; zoomEl.style.opacity = ''; }
      return;
    }
    if (!tracking) return;
    tracking = false;
    if (!dragging) {
      if (caught && view === 'month') { suppress = true; setTimeout(() => (suppress = false), 80); snapMonth(0); }
      else if (caught) { suppress = true; setTimeout(() => (suppress = false), 80); page(pageTarget(pagePos, 0, view === 'week' ? W : H)); }
      return;
    }
    suppress = true; setTimeout(() => (suppress = false), 80);
    const v = velocity(); // 手指速度（px/ms）
    if (view === 'month') snapMonth(-v);
    else {
      const size = view === 'week' ? W : H;
      page(pageTarget(pagePos, v, size), v);
    }
  };
  ['gesturestart', 'gesturechange'].forEach(t => vp.addEventListener(t, e => e.preventDefault()));
  vp.addEventListener('touchend', end);
  vp.addEventListener('touchcancel', end);

  // 触控板 / 鼠标滚轮：月视图跟手滚动，停下后对齐整行
  let wAcc = 0, wLock = false, wTimer = null;
  let zAcc = 0, zLock = false;
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey) { // 触控板双指缩放
      if (zLock) return;
      zAcc += e.deltaY;
      if (Math.abs(zAcc) > 24) {
        zLock = true; setTimeout(() => (zLock = false), 600);
        zoomStep(zAcc > 0 ? 'out' : 'in', targetAt(e.clientX, e.clientY));
        zAcc = 0;
      }
      return;
    }
    if (view === 'month') {
      stopAnim();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rowH * 6 : 1;
      scrollY += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      recenter(4);
      applyMonth();
      clearTimeout(wTimer);
      wTimer = setTimeout(() => snapMonth(0), 120);
      return;
    }
    if (animating || wLock) return;
    wAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wAcc) < 50) return;
    const dir = wAcc > 0 ? 1 : -1;
    wAcc = 0; wLock = true;
    setTimeout(() => (wLock = false), 480);
    page(dir);
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (!$('#page-cal').classList.contains('active') || UI.anyOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); view === 'month' ? shiftRows(1) : page(1); }
    if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); view === 'month' ? shiftRows(-1) : page(-1); }
  });

  vp.addEventListener('click', e => {
    if (suppress || animating) return;
    const mini = e.target.closest('.mini');
    if (mini) {
      setView('month', { y: Number(mini.dataset.y), m: Number(mini.dataset.m) });
      return;
    }
    const cell = e.target.closest('[data-date]');
    if (cell) select(cell.dataset.date);
  });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ($('#page-cal').classList.contains('active')) render(); }, 120); });
})();
