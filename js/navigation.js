/* Cadence · shared navigation and Android-first interaction. */
(function () {
  const dock2 = document.getElementById('dock2');
  if (!dock2) return;
  const label = document.getElementById('bubbleTodayLabel');
  const todayButton = document.getElementById('bubbleToday');
  const todayCaption = document.getElementById('bubbleTodayCaption');
  const logo = document.getElementById('bubbleLogo');
  const calendarAction = document.getElementById('fanCal');
  const scrim = document.getElementById('navScrim');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pager = document.getElementById('pager');
  const dots = [...pager.querySelectorAll('i')];
  const menu = document.getElementById('podMenu');
  const body = document.body;
  let open = false;

  const actions = [...menu.querySelectorAll('.fan')];
  function setMenu(value, restoreFocus = false) {
    open = value;
    menu.classList.toggle('open', open);
    logo.setAttribute('aria-expanded', String(open));
    scrim.hidden = !open;
    actions.forEach(button => {
      const available = open && !button.hidden;
      button.tabIndex = available ? 0 : -1;
      button.inert = !available;
      button.setAttribute('aria-hidden', String(!available));
    });
    if (restoreFocus) logo.focus({ preventScroll: true });
  }
  const closeMenu = (restoreFocus = false) => setMenu(false, restoreFocus);
  const openMenu = () => { MC.UI.haptic(); setMenu(true); };
  MC.Navigation = { isOpen: () => open, close: closeMenu };
  scrim.addEventListener('click', () => closeMenu(true));

  let lastDragEnd = 0;   // 刚拖完页面的那一下，不要顺手把菜单点开
  document.getElementById('bubbleLogo').addEventListener('click', e => {
    e.stopPropagation();
    if (Date.now() - lastDragEnd < 320) return;
    if (open) closeMenu(); else openMenu();
  });

  // 页面变化时同步：气泡文字、分页点、显隐
  function sync() {
    const pg = body.dataset.page || 'cal';
    const days = body.dataset.kind === 'days';
    dock2.classList.toggle('hide', days);
    if (days) { closeMenu(); return; }

    const two = pg === 'cal' || pg === 'sched';
    pager.hidden = !two;
    calendarAction.hidden = two;
    todayCaption.textContent = MC.t(pg === 'today' ? '日历' : '今日');
    todayButton.setAttribute('aria-label', MC.t(pg === 'today' ? '回到日历' : '今日'));
    todayButton.setAttribute('aria-pressed', String(pg === 'today'));
    closeMenu();
    dots.forEach((d, i) => d.classList.toggle('on', i === (pg === 'sched' ? 1 : 0)));
  }
  new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ['data-page', 'data-kind'] });
  sync();

  // 状态栏跟着当前页的底色走（只在原生壳里有效）
  const hex2 = v => {
    const m = String(v).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.05) return null;   // 全透明：别当成黑色传给原生
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  };
  function syncChrome() {
    const N = window.MC && MC.Native;
    if (!N || !N.on || !N.has || !N.has('chrome')) return;
    const el = document.querySelector('.page.active');
    let c = el ? hex2(getComputedStyle(el).backgroundColor) : null;
    if (!c) c = hex2(getComputedStyle(document.body).backgroundColor);
    if (!c) c = hex2(getComputedStyle(document.documentElement).backgroundColor);
    if (c) N.chrome(c);
  }
  new MutationObserver(syncChrome).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(syncChrome).observe(body, { attributes: true, attributeFilter: ['data-page'] });
  setTimeout(syncChrome, 300);

  // 分页点：静止一会儿就淡下去，一碰就回来
  let idleTimer = 0;
  const wake = () => { pager.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => pager.classList.add('idle'), 1400); };
  ['touchstart', 'touchmove', 'pointerdown'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));
  wake();

  function goPage(p) { MC.App.showPage(p); }

  // Stable digits and a readable label; refresh only when the displayed minute changes.
  function tickClock() {
    const d = new Date(), h12 = MC.use12();
    const h = h12 ? (d.getHours() % 12 || 12) : String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const value = `${h}:${m}`;
    if (label.textContent !== value) label.textContent = value;
    const period = document.getElementById('bubblePeriod');
    period.hidden = !h12;
    const ap = d.getHours() >= 12 ? 'PM' : 'AM';
    if (period.textContent !== ap) period.textContent = ap;
  }
  tickClock();
  setInterval(tickClock, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

  // One entrance animation, cancelled immediately on any subsequent navigation.
  let entrance = null;
  document.addEventListener('mc:pagechange', () => {
    if (entrance) { entrance.cancel(); entrance = null; }
    sync();
  });
  todayButton.addEventListener('click', () => {
    const to = body.dataset.page === 'today' ? 'cal' : 'today';
    closeMenu();
    MC.UI.haptic();
    goPage(to);
    if (reducedMotion.matches) return;
    const target = document.getElementById('page-' + to);
    const animation = target.animate([
      { opacity: .35, transform: 'translateY(12px) scale(.99)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    entrance = animation;
    animation.onfinish = () => { if (entrance === animation) entrance = null; };
  });

  document.getElementById('fanSet').addEventListener('click', () => {
    closeMenu();
    MC.UI.haptic();
    goPage('set');
  });
  calendarAction.addEventListener('click', () => { closeMenu(); MC.UI.haptic(); goPage('cal'); });
  const backBtn = document.getElementById('backToCal');
  if (backBtn) backBtn.addEventListener('click', () => goPage('cal'));
  document.getElementById('fanAdd').addEventListener('click', () => {
    closeMenu();
    const f = document.getElementById('fab');
    if (f) f.click();
  });
  document.addEventListener('click', e => { if (open && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.preventDefault(); closeMenu(true); } });

  // 日历 ←→ 日程：跟手拖拽切页（拖动过程中另一页就在旁边）
  const pages = { cal: document.getElementById('page-cal'), sched: document.getElementById('page-sched') };
  let pendingCancel = null;
  let pendingFinish = null;   // 上一次切换的收尾还没跑完时，新的滑动要先把它落地
  // 这两页现在靠滑动切换，不要每次进入都播一次淡入（会闪）
  Object.values(pages).forEach(el => el && el.classList.add('no-in'));
  let dg = null;
  function cancelSwipe() {
    if (pendingCancel) pendingCancel();
    pendingFinish = pendingCancel = null;
    dg = null;
    Object.values(pages).forEach(el => {
      el.classList.remove('drag');
      el.style.transition = ''; el.style.transform = ''; el.style.display = '';
    });
  }
  document.addEventListener('mc:beforepagechange', cancelSwipe);

  const blockedBy = t => !!(t && t.closest && t.closest('.drawer, .sheet, .drawer-scrim, .dock2, .tabbar, .preview, .wkpick, .popover, .nav-scrim, button, input, textarea, select'));

  document.addEventListener('touchstart', e => {
    if (pendingFinish) { pendingFinish(); }        // 上一次还没收完尾就手快又滑：先立刻落地
    if (e.touches.length !== 1 || dg) { cancelSwipe(); return; }
    const pg = body.dataset.page;
    if (!pages[pg]) return;
    if (blockedBy(e.target)) return;
    if (e.touches[0].clientX < 26) return;          // 左边缘留给抽屉
    closeMenu();
    dg = { pg, x0: e.touches[0].clientX, y0: e.touches[0].clientY, t0: performance.now(), active: false };
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', e => {
    if (!dg) return;
    if (e.touches.length !== 1) { cancelSwipe(); return; }
    const t = e.touches[0], dx = t.clientX - dg.x0, dy = t.clientY - dg.y0;
    if (!dg.active) {
      if (Math.abs(dx) < 12) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.25) { dg = null; return; }
      // 只有「日历往左」「日程往右」才切，反方向不做任何事
      if (dg.pg === 'cal' && dx > 0) { dg = null; return; }
      if (dg.pg === 'sched' && dx < 0) { dg = null; return; }
      const to = dg.pg === 'cal' ? 'sched' : 'cal';
      if (!pages[to]) { dg = null; return; }
      dg.active = true; dg.to = to; dg.W = pages[dg.pg].clientWidth || 1;
      pager.classList.add('idle');
      pages[dg.pg].classList.add('drag');
      pages[to].classList.add('drag');
      pages[dg.pg].style.transition = 'none';
      pages[to].style.transition = 'none';
      pages[to].style.transform = `translate3d(${to === 'sched' ? 100 : -100}%,0,0)`;   // 用百分比，边缘严丝合缝
      if (to === 'sched') MC.Sched.render();
    }
    e.preventDefault();
    const pct = dg.to === 'sched' ? 100 : -100;
    pages[dg.pg].style.transform = `translate3d(${dx}px,0,0)`;
    pages[dg.to].style.transform = `translate3d(calc(${pct}% + ${dx}px),0,0)`;
  }, { capture: true, passive: false });

  const endDrag = e => {
    if (!dg) return;
    const d = dg; dg = null;
    if (!d.active) return;
    lastDragEnd = Date.now();     // 只有真拖动了才拦 logo 点击
    const t = e.changedTouches && e.changedTouches[0];
    const dx = t ? t.clientX - d.x0 : 0;
    // 快滑（甩）：速度够快、距离过了最低门槛就走；慢滑：必须拖过 1/4 屏才走，否则轻轻回去
    const dt = Math.max(1, performance.now() - d.t0);
    const v = Math.abs(dx) / dt;                       // px/ms
    const far = Math.abs(dx) > d.W * 0.25;
    const flick = v > 0.55 && Math.abs(dx) > 36;
    const go = e.type !== 'touchcancel' && (far || flick);
    const sign = d.to === 'sched' ? 1 : -1;
    const cur = pages[d.pg], nxt = pages[d.to];
    const ease = reducedMotion.matches ? 'none' : go ? 'transform .38s cubic-bezier(.2,.85,.25,1)' : 'transform .58s cubic-bezier(.16,.78,.26,1)';
    cur.style.transition = ease; nxt.style.transition = ease;
    if (!go) {
      // 另一页本来就在屏幕外：直接收走，避免它跟着动画又“闪”一下
      nxt.style.transition = 'none';
      nxt.style.transform = `translate3d(${sign * 100}%,0,0)`;
      requestAnimationFrame(() => { nxt.classList.remove('drag'); });
    }
    cur.style.transform = `translate3d(${go ? -sign * 100 : 0}%,0,0)`;
    nxt.style.transform = `translate3d(${go ? 0 : sign * 100}%,0,0)`;

    // 等动画真的播完再收尾，固定 250ms 会在动画中途把页面抽掉，看起来像卡一下
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pendingFinish = pendingCancel = null;
      nxt.removeEventListener('transitionend', onEnd);
      if (go) {
        cur.style.display = 'none';
        cur.classList.remove('drag');
        cur.style.transition = ''; cur.style.transform = '';
        nxt.style.transition = ''; nxt.style.transform = '';
        MC.App.showPage(d.to);           // 加 .active（.drag 还在，画面不闪）
        nxt.classList.remove('drag');
        requestAnimationFrame(() => { cur.style.display = ''; });
      } else {
        cur.style.transition = ''; cur.style.transform = '';
        nxt.style.transition = ''; nxt.style.transform = '';
        nxt.classList.remove('drag');
        cur.classList.remove('drag');
      }
    };
    const onEnd = e => { if (e.target === nxt && e.propertyName === 'transform') finish(); };
    pendingFinish = finish;
    pendingCancel = () => { done = true; nxt.removeEventListener('transitionend', onEnd); };
    nxt.addEventListener('transitionend', onEnd);
    setTimeout(finish, reducedMotion.matches ? 0 : go ? 520 : 700);
    pager.classList.remove('idle');
  };
  document.addEventListener('touchend', endDrag, { capture: true, passive: true });
  document.addEventListener('touchcancel', endDrag, { capture: true, passive: true });
})();
