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
  const SCROLLERS = '.batch-list, .pk-body, .help-body, .form, .list, .pv-list, .composer';
  // 面板本身永远不滚动（防止浏览器为了显示输入框把整个面板顶走）
  document.querySelectorAll('.sheet').forEach(sh => sh.addEventListener('scroll', () => { if (!sh.classList.contains('composer') && sh.scrollTop) sh.scrollTop = 0; }));
  document.querySelectorAll('.sheet').forEach(sh => {
    let x0 = 0, y0 = 0, last = 0, lastT = 0, v = 0, d = 0, state = 0, sc = null, swallow = false; // state: 0 无 1 待定 2 拖动中
    sh.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || e.target.closest(EDITABLE)) { state = 0; return; }
      sc = e.target.closest(SCROLLERS);
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
        if ((dy > 0 && atTop) || (dy < 0 && !sc)) { state = 2; y0 = y; sh.style.transition = 'none'; }
        else { state = 0; return; }   // 交给内容自己滚动
      }
      v = (y - last) / Math.max(1, now - lastT); last = y; lastT = now;
      d = y - y0;
      sh.style.transform = `translateY(${d >= 0 ? d : -rubber(-d)}px)`;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (state !== 2) { state = 0; return; }
      state = 0;
      swallow = Math.abs(d) > 4;      // 拖动过就不再触发点击
      setTimeout(() => (swallow = false), 350);
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
    };
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
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
  UI.flagSVG = p => `<svg class="flag" viewBox="0 0 24 24" style="--c:${MC.priOf(p).color}"><path d="M6 21V4h11l-2.2 4.2L17 12.5H6"/></svg>`;
  // 等级评分：名称是用户自定义的，所以用文字徽标（颜色深浅随等级）而不是旗子
  UI.rateTag = e => `<span class="rate-tag lv${e.rate}" data-uc>${esc(MC.rateName(e))}</span>`;
  UI.rateMenuItems = (calId, cur) => [{ label: '未评级', value: 0, on: !cur }, ...MC.rateLabels(calId).map((n, i) => ({ label: n, value: i + 1, on: cur === i + 1 }))];
  UI.priMenuItems = cur => MC.PRI.map(p => ({ label: p.full, value: p.v, on: p.v === cur, icon: UI.flagSVG(p.v) }));
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
      if (bl.length) bits.push(`<span class="seg-mini" title="分段评价">${bl.map(b => `<i style="opacity:${[.12, .3, .5, .72, 1][e.segs[b.k] || 0]}"></i>`).join('')}</span>`);
    }
    if (e.note) bits.push(`<span class="note">${esc(e.note)}</span>`); // 备注是用户写的，不翻译
    return `<li class="item${e.done ? ' done' : ''}${e.done && UI.justDone === e.id ? ' just-done' : ''}" data-id="${e.id}" style="--c:${MC.evColor(e)}">
      <button class="check" data-act="toggle" aria-label="${e.done ? '标为未完成' : '标为完成'}">${checkSVG}</button>
      <div class="item-main" data-act="open">
        <div class="item-title"><span class="ttxt">${esc(e.title)}</span></div>
        ${bits.length ? `<div class="item-sub">${bits.join(' · ')}</div>` : ''}
      </div>
      ${MC.rateOn(e.cal) ? (e.rate && !opts.noFlag ? UI.rateTag(e) : '') : (e.priority && !opts.noFlag ? UI.flagSVG(e.priority) : '')}
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
  UI.longPress = (el, sel, fn) => {
    let lp = null, lastTouch = 0, swallowClick = false;
    const cancel = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
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
    el.addEventListener('click', ev => {
      const li = ev.target.closest('.item'); if (!li) return;
      const e = MC.data.events.find(x => x.id === li.dataset.id); if (!e) return;
      const act = ev.target.closest('[data-act]')?.dataset.act;
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
})();
