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
    if (UI.menuOpen()) UI.closeMenu();
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
    if (!stack.length) { backdrop.classList.remove('show'); return; }
    const top = $('#' + stack[stack.length - 1]);
    backdrop.style.zIndex = (parseInt(getComputedStyle(top).zIndex, 10) || 30) - 1;
    backdrop.classList.add('show');
  }
  UI.open = (id, closeCb) => {
    if (!stack.includes(id)) stack.push(id);
    if (closeCb) onClose[id] = closeCb;
    $('#' + id).classList.add('show');
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
    $('#' + id).classList.remove('show');
    const a = document.activeElement;
    if (a && $('#' + id).contains(a)) a.blur();
    syncBackdrop();
    const cb = onClose[id]; delete onClose[id];
    if (cb) cb();
  };
  backdrop.addEventListener('click', () => UI.close());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (UI.confirmOpen()) UI.closeConfirm(); else if (UI.menuOpen()) UI.closeMenu(); else if (stack.length) UI.close();
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
      grab = sizing && !!e.target.closest('.handle, .cmp-head, .sheet-head') && !e.target.closest('button');
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
  UI.menu = (anchor, items, cb) => {
    popCb = cb;
    pop.innerHTML = items.map((it, i) =>
      `<button role="menuitem" data-i="${i}" class="${it.on ? 'on' : ''}${it.danger ? ' danger' : ''}">${it.icon || ''}<span>${esc(it.label)}</span>${it.on ? '<span class="tick">✓</span>' : ''}</button>`).join('');
    pop.classList.add('show');
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(Math.max(10, r.left + r.width / 2 - pw / 2), window.innerWidth - pw - 10);
    if (r.left < 80) left = Math.max(10, r.left);
    const above = r.top - ph - 8 > 10;
    const top = above ? r.top - ph - 8 : r.bottom + 8;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    pop.style.setProperty('--ox', (r.left + r.width / 2 - left) + 'px');
    pop.style.setProperty('--oy', above ? '100%' : '0%');
    pop.querySelectorAll('button').forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const it = items[Number(b.dataset.i)];
      UI.closeMenu();
      if (popCb) popCb(it.value, it);
    });
  };
  UI.closeMenu = () => pop.classList.remove('show');
  let swallow = false;
  document.addEventListener('pointerdown', e => {
    if (UI.menuOpen() && !pop.contains(e.target)) { UI.closeMenu(); swallow = true; setTimeout(() => (swallow = false), 400); }
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
    return `<li class="item${e.done ? ' done' : ''}${e.done && UI.justDone === e.id ? ' just-done' : ''}" data-id="${e.id}" style="--c:${MC.evColor(e)}">
      <button class="check" data-act="toggle" aria-label="${e.done ? '标为未完成' : '标为完成'}">${checkSVG}</button>
      <div class="item-main" data-act="open">
        <div class="item-title"><span class="ttxt">${esc(e.title)}</span></div>
        ${bits.length ? `<div class="item-sub">${bits.join(' · ')}</div>` : ''}
      </div>
      ${MC.rateOn(e.cal) ? (e.rate && !opts.noFlag ? UI.rateTag(e) : '') : (e.priority && !opts.noFlag ? UI.flagSVG(e.priority) : '')}
      <div class="swipe-acts" aria-hidden="true"><button data-act="edit" tabindex="-1">编辑</button><button data-act="del" class="del" tabindex="-1">删除</button></div>
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
    }, true);
    document.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } // 竖着划：交给页面滚动
        if (Math.abs(dx) < 6) return;
        g.moved = true; g.bar.classList.add('dragging');
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
      const s = g; g = null;
      if (s.moved) { s.bar._swallow = Date.now(); pick(s.bar, Math.round(Math.max(0, Math.min(s.n - 1, s.p)))); return; }
      if (e.type === 'pointercancel') return;
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
        g.moved = true; g.bar.classList.add('dragging');
        try { g.bar.setPointerCapture(e.pointerId); } catch (_) {}
        UI.cancelPresses && UI.cancelPresses();
      }
      const f = fAt(g, e.clientX), k = Math.round(f * (PB_N - 1));
      setF(g.bar, f); ticksOn(g.bar, k);
      if (k !== g.last) { haptic(); g.last = k; }    // 经过每一档轻轻一下
    }, true);
    const end = e => {
      if (!g || e.pointerId !== g.id) return;
      const s = g; g = null;
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
  const LG_SEL = '.glass:not(.accent):not(.glass-panel):not(.tabbar), .lg-thumb, .cv-pin, .dp-btn, .lgn, .dv-cover.photo .cv-tile'
    + ', .pod-today .face, .fan:not(.fan-add) .face, .set-back .face, #page-cal .topbar .title, #page-cal .weekdays, .pb-thumb';   // 星期条也是一条原生液态玻璃 // 日历页的悬浮控件（时钟胶囊、扇形按钮、设置页返回、月份胶囊）；logo 和分页点里是图片 / 圆点，原生画不了，留给网页
  const LG_DARK = '.dp-btn, .dp-setcover, .cv-pin, .cam-btn, .cam-chips, .lgn-dark, .cv-plate, .cv-tile, .dp-plate, .cam-pill'; // 压在照片 / 相机画面上的：用偏暗的玻璃，白字看得清
  const LAYERS = '.sheet.show, .dp.show, .cam.show, .cam-res, .confirm.show, .popover.show';
  // 自定义 SVG 图标转成 PNG（data URL）：把 CSS 里的线宽、颜色写进图标本身，按 3 倍大小画到画布上；同样的图标只转一次
  const rasterCache = new Map();
  function rasterIcon(sv) {
    const cs = getComputedStyle(sv), w = Math.round(sv.getBoundingClientRect().width), key = (sv.getAttribute('viewBox') || '') + sv.innerHTML + cs.color + w; // 不含 class：转好后加的 lgr（把网页的藏起来）不算换了图标
    if (rasterCache.has(key)) return rasterCache.get(key);
    rasterCache.set(key, null);
    const c = sv.cloneNode(true), all = [c, ...c.querySelectorAll('*')], src = [sv, ...sv.querySelectorAll('*')];
    all.forEach((e, i) => { const s = getComputedStyle(src[i]); ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].forEach(p => e.setAttribute(p, s.getPropertyValue(p).replace(/currentcolor/i, cs.color))); });
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', w * 3); c.setAttribute('height', w * 3); c.removeAttribute('class');
    const im = new Image();
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = w * 3; cv.getContext('2d').drawImage(im, 0, 0, w * 3, w * 3); rasterCache.set(key, cv.toDataURL('image/png')); };
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
          if (thumb && !el.parentElement.classList.contains('dragging')) return; // 水滴停着时是网页画的白色底板（和系统的分段控件一样），按住拖动时才变成原生的玻璃透镜
          const k = thumb ? 'l' : el.matches('.cv-plate, .dp-plate, .cam-card') ? 'p' : el.matches(LG_DARK) ? 'd' : 'g'; // p：照片上带字的牌子；d：照片 / 相机上的按钮
          const sc = el.offsetWidth ? r.width / el.offsetWidth : 1; // 被缩放过（相机里双指缩放的卡片）：字号跟着缩放
          const n = v => Math.round(v * 10) / 10;
          // 原生要画在玻璃上面的内容：网页排好的每一段字（位置、字号、粗细、颜色、字距、等宽数字、圆体）、每个图标（系统符号）、
          // 里面的浅色底块（比如相机分段里选中的那段）。原生照着位置一模一样画在玻璃上面，网页这边只把字和这些图标藏起来
          const runs = [], icons = [], pads = [];
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
              el.querySelectorAll('.cal-chip:not([hidden])').forEach(o => { const q = o.getBoundingClientRect(), oc = getComputedStyle(o); if (q.width) pads.push([n(q.left), n(q.top), n(q.width), n(q.height), n(Math.min(parseFloat(oc.borderTopLeftRadius) || 0, q.height / 2)), oc.backgroundColor]); });
            }
          }
          const tint = el.classList.contains('lgx') ? (el.lgBg || '') : (el.lgBg = cs.backgroundColor); // 网页原来的底色：拿来给玻璃着一点色
          out.push([ids.get(el), n(r.left), n(r.top), n(r.width), n(r.height), n(rad), n(cx), n(cy), n(cx2 - cx), n(cy2 - cy), k,
            runs, icons, pads, tint, Math.round(vx * 1000) / 1000, Math.round(vy * 1000) / 1000]);
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
