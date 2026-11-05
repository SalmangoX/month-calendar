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
  const daysPage = $('#page-days'), sumPage = $('#page-dsum');
  // Mac App（macOS 26 起）用原生的液态玻璃侧边栏，数据和操作还是这里的（见下面的 D.model / D.pick / D.act / D.add）
  const nativeDrawer = () => MC.Native.has('glassDrawer') && window.MCNative && window.MCNative.openDrawer;
  D.open = () => {
    if (![calPage, daysPage, sumPage].some(p => p && p.classList.contains('active'))) return;
    if (nativeDrawer()) { window.MCNative.openDrawer(); return; }
    render(); measure(); animateTo(W);
  };
  D.close = () => { measure(); animateTo(0); };

  // ---------- 当前日历的外观 ----------
  D.paint = () => {
    const id = MC.activeCal(), c = MC.cal(id);
    const body = document.body;
    if (id) { body.dataset.cal = id; body.style.setProperty('--cc', c.color); const ch = $('#calChip'); if (ch) { ch.textContent = c.name; ch.hidden = false; } }
    else { delete body.dataset.cal; body.style.removeProperty('--cc'); const ch = $('#calChip'); if (ch) { ch.textContent = ''; ch.hidden = true; } }
    if (MC.onCalChange) setTimeout(MC.onCalChange, 0);
    if (id && c.kind === 'days') body.dataset.kind = 'days'; else delete body.dataset.kind; // 纪念日历：日历页换成倒数日 / 纪念日的样子（days.js）
    if (MC.Days) MC.Days.paint();
    if (isOpen) render();
  };

  // ---------- 列表 ----------
  // 实心图形（和设置页同一套：.f 填色、.s 粗线、.k 挖空），放在中性灰底块上，图形用日历的颜色
  const ICON_MAIN = '<svg viewBox="0 0 24 24"><rect class="f" x="3.5" y="5" width="17" height="15.5" rx="3.6"/><path class="k" d="M3.5 10h17"/><path class="s" d="M8.5 3v3.6M15.5 3v3.6"/><circle class="k2" cx="8.5" cy="14.5" r="1.3"/><circle class="k2" cx="12" cy="14.5" r="1.3"/><circle class="k2" cx="15.5" cy="14.5" r="1.3"/></svg>';
  const ICON_REC = '<svg viewBox="0 0 24 24"><path class="f" d="M6.5 3h11a2.2 2.2 0 0 1 2.2 2.2V21l-7.7-4.2L4.3 21V5.2A2.2 2.2 0 0 1 6.5 3z"/></svg>';
  const ICON_DAYS = '<svg viewBox="0 0 24 24"><path class="f" d="M12 20.5s-7.8-4.6-7.8-10.6a4.3 4.3 0 0 1 7.8-2.6 4.3 4.3 0 0 1 7.8 2.6c0 6-7.8 10.6-7.8 10.6z"/></svg>';
  const T = s => (MC.Days ? MC.Days.T(s) : s);
  const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const BELL = '<svg viewBox="0 0 24 24"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const LAYERS = '<svg viewBox="0 0 24 24"><path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/></svg>';
  const MORE = '<svg viewBox="0 0 24 24" class="filled"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>';
  function row(c, i) {
    const on = c.id === MC.activeCal(), n = MC.countIn(c.id);
    const days = c.kind === 'days';
    const flags = c.id && !days ? `${c.showInMain ? `<span title="显示在主日历">${LAYERS}</span>` : ''}${c.notify ? `<span title="通知已开">${BELL}</span>` : ''}` : '';
    const sub = (days ? (n ? T('{0} 个日子').replace('{0}', n) : T('还没有日子')) : c.id ? (n ? `${n} 条记录` : '还没有记录') : '待办，也显示在今日和四象限') + (flags ? `<span class="dr-flags">${flags}</span>` : '');
    return `<div class="dr-row${on ? ' on' : ''}" style="--cc:${c.id ? c.color : 'var(--accent-base)'};--i:${i}" data-id="${esc(c.id)}">
      <button class="dr-pick" data-act="pick" aria-pressed="${on}">
        <span class="dr-ico">${days ? ICON_DAYS : c.id ? ICON_REC : ICON_MAIN}</span>
        <span class="dr-txt"><b>${esc(c.name)}</b><small>${sub}</small></span>
        <span class="dr-tick" aria-hidden="true">${TICK}</span>
      </button>
      ${c.id ? `<button class="dr-more" data-act="more" aria-label="编辑「${esc(c.name)}」">${MORE}</button>` : ''}
    </div>`;
  }
  function render() {
    const cals = MC.data.cals;
    let h = row(MC.MAIN_CAL, 1);
    const recs = cals.filter(c => c.kind !== 'days'), dayCals = cals.filter(c => c.kind === 'days');
    h += `<p class="dr-sec">记录日历</p>`;
    if (recs.length) h += recs.map((c, i) => row(c, i + 2)).join('');
    else h += `<p class="dr-empty" style="--i:2">记录日历和待办分开显示，可以分别设置是否显示在主日历、是否通知。</p>`;
    if (dayCals.length) {
      const k = recs.length + 3;
      h += `<p class="dr-sec" style="--i:${k}">${T('纪念日历')}</p>` + dayCals.map((c, i) => row(c, k + i + 1)).join('');
    }
    list.innerHTML = h;
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || swallow) return;
    const id = b.closest('.dr-row').dataset.id;
    if (b.dataset.act === 'pick') { D.pick(id); setTimeout(D.close, 140); return; }
    const c = MC.cal(id); if (c) UI.menu(b, menuOf(c), v => D.act(id, v));
  });
  D.pick = id => {
    if (id === MC.activeCal()) return;
    MC.setActiveCal(id); D.paint(); render(); MC.Cal.render();
    try { navigator.vibrate && navigator.vibrate(6); } catch (err) {}
  };
  // 「更多」菜单：记录日历和纪念日历的选项不同
  const menuOf = c => (c.kind === 'days'
    ? [{ label: T('名称和颜色'), value: 'edit' }, { label: T('删除这个日历'), value: 'del', danger: true }]
    : [{ label: '在主日历显示', value: 'main', on: c.showInMain }, { label: '通知', value: 'notify', on: c.notify },
      { label: '名称、颜色和等级', value: 'edit' }, { label: '删除这个日历', value: 'del', danger: true }]);
  D.act = async (id, v) => {
    const c = MC.cal(id); if (!c) return;
    if (v === 'main') { MC.updateCal(c, { showInMain: !c.showInMain }); MC.reindex(); render(); MC.Cal.render(); UI.toast(c.showInMain ? `「${c.name}」的事件会显示在主日历` : `「${c.name}」不再显示在主日历`); }
    else if (v === 'notify') { MC.updateCal(c, { notify: !c.notify }); render(); UI.toast(c.notify ? `已打开「${c.name}」的通知` : `已关闭「${c.name}」的通知`); }
    else if (v === 'edit') calForm(c);
    else if (v === 'del') {
      const n = MC.countIn(c.id), days = c.kind === 'days';
      const msg = days ? T('删除「{0}」？').replace('{0}', c.name) + (n ? T('里面的 {0} 个日子、小纸条和相册会一起删除，').replace('{0}', n) : '') + T('其他设备同步后也会删除。')
        : `删除「${c.name}」？${n ? `里面的 ${n} 条记录会一起删除，` : ''}其他设备同步后也会删除。`;
      if (!(await UI.confirm(msg, { ok: days ? T('删除') : '删除', danger: true }))) return;
      MC.deleteCal(c.id); D.paint(); render(); MC.Cal.render();
      UI.toast(days ? T('已删除「{0}」').replace('{0}', c.name) : `已删除「${c.name}」`);
    }
  };
  // 给原生侧边栏的数据：和网页侧边栏同样的分组、文字（已翻译成当前语言）和菜单
  D.model = () => {
    const tr = x => (MC.t ? MC.t(x) : x);
    const item = c => {
      const n = MC.countIn(c.id), days = c.kind === 'days';
      return { id: c.id, name: c.name, color: c.id ? c.color : '', kind: days ? 'days' : c.id ? 'rec' : 'main', on: c.id === MC.activeCal(),
        sub: tr(days ? (n ? T('{0} 个日子').replace('{0}', n) : T('还没有日子')) : c.id ? (n ? `${n} 条记录` : '还没有记录') : '待办，也显示在今日和四象限'),
        inMain: !!c.showInMain && !days, notify: !!c.notify && !days,
        menu: c.id ? menuOf(c).map(m => ({ ...m, label: tr(m.label) })) : [] };
    };
    const cals = MC.data.cals;
    return { title: tr('日历'), sub: tr('每个日历的内容分开显示'), main: item(MC.MAIN_CAL),
      recTitle: tr('记录日历'), recs: cals.filter(c => c.kind !== 'days').map(item), recEmpty: tr('记录日历和待办分开显示，可以分别设置是否显示在主日历、是否通知。'),
      daysTitle: tr(T('纪念日历')), days: cals.filter(c => c.kind === 'days').map(item),
      add: [{ label: tr(T('新建记录日历')), value: 'rec' }, { label: tr(T('新建纪念日历')), value: 'days' }], addLabel: tr('新建记录日历') };
  };
  D.add = kind => calForm(null, kind === 'days' ? 'days' : '');
  // 新建：记录日历（和待办一样的事件）或纪念日历（倒数日 / 纪念日）
  $('#drawerAdd').onclick = e => UI.menu(e.currentTarget, [
    { label: T('新建记录日历'), value: 'rec', icon: ICON_REC.replace('<svg ', '<svg class="mi" ') },
    { label: T('新建纪念日历'), value: 'days', icon: ICON_DAYS.replace('<svg ', '<svg class="mi" ') },
  ], v => calForm(null, v === 'days' ? 'days' : ''));

  // 新建 / 编辑：名称 + 颜色
  function calForm(c, kind = c ? c.kind : '') {
    const days = kind === 'days';
    const used = new Set(MC.data.cals.map(x => x.color));
    let color = c ? c.color : MC.suggestCalColor([...used]); // 没选颜色时：自动挑和主日历、其他记录日历都不冲突的
    const sw = () => `<div class="field"><span>颜色</span><div class="dr-swatches" id="calSw">${MC.CAL_COLORS.map(x =>
      `<button type="button" class="dr-sw${x === color ? ' on' : ''}" style="--cc:${x}" data-c="${x}" aria-label="颜色 ${x}" aria-pressed="${x === color}"></button>`).join('')}</div></div>`;
    MC.openForm({
      title: c ? (days ? T('编辑纪念日历') : '编辑日历') : (days ? T('新建纪念日历') : '新建记录日历'),
      submit: c ? '保存' : '新建',
      fields: [{ id: 'calName', label: '名称', ph: days ? T('比如：我们、生日、考试') : '日历名称', val: c ? c.name : '', max: 24 }],
      note: days && !c ? T('纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。') : '',
      extra: sw() + (days ? '' : `<div class="group dr-switches">
        <label class="pk-row"><span>在主日历显示<small>这个日历的事件也出现在主日历里</small></span><input type="checkbox" class="switch" id="calMain"${c && c.showInMain ? ' checked' : ''}></label>
        <label class="pk-row"><span>通知<small>事件设了提醒时到点通知</small></span><input type="checkbox" class="switch" id="calNotify"${c && c.notify ? ' checked' : ''}></label>
        <label class="pk-row"><span>等级评分<small>不按优先级排列，改用 4 个等级给事件评级，并在「统计」里汇总</small></span><input type="checkbox" class="switch" id="calRate"${c && c.rateOn ? ' checked' : ''}></label>
      </div>
      <div class="field rate-fields" id="calRateF"${c && c.rateOn ? '' : ' hidden'}><span>等级名称：从左到右 = 最低 → 最高（整个日历通用）</span>
        <div class="rate-inputs">${MC.RATE_ORDER.map(v => [MC.normRateLabels(c && c.rateLabels)[v - 1], v - 1]).map(([n, i]) => `<label class="rate-in lv${i + 1}"><i class="rate-swatch"></i><input type="text" id="calRL${i}" maxlength="8" value="${MC.esc(n)}" placeholder="${MC.RATE_DEFAULT[i]}" aria-label="等级 ${i + 1}"></label>`).join('')}</div>
        <p class="rate-cap"><span>绿 = 最低</span><span>红 = 最高</span></p>
        ${c && MC.data.events.some(e => e.cal === c.id && e.rate) ? '<button type="button" class="text-btn" id="calRateRev">顺序填反了？一键反转（已有的评级会跟着换，意思不变）</button>' : ''}
      </div>`),
      onSubmit: async v => {
        const name = v.calName.trim();
        if (!name) throw new Error('请填写名称');
        const showInMain = !days && $('#calMain').checked, notify = !days && $('#calNotify').checked;
        const rateOn = !days && $('#calRate').checked, rateLabels = days ? undefined : MC.normRateLabels([0, 1, 2, 3].map(i => $('#calRL' + i).value));
        if (c) { MC.updateCal(c, days ? { name, color, showInMain, notify } : { name, color, showInMain, notify, rateOn, rateLabels }); MC.reindex(); D.paint(); render(); MC.Cal.render(); UI.toast('已保存'); return; }
        const nc = MC.addCal(name, color, { showInMain, notify, rateOn, rateLabels, kind: days ? 'days' : '' });
        MC.setActiveCal(nc.id); D.paint(); render(); MC.Cal.render();
        UI.toast(`已新建「${name}」，现在显示的就是它`);
        setTimeout(D.close, 260);
      },
    });
    const rsw = $('#calRate'); if (rsw) rsw.addEventListener('change', () => { $('#calRateF').hidden = !rsw.checked; });
    const rev = $('#calRateRev');
    if (rev) rev.onclick = async () => {
      if (!(await UI.confirm('把等级顺序倒过来？名称会变成「' + MC.normRateLabels(c.rateLabels).slice().reverse().join(' → ') + '」，这个日历里已有的评级也会一起换过来，记录的意思不变。', { ok: '反转' }))) return;
      MC.reverseRates(c); MC.normRateLabels(c.rateLabels).forEach((n, i) => { $('#calRL' + i).value = n; });
      MC.Cal.render(); UI.toast('已反转等级顺序');
    };
    $('#calSw').addEventListener('click', e => {
      const b = e.target.closest('.dr-sw'); if (!b) return;
      color = b.dataset.c;
      $('#calSw').querySelectorAll('.dr-sw').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    });
    if (!c) setTimeout(() => UI.desktopFocus($('#ff_calName')), 360);
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
  let g = null, pageSwallow = 0;
  const pullFrom = pg => {
  // 原生侧栏不盖住网页：拉完松手时系统还会补发一个点击，落在日历的某一天上就会打开新建事件，这里先吃掉
  pg.addEventListener('click', e => { if (Date.now() - pageSwallow < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  pg.addEventListener('touchstart', e => {
    g = null;
    if (isOpen || e.touches.length !== 1 || UI.anyOpen()) return;
    const t = e.touches[0];
    if (t.clientY > window.innerHeight - 44) return;                 // 底部系统手势区
    if (e.target.closest('input, textarea, .wheel, .preview, .dv-noswipe')) return;
    const edge = t.clientX < 34, head = !!e.target.closest('.topbar, .weekdays');
    if (MC.Cal.view() === 'week' && !edge && !head && document.body.dataset.kind !== 'days') return;
    g = { x0: t.clientX, y0: t.clientY, mode: 0, s: [[performance.now(), t.clientX]] };
  }, { capture: true, passive: true });
  pg.addEventListener('touchmove', e => {
    if (!g || g.mode < 0 || e.touches.length !== 1) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.mode === 0) {
      if (Math.hypot(dx, dy) < 12) return;
      // 要明显是往右划（横向至少是竖向的 2 倍）：上下滑月历时斜一点不会误拉出侧栏
      if (dx > 0 && dx > Math.abs(dy) * 2) {
        UI.cancelPresses(); // 下面会拦下 touchmove，长按自己看不到手指在动：先取消，免得松手前打开新建事件
        // iPhone App：网页的侧栏隐藏了，换成原生液态玻璃侧栏；手指的位置一路交给原生，侧栏跟着手指出来
        if (nativeDrawer()) {
          if (!window.MCNative.drawerPull) { g = null; if (e.cancelable) e.preventDefault(); D.open(); return; } // 旧版 App：直接弹出
          g.mode = 2; window.MCNative.drawerPull('begin', 0, 0);
        } else {
        g.mode = 1;
        if (anim) anim.stop();
        render(); measure();
        el.setAttribute('aria-hidden', 'false');
        }
      } else { g.mode = -1; return; }
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();                                              // 日历不再跟着滚动（手指没抬起来之前一直这样）
    g.s.push([performance.now(), t.clientX]); if (g.s.length > 10) g.s.shift();
    if (g.mode === 2) window.MCNative.drawerPull('move', Math.max(0, dx), 0);
    else apply(Math.max(0, dx), vel(g.s));
  }, { capture: true, passive: false });
  const pageEnd = () => {
    if (!g) return;
    const was = g.mode === 1, s = g.s;
    if (g.mode === 2) { g = null; pageSwallow = Date.now(); window.MCNative.drawerPull('end', 0, vel(s)); return; }
    g = null;
    if (!was) return;
    swallow = true; setTimeout(() => (swallow = false), 300);
    release(vel(s), pos);
  };
  pg.addEventListener('touchend', pageEnd, true);
  pg.addEventListener('touchcancel', () => {
    if (g && g.mode === 2) window.MCNative.drawerPull('end', 0, -1000); // 被系统打断：收回去
    if (g && g.mode === 1) { g = null; animateTo(0); } else g = null;
  }, true);
  };
  pullFrom(calPage);
  if (daysPage) pullFrom(daysPage);
  if (sumPage) pullFrom(sumPage);

  // 触控板：在侧栏或遮罩上双指往左轻扫收起
  let wx = 0, wxT = null;
  [el, scrim].forEach(n => n.addEventListener('wheel', e => {
    if (!isOpen || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
    e.preventDefault();
    wx += e.webkitDirectionInvertedFromDevice ? e.deltaX : -e.deltaX; // 统一成：手指往左为正
    clearTimeout(wxT); wxT = setTimeout(() => (wx = 0), 200);
    if (wx > 60) { wx = 0; D.close(); }
  }, { passive: false }));

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
