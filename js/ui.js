/* 月历 · 通用界面部件 */
(() => {
  'use strict';
  const MC = window.MC;
  const UI = (MC.UI = {});
  const $ = (UI.$ = s => document.querySelector(s));
  const esc = MC.esc;

  // ---------- 提示 ----------
  // UI.toast(msg, { action: '撤销', onAction }) 带一个按钮；有按钮时多停留一会儿
  let toastTimer, toastAct = null;
  UI.toast = (msg, opts = {}) => {
    const t = $('#toast');
    toastAct = opts.onAction || null;
    t.innerHTML = `<span>${esc(String(msg))}</span>` + (toastAct ? `<button class="toast-act" type="button">${esc(opts.action || '撤销')}</button>` : '');
    t.classList.toggle('has-act', !!toastAct);
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(UI.hideToast, opts.ms || (toastAct ? 4500 : 2200));
  };
  UI.hideToast = () => { $('#toast').classList.remove('show', 'has-act'); toastAct = null; };
  $('#toast').addEventListener('click', e => {
    if (!e.target.closest('.toast-act') || !toastAct) return;
    const fn = toastAct; UI.hideToast(); fn();
  });
  // 撤销：做完一件不好反悔的事（删除、批量改日期）后显示「撤销」
  UI.undoable = (msg, undo, done = '已撤销') => UI.toast(msg, { onAction: () => { undo(); UI.toast(done); } });

  // ---------- 确认框（替代系统 confirm：样式一致，安卓不再显示网址标题）----------
  // UI.confirm(文字, { ok: '删除', danger: true }) → Promise<boolean>
  let cfm = null;
  UI.confirmOpen = () => !!(cfm && cfm.el.classList.contains('show'));
  UI.closeConfirm = v => { // 不传值 = 点外面 / Esc / 返回键，按 dismiss 处理（默认等于取消）
    if (!cfm || !cfm.res) return;
    if (v === undefined) v = cfm.dismiss;
    const r = cfm.res; cfm.res = null;
    cfm.el.classList.remove('show'); cfm.scrim.classList.remove('show');
    r(v);
  };
  UI.confirm = (msg, o = {}) => new Promise(res => {
    if (!cfm) {
      const scrim = document.createElement('div'); scrim.className = 'cfm-scrim';
      const el = document.createElement('div'); el.className = 'cfm glass-panel'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true');
      document.body.append(scrim, el);
      cfm = { el, scrim, res: null };
      scrim.addEventListener('click', () => UI.closeConfirm());
      el.addEventListener('click', e => { const b = e.target.closest('[data-cfm]'); if (b) UI.closeConfirm(b.dataset.cfm === '1'); });
    }
    if (cfm.res) cfm.res(false);
    cfm.res = res; cfm.dismiss = 'dismiss' in o ? o.dismiss : false;
    const text = MC.t ? MC.t(String(msg)) : String(msg); // 和系统弹窗一样整句翻译；里面有用户写的名字，不再逐字转换
    cfm.el.innerHTML = `<p data-uc>${esc(text).replace(/\n/g, '<br>')}</p><div class="cfm-btns">`
      + `<button type="button" data-cfm="0">${esc(o.cancel || '取消')}</button>`
      + `<button type="button" data-cfm="1" class="${o.danger ? 'danger' : 'strong'}">${esc(o.ok || '确定')}</button></div>`;
    cfm.scrim.classList.add('show'); cfm.el.classList.add('show');
    if (UI.menuOpen()) closeWeb();
    // 危险操作默认停在「取消」上，回车不会误删
    setTimeout(() => { const b = cfm.el.querySelector(`[data-cfm="${o.danger ? 0 : 1}"]`); b && b.focus({ preventScroll: true }); }, 30);
  });

  // ---------- 面板层级 ----------
  const backdrop = $('#backdrop');
  const stack = [];
  const onClose = {};
  UI.isOpen = id => stack.includes(id);
  UI.anyOpen = () => stack.length > 0;
  function syncBackdrop() {
    // 有面板开着：根元素挂 ui-open，iPhone / Mac / 安卓的注入脚本都在看根元素的 class，原生的底栏控件（时钟、logo、回到今天、分页点）跟着让开【联动:底部悬浮控件】
    // 新建子日历的介绍卡片浮在屏幕上方，和底栏不重叠：它开着时底栏照常显示，不让路
    document.documentElement.classList.toggle('ui-open', stack.some(id => id !== 'calKindSheet') || !!document.querySelector('#pvDoc.show'));
    if (!stack.length) { backdrop.classList.remove('show'); return; }
    const top = $('#' + stack[stack.length - 1]);
    backdrop.style.zIndex = (parseInt(getComputedStyle(top).zIndex, 10) || 30) - 1;
    backdrop.classList.add('show');
  }
  // ====== 开关统一（用户定的）：所有 input.switch 都换成侧拉菜单「⋯」里那种透明水滴开关（.mi-sw：一点先铺一层 logo 渐变 + 小勾，
  // 那团气再涨开补满层次）。原来的 checkbox 留着接点按（透明盖在上面），状态跟着它变；之后新画出来的也自动换 ======
  const SW_SKIN = '<i class="mi-base"></i><i class="mi-ck"><svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.8 3.8 7.2-8.3"/></svg></i>';
  function skinSwitches(root) {
    (root.querySelectorAll ? root.querySelectorAll('input.switch:not([data-sk])') : []).forEach(inp => {
      inp.dataset.sk = '1';
      const k = document.createElement('span'); k.className = 'mi-sw sw-skin' + (inp.checked ? ' on' : ''); k.setAttribute('aria-hidden', 'true'); k.innerHTML = SW_SKIN;
      inp.before(k);
    });
  }
  const syncSkin = inp => { const k = inp.previousElementSibling; if (k && k.classList.contains('sw-skin')) k.classList.toggle('on', inp.checked); };
  document.addEventListener('change', e => { if (e.target.matches && e.target.matches('input.switch')) syncSkin(e.target); }, true);
  skinSwitches(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('input.switch')) skinSwitches(n.parentNode); else skinSwitches(n); } }))).observe(document.body, { childList: true, subtree: true });
  // 代码里直接改 checked（不触发 change）时也跟上
  const ckDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  Object.defineProperty(HTMLInputElement.prototype, 'checked', { configurable: true, enumerable: ckDesc.enumerable, get() { return ckDesc.get.call(this); },
    set(v) { ckDesc.set.call(this, v); if (this.dataset && this.dataset.sk) syncSkin(this); } });

  // ====== 从点的那一条拉伸出来的小卡片（用户定的：选择、动作菜单、提醒通知、帮助、表单……都这样，不再从底部滑上来）======
  // 和新建子日历的水滴一样：一滴液态玻璃从点的那一条（同样的位置、大小、圆角）被拉长、一口气展开成卡片，内容紧跟着出来；
  // 收起倒过来缩回那一条。卡片放在那一条下面（放不下就上面），宽度跟那一组一样；要打字的表单放在屏幕上方，键盘不挡。不回弹。
  const POP = new Set(['chooseSheet', 'notifySheet', 'helpSheet', 'sameSheet', 'importSheet', 'formSheet']);
  let lastTap = null, lastTapT = 0;
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest && e.target.closest('.srow, .pk-row, .cmp-same, button, [data-act], [role="button"]');
    if (t) { lastTap = t; lastTapT = performance.now(); }
  }, true);
  const reduceMo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const px = (r, rad) => ({ left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderRadius: rad + 'px' });
  function popPlace(el, from) {
    const fr = from.getBoundingClientRect(), host = el.offsetParent ? el.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    const grp = from.closest('.sgroup, .group, .pk-rows') || from, gr = grp.getBoundingClientRect();
    const cs = getComputedStyle(document.documentElement), sT = parseFloat(cs.getPropertyValue('--safe-t')) || 0, sB = parseFloat(cs.getPropertyValue('--safe-b')) || 0;
    const W = innerWidth, H = innerHeight;
    const w = Math.min(W - 16, 440, Math.max(gr.width, 300));
    const x = Math.min(Math.max(8, gr.left + gr.width / 2 - w / 2), W - w - 8);
    const maxH = H - sT - sB - 28;
    el.classList.add('pop', 'measure');
    el.style.setProperty('--pw', w + 'px'); el.style.setProperty('--pmh', maxH + 'px');
    const h = Math.min(el.scrollHeight, maxH);
    el.classList.remove('measure');
    const typing = !!el.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea');
    let y;
    if (typing) y = sT + 14;                                                        // 要打字：放在上方，键盘不挡
    else if (fr.bottom + 8 + h <= H - sB - 10) y = fr.bottom + 8;                   // 那一条下面
    else if (fr.top - 8 - h >= sT + 10) y = fr.top - 8 - h;                         // 放不下就上面
    else y = Math.max(sT + 10, Math.min(H - sB - 10 - h, fr.top + fr.height / 2 - h / 2));
    el.style.setProperty('--px', x - host.left + 'px'); el.style.setProperty('--py', y - host.top + 'px');
    return { src: { x: fr.left, y: fr.top, w: fr.width, h: fr.height }, dst: { x, y, w, h }, rad: Math.min(fr.height / 2, 18) };
  }
  // 中间那一帧：一滴被拉长的玻璃，一头还粘在那一条上，一头伸向卡片
  function popMid(g) {
    const { src: a, dst: b } = g, mw = Math.max(44, Math.min(a.w, b.w) * .5), cx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
    const below = b.y >= a.y;
    const top = below ? a.y + a.h * .15 : b.y + b.h * .45, bot = below ? b.y + b.h * .55 : a.y + a.h * .85;
    return { x: cx - mw / 2, y: top, w: mw, h: Math.max(mw, bot - top) };
  }
  function popMorph(el, g, opening) {
    if (!document.body.animate || reduceMo()) return;
    const blob = document.createElement('div'); blob.className = 'ks-blob pop-blob';
    // 收起时卡片沉到下面一层：放进那一组所在的页面里、垫在那一组下面（那一组临时抬高一层），缩回去时是钻到那一条底下，不是盖在上面（用户定的）
    const grp = !opening && g.from && (g.from.closest('.sgroup, .group, .pk-rows') || g.from);
    let ox = 0, oy = 0;
    if (grp && grp.parentNode) {
      blob.classList.add('under'); grp.parentNode.insertBefore(blob, grp); grp.classList.add('pop-over');
      blob.style.left = blob.style.top = '0px'; const r0 = blob.getBoundingClientRect(); ox = r0.left; oy = r0.top;   // 祖先有 transform 时 fixed 的原点不在屏幕左上角，按实际量的减回去
    } else document.body.appendChild(blob);
    const at = r => ({ ...r, x: r.x - ox, y: r.y - oy });
    // 打开：被拉长的一滴先从那一条伸出去，再一口气展开；收起：卡片整块连着缩回那一条（不再变成细长的一滴，用户嫌怪），最后沉到它下面
    const kf = opening ? [px(g.src, g.rad), { ...px(popMid(g), popMid(g).w / 2), offset: .34 }, px(g.dst, 30)]
      : [px(at(g.dst), 30), px(at(g.src), g.rad)];
    el.style.opacity = '0';
    const a = blob.animate(kf, { duration: opening ? 320 : 240, easing: opening ? 'cubic-bezier(.3, .72, .3, 1)' : 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    let done = false;
    const gone = () => { blob.remove(); if (grp) grp.classList.remove('pop-over'); };
    const fin = () => { if (done) return; done = true; blob.animate([{ opacity: 1 }, { opacity: 0 }], { duration: opening ? 120 : 90 }).onfinish = gone; setTimeout(gone, 300); };
    if (opening) setTimeout(() => { el.style.opacity = ''; el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }); }, 320 * .55);   // 拉到一半多就看得到里面的东西
    a.onfinish = fin; setTimeout(fin, (opening ? 320 : 260) + 80);
  }
  UI.open = (id, closeCb, opts = {}) => {
    if (!stack.includes(id)) stack.push(id);
    if (closeCb) onClose[id] = closeCb;
    const el = $('#' + id);
    const from = opts.from || (performance.now() - lastTapT < 900 ? lastTap : null);
    if (POP.has(id) && from && document.contains(from) && !el.contains(from) && from.getBoundingClientRect().width > 0) {
      const g = popPlace(el, from); el._pop = { from, g };
      el.classList.add('show'); syncBackdrop();
      popMorph(el, g, true);
      return;
    }
    el.classList.remove('pop'); el._pop = null; el.style.opacity = '';
    el.classList.add('show');
    syncBackdrop();
  };
  // 关闭前确认：UI.guard(id, proceed => …) 可以拦下关闭（取消、点外面、下拉、返回手势都走这里），确认后调 proceed()
  const guards = {};
  UI.guard = (id, fn) => { if (fn) guards[id] = fn; else delete guards[id]; };
  UI.close = (id, force) => {
    id = id || stack[stack.length - 1];
    if (!id) return;
    if (!force && guards[id] && stack.includes(id)) { guards[id](() => UI.close(id, true)); return; }
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    const pe = $('#' + id);
    if (pe._pop && pe.classList.contains('show')) {   // 缩回点的那一条（那一条还在屏幕上的话）
      const { from, g } = pe._pop, fr = from.getBoundingClientRect();
      if (document.contains(from) && fr.width > 0) popMorph(pe, { ...g, from, src: { x: fr.left, y: fr.top, w: fr.width, h: fr.height }, dst: { ...g.dst, h: Math.min(pe.offsetHeight, g.dst.h) } }, false);
    }
    pe.classList.remove('show');
    setTimeout(() => { if (!pe.classList.contains('show')) pe.style.opacity = ''; }, 300);
    const a = document.activeElement;
    if (a && $('#' + id).contains(a)) a.blur();
    syncBackdrop();
    const cb = onClose[id]; delete onClose[id];
    if (cb) cb();
  };
  backdrop.addEventListener('click', () => UI.close());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (UI.confirmOpen()) UI.closeConfirm(); else if (UI.menuOpen()) closeWeb(); else if (stack.length) UI.close();
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => UI.close(b.closest('.sheet').id)));
  // 面板手势：除了可编辑区域（输入框、文本框、滚轮），面板任何位置往下拉都能收起；
  // 可滚动的内容在最顶部时下拉 = 收起，否则正常滚动。向上拉有阻尼的橡皮筋效果，松手回弹。
  const rubber = (x, dim = 140, c = .55) => (1 - 1 / (x * c / dim + 1)) * dim;
  const EDITABLE = 'input:not([type=checkbox]), textarea, select, [contenteditable], .wheel';
  const SCROLLERS = '.batch-scroll, .pk-body:not(.cmp-pk), .help-body, .form, .list, .pv-list, .cmp-scroll';
  // 面板本身永远不滚动（防止浏览器为了显示输入框把整个面板顶走）
  document.querySelectorAll('.sheet').forEach(sh => sh.addEventListener('scroll', () => { if (!sh.classList.contains('composer') && sh.scrollTop) sh.scrollTop = 0; }));
  document.querySelectorAll('.sheet').forEach(sh => {
    let x0 = 0, y0 = 0, last = 0, lastT = 0, v = 0, d = 0, state = 0, sc = null, swallow = false, grab = false; // state: 0 无 1 待定 2 拖动中
    let h0 = 0, P = 0, H = [], sizing = false; // 有几档高度的面板（新建事件、批量添加）：拖动时直接改高度，跟着手指走
    sh.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || e.target.closest(EDITABLE)) { state = 0; return; }
      // 有两档高度的面板（新建事件）：按住最上面那一条（把手和标题行，不含按钮）上下拉，切换半屏 / 全屏
      sizing = sh.classList.contains('mid');
      // 抓手区：面板最上面 72px 一整条都算（把手、标题行，连取消 / 确认按钮上也行，没拖动就照常是点按），手指粗、安卓上把手又细，只认把手常常抓不到
      grab = sizing && (e.touches[0].clientY - sh.getBoundingClientRect().top < 72 || (!!e.target.closest('.handle, .cmp-head, .sheet-head') && !e.target.closest('button')));
      sc = grab ? null : e.target.closest(SCROLLERS);
      if (sc && !sh.contains(sc)) sc = null;
      state = 1; d = 0; v = 0;
      x0 = e.touches[0].clientX; y0 = last = e.touches[0].clientY; lastT = performance.now();
    }, { passive: true });
    sh.addEventListener('touchmove', e => {
      if (!state) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY, now = performance.now();
      const dy = y - y0, dx = x - x0;
      if (state === 1) {
        if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx)) return;
        const atTop = !sc || sc.scrollTop <= 0;
        if ((dy > 0 && atTop) || (dy < 0 && !sc && (!sizing || grab))) {
          state = 2; y0 = y; sh.style.transition = 'none';
          if (sizing) { P = sh.parentElement.clientHeight; h0 = sh.offsetHeight; H = UI.detents(sh).map(f => f * P); }
        }
        else { state = 0; return; }   // 交给内容自己滚动
      }
      v = (y - last) / Math.max(1, now - lastT); last = y; lastT = now;
      d = y - y0;
      if (sizing) {
        // 在最低和最高两档之间：高度跟着手指；拉过最高档有阻尼；拉到最低档以下整块往下走（松手可能收起）
        const want = h0 - d, lo = H[0], hi = H[H.length - 1];
        const h = want > hi ? hi + rubber(want - hi, 90) : Math.max(lo, want);
        sh.style.height = h + 'px';
        sh.style.transform = want < lo ? `translateY(${lo - want}px)` : '';
      } else sh.style.transform = `translateY(${d >= 0 ? d : -rubber(-d)}px)`;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (state !== 2) { state = 0; return; }
      state = 0;
      swallow = Math.abs(d) > 4;      // 拖动过就不再触发点击
      setTimeout(() => (swallow = false), 350);
      if (sizing) {
        const want = h0 - d, lo = H[0];
        // 在最低档往下甩、或拉下去很多：收起
        if (want < lo - 110 || (want < lo - 16 && v > .55)) {
          sh.style.transition = 'transform .26s cubic-bezier(.3,.7,.4,1)';
          sh.style.transform = `translateY(${sh.offsetHeight + 40}px)`;
          setTimeout(() => { sh.style.transition = ''; sh.style.transform = ''; sh.style.height = ''; UI.close(sh.id); }, 250);
          return;
        }
        // 按松手时的速度往前多算一段，停到最近的一档；带一点回弹
        const aim = Math.min(H[H.length - 1], Math.max(lo, want - v * 160));
        let k = 0; H.forEach((h, i) => { if (Math.abs(h - aim) < Math.abs(H[k] - aim)) k = i; });
        const speed = Math.min(1, Math.abs(v) / 1.5);
        sh.style.transition = `height ${.62 - speed * .14}s cubic-bezier(.2,${1.18 + speed * .22},.32,1), transform .5s cubic-bezier(.25,1.3,.45,1)`;
        UI.setDetent(sh, UI.detents(sh)[k]);
        sh.style.height = ''; sh.style.transform = '';
        setTimeout(() => { if (!state) sh.style.transition = ''; }, 650);
        return;
      }
      const close = d > 110 || (d > 24 && v > .55);
      if (close) {
        sh.style.transition = 'transform .26s cubic-bezier(.3,.7,.4,1)';
        sh.style.transform = `translateY(${sh.offsetHeight + 40}px)`;
        setTimeout(() => { sh.style.transition = ''; sh.style.transform = ''; UI.close(sh.id); }, 250);
      } else {
        sh.style.transition = 'transform .5s cubic-bezier(.25,1.6,.45,1)';
        sh.style.transform = '';
        setTimeout(() => { sh.style.transition = ''; }, 500);
      }
    };
    sh.addEventListener('touchend', end);
    sh.addEventListener('touchcancel', end);
    sh.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  });

  // 面板的几档高度（占屏幕高度的比例）：默认那档由 CSS 的 --sh-def 给，另外加上更矮、更高和最高三档
  UI.detents = sh => {
    const def = parseFloat(getComputedStyle(sh).getPropertyValue('--sh-def')) || .56;
    return [...new Set([.4, .56, def, .74, .9].map(f => Math.round(f * 100) / 100))].sort((a, b) => a - b);
  };
  UI.setDetent = (sh, f) => { if (f == null) sh.style.removeProperty('--sh'); else sh.style.setProperty('--sh', f * 100 + '%'); };
  UI.getDetent = sh => sh.style.getPropertyValue('--sh');

  // 键盘弹出时把面板顶起（iOS）
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const on = kb > 60;
      document.documentElement.style.setProperty('--kb', on ? kb + 'px' : '0px');
      // 实时的可见区域（键盘弹出时 iOS 只缩小可见区域，并可能把画面整体挪动）
      document.documentElement.style.setProperty('--vvh', vv.height + 'px');
      document.documentElement.style.setProperty('--vvt', vv.offsetTop + 'px');
      document.documentElement.classList.toggle('kb-open', on);
      $('#composer').classList.toggle('keyboard', on);
      fitFocused();
    };
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
    // 正在输入的框会被键盘挡住时：面板只抬高刚好够的距离（框底在键盘上方 12px）；面板顶到屏幕上边了，剩下的让面板里面自己滚
    const fitFocused = () => {
      const el = document.activeElement, kbOn = document.documentElement.classList.contains('kb-open');
      document.querySelectorAll('.sheet[style*="--lift"]').forEach(s => { if (!kbOn || !s.contains(el)) s.style.removeProperty('--lift'); });
      if (!kbOn || !el || !el.matches('input, textarea, [contenteditable]')) return;
      const sheet = el.closest('.sheet'); if (!sheet) return;
      const cur = parseFloat(sheet.style.getPropertyValue('--lift')) || 0;
      const r = el.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
      const visBottom = vv.offsetTop + vv.height - 12;
      let need = Math.max(0, r.bottom + cur - visBottom);                 // 不抬的话框底在哪、要抬多少
      const room = Math.max(0, sr.top + cur - (vv.offsetTop + 10));       // 最多抬到面板顶贴着屏幕上边
      const lift = Math.min(need, room);
      sheet.style.setProperty('--lift', lift + 'px');
      if (need > lift) { // 还是挡住：滚动面板里装着这个框的列表
        let sc = el.parentElement; while (sc && sc !== sheet && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (sc && sc !== sheet) sc.scrollTop += need - lift;
      }
    };
    document.addEventListener('focusin', () => setTimeout(fitFocused, 60));
    document.addEventListener('focusout', () => setTimeout(fitFocused, 60));
  }

  // ---------- 弹出菜单 ----------
  const pop = $('#popover');
  let popCb = null;
  UI.menuOpen = () => pop.classList.contains('show');
  // opts.center：以按钮为正中心展开（侧拉菜单里子日历的「⋯」），否则挂在按钮上方 / 下方
  UI.menu = (anchor, items, cb, opts = {}) => {
    popCb = cb;
    pop.innerHTML = items.map((it, i) =>
      // sw：开关类的选项（比如子日历的「在主日历显示」「通知」）画成开关，点了原地切换、菜单不关
      it.ck ? `<button role="menuitemcheckbox" aria-checked="${!!it.on}" data-i="${i}" class="ck${it.on ? ' on' : ''}">${it.icon || ''}<span>${esc(it.label)}</span><span class="tick" aria-hidden="true">✓</span></button>`   // ck：可以多选的一项，点了打勾 / 取消，菜单不关
      : it.sw ? `<button role="menuitemcheckbox" aria-checked="${!!it.on}" data-i="${i}" class="sw">${it.icon || ''}<span>${esc(it.label)}</span><span class="mi-sw${it.on ? ' on' : ''}" aria-hidden="true"><i class="mi-base"></i><i class="mi-ck"><svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.8 3.8 7.2-8.3"/></svg></i></span></button>`
        : `<button role="menuitem" data-i="${i}" class="${it.on ? 'on' : ''}${it.danger ? ' danger' : ''}${it.cls ? ' ' + it.cls : ''}">${it.icon || ''}<span>${esc(it.label)}</span>${it.on ? '<span class="tick">✓</span>' : ''}</button>`).join('');
    if (dropA) { dropA.cancel(); dropA = null; }
    pop.classList.toggle('multi', !!opts.multi);   // 多选菜单：打勾用正文色
    pop.classList.add('grow');   // 所有菜单都从点的那个按钮里长出来（同样的位置、大小、圆角），再展开成菜单；不回弹
    pop.classList.add('show');
    pop.style.setProperty('--cc', getComputedStyle(anchor).getPropertyValue('--cc').trim() || 'var(--accent)');   // 开关填充用那一行日历的颜色
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(10, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 10);
    if (r.left < 80) left = Math.max(10, r.left);
    const above = r.top - ph - 8 > 10;
    let top = above ? r.top - ph - 8 : r.bottom + 8;
    if (opts.center) {
      left = Math.min(Math.max(10, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 10);
      top = Math.min(Math.max(10, r.top + r.height / 2 - ph / 2), window.innerHeight - ph - 10);
    }
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    pop.style.setProperty('--ox', (r.left + r.width / 2 - left) + 'px');
    pop.style.setProperty('--oy', opts.center ? (r.top + r.height / 2 - top) + 'px' : above ? '100%' : '0%');
    dropPop(true, { x: r.left - left, y: r.top - top, w: Math.max(24, r.width), h: Math.max(24, r.height) });
    pop.querySelectorAll('button').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const it = items[Number(b.dataset.i)];
      if (it.ck) { try { if (!(MC.Native && MC.Native.haptic && MC.Native.haptic())) navigator.vibrate && navigator.vibrate(6); } catch (e) {} it.on = !it.on; b.setAttribute('aria-checked', String(it.on)); b.classList.toggle('on', it.on); if (popCb) popCb(it.value, it); return; }
      if (it.sw) { try { if (!(MC.Native && MC.Native.haptic && MC.Native.haptic())) navigator.vibrate && navigator.vibrate(6); } catch (e) {} it.on = !it.on; b.setAttribute('aria-checked', String(it.on)); b.querySelector('.mi-sw').classList.toggle('on', it.on); if (popCb) popCb(it.value, it); return; }
      closeWeb();
      if (popCb) popCb(it.value, it);
    });
  };
  // ====== 选择窗口（用户定的：所有「选一个 / 选几个」的都用同一种窗口，和「提醒通知」一样的悬浮卡片）======
  // 标题 + 一组行，选中的在右边打勾。单选：点一下打勾、马上收起；多选：点一下打勾 / 取消，「无」和具体的项互斥，「完成」收起。
  // 「动作」菜单（换头像、备份、子日历「⋯」这种没有「当前选中」的）还是小菜单，从按钮里长出来。【联动:原生玻璃】左上「取消」是 .lgn，iPhone / Mac 由原生画
  const webMenu = UI.menu;
  const CS = document.createElement('section');
  CS.className = 'sheet fl choose'; CS.id = 'chooseSheet'; CS.setAttribute('aria-label', '选择');
  CS.innerHTML = '<div class="handle"></div><div class="sheet-head"><button class="sh-btn lgbtn lgn tap" data-x type="button">取消</button><h2></h2><button class="sh-ok tap" data-ok type="button">完成</button></div><div class="sgroup ch-list"></div>';
  (document.getElementById('notifySheet') || document.body.lastElementChild).after(CS);
  const TICK = '<svg class="ch-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>';
  // 标题：设置里那一行的名字 / 选择器里那一行的名字 / 按钮的 aria-label
  const titleOf = (anchor, opts) => {
    const q = (sel, sub) => { const r = anchor && anchor.closest && anchor.closest(sel); const t = r && r.querySelector(sub); return t && t.textContent.trim(); };
    return opts.title || q('.srow', '.slabel') || q('.pk-row', 'span') || (anchor && anchor.getAttribute && anchor.getAttribute('aria-label')) || '选择';
  };
  UI.choose = (anchor, items, cb, opts = {}) => {
    const multi = !!opts.multi, list = CS.querySelector('.ch-list');
    const act = !multi && !items.some(it => it.on);   // 动作菜单：没有「当前选中」，不打勾
    CS.classList.toggle('act', act);
    let cur = multi ? [...(opts.selected || [])] : null, finished = false;
    CS.querySelector('h2').textContent = titleOf(anchor, opts);
    const okB = CS.querySelector('[data-ok]'), xB = CS.querySelector('[data-x]');
    okB.hidden = !multi; okB.textContent = opts.done || '完成';
    xB.style.visibility = multi ? 'hidden' : '';   // 多选是点一下就存的，只要「完成」
    list.innerHTML = items.map((it, i) => `<button type="button" class="srow ch-row${it.danger ? ' danger' : ''}" data-i="${i}" role="${multi ? 'menuitemcheckbox' : 'menuitemradio'}">${it.icon || ''}<span class="slabel">${esc(it.label)}</span>${TICK}</button>`).join('');
    const paint = () => list.querySelectorAll('.ch-row').forEach(b => {
      const it = items[Number(b.dataset.i)], on = multi ? (it.value === '__none' ? !cur.length : cur.includes(it.value)) : !!it.on;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
    });
    paint();
    const buzz = () => { try { if (!(MC.Native && MC.Native.haptic && MC.Native.haptic())) navigator.vibrate && navigator.vibrate(6); } catch (e) {} };
    const finish = () => { if (finished) return; finished = true; if (multi && opts.onDone) opts.onDone(cur); };
    list.onclick = e => {
      const b = e.target.closest('.ch-row'); if (!b) return;
      const it = items[Number(b.dataset.i)]; buzz();
      if (multi) {
        if (it.value === '__none') cur = [];
        else if (cur.includes(it.value)) { if (opts.keepOne && cur.length === 1) return; cur = cur.filter(x => x !== it.value); }   // keepOne：至少留一个
        else cur = [...cur, it.value];
        paint(); opts.onChange && opts.onChange(cur);
        return;
      }
      items.forEach(x => (x.on = x === it)); paint();   // 先看到打勾换过来，再收起
      finished = true;
      setTimeout(() => { UI.close('chooseSheet', true); cb && cb(it.value, it); }, 150);
    };
    okB.onclick = () => UI.close('chooseSheet');
    xB.onclick = () => UI.close('chooseSheet');
    const from = anchor && anchor.closest ? (anchor.closest('.srow, .pk-row, .cmp-same, .b-opt') || anchor) : null;
    UI.open('chooseSheet', finish, { from: from && from.getBoundingClientRect().width > 4 ? from : null });   // 从点的那一条拉伸出来；点外面也算选好了（多选是点一下就存的）
  };
  // 多选：「无」和具体的项互斥（选了时间「无」就取消，点「无」全部取消）
  UI.multiMenu = (anchor, options, selected, onChange, opts = {}) => UI.choose(anchor,
    [...(opts.keepOne ? [] : [{ label: opts.none || '无', value: '__none' }]), ...options.map(o => ({ label: o.label, value: o.v }))], null,
    { ...opts, multi: true, selected, onChange });
  // UI.menu 分流：有「当前选中」的（选择类）一律用选择窗口；其它（动作菜单、带开关的「⋯」）用小菜单。
  // App 的注入脚本会给 UI.menu 赋一个原生菜单：记下来，只给动作菜单用（选择类在 App 里也用同一个窗口）
  let nativeMenu = null;
  // 用户定的：从一条点出来的小框都用同一种卡片——选择类和动作菜单都走 UI.choose；只有以「⋯」为中心展开、带开关的小窗口（opts.center）还是那颗水滴菜单
  const isChoice = (items, opts) => !opts.center && !items.some(it => it.sw);
  Object.defineProperty(UI, 'menu', {
    configurable: true, enumerable: true,
    get: () => (anchor, items, cb, opts = {}) => (isChoice(items, opts) ? UI.choose(anchor, items, cb, opts) : (nativeMenu && !opts.web ? nativeMenu : webMenu)(anchor, items, cb, opts)),
    set: f => { nativeMenu = f; },
  });
  // 菜单从点的那个按钮里长出来：先和按钮一样的位置、大小、圆角（玻璃一直在），一口气展开成菜单，字跟着淡进来；收起倒过来缩回按钮。
  // 干脆、不回弹（用户定的：保留液态玻璃，别弹来弹去）。按钮在菜单外面也一样（从按钮的位置移过来）
  let dropA = null, dropO = null;
  function dropPop(opening, ar) {
    if (!pop.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (!opening) pop.classList.remove('show', 'grow'); return; }
    if (opening) dropO = ar; else if (!dropO) { pop.classList.remove('show', 'grow'); return; }
    const o = dropO, w = pop.offsetWidth, h = pop.offsetHeight, sx = o.w / w, sy = o.h / h, R = Math.min(o.h / 2, 22);
    const small = { transform: `translate(${o.x}px, ${o.y}px) scale(${sx}, ${sy})`, borderRadius: `${R / sx}px / ${R / sy}px` };
    const full = { transform: 'none', borderRadius: '22px' };
    if (dropA) dropA.cancel();
    const kids = [...pop.children];
    pop.style.transformOrigin = '0 0';
    if (opening) {
      dropA = pop.animate([small, full], { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      kids.forEach(k => k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, delay: 80, easing: 'ease-out', fill: 'backwards' }));
    } else {
      kids.forEach(k => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 70, fill: 'forwards' }));
      dropA = pop.animate([full, { ...small, opacity: 1, offset: .85 }, { ...small, opacity: 0 }], { duration: 190, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' });
      const a = dropA;
      const end = () => { if (dropA !== a) return; pop.classList.remove('show', 'grow'); a.cancel(); kids.forEach(k => k.getAnimations().forEach(x => x.cancel())); dropO = null; dropA = null; };
      a.onfinish = end; setTimeout(end, 250);   // 后台标签页里动画事件可能不来：到点也一定收干净，不留一个看不见的菜单
    }
  }
  // 网页自己的菜单一律用 closeWeb 收起：App 的注入脚本会把 UI.closeMenu 换成空函数（App 里的菜单平常是原生画的），
  // 但多选菜单（UI.multiMenu）一直是网页画的，用 UI.closeMenu 就收不回去
  function closeWeb() { if (pop.classList.contains('grow') && pop.classList.contains('show')) dropPop(false); else pop.classList.remove('show'); }
  UI.closeMenu = closeWeb;
  UI.closeWebMenu = closeWeb;
  let swallow = false;
  document.addEventListener('pointerdown', e => {
    if (UI.menuOpen() && !pop.contains(e.target)) { closeWeb(); swallow = true; setTimeout(() => (swallow = false), 400); }
  }, true);
  document.addEventListener('click', e => {
    if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  // ---------- 图标与事件行 ----------
  UI.flagSVG = p => UI.priMini(p);   // 优先级标记：迷你渐变条（原来是彩色小旗子）
  // 等级评分：名称是用户自定义的，所以用文字徽标（颜色深浅随等级）而不是旗子
  UI.rateTag = e => `<span class="rate-tag lv${e.rate}" data-uc>${esc(MC.rateName(e))}</span>`;
  UI.rateMenuItems = (calId, cur) => [{ label: '未评级', value: 0, on: !cur }, ...MC.RATE_ORDER.map(v => ({ label: MC.rateLabels(calId)[v - 1], value: v, on: cur === v, icon: `<span class="lvdot lv${v}"></span>` }))];
  UI.priMenuItems = cur => MC.PRI_ASC.map(p => ({ label: p.full, value: p.v, on: p.v === cur, icon: UI.flagSVG(p.v) }));
  const checkSVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // opts: { showDate: true } 在副标题显示日期
  UI.itemHTML = (e, opts = {}) => {
    const p = MC.priOf(e.priority);
    const bits = [];
    const multi = e.days > 1;
    if (opts.showDate) {
      const cls = e.done ? '' : MC.dayDiff(MC.endDate(e)) < 0 ? 'over' : 'due';
      bits.push(`<span class="${cls}">${MC.dateLabel(e.date)}${multi ? '–' + MC.dateLabel(MC.endDate(e)) : ''}</span>`);
    } else if (multi) bits.push(`<span>${MC.dateLabel(e.date)}–${MC.dateLabel(MC.endDate(e))} · 共 ${e.days} 天</span>`);
    const tl = MC.timeLabel(e);
    if (tl) bits.push(`<span>${esc(tl)}</span>`);
    const ec = e.cal && e.cal !== MC.activeCal() && MC.cal(e.cal); // 主日历里显示的记录日历事件：标出来自哪个日历
    if (ec) bits.unshift(`<span class="cal-tag" data-uc style="--cc:${ec.color}">${esc(ec.name)}</span>`);
    if (e.segs && Object.keys(e.segs).length && MC.rateOn(e.cal)) { // 分段评价：每半小时一个小格，颜色越深等级越高
      const bl = MC.segBlocks(e.time, e.endTime);
      if (bl.length) bits.push(`<span class="seg-mini" title="分段评价">${bl.map(b => `<i class="lv${MC.segVal(e, b.k)}"></i>`).join('')}</span>`);
    }
    if (e.note) bits.push(`<span class="note">${esc(e.note)}</span>`); // 备注是用户写的，不翻译
    // 纪念日（纪念日历设为在主日历显示）：只读，前面是一颗同色的心，点开是这个日子的详情页
    if (e.dv) return `<li class="item dvi" data-id="${e.id}" style="--c:${MC.evColor(e)}">
      <span class="check dv-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.8-4.6-7.8-10.6a4.3 4.3 0 0 1 7.8-2.6 4.3 4.3 0 0 1 7.8 2.6c0 6-7.8 10.6-7.8 10.6z"/></svg></span>
      <div class="item-main" data-act="open"><div class="item-title"><span class="ttxt">${esc(e.title)}</span></div>${bits.length ? `<div class="item-sub">${bits.join(' · ')}</div>` : ''}</div>
    </li>`;
    return `<li class="item${e.done ? ' done' : ''}${e.done && UI.justDone === e.id ? ' just-done' : ''}" data-id="${e.id}" style="--c:${MC.evColor(e)}">
      <button class="check" data-act="toggle" aria-label="${e.done ? '标为未完成' : '标为完成'}">${checkSVG}</button>
      <div class="item-main" data-act="open">
        <div class="item-title"><span class="ttxt">${esc(e.title)}</span></div>
        ${bits.length ? `<div class="item-sub">${bits.join(' · ')}</div>` : ''}
      </div>
      ${MC.rateOn(e.cal) ? (e.rate && !opts.noFlag ? UI.rateTag(e) : '') : (e.priority && !opts.noFlag ? UI.flagSVG(e.priority) : '')}
      <div class="swipe-acts" aria-hidden="true"><button data-act="edit" tabindex="-1"><i><svg viewBox="0 0 24 24"><path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M13 7l4 4"/></svg></i><span>编辑</span></button><button data-act="del" class="del" tabindex="-1"><i><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></i><span>删除</span></button></div>
    </li>`;
  };
  // ---------- 完成反馈：清脆的一声 + 一点点触感 ----------
  // 声音用 Web Audio 现场合成（两个很短的高音，像玻璃轻碰）。iPhone：音频设为 ambient，静音键打开时自动不出声；
  // 安卓 App：由原生判断铃声模式，只有响铃时才出声（振动 / 静音都不出声）
  let actx = null;
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) {}
  const chime = () => {
    if (MC.Native.on && !MC.Native.soundAllowed()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + 0.005, out = actx.createGain();
      out.gain.value = 0.16; out.connect(actx.destination);
      [[1568, 0, 0.11], [2349, 0.055, 0.16]].forEach(([f, dt, len]) => { // G6 → D7，上扬的两下
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f, t0 + dt); o.frequency.exponentialRampToValueAtTime(f * 0.985, t0 + dt + len);
        g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(1, t0 + dt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + len);
        o.connect(g); g.connect(out); o.start(t0 + dt); o.stop(t0 + dt + len + 0.02);
      });
    } catch (e) {}
  };
  // 触感：安卓 App 用系统的确认触感；iPhone（iOS 18 起）借系统开关控件的触感；其他浏览器用很短的振动
  let hapticSwitch = null;
  const haptic = () => {
    if (MC.Native.on && MC.Native.haptic()) return;
    if (/iPhone|iPad/.test(navigator.userAgent)) {
      if (!hapticSwitch) {
        hapticSwitch = document.createElement('label');
        hapticSwitch.setAttribute('aria-hidden', 'true');
        hapticSwitch.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
        hapticSwitch.innerHTML = '<input type="checkbox" switch tabindex="-1">';
        document.body.appendChild(hapticSwitch);
      }
      hapticSwitch.click();
      return;
    }
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  };

  // ---------- 液态玻璃拖动条（优先级 / 等级）：和底部菜单栏一样，一颗玻璃水滴停在选中的那格上 ----------
  // 点哪格水滴就弹过去；按住左右拖，水滴跟着手指走（越快拉得越长），经过的字被放大，松手吸到最近的一格。
  // 选中后在条上发 lgchange 事件（detail.v 是选的值）
  UI.lgBar = (items, cur) => {
    const i = Math.max(0, items.findIndex(p => p.v === cur));
    return `<div class="lgbar" role="radiogroup" style="--n:${items.length};--p:${i}" data-i="${i}"><span class="lg-thumb" aria-hidden="true"></span>`
      + items.map((p, k) => `<button type="button" role="radio" aria-checked="${k === i}" class="lg-opt${k === i ? ' on' : ''}" data-i="${k}" data-v="${p.v}" style="--c:${p.color || 'var(--text)'}">${p.color ? '<span class="dot"></span>' : ''}<span data-uc>${esc(p.name)}</span></button>`).join('')
      + '</div>';
  };
  {
    let g = null;
    const opts = bar => bar.querySelectorAll('.lg-opt');
    const near = (bar, p) => opts(bar).forEach((o, k) => o.classList.toggle('near', Math.abs(k - p) < 0.5));
    const pick = (bar, k) => {
      const os = opts(bar), was = Number(bar.dataset.i);
      bar.classList.remove('dragging'); bar.style.setProperty('--sx', 1);
      bar.style.setProperty('--p', k); bar.dataset.i = k;
      os.forEach((o, j) => { o.classList.toggle('on', j === k); o.classList.remove('near'); o.setAttribute('aria-checked', String(j === k)); });
      if (k !== was) { haptic(); bar.dispatchEvent(new CustomEvent('lgchange', { bubbles: true, detail: { v: /^-?\d+$/.test(os[k].dataset.v) ? Number(os[k].dataset.v) : os[k].dataset.v, i: k } })); }
    };
    document.addEventListener('pointerdown', e => {
      const bar = e.target.closest('.lgbar'); if (!bar || e.button > 0) return;
      const r = bar.getBoundingClientRect(), n = opts(bar).length;
      g = { bar, id: e.pointerId, x0: e.clientX, y0: e.clientY, r, n, seg: (r.width - 6) / n, moved: false, p: Number(bar.dataset.i), lx: e.clientX, lt: performance.now() };
      // 像系统的分段控件：一按下水滴就浮起变大（iPhone / Mac 上换成原生的透明玻璃透镜），按着就能拖
      bar.classList.add('dragging');
    }, true);
    document.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g.bar.classList.remove('dragging'); g = null; return; } // 竖着划：交给页面滚动，水滴落回去
        if (Math.abs(dx) < 6) return;
        g.moved = true; UI._hdrag = true;
        try { g.bar.setPointerCapture(e.pointerId); } catch (_) {}
        UI.cancelPresses && UI.cancelPresses();
      }
      const now = performance.now(), v = (e.clientX - g.lx) / Math.max(1, now - g.lt); g.lx = e.clientX; g.lt = now;
      g.p = Math.max(-0.25, Math.min(g.n - 0.75, (e.clientX - g.r.left - 3 - g.seg / 2) / g.seg));
      g.bar.style.setProperty('--p', g.p);
      g.bar.style.setProperty('--sx', 1 + Math.min(0.3, Math.abs(v) * 0.18)); // 越快拉得越长
      near(g.bar, g.p);
      const k = Math.round(Math.max(0, Math.min(g.n - 1, g.p)));
      if (k !== g.last) { if (g.last !== undefined) haptic(); g.last = k; }
    }, true);
    const end = e => {
      if (!g || e.pointerId !== g.id) return;
      const s = g; g = null; UI._hdrag = false;
      if (s.moved) { s.bar._swallow = Date.now(); pick(s.bar, Math.round(Math.max(0, Math.min(s.n - 1, s.p)))); return; }
      if (e.type === 'pointercancel') { s.bar.classList.remove('dragging'); return; }
      const o = e.target.closest && e.target.closest('.lg-opt');
      pick(s.bar, o && s.bar.contains(o) ? Number(o.dataset.i) : Math.max(0, Math.min(s.n - 1, Math.floor((e.clientX - s.r.left - 3) / s.seg))));
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  }
  // ---------- 优先级拖动条：从左到右 = 无 → 低 → 中 → 高 ----------
  // 条上铺天蓝 → 琥珀 → 朱红的渐变，填到哪里就露出多少：越重要越暖，一眼看出轻重。
  // 按住拖动连续跟手，松手吸到最近的一档；点下面的字或条上任意位置直接跳过去。和 lgBar 一样发 lgchange
  const PB_N = 4, PB_NAMES = () => MC.PRI_ASC.map(p => p.name), PB_FULL = () => MC.PRI_ASC.map(p => p.full);
  UI.priBar = (cur, opts = {}) => {
    const k = Math.max(0, Math.min(PB_N - 1, Number(cur) || 0)), names = PB_NAMES();
    return `<div class="pbar${opts.compact ? ' compact' : ''}" role="slider" tabindex="0" aria-label="优先级" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${k}" aria-valuetext="${esc(PB_FULL()[k])}" data-i="${k}" style="--f:${k / (PB_N - 1)}">`
      + `<div class="pb-track"><div class="pb-fill"></div>${[0, 1, 2, 3].map(j => `<i class="pb-stop" style="--j:${j / (PB_N - 1)}"></i>`).join('')}<span class="pb-thumb"></span></div>`
      + `<div class="pb-ticks">${names.map((n, j) => `<span class="pb-tick${j === k ? ' on' : ''}" data-i="${j}" style="--j:${j / (PB_N - 1)}" data-uc>${esc(n)}</span>`).join('')}</div></div>`;
  };
  // 优先级的小图标（列表、菜单）：一根迷你条，渐变填到对应位置
  UI.priMini = p => `<span class="flag pmini" style="--f:${Math.max(0, Math.min(3, p || 0)) / 3}" aria-hidden="true"><i></i></span>`;
  {
    let g = null;
    const setF = (bar, f) => bar.style.setProperty('--f', f);
    const ticksOn = (bar, k) => bar.querySelectorAll('.pb-tick').forEach((t, j) => t.classList.toggle('on', j === k));
    const pick = (bar, k) => {
      const was = Number(bar.dataset.i);
      bar.classList.remove('dragging');
      setF(bar, k / (PB_N - 1)); bar.dataset.i = k; ticksOn(bar, k);
      bar.setAttribute('aria-valuenow', k); bar.setAttribute('aria-valuetext', PB_FULL()[k]);
      if (k !== was) { haptic(); bar.dispatchEvent(new CustomEvent('lgchange', { bubbles: true, detail: { v: MC.PRI_ASC[k].v, i: k } })); }
    };
    const fAt = (s, x) => Math.max(0, Math.min(1, (x - s.r.left - s.pad) / Math.max(1, s.r.width - s.pad * 2)));
    document.addEventListener('pointerdown', e => {
      const bar = e.target.closest && e.target.closest('.pbar'); if (!bar || e.button > 0) return;
      const tr = bar.querySelector('.pb-track'), r = tr.getBoundingClientRect(), th = bar.querySelector('.pb-thumb').offsetWidth || 28;
      g = { bar, id: e.pointerId, x0: e.clientX, y0: e.clientY, r, pad: 3 + th / 2, moved: false, last: Number(bar.dataset.i) };
    }, true);
    document.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }   // 竖着划：交给页面滚动
        if (Math.abs(dx) < 5) return;
        g.moved = true; g.bar.classList.add('dragging'); UI._hdrag = true;
        try { g.bar.setPointerCapture(e.pointerId); } catch (_) {}
        UI.cancelPresses && UI.cancelPresses();
      }
      const f = fAt(g, e.clientX), k = Math.round(f * (PB_N - 1));
      setF(g.bar, f); ticksOn(g.bar, k);
      if (k !== g.last) { haptic(); g.last = k; }    // 经过每一档轻轻一下
    }, true);
    const end = e => {
      if (!g || e.pointerId !== g.id) return;
      const s = g; g = null; UI._hdrag = false;
      if (e.type === 'pointercancel' && !s.moved) return;
      const t = !s.moved && e.target.closest && e.target.closest('.pb-tick');
      const k = t && s.bar.contains(t) ? Number(t.dataset.i) : Math.round(fAt(s, e.clientX) * (PB_N - 1));
      if (s.moved) s.bar._swallow = Date.now();
      pick(s.bar, k);
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('keydown', e => {
      const bar = e.target.closest && e.target.closest('.pbar'); if (!bar) return;
      const k = Number(bar.dataset.i), d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (d) { e.preventDefault(); pick(bar, Math.max(0, Math.min(PB_N - 1, k + d))); }
    });
  }
  // 拖优先级条、等级 / 分段的水滴时：已经横着拖起来了，就不让面板跟着上下滑（用户发现斜着拖会带着面板走）
  document.addEventListener('touchmove', e => { if (UI._hdrag && e.cancelable) { e.preventDefault(); e.stopPropagation(); } }, { passive: false, capture: true });
  UI.doneFeedback = () => { haptic(); chime(); };

  // ---------- 事件的快捷操作：长按（手机）或右键（电脑）弹出 ----------
  UI.haptic = () => haptic();
  const snap = e => JSON.parse(JSON.stringify(e));
  // 删除一个或多个事件，提示里带「撤销」
  UI.removeEvents = (list, msg, alsoUndo) => {
    if (!list.length) return;
    const saved = list.map(snap), ids = new Set(list.map(e => e.id)), t = Date.now();
    MC.data.events = MC.data.events.filter(e => !ids.has(e.id));
    ids.forEach(id => (MC.data.deleted[id] = t));
    MC.commit();
    UI.undoable(msg || (list.length > 1 ? `已删除 ${list.length} 个事件` : '已删除'), () => { if (alsoUndo) alsoUndo(); MC.restoreEvents(saved); });
  };
  // 改日期（移到今天 / 明天），可以撤销
  UI.moveEvents = (list, ds, msg) => {
    const before = list.map(e => [e, e.date]);
    const t = Date.now();
    list.forEach(e => { e.date = ds; e.updatedAt = t; });
    MC.commit();
    UI.undoable(msg, () => { const t2 = Date.now(); before.forEach(([e, d]) => { e.date = d; e.updatedAt = t2; }); MC.commit(); });
  };
  UI.itemMenu = (anchor, e) => {
    const today = MC.todayStr(), tmr = MC.ymd(MC.addDays(new Date(), 1));
    const items = [{ label: e.done ? '标为未完成' : '标为完成', value: 'toggle' }];
    if (!e.done && e.date !== today) items.push({ label: '移到今天', value: 'today' });
    if (!e.done && e.date !== tmr) items.push({ label: '移到明天', value: 'tmr' });
    items.push({ label: MC.rateOn(e.cal) ? '等级' : '优先级', value: 'pri' }, { label: '编辑', value: 'edit' }, { label: '删除', value: 'del', danger: true });
    UI.menu(anchor, items, v => {
      if (!MC.data.events.includes(e)) return;
      if (v === 'toggle') { if (!e.done) { UI.justDone = e.id; UI.doneFeedback(); } MC.updateEvent(e, { done: !e.done }); }
      else if (v === 'today') UI.moveEvents([e], today, '已移到今天');
      else if (v === 'tmr') UI.moveEvents([e], tmr, '已移到明天');
      else if (v === 'pri') setTimeout(() => (MC.rateOn(e.cal) ? UI.menu(anchor, UI.rateMenuItems(e.cal, e.rate), p => MC.updateEvent(e, { rate: p })) : UI.menu(anchor, UI.priMenuItems(e.priority), p => MC.updateEvent(e, { priority: p }))), 60);
      else if (v === 'edit') MC.Editor.openEdit(e);
      else if (v === 'del') UI.removeEvents([e], '已删除');
    });
  };
  // 长按：按住约半秒、手指没怎么动；之后的那次点击不再打开编辑
  // 别的手势接管了手指（比如往右拉侧栏，会拦下 touchmove）时，用 UI.cancelPresses() 取消还在计时的长按
  // 新建时自动把光标放进输入框：只在电脑上（手机上会马上弹出键盘、挡住半个面板）
  UI.desktopFocus = el => { if (el && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches) el.focus({ preventScroll: true }); };
  const presses = new Set();
  UI.cancelPresses = () => presses.forEach(c => c());
  UI.longPress = (el, sel, fn) => {
    let lp = null, lastTouch = 0, swallowClick = false;
    const cancel = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
    presses.add(cancel);
    el.addEventListener('touchstart', ev => {
      lastTouch = Date.now(); cancel();
      if (ev.touches.length !== 1) return;
      const target = ev.target.closest(sel); if (!target || !el.contains(target)) return;
      const x = ev.touches[0].clientX, y = ev.touches[0].clientY;
      lp = { x, y, t: setTimeout(() => { lp = null; swallowClick = true; setTimeout(() => (swallowClick = false), 600); haptic(); fn(target, ev); }, 480) };
    }, { passive: true });
    el.addEventListener('touchmove', ev => { if (lp && Math.hypot(ev.touches[0].clientX - lp.x, ev.touches[0].clientY - lp.y) > 9) cancel(); }, { passive: true });
    el.addEventListener('touchend', () => { lastTouch = Date.now(); cancel(); });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('contextmenu', ev => {
      const target = ev.target.closest(sel); if (!target || !el.contains(target)) return;
      ev.preventDefault();
      if (Date.now() - lastTouch < 900) return; // 手机长按也会发右键事件，上面已经处理过了
      fn(target, ev);
    });
    el.addEventListener('click', ev => { if (swallowClick) { swallowClick = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  };

  // 统一处理列表点击：勾选 / 打开编辑；长按或右键：快捷操作
  UI.bindList = el => {
    UI.longPress(el, '.item', li => {
      const e = MC.data.events.find(x => x.id === li.dataset.id);
      if (e) UI.itemMenu(li.querySelector('.item-main') || li, e);
    });
    // 往左滑：露出「编辑」「删除」（删除要确认）；点别处或往右滑收回。直接点照旧
    const ACT_W = 148;
    let sw = null, openLi = null;
    const setX = (li, x, anim) => { li.style.setProperty('--sx', x + 'px'); li.classList.toggle('sw-anim', !!anim); li.classList.toggle('swiping', x !== 0); };
    const closeOpen = () => { if (openLi) { setX(openLi, 0, true); openLi = null; } };
    el.addEventListener('touchstart', ev => {
      const li = ev.target.closest('.item'); if (!li || !li.querySelector('.swipe-acts') || ev.touches.length !== 1) { sw = null; return; }
      if (openLi && openLi !== li) closeOpen();
      const t = ev.touches[0];
      sw = { li, x0: t.clientX, y0: t.clientY, base: li === openLi ? -ACT_W : 0, mode: 0, x: 0 };
    }, { passive: true });
    el.addEventListener('touchmove', ev => {
      if (!sw) return;
      const t = ev.touches[0], dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
      if (!sw.mode) {
        if (Math.hypot(dx, dy) < 8) return;
        sw.mode = Math.abs(dx) > Math.abs(dy) * 1.4 && (dx < 0 || sw.base) ? 1 : -1; // 只认往左滑（已经滑开的才认往右滑）
        if (sw.mode === 1) UI.cancelPresses();
      }
      if (sw.mode !== 1) return;
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
      sw.x = Math.min(0, Math.max(-ACT_W * 1.3, sw.base + dx));
      setX(sw.li, sw.x, false);
    }, { passive: false, capture: true });
    el.addEventListener('touchend', () => {
      if (!sw) return;
      const s = sw; sw = null;
      if (s.mode !== 1) return;
      const open = s.x < -ACT_W / 2;
      setX(s.li, open ? -ACT_W : 0, true);
      openLi = open ? s.li : null;
      el._swUntil = Date.now() + 350; // 松手时补发的点击不算
    });
    el.addEventListener('click', ev => {
      if (el._swUntil && Date.now() < el._swUntil) { ev.stopPropagation(); ev.preventDefault(); return; }
      const li = ev.target.closest('.item'); if (!li) return;
      if (li.classList.contains('dvi')) { const dv = li.dataset.id.split(':')[1]; if (MC.Days && MC.Days.openDetail) MC.Days.openDetail(dv); return; }   // 纪念日：打开详情页
      const e = MC.data.events.find(x => x.id === li.dataset.id); if (!e) return;
      // 整条都能点开编辑：只有完成框、滑出来的按钮有自己的动作
      const act = ev.target.closest('[data-act]')?.dataset.act || (ev.target.closest('.swipe-acts') ? null : 'open');
      if (openLi === li && act !== 'edit' && act !== 'del') { closeOpen(); return; } // 滑开了：点一下先收回
      if (act === 'edit') { closeOpen(); MC.Editor.openEdit(e); return; }
      if (act === 'del') {
        UI.confirm(`删除「${e.title}」？`, { ok: '删除', danger: true }).then(ok => { closeOpen(); if (ok) UI.removeEvents([e], `已删除「${e.title}」`); });
        return;
      }
      if (act === 'toggle') {
        UI.justDone = e.done ? null : e.id;  // 刚勾选完成的那一条播放划线动画
        if (!e.done) UI.doneFeedback();      // 只在勾上完成时：一声 + 一点点触感
        MC.updateEvent(e, { done: !e.done });
        setTimeout(() => { if (UI.justDone === e.id) UI.justDone = null; }, 700);
      }
      else if (act === 'open') MC.Editor.openEdit(e);
    });
  };

  // ---------- 滚轮选择器 ----------
  // cols: [{ items:[{label,value}], value, flex }]，onChange(colIndex, value)；ITEM 为每行高度
  UI.wheel = (host, cols, onChange, ITEM = 36) => {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wheel';
    wrap.innerHTML = `<div class="wheel-band glass" style="top:${ITEM * 2}px;height:${ITEM}px"></div>`;
    wrap.style.height = ITEM * 5 + 'px';
    if (ITEM > 36) wrap.classList.add('big');
    host.appendChild(wrap);
    const api = { cols: [] };
    cols.forEach((c, ci) => {
      if (c.sep) { const s = document.createElement('div'); s.className = 'wsep'; s.textContent = c.sep; wrap.appendChild(s); api.cols.push(null); return; }
      const sc = document.createElement('div');
      sc.className = 'wcolw';
      sc.style.flex = c.flex || 1;
      wrap.appendChild(sc);
      const col = {
        sc, items: [], idx: 0,
        set(items, value) {
          this.items = items;
          const pad = `<div class="wpad" style="height:${ITEM * 2}px"></div>`;
          sc.innerHTML = pad + items.map((it, i) => `<div class="witem" data-i="${i}" style="height:${ITEM}px;line-height:${ITEM}px">${esc(it.label)}</div>`).join('') + pad;
          let i = items.findIndex(it => it.value === value);
          if (i < 0) i = 0;
          this.idx = i;
          sc.scrollTop = i * ITEM;
          requestAnimationFrame(() => { sc.scrollTop = i * ITEM; });
          this.mark();
        },
        mark() { sc.querySelectorAll('.witem').forEach(el => el.classList.toggle('on', Number(el.dataset.i) === this.idx)); },
        get value() { return this.items[this.idx] && this.items[this.idx].value; },
      };
      let t;
      sc.addEventListener('scroll', () => {
        const i = Math.max(0, Math.min(col.items.length - 1, Math.round(sc.scrollTop / ITEM)));
        if (i !== col.idx) { col.idx = i; col.mark(); onChange && onChange(ci, col.value); }
        clearTimeout(t);
        t = setTimeout(() => { if (Math.abs(sc.scrollTop - col.idx * ITEM) > 1) sc.scrollTo({ top: col.idx * ITEM, behavior: 'smooth' }); }, 140);
      }, { passive: true });
      sc.addEventListener('click', e => {
        const it = e.target.closest('.witem'); if (!it) return;
        sc.scrollTo({ top: Number(it.dataset.i) * ITEM, behavior: 'smooth' });
      });
      col.set(c.items, c.value);
      api.cols.push(col);
    });
    return api;
  };

  // 日期滚轮：年 / 月 / 日
  UI.dateWheel = (host, ds, onChange, itemH = 36) => {
    const d = MC.parse(ds);
    const now = new Date().getFullYear();
    const years = []; for (let y = now - 5; y <= now + 10; y++) years.push({ label: y + '年', value: y });
    const months = []; for (let m = 1; m <= 12; m++) months.push({ label: m + '月', value: m });
    const daysOf = (y, m) => {
      const n = new Date(y, m, 0).getDate(), out = [];
      for (let i = 1; i <= n; i++) out.push({ label: `${i}日 周${MC.WD[new Date(y, m - 1, i).getDay()]}`, value: i });
      return out;
    };
    let y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const w = UI.wheel(host, [
      { items: years, value: y, flex: 1 },
      { items: months, value: m, flex: .8 },
      { items: daysOf(y, m), value: day, flex: 1.4 },
    ], (ci, v) => {
      if (ci === 0) y = v; else if (ci === 1) m = v; else day = v;
      if (ci < 2) {
        const max = new Date(y, m, 0).getDate();
        day = Math.min(day, max);
        w.cols[2].set(daysOf(y, m), day);
      }
      onChange(`${y}-${MC.pad(m)}-${MC.pad(day)}`);
    }, itemH);
    return w;
  };

  // 时间滚轮：时 : 分（可选结束时间）
  UI.timeWheel = (host, start, end, onChange) => {
    const h12 = MC.use12();
    const hours = []; for (let h = 0; h < 24; h++) hours.push({ label: h12 ? MC.hourLabel(h) : MC.pad(h), value: h });
    const mins = m0 => {
      const out = []; for (let m = 0; m < 60; m += 5) out.push({ label: MC.pad(m), value: m });
      if (m0 % 5) { out.push({ label: MC.pad(m0), value: m0 }); out.sort((a, b) => a.value - b.value); }
      return out;
    };
    const [sh, sm] = start.split(':').map(Number);
    const cols = [{ items: hours, value: sh }, { sep: ':' }, { items: mins(sm), value: sm }];
    let eh, em;
    if (end) {
      [eh, em] = end.split(':').map(Number);
      cols.push({ sep: '–' }, { items: hours, value: eh }, { sep: ':' }, { items: mins(em), value: em });
    }
    const w = UI.wheel(host, cols, () => {
      const s = `${MC.pad(w.cols[0].value)}:${MC.pad(w.cols[2].value)}`;
      const e = end ? `${MC.pad(w.cols[4].value)}:${MC.pad(w.cols[6].value)}` : '';
      onChange(s, e);
    });
    return w;
  };

  // ---------- 原生液态玻璃（iPhone / Mac App）：网页画不出系统的 Liquid Glass，由原生画在网页按钮的位置上 ----------
  // App 调用 MC.LG.start(post) 后：每一帧找出屏幕上看得见的玻璃控件（按钮、胶囊、优先级的水滴、纪念日历照片上的按钮和牌子），
  // 把位置、圆角、裁剪范围发给原生；网页自己的毛玻璃底去掉（字和图标还是网页画，原生的透明玻璃盖在上面）。
  // 只给「控件」用液态玻璃（和 Apple 的规则一样）；面板、卡片、提示条还是毛玻璃。
  // 透明相机里的按钮、分段、卡片不交给原生画：压在实时相机画面上，原生玻璃常常画不出来，网页又把字藏了，结果整个相机界面什么都看不见
  // 【联动:原生玻璃】见 CLAUDE.md「联动分组」
  const LG_SEL = '.glass:not(.accent):not(.glass-panel):not(.tabbar), .lg-thumb, .cv-pin, .dp-btn, .lgn, .dv-cover.photo .cv-tile'
    + ', .pod-today .face, .fan:not(.fan-add) .face, .set-back .face, .pb-thumb';   // 顶部标题板（月份、星期）是网页自己画的半透明板，不再走原生玻璃   // 星期条也是一条原生液态玻璃 // 日历页的悬浮控件（时钟胶囊、扇形按钮、设置页返回、月份胶囊）；logo 和分页点里是图片 / 圆点，原生画不了，留给网页
  const LG_DARK = '.dp-btn, .dp-setcover, .cv-pin, .cam-btn, .cam-chips, .lgn-dark, .cv-plate, .cv-tile, .dp-plate, .cam-pill'; // 压在照片 / 相机画面上的：用偏暗的玻璃，白字看得清
  const LAYERS = '.sheet.show, .dp.show, .cam.show, .cam-res, .confirm.show, .popover.show, #pvDoc.show';   // #pvDoc：隐私政策整页盖上去时，下面设置页的玻璃返回键不画（不然两个返回键）
  // 自定义 SVG 图标转成 PNG（data URL）：把 CSS 里的线宽、颜色写进图标本身，按 3 倍大小画到画布上；同样的图标只转一次
  const rasterCache = new Map();
  function rasterIcon(sv) {
    // 图标被 CSS 转过（纪念相机横着拿时，按钮图标转正）：按转到的角度（取最近的 90°）画进图片，原生玻璃上的图标也跟着转
    const cs = getComputedStyle(sv), m = /matrix\(([^,]+),\s*([^,]+)/.exec(cs.transform || ''), deg = m ? Math.round(Math.atan2(+m[2], +m[1]) * 180 / Math.PI / 90) * 90 : 0;
    const w = Math.round(parseFloat(cs.width) || sv.getBoundingClientRect().width), key = (sv.getAttribute('viewBox') || '') + sv.innerHTML + cs.color + w + '@' + deg; // 不含 class：转好后加的 lgr（把网页的藏起来）不算换了图标
    if (rasterCache.has(key)) return rasterCache.get(key);
    rasterCache.set(key, null);
    const c = sv.cloneNode(true), all = [c, ...c.querySelectorAll('*')], src = [sv, ...sv.querySelectorAll('*')];
    all.forEach((e, i) => { const s = getComputedStyle(src[i]); ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].forEach(p => e.setAttribute(p, s.getPropertyValue(p).replace(/currentcolor/i, cs.color))); });
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', w * 3); c.setAttribute('height', w * 3); c.removeAttribute('class');
    const im = new Image();
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = w * 3; const g = cv.getContext('2d'); if (deg) { g.translate(w * 1.5, w * 1.5); g.rotate(deg * Math.PI / 180); g.translate(-w * 1.5, -w * 1.5); } g.drawImage(im, 0, 0, w * 3, w * 3); rasterCache.set(key, cv.toDataURL('image/png')); };
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
    return null;
  }
  MC.LG = {
    start(post) {
      if (MC.LG.on) return; MC.LG.on = true;
      document.documentElement.classList.add('lg-native');
      let last = '', ids = new WeakMap(), seq = 0;
      const clipOf = el => { // 往上找会裁剪内容的祖先（滚动区、overflow 隐藏）
        const out = [];
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') out.push(a);
        }
        return out;
      };
      // #rrggbb / #rgb → rgb(r, g, b)（原生只认 rgb()）
      const cssRGB = v => { const h = (v || '').trim().replace('#', ''); if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return ''; const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return `rgb(${parseInt(f.slice(0, 2), 16)}, ${parseInt(f.slice(2, 4), 16)}, ${parseInt(f.slice(4, 6), 16)})`; };
      const clips = new WeakMap();
      const frame = () => {
        requestAnimationFrame(frame);
        if (document.hidden) return;
        // 最上面那一层（面板、确认框、纪念日详情、相机）：只画这一层里的玻璃，被盖住的不画
        let top = null, tz = -1;
        document.querySelectorAll(LAYERS).forEach(l => { const z = Number(getComputedStyle(l).zIndex) || 0; if (z >= tz) { tz = z; top = l; } });
        const W = innerWidth, H = innerHeight, out = [], shown = new Set();
        // 今日页打开着、或者正在从时钟胶囊展开 / 收回：它盖在别的页面上面，别的页面里的玻璃（月份胶囊、星期条）不画，不然原生玻璃浮在今日页上面
        const td = document.querySelector('#page-today.active, #page-today.pv-hold');
        document.querySelectorAll(LG_SEL).forEach(el => {
          if (top && !top.contains(el)) return;
          if (td && !td.contains(el) && el.closest('.page')) return;
          if (el.closest('.page.pv-hold:not(.active)')) return;   // 垫在下面的那一页（整页滑动返回、今日页收放时露出来的）：它的玻璃不画，不然原生玻璃会浮到上面那页之上
          if (!top && el.closest('.sheet, .dp, .cam, .popover')) return;
          if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
            if (!el.classList.contains('lg-thumb')) return; // 水滴在网页里是透明的（只给原生画），照样要发
            if (!el.closest('.lgbar').checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
          }
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return;
          let cx = 0, cy = 0, cx2 = W, cy2 = H;
          if (!clips.has(el)) clips.set(el, clipOf(el));
          for (const a of clips.get(el)) { const q = a.getBoundingClientRect(); cx = Math.max(cx, q.left); cy = Math.max(cy, q.top); cx2 = Math.min(cx2, q.right); cy2 = Math.min(cy2, q.bottom); }
          if (cx2 - cx < 1 || cy2 - cy < 1) return;
          // 移动速度（px/ms，平滑过）：原生收到位置要晚一两帧，它按这个速度每一帧自己往前推算，滚动时玻璃紧贴着控件走
          const tnow = performance.now(), pv = el._lgPos;
          let vx = 0, vy = 0;
          if (pv && tnow - pv[2] < 100) {
            const dt = Math.max(1, tnow - pv[2]), ix = (r.left - pv[0]) / dt, iy = (r.top - pv[1]) / dt;
            vx = Math.abs(r.left - pv[0]) < 0.3 ? 0 : pv[3] * 0.4 + ix * 0.6; vy = Math.abs(r.top - pv[1]) < 0.3 ? 0 : pv[4] * 0.4 + iy * 0.6;
          }
          el._lgPos = [r.left, r.top, tnow, vx, vy];
          if (!ids.has(el)) ids.set(el, ++seq);
          const cs = getComputedStyle(el), rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2);
          const thumb = el.classList.contains('lg-thumb');
          if (thumb && !el.parentElement.classList.contains('dragging')) return;
          // 优先级条的滑块同理：停着时由网页画（跟着面板一起移动，不会抖）；按住拖的时候才换成原生玻璃透镜。
          // （原生收到位置要晚一两帧、按速度往前推算，面板上下滑时推算不准，滑块就会跟着抖——用户发现的）
          if (el.classList.contains('pb-thumb') && !el.closest('.pbar.dragging')) return; // 水滴停着时是网页画的白色底板（和系统的分段控件一样），按住拖动时才变成原生的玻璃透镜
          const k = thumb ? 'l' : el.matches('.cv-plate, .dp-plate, .cam-card') ? 'p' : el.matches(LG_DARK) ? 'd' : 'g'; // p：照片上带字的牌子；d：照片 / 相机上的按钮
          const sc = el.offsetWidth ? r.width / el.offsetWidth : 1; // 被缩放过（相机里双指缩放的卡片）：字号跟着缩放
          const n = v => Math.round(v * 10) / 10;
          // 原生要画在玻璃上面的内容：网页排好的每一段字（位置、字号、粗细、颜色、字距、等宽数字、圆体）、每个图标（系统符号）、
          // 里面的浅色底块（比如相机分段里选中的那段）。原生照着位置一模一样画在玻璃上面，网页这边只把字和这些图标藏起来
          const runs = [], icons = [], pads = [];
          // 按着拖的水滴（透镜）：把它盖住的那几格字交给原生，放大 1.12 倍、清清楚楚地画在透镜上面（像系统分段控件的放大镜）
          if (thumb) {
            const rg = document.createRange();
            el.parentElement.querySelectorAll('.lg-opt span[data-uc]').forEach(sp => {
              const tn = sp.firstChild; if (!tn || !tn.nodeValue.trim()) return;
              rg.selectNodeContents(tn); const q = rg.getBoundingClientRect(); if (!q.width) return;
              if (q.right < r.left || q.left > r.right) return;
              const ps = getComputedStyle(sp), k = 1.12, cxq = q.left + q.width / 2, cyq = q.top + q.height / 2;
              runs.push([n(cxq - q.width * k / 2), n(cyq - q.height * k / 2), n(q.width * k), n(q.height * k), tn.nodeValue.trim(), (parseFloat(ps.fontSize) || 14) / (parseFloat(getComputedStyle(sp.parentElement).scale) || 1) * k,
                parseInt(ps.fontWeight) || 600, getComputedStyle(sp.parentElement).color, 0, 0]);
            });
          }
          if (!thumb) {
            {
              const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rg = document.createRange();
              for (let tn = tw.nextNode(); tn; tn = tw.nextNode()) {
                const txt = tn.nodeValue.replace(/\s+/g, ' ').trim(); if (!txt) continue;
                const pe = tn.parentElement; if (pe.closest('svg')) continue;
                const ps = getComputedStyle(pe); if (ps.display === 'none' || ps.visibility === 'hidden') continue;
                rg.selectNodeContents(tn); const q = rg.getBoundingClientRect(); if (!q.width) continue;
                const ls = parseFloat(ps.letterSpacing) || 0;
                runs.push([n(q.left), n(q.top), n(q.width), n(q.height), txt, (parseFloat(ps.fontSize) || 15) * sc, parseInt(ps.fontWeight) || 400, ps.color, n(ls * sc),
                  (ps.fontVariantNumeric.includes('tabular') ? 1 : 0) + (/rounded/i.test(ps.fontFamily) ? 2 : 0)]);
              }
              el.querySelectorAll('svg').forEach(sv => {
                const q = sv.getBoundingClientRect(); if (!q.width) return;
                if (sv.dataset.sf) { icons.push([n(q.left), n(q.top), n(q.width), n(q.height), sv.dataset.sf, getComputedStyle(sv).color, parseFloat(getComputedStyle(sv).strokeWidth) || 2]); return; }
                // 没有对应系统符号的自定义图标（纪念日的蛋糕、礼物…）：转成图片交给原生画在玻璃上面，转好之前网页的照常显示
                const img = rasterIcon(sv); if (img) { sv.classList.add('lgr'); icons.push([n(q.left), n(q.top), n(q.width), n(q.height), img, '', 0]); }
              });
              el.querySelectorAll('.on').forEach(o => { const q = o.getBoundingClientRect(); if (q.width) pads.push([n(q.left), n(q.top), n(q.width), n(q.height), n(Math.min(parseFloat(getComputedStyle(o).borderTopLeftRadius) || 0, q.height / 2))]); });
              // 带颜色的小色块（月份胶囊里记录日历的名字）：第 6 项带上颜色，原生画在玻璃上面、字的下面，不然色块被压在玻璃底下发糊
              // 在 .lgx 里网页这份底色被设成透明了，读 backgroundColor 只会拿到透明：改读日历色 --cc，转成原生认得的 rgb()
              el.querySelectorAll('.cal-chip:not([hidden])').forEach(o => { const q = o.getBoundingClientRect(), oc = getComputedStyle(o); if (q.width) pads.push([n(q.left), n(q.top), n(q.width), n(q.height), n(Math.min(parseFloat(oc.borderTopLeftRadius) || 0, q.height / 2)), cssRGB(oc.getPropertyValue('--cc')) || oc.backgroundColor]); });
            }
          }
          const tint = el.classList.contains('lgx') ? (el.lgBg || '') : (el.lgBg = cs.backgroundColor); // 网页原来的底色：拿来给玻璃着一点色
          out.push([ids.get(el), n(r.left), n(r.top), n(r.width), n(r.height), n(rad), n(cx), n(cy), n(cx2 - cx), n(cy2 - cy), k,
            runs, icons, pads, tint, Math.round(vx * 1000) / 1000, Math.round(vy * 1000) / 1000,
            thumb ? 1 : n(Number(cs.opacity) || 0)]);   // 第 18 项：网页里这个控件的透明度（比如滚动时变淡的星期条），原生按它画【联动:原生玻璃】；水滴在网页里故意是透明的（只给原生画），永远按 1
          shown.add(el);
        });
        // 盖在玻璃上面的网页东西（提示条）：原生的玻璃在这里挖掉，不然会挡住它
        const holes = [];
        document.querySelectorAll('#toast.show').forEach(t => { const r = t.getBoundingClientRect(); if (r.width) holes.push([...[r.left, r.top, r.width, r.height].map(v => Math.round(v)), 14]); });
        // 固定在顶上的栏（纪念日历的筛选栏、记录统计的切换栏）：内容滚到它下面时，玻璃也要被它挡住
        // 只在没有更上面一层（纪念日详情、面板…）时才算：不然下面那页的筛选栏会把详情页顶上的返回、编辑按钮挖掉一条
        if (!top) document.querySelectorAll('.page.active .dv-bar, .page.active .rs-ctl').forEach(t => { const r = t.getBoundingClientRect(); if (r.width && r.height) holes.push([...[r.left, r.top, r.width, r.height].map(v => Math.round(v)), 0]); });
        // 纪念日详情：下面的内容区往上盖住照片底部（圆角），牌子的玻璃也要被它挡住
        document.querySelectorAll('.dp.show .dp-body').forEach(t => { const r = t.getBoundingClientRect(); if (r.width && r.top < H) holes.push([...[r.left, r.top, r.width, Math.min(r.height, H - r.top + 40)].map(v => Math.round(v)), 26]); });
        // 原生正在画的控件：网页自己的字和图标藏起来（不然会被玻璃糊住、和原生画的叠在一起）；不画了就恢复
        document.querySelectorAll('.lgx').forEach(e => { if (!shown.has(e)) e.classList.remove('lgx'); });
        shown.forEach(e => { if (!e.classList.contains('lg-thumb')) e.classList.add('lgx'); });
        const j = JSON.stringify({ i: out, h: holes, t: Date.now() });
        const jj = j.replace(/,"t":\d+}$/, '}'); // 时间戳不算变化：停着时不重复发
        if (jj !== last) { last = jj; post(j); }
      };
      requestAnimationFrame(frame);
    },
  };
})();
