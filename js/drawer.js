/* 月历 · 左侧日历栏：在日历页从左往右滑动拉出，切换主日历 / 特殊记录日历。
   每个日历的事件各自独立：日历页只显示当前选中的日历；今日、小组件、每日提醒只看主日历。 */
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
    // 拉出：顺滑地吸到位置上，不过冲（用户定的）；只有用力甩出来时才带一点点回弹。收起：干脆利落不过冲
    anim = opening
      ? spring(pos, target, v, 430, Math.abs(v) > 900 ? 34 : 44, apply, () => (anim = null))
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
  // 纪念日历自己的图标：和纪念日的日子同一套实心图标（js/days.js 的 svgOf / ICON_GROUPS），空 = 心形
  const DP = () => (MC.Days && MC.Days.parts) || null;
  const daysIcon = c => { const P = DP(), ic = c && c.icon; return P && ic && P.ICONS[ic] ? P.svgOf(ic) : ICON_DAYS; };
  // iPhone / Mac 原生侧拉菜单用系统符号：每个图标配一个最接近的 SF Symbol
  const SF_OF = { heart: 'heart.fill', ring: 'circle.circle.fill', cake: 'birthday.cake.fill', gift: 'gift.fill', people: 'person.2.fill', smile: 'face.smiling.inverse', home: 'house.fill',
    star: 'star.fill', plane: 'airplane', train: 'tram.fill', car: 'car.fill', bag: 'suitcase.fill', mountain: 'mountain.2.fill', sea: 'water.waves', pin: 'mappin.circle.fill',
    cap: 'graduationcap.fill', book: 'book.fill', paper: 'doc.text.fill', case: 'briefcase.fill', clock: 'clock.fill', flag: 'flag.fill', music: 'music.note', mic: 'music.mic',
    film: 'film.fill', game: 'gamecontroller.fill', camera: 'camera.fill', gym: 'dumbbell.fill', plant: 'leaf.fill', coffee: 'cup.and.saucer.fill', paw: 'pawprint.fill',
    cat: 'cat.fill', dog: 'dog.fill', lantern: 'lamp.ceiling.fill', tree: 'tree.fill', moon: 'moon.fill', spark: 'sparkles', tent: 'tent.fill', trophy: 'trophy.fill',
    calendar: 'calendar', syringe: 'syringe.fill', pumpkin: 'leaf.circle.fill', stroller: 'stroller.fill' };
  function row(c, i) {
    const on = c.id === MC.activeCal(), n = MC.countIn(c.id);
    const days = c.kind === 'days';
    const flags = c.id ? `${c.showInMain ? `<span title="显示在主日历">${LAYERS}</span>` : ''}${c.notify && !days ? `<span title="通知已开">${BELL}</span>` : ''}` : '';
    const sub = (days ? (n ? T('{0} 个日子').replace('{0}', n) : T('还没有日子')) : c.id ? (n ? `${n} 条记录` : '还没有记录') : '待办，也显示在今日页') + (flags ? `<span class="dr-flags">${flags}</span>` : '');
    return `<div class="dr-row${on ? ' on' : ''}" style="--cc:${c.id ? c.color : 'var(--accent-base)'};--i:${i}" data-id="${esc(c.id)}">
      <button class="dr-pick" data-act="pick" aria-pressed="${on}">
        <span class="dr-ico">${days ? daysIcon(c) : c.id ? ICON_REC : ICON_MAIN}</span>
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
    const c = MC.cal(id); if (c) UI.menu(b, menuOf(c), v => D.act(id, v), { center: true });   // 以「⋯」为正中心展开
  });
  // 切换日历：不再整页一下子闪过去——先淡出、稍微缩一点往下沉，换好内容后再从略大一点淡入回来（不用模糊：会让里面的液态玻璃失效）
  let swapping = false;
  D.pick = id => {
    if (id === MC.activeCal() || swapping) return;
    try { navigator.vibrate && navigator.vibrate(6); } catch (err) {}
    const host = $('#pages'), swap = () => { MC.setActiveCal(id); D.paint(); render(); MC.Cal.render(); };
    if (!host || !host.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
    swapping = true;
    const out = host.animate([{ opacity: 1, transform: 'none' }, { opacity: .3, transform: 'translateY(6px) scale(.985)' }], { duration: 150, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    let went = false;
    setTimeout(() => (swapping = false), 800);   // 兜底：后台时动画事件不一定来，别卡住以后的切换
    const go = () => {
      if (went) return; went = true;
      swap();
      requestAnimationFrame(() => {
        out.cancel();
        const back = host.animate([{ opacity: .3, transform: 'translateY(-4px) scale(1.012)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
        back.onfinish = back.oncancel = () => { swapping = false; };
      });
    };
    out.onfinish = go; setTimeout(go, 220);
  };
  // 「更多」菜单：记录日历和纪念日历的选项不同
  const menuOf = c => (c.kind === 'days'
    ? [{ label: '在主日历显示', value: 'main', on: c.showInMain, sw: true }, { label: T('名称、颜色和图标'), value: 'edit' }, { label: T('删除这个日历'), value: 'del', danger: true }]
    : [{ label: '在主日历显示', value: 'main', on: c.showInMain, sw: true }, { label: '通知', value: 'notify', on: c.notify, sw: true },
      { label: '统一提醒…', value: 'remindAll' },   // 一键给这个日历里所有事件设提醒（可以几个），新加的也默认带上
      { label: '名称、颜色和等级', value: 'edit' },
      { label: '并入…', value: 'merge' },
      { label: '删除这个日历', value: 'del', danger: true }]);
  // 从「⋯」菜单里再弹出的菜单挂在哪：网页侧拉菜单里的那一行；iPhone / Mac 上网页的侧拉菜单藏在屏幕外面，那一行的位置不能用（原生菜单会弹到屏幕外，看起来像什么都没有），改用屏幕中间
  function anchorFor(c) {
    const row = document.querySelector(`#drawerList [data-id="${CSS.escape(c.id)}"]`), rr = row && row.getBoundingClientRect();
    if (!nativeDrawer() && rr && rr.width && rr.right > 0 && rr.left < innerWidth) return { el: row, done() {} };
    const tmp = document.createElement('div'); tmp.style.cssText = 'position:fixed;left:50%;top:45%;width:1px;height:1px'; document.body.appendChild(tmp);
    setTimeout(() => tmp.remove(), 60000);
    return { el: tmp, done() { tmp.remove(); } };
  }
  D.act = async (id, v) => {
    const c = MC.cal(id); if (!c) return;
    if (v === 'main') { MC.updateCal(c, { showInMain: !c.showInMain }); MC.reindex(); render(); MC.Cal.render(); UI.toast(c.showInMain ? (c.kind === 'days' ? `「${c.name}」的日子会显示在主日历` : `「${c.name}」的事件会显示在主日历`) : `「${c.name}」不再显示在主日历`); }
    else if (v === 'notify') { MC.updateCal(c, { notify: !c.notify }); render(); UI.toast(c.notify ? `已打开「${c.name}」的通知` : `已关闭「${c.name}」的通知`); }
    else if (v === 'edit') calForm(c);
    else if (v === 'remindAll') {
      // 统一提醒：选好几个提前量，点「应用」后这个日历里的事件全部换成这几个提醒；以后新加的事件也默认带上
      const n = MC.countIn(c.id), a = anchorFor(c);
      UI.multiMenu(a.el, MC.remindOptions(true).filter(o => o.v !== null), c.remindDef || [], () => {}, {
        center: true, none: '全部不提醒', done: n ? `应用到全部 ${n} 条事件` : '设为新事件的默认提醒',
        onDone: l => {
          a.done();
          const t = Date.now(), r = MC.withReminds(l);
          MC.data.events.forEach(e => { if (e.cal === c.id) { Object.assign(e, r); e.updatedAt = t; } });
          const turnOn = l.length && !c.notify;
          MC.updateCal(c, { remindDef: MC.remindsOf(r), ...(turnOn ? { notify: true } : {}) });
          MC.reindex && MC.reindex(); render(); MC.Cal.render();
          if (l.length && MC.Push && !MC.Push.enabled()) MC.Push.enable().catch(() => {});
          UI.toast(l.length ? `「${c.name}」的事件都会${MC.remindsLabel(l, true)}提醒${turnOn ? '，已打开这个日历的通知' : ''}` : `「${c.name}」的事件都不再提醒`);
        },
      });
    }
    else if (v === 'merge') {
      // 并入…：选并到主日历还是另一个子日历；当前子日历的事件全部转移过去，然后删掉它（不可逆，要说清楚）
      const others = MC.data.cals.filter(x => x.kind !== 'days' && x.id !== c.id);
      const items = [{ label: '主日历', value: '' }, ...others.map(x => ({ label: `「${x.name}」`, value: x.id, icon: `<span class="cs-dot" style="--c:${x.color}"></span>` }))];
      const a = anchorFor(c);
      UI.menu(a.el, items, async to => {
        a.done();
        if (to === undefined) return;
        const n = MC.countIn(c.id), dest = to ? `「${MC.cal(to).name}」` : '主日历';
        if (!(await UI.confirm(`把「${c.name}」的 ${n} 条事件全部转移到${dest}，然后删掉「${c.name}」？\n这一步不能撤销：转过去以后分不出哪些原来属于「${c.name}」。`, { ok: `并入${dest}`, danger: true }))) return;
        const t = Date.now(), rated = to && MC.rateOn(to);
        MC.data.events.forEach(e => { if (e.cal === c.id) { e.cal = to; if (!rated) { e.rate = 0; e.segs = {}; } e.updatedAt = t; } });
        MC.data.cals = MC.data.cals.filter(x => x.id !== c.id); MC.data.deleted['cal:' + c.id] = t;
        if (MC.settings.activeCal === c.id) { MC.settings.activeCal = to; MC.saveSettings(); }
        MC.commit(); MC.reindex && MC.reindex(); D.paint(); render(); MC.Cal.render(); UI.toast(`已把「${c.name}」并入${dest}`);
      }, { center: true });
    }
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
  // 【联动:侧拉菜单】见 CLAUDE.md「联动分组」
  D.model = () => {
    const tr = x => (MC.t ? MC.t(x) : x);
    const item = c => {
      const n = MC.countIn(c.id), days = c.kind === 'days';
      return { id: c.id, name: c.name, color: c.id ? c.color : '', kind: days ? 'days' : c.id ? 'rec' : 'main', on: c.id === MC.activeCal(), sf: days ? SF_OF[c.icon] || 'heart.fill' : '',
        sub: tr(days ? (n ? T('{0} 个日子').replace('{0}', n) : T('还没有日子')) : c.id ? (n ? `${n} 条记录` : '还没有记录') : '待办，也显示在今日页'),
        inMain: !!c.showInMain, notify: !!c.notify && !days,
        menu: c.id ? menuOf(c).map(m => ({ ...m, label: tr(m.label) })) : [] };
    };
    const cals = MC.data.cals;
    return { title: tr('日历'), sub: tr('每个日历的内容分开显示'), main: item(MC.MAIN_CAL),
      recTitle: tr('记录日历'), recs: cals.filter(c => c.kind !== 'days').map(item), recEmpty: tr('记录日历和待办分开显示，可以分别设置是否显示在主日历、是否通知。'),
      daysTitle: tr(T('纪念日历')), days: cals.filter(c => c.kind === 'days').map(item),
      add: [{ label: tr(T('新建记录日历')), value: 'rec' }, { label: tr(T('新建纪念日历')), value: 'days' }], addLabel: tr('新建子日历'),
      // iPhone / Mac 原生画的「新建子日历」介绍卡片用的文字（和网页 #calKindSheet 一样）
      kinds: { title: tr('新建子日历'), lead: tr('子日历和主日历分开记，也可以显示在主日历里。'), cancel: tr('取消'),
        rec: { name: tr('记录日历'), desc: tr('像主日历一样记一件件事：时间、提醒、完成。可以用 4 个等级评分，看统计。'), eg: tr('适合：运动、学习、日志') },
        days: { name: tr(T('纪念日历')), desc: tr('记重要的日子：未来的倒数，过去的累计。可以写小纸条、建相册、生成分享图片。'), eg: tr('适合：生日、纪念日、旅行'), big: tr('还有'), unit: tr('天'), tag: tr('每年 · 生日') } } };
  };
  // 新建子日历：先弹出两种日历的介绍卡片（左：记录日历，右：纪念日历），点哪张就新建哪种；原生的侧拉菜单调 MC.Drawer.add('') 也走这里
  D.add = kind => (kind === 'days' || kind === 'rec' ? calForm(null, kind === 'days' ? 'days' : '') : openKinds());
  // iPhone / Mac 的侧拉菜单是原生的、盖在网页上面，打开卡片前原生会先收起它；没选就取消时把它原样打开回来（网页 / 安卓的侧拉菜单就在卡片下面，不用收）
  // 展开 / 收回：从「新建子日历」那颗胶囊长成卡片，收回时缩回胶囊（clip-path 从胶囊的位置和圆角长到整张卡片，里面的内容稍后淡入）
  // 网页 / 安卓：胶囊就是侧拉菜单里的按钮；iPhone / Mac 的原生侧拉菜单已经收起，按原生按钮的位置算（面板宽 300、外边距 10、按钮左右各留 12、高 52）
  const KS = $('#calKindSheet');
  const reduceMo = matchMedia('(prefers-reduced-motion: reduce)');
  let sbProbe = null;
  function pillRect() {
    const b = $('#drawerAdd'), r = b.getBoundingClientRect();
    if (!nativeDrawer() && r.width > 0) return r;
    if (!sbProbe) { sbProbe = document.createElement('div'); sbProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:var(--safe-b);visibility:hidden;pointer-events:none'; document.body.appendChild(sbProbe); }
    const mac = MC.Native.has && document.body.classList.contains('native-mac'), sb = mac ? 0 : sbProbe.offsetHeight;
    const h = 52, top = innerHeight - sb - 10 - 12 - h;
    return { left: 22, top, width: Math.min(300, innerWidth - 20) - 24, height: h, right: 22 + Math.min(300, innerWidth - 20) - 24, bottom: top + h };
  }
  // 一滴玻璃：打开时胶囊先往上鼓起来，再分离出一滴、一边飞一边放大成卡片（带一点回弹），卡片内容再淡入；收起时反过来缩成一滴、融回胶囊。
  // 胶囊一直留在原位，展开后只剩一颗空的玻璃（字和加号隐去，.empty）
  function morphKinds(opening, done) {
    const btn = $('#drawerAdd');
    if (reduceMo.matches || !document.body.animate) { btn.classList.toggle('empty', opening); done && done(); return; }
    const p = pillRect(), c = KS.getBoundingClientRect();
    const box = (x, y, w, h, r) => ({ left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderRadius: r + 'px' });
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2, pcx = p.left + p.width / 2;
    // 一步到位：中途不停。先被拉长（底还粘在胶囊上，像水滴被拉出去），然后一口气弹开成卡片，略微冲过一点再回来
    const top1 = p.top - (p.top - cy) * .5, bw = 104;
    const frames = [
      box(p.left, p.top, p.width, p.height, p.height / 2),                                                   // 胶囊
      box(pcx + (cx - pcx) * .25 - bw / 2, top1, bw, p.bottom - 8 - top1, bw / 2),                          // 被拉长的一滴，底还连着胶囊
      box(c.left - c.width * .012, c.top - c.height * .012, c.width * 1.024, c.height * 1.024, 34),          // 弹开，冲过一点点
      box(c.left, c.top, c.width, c.height, 34),                                                             // 卡片
    ];
    const offs = [0, .3, .78, 1];
    const blob = document.createElement('div'); blob.className = 'ks-blob'; document.body.appendChild(blob);
    btn.classList.add('empty');
    KS.classList.add('morph'); KS.style.opacity = '0';
    const kf = opening ? frames.map((f, k) => ({ ...f, offset: offs[k] }))
      : [frames[3], frames[1], frames[0]].map((f, k) => ({ ...f, offset: [0, .6, 1][k] }));   // 收起：直接缩回去，不再冲过
    const a = blob.animate(kf, { duration: opening ? 380 : 300, easing: opening ? 'cubic-bezier(.3,.75,.35,1)' : 'cubic-bezier(.45,0,.4,1)', fill: 'forwards' });
    let fin = false, shown = false;
    // 一点下去就看得到里面的东西：水滴拉到四成多（已经接近卡片大小）时，卡片和内容就淡进来，不等动画放完（用户要的：只提速、动画不变）
    const reveal = () => { if (shown || fin) return; shown = true; KS.style.opacity = ''; KS.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: 'ease-out' }); };
    if (opening) setTimeout(reveal, 380 * .45);
    const finish = () => {
      if (fin) return;
      if (opening) reveal();
      fin = true;
      if (opening) {
        KS.style.opacity = '';
      } else { btn.classList.remove('empty'); KS.style.opacity = ''; }
      blob.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => blob.remove();
      KS.classList.remove('morph');
      done && done();
    };
    a.onfinish = finish; setTimeout(finish, (opening ? 380 : 300) + 120);   // 动画事件没来（后台标签页）也照样收尾
  }
  function openKinds() {
    let picked = false;
    const pick = k => { picked = true; UI.close('calKindSheet', true); $('#drawerAdd').classList.remove('empty'); setTimeout(() => calForm(null, k), 120); };
    KS.querySelector('[data-k="rec"]').onclick = () => pick('');
    KS.querySelector('[data-k="days"]').onclick = () => pick('days');
    // 关闭前先缩回胶囊（往下拉着关的已经跟着手指走了，直接收起）
    UI.guard('calKindSheet', proceed => {
      if (KS.style.transform) { proceed(); return; }
      morphKinds(false);   // 收起：先量好卡片的位置，卡片换成一滴玻璃缩回胶囊
      proceed();
    });
    // 卡片收在侧拉菜单里：和菜单一样宽，底边落在「新建子日历」胶囊上方（菜单没拉出来时照旧居中）
    const dr = el.getBoundingClientRect(), pr = pillRect(), inD = dr.width > 0 && dr.right > 0 && el.classList.contains('vis');
    KS.classList.toggle('in-drawer', inD);
    if (inD) {
      KS.style.setProperty('--kx', dr.left + 8 + 'px'); KS.style.setProperty('--kw', dr.width - 16 + 'px');
      KS.style.setProperty('--kb', innerHeight - pr.top + 10 + 'px'); KS.style.setProperty('--kh', pr.top - 10 - dr.top - 8 + 'px');
    }
    UI.open('calKindSheet', () => { UI.guard('calKindSheet'); if (!picked && nativeDrawer()) D.open(); });
    KS.classList.add('morph'); void KS.offsetWidth;   // 先没有过渡地放到最终位置（藏着），再由一滴玻璃从胶囊分离出去、长成卡片
    morphKinds(true);
  }
  $('#drawerAdd').onclick = () => openKinds();

  // 新建 / 编辑：名称 + 颜色
  function calForm(c, kind = c ? c.kind : '') {
    const days = kind === 'days';
    const used = new Set(MC.data.cals.map(x => x.color));
    let color = c ? c.color : MC.suggestCalColor([...used]); // 没选颜色时：自动挑和主日历、其他记录日历都不冲突的
    // 纪念日历：先选图标（按大类分好的那几组，去掉重复），颜色在下面
    let icon = days ? (c && c.icon) || 'heart' : '';
    const P = DP(), ICS = P ? [...new Set(P.ICON_GROUPS.flatMap(g => g[1]))].filter(k => P.ICONS[k]) : [];
    const icPick = () => days && ICS.length ? `<div class="field"><span>${T('图标')}</span><div class="cf-icons" id="calIc" style="--cc:${color}">${ICS.map(k =>
      `<button type="button" class="cf-ic${k === icon ? ' on' : ''}" data-ic="${k}" aria-pressed="${k === icon}">${P.svgOf(k)}</button>`).join('')}</div></div>` : '';
    const sw = () => icPick() + `<div class="field"><span>颜色</span><div class="dr-swatches" id="calSw">${MC.CAL_COLORS.map(x =>
      `<button type="button" class="dr-sw${x === color ? ' on' : ''}" style="--cc:${x}" data-c="${x}" aria-label="颜色 ${x}" aria-pressed="${x === color}"></button>`).join('')}</div></div>`;
    MC.openForm({
      title: c ? (days ? T('编辑纪念日历') : '编辑日历') : (days ? T('新建纪念日历') : '新建记录日历'),
      submit: c ? '保存' : '新建',
      // 顶上的预览：图标块用选中的颜色，名字跟着输入实时变
      hero: `<div class="cf-hero" id="cfHero" style="--cc:${color}"><div class="cf-tile" id="cfTile">${days ? daysIcon({ icon }) : ICON_REC}</div><div class="cf-name${c ? '' : ' ph'}" id="cfName">${MC.esc(c ? c.name : (days ? T('纪念日历') : '记录日历'))}</div></div>`,
      fields: [{ id: 'calName', label: '名称', ph: days ? T('比如：我们、生日、旅行') : '日历名称', val: c ? c.name : '', max: 24 }],
      note: days && !c ? T('纪念日历记录重要的日子：未来的倒数，过去的累计。每个日子可以写小纸条、建相册、生成分享图片。') : '',
      extra: sw() + (days ? `<div class="group dr-switches">
        <label class="pk-row"><span>在主日历显示<small>${T('每个日子到了那一天，也出现在主日历里')}</small></span><input type="checkbox" class="switch" id="calMain"${c && c.showInMain ? ' checked' : ''}></label>
      </div>` : `<div class="group dr-switches">
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
        const showInMain = $('#calMain').checked, notify = !days && $('#calNotify').checked;   // 纪念日历也能在主日历显示
        const rateOn = !days && $('#calRate').checked, rateLabels = days ? undefined : MC.normRateLabels([0, 1, 2, 3].map(i => $('#calRL' + i).value));
        if (c) { MC.updateCal(c, days ? { name, color, showInMain, notify, icon } : { name, color, showInMain, notify, rateOn, rateLabels }); MC.reindex(); D.paint(); render(); MC.Cal.render(); UI.toast('已保存'); return; }
        const nc = MC.addCal(name, color, { showInMain, notify, rateOn, rateLabels, icon, kind: days ? 'days' : '' });
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
    const icBox = $('#calIc');
    if (icBox) icBox.addEventListener('click', e => {
      const b = e.target.closest('.cf-ic'); if (!b) return;
      icon = b.dataset.ic; $('#cfTile').innerHTML = daysIcon({ icon });
      icBox.querySelectorAll('.cf-ic').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    });
    $('#calSw').addEventListener('click', e => {
      const b = e.target.closest('.dr-sw'); if (!b) return;
      color = b.dataset.c; $('#cfHero').style.setProperty('--cc', color); if ($('#calIc')) $('#calIc').style.setProperty('--cc', color);
      $('#calSw').querySelectorAll('.dr-sw').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    });
    $('#ff_calName').addEventListener('input', e => { const v = e.target.value.trim(), n = $('#cfName'); n.textContent = v || (days ? T('纪念日历') : '记录日历'); n.classList.toggle('ph', !v); });
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
  // 总览是纪念日历的第二页：往右滑是回到纪念日，不拉侧栏（回到纪念日后再往右滑才拉侧栏）

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
