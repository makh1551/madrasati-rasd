/*
 * محرك الرصد السريع — يعمل داخل صفحة منصة مدرستي (MAIN world)
 * فحص ← معاينة ← رصد متوازٍ مع إعادة محاولة ← تحقق ← صورة نسب الرصد
 */
(function () {
  'use strict';
  var W = window;
  if (W.__smEngine) return;

  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  var REASON_DEFAULT = 'رصد وتأكيد الحضور والغياب';

  /* ================= أدوات عامة ================= */
  function norm(s) {
    return (s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, ' ').trim();
  }
  function slash(d) { return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
  function fromYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); return x; }
  function weekOffset(ws) { var cur = weekStart(new Date()); return Math.round((ws - cur) / (7 * 86400000)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function token(doc) {
    var el = (doc || document).querySelector('input[name="__RequestVerificationToken"]');
    return el ? el.value : (document.querySelector('input[name="__RequestVerificationToken"]') || {}).value || '';
  }
  async function pool(items, n, fn) {
    var i = 0;
    async function worker() { while (i < items.length) { var k = i++; await fn(items[k], k); } }
    var ws = []; for (var j = 0; j < Math.max(1, n); j++) ws.push(worker());
    await Promise.all(ws);
  }

  /* ================= جلب البيانات ================= */
  function classesFromDom() {
    var map = new Map();
    var cards = Array.from(document.querySelectorAll('#divSearchClassroomResultId .dga-defualt-card, .dga-defualt-card'));
    cards.forEach(function (c) {
      if (c.querySelector('.dga-defualt-card')) return;
      var a = c.querySelector('a[href*="ClassRoomSchedule"]') || c.querySelector('a[href*="/TimeStructure/TimeTable/Index/"]') || c.querySelector('a[href*="/SchoolStructure/Classrooms/Students/"]');
      if (!a) return;
      var h = c.querySelector('h4, h5, h6, .card-title, .mb-1, strong');
      var raw = h ? h.innerText.trim() : '';
      var name = raw.replace(/المرحلة\s+[^-\n]+[-–]/g, '').replace(/مقررات\s+العام\s+الدراسي\s*[-–]?\s*/g, '').replace(/الصف\s+/g, '').replace(/\s+/g, ' ').trim() || raw;
      var href = a.getAttribute('href') || '';
      var m1 = href.match(/(?:[?&]ClassRoomId=|\/(?:Index|Students|Teachers)\/)([A-Fa-f0-9]{32})(?:[&#/]|$)/i);
      var m2 = href.match(/[?&]classRoomId=(\d+)(?:[&#]|$)/i) || href.match(/\/Classrooms\/(\d+)(?:[&#/]|$)/i);
      var enc = m1 ? m1[1] : '', num = !enc && m2 ? m2[1] : '';
      var key = enc || num || name;
      if (key && !map.has(key)) map.set(key, { numericId: num, encId: enc, name: name || 'فصل' });
    });
    return map;
  }
  async function getClassrooms(school, isCurrent) {
    var map = isCurrent ? classesFromDom() : new Map();
    try {
      var r = await fetch('/SchoolManagmentReports/StudentStatistics/GetClassRooms', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ schoolId: school.id, treeId: '2' }).toString()
      });
      if (r.ok) {
        var list = await r.json();
        if (Array.isArray(list)) list.forEach(function (x) {
          var name = (x.Title || x.Name || '').trim(), id = x.Id ? String(x.Id).trim() : '', enc = x.Id_Enc || '';
          var hit = null;
          map.forEach(function (c) {
            if (hit) return;
            if ((enc && c.encId && c.encId.toLowerCase() === enc.toLowerCase()) || (name && c.name && (name.indexOf(c.name) > -1 || c.name.indexOf(name) > -1))) hit = c;
          });
          if (hit) { if (id) hit.numericId = id; if (enc && !hit.encId) hit.encId = enc; }
          else if (name || id) map.set(enc || id || name, { numericId: id, encId: enc, name: name || 'فصل' });
        });
      }
    } catch (e) { console.warn('[رصد] GetClassRooms', e); }
    return Array.from(map.values());
  }
  async function numericId(school, c) {
    if (c.numericId && /^\d+$/.test(c.numericId)) return c.numericId;
    if (!c.encId) return '';
    try {
      var r = await fetch('/SchoolSchedule/Schedule/ClassRoomSchedule?SchoolId=' + encodeURIComponent(school.id) + '&ClassRoomId=' + encodeURIComponent(c.encId) + '&ClassroomType=1', { credentials: 'include' });
      if (r.ok) {
        var t = await r.text();
        var m = t.match(/id=["']ClassRooms["'][^>]*value=["'](\d+)["']/i) || t.match(/value=["'](\d+)["'][^>]*id=["']ClassRooms["']/i) ||
                t.match(/name=["']ClassRooms["'][^>]*value=["'](\d+)["']/i) || t.match(/<option[^>]*value=["'](\d+)["'][^>]*selected/i) || t.match(/[?&]classRoomId=(\d+)(?:[&#]|$)/i);
        if (m) c.numericId = m[1];
      }
    } catch (e) {}
    return c.numericId || '';
  }
  async function getWeek(school, c, ws) {
    var id = await numericId(school, c);
    if (!id) return [];
    var url = '/SchoolSchedule/Schedule/GetClassRoomSchedule?SchoolId=' + encodeURIComponent(school.id) + '&classRoomId=' + encodeURIComponent(id) +
      '&week=' + weekOffset(ws) + '&ScheduleDate=' + encodeURIComponent(slash(ws));
    var h = { Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' }, tk = token();
    if (tk) h.RequestVerificationToken = tk;
    var r = await fetch(url, { method: 'POST', credentials: 'include', headers: h });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var txt = await r.text(), html = txt;
    try { var j = JSON.parse(txt); html = j.html || (typeof j === 'string' ? j : ''); } catch (e) {}
    if (!html) return [];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var table = doc.querySelector('table.schedule-table, table');
    if (!table) return [];
    var out = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      var first = tr.querySelector('td, th'), ft = first ? (first.textContent || '').trim() : '';
      var dn = DAYS.find(function (x) { return ft.indexOf(x) > -1; });
      if (!dn) return;
      var di = DAYS.indexOf(dn), dd = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + di);
      var slot = 0;
      Array.from(tr.querySelectorAll('td, th')).slice(1).forEach(function (td) {
        var t = (td.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.indexOf('(راحة)') > -1 || t.indexOf('(نشاط)') > -1) return;
        slot++;
        var aView = td.querySelector('a[href*="/AttendStudents/View"]'), aDir = td.querySelector('a[href*="/AttendStudents/IndexDirector"]');
        var unrec = t.indexOf('لم يتم الرصد') > -1 || !!td.querySelector('.absent-student, .bg-danger, .text-danger') || !!aDir || t.indexOf('رصد الحضور') > -1;
        var rec = (t.indexOf('تم الرصد') > -1 && t.indexOf('لم يتم الرصد') < 0) || !!td.querySelector('.attend-student, .bg-success, .text-success') || t.indexOf('عرض الحضور') > -1;
        var href = (aDir && aDir.getAttribute('href')) || (aView && aView.getAttribute('href')) || '';
        var g = function (k) { var m = href.match(new RegExp(k + '=([^&]+)', 'i')); return m ? m[1] : ''; };
        var a0 = td.querySelector('a');
        var title = (a0 && a0.textContent.trim()) || t.replace(/(لم يتم الرصد|تم الرصد|رصد الحضور|عرض الحضور)/g, '').trim() || ('حصة ' + slot);
        var info = t.replace(/(لم يتم الرصد|تم الرصد|رصد الحضور|عرض الحضور)/g, '').replace(title, '').replace(/\s+/g, ' ').trim();
        out.push({
          school: school, classroom: c.name, numericClassId: id, encClassId: c.encId,
          dayName: dn, dateStr: slash(dd), slot: slot, title: title, info: info,
          isRecorded: !unrec && rec, idSchedule: g('IdSchedule'), dateAttendTicks: g('dateAttend'),
          teacherId: g('teacherId'), lectureClassId: g('lectureClassId'), href: href
        });
      });
    });
    return out;
  }

  /* ================= رصد حصة واحدة ================= */
  async function recordOne(p, reason, absNames, stats) {
    if (!p.idSchedule) throw new Error('معرف الحصة غير متوفر');
    var sid = p.school.id, href = p.href || '';
    if (href.indexOf('/AttendStudents/View') > -1) {
      try {
        var rv = await fetch(href, { credentials: 'include', headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } });
        if (rv.ok) {
          var tv = await rv.text(), dv = new DOMParser().parseFromString(tv, 'text/html');
          var ad = dv.querySelector('a[href*="/AttendStudents/IndexDirector"]');
          if (ad) href = ad.getAttribute('href');
          else {
            var mt = tv.match(/teacherId=([A-Fa-f0-9]{32})/i) || tv.match(/var\s+teacherId\s*=\s*['"]([^'"]+)['"]/i);
            if (mt && !p.teacherId) p.teacherId = mt[1];
            var ml = tv.match(/lectureClassId=([A-Fa-f0-9]{32})/i) || tv.match(/var\s+LectureClassId\s*=\s*['"]([^'"]+)['"]/i);
            if (ml && !p.lectureClassId) p.lectureClassId = ml[1];
          }
        }
      } catch (e) {}
    }
    if (!href || href.indexOf('/AttendStudents/IndexDirector') < 0) {
      href = '/SchoolSchedule/AttendStudents/IndexDirector/' + encodeURIComponent(sid) + '?IdSchedule=' + encodeURIComponent(p.idSchedule) +
        '&dateAttend=' + encodeURIComponent(p.dateAttendTicks || '') + '&teacherId=' + encodeURIComponent(p.teacherId || '') +
        '&lectureClassId=' + encodeURIComponent(p.lectureClassId || '');
    }
    var r = await fetch(href, { credentials: 'include', headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) throw new Error('تعذر فتح صفحة الرصد (' + r.status + ')');
    var page = await r.text(), doc = new DOMParser().parseFromString(page, 'text/html');
    var SEL = 'form#SaveAttendStudents, form#UpdateAttendStudents, form[action*="SaveAttendStudents"]';
    var form = doc.querySelector(SEL);
    if (!form) {
      var v = function (k) { var m = page.match(new RegExp('var\\s+' + k + '\\s*=\\s*[\'"]([^\'"]*)[\'"]', 'i')); return m ? m[1] : ''; };
      var mu = page.match(/var\s+getAttendStudentsUrl\s*=\s*['"]([^'"]+)['"]/i);
      var u = mu ? mu[1] : '/SchoolSchedule/AttendStudents/GetAttendStudents?schoolId=' + encodeURIComponent(sid) + '&IdSchedule=' + encodeURIComponent(p.idSchedule) + '&teacherId=' + encodeURIComponent(p.teacherId || '');
      var add = function (k, val) { if (u.indexOf(k + '=') < 0) u += '&' + k + '=' + encodeURIComponent(val); };
      add('classRoomId', v('classRoomId') || p.numericClassId || '');
      add('subjectId', v('subjectId') || '');
      add('lectureId', v('lectureId') || p.slot || '1');
      add('studentAttendDateTicks', v('dateAttendTicks') || p.dateAttendTicks || '');
      add('lectureClassId', v('lectureClassIdVal') || v('lectureClassId') || p.lectureClassId || '');
      var hh = { Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' }, tk = token(doc);
      if (tk) hh.RequestVerificationToken = tk;
      var r2 = await fetch(u, { method: 'POST', credentials: 'include', headers: hh });
      if (r2.ok) {
        var t2 = await r2.text(), h2 = t2;
        try { var j2 = JSON.parse(t2); h2 = j2.html || (typeof j2 === 'string' ? j2 : ''); } catch (e) {}
        if (h2) { var d2 = new DOMParser().parseFromString(h2, 'text/html'); var f2 = d2.querySelector(SEL); if (f2) { form = f2; doc = d2; } }
      }
    }
    if (!form) throw new Error('لم يُعثر على نموذج الرصد');

    var body = new URLSearchParams(), seen = new Set(), localAbs = {}, localNo = 0;
    var ABS = norm('غائب'), EXC = norm('عذر');
    form.querySelectorAll('input').forEach(function (inp) {
      var n = inp.name, ty = (inp.type || '').toLowerCase();
      if (!n) return;
      if (ty === 'hidden' || ty === 'text') { body.append(n, inp.value || ''); return; }
      if (ty !== 'radio' || seen.has(n)) return;
      seen.add(n);
      if (/\.AttendStatusId$/.test(n) || n.indexOf('Attend[') === 0) {
        var val = '0';
        if (absNames.length) {
          var row = inp.closest('tr'), rt = row ? norm(row.textContent) : '';
          var hit = absNames.find(function (x) { return rt.indexOf(x) > -1; });
          if (hit) {
            var opts = Array.from(form.querySelectorAll('input[type=radio]')).filter(function (x) { return x.name === n; });
            var lab = function (x) {
              var l = x.id && form.querySelector('label[for="' + CSS.escape(x.id) + '"]');
              return norm((l && l.textContent) || (x.closest('label') && x.closest('label').textContent) || (x.nextSibling && x.nextSibling.textContent) || x.title || '');
            };
            var ab = opts.find(function (x) { var t = lab(x); return t.indexOf(ABS) > -1 && t.indexOf(EXC) < 0; }) || opts.find(function (x) { return lab(x).indexOf(ABS) > -1; });
            if (ab) { val = ab.value; localAbs[hit] = (localAbs[hit] || 0) + 1; } else localNo++;
          }
        }
        body.append(n, val);
      } else {
        var ck = form.querySelector('input[name="' + CSS.escape(n) + '"]:checked');
        body.append(n, ck ? ck.value : inp.value);
      }
    });
    var tok = token(doc);
    if (tok && !body.has('__RequestVerificationToken')) body.append('__RequestVerificationToken', tok);
    body.set('DirectorRecordReason', reason); body.set('editReason', reason); body.set('Reason', reason);
    var action = form.getAttribute('action') || '/SchoolSchedule/AttendStudents/SaveAttendStudents';
    if (!/^https?:/.test(action) && action[0] !== '/') action = '/' + action;
    var rs = await fetch(action, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: body.toString()
    });
    var rt = await rs.text().catch(function () { return ''; }), js = null;
    try { js = JSON.parse(rt); } catch (e) {}
    var ok = (rs.ok || rs.redirected) && (!js || ((js.result || {}).status !== false && js.status !== false));
    if (!ok) throw new Error((js && ((js.result || {}).msg || js.msg)) || ('رمز ' + rs.status));
    Object.keys(localAbs).forEach(function (k) { stats.absent[k] = (stats.absent[k] || 0) + localAbs[k]; });
    stats.noAbsentOption += localNo;
    p.isRecorded = true;
    return true;
  }

  /* ================= الواجهة ================= */
  var S = { cfg: null, periods: [], scanErrors: [], busy: false, stats: null, failed: [] };
  var root, $ = function (id) { return document.getElementById(id); };

  function css() {
    if ($('sme-style')) return;
    var st = document.createElement('style'); st.id = 'sme-style';
    st.textContent =
      '#sme{position:fixed;inset:0;z-index:2147483002;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;font:13px Tahoma,"Segoe UI",sans-serif;direction:rtl}' +
      '#sme .card{background:#0f172a;color:#e2e8f0;width:min(980px,96vw);height:min(92vh,900px);border:1px solid #334155;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
      '#sme header{padding:12px 18px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#1e293b,#0f172a)}' +
      '#sme header b{font-size:15px;color:#38bdf8}#sme header small{color:#94a3b8;display:block;margin-top:2px}' +
      '#sme .x{background:none;border:0;color:#94a3b8;font-size:24px;cursor:pointer}' +
      '#sme .bar{padding:10px 18px;border-bottom:1px solid #1e293b;display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#111827}' +
      '#sme .chip{padding:3px 9px;border-radius:6px;font-size:12px;border:1px solid #334155}' +
      '#sme .ok{color:#34d399;border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.08)}#sme .bad{color:#f87171;border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.08)}' +
      '#sme .prog{height:6px;background:#334155;border-radius:3px;overflow:hidden;flex:1;min-width:120px}#sme .prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#0284c7,#10b981);transition:width .2s}' +
      '#sme .body{flex:1;overflow:auto;padding:10px 18px}' +
      '#sme .grp{margin:10px 0 4px;color:#38bdf8;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}' +
      '#sme .grp label{font-weight:normal;color:#94a3b8;font-size:12px;cursor:pointer}' +
      '#sme table{width:100%;border-collapse:collapse;font-size:12.5px}#sme td{padding:6px 8px;border-bottom:1px solid #1e293b;vertical-align:middle}' +
      '#sme tr.done td{opacity:.55}#sme tr.fail td{background:rgba(239,68,68,.08)}#sme td.s{white-space:nowrap;color:#94a3b8;font-size:11.5px}' +
      '#sme footer{padding:10px 18px;border-top:1px solid #334155;display:flex;gap:8px;flex-wrap:wrap;background:#0b1222}' +
      '#sme button.b{border:0;border-radius:8px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}' +
      '#sme .go{background:#10b981;color:#fff}#sme .sec{background:#334155;color:#e2e8f0}#sme .pic{background:#0284c7;color:#fff}#sme button:disabled{opacity:.5;cursor:default}' +
      '#sme .msg{text-align:center;padding:60px 20px;color:#94a3b8}#sme .msg h4{color:#f8fafc;margin:0 0 6px}';
    document.head.appendChild(st);
  }
  function shell() {
    css();
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'sme';
    root.innerHTML =
      '<div class="card"><header><div><b>⚡ رصد الحضور السريع</b><small id="sme-sub"></small></div><button class="x" id="sme-x">&times;</button></header>' +
      '<div class="bar"><span id="sme-chips"></span><div class="prog"><i id="sme-p"></i></div><span id="sme-ptxt" style="color:#94a3b8;font-size:12px"></span></div>' +
      '<div class="body" id="sme-body"><div class="msg"><h4>جاري الفحص…</h4></div></div>' +
      '<footer id="sme-foot"></footer></div>';
    document.body.appendChild(root);
    $('sme-x').onclick = function () { if (S.busy && !confirm('الرصد جارٍ. إغلاق النافذة لن يوقفه. إغلاق؟')) return; root.remove(); root = null; };
  }
  function progress(done, total, txt) {
    var pc = total ? Math.round(done / total * 100) : 0;
    if ($('sme-p')) $('sme-p').style.width = pc + '%';
    if ($('sme-ptxt')) $('sme-ptxt').textContent = (txt || '') + (total ? ' ' + done + '/' + total : '');
  }
  function chips() {
    var all = S.periods, rec = all.filter(function (p) { return p.isRecorded; }).length;
    var pct = all.length ? Math.round(rec / all.length * 100) : 0;
    $('sme-chips').innerHTML =
      '<span class="chip">الحصص: ' + all.length + '</span> <span class="chip ok">مرصودة: ' + rec + '</span> ' +
      '<span class="chip bad">غير مرصودة: ' + (all.length - rec) + '</span> <span class="chip">الإنجاز: ' + pct + '%</span>' +
      (S.scanErrors.length ? ' <span class="chip bad">تعذّر فحص ' + S.scanErrors.length + ' فصل</span>' : '');
  }

  /* ---------- 1) الفحص ---------- */
  async function scan() {
    var cfg = S.cfg, dates = cfg.dates.map(fromYmd), wanted = {};
    dates.forEach(function (d) { wanted[slash(d)] = true; });
    var weeks = {}; dates.forEach(function (d) { var ws = weekStart(d); weeks[slash(ws)] = ws; });
    var jobs = [];
    S.periods = []; S.scanErrors = [];
    for (var si = 0; si < cfg.schools.length; si++) {
      var sc = cfg.schools[si];
      progress(0, 0, 'جاري جلب فصول ' + sc.name + '…');
      var cls = await getClassrooms(sc, sc.id === cfg.currentSchoolId);
      if (!cls.length) S.scanErrors.push({ school: sc.name, classroom: 'كل الفصول', err: 'لم تُرجع المنصة فصولاً لهذه المدرسة' });
      cls.forEach(function (c) { Object.keys(weeks).forEach(function (k) { jobs.push({ sc: sc, c: c, ws: weeks[k] }); }); });
    }
    var done = 0;
    await pool(jobs, Math.min(6, cfg.concurrency + 2), async function (j) {
      for (var t = 0; t < 3; t++) {
        try {
          var list = await getWeek(j.sc, j.c, j.ws);
          list.forEach(function (p) { if (wanted[p.dateStr]) S.periods.push(p); });
          break;
        } catch (e) { if (t === 2) S.scanErrors.push({ school: j.sc.name, classroom: j.c.name, err: e.message }); else await sleep(800); }
      }
      progress(++done, jobs.length, 'فحص الجداول');
    });
    var order = {}; cfg.schools.forEach(function (s, i) { order[s.id] = i; });
    S.periods.sort(function (a, b) {
      return (order[a.school.id] - order[b.school.id]) || a.dateStr.localeCompare(b.dateStr) || a.classroom.localeCompare(b.classroom, 'ar') || a.slot - b.slot;
    });
  }

  /* ---------- 2) المعاينة ---------- */
  function renderPreview() {
    chips();
    var un = S.periods.filter(function (p) { return !p.isRecorded; });
    var body = $('sme-body'), foot = $('sme-foot');
    if (!S.periods.length) {
      body.innerHTML = '<div class="msg"><h4>لم يُعثر على حصص في الأيام المحددة</h4>تأكد من الأيام، ومن تسجيل الدخول بحساب المدير.</div>';
    } else if (!un.length) {
      body.innerHTML = '<div class="msg"><h4>✅ كل الحصص مرصودة</h4>لا توجد حصص غير مرصودة في الأيام المحددة.</div>';
    } else {
      var html = '', key = '';
      un.forEach(function (p, i) {
        var k = p.school.id + '|' + p.dateStr;
        if (k !== key) {
          if (key) html += '</table>';
          key = k;
          html += '<div class="grp"><span>' + esc(p.school.name) + ' — ' + esc(p.dayName) + ' ' + esc(p.dateStr) + '</span>' +
            '<label><input type="checkbox" class="sme-g" data-k="' + esc(k) + '" checked> تحديد اليوم</label></div><table>';
        }
        html += '<tr id="sme-r' + i + '"><td style="width:28px"><input type="checkbox" class="sme-c" data-i="' + i + '" data-k="' + esc(k) + '" checked></td>' +
          '<td><b>' + esc(p.classroom) + '</b></td><td class="s">الحصة ' + p.slot + '</td><td>' + esc(p.title) + '</td><td class="s">' + esc(p.info) + '</td></tr>';
      });
      body.innerHTML = html + '</table>';
      body.querySelectorAll('.sme-g').forEach(function (g) {
        g.onchange = function () { body.querySelectorAll('.sme-c[data-k="' + g.dataset.k + '"]').forEach(function (c) { c.checked = g.checked; }); count(); };
      });
      body.querySelectorAll('.sme-c').forEach(function (c) { c.onchange = count; });
    }
    if (S.scanErrors.length) {
      body.innerHTML += '<div class="grp" style="color:#f87171">تعذّر الفحص</div><table>' + S.scanErrors.map(function (e) {
        return '<tr><td>' + esc(e.school) + '</td><td>' + esc(e.classroom) + '</td><td class="s">' + esc(e.err) + '</td></tr>';
      }).join('') + '</table>';
    }
    foot.innerHTML =
      (un.length ? '<button class="b go" id="sme-go">⚡ رصد المحدد (<span id="sme-n">0</span>)</button>' +
        '<button class="b sec" id="sme-all">تحديد الكل</button><button class="b sec" id="sme-none">إلغاء التحديد</button>' : '') +
      '<button class="b pic" id="sme-img">🖼️ صورة نسب الرصد</button>';
    if (un.length) {
      $('sme-go').onclick = function () { runSelected(un); };
      $('sme-all').onclick = function () { setAll(true); };
      $('sme-none').onclick = function () { setAll(false); };
      count();
    }
    $('sme-img').onclick = makeImage;
    progress(0, 0, '');
    function setAll(v) { body.querySelectorAll('.sme-c, .sme-g').forEach(function (c) { c.checked = v; }); count(); }
    function count() { if ($('sme-n')) $('sme-n').textContent = body.querySelectorAll('.sme-c:checked').length; }
  }

  /* ---------- 3) الرصد مع إعادة المحاولة والتحقق ---------- */
  async function runSelected(un) {
    var picked = Array.from($('sme-body').querySelectorAll('.sme-c:checked')).map(function (c) { return +c.dataset.i; });
    if (!picked.length) { alert('حدّد حصة واحدة على الأقل.'); return; }
    var cfg = S.cfg;
    var msg = 'سيتم رصد ' + picked.length + ' حصة' + (cfg.schools.length > 1 ? ' في ' + cfg.schools.length + ' مدرسة' : '') + '.\n' +
      (cfg.absNames.length ? '⚠️ الغائبون (' + cfg.absNames.length + ') يُرصدون غائبين، والباقون حاضرين.' : 'جميع الطلاب يُرصدون حاضرين.') + '\n\nمتابعة؟';
    if (!confirm(msg)) return;
    S.busy = true; S.stats = { absent: {}, noAbsentOption: 0 };
    $('sme-foot').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    $('sme-body').querySelectorAll('input').forEach(function (b) { b.disabled = true; });
    var items = picked.map(function (i) { return { p: un[i], i: i, err: '' }; });
    var done = 0;

    async function attempt(list, label) {
      done = 0;
      await pool(list, cfg.concurrency, async function (it) {
        for (var t = 0; t < 3; t++) {
          try { await recordOne(it.p, cfg.reason, cfg.absNames, S.stats); it.err = ''; break; }
          catch (e) { it.err = e.message || String(e); await sleep(1200 * (t + 1)); }
        }
        var row = $('sme-r' + it.i);
        if (row) { row.className = it.err ? 'fail' : 'done'; row.cells[0].innerHTML = it.err ? '❌' : '✅'; if (it.err) row.cells[4].textContent = it.err; }
        progress(++done, list.length, label);
        chips();
      });
    }
    await attempt(items, 'جاري الرصد');

    // التحقق: إعادة فحص الفصول المعنية والتأكد من الحفظ فعلاً
    progress(0, 0, 'جاري التحقق من الحفظ…');
    var groups = {};
    items.forEach(function (it) { if (!it.err) { var ws = weekStart(fromYmd(it.p.dateStr.replace(/\//g, '-'))); var k = it.p.school.id + '|' + it.p.numericClassId + '|' + slash(ws); (groups[k] = groups[k] || { it: [], ws: ws }).it.push(it); } });
    var notSaved = [];
    await pool(Object.keys(groups), Math.min(6, cfg.concurrency + 2), async function (k) {
      var g = groups[k], p0 = g.it[0].p;
      try {
        var fresh = await getWeek(p0.school, { name: p0.classroom, numericId: p0.numericClassId, encId: p0.encClassId }, g.ws);
        g.it.forEach(function (it) {
          var f = fresh.find(function (x) { return x.idSchedule === it.p.idSchedule && x.dateStr === it.p.dateStr; });
          if (f && !f.isRecorded) { it.err = 'لم يظهر كمرصود بعد الحفظ'; it.p.isRecorded = false; Object.assign(it.p, { href: f.href, dateAttendTicks: f.dateAttendTicks, teacherId: f.teacherId, lectureClassId: f.lectureClassId }); notSaved.push(it); }
        });
      } catch (e) {}
    });
    var retry = items.filter(function (it) { return it.err; });
    if (retry.length) await attempt(retry, 'إعادة محاولة الفاشل');

    S.busy = false;
    S.failed = items.filter(function (it) { return it.err; });
    var ok = items.length - S.failed.length;
    chips();
    var absTxt = '';
    if (cfg.absNames.length) {
      absTxt = '<div style="margin-top:8px;font-size:12px;color:#cbd5e1">' + cfg.absNames.map(function (n, i) {
        var c = S.stats.absent[n]; return (c ? '✅ ' : '❌ ') + esc(cfg.absRaw[i]) + (c ? ' — غائب في ' + c + ' حصة' : ' — لم يُعثر عليه');
      }).join('<br>') + (S.stats.noAbsentOption ? '<br>⚠️ تعذّر تحديد خيار «غائب» في ' + S.stats.noAbsentOption + ' حالة' : '') + '</div>';
    }
    $('sme-body').insertAdjacentHTML('afterbegin',
      '<div style="padding:12px;border:1px solid ' + (S.failed.length ? '#f59e0b' : '#10b981') + ';border-radius:10px;margin:6px 0 10px;background:rgba(16,185,129,.06)">' +
      '<b>' + (S.failed.length ? '⚠️' : '🎉') + ' تم رصد ' + ok + ' من ' + items.length + ' حصة' + (S.failed.length ? '، وتعذّر ' + S.failed.length : '') + '</b>' + absTxt + '</div>');
    $('sme-body').scrollTop = 0;
    $('sme-foot').innerHTML = (S.failed.length ? '<button class="b go" id="sme-rf">🔁 إعادة محاولة الفاشل (' + S.failed.length + ')</button>' : '') +
      '<button class="b pic" id="sme-img">🖼️ صورة نسب الرصد</button><button class="b sec" id="sme-re">🔄 فحص من جديد</button>';
    if (S.failed.length) $('sme-rf').onclick = function () { var f = S.failed.map(function (x) { return x.p; }); runList(f); };
    $('sme-img').onclick = makeImage;
    $('sme-re').onclick = start;
    progress(1, 1, 'اكتمل');
  }
  function runList(list) {
    // إعادة عرض قائمة الفاشل فقط ثم رصدها
    var keep = S.periods; S.periods = keep;
    var body = $('sme-body');
    var html = '<div class="grp"><span>الحصص الفاشلة</span></div><table>';
    list.forEach(function (p, i) { html += '<tr id="sme-r' + i + '"><td style="width:28px"><input type="checkbox" class="sme-c" data-i="' + i + '" checked></td><td><b>' + esc(p.classroom) + '</b></td><td class="s">' + esc(p.dayName) + ' — الحصة ' + p.slot + '</td><td>' + esc(p.title) + '</td><td class="s"></td></tr>'; });
    body.innerHTML = html + '</table>';
    runSelected(list);
  }

  /* ---------- 4) صورة نسب الرصد ---------- */
  function makeImage() {
    if (!S.periods.length) { alert('لا توجد بيانات.'); return; }
    var bySchool = {};
    S.periods.forEach(function (p) {
      var s = bySchool[p.school.id] = bySchool[p.school.id] || { name: p.school.name, total: 0, rec: 0, cls: {} };
      var c = s.cls[p.classroom] = s.cls[p.classroom] || { total: 0, rec: 0 };
      s.total++; c.total++; if (p.isRecorded) { s.rec++; c.rec++; }
    });
    var schools = Object.keys(bySchool).map(function (k) { return bySchool[k]; });
    var Wd = 1080, rowH = 46, pad = 60, h = 260;
    schools.forEach(function (s) { h += 150 + Object.keys(s.cls).length * rowH; });
    h += 30;
    var cv = document.createElement('canvas'); cv.width = Wd; cv.height = h;
    var g = cv.getContext('2d'); g.direction = 'rtl'; g.textAlign = 'right';
    var grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#111827');
    g.fillStyle = grad; g.fillRect(0, 0, Wd, h);
    var F = function (sz, wt) { return (wt || 'bold') + ' ' + sz + 'px Tahoma, "Segoe UI", Arial'; };
    var col = function (pc) { return pc >= 90 ? '#10b981' : pc >= 70 ? '#f59e0b' : '#ef4444'; };
    g.fillStyle = '#38bdf8'; g.font = F(46); g.fillText('نسب رصد الحضور', Wd - pad, 100);
    var ds = S.cfg.dates.slice().sort();
    var fd = function (x) { var p = x.split('-'); return '\u2066' + (+p[2]) + '/' + (+p[1]) + '/' + p[0] + '\u2069'; };
    g.fillStyle = '#94a3b8'; g.font = F(24, 'normal');
    g.fillText(ds.length > 1 ? 'من ' + fd(ds[0]) + ' إلى ' + fd(ds[ds.length - 1]) + ' (' + ds.length + ' أيام)' : 'يوم ' + fd(ds[0]), Wd - pad, 145);
    var y = 210;
    schools.forEach(function (s) {
      var pc = s.total ? Math.round(s.rec / s.total * 100) : 0;
      g.fillStyle = '#1e293b'; g.beginPath(); g.roundRect(pad - 20, y - 50, Wd - 2 * pad + 40, 100, 18); g.fill();
      g.fillStyle = '#f8fafc'; g.font = F(32); g.textAlign = 'right'; g.fillText(s.name, Wd - pad, y + 12);
      g.fillStyle = col(pc); g.font = F(46); g.textAlign = 'left'; g.fillText(pc + '%', pad, y + 16);
      g.fillStyle = '#94a3b8'; g.font = F(20, 'normal'); g.fillText('\u2066' + s.rec + ' / ' + s.total + '\u2069 حصة', pad + 175, y + 10);
      g.textAlign = 'right'; y += 95;
      Object.keys(s.cls).sort(function (a, b) { return a.localeCompare(b, 'ar'); }).forEach(function (n) {
        var c = s.cls[n], p = c.total ? Math.round(c.rec / c.total * 100) : 0;
        var bx = pad + 120, bw = Wd - 2 * pad - 120 - 260;
        g.fillStyle = '#e2e8f0'; g.font = F(22, 'normal'); g.textAlign = 'right'; g.fillText(n, Wd - pad, y + 8);
        g.fillStyle = '#334155'; g.beginPath(); g.roundRect(bx, y - 10, bw, 22, 11); g.fill();
        g.fillStyle = col(p); g.beginPath(); g.roundRect(bx + bw - Math.max(22, bw * p / 100), y - 10, Math.max(22, bw * p / 100), 22, 11); g.fill();
        g.fillStyle = col(p); g.font = F(22); g.textAlign = 'left'; g.fillText(p + '%', pad, y + 9);
        g.textAlign = 'right'; y += rowH;
      });
      y += 55;
    });
    var a = document.createElement('a');
    a.download = 'نسب-رصد-الحضور-' + ds[ds.length - 1] + '.png';
    a.href = cv.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- البدء ---------- */
  async function start() {
    if (S.busy) { alert('هناك عملية جارية.'); return; }
    shell();
    var c = S.cfg;
    $('sme-sub').textContent = c.schools.map(function (s) { return s.name; }).join(' + ') + ' — ' + c.dates.length + ' يوم';
    S.busy = true;
    try { await scan(); } catch (e) { S.scanErrors.push({ school: '', classroom: '', err: e.message }); }
    S.busy = false;
    renderPreview();
  }

  // اكتشاف المدرسة الحالية من الصفحة نفسها (احتياطي إن لم تُرسلها نافذة الإضافة)
  function detectSchool() {
    var qs = new URLSearchParams(location.search), id = qs.get('schoolId') || qs.get('SchoolId') ||
      (document.getElementById('hSchoolId') || {}).value || (document.querySelector('input[name="SchoolId"]') || {}).value || '';
    if (!id) { try { id = localStorage.getItem('madrasati_hSchoolId') || localStorage.getItem('globalschoolId') || ''; } catch (e) {} }
    if (!id) {
      var a = Array.from(document.querySelectorAll('a[href*="SchoolId="], a[href*="schoolId="]')).map(function (x) { return x.getAttribute('href'); });
      for (var i = 0; i < a.length && !id; i++) { var m = a[i].match(/[?&]schoolId=([^&#]+)/i); if (m) id = decodeURIComponent(m[1]); }
    }
    var el = document.querySelector('.school-name, .user-school-name, #schoolName, .navbar-brand span'), nm = el ? el.textContent.trim() : '';
    if (!nm) { try { nm = localStorage.getItem('school_name_' + id) || localStorage.getItem('madrasati_schoolName') || ''; } catch (e) {} }
    return id ? { id: String(id), name: nm || 'مدرستي' } : null;
  }

  W.__smEngine = {
    detectSchool: detectSchool,
    open: function (cfg) {
      if (!cfg.schools || !cfg.schools.length) {
        var cur = detectSchool();
        if (!cur) { alert('لم أتمكن من معرفة المدرسة من هذه الصفحة. افتح صفحة «الفصول المدرسية» في منصة مدرستي ثم حاول مجدداً.'); return false; }
        cfg.schools = [cur]; cfg.currentSchoolId = cur.id;
      }
      var raw = cfg.mode === 'abs' ? (cfg.names || []).filter(function (x) { return norm(x).length > 1; }) : [];
      S.cfg = {
        dates: cfg.dates || [], schools: cfg.schools || [], currentSchoolId: cfg.currentSchoolId,
        concurrency: Math.min(5, Math.max(1, cfg.concurrency || 3)),
        reason: (cfg.reason || '').trim() || REASON_DEFAULT,
        absRaw: raw,
        absNames: raw.map(norm)
      };
      start();
      return true;
    }
  };
})();
