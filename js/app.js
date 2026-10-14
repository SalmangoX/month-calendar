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
    const forced = t === 'auto' ? null : (dark ? '#000000' : '#FFFFFF');
    $('#themeLight').setAttribute('content', forced || '#FFFFFF');
    $('#themeDark').setAttribute('content', forced || '#000000');
  }
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);

  // ---------- 页面 & 底部菜单栏（点击，或长按拖动切换） ----------
  let page = 'cal';
  const tabbar = $('#tabbar'), ind = $('#tabInd');
  const tabs = () => [...tabbar.querySelectorAll('button[data-page]')];
  const tabOf = p => tabs().find(b => b.dataset.page === p);
  function placeInd(animate = true) {
    const btn = tabOf(page); if (!btn) return;
    if (!animate) ind.style.transition = 'none';
    ind.style.width = btn.offsetWidth + 'px';
    ind.style.transform = `translate3d(${btn.offsetLeft}px,0,0)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  function showPage(p) {
    page = p;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
    tabs().forEach(b => b.classList.toggle('on', b.dataset.page === p));
    placeInd();
    renderPage();
  }
  function renderPage() {
    if (page === 'cal') requestAnimationFrame(() => MC.Cal.render());
    else if (page === 'today') renderToday();
    else if (page === 'quad') renderQuad();
    else renderSettings();
  }
  let pd = null;
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  let geo = null, rafId = 0, pendingX = null;
  function measureTabs() {
    const r = tabbar.getBoundingClientRect();
    const list = tabs();
    geo = { left: r.left, width: tabbar.offsetWidth, w: list[0].offsetWidth, pad: list[0].offsetLeft,
      rects: list.map(b => { const br = b.getBoundingClientRect(); return [br.left, br.right, b]; }) };
  }
  function tabAt(x) {
    if (!geo) measureTabs();
    for (const [l, r, b] of geo.rects) if (x >= l && x <= r) return b;
    return x < geo.rects[0][0] ? geo.rects[0][2] : geo.rects[geo.rects.length - 1][2];
  }
  function moveDrag(x) { // 每帧最多更新一次
    pendingX = x;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!pd || pendingX == null) return;
      const { left: L, width, w, pad } = geo;
      const left = Math.max(pad, Math.min(width - pad - w, pendingX - L - w / 2));
      ind.style.width = w + 'px';
      ind.style.transform = `translate3d(${left}px,0,0) scale(1.06, 1.1)`;
      const h = tabAt(pendingX);
      if (h !== pd.hover) {
        if (pd.hover) { pd.hover.classList.remove('hover'); buzz(4); }
        h.classList.add('hover'); pd.hover = h;
      }
    });
  }
  function startDrag(x) {
    if (!pd || pd.dragging) return;
    measureTabs();
    pd.dragging = true;
    tabbar.classList.add('dragging');
    buzz(10);
    moveDrag(x);
  }
  function endDrag(x, commit) {
    if (!pd) return;
    clearTimeout(pd.timer);
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
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

  $('#fab').onclick = () => MC.Editor.openNew(page === 'today' ? MC.todayStr() : MC.Cal.selected());

  MC.onChange = () => {
    if (page === 'cal') MC.Cal.refresh(); else renderPage();
    paintTabAvatar();
  };

  // ---------- 今日 ----------
  function renderToday() {
    const d = new Date(), t = MC.todayStr();
    $('#todayDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${MC.WD[d.getDay()]}`;
    const overdue = MC.data.events.filter(e => !e.done && MC.endDate(e) < t).sort((a, b) => a.date.localeCompare(b.date) || MC.cmp(a, b));
    const today = MC.eventsOn(t);
    const open = today.filter(e => !e.done), done = today.filter(e => e.done);
    let h = '';
    if (overdue.length) h += `<section class="sec"><h3 class="over"><span>已逾期</span><span>${overdue.length}</span></h3><ul class="card glass-panel">${overdue.map(e => UI.itemHTML(e, { showDate: true })).join('')}</ul></section>`;
    if (open.length) h += `<section class="sec"><h3><span>待完成</span><span>${open.length}</span></h3><ul class="card glass-panel">${open.map(e => UI.itemHTML(e)).join('')}</ul></section>`;
    if (done.length) h += `<section class="sec"><h3><span>已完成</span><span>${done.length}</span></h3><ul class="card glass-panel">${done.map(e => UI.itemHTML(e)).join('')}</ul></section>`;
    const sun = '<span class="em-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg></span>';
    const tick = '<span class="em-ico"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
    if (!today.length && !overdue.length) h = `<div class="big-empty">${sun}今天没有安排<br><small style="color:var(--text3)">点右下角 ＋ 添加</small></div>`;
    else if (!open.length && !overdue.length) h = `<div class="big-empty" style="padding:30px 20px 6px">${tick}今天的事都完成了</div>` + h;
    $('#todayBody').innerHTML = h;
  }
  UI.bindList($('#todayBody'));

  // ---------- 四象限 ----------
  function renderQuad() {
    const showDone = !!MC.settings.quadShowDone;
    $('#btnQuadDone').classList.toggle('on', showDone);
    $('#btnQuadDone').textContent = showDone ? '隐藏已完成' : '显示已完成';
    $('#quadBody').innerHTML = MC.PRI.map(p => {
      const list = MC.data.events.filter(e => e.priority === p.v && (showDone || !e.done))
        .sort((a, b) => (a.done - b.done) || a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
      return `<div class="qcard glass-panel" style="--c:${p.color}">
        <div class="qhead"><span class="roman">${p.roman}</span>${p.quad}<span class="cnt">${list.length || ''}</span></div>
        ${list.length ? `<ul class="qlist">${list.map(e => UI.itemHTML(e, { showDate: true, noFlag: true })).join('')}</ul>` : `<div class="qempty">没有事件</div>`}
      </div>`;
    }).join('');
  }
  UI.bindList($('#quadBody'));
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
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.8"/><path d="M11 18h2"/></svg>',
    android: '<svg viewBox="0 0 24 24"><rect x="5.5" y="9" width="13" height="10" rx="2.5"/><path d="M8.5 9a3.5 3.5 0 0 1 7 0M8 4.5l1.5 2M16 4.5l-1.5 2"/><circle cx="10" cy="13" r=".6" fill="currentColor"/><circle cx="14" cy="13" r=".6" fill="currentColor"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M12 14.5V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    import: '<svg viewBox="0 0 24 24"><path d="M12 4v10.5M8 10.5l4 4 4-4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  };
  const COL = { slate: '#5D7895', sage: '#5F9479', amber: '#C38F45', rose: '#BE6662', plum: '#86769F', graphite: '#7A7F88', teal: '#4E8C92', indigo: '#6170A3' };
  const CHEV = '<span class="chev"><svg viewBox="0 0 8 13"><path d="M1.5 1.5l5 5-5 5"/></svg></span>';
  function srow(o) {
    const sub = o.sub ? `<small>${esc(o.sub)}</small>` : '';
    const val = o.val ? `<span class="sval">${esc(o.val)}</span>` : '';
    const help = o.help ? `<button class="help" data-help="${o.help}" aria-label="查看步骤">?</button>` : '';
    const right = o.sw !== undefined
      ? `<input type="checkbox" class="switch" id="${o.sw}" ${o.swOn ? 'checked' : ''}>${help}`
      : `${val}${help}${o.chev === false ? '' : CHEV}`;
    const inner = `<span class="sicon" style="--ic:${o.color}">${IC[o.icon]}</span><span class="slabel">${esc(o.label)}${sub}</span>${right}`;
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
    if (!Push.supported()) return '这个浏览器不支持通知。';
    if (Push.isIOS && !Push.standalone()) return 'iPhone 需要从主屏幕图标打开月历才能开启通知（iOS 16.4 及以上）。';
    if (!on) return MC.settings.notify && Push.permission() === 'denied' ? '通知权限被系统拒绝，请到系统设置中允许。' : '设置了提醒的事件会到点通知你。';
    if (MC.settings.remoteSetup) return 'App 关闭时由你仓库里的 GitHub 定时任务每 5 分钟检查并推送，高峰时可能晚几分钟。';
    return '目前只在 App 打开时提醒。连接 GitHub 后，App 关闭时也能收到推送。';
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
    let h = group('通用', [
      srow({ act: 'theme', icon: 'theme', color: COL.slate, label: '外观', val: { auto: '跟随系统', light: '浅色', dark: '深色' }[S.theme] }),
      srow({ act: 'week', icon: 'week', color: COL.indigo, label: '每周第一天', val: S.weekStart ? '周一' : '周日' }),
    ]);
    if (!MC.vault.connected()) {
      h += group('账户与同步', [
        srow({ act: 'connect', icon: 'link', color: COL.slate, label: '连接 GitHub', sub: '用自己的令牌在多台设备间同步', help: 'sync' }),
      ], '每个人用自己的 GitHub 令牌，令牌只保存在这台设备上。');
    } else {
      const rows = [
        srow({ act: 'account', icon: 'link', color: COL.slate, label: 'GitHub 账号', val: MC.settings.account ? '@' + MC.settings.account : '已连接', chev: false }),
        srow({ act: 'sync', icon: 'refresh', color: COL.teal, label: '立即同步', sub: syncText()[0], help: 'sync', chev: false }),
      ];
      rows.push(srow({ act: 'retoken', icon: 'key', color: COL.plum, label: '更换令牌' }));
      rows.push(srow({ act: 'disconnect', icon: 'unlink', color: COL.rose, label: '断开连接', danger: true, chev: false }));
      h += group('账户与同步', rows, '令牌只保存在这台设备上。');
    }
    const nrows = [srow({ icon: 'bell', color: COL.rose, label: '提醒通知', sw: 'nSwitch', swOn: Push.enabled(), help: 'notify' })];
    if (Push.enabled()) nrows.push(srow({ act: 'ntest', icon: 'send', color: COL.teal, label: '发送测试通知', chev: false }));
    const dl = MC.data.daily;
    const city = (dl.tz || MC.currentTz()).split('/').pop().replace(/_/g, ' ');
    nrows.push(srow({ icon: 'sun', color: COL.amber, label: '每日未完成提醒', sub: dl.on ? `每天 ${dl.time} · 按当前时区（${city}）` : '每天提醒查看当天未完成的事件', sw: 'dSwitch', swOn: dl.on }));
    if (dl.on) nrows.push(srow({ act: 'dtime', icon: 'clock', color: COL.indigo, label: '每日提醒时间', val: dl.time }));
    // 始终显示，点进去会自动补齐前置条件（连接 GitHub、通知权限）
    nrows.splice(1, 0, S.remoteSetup
      ? srow({ act: 'nsetup', icon: 'cloud', color: COL.sage, label: 'App 关闭时也提醒', val: '已设置' })
      : srow({ act: 'nsetup', icon: 'cloud', color: COL.slate, label: 'App 关闭时也提醒', sub: '点这里一键设置', val: '未设置' }));
    if (S.remoteSetup) nrows.splice(2, 0, srow({ act: 'boost', icon: 'clock', color: COL.teal, label: '让提醒准时', sub: 'GitHub 定时任务会延迟，用 cron-job.org 每 5 分钟叫醒一次', help: 'boost', chev: false }));
    h += group('提醒', nrows, notifyHint());
    h += group('桌面小组件', [
      srow({ act: 'ios', icon: 'phone', color: COL.slate, label: 'iOS 小组件', sub: '复制 Scriptable 脚本', help: 'ios', chev: false }),
      srow({ act: 'android', icon: 'android', color: COL.sage, label: '安卓小组件', sub: '复制小组件链接', help: 'android', chev: false }),
    ]);
    h += group('数据', [
      srow({ act: 'export', icon: 'export', color: COL.indigo, label: '导出备份', chev: false }),
      srow({ act: 'import', icon: 'import', color: COL.graphite, label: '导入备份', sub: '与现有数据合并', chev: false }),
      srow({ act: 'update', icon: 'refresh', color: COL.slate, label: '检查更新', sub: `当前版本 ${MC.VERSION}`, chev: false }),
    ]);
    $('#setGroups').innerHTML = h;
    const total = MC.data.events.length, done = MC.data.events.filter(e => e.done).length;
    $('#statLine').innerHTML = `版本 ${MC.VERSION} · 共 ${total} 个事件，已完成 ${done} 个<br><small style="opacity:.6">${esc(MC.screenInfo || '')}</small>`;
    if (!iosScript) fetch('widget-ios-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (iosScript = t)).catch(() => {});
    if (!workflowYml) fetch('scripts/reminders.yml', { cache: 'no-cache' }).then(r => r.text()).then(t => (workflowYml = t)).catch(() => {});
  }

  $('#setGroups').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.srow.tap')) { e.preventDefault(); e.target.click(); } });
  $('#setGroups').addEventListener('click', async e => {
    if (e.target.closest('[data-help]')) return;
    const row = e.target.closest('[data-act]'); if (!row) return;
    const act = row.dataset.act;
    if (act === 'theme') UI.menu(row.querySelector('.sval'), [
      { label: '跟随系统', value: 'auto', on: MC.settings.theme === 'auto' },
      { label: '浅色', value: 'light', on: MC.settings.theme === 'light' },
      { label: '深色', value: 'dark', on: MC.settings.theme === 'dark' },
    ], v => { MC.settings.theme = v; MC.saveSettings(); applyTheme(); renderSettings(); });
    else if (act === 'week') UI.menu(row.querySelector('.sval'), [
      { label: '周日', value: 0, on: MC.settings.weekStart === 0 },
      { label: '周一', value: 1, on: MC.settings.weekStart === 1 },
    ], v => { MC.settings.weekStart = v; MC.saveSettings(); MC.Cal.realign(); renderSettings(); });
    else if (act === 'connect' || act === 'retoken') connectForm(act === 'retoken');
    else if (act === 'sync') { const ok = await MC.sync(); UI.toast(ok ? '已同步' : (MC.syncState.error || '同步失败')); renderSettings(); }
    else if (act === 'disconnect') {
      UI.menu(row.querySelector('.slabel'), [
        { label: '断开，保留本机数据', value: 'keep' },
        { label: '断开并清除本机数据', value: 'wipe' },
      ], async v => {
        if (v === 'wipe' && !confirm('本机的事件、头像和昵称会被清除（你的 GitHub 账号里的数据不受影响），适合把设备交给别人用。继续？')) return;
        if (Push.enabled()) await Push.disable();
        MC.vault.disconnect();
        MC.settings.account = '';
        if (v === 'wipe') { MC.data = MC.normalize({ events: [] }); MC.saveData(); MC.reindex(); MC.onChange(); }
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
          UI.toast(`每天 ${MC.data.daily.time} 提醒你查看当天未完成的事件`);
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
        if (remote && !MC.settings.remoteSetup) setTimeout(() => setupForm(), 400);
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
  function openForm({ title, fields, note, submit, onSubmit }) {
    $('#formTitle').textContent = title;
    $('#formSubmit').textContent = submit || '确定';
    $('#formBody').innerHTML = fields.map(f =>
      `<label class="field"><span>${f.label}</span><input id="ff_${f.id}" type="${f.type || 'text'}" placeholder="${esc(f.ph || '')}" autocomplete="${f.ac || 'off'}" autocapitalize="off" spellcheck="false"></label>`).join('')
      + (note ? `<p class="form-note">${note}</p>` : '') + '<p class="form-err" id="formErr"></p>';
    formHandler = { onSubmit, fields };
    UI.open('formSheet');
  }
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
          const keep = confirm(`这台设备上已有 ${localCount} 个事件。\n\n点「确定」：把它们合并到 ${login ? '@' + login : '你'} 的账号。\n点「取消」：只使用该账号自己的数据，本机这些事件会被清除。`);
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
    formHandler = { fields: [], onSubmit: async () => { MC.setDaily({ time: val, tz: MC.currentTz() }); renderSettings(); UI.toast(`每日提醒改为 ${val}`); } };
    UI.open('formSheet');
    requestAnimationFrame(() => UI.timeWheel($('#dWheel'), val, '', t => { val = t; }));
  }
  function setupForm() {
    openForm({
      title: '后台提醒', submit: '开始设置',
      fields: [
        { id: 'tmp', label: '临时令牌', type: 'password', ph: 'ghp_…' },
        { id: 'repo', label: '月历所在的仓库（一般不用改）', ph: '用户名/仓库名' },
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
    $('#lockName').textContent = MC.data.profile.name || '月历';
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
  $('#lockForgot').onclick = () => {
    if (!confirm('忘记密码只能清除这台设备上保存的令牌，日历数据会保留。之后需要重新连接 GitHub。继续？')) return;
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
  function copyAndroid() {
    if (!MC.settings.gistId) { UI.toast('请先连接 GitHub 并完成一次同步'); return; }
    copy(androidLink(), '已复制安卓小组件链接');
  }

  // ---------- 帮助 ----------
  const HELP = {
    ios: () => ({
      title: 'iOS 桌面小组件',
      html: `<ol class="steps">
        <li>先在「账户与同步」连接 GitHub，并同步成功一次。</li>
        <li>在 App Store 安装免费的 <b>Scriptable</b>。</li>
        <li>点下方 <b>复制 iOS 小组件脚本</b>（已自动填好你的数据地址）。</li>
        <li>打开 Scriptable → 右上角 <b>＋</b> → 长按空白处粘贴 → 点顶部标题改名为「月历」→ <b>Done</b>。可以点 ▶ 预览大、中、小三种尺寸。</li>
        <li>回到桌面，长按空白处 → 左上角 <b>编辑</b> → <b>添加小组件</b> → 搜索 Scriptable → 选<b>大号</b>（整月日历），也可以选中号或小号 → 添加。</li>
        <li>长按这个小组件 → <b>编辑小组件</b>：Script 选「月历」，When Interacting 保持默认的 <b>Open App</b>。之后点小组件会先拉取最新数据，再打开月历。</li>
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
      <div class="help-tip">小组件显示本月的彩色事件和完成情况，点击会打开月历。刷新频率取决于你装的小组件 App。</div>`,
    }),
    notify: () => ({
      title: '提醒通知',
      html: `<ol class="steps">
        <li>打开 <b>提醒通知</b> 开关并允许通知。iPhone 需要 iOS 16.4 以上，并且从主屏幕图标打开月历。</li>
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
        html: url ? `<p class="hint" style="margin:0 2px 14px">设置了提醒的事件和每日提醒会同步到 iPhone 自带的日历，到点由系统准时弹出，月历关着、断网也会响。只需订阅一次。</p>
        <ol class="steps">
          <li>先点 <b>生成 3 分钟后的测试提醒</b>。</li>
          <li>再点 <b>订阅</b>，系统询问时点「订阅」，然后点「添加」或「完成」。</li>
          <li>等 3 分钟，收到「月历订阅提醒测试」就说明你的 iPhone 支持，以后不用再管。</li>
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
        <div class="help-tip">这个令牌只能触发这个仓库的提醒程序，碰不到其他内容，放在 cron-job.org 上也比较安全。设置好后，GitHub 仓库的 Actions 页面会看到每隔约 5 分钟就有一次「月历提醒」的运行记录。</div>`,
        _url: url,
      };
    },
    sync: () => ({
      title: '多设备同步',
      html: `<ol class="steps">
        <li>点下方 <b>去 GitHub 生成令牌</b>（权限已自动勾好 gist），登录后 Expiration 可选 <b>No expiration</b>。</li>
        <li>拉到最下面点 <b>Generate token</b>，复制以 <code>ghp_</code> 开头的令牌。</li>
        <li>回到月历：设置 → <b>连接 GitHub</b>，粘贴令牌。</li>
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
    if (k === 'ios') copyIOS();
    else if (k === 'android') copyAndroid();
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
      if (!confirm('重新生成后，需要把新密钥更新到 GitHub 的 VAPID_PRIVATE_KEY，其他设备也要重新打开提醒开关。继续？')) return;
      try { await Push.regenerate(); openHelp('notify'); UI.toast('已生成新的通知密钥'); } catch (err) { UI.toast(err.message); }
    }
  });

  // ---------- 备份 ----------
  async function exportData() {
    const json = JSON.stringify(MC.data, null, 2);
    const name = `月历备份-${MC.todayStr()}.json`;
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
    if (Push.enabled() && MC.settings.pushReady && MC.session.token && MC.settings.subTz !== tz) Push.resubscribe();
  };
  syncTz();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncTz(); });
  if (location.hash === '#today') { showPage('today'); history.replaceState(null, '', location.pathname); }
})();
