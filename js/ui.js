/* 月历 · 通用界面部件 */
(() => {
  'use strict';
  const MC = window.MC;
  const UI = (MC.UI = {});
  const $ = (UI.$ = s => document.querySelector(s));
  const esc = MC.esc;

  // ---------- 提示 ----------
  let toastTimer;
  UI.toast = msg => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  };

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
  UI.close = id => {
    id = id || stack[stack.length - 1];
    if (!id) return;
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
    if (UI.menuOpen()) UI.closeMenu(); else if (stack.length) UI.close();
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => UI.close(b.closest('.sheet').id)));
  // 面板手势：向下拖动跟手、超过距离或快速下滑即收起；向上拖动有阻尼的橡皮筋效果，松手回弹
  const rubber = (x, dim = 140, c = .55) => (1 - 1 / (x * c / dim + 1)) * dim;
  document.querySelectorAll('.sheet').forEach(sh => {
    let y0 = 0, t0 = 0, last = 0, lastT = 0, v = 0, on = false, d = 0;
    const isZone = el => {
      if (el.closest('.handle, .sheet-head, .cmp-head h2')) return true;
      if (el.closest('input, textarea, button, select, label, .wheel, .batch-list, .list, .pk-body, .help-body, .form, .cmp-chips')) return false;
      return sh.classList.contains('composer'); // 添加面板的空白处也可以拖
    };
    sh.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || !isZone(e.target)) return;
      on = true; d = 0; v = 0;
      y0 = last = e.touches[0].clientY; t0 = lastT = performance.now();
      sh.style.transition = 'none';
    }, { passive: true });
    sh.addEventListener('touchmove', e => {
      if (!on) return;
      const y = e.touches[0].clientY, now = performance.now();
      v = (y - last) / Math.max(1, now - lastT); last = y; lastT = now;
      d = y - y0;
      const off = d >= 0 ? d : -rubber(-d);
      sh.style.transform = `translateY(${off}px)`;
      if (Math.abs(d) > 4 && e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!on) return; on = false;
      const close = d > 110 || (d > 24 && v > .55);
      if (close) {
        sh.style.transition = 'transform .26s cubic-bezier(.3,.7,.4,1)';
        sh.style.transform = `translateY(${sh.offsetHeight + 40}px)`;
        setTimeout(() => { sh.style.transition = ''; sh.style.transform = ''; UI.close(sh.id); }, 250);
      } else {
        // 回弹：带一点过冲
        sh.style.transition = 'transform .5s cubic-bezier(.25,1.6,.45,1)';
        sh.style.transform = '';
        setTimeout(() => { sh.style.transition = ''; }, 500);
      }
    };
    sh.addEventListener('touchend', end);
    sh.addEventListener('touchcancel', end);
  });

  // 键盘弹出时把面板顶起（iOS）
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onVV = () => {
      const kb = Math.max(0, (MC.appH || window.innerHeight) - vv.height - vv.offsetTop);
      const on = kb > 60;
      document.documentElement.style.setProperty('--kb', on ? kb + 'px' : '0px');
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
      `<button role="menuitem" data-i="${i}" class="${it.on ? 'on' : ''}">${it.icon || ''}<span>${esc(it.label)}</span>${it.on ? '<span class="tick">✓</span>' : ''}</button>`).join('');
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
  UI.priMenuItems = cur => MC.PRI.map(p => ({ label: p.full, value: p.v, on: p.v === cur, icon: UI.flagSVG(p.v) }));
  const checkSVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // opts: { showDate: true } 在副标题显示日期
  UI.itemHTML = (e, opts = {}) => {
    const p = MC.priOf(e.priority);
    const bits = [];
    if (opts.showDate) {
      const diff = MC.dayDiff(e.date);
      const cls = e.done ? '' : diff < 0 ? 'over' : 'due';
      bits.push(`<span class="${cls}">${MC.dateLabel(e.date)}</span>`);
    }
    const tl = MC.timeLabel(e);
    if (tl) bits.push(esc(tl));
    if (e.note) bits.push(esc(e.note));
    return `<li class="item${e.done ? ' done' : ''}" data-id="${e.id}" style="--c:${p.color}">
      <button class="check" data-act="toggle" aria-label="${e.done ? '标为未完成' : '标为完成'}">${checkSVG}</button>
      <div class="item-main" data-act="open">
        <div class="item-title">${esc(e.title)}</div>
        ${bits.length ? `<div class="item-sub">${bits.join(' · ')}</div>` : ''}
      </div>
      ${e.priority && !opts.noFlag ? UI.flagSVG(e.priority) : ''}
    </li>`;
  };
  // 统一处理列表点击：勾选 / 打开编辑
  UI.bindList = el => {
    el.addEventListener('click', ev => {
      const li = ev.target.closest('.item'); if (!li) return;
      const e = MC.data.events.find(x => x.id === li.dataset.id); if (!e) return;
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle') MC.updateEvent(e, { done: !e.done });
      else if (act === 'open') MC.Editor.openEdit(e);
    });
  };

  // ---------- 滚轮选择器 ----------
  const ITEM = 36;
  // cols: [{ items:[{label,value}], value, flex }]，onChange(colIndex, value)
  UI.wheel = (host, cols, onChange) => {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'wheel';
    wrap.innerHTML = '<div class="wheel-band glass"></div>';
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
          sc.innerHTML = '<div class="wpad"></div>' + items.map((it, i) => `<div class="witem" data-i="${i}">${esc(it.label)}</div>`).join('') + '<div class="wpad"></div>';
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
  UI.dateWheel = (host, ds, onChange) => {
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
    });
    return w;
  };

  // 时间滚轮：时 : 分（可选结束时间）
  UI.timeWheel = (host, start, end, onChange) => {
    const hours = []; for (let h = 0; h < 24; h++) hours.push({ label: MC.pad(h), value: h });
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
