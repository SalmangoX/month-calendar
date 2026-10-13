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
  let mode = 'new', editing = null;
  const draft = {};
  function resetDraft(date) {
    Object.assign(draft, { title: '', note: '', priority: 0, date, days: 1, time: '', endTime: '', remind: null, repeat: 'none', until: '', done: false });
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
    const c = MC.priOf(p).color;
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
  let otherOpen = false, otherMode = 'wheel', otherCal = null;
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
    else if (draft.days > 1) extra.push(`持续 ${draft.days} 天`);
    if (draft.repeat && draft.repeat !== 'none') extra.push(MC.repeatLabel(draft.repeat));
    if (draft.remind !== null && draft.remind !== undefined) extra.push('提醒');
    $('#cmpDateLabel').textContent = extra.length ? extra.join(' · ') : '时间 · 持续 · 提醒 · 重复';
  }
  function paintComposer() {
    paintQuick();
    paintTools();
    $('#cmpPri').innerHTML = MC.PRI.map(p => `<button class="qchip pri${p.v === draft.priority ? ' on' : ''}" data-v="${p.v}" style="--c:${p.color}"><span class="dot"></span>${p.name}</button>`).join('');
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
    const fields = { title, note, priority: draft.priority, date: draft.date, days: draft.time ? 1 : (draft.days || 1), time: draft.time, endTime: draft.endTime, remind: draft.remind, done: draft.done };
    const changed = Object.keys(fields).some(k => (fields[k] ?? null) !== (editing[k] ?? null));
    if (!changed) return;
    if (!title) { UI.toast('名称为空，修改没有保存'); return; }
    MC.updateEvent(editing, fields);
    UI.toast('修改已自动保存');
  }
  function closeComposer(save) { skipCloseSave = !save; UI.close('composer'); }
  Editor.closeComposerSilently = () => closeComposer(false);

  Editor.openNew = date => {
    mode = 'new'; editing = null;
    resetDraft(date || MC.Cal.selected() || MC.todayStr());
    const saved = readDraft();
    if (saved) {
      Object.assign(draft, saved);
      $('#cmpTitle').value = saved.title || ''; $('#cmpNote').value = saved.note || '';
    } else { $('#cmpTitle').value = ''; $('#cmpNote').value = ''; }
    $('#cmpHeading').textContent = saved ? '继续编辑草稿' : '新建事件';
    $('#cmpClear').hidden = !saved;
    $('#cmpSave').textContent = '添加';
    $('#cmpEditBar').hidden = true;
    $('#cmpBatch').hidden = false;
    $('#cmpTitle').classList.remove('err');
    otherOpen = false; renderOther();
    growTitle(); paintComposer();
    UI.open('composer', onComposerClosed);
  };
  Editor.openEdit = e => {
    mode = 'edit'; editing = e;
    Object.assign(draft, { title: e.title, note: e.note, priority: e.priority, date: e.date, days: e.days || 1, time: e.time, endTime: e.endTime, remind: e.remind, repeat: 'none', until: '', done: e.done });
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
    $('#cmpHeading').textContent = '新建事件'; $('#cmpClear').hidden = true;
    growTitle(); paintComposer();
  };

  $('#cmpTitle').addEventListener('input', () => { growTitle(); $('#cmpTitle').classList.remove('err'); paintComposer(); });
  $('#cmpTitle').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
  $('#cmpQuick').addEventListener('click', e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    if (b.dataset.act === 'other') { otherOpen = !otherOpen; otherCal = null; paintQuick(); renderOther(); return; }
    draft.date = b.dataset.ds; otherOpen = false; paintComposer(); renderOther();
  });
  $('#cmpPri').addEventListener('click', e => {
    const b = e.target.closest('.qchip'); if (!b) return;
    draft.priority = Number(b.dataset.v); paintComposer();
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
    const doDelete = all => {
      if (all) {
        const ids = new Set(later.map(x => x.id));
        const t = Date.now();
        MC.data.events = MC.data.events.filter(x => !ids.has(x.id));
        ids.forEach(id => (MC.data.deleted[id] = t));
        MC.commit();
        UI.toast(`已删除 ${ids.size} 个事件`);
      } else { MC.deleteEvent(ev); UI.toast('已删除'); }
      closeComposer(false);
    };
    if (later.length > 1) {
      UI.menu($('#cmpDelete'), [
        { label: '仅删除这一个', value: false },
        { label: `删除这个及之后的重复（${later.length} 个）`, value: true },
      ], doDelete);
    } else if (confirm(`删除「${ev.title}」？`)) doDelete(false);
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
    const fields = { title, note, priority: draft.priority, date: draft.date, days: draft.time ? 1 : (draft.days || 1), time: draft.time, endTime: draft.endTime, remind: draft.remind };
    if (mode === 'edit') {
      MC.updateEvent(editing, { ...fields, done: draft.done });
      closeComposer(false);
      UI.toast('已保存');
      return;
    }
    const dates = MC.repeatDates(draft.date, draft.repeat, draft.until);
    const series = dates.length > 1 ? MC.uid() : '';
    MC.addEvents(dates.map(ds => MC.newEvent({ ...fields, date: ds, series })));
    UI.toast(dates.length > 1 ? `已添加 ${dates.length} 个重复事件` : `已添加到${MC.dayDiff(draft.date) === 0 ? '今天' : ' ' + MC.dateLabel(draft.date)}`);
    $('#cmpTitle').value = ''; $('#cmpNote').value = '';
    draft.repeat = 'none'; draft.until = '';
    localStorage.removeItem(DRAFT_KEY);
    $('#cmpHeading').textContent = '新建事件'; $('#cmpClear').hidden = true;
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
      wheelMode: !!opts.dateOnly, expanded: null,
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
    if (pk.repeat !== 'none' && (!pk.until || pk.until < pk.date)) pk.until = MC.defaultUntil(pk.date, pk.repeat);
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
  const row = (act, icon, label, val, on) =>
    `<button class="pk-row" data-act="${act}">${icon}<span>${label}</span><span class="grow-val${on ? ' on' : ''}" data-bind="${act}">${esc(val)}</span></button>`;
  function extraRows() {
    const hasTime = !!pk.time;
    let h = '';
    if (!hasTime && !pk.dateOnly) h += row('days', SVG_CAL, '持续', pk.days > 1 ? `${pk.days} 天（到 ${MC.dateLabel(MC.ymd(MC.addDays(MC.parse(pk.date), pk.days - 1)))}）` : '1 天', pk.days > 1);
    h += row('remind', SVG_BELL, '提醒', MC.remindLabel(pk.remind, hasTime), pk.remind !== null);
    if (pk.allowRepeat) {
      h += row('repeat', SVG_REPEAT, '重复', MC.repeatLabel(pk.repeat), pk.repeat !== 'none');
      if (pk.repeat !== 'none') {
        if (!pk.until) pk.until = MC.defaultUntil(pk.date, pk.repeat);
        h += row('until', SVG_END, '直到', MC.dateLabel(pk.until) + ' ' + MC.parse(pk.until).getFullYear(), true);
        if (pk.expanded === 'until') h += '<div class="wheel-wrap" id="pkWheelUntil"></div>';
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
      h += `<div class="pk-cards">
        <button class="pk-card${pk.expanded === 'date' ? ' active' : ''}" data-act="cardDate"><small>日期</small><b data-bind="cardDate">${MC.dateLabel(pk.date)}，周${MC.WD[MC.parse(pk.date).getDay()]}</b><small data-bind="cardRel">${MC.relLabel(pk.date)}</small></button>
        <button class="pk-card${pk.time ? '' : ' dim'}${pk.expanded === 'range' ? ' active' : ''}" data-act="cardTime"><small>时间</small><b data-bind="cardTime">${pk.time ? `${pk.time} - ${pk.endTime}` : '全天'}</b><small data-bind="cardDur">${dur ? '持续时间：' + dur : '　'}</small></button>
      </div>`;
      if (pk.expanded === 'date') h += '<div class="group pk-rows"><div class="wheel-wrap" id="pkWheelDate"></div></div>';
      if (pk.expanded === 'range') h += '<div class="group pk-rows"><div class="wheel-wrap" id="pkWheelRange"></div></div>';
      h += `<div class="group pk-rows"><label class="pk-row"><span>全天</span><input type="checkbox" class="switch" id="pkAllDay" ${pk.time ? '' : 'checked'}></label></div>`;
      h += `<p class="tz">${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || '')}</p>`;
      h += `<div class="group pk-rows">${extraRows()}</div>`;
    }
    if (!pk.dateOnly) h += '<button class="pk-clear" data-act="clear">清除时间、持续、提醒与重复</button>';
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
    if (pk.until) set('until', MC.dateLabel(pk.until) + ' ' + MC.parse(pk.until).getFullYear());
    set('cardDate', `${MC.dateLabel(pk.date)}，周${MC.WD[MC.parse(pk.date).getDay()]}`);
    set('cardRel', MC.relLabel(pk.date));
    if (pk.time) { set('cardTime', `${pk.time} - ${pk.endTime}`); const d = durLabel(pk.time, pk.endTime); set('cardDur', d ? '持续时间：' + d : '结束时间需晚于开始时间'); }
  }
  function mountWheels() {
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
      else { pk.time = nextHour(); pk.endTime = plusHour(pk.time); }
      pk.expanded = null; renderPicker();
    }
  });
  $('#pkBody').addEventListener('click', e => {
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
    else if (act === 'until') { pk.expanded = pk.expanded === 'until' ? null : 'until'; renderPicker(); }
    else if (act === 'cardDate') { pk.expanded = pk.expanded === 'date' ? null : 'date'; renderPicker(); }
    else if (act === 'cardTime') {
      if (!pk.time) { pk.time = nextHour(); pk.endTime = plusHour(pk.time); }
      pk.expanded = pk.expanded === 'range' ? null : 'range'; renderPicker();
    }
    else if (act === 'days') {
      const opts = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30];
      UI.menu(a, opts.map(n => ({ label: n === 1 ? '1 天（当天）' : `${n} 天`, value: n, on: n === pk.days })), v => { pk.days = v; renderPicker(); });
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
        pk.repeat = v; pk.until = v === 'none' ? '' : MC.defaultUntil(pk.date, v); pk.expanded = null; renderPicker();
      });
    }
    else if (act === 'clear') { pk.time = ''; pk.endTime = ''; pk.days = 1; pk.remind = null; pk.repeat = 'none'; pk.until = ''; pk.expanded = null; renderPicker(); }
  });

  // ======================= 批量添加 =======================
  let rows = [];
  const blankRow = (date, extra = {}) => ({ title: '', note: '', priority: 0, date, ...extra });
  function openBatch() {
    const t = $('#cmpTitle').value.trim(), n = $('#cmpNote').value.trim();
    rows = [blankRow(draft.date, { title: t, note: n, priority: draft.priority }), blankRow(draft.date), blankRow(draft.date)];
    $('#cmpTitle').blur(); $('#cmpNote').blur();
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
          <button class="tool date-tool glass" data-act="date">${MC.dayDiff(r.date) === 0 ? '今天' : MC.dateLabel(r.date)}</button>
          <input class="b-note" value="${esc(r.note)}" placeholder="备注（选填）">
        </div>
      </div>`).join('');
    $('#batchList').querySelectorAll('.brow').forEach(el => paintFlag(el.querySelector('[data-act="flag"]'), rows[Number(el.dataset.i)].priority));
    updateBatchCount();
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
    else if (a.dataset.act === 'flag') UI.menu(a, UI.priMenuItems(r.priority), v => { r.priority = v; paintFlag(a, v); });
    else if (a.dataset.act === 'date') {
      document.activeElement && document.activeElement.blur();
      Editor.openPicker({ date: r.date, dateOnly: true }, s => { r.date = s.date; a.textContent = MC.dayDiff(r.date) === 0 ? '今天' : MC.dateLabel(r.date); });
    }
  });
  function addRow() {
    const last = rows[rows.length - 1];
    rows.push(blankRow(last ? last.date : draft.date));
    renderBatch();
    $('#batchList').scrollTop = $('#batchList').scrollHeight;
  }
  $('#batchAddRow').onclick = addRow;
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
    MC.addEvents(valid.map(r => MC.newEvent({ title: r.title.trim(), note: r.note.trim(), priority: r.priority, date: r.date })));
    UI.close('batchSheet');
    localStorage.removeItem(DRAFT_KEY);
    $('#cmpTitle').value = ''; $('#cmpNote').value = '';
    if (UI.isOpen('composer')) closeComposer(false);
    UI.toast(`已添加 ${valid.length} 个事件`);
  };
})();
