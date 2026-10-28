/* 月历 · 添加 / 编辑、日期与时间段选择、批量添加 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Editor = (MC.Editor = {});

  const nextHour = () => { const h = (new Date().getHours() + 1) % 24; return `${MC.pad(h)}:00`; };
  const plusHour = t => { const [h, m] = t.split(':').map(Number); return h >= 23 ? '23:55' : `${MC.pad(h + 1)}:${MC.pad(m)}`; };
  const SVG_CAL = '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  const SVG_CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const SVG_BELL = '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const SVG_REPEAT = '<svg viewBox="0 0 24 24"><path d="M5 10V9a3 3 0 0 1 3-3h10l-3-3M19 14v1a3 3 0 0 1-3 3H6l3 3"/></svg>';
  const SVG_END = '<svg viewBox="0 0 24 24"><path d="M5 12h11M13 7l5 5-5 5M20 5v14"/></svg>';

  // ======================= 添加 / 编辑 =======================
  let mode = 'new', editing = null, newCal = ''; // newCal：新事件放进哪个日历（'' = 主日历）
  const newHeading = () => (newCal && MC.cal(newCal) ? `添加到「${MC.cal(newCal).name}」` : '新建事件');
  const draft = {};
  function resetDraft(date) {
    Object.assign(draft, { title: '', note: '', priority: 0, rate: 0, date, days: 1, time: '', endTime: '', remind: null, repeat: 'none', until: '', done: false });
  }
  function chipLabel(d) {
    const n = MC.dayDiff(d.date);
    let s = n === 0 ? '今天' : n === 1 ? '明天' : MC.dateLabel(d.date);
    if (d.time) s += ' ' + MC.timeLabel(d);
    let extra = '';
    if (d.repeat && d.repeat !== 'none') extra += ' ↻';
    if (d.remind !== null && d.remind !== undefined) extra += ' ⏰';
    return s + extra;
  }
  function paintFlag(btn, p) {
    const c = MC.rateOn(newCal) ? MC.cal(newCal).color : MC.priOf(p).color; // 开了等级评分的日历：标记用日历颜色
    btn.style.setProperty('--pc', p ? c : 'var(--text2)');
    btn.style.setProperty('--pf', p ? c : 'none');
  }
  function quickDates() {
    const t = new Date(), out = [];
    const add = (d, label) => { const ds = MC.ymd(d); if (!out.some(o => o.ds === ds)) out.push({ ds, label, sub: label === '今天' || label === '明天' || label === '后天' ? '' : '' }); };
    add(t, '今天'); add(MC.addDays(t, 1), '明天'); add(MC.addDays(t, 2), '后天');
    add(MC.addDays(t, ((8 - t.getDay()) % 7) || 7), '下周一');
    return out;
  }
  let otherOpen = false, otherMode = 'cal', otherCal = null;
  function paintQuick() {
    const qd = quickDates();
    // 具体日期集中在左边，「其他日期」单独放在右侧、上下居中
    const chips = qd.map(o => `<button class="qchip${o.ds === draft.date && !otherOpen ? ' on' : ''}" data-ds="${o.ds}">${o.label}<small>${MC.parse(o.ds).getMonth() + 1}/${MC.parse(o.ds).getDate()}</small></button>`).join('');
    const custom = !qd.some(o => o.ds === draft.date);
    const other = `<button class="qchip qother${otherOpen || custom ? ' on' : ''}" data-act="other">${custom ? `${MC.dateLabel(draft.date)}<small>周${MC.WD[MC.parse(draft.date).getDay()]}</small>` : '其他日期'}</button>`;
    $('#cmpQuick').innerHTML = `<div class="qgroup">${chips}</div>${other}`;
  }
  // 「其他日期」：在面板里直接展开大号滚轮，可切换成日历
  function renderOther() {
    $('#cmpOther').hidden = !otherOpen;
    if (!otherOpen) return;
    $('#cmpOtherMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === otherMode));
    const host = $('#cmpOtherBody');
    if (otherMode === 'wheel') {
      $('#cmpOtherTitle').textContent = '滚动选择日期';
      host.innerHTML = '<div class="wheel-wrap" style="padding:0"></div>';
      requestAnimationFrame(() => UI.dateWheel(host.firstChild, draft.date, ds => { draft.date = ds; paintQuick(); paintTools(); }, 44));
    } else {
      const d = MC.parse(draft.date);
      if (!otherCal) otherCal = { y: d.getFullYear(), m: d.getMonth() };
      const { y, m } = otherCal, off = (new Date(y, m, 1).getDay() - MC.settings.weekStart + 7) % 7, t = MC.todayStr();
      $('#cmpOtherTitle').textContent = `${y}年${m + 1}月`;
      let wk = '', g = '';
      for (let i = 0; i < 7; i++) wk += `<div>${MC.WD[(i + MC.settings.weekStart) % 7]}</div>`;
      for (let i = 0; i < 42; i++) {
        const dd = new Date(y, m, 1 - off + i), ds = MC.ymd(dd);
        g += `<button class="pk-d${dd.getMonth() !== m ? ' out' : ''}${ds === t ? ' today' : ''}${ds === draft.date ? ' on' : ''}" data-ds="${ds}"><span>${dd.getDate()}</span></button>`;
      }
      host.innerHTML = `<div class="pk-cal-head"><button class="nav-btn" data-nav="-1" aria-label="上个月">‹</button><span></span><button class="nav-btn" data-nav="1" aria-label="下个月">›</button></div><div class="pk-week">${wk}</div><div class="pk-grid">${g}</div>`;
    }
  }
  $('#cmpOtherMode').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    otherMode = b.dataset.v; otherCal = null; renderOther();
  });
  $('#cmpOtherBody').addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { const t = new Date(otherCal.y, otherCal.m + Number(nav.dataset.nav), 1); otherCal = { y: t.getFullYear(), m: t.getMonth() }; renderOther(); return; }
    const d = e.target.closest('.pk-d'); if (!d) return;
    draft.date = d.dataset.ds; paintQuick(); paintTools(); renderOther();
  });
  function paintTools() {
    const extra = [];
    if (draft.time) extra.push(MC.timeLabel(draft));
    else if (draft.days > 1) extra.push(`${MC.dateLabel(draft.date)}–${MC.dateLabel(MC.ymd(MC.addDays(MC.parse(draft.date), draft.days - 1)))}`);
    if (draft.repeat && draft.repeat !== 'none') extra.push(MC.repeatLabel(draft.repeat));
    if (draft.remind !== null && draft.remind !== undefined) extra.push('提醒');
    $('#cmpDateLabel').textContent = extra.length ? extra.join(' · ') : '时间 · 提醒 · 重复';
  }
  function paintComposer() {
    paintQuick();
    paintTools();
    const rc = mode === 'edit' && editing ? editing.cal : newCal, rated = MC.rateOn(rc);
    $('#cmpPriLabel').textContent = rated ? '等级' : '优先级';
    if (rated) $('#cmpPri').innerHTML = [{ v: 0, name: '无' }, ...MC.rateLabels(rc).map((n, i) => ({ v: i + 1, name: n }))].map(p => `<button class="qchip pri rate${p.v === (draft.rate || 0) ? ' on' : ''}" data-v="${p.v}" style="--c:${p.v ? MC.cal(rc).color : 'var(--p0)'}"><span class="dot"></span><span data-uc>${esc(p.name)}</span></button>`).join('');
    else $('#cmpPri').innerHTML = MC.PRI.map(p => `<button class="qchip pri${p.v === draft.priority ? ' on' : ''}" data-v="${p.v}" style="--c:${p.color}"><span class="dot"></span>${p.name}</button>`).join('');
    $('#cmpSave').classList.toggle('disabled', !$('#cmpTitle').value.trim());
    $('#cmpDone').setAttribute('aria-pressed', String(!!draft.done));
  }
  function growTitle() {
    const t = $('#cmpTitle');
    t.style.height = 'auto';
    t.style.height = Math.min(120, t.scrollHeight) + 'px';
  }

  // ---- 草稿与自动保存：没点「添加」就关掉时，新建的内容存为草稿，编辑的修改直接保存 ----
  const DRAFT_KEY = 'mcal.draft';
  let skipCloseSave = false;
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } };
  function onComposerClosed() {
    if (skipCloseSave) { skipCloseSave = false; return; }
    const title = $('#cmpTitle').value.trim(), note = $('#cmpNote').value.trim();
    if (mode === 'new') {
      if (title || note) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, title, note }));
        UI.toast('已存为草稿，下次点 ＋ 接着写');
      } else localStorage.removeItem(DRAFT_KEY);
      return;
    }
    if (!editing || !MC.data.events.includes(editing)) return;
    const fields = { title, note, priority: draft.priority, rate: draft.rate || 0, date: draft.date, days: draft.time ? 1 : (draft.days || 1), time: draft.time, endTime: draft.endTime, remind: draft.remind, done: draft.done };
    const changed = Object.keys(fields).some(k => (fields[k] ?? null) !== (editing[k] ?? null));
    if (!changed) return;
    if (!title) { UI.toast('名称为空，修改没有保存'); return; }
    MC.updateEvent(editing, fields);
    UI.toast('修改已自动保存');
  }
  function closeComposer(save) { skipCloseSave = !save; UI.close('composer'); }
  Editor.closeComposerSilently = () => closeComposer(false);

  Editor.openNew = (date, cal, pinDate) => { // pinDate：明确点了某一天（长按日期），草稿也改用这一天
    mode = 'new'; editing = null;
    newCal = cal && MC.cal(cal) ? cal : '';
    resetDraft(date || MC.Cal.selected() || MC.todayStr());
    const saved = readDraft();
    if (saved) {
      Object.assign(draft, saved);
      if (pinDate && date) draft.date = date;
      $('#cmpTitle').value = saved.title || ''; $('#cmpNote').value = saved.note || '';
    } else { $('#cmpTitle').value = ''; $('#cmpNote').value = ''; }
    $('#cmpHeading').textContent = saved ? '继续编辑草稿' : newHeading();
    $('#cmpClear').hidden = !saved;
    $('#cmpSave').textContent = '添加';
    $('#cmpEditBar').hidden = true;
    $('#cmpBatch').hidden = false;
    $('#cmpTitle').classList.remove('err');
    otherOpen = false; renderOther();
    growTitle(); paintComposer();
    UI.open('composer', onComposerClosed);
    // 新建时直接把光标放进名称（同一次点击里调用，手机才会弹出键盘）
    const ti = $('#cmpTitle'); ti.focus({ preventScroll: true }); try { ti.setSelectionRange(ti.value.length, ti.value.length); } catch (e) {}
  };
  Editor.openEdit = e => {
    mode = 'edit'; editing = e;
    Object.assign(draft, { title: e.title, note: e.note, priority: e.priority, rate: e.rate || 0, date: e.date, days: e.days || 1, time: e.time, endTime: e.endTime, remind: e.remind, repeat: 'none', until: '', done: e.done });
    $('#cmpTitle').value = e.title; $('#cmpNote').value = e.note;
    $('#cmpHeading').textContent = '编辑事件';
    $('#cmpClear').hidden = true;
    $('#cmpSave').textContent = '保存';
    $('#cmpEditBar').hidden = false;
    $('#cmpBatch').hidden = true;
    $('#cmpTitle').classList.remove('err');
    otherOpen = false; renderOther();
    paintComposer();
    UI.open('composer', onComposerClosed);
    requestAnimationFrame(growTitle);
  };
  $('#cmpClear').onclick = () => {
    localStorage.removeItem(DRAFT_KEY);
    const d = draft.date;
    resetDraft(d);
    $('#cmpTitle').value = ''; $('#cmpNote').value = '';
    $('#cmpHeading').textContent = newHeading(); $('#cmpClear').hidden = true;
    growTitle(); paintComposer();
  };

  $('#cmpTitle').addEventListener('input', () => { growTitle(); $('#cmpTitle').classList.remove('err'); paintComposer(); });
  $('#cmpTitle').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
  $('#cmpNote').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); submit(); } });
  $('#cmpQuick').addEventListener('click', e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    if (b.dataset.act === 'other') { otherOpen = !otherOpen; otherCal = null; paintQuick(); renderOther(); return; }
    draft.date = b.dataset.ds; otherOpen = false; paintComposer(); renderOther();
  });
  $('#cmpPri').addEventListener('click', e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    if (MC.rateOn(mode === 'edit' && editing ? editing.cal : newCal)) draft.rate = Number(b.dataset.v); else draft.priority = Number(b.dataset.v);
    paintComposer();
  });
  $('#cmpDone').onclick = () => { draft.done = !draft.done; paintComposer(); };
  $('#cmpDate').onclick = () => {
    $('#cmpTitle').blur(); $('#cmpNote').blur();
    Editor.openPicker({ ...draft, allowRepeat: mode === 'new' }, s => {
      Object.assign(draft, s);
      paintComposer();
    });
  };
  $('#cmpSave').onclick = submit;
  $('#cmpBatch').onclick = () => openBatch();
  $('#cmpDelete').onclick = () => {
    if (!editing) return;
    const ev = editing;
    const later = ev.series ? MC.data.events.filter(x => x.series === ev.series && x.date >= ev.date) : [];
    // 直接删除，提示里可以撤销（不再先弹确认框）
    const doDelete = all => {
      closeComposer(false);
      if (!all) { UI.removeEvents([ev], `已删除「${ev.title}」`); return; }
      const t = Date.now(), stopped = [];
      for (const x of MC.data.events) if (x.series === ev.series && x.rep && x.rep.forever && !later.includes(x)) { stopped.push([x, x.rep]); x.rep = { ...x.rep, forever: false }; x.updatedAt = t; } // 停止续生成
      // 撤销时把「一直重复」也恢复
      UI.removeEvents(later, `已删除 ${later.length} 个事件`, () => { const t2 = Date.now(); stopped.forEach(([x, r]) => { x.rep = r; x.updatedAt = t2; }); });
    };
    if (later.length > 1) {
      UI.menu($('#cmpDelete'), [
        { label: '仅删除这一个', value: false },
        { label: `删除这个及之后的重复（${later.length} 个）`, value: true, danger: true },
      ], doDelete);
    } else doDelete(false);
  };

  function submit() {
    const title = $('#cmpTitle').value.trim();
    const note = $('#cmpNote').value.trim();
    if (!title) {
      const t = $('#cmpTitle');
      t.classList.add('err'); t.placeholder = '请先填写名称';
      t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
      setTimeout(() => (t.placeholder = '准备做什么？'), 1800);
      return;
    }
    const fields = { title, note, priority: draft.priority, rate: draft.rate || 0, date: draft.date, days: draft.time ? 1 : (draft.days || 1), time: draft.time, endTime: draft.endTime, remind: draft.remind };
    if (mode === 'edit') {
      MC.updateEvent(editing, { ...fields, done: draft.done });
      closeComposer(false);
      UI.toast('已保存');
      return;
    }
    const { dates, rep, events } = buildEvents(fields, draft.repeat, draft.until);
    MC.addEvents(events);
    const quiet = draft.remind !== null && draft.remind !== undefined && newCal && !MC.notifies({ cal: newCal });
    UI.toast((rep ? (rep.forever ? `已添加，${MC.repeatLabel(rep.freq)}重复` : `已添加 ${dates.length} 个重复事件`) : `已添加到${MC.dayDiff(draft.date) === 0 ? '今天' : ' ' + MC.dateLabel(draft.date)}`)
      + (quiet ? `。「${MC.cal(newCal).name}」的通知没有打开，不会提醒` : ''));
    $('#cmpTitle').value = ''; $('#cmpNote').value = '';
    draft.repeat = 'none'; draft.until = '';
    localStorage.removeItem(DRAFT_KEY);
    $('#cmpHeading').textContent = newHeading(); $('#cmpClear').hidden = true;
    growTitle(); paintComposer();
    MC.onNotifyCheck && MC.onNotifyCheck();
  }

  // ======================= 日期 / 时间段选择 =======================
  let pk = null, pkCb = null;
  // opts: date, time, endTime, remind, repeat, until, allowRepeat, dateOnly
  Editor.openPicker = (opts, cb) => {
    const d = MC.parse(opts.date);
    pk = {
      date: opts.date, days: opts.days || 1, time: opts.time || '', endTime: opts.endTime || '',
      remind: opts.remind === undefined ? null : opts.remind,
      repeat: opts.repeat || 'none', until: opts.until || '',
      allowRepeat: !!opts.allowRepeat, dateOnly: !!opts.dateOnly,
      tab: opts.endTime ? 'range' : 'date',
      cal: { y: d.getFullYear(), m: d.getMonth() },
      wheelMode: false, expanded: null, chooser: null,
    };
    pkCb = cb;
    $('#pkTabs').hidden = pk.dateOnly;
    paintTabs();
    renderPicker();
    UI.open('datePicker');
  };
  function paintTabs() { $('#pkTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === pk.tab)); }
  $('#pkTabs').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === pk.tab) return;
    pk.tab = b.dataset.v; pk.expanded = null;
    if (pk.tab === 'range' && !pk.time) { pk.time = nextHour(); pk.endTime = plusHour(pk.time); }
    if (pk.tab === 'range' && pk.time && !pk.endTime) pk.endTime = plusHour(pk.time);
    paintTabs(); renderPicker();
  };
  $('#pkCancel').onclick = () => UI.close('datePicker');
  $('#pkOk').onclick = () => {
    if (pk.until && pk.until < pk.date) pk.until = '';
    const out = { date: pk.date, days: pk.time ? 1 : pk.days, time: pk.time, endTime: pk.tab === 'range' ? pk.endTime : '', remind: pk.remind, repeat: pk.repeat, until: pk.until };
    if (out.endTime && out.endTime <= out.time) out.endTime = '';
    UI.close('datePicker');
    pkCb && pkCb(out);
  };

  function miniCalHTML() {
    const { y, m } = pk.cal;
    const off = (new Date(y, m, 1).getDay() - MC.settings.weekStart + 7) % 7;
    const t = MC.todayStr();
    let wk = '', g = '';
    for (let i = 0; i < 7; i++) wk += `<div>${MC.WD[(i + MC.settings.weekStart) % 7]}</div>`;
    for (let i = 0; i < 42; i++) {
      const d = new Date(y, m, 1 - off + i), ds = MC.ymd(d);
      const cls = ['pk-d'];
      if (d.getMonth() !== m) cls.push('out');
      if (ds === t) cls.push('today');
      if (ds === pk.date) cls.push('on');
      g += `<button class="${cls.join(' ')}" data-ds="${ds}"><span>${d.getDate()}</span></button>`;
    }
    return `<div class="pk-week">${wk}</div><div class="pk-grid">${g}</div>`;
  }
  function calHeadHTML() {
    const { y, m } = pk.cal;
    return `<div class="pk-cal-head">
      ${pk.wheelMode ? '<span></span>' : '<button class="nav-btn" data-nav="-1" aria-label="上个月">‹</button>'}
      <h4>${pk.wheelMode ? '滚动选择日期' : `${y}年${m + 1}月`}</h4>
      ${pk.wheelMode ? '' : '<button class="nav-btn" data-nav="1" aria-label="下个月">›</button>'}
      <button class="pk-mode glass" data-act="mode">${pk.wheelMode ? '日历' : '滚轮'}</button>
    </div>`;
  }
  const endOf = () => MC.ymd(MC.addDays(MC.parse(pk.date), Math.max(1, pk.days) - 1));
  // 内嵌选择器：默认日历，可切换滚轮
  function chooserHTML(key) {
    const c = pk.chooser;
    const val = key === 'until' ? (pk.until || pk.date) : key === 'end' ? (pk.pendingEnd || endOf()) : pk.date;
    if (!c.cal) { const d = MC.parse(val); c.cal = { y: d.getFullYear(), m: d.getMonth() }; }
    // 全天的日期范围：开始到结束之间铺一条圆角色条
    const rangeEnd = key === 'end' ? val : (!pk.time && pk.days > 1 && key === 'date' ? endOf() : null);
    const head = `<div class="pk-cal-head">${c.mode === 'cal' ? '<button class="nav-btn" data-cnav="-1" aria-label="上个月">‹</button>' : '<span></span>'}
      <h4>${c.mode === 'cal' ? `${c.cal.y}年${c.cal.m + 1}月` : '滚动选择'}</h4>
      ${c.mode === 'cal' ? '<button class="nav-btn" data-cnav="1" aria-label="下个月">›</button>' : ''}
      <button class="pk-mode glass" data-cmode="1">${c.mode === 'cal' ? '滚轮' : '日历'}</button></div>`;
    let body;
    if (c.mode === 'cal') {
      const { y, m } = c.cal, off = (new Date(y, m, 1).getDay() - MC.settings.weekStart + 7) % 7, t = MC.todayStr();
      let wk = '', g = '';
      for (let i = 0; i < 7; i++) wk += `<div>${MC.WD[(i + MC.settings.weekStart) % 7]}</div>`;
      for (let i = 0; i < 42; i++) {
        const d = new Date(y, m, 1 - off + i), ds = MC.ymd(d);
        const dis = (key === 'end' || key === 'until') && ds < pk.date;
        let rng = '';
        if (rangeEnd && ds >= pk.date && ds <= rangeEnd) {
          const col = i % 7, k = Math.round((d - MC.parse(pk.date)) / 864e5);
          rng = ` rng${ds === pk.date ? ' rs' : ''}${ds === rangeEnd ? ' re' : ''}${col === 0 ? ' rl' : ''}${col === 6 ? ' rr' : ''}" style="--k:${k}`;
        }
        const on = rangeEnd ? '' : (ds === val ? ' on' : '');
        g += `<button class="pk-d${d.getMonth() !== m ? ' out' : ''}${ds === t ? ' today' : ''}${on}${dis ? ' dis' : ''}${rng}" data-cds="${ds}"><span>${d.getDate()}</span></button>`;
      }
      body = `<div class="pk-week">${wk}</div><div class="pk-grid">${g}</div>`;
    } else body = '<div class="wheel-wrap" id="chooserWheel" style="padding:0"></div>';
    let foot = key === 'until' ? `<div class="chooser-foot"><button class="chip-btn glass" data-cnone="1">不设截止，一直重复</button></div>` : '';
    if (key === 'end' && pk.pendingEnd) {
      const n = Math.round((MC.parse(pk.pendingEnd) - MC.parse(pk.date)) / 864e5) + 1;
      foot = `<div class="chooser-foot"><button class="range-ok" data-cok="1">确定 · ${MC.dateLabel(pk.date)}–${MC.dateLabel(pk.pendingEnd)}，共 ${n} 天</button></div>`;
    }
    const anim = pk.animRange ? ' anim' : '';
    pk.animRange = false;
    return `<div class="chooser${anim}" data-key="${key}">${head}${body}${foot}</div>`;
  }
  function chooserPick(key, ds) {
    if (key === 'date') pk.date = ds;
    else if (key === 'end') pk.days = Math.max(1, Math.round((MC.parse(ds) - MC.parse(pk.date)) / 864e5) + 1);
    else if (key === 'until') pk.until = ds;
  }
  function openChooser(key) {
    pk.pendingEnd = null;
    pk.chooser = pk.chooser && pk.chooser.key === key ? null : { key, mode: 'cal', cal: null };
    renderPicker();
  }
  const row = (act, icon, label, val, on) =>
    `<button class="pk-row" data-act="${act}">${icon}<span>${label}</span><span class="grow-val${on ? ' on' : ''}" data-bind="${act}">${esc(val)}</span></button>`;
  function extraRows() {
    const hasTime = !!pk.time;
    let h = row('remind', SVG_BELL, '提醒', MC.remindLabel(pk.remind, hasTime), pk.remind !== null);
    if (pk.allowRepeat) {
      h += row('repeat', SVG_REPEAT, '重复', MC.repeatLabel(pk.repeat), pk.repeat !== 'none');
      if (pk.repeat !== 'none') {
        h += row('until', SVG_END, '直到（可选）', pk.until ? MC.dateLabel(pk.until) + ' ' + MC.parse(pk.until).getFullYear() : '不设，一直重复', !!pk.until);
        if (pk.chooser && pk.chooser.key === 'until') h += chooserHTML('until');
      }
    }
    return h;
  }
  function renderPicker() {
    let h = '';
    if (pk.dateOnly || pk.tab === 'date') {
      h += calHeadHTML();
      h += pk.wheelMode ? '<div class="wheel-wrap" id="pkWheelDate"></div>' : miniCalHTML();
      if (!pk.dateOnly) {
        h += '<div class="group pk-rows">';
        h += row('time', SVG_CLOCK, '时间', pk.time ? MC.timeLabel(pk) : '无', !!pk.time);
        if (pk.expanded === 'time') h += '<div class="wheel-wrap" id="pkWheelTime"></div><button class="pk-row" data-act="notime"><span class="grow-val">清除时间</span></button>';
        h += extraRows();
        h += '</div>';
      }
    } else {
      const dur = pk.time && pk.endTime ? durLabel(pk.time, pk.endTime) : '';
      const allDay = !pk.time, end = endOf();
      // 全天：两张卡分别是「开始」「结束」日期；非全天：日期 + 时间段
      h += `<div class="pk-cards">
        <button class="pk-card${pk.chooser && pk.chooser.key === 'date' ? ' active' : ''}" data-act="cardDate"><small>${allDay ? '开始' : '日期'}</small><b data-bind="cardDate">${MC.dateLabel(pk.date)}，周${MC.WD[MC.parse(pk.date).getDay()]}</b><small data-bind="cardRel">${MC.relLabel(pk.date)}</small></button>
        ${allDay
          ? `<button class="pk-card${pk.chooser && pk.chooser.key === 'end' ? ' active' : ''}" data-act="cardEnd"><small>结束</small><b>${MC.dateLabel(end)}，周${MC.WD[MC.parse(end).getDay()]}</b><small>${pk.days > 1 ? `共 ${pk.days} 天` : '当天'}</small></button>`
          : `<button class="pk-card${pk.expanded === 'range' ? ' active' : ''}" data-act="cardTime"><small>时间</small><b data-bind="cardTime">${MC.fmtRange(pk.time, pk.endTime, ' - ')}</b><small data-bind="cardDur">${dur ? '持续时间：' + dur : '　'}</small></button>`}
      </div>`;
      if (pk.chooser && (pk.chooser.key === 'date' || pk.chooser.key === 'end')) h += `<div class="group pk-rows">${chooserHTML(pk.chooser.key)}</div>`;
      if (pk.expanded === 'range' && !allDay) h += '<div class="group pk-rows"><div class="wheel-wrap" id="pkWheelRange"></div></div>';
      h += `<div class="group pk-rows"><label class="pk-row"><span>全天</span><input type="checkbox" class="switch" id="pkAllDay" ${allDay ? 'checked' : ''}></label></div>`;
      h += `<p class="tz">${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || '')}</p>`;
      h += `<div class="group pk-rows">${extraRows()}</div>`;
    }
    if (!pk.dateOnly) h += '<button class="pk-clear" data-act="clear">清除时间、提醒与重复</button>';
    $('#pkBody').innerHTML = h;
    mountWheels();
  }
  function durLabel(a, b) {
    const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number);
    let m = bh * 60 + bm - (ah * 60 + am);
    if (m <= 0) return '';
    const hh = Math.floor(m / 60), mm = m % 60;
    return (hh ? `${hh} 小时` : '') + (mm ? ` ${mm} 分钟` : '');
  }
  function refreshLabels() {
    const set = (k, v) => { const el = $('#pkBody').querySelector(`[data-bind="${k}"]`); if (el) el.textContent = v; };
    set('time', pk.time ? MC.timeLabel(pk) : '无');
    set('remind', MC.remindLabel(pk.remind, !!pk.time));
    set('until', pk.until ? MC.dateLabel(pk.until) + ' ' + MC.parse(pk.until).getFullYear() : '不设，一直重复');
    set('cardDate', `${MC.dateLabel(pk.date)}，周${MC.WD[MC.parse(pk.date).getDay()]}`);
    set('cardRel', MC.relLabel(pk.date));
    if (pk.time) { set('cardTime', MC.fmtRange(pk.time, pk.endTime, ' - ')); const d = durLabel(pk.time, pk.endTime); set('cardDur', d ? '持续时间：' + d : '结束时间需晚于开始时间'); }
  }
  function mountWheels() {
    const cw = $('#chooserWheel');
    if (cw && pk.chooser) {
      const key = pk.chooser.key, val = key === 'until' ? (pk.until || pk.date) : key === 'end' ? endOf() : pk.date;
      UI.dateWheel(cw, val, ds => {
        if ((key === 'end' || key === 'until') && ds < pk.date) return;
        chooserPick(key, ds); refreshLabels();
      }, 40);
    }
    const wd = $('#pkWheelDate');
    if (wd) UI.dateWheel(wd, pk.date, ds => { pk.date = ds; const d = MC.parse(ds); pk.cal = { y: d.getFullYear(), m: d.getMonth() }; refreshLabels(); });
    const wt = $('#pkWheelTime');
    if (wt) UI.timeWheel(wt, pk.time || nextHour(), pk.endTime || '', (s, e) => { pk.time = s; if (pk.endTime) pk.endTime = e; refreshLabels(); });
    const wr = $('#pkWheelRange');
    if (wr) UI.timeWheel(wr, pk.time, pk.endTime || plusHour(pk.time), (s, e) => { pk.time = s; pk.endTime = e; refreshLabels(); });
    const wu = $('#pkWheelUntil');
    if (wu) UI.dateWheel(wu, pk.until, ds => { pk.until = ds; refreshLabels(); });
  }
  $('#pkBody').addEventListener('change', e => {
    if (e.target.id === 'pkAllDay') {
      if (e.target.checked) { pk.time = ''; pk.endTime = ''; }
      else { pk.time = nextHour(); pk.endTime = plusHour(pk.time); pk.days = 1; }
      pk.expanded = null; pk.chooser = null; renderPicker();
    }
  });
  $('#pkBody').addEventListener('click', e => {
    const ch = e.target.closest('.chooser');
    if (ch && pk.chooser) {
      const key = ch.dataset.key;
      const nav = e.target.closest('[data-cnav]');
      if (nav) { const c = pk.chooser.cal, t = new Date(c.y, c.m + Number(nav.dataset.cnav), 1); pk.chooser.cal = { y: t.getFullYear(), m: t.getMonth() }; renderPicker(); return; }
      if (e.target.closest('[data-cmode]')) { pk.chooser.mode = pk.chooser.mode === 'cal' ? 'wheel' : 'cal'; renderPicker(); return; }
      if (e.target.closest('[data-cnone]')) { pk.until = ''; pk.chooser = null; renderPicker(); return; }
      if (e.target.closest('[data-cok]')) { chooserPick('end', pk.pendingEnd); pk.pendingEnd = null; pk.chooser = null; renderPicker(); return; }
      const d = e.target.closest('[data-cds]');
      if (d && key === 'end') { // 第一次点：色条从开始日期铺过来；再点同一天或点「确定」才生效
        const ds = d.dataset.cds;
        if (ds < pk.date) return;
        if (pk.pendingEnd === ds) { chooserPick('end', ds); pk.pendingEnd = null; pk.chooser = null; renderPicker(); return; }
        pk.pendingEnd = ds; pk.animRange = true; renderPicker(); return;
      }
      if (d) {
        chooserPick(key, d.dataset.cds);
        if (key === 'date' && pk.days > 1) { /* 保持天数，结束日期随开始日期移动 */ }
        pk.chooser = null; renderPicker();
      }
      return;
    }
    const day = e.target.closest('.pk-d');
    if (day) {
      pk.date = day.dataset.ds;
      const d = MC.parse(pk.date); pk.cal = { y: d.getFullYear(), m: d.getMonth() };
      renderPicker(); return;
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) { const t = new Date(pk.cal.y, pk.cal.m + Number(nav.dataset.nav), 1); pk.cal = { y: t.getFullYear(), m: t.getMonth() }; renderPicker(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'mode') { pk.wheelMode = !pk.wheelMode; renderPicker(); }
    else if (act === 'time') {
      if (pk.expanded === 'time') pk.expanded = null;
      else { pk.expanded = 'time'; if (!pk.time) pk.time = nextHour(); }
      renderPicker();
    }
    else if (act === 'notime') { pk.time = ''; pk.endTime = ''; pk.expanded = null; renderPicker(); }
    else if (act === 'until') openChooser('until');
    else if (act === 'cardDate') { pk.expanded = null; openChooser('date'); }
    else if (act === 'cardEnd') { pk.expanded = null; openChooser('end'); }
    else if (act === 'cardTime') {
      if (!pk.time) { pk.time = nextHour(); pk.endTime = plusHour(pk.time); }
      pk.chooser = null; pk.expanded = pk.expanded === 'range' ? null : 'range'; renderPicker();
    }
    else if (act === 'remind') {
      UI.menu(a, MC.remindOptions(!!pk.time).map(o => ({ label: o.label, value: o.v, on: o.v === pk.remind })), v => {
        pk.remind = v; refreshLabels();
        a.querySelector('.grow-val').classList.toggle('on', v !== null);
        if (v !== null && MC.Push && !MC.Push.enabled()) UI.toast('提醒需要在「设置 → 提醒通知」中开启');
      });
    }
    else if (act === 'repeat') {
      UI.menu(a, MC.REPEATS.map(r => ({ label: r.label, value: r.v, on: r.v === pk.repeat })), v => {
        pk.repeat = v; pk.until = ''; pk.expanded = null; pk.chooser = null; renderPicker();
      });
    }
    else if (act === 'clear') { pk.time = ''; pk.endTime = ''; pk.days = 1; pk.remind = null; pk.repeat = 'none'; pk.until = ''; pk.expanded = null; renderPicker(); }
  });

  // 按重复规则生成一个或一串事件（单个添加和批量添加共用）
  function buildEvents(fields, repeat, until) {
    let dates = [fields.date], rep = null;
    if (repeat && repeat !== 'none') {
      const forever = !until; // 不设「直到」= 一直重复（先生成一段，之后自动续上）
      dates = MC.repeatDates(fields.date, repeat, until || MC.ymd(MC.addDays(new Date(), MC.HORIZON[repeat] || 730)));
      rep = { freq: repeat, forever };
    }
    const series = rep ? MC.uid() : '';
    return { dates, rep, events: dates.map(ds => MC.makeEvent({ ...fields, cal: newCal, date: ds, series, rep, id: series ? `${series}-${ds}` : MC.uid() })) };
  }

  // ---------- 粘贴识别：一行一个事件，名称和日期必填，时间段 / 优先级 / 提醒可选 ----------
  const CN = { 零: 0, 〇: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const cnNum = s => {
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s === '半') return 0.5;
    const m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
    if (m) return (m[1] ? CN[m[1]] : 1) * 10 + (m[2] ? CN[m[2]] : 0);
    return s.length === 1 && s in CN ? CN[s] : NaN;
  };
  const MONS = [/^jan/, /^f[eé]v|^feb/, /^mar/, /^a[pv]r/, /^ma[yi]/, /^jui?n/, /^jul|^juil/, /^aug|^ao[uû]/, /^sep/, /^oct/, /^nov/, /^d[eé]c/];
  const MON_RE = '(jan(?:uary|v(?:ier)?)?|f[eé]v(?:rier)?|feb(?:ruary)?|mar(?:ch|s)?|apr(?:il)?|avr(?:il)?|may|mai|june?|juin|july?|juil(?:let)?|aug(?:ust)?|ao[uû]t?|sept?(?:ember|embre)?|oct(?:ober|obre)?|nov(?:ember|embre)?|d[eé]c(?:ember|embre)?)\\.?';
  const monOf = w => MONS.findIndex(r => r.test(w)) + 1;
  const WD = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const WDE = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  // 只给了月日：默认今年，已经过去半年以上就当成明年
  function mkDate(y, m, d, today) {
    const yy = y == null ? today.getFullYear() : (y < 100 ? 2000 + y : y);
    let dt = new Date(yy, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    if (y == null && (today - dt) / 864e5 > 183) dt = new Date(yy + 1, m - 1, d);
    return dt;
  }
  // 从字符串开头认一个日期，返回 { d, len }
  // weak：「10-27」「10.27」「27号」这类容易和别的数字混淆的写法，只在没有更明确的日期时才用
  function dateAt(s, today, weak) {
    let m;
    if (weak) {
      if ((m = /^(\d{1,2})[-.](\d{1,2})(?![\d:.])/.exec(s))) return { d: mkDate(null, +m[1], +m[2], today), len: m[0].length };
      if ((m = /^(\d{1,2})\s*[日号號](?!本)/.exec(s))) { // 只写了「27号」：本月，已过就下个月
        let d = new Date(today.getFullYear(), today.getMonth(), +m[1]);
        if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, +m[1]);
        return d.getDate() === +m[1] ? { d, len: m[0].length } : null;
      }
      return null;
    }
    if ((m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/.exec(s))) return { d: mkDate(+m[1], +m[2], +m[3], today), len: m[0].length };
    if ((m = /^(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(s))) return { d: mkDate(null, +m[1], +m[2], today), len: m[0].length };
    if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?!\d)/.exec(s))) {
      let a = +m[1], b = +m[2]; if (a > 12 && b <= 12) [a, b] = [b, a]; // 日/月 写法
      return { d: mkDate(m[3] ? +m[3] : null, a, b, today), len: m[0].length };
    }
    if ((m = new RegExp(`^${MON_RE}\\s*(\\d{1,2})(?:st|nd|rd|th|er)?(?:,?\\s*(\\d{4}))?(?![\\d:])`).exec(s))) return { d: mkDate(m[3] ? +m[3] : null, monOf(m[1]), +m[2], today), len: m[0].length };
    if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th|er)?\\s*(?:of\\s+)?${MON_RE}(?:,?\\s*(\\d{4}))?`).exec(s))) return { d: mkDate(m[3] ? +m[3] : null, monOf(m[2]), +m[1], today), len: m[0].length };
    const rel = { 今天: 0, 今日: 0, today: 0, 明天: 1, 明日: 1, tomorrow: 1, 后天: 2, 後天: 2, 大后天: 3, 大後天: 3, 昨天: -1, yesterday: -1, "aujourd'hui": 0, demain: 1 };
    if ((m = /^(大后天|大後天|今天|今日|明天|明日|后天|後天|昨天|today|tomorrow|yesterday|aujourd'hui|demain)/.exec(s))) return { d: MC.addDays(today, rel[m[1]]), len: m[0].length };
    if ((m = /^(下下|下个|下個|下|本|这个|這個|这|這|上)?\s*(周|週|星期|礼拜|禮拜)([日天一二三四五六])/.exec(s)) || (m = /^(next\s+|this\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?(?![a-z])/.exec(s))) {
      const pre = (m[1] || '').trim(), w = m[3] !== undefined ? WD[m[3]] : WDE.indexOf(m[2]);
      let d;
      if (!pre) d = MC.addDays(today, (w - today.getDay() + 7) % 7); // 最近的那一天（含今天）
      else {
        const ws = MC.weekStartOf(today), off = /下下/.test(pre) ? 14 : /下|next/.test(pre) ? 7 : pre === '上' ? -7 : 0;
        d = MC.addDays(ws, off + (w - MC.settings.weekStart + 7) % 7);
      }
      return { d, len: m[0].length };
    }
    return null;
  }
  const TIME = '((?<![a-z])(?:am|pm)|上午|早上|早晨|中午|下午|晚上|傍晚|夜里|凌晨)?\\s*(\\d{1,2})(?:\\s*:\\s*(\\d{2})|\\s*([点點时時]|h(?![a-z]))(?:\\s*(半|\\d{1,2})\\s*分?)?)?\\s*(a\\.?m\\.?|p\\.?m\\.?)?(?![a-z])';
  const SEP = '\\s*(?:-|~|到|至|to|à)\\s*';
  function hm(x, per, suf) {
    let h = +x[1];
    const m = x[2] !== undefined ? +x[2] : x[4] === '半' ? 30 : x[4] !== undefined ? +x[4] : 0;
    const p = (per || '') + (suf || '').replace(/\./g, '');
    if (/下午|晚上|傍晚|夜里|pm/.test(p) && h < 12) h += 12;
    else if (/中午/.test(p) && h < 11) h += 12;
    else if (/上午|早|凌晨|am/.test(p) && h === 12) h = 0;
    return h > 23 || m > 59 ? null : { h, m, per: !!p };
  }
  const hhmm = t => `${MC.pad(t.h)}:${MC.pad(t.m)}`;
  // 认时间：「15:00-17:00」「下午3点到5点」「3-5pm」「9点半」「15h30」；只有数字、没有冒号 / 点 / am pm 的不算时间
  function findTime(s) {
    const re = new RegExp(`${TIME}(?:${SEP}${TIME})?`, 'g');
    let m;
    while ((m = re.exec(s))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const a = m.slice(1, 7), b = m.slice(7, 13), hasB = b[1] !== undefined;
      const marked = x => x[0] || x[2] !== undefined || x[3] || x[5];
      if (!marked(a) && !(hasB && marked(b))) continue; // 比如 10-27：两边都只是数字
      const before = s[m.index - 1], after = s[m.index + m[0].length];
      if ((before && /[\d/.\-:]/.test(before)) || (after && /[\d/:]/.test(after))) continue;
      const t1 = hm(a, a[0] || (!a[5] && hasB ? b[0] : null), a[5] || (!a[0] && hasB ? b[5] : null));
      if (!t1) continue;
      let t2 = hasB ? hm(b, b[0] || (!b[5] ? a[0] : null), b[5] || (!b[0] && !a[0] ? a[5] : null)) : null;
      if (t2 && t2.h * 60 + t2.m <= t1.h * 60 + t1.m && t2.h < 12 && !t2.per) t2.h += 12; // 11:00-1:00 → 13:00
      if (t2 && t2.h * 60 + t2.m <= t1.h * 60 + t1.m) t2 = null;
      return { time: hhmm(t1), endTime: t2 ? hhmm(t2) : '', i: m.index, len: m[0].length };
    }
    return null;
  }
  const PRI_W = { 高: 3, 紧急: 3, 緊急: 3, high: 3, urgent: 3, haute: 3, 中: 2, medium: 2, med: 2, mid: 2, moyenne: 2, 低: 1, low: 1, basse: 1, 无: 0, 無: 0, none: 0 };
  const B = '(?<=^|[\\s,;|、\\t(（\\[【])', E = '(?=$|[\\s,;|、\\t)）\\]】:=])'; // 单独成词
  function parseLine(raw, today) {
    let s = raw.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u3000/g, ' ');
    s = s.replace(/^\s*(?:[-*•·]\s+|\d{1,3}(?:[、)]|\.\s+))/, ''); // 列表编号
    const cut = (i, len) => { s = s.slice(0, i) + ' '.repeat(len) + s.slice(i + len); };
    const take = (re, f) => { const m = re.exec(s.toLowerCase()); if (!m) return false; f(m); cut(m.index, m[0].length); return true; };
    const out = { remind: null, priority: 0, time: '', endTime: '', days: 1 };
    // 提醒
    if (!take(new RegExp(`(不|无|無|不要|不用|无需|無需)(需要)?提醒|${B}提醒\\s*[:=]?\\s*(否|不|无|無|no|n|×|✗)${E}|no\\s+remind(er)?`), () => {})) {
      take(/提前\s*(\d+|[一二两三四五六七八九十半]+)\s*(?:个|個)?\s*(分钟|分鐘|分|min(?:ute)?s?|小时|小時|钟头|鐘頭|h(?:ours?)?|天|日|days?|周|週|星期|weeks?)\s*(?:提醒)?|(\d+)\s*(分钟|分鐘|分|min(?:ute)?s?|小时|小時|時間|h(?:ours?)?|天|日|days?)\s*(?:前|before)\s*(?:に)?\s*(?:提醒|通知)?/, m => {
        const n = cnNum(m[1] || m[3]), u = m[2] || m[4];
        const k = /分|min/.test(u) ? 1 : /时|時|钟头|鐘頭|^h/.test(u) ? 60 : /周|週|星期|week/.test(u) ? 10080 : 1440;
        if (n >= 0) out.remind = Math.round(n * k);
      }) || take(new RegExp(`(准时|準時|需要|要)提醒|${B}提醒\\s*[:=]?\\s*(是|要|需要|yes|y|√|✓)?${E}|${B}remind(er)?${E}|${B}rappel${E}|${B}通知${E}|⏰|🔔`), () => { out.remind = 0; });
    }
    // 优先级
    take(new RegExp(`(优先级|優先級|優先度|priority|prio|priorité)\\s*[:=]?\\s*(高|中|低|无|無|high|medium|med|mid|low|none|haute|moyenne|basse)|(高|中|低)\\s*(?:优先级?|優先級?)|${B}p([0-3])${E}|${B}(!{1,3})${E}`), m => {
      out.priority = m[2] ? PRI_W[m[2]] : m[3] ? PRI_W[m[3]] : m[4] ? [0, 3, 2, 1][+m[4]] : m[5].length;
    }) || take(new RegExp(`${B}(高|中|低|紧急|緊急|urgent|high|medium|low|haute|moyenne|basse)${E}`), m => { out.priority = PRI_W[m[1]]; });
    take(/全天|all[\s-]?day|toute la journée/, () => {});
    // 时间段（先认，免得被当成日期）
    const t = findTime(s.toLowerCase());
    if (t) { out.time = t.time; out.endTime = t.endTime; cut(t.i, t.len); }
    // 日期：先找明确的写法，没有再找「10-27」「27号」；后面紧跟「-」「到」再一个日期就是连续多天
    for (const weak of [false, true]) {
      const sl = s.toLowerCase();
      for (let i = 0; i < sl.length && !out.date; i++) {
        if (i && /[a-z\d]/.test(sl[i - 1]) && /[a-z\d]/.test(sl[i])) continue;
        const r = dateAt(sl.slice(i), today, weak); if (!r || !r.d) continue;
        out.date = MC.ymd(r.d); let len = r.len;
        const rest = /^\s*(?:-|~|到|至|au)\s*/.exec(sl.slice(i + len));
        if (rest && !out.time) {
          const tail = sl.slice(i + len + rest[0].length);
          let r2 = dateAt(tail, today, false), dm = null;
          if (!r2 && (dm = /^(\d{1,2})\s*[日号號]?(?![\d:/.\-])/.exec(tail))) r2 = { d: new Date(r.d.getFullYear(), r.d.getMonth(), +dm[1]), len: dm[0].length };
          if (r2 && r2.d) {
            let e = r2.d; if (e < r.d && !dm) e = new Date(e.getFullYear() + 1, e.getMonth(), e.getDate());
            const n = Math.round((e - r.d) / 864e5) + 1;
            if (n > 1 && n <= 60) { out.days = n; len += rest[0].length + r2.len; }
          }
        }
        cut(i, len);
      }
      if (out.date) break;
    }
    // 剩下的就是名称：去掉字段标签和分隔符
    out.title = s.replace(/(名称|名稱|事件|标题|標題|日期|时间段|時間段|时间|時間|优先级|優先級|優先度|提醒|通知|title|name|date|time)\s*[:=]/gi, ' ')
      .replace(/[\t|;,，；、]+/g, ' ').replace(/[()（）\[\]【】]\s*[()（）\[\]【】]/g, ' ').replace(/\s+/g, ' ')
      .replace(/^[\s\-~:.·。]+|[\s\-~:.·。]+$/g, '').trim();
    // 全天事件只能「当天」或提前几天（以当天 9:00 为准），挑最接近的
    if (out.remind !== null && !out.time) out.remind = [0, 1440, 2880, 10080].reduce((a, b) => (Math.abs(b - out.remind) < Math.abs(a - out.remind) ? b : a));
    return out;
  }
  MC.parseEventLine = (line, today = new Date()) => parseLine(line, new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  // ======================= 批量添加 =======================
  let rows = [];
  // 草稿：随时自动保存在本机，关掉再打开会恢复；添加成功或选择清空后删除
  const BATCH_KEY = 'mcal.batchDraft';
  const rowHasContent = r => !!(r.title.trim() || r.note.trim() || r.priority || r.rate || r.time || (r.remind !== null && r.remind !== undefined) || (r.repeat && r.repeat !== 'none'));
  const batchHasContent = () => rows.some(rowHasContent);
  function saveBatchDraft() {
    try {
      if (batchHasContent()) localStorage.setItem(BATCH_KEY, JSON.stringify({ rows, cal: newCal, at: Date.now() }));
      else localStorage.removeItem(BATCH_KEY);
    } catch (e) {}
    paintBatchHint();
  }
  const readBatchDraft = () => { try { return JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); } catch (e) { return null; } };
  const BATCH_HINT = '名称必填；不选优先级默认为灰色；备注可不填。';
  const paintBatchHint = () => { $('#batchHint').textContent = batchHasContent() ? BATCH_HINT + '草稿已自动保存。' : BATCH_HINT; };
  // 返回确认：有内容时问一下保留草稿还是清空；点别处 = 继续编辑
  UI.guard('batchSheet', proceed => {
    if (!batchHasContent()) { localStorage.removeItem(BATCH_KEY); proceed(); return; }
    UI.menu($('#batchSheet [data-close]'), [
      { label: '保留草稿，稍后继续', value: 'keep' },
      { label: '不保留，清空', value: 'drop' },
    ], v => {
      if (v === 'keep') { saveBatchDraft(); proceed(); UI.toast('草稿已保存，下次打开批量添加会恢复'); }
      else { rows = []; localStorage.removeItem(BATCH_KEY); proceed(); }
    });
  });
  const blankRow = (date, extra = {}) => ({ title: '', note: '', priority: 0, rate: 0, date, days: 1, time: '', endTime: '', remind: null, repeat: 'none', until: '', ...extra });
  // 行里日期按钮上的摘要：日期 + 时间，有提醒 / 重复时各加一个小图标
  const I_BELL = '<svg class="b-ic" viewBox="0 0 24 24" aria-label="有提醒"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const I_REP = '<svg class="b-ic" viewBox="0 0 24 24" aria-label="重复"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/></svg>';
  const whenHTML = r => {
    const d = MC.dayDiff(r.date) === 0 ? '今天' : MC.dateLabel(r.date);
    const t = r.time ? ` ${esc(MC.fmtTime(r.time))}` : r.days > 1 ? ` · ${r.days} 天` : '';
    return `<span>${esc(d)}${t}</span>${r.remind !== null && r.remind !== undefined ? I_BELL : ''}${r.repeat && r.repeat !== 'none' ? I_REP : ''}`;
  };
  function openBatch() {
    const t = $('#cmpTitle').value.trim(), n = $('#cmpNote').value.trim();
    const saved = readBatchDraft();
    if (saved && Array.isArray(saved.rows) && saved.rows.length) {
      rows = saved.rows.map(r => blankRow(r.date || draft.date, r));
      if (t && !rows.some(r => r.title.trim() === t)) rows.unshift(blankRow(draft.date, { title: t, note: n, priority: draft.priority }));
      UI.toast('已恢复上次没添加完的草稿');
    } else rows = [blankRow(draft.date, { title: t, note: n, priority: draft.priority }), blankRow(draft.date), blankRow(draft.date)];
    $('#cmpTitle').blur(); $('#cmpNote').blur();
    $('#batchPaste').value = ''; fitPaste();
    renderBatch();
    UI.open('batchSheet');
  }
  Editor.openBatch = date => { resetDraft(date || MC.Cal.selected() || MC.todayStr()); $('#cmpTitle').value = ''; $('#cmpNote').value = ''; openBatch(); };
  function renderBatch() {
    $('#batchList').innerHTML = rows.map((r, i) => `
      <div class="brow" data-i="${i}">
        <div class="b-top">
          <span class="b-idx">${i + 1}</span>
          <input class="b-title" value="${esc(r.title)}" placeholder="名称（必填）" enterkeyhint="next">
          ${rows.length > 1 ? `<button class="b-del" data-act="del" aria-label="删除这一行">×</button>` : ''}
        </div>
        <div class="b-tools">
          <button class="tool icon-tool glass" data-act="flag" aria-label="优先级"><svg viewBox="0 0 24 24" width="17" height="17"><path d="M6 21V4h11l-2.2 4.2L17 12.5H6"/></svg></button>
          <button class="tool date-tool glass" data-act="date" aria-label="日期、时间、提醒与重复">${whenHTML(r)}</button>
          <input class="b-note" value="${esc(r.note)}" placeholder="备注（选填）">
        </div>
      </div>`).join('');
    $('#batchList').querySelectorAll('.brow').forEach(el => paintFlag(el.querySelector('[data-act="flag"]'), (MC.rateOn(newCal) ? rows[Number(el.dataset.i)].rate : rows[Number(el.dataset.i)].priority)));
    updateBatchCount();
    saveBatchDraft();
  }
  function updateBatchCount() {
    const n = rows.filter(r => r.title.trim()).length;
    $('#batchSave').textContent = n ? `添加 ${n} 项` : '添加';
  }
  $('#batchList').addEventListener('input', e => {
    const el = e.target.closest('.brow'); if (!el) return;
    const r = rows[Number(el.dataset.i)];
    if (e.target.classList.contains('b-title')) { r.title = e.target.value; el.classList.remove('err'); updateBatchCount(); }
    if (e.target.classList.contains('b-note')) r.note = e.target.value;
    saveBatchDraft();
  });
  $('#batchList').addEventListener('focusin', e => {
    // 只滚动列表本身，不能用 scrollIntoView（它会连带滚动整个面板和页面，导致面板“缩没了”）
    if (!e.target.matches('input')) return;
    const list = $('#batchList'), el = e.target;
    setTimeout(() => {
      const r = el.getBoundingClientRect(), lr = list.getBoundingClientRect();
      list.scrollTo({ top: Math.max(0, list.scrollTop + (r.top - lr.top) - 60), behavior: 'smooth' });
    }, 320);
  });
  $('#batchList').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || !e.target.classList.contains('b-title')) return;
    e.preventDefault();
    const i = Number(e.target.closest('.brow').dataset.i);
    if (i === rows.length - 1) addRow();
    else $('#batchList').querySelectorAll('.b-title')[i + 1].focus();
  });
  $('#batchList').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const el = a.closest('.brow'), i = Number(el.dataset.i), r = rows[i];
    if (a.dataset.act === 'del') { rows.splice(i, 1); renderBatch(); }
    else if (a.dataset.act === 'flag') UI.menu(a, MC.rateOn(newCal) ? UI.rateMenuItems(newCal, r.rate) : UI.priMenuItems(r.priority), v => { if (MC.rateOn(newCal)) r.rate = v; else r.priority = v; paintFlag(a, v); saveBatchDraft(); });
    else if (a.dataset.act === 'date') {
      document.activeElement && document.activeElement.blur();
      // 和单个添加一样的完整选择：日期、时间段、多天、提醒、重复
      Editor.openPicker({ ...r, allowRepeat: true }, s => { Object.assign(r, s); a.innerHTML = whenHTML(r); saveBatchDraft(); });
    }
  });
  function addRow() {
    const last = rows[rows.length - 1];
    rows.push(blankRow(last ? last.date : draft.date));
    renderBatch();
    $('#batchList').scrollTop = $('#batchList').scrollHeight;
  }
  $('#batchAddRow').onclick = addRow;
  // 粘贴栏：一行一个事件，认出名称和日期的变成下面的行，认不出的留在粘贴栏里
  const paste = $('#batchPaste');
  function fitPaste() {
    paste.style.height = 'auto';
    paste.style.height = Math.min(paste.scrollHeight, 150) + 'px';
    $('#batchParse').disabled = !paste.value.trim();
  }
  paste.addEventListener('input', fitPaste);
  $('#batchParse').onclick = () => {
    const lines = paste.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const ok = [], bad = [];
    for (const l of lines) { const x = MC.parseEventLine(l); if (x.title && x.date) ok.push(x); else bad.push(l); }
    if (!ok.length) { UI.toast('没认出事件：每行需要名称和日期'); return; }
    const first = rows.filter(rowHasContent).length;
    rows = rows.filter(rowHasContent).concat(ok.map(x => blankRow(x.date, { title: x.title, priority: x.priority, days: x.days, time: x.time, endTime: x.endTime, remind: x.remind })));
    paste.value = bad.join('\n'); fitPaste();
    if (!bad.length) paste.blur();
    renderBatch();
    const el = $('#batchList').querySelectorAll('.brow')[first];
    if (el) $('#batchList').scrollTop = el.offsetTop - $('#batchList').offsetTop - 4;
    UI.toast(bad.length ? `已识别 ${ok.length} 个事件，${bad.length} 行缺少名称或日期，留在粘贴栏里` : `已识别 ${ok.length} 个事件`, { ms: bad.length ? 3500 : 2200 });
  };
  $('#batchSave').onclick = () => {
    let bad = -1;
    rows.forEach((r, i) => {
      const el = $('#batchList').querySelector(`.brow[data-i="${i}"]`);
      const missing = !r.title.trim() && (r.note.trim() || r.priority);
      el.classList.toggle('err', !!missing);
      if (missing && bad < 0) bad = i;
    });
    if (bad >= 0) { UI.toast(`第 ${bad + 1} 行缺少名称`); return; }
    const valid = rows.filter(r => r.title.trim());
    if (!valid.length) { UI.toast('至少填写一个名称'); return; }
    let all = [], repeated = 0;
    for (const r of valid) {
      const fields = { title: r.title.trim(), note: r.note.trim(), priority: r.priority, rate: MC.rateOn(newCal) ? (r.rate || 0) : 0, date: r.date, days: r.time ? 1 : (r.days || 1), time: r.time, endTime: r.endTime, remind: r.remind };
      const b = buildEvents(fields, r.repeat, r.until);
      if (b.rep) repeated++;
      all = all.concat(b.events);
    }
    MC.addEvents(all);
    const quiet = newCal && !MC.notifies({ cal: newCal }) && valid.some(r => r.remind !== null && r.remind !== undefined);
    rows = []; localStorage.removeItem(BATCH_KEY);
    UI.close('batchSheet', true);
    localStorage.removeItem(DRAFT_KEY);
    $('#cmpTitle').value = ''; $('#cmpNote').value = '';
    if (UI.isOpen('composer')) closeComposer(false);
    UI.toast(`已添加 ${valid.length} 个事件${repeated ? `，其中 ${repeated} 个会重复` : ''}` + (quiet ? `。「${MC.cal(newCal).name}」的通知没有打开，不会提醒` : ''));
  };
})();
