/* 月历 · 课表：周课表视图、粘贴文字 / .ics 导入、手动增改 */
(() => {
  'use strict';
  const MC = window.MC, UI = MC.UI, $ = UI.$, esc = MC.esc;
  const Sched = (MC.Sched = {});
  const DAYS = ['', '一', '二', '三', '四', '五', '六', '日'];
  const PALETTE = ['#5D7895', '#5F9479', '#C38F45', '#BE6662', '#86769F', '#4E8C92', '#6170A3', '#9A7B5C'];
  const colorOf = code => { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const pad = MC.pad;

  // ---------- 解析：粘贴的文字（uoZone 列表视图 / 通用格式） ----------
  const DAYTOK = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|Mo|Tu|We|Th|Fr|Sa|Su|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天])';
  const TIME_RE = new RegExp(`((?:${DAYTOK}[\\s,/、&]*)+|\\b[MTWRF]{1,5})\\s*(\\d{1,2})[:：](\\d{2})\\s*(AM|PM|am|pm)?\\s*[-–—~至到]\\s*(\\d{1,2})[:：](\\d{2})\\s*(AM|PM|am|pm)?`);
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const EN = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7 };
  function parseDays(str) {
    const out = new Set();
    if (/^[MTWRF]{1,5}$/.test(str.trim())) { for (const c of str.trim()) out.add({ M: 1, T: 2, W: 3, R: 4, F: 5 }[c]); return [...out]; }
    const re = new RegExp(DAYTOK, 'gi'); let m;
    while ((m = re.exec(str))) {
      const t = m[0];
      const cn = t.match(/[一二三四五六日天]/);
      if (cn) out.add(CN[cn[0]]); else out.add(EN[t.slice(0, 2).toLowerCase()]);
    }
    return [...out].filter(Boolean).sort();
  }
  function to24(h, m, ap) {
    h = Number(h);
    if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
    return `${pad(h)}:${m}`;
  }
  const TYPE_RE = /\b(Lecture|Laboratory|Lab|Tutorial|Discussion Group|Seminar|DGD|LEC|LAB|TUT|SEM)\b|讲座|讲课|实验|辅导|习题课|研讨/i;
  const TYPE_CN = { lecture: '讲座', lec: '讲座', laboratory: '实验', lab: '实验', tutorial: '辅导', tut: '辅导', 'discussion group': '讨论课', dgd: '讨论课', seminar: '研讨', sem: '研讨' };
  const looksRoom = s => !!s && s.length < 48 && /[A-Za-z\u4e00-\u9fa5]/.test(s)
    && (/\d/.test(s) || /\b(Hall|Building|Room|Complex|Centre|Center|Pavilion|Library|VIRT|Online|Virtual)\b|楼|室|馆/i.test(s))
    && !TIME_RE.test(s) && !/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) && !/^(staff|tba|to be announced)$/i.test(s)
    && !/^[A-Z]{3,4}\s?\d{4}/.test(s) && !/^(Enrolled|Status|Class Nbr|Section|Component)/i.test(s);
  Sched.parseText = text => {
    const rawLines = String(text).split(/\r?\n/).filter(l => l.trim());
    const lines = rawLines.map(l => l.replace(/\s+/g, ' ').trim());
    let code = '', type = '';
    const out = [];
    lines.forEach((line, i) => {
      const cm = line.match(/\b([A-Za-z]{3,4})\s?(\d{4})\b/);
      if (cm && !TIME_RE.test(line.slice(0, cm.index + 1))) { code = `${cm[1].toUpperCase()} ${cm[2]}`; }
      const tm = line.match(TYPE_RE);
      if (tm) { const k = tm[0].toLowerCase(); type = TYPE_CN[k] || tm[0]; }
      const m = line.match(TIME_RE);
      if (!m || !code) return;
      const days = parseDays(m[1]);
      let start = to24(m[2], m[3], m[4] || (m[7] && Number(m[2]) <= Number(m[5]) ? m[7] : '')), end = to24(m[5], m[6], m[7]);
      if (toMin(end) <= toMin(start)) return;
      // 表格复制出来的列用 Tab 分隔：时间后面的第一列就是教室
      const rawM = rawLines[i].match(TIME_RE);
      const rest = rawM ? rawLines[i].slice(rawM.index + rawM[0].length) : '';
      let room = (rest.split(/\t| {2,}/).map(x => x.trim()).filter(Boolean)[0] || '').replace(/^[,，|·-]+/, '').trim();
      if (!looksRoom(room)) room = looksRoom(lines[i + 1]) ? lines[i + 1] : '';
      for (const d of days) out.push({ code, type, day: d, start, end, room });
    });
    const seen = new Set();
    return out.filter(c => { const k = `${c.code}|${c.day}|${c.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ---------- 解析：.ics 文件 ----------
  Sched.parseICS = text => {
    const raw = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let ev = null;
    const val = l => l.slice(l.indexOf(':') + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
    const dt = l => {
      const v = val(l), m = v.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
      if (!m) return null;
      let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
      if (/Z$/.test(v)) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      return d;
    };
    for (const l of raw) {
      if (l === 'BEGIN:VEVENT') ev = {};
      else if (l === 'END:VEVENT' && ev) {
        if (ev.s && ev.e) {
          const cm = (ev.sum || '').match(/\b([A-Za-z]{3,4})\s?(\d{4})\b/);
          const code = cm ? `${cm[1].toUpperCase()} ${cm[2]}` : (ev.sum || '课程').slice(0, 24);
          const tm = (ev.sum || '').match(TYPE_RE);
          const days = ev.by ? parseDays(ev.by.replace(/,/g, ' ')) : [((ev.s.getDay() + 6) % 7) + 1];
          const start = `${pad(ev.s.getHours())}:${pad(ev.s.getMinutes())}`, end = `${pad(ev.e.getHours())}:${pad(ev.e.getMinutes())}`;
          if (toMin(end) > toMin(start)) for (const d of days) out.push({ code, type: tm ? (TYPE_CN[tm[0].toLowerCase()] || tm[0]) : '', day: d, start, end, room: ev.loc || '' });
        }
        ev = null;
      } else if (ev) {
        if (l.startsWith('SUMMARY')) ev.sum = val(l);
        else if (l.startsWith('LOCATION')) ev.loc = val(l);
        else if (l.startsWith('DTSTART')) ev.s = dt(l);
        else if (l.startsWith('DTEND')) ev.e = dt(l);
        else if (l.startsWith('RRULE')) { const b = val(l).match(/BYDAY=([A-Z,]+)/); if (b && /FREQ=WEEKLY/.test(val(l))) ev.by = b[1]; }
      }
    }
    const seen = new Set();
    return out.filter(c => { const k = `${c.code}|${c.day}|${c.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ---------- 周课表视图 ----------
  const HOUR = 54;
  Sched.render = () => {
    const body = $('#schedBody');
    const list = MC.data.courses || [];
    if (!list.length) {
      body.innerHTML = `<div class="big-empty"><span class="em-ico"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M4 10h16M9 10v10"/></svg></span>还没有课表<br><small style="color:var(--text3)">点右上角「导入」，粘贴课程表文字即可</small></div>`;
      return;
    }
    const maxDay = Math.max(5, ...list.map(c => c.day));
    const minH = Math.min(8, ...list.map(c => Math.floor(toMin(c.start) / 60)));
    const maxH = Math.max(18, ...list.map(c => Math.ceil(toMin(c.end) / 60)));
    const today = ((new Date().getDay() + 6) % 7) + 1;
    let head = '<div class="sc-corner"></div>';
    for (let d = 1; d <= maxDay; d++) head += `<div class="sc-dh${d === today ? ' today' : ''}">周${DAYS[d]}</div>`;
    let hours = '';
    for (let h = minH; h < maxH; h++) hours += `<div class="sc-hr" style="top:${(h - minH) * HOUR}px">${h}:00</div>`;
    let cols = '';
    for (let d = 1; d <= maxDay; d++) {
      const blocks = list.filter(c => c.day === d).map(c => {
        const top = (toMin(c.start) / 60 - minH) * HOUR, hgt = Math.max(22, (toMin(c.end) - toMin(c.start)) / 60 * HOUR - 2);
        return `<button class="sc-blk" data-id="${c.id}" style="top:${top}px;height:${hgt}px;--c:${colorOf(c.code)}">
          <b>${esc(c.code)}</b>${c.type ? `<span>${esc(c.type)}</span>` : ''}${hgt > 58 && c.room ? `<span>${esc(c.room)}</span>` : ''}${hgt > 44 ? `<small>${c.start}–${c.end}</small>` : ''}</button>`;
      }).join('');
      cols += `<div class="sc-col${d === today ? ' today' : ''}">${blocks}</div>`;
    }
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    const nowLine = today <= maxDay && nowMin >= minH * 60 && nowMin <= maxH * 60 ? `<div class="sc-now" style="top:${(nowMin / 60 - minH) * HOUR}px;--d:${today}"></div>` : '';
    body.innerHTML = `<div class="sc-grid" style="--days:${maxDay}">
      <div class="sc-head">${head}</div>
      <div class="sc-main" style="height:${(maxH - minH) * HOUR}px">
        <div class="sc-hours">${hours}</div><div class="sc-cols">${cols}${nowLine}</div>
        ${Array.from({ length: maxH - minH }, (_, i) => `<div class="sc-line" style="top:${i * HOUR}px"></div>`).join('')}
      </div></div>`;
    const cur = body.querySelector('.sc-now');
    if (cur && !Sched._scrolled) { Sched._scrolled = true; body.scrollTop = Math.max(0, parseFloat(cur.style.top) - 120); }
  };

  // ---------- 导入 / 编辑面板 ----------
  let parsed = [], mode = 'import', editing = null, editDay = 1;
  function openImport() {
    mode = 'import'; parsed = [];
    $('#schedTitle').textContent = '导入课表';
    $('#schedOk').textContent = '导入';
    $('#schedForm').innerHTML = `
      <ol class="steps" style="margin-bottom:6px">
        <li>在 uoZone 打开「我的课程表」，切到 <b>列表视图</b>（List View），全选并复制整页文字。</li>
        <li>粘贴到下面，App 会自动识别课程、星期、时间和教室。</li>
      </ol>
      <textarea id="schedText" rows="6" placeholder="粘贴课程表文字…&#10;也可以一行一节，例如：MAT 2348 周二 14:30-15:50 Tabaret 333"></textarea>
      <div class="btn-line"><button class="chip-btn glass" id="schedIcs">改用 .ics 文件导入</button><label class="replace-opt"><input type="checkbox" id="schedReplace" checked> 替换现有课表</label></div>
      <div id="schedPreview"></div>`;
    $('#schedText').addEventListener('input', () => { parsed = Sched.parseText($('#schedText').value); preview(); });
    $('#schedIcs').onclick = () => $('#schedFile').click();
    preview();
    UI.open('schedSheet');
  }
  function preview() {
    const el = $('#schedPreview');
    if (!parsed.length) { el.innerHTML = ''; $('#schedOk').classList.add('disabled'); return; }
    $('#schedOk').classList.remove('disabled');
    $('#schedOk').textContent = `导入 ${parsed.length} 节`;
    const sorted = [...parsed].sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));
    el.innerHTML = `<p class="hint" style="margin:10px 4px 6px">识别到 ${parsed.length} 节课，确认无误后点右上角导入：</p>
      <div class="group">${sorted.map(c => `<div class="grow sc-prev"><i style="background:${colorOf(c.code)}"></i><span><b>${esc(c.code)}</b> ${esc(c.type)}<small>周${DAYS[c.day]} ${c.start}–${c.end}${c.room ? ' · ' + esc(c.room) : ''}</small></span></div>`).join('')}</div>`;
  }
  $('#schedFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    parsed = Sched.parseICS(await f.text());
    if (!parsed.length) UI.toast('文件里没有找到课程');
    preview();
  });
  function openEdit(c) {
    mode = 'edit'; editing = c || null; editDay = c ? c.day : 1;
    $('#schedTitle').textContent = c ? '编辑课程' : '添加课程';
    $('#schedOk').textContent = '保存'; $('#schedOk').classList.remove('disabled');
    $('#schedForm').innerHTML = `
      <label class="field"><span>课程</span><input id="scCode" value="${esc(c ? c.code : '')}" placeholder="例如 MAT 2348"></label>
      <label class="field"><span>类型（选填）</span><input id="scType" value="${esc(c ? c.type : '')}" placeholder="讲座 / 实验 / 辅导"></label>
      <div class="field"><span>星期</span><div class="seg" id="scDay">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button data-d="${d}" class="${d === editDay ? 'on' : ''}">${DAYS[d]}</button>`).join('')}</div></div>
      <div class="sc-times"><label class="field"><span>开始</span><input id="scStart" type="time" value="${c ? c.start : '08:30'}"></label>
      <label class="field"><span>结束</span><input id="scEnd" type="time" value="${c ? c.end : '09:50'}"></label></div>
      <label class="field"><span>地点（选填）</span><input id="scRoom" value="${esc(c ? c.room : '')}" placeholder="例如 Tabaret Hall 333"></label>
      ${c ? '<button class="pk-clear" id="scDel">删除这节课</button>' : ''}`;
    $('#scDay').onclick = e => { const b = e.target.closest('button'); if (!b) return; editDay = Number(b.dataset.d); $('#scDay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    if (c) $('#scDel').onclick = () => { MC.setCourses(MC.data.courses.filter(x => x.id !== c.id)); UI.close('schedSheet'); UI.toast('已删除'); };
    UI.open('schedSheet');
  }
  $('#schedOk').onclick = () => {
    if (mode === 'import') {
      if (!parsed.length) return;
      const items = parsed.map(c => ({ ...c, id: MC.uid() }));
      MC.setCourses($('#schedReplace').checked ? items : [...(MC.data.courses || []), ...items]);
      UI.close('schedSheet'); UI.toast(`已导入 ${items.length} 节课`);
      return;
    }
    const code = $('#scCode').value.trim(), start = $('#scStart').value, end = $('#scEnd').value;
    if (!code) { UI.toast('请填写课程'); return; }
    if (!start || !end || toMin(end) <= toMin(start)) { UI.toast('结束时间要晚于开始时间'); return; }
    const item = { id: editing ? editing.id : MC.uid(), code, type: $('#scType').value.trim(), day: editDay, start, end, room: $('#scRoom').value.trim() };
    const list = (MC.data.courses || []).filter(x => !editing || x.id !== editing.id);
    MC.setCourses([...list, item]);
    UI.close('schedSheet'); UI.toast('已保存');
  };
  $('#schedImport').onclick = openImport;
  $('#schedAdd').onclick = () => openEdit(null);
  $('#schedBody').addEventListener('click', e => {
    const b = e.target.closest('.sc-blk'); if (!b) return;
    const c = (MC.data.courses || []).find(x => x.id === b.dataset.id); if (c) openEdit(c);
  });
})();
