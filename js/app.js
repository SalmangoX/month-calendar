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

  // ---------- 页面 ----------
  let page = 'cal';
  function showPage(p) {
    page = p;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.page === p));
    $('#dock').classList.toggle('no-fab', p === 'set');
    renderPage();
  }
  function renderPage() {
    if (page === 'cal') requestAnimationFrame(() => MC.Cal.render());
    else if (page === 'today') renderToday();
    else if (page === 'quad') renderQuad();
    else renderSettings();
  }
  $('#tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showPage(b.dataset.page); });
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
    if (!today.length && !overdue.length) h = `<div class="big-empty"><b>☀️</b>今天没有安排<br>点左下角 ＋ 添加</div>`;
    else if (!open.length && !overdue.length) h = `<div class="big-empty" style="padding:28px 20px 10px"><b>🎉</b>今天的事都完成了</div>` + h;
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
  function segSet(sel, val) { document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(val))); }
  function syncText() {
    if (!MC.vault.connected()) return '未连接同步';
    if (MC.vault.locked()) return '已锁定';
    if (MC.syncState.busy) return '同步中…';
    if (MC.syncState.error) return '⚠ ' + MC.syncState.error;
    return MC.settings.lastSync
      ? '已同步 ' + new Date(MC.settings.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '尚未同步';
  }
  function renderSettings() {
    const pf = MC.data.profile;
    const ab = $('#avatarBtn');
    $('#avatarImg').hidden = !pf.avatar;
    if (pf.avatar) $('#avatarImg').src = pf.avatar;
    $('#avatarInitial').textContent = pf.avatar ? '' : initial();
    ab.querySelector('.avatar-edit').textContent = pf.avatar ? '更换' : '添加';
    if (document.activeElement !== $('#nickInput')) $('#nickInput').value = pf.name;
    $('#profileSub').textContent = syncText();
    segSet('#sTheme', MC.settings.theme);
    segSet('#sWeek', MC.settings.weekStart);
    renderSyncGroup();
    renderNotifyGroup();
    const total = MC.data.events.length, done = MC.data.events.filter(e => e.done).length;
    $('#statLine').textContent = `共 ${total} 个事件，已完成 ${done} 个 · 版本 ${MC.VERSION}`;
    if (!iosScript) fetch('widget-ios-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (iosScript = t)).catch(() => {});
    if (!workflowYml) fetch('scripts/reminders.yml', { cache: 'no-cache' }).then(r => r.text()).then(t => (workflowYml = t)).catch(() => {});
  }
  const growBtn = (act, label, cls = '', val = '') =>
    `<div class="grow"><button class="grow-main ${cls}" data-act="${act}">${label}</button>${val ? `<span class="grow-val">${esc(val)}</span>` : ''}</div>`;
  function renderSyncGroup() {
    const g = $('#syncGroup');
    if (!MC.vault.connected()) {
      g.innerHTML = `<div class="grow"><button class="grow-main accent" data-act="connect">连接 GitHub 开启同步</button><button class="help glass" data-help="sync" aria-label="如何获取令牌">?</button></div>`;
      $('#syncHint').textContent = '每个人用自己的 GitHub 令牌。令牌会用你设置的密码加密，只保存在这台设备上。';
      return;
    }
    let h = `<div class="grow"><span>状态</span><span class="grow-val">${esc(syncText())}</span><button class="help glass" data-help="sync" aria-label="同步说明">?</button></div>`;
    h += growBtn('sync', '立即同步');
    h += growBtn('password', MC.vault.has() ? '修改密码' : '设置密码', '', MC.vault.has() ? '已开启' : '未设置');
    if (MC.vault.has()) h += growBtn('lock', '立即锁定');
    h += growBtn('retoken', '更换令牌');
    h += growBtn('disconnect', '断开连接', 'danger');
    g.innerHTML = h;
    $('#syncHint').textContent = MC.vault.has()
      ? '令牌已用密码加密。打开 App 或离开超过 5 分钟后需要输入密码。'
      : '令牌目前以明文保存在本机，建议设置密码。';
  }
  function renderNotifyGroup() {
    const g = $('#notifyGroup');
    const on = Push.enabled();
    let h = `<label class="grow"><span>提醒通知</span><input type="checkbox" class="switch" id="nSwitch" ${on ? 'checked' : ''}><button class="help glass" data-help="notify" aria-label="提醒设置步骤">?</button></label>`;
    if (on) h += growBtn('ntest', '发送测试通知');
    if (on && MC.settings.vapidPrivate) h += growBtn('nkey', '复制通知密钥（填到 GitHub）');
    g.innerHTML = h;
    let hint;
    if (!Push.supported()) hint = '这个浏览器不支持通知。';
    else if (Push.isIOS && !Push.standalone()) hint = 'iPhone 需要从主屏幕图标打开月历才能开启通知（iOS 16.4 及以上）。';
    else if (!on) hint = MC.settings.notify && Push.permission() === 'denied' ? '通知权限被系统拒绝，请到系统设置中允许。' : '开启后，设置了提醒的事件会到点通知你。';
    else if (Push.remoteReady()) hint = 'App 打开时直接提醒；App 关闭时由你仓库里的 GitHub Actions 每 5 分钟推送一次，需按「?」完成一次设置。';
    else hint = '目前只在 App 打开时提醒。连接 GitHub 后可以在 App 关闭时也收到推送。';
    $('#notifyHint').textContent = hint;
  }
  $('#notifyGroup').addEventListener('change', async e => {
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
    sw.disabled = false;
    renderSettings();
  });
  $('#notifyGroup').addEventListener('click', async e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'ntest') { try { await Push.test(); } catch (err) { UI.toast('发送失败：' + err.message); } }
    if (a.dataset.act === 'nkey') copy(MC.settings.vapidPrivate, '已复制通知密钥');
  });

  $('#sTheme').onclick = e => { const b = e.target.closest('button'); if (!b) return; MC.settings.theme = b.dataset.v; MC.saveSettings(); applyTheme(); segSet('#sTheme', MC.settings.theme); };
  $('#sWeek').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    MC.settings.weekStart = Number(b.dataset.v); MC.saveSettings(); segSet('#sWeek', MC.settings.weekStart);
    MC.Cal.realign();
  };
  $('#syncGroup').addEventListener('click', async e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'connect' || act === 'retoken') connectForm(act === 'retoken');
    else if (act === 'sync') { const ok = await MC.sync(); UI.toast(ok ? '已同步' : (MC.syncState.error || '同步失败')); renderSettings(); }
    else if (act === 'password') passwordForm();
    else if (act === 'lock') { MC.vault.lock(); showLock(); }
    else if (act === 'disconnect') {
      if (!confirm('断开后这台设备不再同步，日历数据仍保留在本机。确定断开？')) return;
      if (Push.enabled()) await Push.disable();
      MC.vault.disconnect();
      renderSettings(); UI.toast('已断开连接');
    }
  });
  MC.onSyncStatus = () => { if (page === 'set') { $('#profileSub').textContent = syncText(); renderSyncGroup(); } };

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
  $('#btnCopyIOS').onclick = copyIOS;
  $('#btnCopyAndroid').onclick = copyAndroid;

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
  $('#btnExport').onclick = async () => {
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
  };
  $('#btnImport').onclick = () => $('#importFile').click();
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
