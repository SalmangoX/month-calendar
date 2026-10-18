/* 月历 · 左侧日历栏：在日历页从左往右滑动拉出，切换主日历 / 特殊记录日历。
   每个日历的事件各自独立：日历页只显示当前选中的日历；今日、四象限、小组件、每日提醒只看主日历。 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const D = (MC.Drawer = {});
  const el = $('#calDrawer'), scrim = $('#drawerScrim'), list = $('#drawerList'), calPage = $('#page-cal');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const GAP = 10;                 // 面板离屏幕左边的距离（浮动的玻璃卡片）
  let W = 0, EW = 1, pos = 0, isOpen = false, anim = null;
  const rubber = (x, d) => (1 - 1 / (x * .55 / d + 1)) * d;

  // ---------- 弹簧 ----------
  function spring(from, to, v, k, c, onUpdate, onDone) {
    let x = from, vel = v, last = performance.now(), id = 0, stopped = false;
    const step = now => {
      if (stopped) return;
      const dt = Math.min(.034, Math.max(.001, (now - last) / 1000)); last = now;
      const n = 4, h = dt / n;
      for (let i = 0; i < n; i++) { vel += (-k * (x - to) - c * vel) * h; x += vel * h; }
      if (Math.abs(x - to) < .25 && Math.abs(vel) < 8) { onUpdate(to, 0); stopped = true; onDone && onDone(); return; }
      onUpdate(x, vel);
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return { stop() { stopped = true; cancelAnimationFrame(id); } };
  }

  // ---------- 画面 ----------
  // p：面板露出的宽度（0 = 收起，W = 完全拉出，大于 W 时像果冻一样被拉长）
  function apply(p, v = 0) {
    pos = p;
    const over = Math.max(0, p - W);
    const x = Math.max(0, Math.min(p, W)) - W;
    const stretch = over ? rubber(over, 34) / EW : 0;       // 拉过头：向右拉长
    const sp = Math.min(.045, Math.abs(v) / 26000);                     // 甩动时轻微拉长压扁
    const sx = 1 + stretch + sp, sy = 1 - sp * .55 - stretch * .25;
    el.style.transform = `translate3d(${x.toFixed(2)}px,0,0) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
    const pr = W ? Math.max(0, Math.min(1, p / W)) : 0;
    el.style.setProperty('--pr', pr.toFixed(3));
    scrim.style.opacity = pr.toFixed(3);
    const vis = p > .5;
    el.classList.toggle('vis', vis);
    scrim.classList.toggle('vis', vis);
  }
  function measure() { EW = el.offsetWidth || 1; W = EW + GAP; }
  function animateTo(target, v = 0) {
    if (anim) anim.stop();
    const opening = target > 0;
    isOpen = opening;
    el.setAttribute('aria-hidden', String(!opening));
    scrim.classList.toggle('live', opening);
    if (reduce.matches) { apply(target); anim = null; return; }
    // 拉出：轻微过冲，面板被甩得「啵」一下拉长再缩回；收起：干脆利落不过冲
    anim = opening
      ? spring(pos, target, v, 430, 29, apply, () => (anim = null))
      : spring(pos, target, v, 520, 48, (p, vv) => apply(Math.max(0, p), vv), () => (anim = null));
  }
  D.isOpen = () => isOpen;
  D.open = () => { if (!calPage.classList.contains('active')) return; render(); measure(); animateTo(W); };
  D.close = () => { measure(); animateTo(0); };

  // ---------- 当前日历的外观 ----------
  D.paint = () => {
    const id = MC.activeCal(), c = MC.cal(id);
    const body = document.body;
    if (id) { body.dataset.cal = id; body.style.setProperty('--cc', c.color); $('#calSub').dataset.cal = c.name; }
    else { delete body.dataset.cal; body.style.removeProperty('--cc'); delete $('#calSub').dataset.cal; }
    if (isOpen) render();
  };

  // ---------- 列表 ----------
  const ICON_MAIN = '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.2h17M8 2.8v3.4M16 2.8v3.4"/></svg>';
  const ICON_REC = '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h11a2 2 0 0 1 2 2v15l-7.5-4-7.5 4v-15a2 2 0 0 1 2-2z"/></svg>';
  const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const MORE = '<svg viewBox="0 0 24 24" class="filled"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>';
  function row(c, i) {
    const on = c.id === MC.activeCal(), n = MC.countIn(c.id);
    const sub = c.id ? (n ? `${n} 条记录` : '还没有记录') : '待办，也显示在今日和四象限';
    return `<div class="dr-row${on ? ' on' : ''}" style="--cc:${c.id ? c.color : 'var(--accent-base)'};--i:${i}" data-id="${esc(c.id)}">
      <button class="dr-pick" data-act="pick" aria-pressed="${on}">
        <span class="dr-ico">${c.id ? ICON_REC : ICON_MAIN}</span>
        <span class="dr-txt"><b>${esc(c.name)}</b><small>${sub}</small></span>
        <span class="dr-tick" aria-hidden="true">${TICK}</span>
      </button>
      ${c.id ? `<button class="dr-more" data-act="more" aria-label="编辑「${esc(c.name)}」">${MORE}</button>` : ''}
    </div>`;
  }
  function render() {
    const cals = MC.data.cals;
    let h = row(MC.MAIN_CAL, 1);
    h += `<p class="dr-sec">记录日历</p>`;
    if (cals.length) h += cals.map((c, i) => row(c, i + 2)).join('');
    else h += `<p class="dr-empty" style="--i:2">经期、运动、症状这类记录可以各放一个日历，和待办分开显示，互不干扰。</p>`;
    list.innerHTML = h;
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || swallow) return;
    const id = b.closest('.dr-row').dataset.id;
    if (b.dataset.act === 'pick') {
      if (id !== MC.activeCal()) {
        MC.setActiveCal(id); D.paint(); render(); MC.Cal.render();
        try { navigator.vibrate && navigator.vibrate(6); } catch (err) {}
      }
      setTimeout(D.close, 140);
      return;
    }
    const c = MC.cal(id); if (!c) return;
    UI.menu(b, [{ label: '名称和颜色', value: 'edit' }, { label: '删除这个日历', value: 'del' }], v => {
      if (v === 'edit') calForm(c);
      else {
        const n = MC.countIn(c.id);
        if (!confirm(`删除「${c.name}」？${n ? `里面的 ${n} 条记录会一起删除，` : ''}其他设备同步后也会删除。`)) return;
        MC.deleteCal(c.id); D.paint(); render(); MC.Cal.render();
        UI.toast(`已删除「${c.name}」`);
      }
    });
  });
  $('#drawerAdd').onclick = () => calForm(null);

  // 新建 / 编辑：名称 + 颜色
  function calForm(c) {
    const used = new Set(MC.data.cals.map(x => x.color));
    let color = c ? c.color : (MC.CAL_COLORS.find(x => !used.has(x)) || MC.CAL_COLORS[0]);
    const sw = () => `<div class="field"><span>颜色</span><div class="dr-swatches" id="calSw">${MC.CAL_COLORS.map(x =>
      `<button type="button" class="dr-sw${x === color ? ' on' : ''}" style="--cc:${x}" data-c="${x}" aria-label="颜色 ${x}" aria-pressed="${x === color}"></button>`).join('')}</div></div>`;
    MC.openForm({
      title: c ? '编辑日历' : '新建记录日历',
      submit: c ? '保存' : '新建',
      fields: [{ id: 'calName', label: '名称', ph: '比如：经期、运动、头痛', val: c ? c.name : '', max: 24 }],
      extra: sw(),
      note: c ? '' : '新日历的内容只在这个日历里显示，不会出现在今日、四象限和小组件中。',
      onSubmit: async v => {
        const name = v.calName.trim();
        if (!name) throw new Error('请填写名称');
        if (c) { MC.updateCal(c, { name, color }); D.paint(); render(); UI.toast('已保存'); return; }
        const nc = MC.addCal(name, color);
        MC.setActiveCal(nc.id); D.paint(); render(); MC.Cal.render();
        UI.toast(`已新建「${name}」，现在显示的就是它`);
        setTimeout(D.close, 260);
      },
    });
    $('#calSw').addEventListener('click', e => {
      const b = e.target.closest('.dr-sw'); if (!b) return;
      color = b.dataset.c;
      $('#calSw').querySelectorAll('.dr-sw').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    });
    if (!c) setTimeout(() => { const i = $('#ff_calName'); i && i.focus(); }, 360);
  }

  // ---------- 手势 ----------
  let swallow = false;
  const vel = s => { // 松手前 90ms 的速度（px/s）
    const now = performance.now(), r = s.filter(p => now - p[0] < 90);
    if (r.length < 2) return 0;
    const a = r[0], b = r[r.length - 1];
    return Math.max(-5000, Math.min(5000, (b[1] - a[1]) / Math.max(8, b[0] - a[0]) * 1000));
  };
  const release = (v, from) => {
    const target = v > 450 ? W : v < -450 ? 0 : (from > W * .45 ? W : 0);
    if (target) render();
    animateTo(target, v);
  };

  // 拉出：月 / 年视图里任何地方往右滑都可以（这两个视图是上下滚动的）；
  // 周视图左右滑是翻周，只在屏幕最左边一条或顶栏上往右滑才拉出。
  let g = null;
  calPage.addEventListener('touchstart', e => {
    g = null;
    if (isOpen || e.touches.length !== 1 || UI.anyOpen()) return;
    const t = e.touches[0];
    if (t.clientY > window.innerHeight - 44) return;                 // 底部系统手势区
    if (e.target.closest('input, textarea, .wheel, .preview')) return;
    const edge = t.clientX < 34, head = !!e.target.closest('.topbar, .weekdays');
    if (MC.Cal.view() === 'week' && !edge && !head) return;
    g = { x0: t.clientX, y0: t.clientY, mode: 0, s: [[performance.now(), t.clientX]] };
  }, { capture: true, passive: true });
  calPage.addEventListener('touchmove', e => {
    if (!g || g.mode < 0 || e.touches.length !== 1) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.mode === 0) {
      if (Math.hypot(dx, dy) < 10) return;
      if (dx > 0 && dx > Math.abs(dy) * 1.25) {
        g.mode = 1;
        if (anim) anim.stop();
        render(); measure();
        el.setAttribute('aria-hidden', 'false');
      } else { g.mode = -1; return; }
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();                                              // 日历不再跟着滚动
    g.s.push([performance.now(), t.clientX]); if (g.s.length > 10) g.s.shift();
    apply(Math.max(0, dx), vel(g.s));
  }, { capture: true, passive: false });
  const pageEnd = () => {
    if (!g) return;
    const was = g.mode === 1, s = g.s;
    g = null;
    if (!was) return;
    swallow = true; setTimeout(() => (swallow = false), 300);
    release(vel(s), pos);
  };
  calPage.addEventListener('touchend', pageEnd, true);
  calPage.addEventListener('touchcancel', () => { if (g && g.mode === 1) { g = null; animateTo(0); } else g = null; }, true);

  // 收起：在面板或遮罩上往左滑；面板内上下滑照常滚动列表
  let c2 = null;
  [el, scrim].forEach(n => {
    n.addEventListener('touchstart', e => {
      c2 = null;
      if (!isOpen || e.touches.length !== 1) return;
      if (anim) anim.stop();
      const t = e.touches[0];
      c2 = { x0: t.clientX, y0: t.clientY, p0: pos, mode: 0, s: [[performance.now(), t.clientX]] };
    }, { passive: true });
    n.addEventListener('touchmove', e => {
      if (!c2 || c2.mode < 0) return;
      const t = e.touches[0], dx = t.clientX - c2.x0, dy = t.clientY - c2.y0;
      if (c2.mode === 0) {
        if (Math.hypot(dx, dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.2) c2.mode = 1;
        else { c2.mode = -1; if (pos !== W) animateTo(W); return; }
      }
      if (e.cancelable) e.preventDefault();
      c2.s.push([performance.now(), t.clientX]); if (c2.s.length > 10) c2.s.shift();
      apply(Math.max(0, c2.p0 + dx), vel(c2.s));
    }, { passive: false });
    const end = () => {
      if (!c2) return;
      const was = c2.mode === 1, s = c2.s, moved = c2.mode !== 0;
      c2 = null;
      if (was) { swallow = true; setTimeout(() => (swallow = false), 300); release(vel(s), pos); }
      else if (!moved && pos !== W) animateTo(W);                      // 按住时被打断的动画接着完成
    };
    n.addEventListener('touchend', end);
    n.addEventListener('touchcancel', end);
  });
  scrim.addEventListener('click', () => { if (!swallow) D.close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen && !UI.anyOpen() && !UI.menuOpen()) D.close(); });
  // 点日历页顶部的标题也能打开（电脑上用鼠标时）
  $('#page-cal .title').addEventListener('click', () => D.open());
  window.addEventListener('resize', () => { measure(); apply(isOpen ? W : 0); });

  measure(); apply(0);
  D.paint();
})();
