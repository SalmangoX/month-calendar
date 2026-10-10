/* 月历 · 网页 App
 * 数据保存在本机 localStorage；填写 GitHub 令牌后与私密 Gist 双向同步（按事件逐条合并）。
 */
(() => {
  'use strict';

  // ---------- 常量 ----------
  const DATA_KEY = 'mcal.data.v1';
  const SET_KEY = 'mcal.settings.v1';
  const GIST_FILE = 'mcal-calendar.json';
  const GIST_DESC = '月历 App 数据（请勿手动修改）';
  const PRI = [
    { v: 3, name: '高', color: 'var(--p3)', hex: '#E5484D' },
    { v: 2, name: '中', color: 'var(--p2)', hex: '#F2A33A' },
    { v: 1, name: '低', color: 'var(--p1)', hex: '#4F7BF0' },
    { v: 0, name: '无', color: 'var(--p0)', hex: '#8E8E93' },
  ];
  const priOf = v => PRI.find(p => p.v === v) || PRI[3];
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  // ---------- 工具 ----------
  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => ymd(new Date());

  // ---------- 状态 ----------
  let data = loadData();
  let settings = Object.assign({ theme: 'auto', weekStart: 0, token: '', gistId: '', lastSync: 0 },
    JSON.parse(localStorage.getItem(SET_KEY) || '{}'));
  let byDate = new Map();
  const now = new Date();
  let cur = { y: now.getFullYear(), m: now.getMonth() };
  let selected = todayStr();
  let H = 0, maxChips = 2, animating = false;

  function loadData() {
    try {
      const d = JSON.parse(localStorage.getItem(DATA_KEY));
      if (d && Array.isArray(d.events)) return normalize(d);
    } catch (e) {}
    return { version: 2, updatedAt: 0, events: [], deleted: {} };
  }
  function normalize(d) {
    d.version = 2;
    d.deleted = d.deleted || {};
    d.events = d.events.map(e => ({
      id: e.id || uid(), date: e.date, title: String(e.title || ''),
      priority: Number(e.priority) || 0, done: !!e.done, note: e.note || '',
      createdAt: e.createdAt || Date.now(), updatedAt: e.updatedAt || e.createdAt || Date.now(),
    })).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    d.updatedAt = d.updatedAt || 0;
    return d;
  }
  function saveData() { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
  function saveSettings() { localStorage.setItem(SET_KEY, JSON.stringify(settings)); }

  const cmp = (a, b) => (a.done - b.done) || (b.priority - a.priority) || (a.createdAt - b.createdAt);
  function reindex() {
    byDate = new Map();
    for (const e of data.events) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
    for (const arr of byDate.values()) arr.sort(cmp);
  }

  // 本地修改后调用
  function commit() {
    data.updatedAt = Date.now();
    saveData(); reindex(); renderPanels(); renderHeader();
    if (sheetOpen('daySheet')) renderDay();
    scheduleSync();
  }

  // ---------- 主题 ----------
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = settings.theme;
    const dark = t === 'dark' || (t === 'auto' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeColor').setAttribute('content', dark ? '#000000' : '#FFFFFF');
  }
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);

  // ---------- 月视图 ----------
  const vp = $('#viewport'), track = $('#track');
  const panels = [...track.children];

  function monthAdd(c, d) { const t = new Date(c.y, c.m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; }

  function renderWeekdays() {
    let h = '';
    for (let i = 0; i < 7; i++) {
      const w = (i + settings.weekStart) % 7;
      h += `<div class="${w === 0 || w === 6 ? 'we' : ''}">${WD[w]}</div>`;
    }
    $('#weekdays').innerHTML = h;
  }

  function measure() {
    H = vp.clientHeight;
    const rowH = H / 6;
    const chipH = 15, gap = 2, head = 3 + 24 + 2;
    maxChips = Math.max(1, Math.floor((rowH - head + gap) / (chipH + gap)));
    track.style.transform = `translate3d(0,${-H}px,0)`;
  }

  function panelHTML(c) {
    const first = new Date(c.y, c.m, 1);
    const offset = (first.getDay() - settings.weekStart + 7) % 7;
    const t = todayStr();
    let h = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(c.y, c.m, 1 - offset + i);
      const ds = ymd(d);
      const cls = ['cell'];
      if (d.getMonth() !== c.m) cls.push('out');
      if (ds === t) cls.push('today');
      if (ds === selected) cls.push('sel');
      const evs = byDate.get(ds) || [];
      let chips = '';
      if (evs.length) {
        const fit = evs.length <= maxChips ? evs.length : maxChips - 1;
        for (let k = 0; k < fit; k++) {
          const e = evs[k];
          chips += `<div class="chip${e.done ? ' done' : ''}" style="--c:${priOf(e.priority).color}">${esc(e.title)}</div>`;
        }
        if (fit < evs.length) chips += `<div class="more">+${evs.length - fit}</div>`;
      }
      h += `<div class="${cls.join(' ')}" data-date="${ds}"><div class="num">${d.getDate()}</div><div class="chips">${chips}</div></div>`;
    }
    return h;
  }

  function renderPanels() {
    panels[0].innerHTML = panelHTML(monthAdd(cur, -1));
    panels[1].innerHTML = panelHTML(cur);
    panels[2].innerHTML = panelHTML(monthAdd(cur, 1));
  }

  function renderHeader() {
    $('#monthTitle').textContent = `${cur.m + 1}月`;
    const prefix = `${cur.y}-${pad(cur.m + 1)}-`;
    let total = 0, done = 0;
    for (const [k, arr] of byDate) if (k.startsWith(prefix)) { total += arr.length; done += arr.filter(e => e.done).length; }
    $('#monthSub').textContent = total ? `${cur.y} · 完成 ${done}/${total}` : `${cur.y}`;
    $('#todayNum').textContent = new Date().getDate();
  }

  function go(delta) {
    if (animating) return;
    animating = true;
    track.style.transition = 'transform .34s cubic-bezier(.2,.8,.2,1)';
    track.style.transform = `translate3d(0,${-H - delta * H}px,0)`;
    setTimeout(() => {
      cur = monthAdd(cur, delta);
      track.style.transition = 'none';
      renderPanels(); renderHeader();
      track.style.transform = `translate3d(0,${-H}px,0)`;
      animating = false;
    }, 350);
  }
  function jumpTo(y, m) {
    cur = { y, m };
    renderPanels(); renderHeader();
  }

  // 触摸滑动：手指跟随，松手按距离或速度翻月
  let sy = 0, sx = 0, st = 0, dy = 0, dragging = false, tracking = false, suppressClick = false;
  vp.addEventListener('touchstart', e => {
    if (animating || e.touches.length > 1) return;
    tracking = true; dragging = false; dy = 0;
    sy = e.touches[0].clientY; sx = e.touches[0].clientX; st = Date.now();
  }, { passive: true });
  vp.addEventListener('touchmove', e => {
    if (!tracking) return;
    const y = e.touches[0].clientY, x = e.touches[0].clientX;
    dy = y - sy;
    if (!dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(x - sx)) {
        dragging = true; track.style.transition = 'none';
      } else return;
    }
    e.preventDefault();
    track.style.transform = `translate3d(0,${-H + dy}px,0)`;
  }, { passive: false });
  const endTouch = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    suppressClick = true; setTimeout(() => (suppressClick = false), 80);
    const v = dy / Math.max(1, Date.now() - st);
    if (dy < -H * 0.16 || v < -0.45) go(1);
    else if (dy > H * 0.16 || v > 0.45) go(-1);
    else {
      track.style.transition = 'transform .25s ease-out';
      track.style.transform = `translate3d(0,${-H}px,0)`;
    }
  };
  vp.addEventListener('touchend', endTouch);
  vp.addEventListener('touchcancel', endTouch);

  // 鼠标滚轮 / 触控板
  let wheelAcc = 0, wheelLock = false;
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (animating || wheelLock) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 40) {
      go(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0; wheelLock = true;
      setTimeout(() => (wheelLock = false), 520);
    }
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (anyOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
  });

  vp.addEventListener('click', e => {
    if (suppressClick || animating) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    selected = cell.dataset.date;
    vp.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    vp.querySelectorAll(`.cell[data-date="${selected}"]`).forEach(c => c.classList.add('sel'));
    openDay(selected);
  });

  $('#btnPrev').onclick = () => go(-1);
  $('#btnNext').onclick = () => go(1);
  $('#btnToday').onclick = () => {
    const n = new Date();
    selected = todayStr();
    if (cur.y === n.getFullYear() && cur.m === n.getMonth()) renderPanels();
    else jumpTo(n.getFullYear(), n.getMonth());
  };

  // ---------- 底部面板 ----------
  const backdrop = $('#backdrop');
  const stack = [];
  const sheetOpen = id => stack.includes(id);
  const anyOpen = () => stack.length > 0;
  function openSheet(id) {
    if (!stack.includes(id)) stack.push(id);
    $('#' + id).classList.add('show');
    backdrop.classList.add('show');
  }
  function closeSheet(id) {
    id = id || stack[stack.length - 1];
    if (!id) return;
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    $('#' + id).classList.remove('show');
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    if (!stack.length) backdrop.classList.remove('show');
  }
  backdrop.onclick = () => closeSheet();
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet(b.closest('.sheet').id));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && anyOpen()) closeSheet(); });

  // 下拉面板把手关闭
  document.querySelectorAll('.sheet').forEach(sh => {
    const handle = sh.querySelector('.handle');
    let y0 = 0, d = 0, on = false;
    const head = [handle, sh.querySelector('.sheet-head')];
    head.forEach(el => {
      el.addEventListener('touchstart', e => { on = true; y0 = e.touches[0].clientY; d = 0; sh.style.transition = 'none'; }, { passive: true });
      el.addEventListener('touchmove', e => { if (!on) return; d = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${d}px)`; }, { passive: true });
      el.addEventListener('touchend', () => {
        if (!on) return; on = false; sh.style.transition = ''; sh.style.transform = '';
        if (d > 90) closeSheet(sh.id);
      });
    });
  });

  // 键盘弹出时把面板顶上去（iOS）
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', kb > 60 ? kb + 'px' : '0px');
    };
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV);
  }

  // ---------- 当天事件 ----------
  let quickPri = 0;
  function renderPriDots() {
    $('#quickPri').innerHTML = PRI.map(p =>
      `<button type="button" class="pri-dot${p.v === quickPri ? ' on' : ''}" style="--c:${p.color}" data-v="${p.v}" aria-label="优先级 ${p.name}"></button>`).join('');
  }
  $('#quickPri').onclick = e => {
    const b = e.target.closest('.pri-dot'); if (!b) return;
    quickPri = Number(b.dataset.v); renderPriDots();
  };

  function openDay(ds) {
    selected = ds;
    renderDay();
    openSheet('daySheet');
  }
  function renderDay() {
    const d = parse(selected);
    $('#dayTitle').textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`;
    const evs = byDate.get(selected) || [];
    const done = evs.filter(e => e.done).length;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 864e5);
    const rel = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : diff > 0 ? `${diff} 天后` : `${-diff} 天前`;
    $('#daySub').textContent = evs.length ? `${rel} · 已完成 ${done}/${evs.length}` : rel;
    $('#dayList').innerHTML = evs.length ? evs.map(e => {
      const p = priOf(e.priority);
      return `<li class="item${e.done ? ' done' : ''}" data-id="${e.id}" style="--c:${p.color}">
        <button class="check" data-act="toggle" aria-label="${e.done ? '标为未完成' : '标为完成'}">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="item-main" data-act="edit">
          <div class="item-title">${esc(e.title)}</div>
          ${e.note ? `<div class="item-note">${esc(e.note)}</div>` : ''}
        </div>
        ${e.priority ? `<span class="pri-tag">${p.name}</span>` : ''}
      </li>`;
    }).join('') : `<li class="empty">这一天还没有事件，在下方输入即可添加</li>`;
  }
  $('#dayList').onclick = e => {
    const li = e.target.closest('.item'); if (!li) return;
    const ev = data.events.find(x => x.id === li.dataset.id); if (!ev) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'toggle') { ev.done = !ev.done; ev.updatedAt = Date.now(); commit(); }
    else if (act === 'edit') openEdit(ev);
  };
  $('#quickAdd').onsubmit = e => {
    e.preventDefault();
    const title = $('#quickInput').value.trim();
    if (!title) return;
    const t = Date.now();
    data.events.push({ id: uid(), date: selected, title, priority: quickPri, done: false, note: '', createdAt: t, updatedAt: t });
    $('#quickInput').value = '';
    commit();
  };

  // ---------- 新建 / 编辑 ----------
  let editing = null; // null = 新建
  let editPri = 0;
  function renderEditPri() {
    $('#fPri').innerHTML = PRI.map(p =>
      `<button type="button" class="${p.v === editPri ? 'on' : ''}" style="--c:${p.color}" data-v="${p.v}">${p.name}</button>`).join('');
  }
  $('#fPri').onclick = e => { const b = e.target.closest('button'); if (!b) return; editPri = Number(b.dataset.v); renderEditPri(); };
  $('#fRepeat').onchange = () => { $('#rowUntil').hidden = $('#fRepeat').value === 'none'; };

  function openEdit(ev, date) {
    editing = ev || null;
    $('#editTitle').textContent = ev ? '编辑事件' : '新建事件';
    $('#fTitle').value = ev ? ev.title : '';
    $('#fDate').value = ev ? ev.date : (date || selected);
    $('#fNote').value = ev ? ev.note : '';
    $('#fDone').checked = ev ? ev.done : false;
    editPri = ev ? ev.priority : 0;
    renderEditPri();
    $('#rowDone').hidden = !ev;
    $('#repeatBox').hidden = !!ev;
    $('#btnDelete').hidden = !ev;
    $('#fRepeat').value = 'none'; $('#rowUntil').hidden = true;
    const u = parse($('#fDate').value); u.setMonth(u.getMonth() + 3);
    $('#fUntil').value = ymd(u);
    openSheet('editSheet');
    if (!ev) setTimeout(() => $('#fTitle').focus(), 320);
  }

  $('#btnSave').onclick = () => {
    const title = $('#fTitle').value.trim();
    const date = $('#fDate').value;
    if (!title) { toast('请输入事件名称'); $('#fTitle').focus(); return; }
    if (!date) { toast('请选择日期'); return; }
    const t = Date.now();
    if (editing) {
      Object.assign(editing, { title, date, priority: editPri, note: $('#fNote').value.trim(), done: $('#fDone').checked, updatedAt: t });
    } else {
      const dates = repeatDates(date, $('#fRepeat').value, $('#fUntil').value);
      for (const d of dates) {
        data.events.push({ id: uid(), date: d, title, priority: editPri, done: false, note: $('#fNote').value.trim(), createdAt: t, updatedAt: t });
      }
      if (dates.length > 1) toast(`已添加 ${dates.length} 个事件`);
    }
    selected = date;
    closeSheet('editSheet');
    commit();
  };

  function repeatDates(start, mode, until) {
    if (mode === 'none' || !until || until < start) return [start];
    const out = [];
    const s = parse(start), end = parse(until);
    for (let i = 0; i < 400; i++) {
      let d;
      if (mode === 'day') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
      else if (mode === 'week') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * 7);
      else if (mode === '2week') d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * 14);
      else {
        d = new Date(s.getFullYear(), s.getMonth() + i, s.getDate());
        if (d.getDate() !== s.getDate()) continue; // 跳过没有该日期的月份（如 31 号）
      }
      if (d > end) break;
      out.push(ymd(d));
    }
    return out;
  }

  $('#btnDelete').onclick = () => {
    if (!editing) return;
    if (!confirm(`删除「${editing.title}」？`)) return;
    data.events = data.events.filter(e => e.id !== editing.id);
    data.deleted[editing.id] = Date.now();
    closeSheet('editSheet');
    commit();
  };

  $('#fab').onclick = () => openEdit(null, selected);

  // ---------- 设置 ----------
  let iosScript = '';
  function segSet(sel, val) {
    document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(val)));
  }
  $('#btnMenu').onclick = () => {
    segSet('#sTheme', settings.theme);
    segSet('#sWeek', settings.weekStart);
    $('#sToken').value = settings.token;
    $('#sGist').value = settings.gistId;
    updateStatLine();
    setSyncStatus();
    openSheet('setSheet');
    // 先取好脚本，点击复制时可同步写入剪贴板（iOS 要求）
    fetch('widget-ios-scriptable.js', { cache: 'no-cache' }).then(r => r.text()).then(t => (iosScript = t)).catch(() => {});
  };
  $('#sTheme').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.theme = b.dataset.v; saveSettings(); applyTheme(); segSet('#sTheme', settings.theme);
  };
  $('#sWeek').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.weekStart = Number(b.dataset.v); saveSettings(); segSet('#sWeek', settings.weekStart);
    renderWeekdays(); renderPanels();
  };
  $('#sToken').onchange = () => {
    const v = $('#sToken').value.trim();
    if (v !== settings.token) { settings.token = v; saveSettings(); if (v) sync(); else setSyncStatus(); }
  };
  $('#sGist').onchange = () => {
    settings.gistId = $('#sGist').value.trim().replace(/^.*\//, ''); saveSettings();
    $('#sGist').value = settings.gistId;
    sync();
  };
  $('#btnSync').onclick = () => {
    settings.token = $('#sToken').value.trim();
    settings.gistId = $('#sGist').value.trim().replace(/^.*\//, '');
    saveSettings();
    sync({ manual: true });
  };

  function updateStatLine() {
    const total = data.events.length, done = data.events.filter(e => e.done).length;
    $('#statLine').textContent = `共 ${total} 个事件，已完成 ${done} 个。`;
  }

  function appBaseUrl() { return location.href.replace(/[#?].*$/, '').replace(/index\.html$/, ''); }

  $('#btnCopyIOS').onclick = () => {
    if (!settings.gistId) { toast('请先完成一次同步，生成 Gist ID'); return; }
    if (!iosScript) { toast('脚本还在加载，请稍后再点一次'); return; }
    const s = iosScript
      .replace('"__GIST_ID__"', JSON.stringify(settings.gistId))
      .replace('"__APP_URL__"', JSON.stringify(appBaseUrl()))
      .replace('WEEK_START: 0,', `WEEK_START: ${settings.weekStart},`);
    copy(s, '已复制 iOS 小组件脚本');
  };
  $('#btnCopyAndroid').onclick = () => {
    if (!settings.gistId) { toast('请先完成一次同步，生成 Gist ID'); return; }
    copy(`${appBaseUrl()}widget.html?gist=${encodeURIComponent(settings.gistId)}&ws=${settings.weekStart}`, '已复制安卓小组件链接');
  };
  function copy(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), () => fallbackCopy(text, okMsg));
    } else fallbackCopy(text, okMsg);
  }
  function fallbackCopy(text, okMsg) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(ok ? okMsg : '复制失败，请从仓库文件中手动复制');
  }

  // 导出 / 导入
  $('#btnExport').onclick = async () => {
    const json = JSON.stringify(data, null, 2);
    const name = `月历备份-${todayStr()}.json`;
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
    const f = e.target.files[0]; if (!f) return;
    try {
      const incoming = normalize(JSON.parse(await f.text()));
      data = merge(data, incoming);
      commit(); updateStatLine();
      toast(`已导入，共 ${data.events.length} 个事件`);
    } catch (err) { toast('文件格式不正确'); }
    e.target.value = '';
  };

  // ---------- 同步（GitHub Gist） ----------
  function merge(a, b) {
    const deleted = { ...(a.deleted || {}) };
    for (const [k, t] of Object.entries(b.deleted || {})) deleted[k] = Math.max(deleted[k] || 0, t);
    const map = new Map();
    for (const e of [...a.events, ...b.events]) {
      const old = map.get(e.id);
      if (!old || (e.updatedAt || 0) > (old.updatedAt || 0)) map.set(e.id, { ...e });
    }
    const events = [...map.values()].filter(e => !(deleted[e.id] && deleted[e.id] >= (e.updatedAt || 0)));
    // 墓碑保留 180 天
    const cutoff = Date.now() - 180 * 864e5;
    for (const k of Object.keys(deleted)) if (deleted[k] < cutoff) delete deleted[k];
    return { version: 2, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0), events, deleted };
  }
  function signature(d) {
    const ev = [...d.events].sort((x, y) => x.id < y.id ? -1 : 1)
      .map(e => [e.id, e.date, e.title, e.priority, e.done, e.note, e.updatedAt]);
    const del = Object.keys(d.deleted || {}).sort();
    return JSON.stringify([ev, del]);
  }

  async function gh(path, opts = {}) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (settings.token) headers.Authorization = 'Bearer ' + settings.token;
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com' + path, { ...opts, headers, cache: 'no-store' });
    if (!r.ok) {
      let msg = r.status === 401 ? '令牌无效或已过期'
        : r.status === 403 ? '令牌缺少 gist 权限，或请求过于频繁'
        : r.status === 404 ? '找不到这个 Gist（ID 不对，或令牌不属于该账号）'
        : `GitHub 返回 ${r.status}`;
      throw new Error(msg);
    }
    return r.json();
  }
  async function findGist() {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find(g => g.files && g.files[GIST_FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return '';
  }
  async function readGist(id) {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[GIST_FILE];
    if (!f) throw new Error('这个 Gist 里没有月历数据文件');
    let text = f.content;
    if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    return normalize(JSON.parse(text));
  }
  async function writeGist(d) {
    const body = { files: { [GIST_FILE]: { content: JSON.stringify(d) } } };
    if (settings.gistId) {
      await gh('/gists/' + settings.gistId, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ ...body, description: GIST_DESC, public: false }) });
      settings.gistId = g.id; saveSettings();
      if (sheetOpen('setSheet')) $('#sGist').value = g.id;
    }
  }

  let syncing = false, syncAgain = false, syncTimer = null, lastError = '';
  function scheduleSync() {
    if (!settings.token) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync(), 1500);
  }
  async function sync({ manual = false } = {}) {
    if (!settings.token && !settings.gistId) { if (manual) toast('请先填写 GitHub 令牌'); setSyncStatus(); return; }
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { lastError = '当前离线，联网后会自动同步'; setSyncStatus(); return; }
    syncing = true; setSyncStatus('同步中…');
    try {
      if (!settings.gistId && settings.token) { settings.gistId = await findGist(); saveSettings(); }
      let remote = null;
      if (settings.gistId) remote = await readGist(settings.gistId);
      const merged = remote ? merge(data, remote) : data;
      if (signature(merged) !== signature(data)) {
        data = merged; saveData(); reindex(); renderPanels(); renderHeader();
        if (sheetOpen('daySheet')) renderDay();
        if (sheetOpen('setSheet')) updateStatLine();
      }
      if (settings.token && (!remote || signature(merged) !== signature(remote))) {
        await writeGist({ ...merged, updatedAt: Date.now() });
      }
      if (sheetOpen('setSheet')) $('#sGist').value = settings.gistId;
      settings.lastSync = Date.now(); saveSettings();
      lastError = '';
      if (manual) toast('已同步');
    } catch (e) {
      lastError = e.message || '同步失败';
      if (manual) toast(lastError);
    } finally {
      syncing = false; setSyncStatus();
      if (syncAgain) { syncAgain = false; sync(); }
    }
  }
  function setSyncStatus(text) {
    const el = $('#syncStatus'); if (!el) return;
    if (text) { el.textContent = text; return; }
    if (lastError) { el.textContent = '⚠ ' + lastError; return; }
    if (!settings.token && !settings.gistId) { el.textContent = '未开启同步'; return; }
    if (!settings.token) { el.textContent = '只读：仅从 Gist 拉取'; return; }
    el.textContent = settings.lastSync
      ? '上次同步 ' + new Date(settings.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '尚未同步';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderHeader();
      if (settings.token || settings.gistId) sync();
    }
  });
  window.addEventListener('online', () => { if (settings.token) sync(); });
  setInterval(() => { if (document.visibilityState === 'visible' && (settings.token || settings.gistId)) sync(); }, 3 * 60 * 1000);

  // ---------- 提示 ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 启动 ----------
  applyTheme();
  reindex();
  renderWeekdays();
  renderPriDots();
  measure();
  renderPanels();
  renderHeader();
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { measure(); renderPanels(); }, 120); });
  // 跨过午夜时刷新“今天”
  setInterval(() => { const t = todayStr(); if (t !== renderHeader._last) { renderHeader._last = t; renderPanels(); renderHeader(); } }, 60 * 1000);
  renderHeader._last = todayStr();
  if (settings.token || settings.gistId) sync();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
