/* 节律 · 课表识别：网页（复制时带过来的表格、保存下来的 .html）和照片，安卓 / iPhone / Mac 共用这一份。
   两种来源都先变成「带位置的文字块」，再用同一套规则还原成课程：
   表头里的星期 → 每一列是星期几；左边的时间 → 每一行几点；格子里的文字 → 课程、教室、类型。
   识别结果只是草稿，都会画进导入确认的课表网格，确认后才导入。 */
(() => {
  'use strict';
  const MC = window.MC, Sched = MC.Sched;
  const U = () => Sched._u;

  const RANGE = /(\d{1,2})\s*[:：.]\s*(\d{2})\s*(AM|PM)?\s*[-–—~至到]\s*(\d{1,2})\s*[:：.]\s*(\d{2})\s*(AM|PM)?/i;
  const WEEKS = /[(（\[]?\s*第?\d+(\s*[-–~]\s*\d+)?(\s*[,，]\s*\d+(\s*[-–~]\s*\d+)?)*\s*周\s*[)）\]]?|[(（\[]?[单双]周[)）\]]?/g;
  const SINGLE = /(?:^|[^\d])(\d{1,2})\s*[:：]\s*(\d{2})\s*(AM|PM)?/i;
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  const EN = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 7 };
  const FR = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 7 };
  const JA = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 7 };
  // 表头上的「周一 / 星期一 / Mon / lundi / (月)」：整格就是一个星期（去掉日期），避免把 Tutorial 当成周二
  function dayOf(text) {
    const t = String(text).replace(/\s+/g, '').replace(/\d{1,2}月\d{1,2}日|\d{1,4}[/.-]\d{1,2}([/.-]\d{1,4})?|[,，]/g, '');
    if (!t || t.length > 10) return 0;
    let m;
    if ((m = t.match(/^(?:周|週|星期|礼拜|禮拜)?([一二三四五六日天])$/))) return CN[m[1]];
    if ((m = t.match(/^(mon|tue|wed|thu|fri|sat|sun)(?:[a-z]*)\.?$/i))) return EN[m[1].toLowerCase()];
    if ((m = t.match(/^(mo|tu|we|th|fr|sa|su)\.?$/i))) return EN[m[1].toLowerCase()];
    if ((m = t.match(/^(lun|mar|mer|jeu|ven|sam|dim)(?:[a-z]*)\.?$/i))) return FR[m[1].toLowerCase()];
    if ((m = t.match(/^[(（]?([月火水木金土日])(?:曜日?)?[)）]?$/))) return JA[m[1]];
    return 0;
  }
  const cx = i => (i.x0 + i.x1) / 2, cy = i => (i.y0 + i.y1) / 2;
  const cjk = c => /[぀-ヿ一-鿿＀-￯]/.test(c || '');
  const joinTxt = (a, b) => (!a ? b : cjk(a.slice(-1)) || cjk(b[0]) ? a + b : a + ' ' + b); // 中文和中文、中文和字母数字之间不加空格（「教三301」）
  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const round5 = m => Math.round(m / 5) * 5;
  const hm = m => `${MC.pad(Math.floor(m / 60))}:${MC.pad(m % 60)}`;

  // 同一行的文字块拼成一行（照片里一个词一块；网页里一个格子的一行一块，已经是行，只排好顺序）
  function toLines(items, lineH, exact) {
    if (exact) return [...items].sort((a, b) => a.y0 - b.y0 || a.cell - b.cell || a.k - b.k);
    const out = [];
    for (const i of [...items].sort((a, b) => cy(a) - cy(b) || a.x0 - b.x0)) {
      const l = out.find(o => o.cell === i.cell && Math.abs(cy(o) - cy(i)) < lineH * 0.55);
      if (l) l.parts.push(i), Object.assign(l, { x0: Math.min(l.x0, i.x0), x1: Math.max(l.x1, i.x1), y0: Math.min(l.y0, i.y0), y1: Math.max(l.y1, i.y1) });
      else out.push({ ...i, parts: [i] });
    }
    for (const l of out) l.t = l.parts.sort((a, b) => a.x0 - b.x0).reduce((s, p) => joinTxt(s, p.t), '');
    return out.sort((a, b) => a.y0 - b.y0);
  }

  // ---------- 核心：带位置的文字块 → 课程。不是周课表（找不到一排星期表头）时返回 null ----------
  // exact = 网页表格：坐标是行列号，格子边界准确；照片的坐标是像素，只能估计
  Sched.fromLayout = (items, exact) => {
    const u = U();
    items = items.filter(i => i.t && i.t.trim());
    if (!items.length) return null;
    const lineH = exact ? 1 : median(items.map(i => i.y1 - i.y0)) || 12;
    // 1. 表头：同一高度上至少三个不同的星期，取最上面那一排
    const cands = items.map(i => ({ i, d: dayOf(i.t) })).filter(o => o.d).sort((a, b) => cy(a.i) - cy(b.i));
    let head = [];
    for (const o of cands) {
      const row = cands.filter(p => Math.abs(cy(p.i) - cy(o.i)) <= lineH * 0.7);
      if (new Set(row.map(p => p.d)).size > new Set(head.map(p => p.d)).size) head = row;
    }
    if (new Set(head.map(p => p.d)).size < 3) return null;
    let cols = [];
    for (const p of head.sort((a, b) => cx(a.i) - cx(b.i))) if (!cols.some(c => c.d === p.d)) cols.push({ d: p.d, x: cx(p.i) });
    cols = cols.filter((c, k) => !k || c.d > cols[k - 1].d); // 顺序乱了的（认错的字）不要
    if (!exact && cols.length >= 2) {
      // 照片里个别表头没认出来（比如「周五」认成乱码）：按相邻两天的列宽补上，周末窄列就不硬补了
      const steps = cols.slice(1).map((c, k) => (c.d - cols[k].d === 1 ? c.x - cols[k].x : 0)).filter(Boolean);
      const dx = median(steps);
      if (dx > 0) {
        const filled = [], maxX = Math.max(...items.map(i => i.x1));
        cols.forEach((c, k) => {
          filled.push(c);
          const nx = cols[k + 1];
          for (let d = c.d + 1, x = c.x + dx; nx ? d < nx.d && x < nx.x - dx / 2 : d <= 5 && x + dx / 2 <= maxX; d++, x += dx) filled.push({ d, x });
        });
        cols = filled;
      }
    }
    cols.forEach((c, k) => {
      const w = cols.length > 1 ? (k ? c.x - cols[k - 1].x : cols[1].x - c.x) : 1;
      c.l = k ? (cols[k - 1].x + c.x) / 2 : c.x - w / 2;
      c.r = k < cols.length - 1 ? (c.x + cols[k + 1].x) / 2 : c.x + w / 2;
    });
    const headBottom = Math.max(...head.map(p => p.i.y1)), left = cols[0].l;
    const below = items.filter(i => cy(i) > headBottom - (exact ? 0 : lineH * 0.2) && !head.some(p => p.i === i));

    // 2. 时间轴：表格左边的「8:00-8:45」「08:30」「8 AM」
    const axisLines = toLines(below.filter(i => cx(i) < left), lineH, exact);
    let anchors = [];
    for (const l of axisLines) {
      let r = l.t.match(RANGE);
      const two = !r && [...l.t.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g)];
      if (two && two.length === 2 && +two[1][1] * 60 + +two[1][2] > +two[0][1] * 60 + +two[0][2]) r = [0, two[0][1], two[0][2], '', two[1][1], two[1][2], '']; // 「08:00 08:45」
      const s = !r && l.t.match(SINGLE), h = !r && !s && l.t.match(/^(\d{1,2})\s*(AM|PM)$/i);
      if (r) anchors.push({ y0: l.y0, y1: l.y1, cell: l.cell, s: u.toMin(u.to24(r[1], r[2], r[3] || (r[6] && +r[1] <= +r[4] ? r[6] : ''))), e: u.toMin(u.to24(r[4], r[5], r[6])) });
      else if (s) anchors.push({ y0: l.y0, y1: l.y1, cell: l.cell, s: u.toMin(u.to24(s[1], s[2], s[3])) });
      else if (h) anchors.push({ y0: l.y0, y1: l.y1, cell: l.cell, s: u.toMin(u.to24(h[1], '00', h[2])) });
    }
    // 上下两行「08:00」「08:45」其实是同一节的开始和结束（同一格，或照片里挨得很近）
    const paired = [];
    for (let k = 0; k < anchors.length; k++) {
      const a = anchors[k], b = anchors[k + 1];
      if (a.e == null && b && b.e == null && b.s > a.s && b.s - a.s <= 180
        && (exact ? a.cell === b.cell : b.y0 - a.y1 < lineH * 0.8)) { paired.push({ ...a, y1: b.y1, e: b.s }); k++; }
      else paired.push(a);
    }
    anchors = paired.sort((a, b) => a.y0 - b.y0);
    const rowMode = exact || anchors.some(a => a.e != null);
    if (rowMode) anchors.forEach((a, k) => {
      // 每一节占的高度：网页就是格子本身；照片按相邻两个时间标签的中点切开（两头按相邻的间距补齐）
      const prev = anchors[k - 1], next = anchors[k + 1], gap = next ? cy(next) - cy(a) : prev ? cy(a) - cy(prev) : lineH * 3;
      a.b0 = exact ? a.y0 : prev ? (cy(prev) + cy(a)) / 2 : cy(a) - gap / 2;
      a.b1 = exact ? a.y1 : next ? (cy(a) + cy(next)) / 2 : cy(a) + gap / 2;
    });
    // 照片里只有整点刻度：按位置线性换算成时间
    let fit = null;
    if (!rowMode && anchors.length >= 2) {
      const n = anchors.length, ys = anchors.map(cy), ms = anchors.map(a => a.s);
      const my = ys.reduce((a, b) => a + b) / n, mm = ms.reduce((a, b) => a + b) / n;
      const k = ys.reduce((s, y, i) => s + (y - my) * (ms[i] - mm), 0) / (ys.reduce((s, y) => s + (y - my) ** 2, 0) || 1);
      if (k > 0) fit = y => mm + k * (y - my);
    }
    const timeOf = (y0, y1) => {
      if (rowMode && anchors.length && !exact) {
        // 照片：课表格子里的字通常居中，占两节的课，字就在两节的分界线附近。
        // 找「盖得住这块字、中线又和字的中线最接近」的连续几节（节数越少越优先）
        const c = (y0 + y1) / 2, rowH = median(anchors.map(a => a.b1 - a.b0)) || lineH * 3;
        let best = null;
        for (let i = 0; i < anchors.length; i++) for (let j = i; j < anchors.length && j < i + 6; j++) {
          if (anchors[i].b0 > y0 + rowH * 0.25 || anchors[j].b1 < y1 - rowH * 0.25) continue;
          const score = Math.abs((anchors[i].b0 + anchors[j].b1) / 2 - c) + (j - i) * rowH * 0.12;
          if (!best || score < best.score) best = { i, j, score };
        }
        if (best) {
          const a = anchors[best.i], z = anchors[best.j], next = anchors[best.j + 1];
          const e = z.e != null ? z.e : next ? next.s : a.s + 50;
          if (e > a.s) return [a.s, e];
        }
      }
      if (rowMode && anchors.length) {
        const ov = a => Math.min(a.b1, y1) - Math.max(a.b0, y0);
        let hit = anchors.filter(a => ov(a) > 0.3 * Math.min(a.b1 - a.b0, y1 - y0));
        if (!hit.length) hit = [anchors.reduce((b, a) => (Math.abs(cy(a) - (y0 + y1) / 2) < Math.abs(cy(b) - (y0 + y1) / 2) ? a : b))];
        const last = hit[hit.length - 1], next = anchors[anchors.indexOf(last) + 1];
        const s = hit[0].s, e = last.e != null ? last.e : next ? next.s : s + 50;
        return e > s ? [s, e] : null;
      }
      if (fit) { const s = round5(fit(y0)), e = Math.max(s + 30, round5(fit(y1))); return s >= 0 && e <= 24 * 60 ? [s, e] : null; }
      return null;
    };

    // 3. 每一列的格子：网页按格子分；照片按行距分，遇到新的课程编号也分开
    const out = [];
    // 照片：只看时间轴覆盖的范围（截图上下的标题栏、底部按钮、日期行都不算）
    let top = -Infinity, bottom = Infinity;
    if (!exact && rowMode && anchors.length) { top = anchors[0].b0; bottom = anchors[anchors.length - 1].b1; }
    else if (!exact && fit && anchors.length >= 2) {
      const hourPx = (cy(anchors[anchors.length - 1]) - cy(anchors[0])) / ((anchors[anchors.length - 1].s - anchors[0].s) / 60 || 1);
      top = cy(anchors[0]) - hourPx * 0.25; bottom = cy(anchors[anchors.length - 1]) + hourPx * 1.2;
    }
    const body = below.filter(i => cx(i) >= left && cy(i) >= top && cy(i) <= bottom);
    for (const col of cols) {
      const inCol = body.filter(i => (exact ? i.x0 <= col.x && i.x1 >= col.x : cx(i) >= col.l && cx(i) < col.r));
      const lines = toLines(inCol, lineH, exact);
      const blocks = [];
      // 一行以课程编号开头、这一块已经有编号了、而且后面跟着自己的上课时间或类型：是同一格里的另一节课
      // （只看编号不行：uOttawa 的教室「FSS 2005」和课程编号长得一样）
      const isCode = t => { const m = t.match(u.CODE_RE); return !!m && m.index <= 1 && !u.looksRoom(t); };
      const ownInfo = k => { for (let j = k; j < lines.length && (j === k || !isCode(lines[j].t)); j++) if (RANGE.test(lines[j].t) || /\b(Lecture|Laboratory|Lab|Tutorial|Seminar|DGD|LEC|LAB|TUT|SEM)\b/i.test(lines[j].t)) return true; return false; };
      lines.forEach((l, k) => {
        const cur = blocks[blocks.length - 1];
        const apart = !cur || (exact ? cur.cell !== l.cell : l.y0 - cur.y1 > lineH * 0.9);
        const newCode = cur && !apart && isCode(l.t) && cur.lines.some(x => isCode(x.t)) && ownInfo(k);
        if (apart || newCode) blocks.push({ cell: l.cell, y0: exact && !apart ? cur.y0 : l.y0, y1: exact && !apart ? cur.y1 : l.y1, lines: [l] });
        else { cur.lines.push(l); cur.y1 = Math.max(cur.y1, l.y1); }
      });
      for (const b of blocks) { const c = toCourse(b, col.d, timeOf); if (c) out.push(c); }
    }
    return u.dedupe(out);
  };

  function toCourse(b, day, timeOf) {
    const u = U(), full = b.lines.map(l => l.t).join(' ');
    let s, e;
    const r = full.match(RANGE);
    if (r) { s = u.toMin(u.to24(r[1], r[2], r[3] || (r[6] && +r[1] <= +r[4] ? r[6] : ''))); e = u.toMin(u.to24(r[4], r[5], r[6])); }
    if (!(e > s)) { const t = timeOf(b.y0, b.y1); if (!t) return null; [s, e] = t; }
    // 编号可能被窄格子折成两行（「MAT」「2348」）：在整块文字里找，跳过「Tabaret Hall 333」这种教室里的
    const cm = b.lines.map(l => l.t.match(u.CODE_RE)).find(m => m && m.index <= 1 && !u.looksRoom(m.input))
      || [...full.replace(RANGE, ' ').matchAll(new RegExp(u.CODE_RE.source, 'g'))].find(m => !/^(hall|room|rm|bldg)$/i.test(m[1])) || null;
    // 去掉编号、时间、周次（1-16周、单周）、英文的课程类型；中文的「实验」常常是课名或楼名的一部分，留着
    const clean = t => t.replace(cm ? cm[0] : '\0', '').replace(RANGE, '').replace(WEEKS, '')
      .replace(/\b(Lecture|Laboratory|Lab|Tutorial|Seminar|DGD|LEC|LAB|TUT|SEM)\b/gi, '').replace(/^[@＠·•\-\s]+|[\s,，]+$/g, '').trim();
    // 教室：像教室的一行；编号之后再出现的「FSS 2005」也是教室（uOttawa 的楼名缩写和课程编号长得一样）；
    // 照片里「Tabaret」「Hall 333」折成两行时接回去
    const cl = b.lines.map(l => clean(l.t));
    let ri = cl.findIndex((t, k) => u.looksRoom(t) || (cm && k > 0 && /^[A-Z]{2,5}\s?\d{3,4}[A-Z]?$/.test(t) && !b.lines[k].t.includes(cm[0])));
    let room = ri >= 0 ? cl[ri] : '';
    if (ri > 0 && /^(hall|building|pavilion|centre|center|complex)\b/i.test(room) && /^[A-Za-z][A-Za-z.'’-]+$/.test(cl[ri - 1])) room = cl[ri - 1] + ' ' + room;
    const name = cm ? `${cm[1].toUpperCase()} ${cm[2]}`
      : (b.lines.map(l => clean(l.t).replace(/\d{1,2}\s*[:：]\s*\d{2}\s*[-–—~]*/g, '').trim())
        .find(t => t && t !== room && !/^[\d\s第节()（）-]+$/.test(t) && !/^(讲座|讲课|实验|辅导|习题课|研讨|讨论课|上课)$/.test(t)) || '').slice(0, 24);
    if (!name || !/[A-Za-z\u4e00-\u9fff]{2}|[A-Za-z][\s-]?\d/.test(name)) return null;
    const tm = full.match(u.TYPE_RE), range = u.findRange(full);
    return { code: name, type: tm ? u.TYPE_CN[tm[0].toLowerCase()] || tm[0] : '', day, start: hm(s), end: hm(e), room,
      from: range ? range.from : '', to: range ? range.to : '', every: u.EVERY2.test(full) ? 2 : 1 };
  }

  // ---------- 网页：复制时剪贴板里带的 HTML，或者保存下来的 .html 文件 ----------
  const BLOCK = /^(P|DIV|LI|TR|TABLE|TBODY|THEAD|TFOOT|UL|OL|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|DL|DT|DD|BLOCKQUOTE|PRE|FORM|FIELDSET|CAPTION)$/;
  function textOf(node) { // HTML → 纯文字：块换行，格子之间用制表符（和从浏览器复制出来的文字一样）
    let out = '';
    const walk = n => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|SELECT|BUTTON)$/.test(tag) || n.hidden || /display\s*:\s*none/i.test(n.getAttribute('style') || '')) return;
      if (tag === 'BR') { out += '\n'; return; }
      const blk = BLOCK.test(tag);
      if (blk) out += '\n';
      for (const c of n.childNodes) walk(c);
      if (tag === 'TD' || tag === 'TH') out += '\t';
      if (blk) out += '\n';
    };
    walk(node);
    return out.split('\n').map(l => l.replace(/[  ]+/g, ' ').replace(/ *\t */g, '\t').replace(/^\t+|\t+$/g, '').trim()).filter(Boolean).join('\n');
  }
  // 表格展开成行列（处理跨行、跨列的格子）
  function tableCells(table) {
    const rows = [...table.rows], taken = [], cells = [];
    rows.forEach((tr, r) => {
      taken[r] = taken[r] || [];
      let c = 0;
      for (const td of tr.cells) {
        while (taken[r][c]) c++;
        const rsAttr = parseInt(td.getAttribute('rowspan'), 10);
        const rs = Math.max(1, Math.min(rsAttr === 0 ? rows.length - r : rsAttr || 1, rows.length - r)), cs = Math.max(1, Math.min(parseInt(td.getAttribute('colspan'), 10) || 1, 50));
        cells.push({ r, c, rs, cs, text: textOf(td) });
        for (let i = 0; i < rs; i++) { taken[r + i] = taken[r + i] || []; for (let j = 0; j < cs; j++) taken[r + i][c + j] = true; }
        c += cs;
      }
    });
    return cells;
  }
  const tableItems = cells => cells.flatMap((cl, id) => cl.text.split('\n').map((t, k) => ({ t: t.replace(/\t/g, ' ').trim(), x0: cl.c, x1: cl.c + cl.cs, y0: cl.r, y1: cl.r + cl.rs, cell: id, k })));
  const tableTSV = cells => {
    const rows = [];
    for (const cl of cells) (rows[cl.r] = rows[cl.r] || []).push(cl.text.replace(/\s*\n\s*/g, ' '));
    return rows.filter(Boolean).map(r => r.join('\t')).join('\n');
  };
  // 专门适配的网站：先用它们的规则；以后换了学校、读不准，再在这里加一个
  const ADAPTERS = [
    { name: 'uoZone', // uOttawa（PeopleSoft 选课系统）：列表视图的文字已经有专门的规则
      test: html => /uozone|uottawa|PeopleSoft|PSPAGE|DERIVED_REGFRM1|SSR_DUMMY_RECV/i.test(html),
      read: doc => Sched.parseText(textOf(doc.body)) },
  ];
  // 返回 { list, kind }：kind = site（专门适配）/ grid（周课表格子）/ text（按文字）
  Sched.readHTML = html => {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    if (!doc.body) return { list: [], kind: 'text' };
    for (const a of ADAPTERS) if (a.test(html)) { const list = a.read(doc); if (list.length) return { list, kind: 'site', site: a.name }; }
    let best = [];
    const tables = [...doc.querySelectorAll('table')].map(tableCells).filter(c => c.length >= 4);
    for (const cells of tables) { const r = Sched.fromLayout(tableItems(cells), true); if (r && r.length > best.length) best = r; }
    if (best.length) return { list: best, kind: 'grid' };
    for (const cells of tables) { const r = Sched.parseText(tableTSV(cells)); if (r.length > best.length) best = r; }
    const r = Sched.parseText(textOf(doc.body));
    return { list: r.length > best.length ? r : best, kind: 'text' };
  };

  // ---------- 照片：在网页里识别文字（三端同一个识别引擎，结果一致），第一次用时下载识别模型 ----------
  let tessP = null;
  const loadTess = () => tessP || (tessP = new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => (window.Tesseract ? ok(window.Tesseract) : bad(new Error('load')));
    s.onerror = () => { tessP = null; s.remove(); bad(new Error('load')); };
    document.head.appendChild(s);
  }));
  // 太小的截图放大一点、太大的照片缩小一点，识别更准也更快
  // local = 按周围亮度分黑白（浅灰小字、深色模式更好）；否则只拉开对比（彩色底的表格更好）
  async function prepImage(file, local) {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    const k = long < 1400 ? 2 : long > 2600 ? 2600 / long : 1;
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(bmp, 0, 0, cv.width, cv.height);
    // 变成黑白：每个点和周围一小片的平均亮度比，明显更暗的是字。彩色的课程底色、浅灰的小字都能分清；
    // 深色模式的截图先反相成白底黑字
    const W = cv.width, H = cv.height, im = g.getImageData(0, 0, W, H), d = im.data, v = new Float32Array(W * H);
    let sum = 0;
    for (let i = 0, p = 0; p < v.length; i += 4, p++) sum += v[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (sum / v.length < 110) for (let p = 0; p < v.length; p++) v[p] = 255 - v[p];
    if (!local) { // 70 以下全黑，200 以上全白
      for (let p = 0, o = 0; p < v.length; p++, o += 4) d[o] = d[o + 1] = d[o + 2] = Math.max(0, Math.min(255, (v[p] - 70) * 255 / 130));
      g.putImageData(im, 0, 0);
      return cv;
    }
    const ii = new Float64Array((W + 1) * (H + 1)); // 积分图，算一片区域的平均值只要四次加减
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += v[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
    const R = Math.max(8, Math.round(Math.min(W, H) / 60));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const mean = (ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const o = (y * W + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v[y * W + x] < mean * 0.86 ? 0 : 255;
    }
    g.putImageData(im, 0, 0);
    return cv;
  }
  // onProgress(阶段, 0–1)：阶段 = load（下载模型）/ read（识别中）
  Sched.readImage = async (file, onProgress) => {
    const T = await loadTess();
    let pass = 0; // 识别两遍，进度合成一条
    const worker = await T.createWorker(['chi_sim', 'eng'], 1, {
      logger: m => onProgress && (/recogni/.test(m.status) ? onProgress('read', (pass + (m.progress || 0)) / 2) : onProgress('load', m.progress || 0)),
    });
    const once = async local => {
      const { data } = await worker.recognize(await prepImage(file, local), {}, { blocks: true, text: true });
      let words = [];
      for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) words.push(...(l.words || []));
      if (!words.length && data.words) words = data.words;
      const items = words.filter(w => w.confidence > 35 && /[\p{L}\p{N}]/u.test(w.text))
        .map(w => ({ t: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
      const grid = Sched.fromLayout(items, false);
      if (grid && grid.length) return grid;
      // 不是格子（比如列表截图）：按行拼成文字，交给粘贴文字的规则
      const lineH = median(items.map(i => i.y1 - i.y0)) || 12;
      return Sched.parseText(toLines(items, lineH).map(l => l.parts.reduce((s, p, k) => (!k ? p.t : p.x0 - l.parts[k - 1].x1 > lineH * 1.5 ? s + '\t' + p.t : joinTxt(s, p.t)), '')).join('\n'));
    };
    // 认得好不好：课程名像样（编号或两个以上的字）、有教室，加分
    const score = l => l.reduce((n, c) => n + (U().CODE_RE.test(c.code) || /[\u4e00-\u9fff]{2}/.test(c.code) ? 1 : 0.2) + (c.room ? 0.4 : 0), 0);
    try {
      const a = await once(false); pass = 1;
      const b = await once(true);
      return score(b) > score(a) ? b : a;
    } finally {
      worker.terminate();
    }
  };
})();
