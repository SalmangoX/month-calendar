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
    $('#themeColor').setAttribute('content', dark ? '#000000' : '#FFFFFF');
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
    ind.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
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
  function tabAt(x) {
    const list = tabs();
    for (const b of list) { const r = b.getBoundingClientRect(); if (x >= r.left && x <= r.right) return b; }
    return x < list[0].getBoundingClientRect().left ? list[0] : list[list.length - 1];
  }
  function moveDrag(x) {
    const r = tabbar.getBoundingClientRect(), w = tabs()[0].offsetWidth;
    const left = Math.max(5, Math.min(r.width - 5 - w, x - r.left - w / 2));
    ind.style.width = w + 'px';
    ind.style.transform = `translateX(${left - 5}px) scale(1.06, 1.1)`;
    const h = tabAt(x);
    tabs().forEach(b => b.classList.toggle('hover', b === h));
    if (h !== pd.hover) { if (pd.hover) buzz(4); pd.hover = h; }
  }
  function startDrag(x) {
    if (!pd || pd.dragging) return;
    pd.dragging = true;
    tabbar.classList.add('dragging');
    buzz(10);
    moveDrag(x);
  }
  function endDrag(x, commit) {
    if (!pd) return;
    clearTimeout(pd.timer);
    const wasDrag = pd.dragging, btn = pd.btn;
    pd = null;
    tabbar.classList.remove('dragging');
    tabs().forEach(b => b.classList.remove('hover'));
    if (!commit) { placeInd(); return; }
    const target = wasDrag ? tabAt(x) : btn;
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

  $('#fab').onclick = () => MC.Editor.openNew(page === 'today' ? MC.todayStr() : MC.Cal.selected());

  MC.onChange = () => {
    if (page === 'cal') MC.Cal.refresh(); else renderPage();
    paintTabAvatar();
  };

  // ---------- 今日 ----------
  function renderToday() {
    const d = new Date(), t = MC.todayStr();
    $('#todayDate').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${MC.WD[d.getDay()]}`;
    const overdue = MC.data.events.filter(e => !e.done && e.date < t).sort((a, b) => a.date.localeCompare(b.date) || MC.cmp(a, b));
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
    if (Push.remoteReady()) return 'App 关闭时由你仓库里的 GitHub Actions 每 5 分钟推送，需按「?」完成一次设置。';
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
      ], '令牌会用你设置的密码加密，只保存在这台设备上。');
    } else {
      const rows = [
        srow({ act: 'sync', icon: 'refresh', color: COL.teal, label: '立即同步', sub: syncText()[0], help: 'sync', chev: false }),
        srow({ act: 'password', icon: 'lock', color: COL.amber, label: MC.vault.has() ? '修改密码' : '设置密码', val: MC.vault.has() ? '已开启' : '未设置' }),
      ];
      if (MC.vault.has()) rows.push(srow({ act: 'lock', icon: 'lockNow', color: COL.graphite, label: '立即锁定', chev: false }));
      rows.push(srow({ act: 'retoken', icon: 'key', color: COL.plum, label: '更换令牌' }));
      rows.push(srow({ act: 'disconnect', icon: 'unlink', color: COL.rose, label: '断开连接', danger: true, chev: false }));
      h += group('账户与同步', rows, MC.vault.has() ? '打开 App 或离开超过 5 分钟后需要输入密码。' : '令牌目前以明文保存在本机，建议设置密码。');
    }
    const nrows = [srow({ icon: 'bell', color: COL.rose, label: '提醒通知', sw: 'nSwitch', swOn: Push.enabled(), help: 'notify' })];
    if (Push.enabled()) nrows.push(srow({ act: 'ntest', icon: 'send', color: COL.teal, label: '发送测试通知', chev: false }));
    if (Push.enabled() && S.vapidPrivate) nrows.push(srow({ act: 'nkey', icon: 'key', color: COL.amber, label: '复制通知密钥', sub: '填到 GitHub 仓库的 Secrets', chev: false }));
    h += group('提醒', nrows, notifyHint());
    h += group('桌面小组件', [
      srow({ act: 'ios', icon: 'phone', color: COL.slate, label: 'iOS 小组件', sub: '复制 Scriptable 脚本', help: 'ios', chev: false }),
      srow({ act: 'android', icon: 'android', color: COL.sage, label: '安卓小组件', sub: '复制小组件链接', help: 'android', chev: false }),
    ]);
    h += group('数据', [
      srow({ act: 'export', icon: 'export', color: COL.indigo, label: '导出备份', chev: false }),
      srow({ act: 'import', icon: 'import', color: COL.graphite, label: '导入备份', sub: '与现有数据合并', chev: false }),
    ]);
    $('#setGroups').innerHTML = h;
    const total = MC.data.events.length, done = MC.data.events.filter(e => e.done).length;
    $('#statLine').textContent = `版本 ${MC.VERSION} · 共 ${total} 个事件，已完成 ${done} 个`;
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
    else if (act === 'password') passwordForm();
    else if (act === 'lock') { MC.vault.lock(); showLock(); }
    else if (act === 'disconnect') {
      if (!confirm('断开后这台设备不再同步，日历数据仍保留在本机。确定断开？')) return;
      if (Push.enabled()) await Push.disable();
      MC.vault.disconnect(); renderSettings(); UI.toast('已断开连接');
    }
    else if (act === 'ntest') { try { await Push.test(); } catch (err) { UI.toast('发送失败：' + err.message); } }
    else if (act === 'nkey') copy(MC.settings.vapidPrivate, '已复制通知密钥');
    else if (act === 'ios') copyIOS();
    else if (act === 'android') copyAndroid();
    else if (act === 'export') exportData();
    else if (act === 'import') $('#importFile').click();
  });
  $('#setGroups').addEventListener('change', async e => {
    if (e.target.id !== 'nSwitch') return;
    const sw = e.target;
    sw.disabled = true;
    try {
      if (sw.checked) {
        const remote = await Push.enable();
        UI.toast(remote ? '提醒已开启' : '提醒已开启（App 打开时）');
        if (remote && MC.settings.vapidPrivate) setTimeout(() => openHelp('notify'), 400);
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
    setTimeout(() => { const i = $('#formBody input'); i && i.focus(); }, 350);
  }
  async function submitForm(e) {
    e && e.preventDefault();
    if (!formHandler) return;
    const vals = {};
    formHandler.fields.forEach(f => (vals[f.id] = $('#ff_' + f.id).value));
    const btn = $('#formSubmit'), label = btn.textContent;
    btn.disabled = true; btn.textContent = '处理中…'; $('#formErr').textContent = '';
    try { await formHandler.onSubmit(vals); UI.close('formSheet'); }
    catch (err) { $('#formErr').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  $('#formSubmit').onclick = submitForm;
  $('#formBody').addEventListener('submit', submitForm);

  function checkPw(pw, pw2) {
    if (pw !== pw2) throw new Error('两次输入的密码不一致');
    if (pw && pw.length < 4) throw new Error('密码至少 4 位');
  }
  function connectForm(isRetoken) {
    openForm({
      title: isRetoken ? '更换令牌' : '连接 GitHub',
      submit: '连接',
      fields: [
        { id: 'token', label: 'GitHub 令牌（需要 Gists 读写权限）', type: 'password', ph: 'github_pat_… 或 ghp_…' },
        { id: 'pw', label: '设置密码（用于加密令牌、打开 App 时解锁）', type: 'password', ph: '至少 4 位', ac: 'new-password' },
        { id: 'pw2', label: '再输入一次密码', type: 'password', ac: 'new-password' },
      ],
      note: '每个人填自己的令牌。令牌只保存在这台设备上，不会上传到任何地方。忘记密码只能清除令牌后重新连接，日历数据不受影响。不填密码也可以，但令牌会以明文保存在本机。',
      onSubmit: async v => {
        const token = v.token.trim();
        if (!token) throw new Error('请粘贴 GitHub 令牌');
        checkPw(v.pw, v.pw2);
        const id = await MC.findGist(token); // 同时校验令牌
        if (isRetoken && MC.settings.gistId && id && id !== MC.settings.gistId) MC.settings.gistId = id;
        if (!isRetoken) MC.settings.gistId = id;
        await MC.vault.save(token, v.pw);
        const ok = await MC.sync();
        if (Push.enabled()) await Push.resubscribe();
        renderSettings();
        UI.toast(ok ? (id ? '已连接，并同步了云端数据' : '已连接，云端数据已创建') : (MC.syncState.error || '已连接'));
      },
    });
  }
  function passwordForm() {
    const has = MC.vault.has();
    const fields = [];
    if (has) fields.push({ id: 'old', label: '当前密码', type: 'password', ac: 'current-password' });
    fields.push({ id: 'pw', label: has ? '新密码（留空则取消密码）' : '新密码', type: 'password', ac: 'new-password', ph: '至少 4 位' },
      { id: 'pw2', label: '再输入一次', type: 'password', ac: 'new-password' });
    openForm({
      title: has ? '修改密码' : '设置密码', submit: '保存', fields,
      onSubmit: async v => {
        checkPw(v.pw, v.pw2);
        if (!has && !v.pw) throw new Error('请输入新密码');
        const token = has ? await MC.vault.unlock(v.old) : MC.session.token;
        await MC.vault.save(token, v.pw);
        renderSettings();
        UI.toast(v.pw ? '密码已保存' : '已取消密码');
      },
    });
  }

  // ---------- 锁屏 ----------
  function showLock() {
    document.documentElement.classList.add('locked');
    paintAvatar($('#lockAvatar'));
    $('#lockName').textContent = MC.data.profile.name || '月历';
    $('#lockErr').textContent = '';
    $('#lockPw').value = '';
    setTimeout(() => $('#lockPw').focus(), 200);
  }
  function hideLock() { document.documentElement.classList.remove('locked'); $('#lockPw').blur(); }
  $('#lockForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await MC.vault.unlock($('#lockPw').value);
      hideLock();
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
    if (MC.vault.has() && MC.session.token && hiddenAt && Date.now() - hiddenAt > 5 * 60000) { MC.vault.lock(); showLock(); return; }
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
        <li>长按这个小组件 → <b>编辑小组件</b>：Script 选「月历」；When Interacting 选 <b>Open URL</b>，填 <code>${esc(appUrl())}</code>，这样点小组件就会打开月历。</li>
      </ol>
      <div class="help-copy"><button class="chip-btn glass" data-copy="ios">复制 iOS 小组件脚本</button><button class="chip-btn glass" data-copy="url">复制 App 网址</button></div>
      <div class="help-tip">小组件多久刷新一次由 iOS 决定，一般 15–30 分钟。小组件参数（Parameter）填 <code>dark</code> 或 <code>light</code> 可固定深浅色，不填就跟随系统。</div>`,
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
      title: '提醒通知设置',
      html: `<p class="hint" style="margin:0 2px 14px">App 打开时到点会直接提醒。想在 App 关闭时也收到通知，需要让你 GitHub 仓库里的定时任务帮忙推送，设置一次即可：</p>
      <ol class="steps">
        <li>先在「账户与同步」连接 GitHub。iPhone 需要 iOS 16.4 以上，并且从主屏幕图标打开月历。</li>
        <li>打开 <b>提醒通知</b> 开关，在弹窗中点 <b>允许</b>。</li>
        <li>点下方 <b>复制通知密钥</b>。</li>
        <li>打开 GitHub 上这个 App 的仓库 → <b>Settings</b> → 左侧 <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>：Name 填 <code>VAPID_PRIVATE_KEY</code>，Secret 粘贴刚复制的密钥 → <b>Add secret</b>。</li>
        <li>再点一次 New repository secret：Name 填 <code>GIST_TOKEN</code>，Secret 粘贴你的 GitHub 令牌 → Add secret。</li>
        <li>回到仓库首页，看有没有 <code>.github/workflows/reminders.yml</code> 这个文件。没有的话：<b>Add file</b> → <b>Create new file</b>，文件名填 <code>.github/workflows/reminders.yml</code>，内容点下方「复制工作流文件」粘贴 → <b>Commit changes</b>。</li>
        <li>打开仓库的 <b>Actions</b> 页，如果提示启用就点启用 → 左侧选 <b>月历提醒</b> → <b>Run workflow</b>。出现绿色对勾就成功了。</li>
      </ol>
      <div class="help-copy">
        ${MC.settings.vapidPrivate ? '<button class="chip-btn glass" data-copy="vapid">复制通知密钥</button>' : ''}
        <button class="chip-btn glass" data-copy="yml">复制工作流文件</button>
      </div>
      ${MC.settings.vapidPrivate ? '' : '<div class="help-tip" style="margin-bottom:10px">通知密钥只在第一次开启通知的那台设备上显示。如果找不到了，可以点「重新生成通知密钥」，之后每台设备都要重新打开一次提醒开关。<br><button class="chip-btn glass" data-copy="regen" style="margin-top:8px">重新生成通知密钥</button></div>'}
      <div class="help-tip">之后每 5 分钟检查一次。GitHub 的定时任务在高峰时可能晚几分钟到十几分钟，精确到分钟的提醒请以 App 打开时为准。仓库 60 天没有改动时 GitHub 会暂停定时任务并发邮件提醒，点邮件里的按钮即可恢复。令牌过期换新后，也要更新 <code>GIST_TOKEN</code>。</div>`,
    }),
    sync: () => ({
      title: '多设备同步',
      html: `<ol class="steps">
        <li>登录 GitHub → 右上角头像 → <b>Settings</b> → 左侧最下面 <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>。</li>
        <li>名字随意，有效期自选。在 Permissions 里找到 <b>Gists</b>（属于 Account permissions），设为 <b>Read and write</b>，其他都不用动 → <b>Generate token</b>，立刻复制保存（只显示一次）。</li>
        <li>回到月历：设置 → <b>连接 GitHub 开启同步</b>，粘贴令牌，设置一个密码。</li>
        <li>你的其他设备：同样粘贴<b>你自己的</b>令牌，密码可以和这台不同，日历会自动同步。</li>
      </ol>
      <div class="help-tip">每个人用自己的 GitHub 账号和令牌，数据各自独立。令牌用密码加密后只保存在本机，打开 App 时输入密码解锁。忘记密码只能清除令牌后重新连接，日历数据不受影响。</div>`,
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
  if (MC.session.token) MC.sync();
  window.addEventListener('online', () => MC.session.token && MC.sync());
  setInterval(() => { if (document.visibilityState === 'visible' && MC.session.token) MC.sync(); }, 3 * 60 * 1000);
  setInterval(() => { // 跨过午夜
    const d = new Date().getDate();
    if ($('#tabCalNum').textContent !== String(d)) { $('#tabCalNum').textContent = d; renderPage(); }
  }, 60000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') showPage('today'); });
  }
  setTimeout(() => MC.onNotifyCheck(), 1500);
})();
