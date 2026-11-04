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
        var at = a0 ? a0.textContent.trim() : '';
        if (/^(عرض الحضور|رصد الحضور|تم الرصد|لم يتم الرصد|عرض|رصد)$/.test(at)) at = '';
        var title = at || t.replace(/(لم يتم الرصد|تم الرصد|رصد الحضور|عرض الحضور)/g, '').trim() || ('حصة ' + slot);
        var tip = '';
        [td, a0].forEach(function (el) { if (el && !tip) tip = el.getAttribute('title') || el.getAttribute('data-original-title') || el.getAttribute('data-bs-original-title') || el.getAttribute('data-teacher') || ''; });
        var info = t.replace(/(لم يتم الرصد|تم الرصد|رصد الحضور|عرض الحضور)/g, '').replace(title, '').replace(/\s+/g, ' ').trim();
        out.push({
          school: school, classroom: c.name, numericClassId: id, encClassId: c.encId,
          dayName: dn, dateStr: slash(dd), slot: slot, title: title, info: info, tip: tip.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          isRecorded: !unrec && rec, idSchedule: g('IdSchedule'), dateAttendTicks: g('dateAttend'),
          teacherId: g('teacherId'), lectureClassId: g('lectureClassId'), href: href
        });
      });
    });
    return out;
  }

  /* ================= نموذج الرصد: فتح، قراءة الحالات، الحفظ ================= */
  var SEL_FORM = 'form#SaveAttendStudents, form#UpdateAttendStudents, form[action*="SaveAttendStudents"]';
  var CAT_AR = { present: 'حاضر', absent: 'غائب', excused: 'غائب بعذر', late: 'متأخر', permit: 'مستأذن', escape: 'هارب' };
  function catOf(label) {
    var t = norm(label);
    if (!t) return null;
    if (t.indexOf('هارب') > -1 || t.indexOf('هروب') > -1) return 'escape';
    if (t.indexOf('مستاذن') > -1 || t.indexOf('استيذان') > -1 || t.indexOf('استئذان') > -1) return 'permit';
    if (t.indexOf('بدون عذر') > -1 || t.indexOf('بلا عذر') > -1 || t.indexOf('غير مبرر') > -1) return 'absent';
    if (t.indexOf('عذر') > -1 || t.indexOf('مبرر') > -1) return 'excused';
    if (t.indexOf('متاخر') > -1 || t.indexOf('تاخير') > -1) return 'late';
    if (t.indexOf('غايب') > -1 || t.indexOf('غياب') > -1) return 'absent';
    if (t.indexOf('حاضر') > -1 || t.indexOf('حضور') > -1) return 'present';
    return null;
  }
  // مطابقة اسم (من القائمة اليدوية أو كشف نور) مع نص صف الطالب
  function nameHit(rowNorm, name, key) {
    if (!name) return false;
    if (rowNorm.indexOf(name) > -1) return true;
    var rw = ' ' + rowNorm + ' ', tk = name.split(' ').slice(0, 4);
    if (tk.length >= 2 && tk.every(function (w) { return rw.indexOf(' ' + w + ' ') > -1; })) return true;
    // اسم أقصر/أطول من اسم المنصة: تطابق البداية، ومع الأسماء الرباعية يلزم تطابق اسم العائلة
    var a = name.split(' '), b = (key || rowNorm).split(' '), k = Math.min(a.length, b.length, 3);
    if (k < 2) return false;
    for (var i = 0; i < k; i++) if (a[i] !== b[i]) return false;
    return a.length < 4 || b.length < 4 || a[a.length - 1] === b[b.length - 1];
  }

  // تنظيف اسم الطالب من كلمات الحالة والأرقام؛ المفتاح = أول 4 كلمات
  var STOPW = {};
  ['غايب', 'غياب', 'بدون', 'بلا', 'عذر', 'بعذر', 'حاضر', 'حضور', 'متاخر', 'تاخر', 'تاخير', 'مستاذن', 'استيذان', 'هارب', 'هروب', 'مبرر', 'غير', 'الحاله', 'الطالب', 'اسم'].forEach(function (w) { STOPW[w] = 1; });
  function cleanName(txt) {
    var w = String(txt || '').replace(/[0-9\u0660-\u0669]+/g, ' ').replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
      .filter(function (x) { return x && !STOPW[norm(x)]; });
    var raw = w.slice(0, 5).join(' ');
    return { raw: raw, key: norm(w.slice(0, 4).join(' ')) };
  }
  // اسم المعلم من صفحة الرصد (تقديري حسب بنية الصفحة)
  function findTeacher(doc) {
    var inp = doc.querySelector('input[name*="TeacherName" i], input[id*="TeacherName" i]');
    if (inp && inp.value.trim()) return inp.value.trim();
    var sel = doc.querySelector('select[name*="Teacher" i] option:checked');
    if (sel && /[\u0600-\u06FF]/.test(sel.textContent)) return sel.textContent.trim();
    var best = '';
    doc.querySelectorAll('label,th,td,span,b,strong,dt,p,div,li,h4,h5,h6').forEach(function (el) {
      if (best || el.children.length > 3) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 70) return;
      var m = t.match(/^(?:اسم\s*)?(?:المعلم|معلم المادة|المعلمة)\s*[:：\-]\s*([\u0600-\u06FF][\u0600-\u06FF\s.]{3,})$/);
      if (m) { best = m[1].trim(); return; }
      if (/^(?:اسم\s*)?(?:المعلم|معلم المادة)\s*[:：]?$/.test(t)) {
        var nx = el.nextElementSibling, v = nx ? (nx.value || nx.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (v && v.length < 60 && /[\u0600-\u06FF]/.test(v)) best = v;
      }
    });
    return best;
  }

  async function resolveHref(p) {
    if (!p.idSchedule) throw new Error('معرف الحصة غير متوفر');
    var sid = p.school.id, href = p.href || '';
    if (href.indexOf('/AttendStudents/View') > -1) {
      try {
        var rv = await fetch(href, { credentials: 'include', headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } });
        if (rv.ok) {
          var tv = await rv.text(), dv = new DOMParser().parseFromString(tv, 'text/html');
          p._viewDoc = dv;
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
    return href;
  }

  async function loadForm(p) {
    var sid = p.school.id, href = await resolveHref(p);
    var r = await fetch(href, { credentials: 'include', headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) throw new Error('تعذر فتح صفحة الرصد (' + r.status + ')');
    var page = await r.text(), doc = new DOMParser().parseFromString(page, 'text/html');
    var form = doc.querySelector(SEL_FORM);
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
        if (h2) { var d2 = new DOMParser().parseFromString(h2, 'text/html'); var f2 = d2.querySelector(SEL_FORM); if (f2) { form = f2; doc = d2; } }
      }
    }
    if (!form) throw new Error('لم يُعثر على نموذج الرصد');
    if (!p.teacherName) { try { p.teacherName = findTeacher(doc) || findTeacher(new DOMParser().parseFromString(page, 'text/html')); } catch (e) {} }
    return { form: form, doc: doc };
  }

  function optLabel(form, x) {
    var l = x.id && form.querySelector('label[for="' + CSS.escape(x.id) + '"]');
    return (l && l.textContent) || (x.closest('label') && x.closest('label').textContent) || (x.nextSibling && x.nextSibling.textContent) || x.title || x.getAttribute('data-title') || '';
  }
  function isStatusGroup(n) { return /\.AttendStatusId$/.test(n) || n.indexOf('Attend[') === 0; }
  // صفوف الطلاب في النموذج: اسم الطالب، مفتاح المطابقة، الخيارات وتصنيفها، والحالة المختارة حالياً
  function studentRows(form) {
    var groups = {}, order = [];
    form.querySelectorAll('input[type=radio]').forEach(function (x) {
      if (!x.name || !isStatusGroup(x.name)) return;
      if (!groups[x.name]) { groups[x.name] = []; order.push(x.name); }
      groups[x.name].push(x);
    });
    return order.map(function (n) {
      var opts = groups[n].map(function (x) { var lb = optLabel(form, x); return { value: x.value, label: lb, cat: catOf(lb) || (x.value === '0' ? 'present' : null), checked: x.checked || x.hasAttribute('checked') }; });
      var row = groups[n][0].closest('tr') || groups[n][0].closest('.student-row, .row, li') || groups[n][0].parentElement;
      var txt = row ? row.textContent : '';
      opts.map(function (o) { return (o.label || '').trim(); }).filter(Boolean).sort(function (a, b) { return b.length - a.length; }).forEach(function (l) { txt = txt.split(l).join(' '); });
      var nm = cleanName(txt);
      var ck = opts.find(function (o) { return o.checked; });
      return { group: n, raw: nm.raw, key: nm.key, rowNorm: norm(row ? row.textContent : ''), opts: opts, cat: ck ? (ck.cat || 'present') : null };
    }).filter(function (s) { return s.key.length > 1; });
  }
  // قراءة حالات الطلاب من حصة مرصودة (النموذج أولاً، ثم صفحة العرض احتياطاً)
  async function readStatuses(p) {
    var f = await loadForm(p), rows = studentRows(f.form);
    if (rows.some(function (r) { return r.cat; })) return rows;
    var dv = p._viewDoc;
    if (dv) {
      var out = [];
      dv.querySelectorAll('tr').forEach(function (tr) {
        var t = tr.textContent || '', c = null, lab = '';
        ['هارب', 'مستأذن', 'غائب بدون عذر', 'بدون عذر', 'غائب بعذر', 'بعذر', 'متأخر', 'غائب', 'حاضر'].some(function (w) { if (t.indexOf(w) > -1) { c = catOf(w); lab = w; return true; } return false; });
        if (!c) return;
        var nm = cleanName(t.split(lab).join(' '));
        if (nm.key.length > 1) out.push({ raw: nm.raw, key: nm.key, cat: c });
      });
      if (out.length) return out;
    }
    return rows.map(function (r) { r.cat = r.cat || 'present'; return r; });
  }

  // رصد حصة: decide(student) تُرجع التصنيف المطلوب (present/absent/excused/...)
  async function recordOne(p, reason, decide, stats) {
    var f = await loadForm(p), form = f.form, doc = f.doc;
    var body = new URLSearchParams(), seen = new Set(), local = [], localNo = 0, localAbs = {};
    var rows = studentRows(form), byGroup = {};
    rows.forEach(function (s) { byGroup[s.group] = s; });
    form.querySelectorAll('input').forEach(function (inp) {
      var n = inp.name, ty = (inp.type || '').toLowerCase();
      if (!n) return;
      if (ty === 'hidden' || ty === 'text') { body.append(n, inp.value || ''); return; }
      if (ty !== 'radio' || seen.has(n)) return;
      seen.add(n);
      if (isStatusGroup(n)) {
        var s = byGroup[n], val = '0';
        var pres = s && s.opts.find(function (o) { return o.cat === 'present'; });
        if (pres) val = pres.value;
        if (s) {
          var want = decide(s) || 'present';
          if (want.cat) { if (want.hit) localAbs[want.hit] = 1; want = want.cat; }
          if (want !== 'present') {
            var fb = { excused: ['excused', 'absent'], permit: ['permit', 'absent'], escape: ['escape', 'absent'], absent: ['absent'], late: ['late', 'present'] }[want] || [want];
            var o = null;
            for (var i = 0; i < fb.length && !o; i++) o = s.opts.find(function (x) { return x.cat === fb[i]; });
            if (o) { val = o.value; if (o.cat !== 'present') local.push({ key: s.key, raw: s.raw, cat: o.cat }); }
            else localNo++;
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
    Object.keys(localAbs).forEach(function (k) { stats.absent[k] = (stats.absent[k] || 0) + 1; });
    stats.noAbsentOption += localNo;
    p.marked = local;
    p.isRecorded = true;
    p.byTool = true;
    return true;
  }

  /* ================= نسخ الغياب من الحصص المرصودة في اليوم نفسه ================= */
  // مجموعة = مدرسة + فصل + يوم
  function gkey(p) { return p.school.id + '|' + p.classroom + '|' + p.dateStr; }
  async function buildGroups(onlyKeys) {
    var cfg = S.cfg, G = {};
    S.periods.forEach(function (p) {
      var k = gkey(p), g = G[k] = G[k] || { k: k, school: p.school, classroom: p.classroom, dateStr: p.dateStr, dayName: p.dayName, recs: [], targets: [], roster: {}, edits: {}, partial: [], src: null };
      (p.isRecorded ? g.recs : g.targets).push(p);
    });
    var need = Object.keys(G).filter(function (k) { return (G[k].targets.length || cfg.closing) && (!onlyKeys || onlyKeys[k]); });
    var reads = [];
    need.forEach(function (k) { G[k].recs.forEach(function (p) { reads.push(p); }); });
    var done = 0;
    if (cfg.copy && reads.length) {
      await pool(reads, Math.min(6, cfg.concurrency + 2), async function (p) {
        for (var t = 0; t < 2; t++) {
          try { p.statuses = await readStatuses(p); break; } catch (e) { p.statuses = null; if (!t) await sleep(700); }
        }
        progress(++done, reads.length, 'قراءة الحصص المرصودة');
      });
    }
    need.forEach(function (k) {
      var g = G[k];
      g.recs.sort(function (a, b) { return a.slot - b.slot; });
      var srcs = g.recs.filter(function (p) { return p.statuses && p.statuses.length; });
      g.src = srcs.length ? srcs : null;
      srcs.forEach(function (p) { p.statuses.forEach(function (s) { g.roster[s.key] = g.roster[s.key] || s.raw; }); });
      // الغياب الجزئي: حاضر في حصة مبكرة ثم غائب/هارب/مستأذن في حصة لاحقة
      Object.keys(g.roster).forEach(function (key) {
        var seenPresent = null;
        srcs.forEach(function (p) {
          var s = p.statuses.find(function (x) { return x.key === key; }); if (!s) return;
          if (s.cat === 'present' || s.cat === 'late') { if (!seenPresent) seenPresent = p; }
          else if (seenPresent && ['absent', 'escape', 'permit'].indexOf(s.cat) > -1 && !g.partial.some(function (x) { return x.key === key; }))
            g.partial.push({ key: key, raw: g.roster[key], from: seenPresent.slot, at: p.slot, cat: s.cat });
        });
      });
    });
    S.groups = G;
    return G;
  }
  // الحالة المقترحة لطالب في حصة غير مرصودة
  function planCat(g, t, key) {
    if (g.edits[key]) return g.edits[key];
    if (!g.src) return 'present';
    var before = g.src.filter(function (p) { return p.slot < t.slot; }), base = before.length ? before[before.length - 1] : g.src[0];
    var s = base.statuses.find(function (x) { return x.key === key; });
    if (!s) return 'present';
    var c = s.cat;
    if (c === 'late') return 'present';
    if ((c === 'permit' || c === 'escape') && !(base.slot < t.slot)) return 'present';
    if (c === 'permit' || c === 'escape') return 'absent';
    return c || 'present';
  }
  // حالة الطالب في اليوم (للخريطة والسجل): أول حصة مرصودة أو التعديل اليدوي
  function dayCat(g, key) {
    if (g.edits[key]) return g.edits[key];
    var manual = S.cfg.absNames.find(function (n) { return nameHit(key, n, key); });
    if (manual) return 'absent';
    if (!g.src) return 'present';
    var first = g.src[0].statuses.find(function (x) { return x.key === key; });
    var c = first ? first.cat : 'present';
    return c === 'late' ? 'present' : c;
  }
  // خطة كل حصة مستهدفة تُحفظ معها (تُستخدم في الاستئناف أيضاً)
  function attachPlans(list) {
    var G = S.groups || {};
    list.forEach(function (p) {
      var g = G[gkey(p)], plan = {};
      if (!g) return;
      Object.keys(Object.assign({}, g.roster, g.edits)).forEach(function (key) { var c = planCat(g, p, key); if (c !== 'present') plan[key] = c; });
      p.plan = plan;
    });
  }
  function deciderFor(p) {
    var cfg = S.cfg;
    return function (s) {
      var hit = cfg.absNames.find(function (n) { return nameHit(s.rowNorm || s.key, n, s.key); });
      if (hit) return { cat: 'absent', hit: hit };
      var pl = p.plan || {};
      if (pl[s.key]) return pl[s.key];
      var k2 = Object.keys(pl).find(function (k) { return nameHit(s.rowNorm || s.key, k, s.key); });
      return k2 ? pl[k2] : 'present';
    };
  }

  /* ================= الجوال: إبقاء الشاشة مضاءة، تنبيه الانتهاء، الاستئناف ================= */
  var wl = null;
  async function keepAwake(on) {
    try {
      if (on) { if (navigator.wakeLock && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', function () { wl = null; }); } }
      else if (wl) { await wl.release(); wl = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (S.busy && document.visibilityState === 'visible') keepAwake(true); });
  var actx = null;
  function primeAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
  function notifyDone(ok) {
    try {
      if (actx) [0, 0.2].forEach(function (t, i) {
        var o = actx.createOscillator(), g = actx.createGain(), at = actx.currentTime + t;
        o.frequency.value = ok ? (i ? 1046 : 784) : 330;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.25, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
        o.connect(g); g.connect(actx.destination); o.start(at); o.stop(at + 0.18);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
    var t0 = document.title; document.title = (ok ? '✅ ' : '⚠️ ') + 'اكتمل الرصد'; setTimeout(function () { document.title = t0; }, 10000);
  }
  var RKEY = 'smRasdResume';
  function rSave(items) {
    try {
      if (!items.length) { localStorage.removeItem(RKEY); return; }
      var c = S.cfg;
      localStorage.setItem(RKEY, JSON.stringify({ at: Date.now(), cfg: { dates: c.dates, schools: c.schools, concurrency: c.concurrency, reason: c.reason, absRaw: c.absRaw, absNames: c.absNames },
        items: items.map(function (p) { var q = {}; for (var k in p) if (k[0] !== '_' && k !== 'statuses') q[k] = p[k]; return q; }) }));
    } catch (e) {}
  }
  function rLoad() {
    try { var r = JSON.parse(localStorage.getItem(RKEY) || 'null'); if (r && r.items && r.items.length && Date.now() - r.at < 3 * 86400000) return r; } catch (e) {}
    return null;
  }

  /* ================= الواجهة ================= */
  var S = { cfg: null, periods: [], scanErrors: [], busy: false, stats: null, failed: [], groups: {} };
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
      '#sme .sum{width:100%;margin:6px 0 12px;font-size:12.5px}#sme .sum td,#sme .sum th{padding:6px 8px;border-bottom:1px solid #1e293b;text-align:right}#sme .sum th{color:#94a3b8;font-weight:600}#sme .sum .n{font-variant-numeric:tabular-nums}' +
      '#sme .flt{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 8px}#sme .flt input,#sme .flt select{flex:1 1 160px;min-width:0;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:8px;padding:9px 10px;font:inherit;font-size:14px}' +
      '#sme .msg{text-align:center;padding:60px 20px;color:#94a3b8}#sme .msg h4{color:#f8fafc;margin:0 0 6px}' +
      '#sme .s{color:#94a3b8;font-size:11.5px}#sme .warn{color:#fbbf24}#sme .map{margin:4px 0 10px}#sme .mapt{color:#f8fafc;font-weight:700;font-size:14px;margin:6px 0}#sme .mapt small{color:#94a3b8;font-weight:normal}' +
      '#sme .mg{border:1px solid #334155;border-radius:10px;padding:8px 10px;margin:6px 0;background:#111827}#sme .mh{margin-bottom:3px}#sme .nr{padding:6px 0;border-top:1px solid #1e293b}#sme summary{cursor:pointer}' +
      '#sme .st{display:inline-block;padding:6px 11px;border-radius:999px;margin:4px 3px;cursor:pointer;font-size:12.5px;border:1px solid;user-select:none}' +
      '#sme .c-absent{color:#fca5a5;border-color:#ef4444;background:rgba(239,68,68,.12)}#sme .c-excused{color:#c4b5fd;border-color:#8b5cf6;background:rgba(139,92,246,.12)}#sme .c-escape,#sme .c-permit{color:#fcd34d;border-color:#f59e0b;background:rgba(245,158,11,.12)}#sme .c-late{color:#93c5fd;border-color:#3b82f6}#sme .c-present{color:#94a3b8;border-color:#475569;text-decoration:line-through}' +
      '#sme .part{margin-top:4px;color:#fbbf24;font-size:12px}#sme select.sme-add{background:#1e293b;color:#e2e8f0;border:1px dashed #64748b;border-radius:999px;padding:6px 10px;font:inherit;font-size:12.5px;margin:4px 3px;max-width:220px}#sme button.sm{padding:6px 12px;font-size:12.5px;border-radius:999px;margin:4px 3px}';
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
    if (cfg.redo) {
      var L0 = logLoad();
      S.periods.forEach(function (p) {
        var e = (L0[p.dateStr] || {})[p.school.id];
        if (p.isRecorded && e && e.ids && e.ids.indexOf(p.idSchedule) > -1) { p.isRecorded = false; p.redo = true; }
      });
    }
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
      // ملخص لكل أسبوع
      var wk = {};
      S.periods.forEach(function (p) {
        var ws = weekStart(fromYmd(p.dateStr.replace(/\//g, '-'))), k = slash(ws);
        var w = wk[k] = wk[k] || { ws: ws, total: 0, un: 0 };
        w.total++; if (!p.isRecorded) w.un++;
      });
      var html = '<div id="sme-map" class="map"></div><table class="sum"><tr><th>الأسبوع</th><th>غير مرصود</th><th>كل الحصص</th><th>الإنجاز</th></tr>' +
        Object.keys(wk).sort().reverse().map(function (k) {
          var w = wk[k], e = new Date(w.ws.getFullYear(), w.ws.getMonth(), w.ws.getDate() + 4), pc = Math.round((w.total - w.un) / w.total * 100);
          return '<tr><td>' + w.ws.getDate() + '/' + (w.ws.getMonth() + 1) + ' – ' + e.getDate() + '/' + (e.getMonth() + 1) + '</td><td class="n" style="color:' + (w.un ? '#f87171' : '#34d399') + '">' + w.un + '</td><td class="n">' + w.total + '</td><td class="n">' + pc + '%</td></tr>';
        }).join('') + '</table>';
      var classes = {}; un.forEach(function (p) { classes[p.classroom] = 1; });
      html += '<div class="flt"><input id="sme-q" type="search" placeholder="بحث بالفصل أو المادة أو المعلم" aria-label="بحث في الحصص">' +
        '<select id="sme-cls" aria-label="تصفية حسب الفصل"><option value="">كل الفصول</option>' +
        Object.keys(classes).sort(function (a, b) { return a.localeCompare(b, 'ar'); }).map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></div>';
      var key = '';
      un.forEach(function (p, i) {
        var k = p.school.id + '|' + p.dateStr;
        if (k !== key) {
          if (key) html += '</table>';
          key = k;
          html += '<div class="grp"><span>' + esc(p.school.name) + ' — ' + esc(p.dayName) + ' ' + esc(p.dateStr) + '</span>' +
            '<label><input type="checkbox" class="sme-g" data-k="' + esc(k) + '" checked> تحديد اليوم</label></div><table>';
        }
        html += '<tr id="sme-r' + i + '" data-cls="' + esc(p.classroom) + '" data-txt="' + esc(norm(p.classroom + ' ' + p.title + ' ' + p.info)) + '"><td style="width:28px">' + (S.cfg.reportOnly ? '•' : '<input type="checkbox" class="sme-c" data-i="' + i + '" data-k="' + esc(k) + '" checked>') + '</td>' +
          '<td><b>' + esc(p.classroom) + '</b></td><td class="s">الحصة ' + p.slot + '</td><td>' + esc(p.title) + '</td><td class="s">' + esc(p.info) + '</td></tr>';
      });
      body.innerHTML = html + '</table>';
      renderMap();
      body.querySelectorAll('.sme-g').forEach(function (g) {
        g.onchange = function () { body.querySelectorAll('.sme-c[data-k="' + g.dataset.k + '"]').forEach(function (c) { c.checked = g.checked; }); count(); };
      });
      body.querySelectorAll('.sme-c').forEach(function (c) { c.onchange = count; });
      var applyF = function () {
        var q = norm($('sme-q').value), cl = $('sme-cls').value;
        body.querySelectorAll('tr[data-cls]').forEach(function (tr) {
          tr.style.display = (!cl || tr.dataset.cls === cl) && (!q || tr.dataset.txt.indexOf(q) > -1) ? '' : 'none';
        });
        body.querySelectorAll('.grp').forEach(function (g) {
          var t = g.nextElementSibling; if (!t || t.tagName !== 'TABLE' || t.classList.contains('sum')) return;
          var any = Array.from(t.rows).some(function (r) { return r.style.display !== 'none'; });
          g.style.display = any ? '' : 'none'; t.style.display = any ? '' : 'none';
        });
        count();
      };
      $('sme-q').oninput = applyF; $('sme-cls').onchange = applyF;
    }
    if (S.scanErrors.length) {
      body.innerHTML += '<div class="grp" style="color:#f87171">تعذّر الفحص</div><table>' + S.scanErrors.map(function (e) {
        return '<tr><td>' + esc(e.school) + '</td><td>' + esc(e.classroom) + '</td><td class="s">' + esc(e.err) + '</td></tr>';
      }).join('') + '</table>';
    }
    foot.innerHTML =
      (un.length && !S.cfg.reportOnly ? '<button class="b go" id="sme-go">' + (S.cfg.closing ? '🔒 اعتماد وإقفال اليوم' : '⚡ رصد المحدد') + ' (<span id="sme-n">0</span>)</button>' +
        '<button class="b sec" id="sme-all">تحديد الكل</button><button class="b sec" id="sme-none">إلغاء التحديد</button>' : '') +
      (S.cfg.closing && !un.length ? '<button class="b go" id="sme-ci">🔒 تقرير اليوم (PDF)</button>' : '') +
      '<button class="b pic" id="sme-img">🖼️ صورة نسب الرصد</button>';
    if (S.cfg.closing && !un.length && S.periods.length) { saveLog(); $('sme-ci').onclick = closingImage; }
    if (un.length && !S.cfg.reportOnly) {
      $('sme-go').onclick = function () { runSelected(un); };
      $('sme-all').onclick = function () { setAll(true); };
      $('sme-none').onclick = function () { setAll(false); };
      count();
    }
    $('sme-img').onclick = makeImage;
    progress(0, 0, '');
    function setAll(v) { visibleChecks(body, false).forEach(function (c) { c.checked = v; }); body.querySelectorAll('.sme-g').forEach(function (g) { g.checked = v; }); count(); }
    function count() { if ($('sme-n')) $('sme-n').textContent = visibleChecks(body, true).length; }
  }

  function visibleChecks(body, onlyChecked) {
    return Array.from(body.querySelectorAll('.sme-c' + (onlyChecked ? ':checked' : ''))).filter(function (c) { var tr = c.closest('tr'); return !tr || tr.style.display !== 'none'; });
  }

  /* ---------- خريطة الغياب (الاستثناءات فقط) ---------- */
  var CYCLE = ['absent', 'excused', 'present'];
  function exceptions(g) {
    var keys = Object.keys(Object.assign({}, g.roster, g.edits)), out = [];
    keys.forEach(function (key) {
      var c = 'present';
      if (g.edits[key]) c = g.edits[key];
      else g.targets.some(function (t) { var x = planCat(g, t, key); if (x !== 'present') { c = x; return true; } return false; });
      var man = S.cfg.absNames.some(function (n) { return nameHit(key, n, key); });
      if (man && !g.edits[key]) c = 'absent';
      if (c !== 'present' || g.edits[key]) out.push({ key: key, raw: g.roster[key] || key, cat: c, man: man });
    });
    return out.sort(function (a, b) { return a.raw.localeCompare(b.raw, 'ar'); });
  }
  function renderMap() {
    var box = $('sme-map'); if (!box) return;
    var G = S.groups || {}, list = Object.keys(G).map(function (k) { return G[k]; }).filter(function (g) { return g.targets.length; });
    if (!list.length) { box.innerHTML = ''; return; }
    list.sort(function (a, b) { return a.dateStr.localeCompare(b.dateStr) || a.classroom.localeCompare(b.classroom, 'ar'); });
    S.mapList = list;
    var hot = [], clean = 0, nosrc = [];
    list.forEach(function (g, i) {
      g.i = i; g.ex = exceptions(g);
      if (g.ex.length || g.partial.length) hot.push(g);
      else if (!g.src) nosrc.push(g);
      else clean++;
    });
    var addCtl = function (g) {
      var ks = Object.keys(g.roster);
      if (!ks.length) return '<button class="b sec sm sme-load" data-g="' + g.i + '">+ غائب</button>';
      return '<select class="sme-add" data-g="' + g.i + '"><option value="">+ إضافة غائب…</option>' +
        ks.sort(function (a, b) { return g.roster[a].localeCompare(g.roster[b], 'ar'); }).map(function (k) { return '<option value="' + esc(k) + '">' + esc(g.roster[k]) + '</option>'; }).join('') + '</select>';
    };
    var srcTxt = function (g) {
      if (!g.src) return '<span class="warn">⚠️ لا توجد حصة مرصودة لهذا الفصل في يومه — سيُرصد الكل حاضرين</span>';
      return 'المصدر: ' + g.src.map(function (p) { return 'الحصة ' + p.slot + ' (' + esc(p.title) + ')'; }).join('، ');
    };
    var html = '<div class="mapt">🗺️ خريطة الغياب <small>— الاستثناءات فقط؛ اضغط على الطالب لتغيير حالته</small></div>';
    if (!S.cfg.copy) html += '<div class="mg s">النسخ من الحصص المرصودة متوقف — الكل حاضر إلا من في قائمة الغياب.</div>';
    hot.forEach(function (g) {
      html += '<div class="mg"><div class="mh"><b>' + esc(g.classroom) + '</b> <span class="s">' + esc(g.dayName) + ' ' + esc(g.dateStr) + (S.cfg.schools.length > 1 ? ' — ' + esc(g.school.name) : '') + ' · ' + g.targets.length + ' حصة غير مرصودة</span></div>' +
        '<div class="s">' + srcTxt(g) + '</div><div>' +
        g.ex.map(function (e) { return '<span class="st c-' + e.cat + '" data-g="' + g.i + '" data-k="' + esc(e.key) + '">' + esc(e.raw) + ' · ' + CAT_AR[e.cat] + (e.man ? ' 📋' : '') + '</span>'; }).join('') +
        addCtl(g) + '</div>' +
        (g.partial.length ? '<div class="part">⚠️ غياب جزئي (حضر ثم غاب): ' + g.partial.map(function (x) { return esc(x.raw) + ' — حاضر ح' + x.from + ' ثم ' + CAT_AR[x.cat] + ' ح' + x.at; }).join('، ') + '</div>' : '') + '</div>';
    });
    if (clean) html += '<div class="mg s">✅ ' + clean + ' فصل/يوم بلا غياب في الحصص المرصودة — ستُرصد حصصها الباقية حاضرين.</div>';
    if (nosrc.length) {
      html += '<details class="mg"><summary class="warn">⚠️ ' + nosrc.length + ' فصل/يوم بلا أي حصة مرصودة — ستُرصد حاضرين (اضغط لإضافة غائب)</summary>' +
        nosrc.map(function (g) { return '<div class="nr"><b>' + esc(g.classroom) + '</b> <span class="s">' + esc(g.dayName) + ' ' + esc(g.dateStr) + ' · ' + g.targets.length + ' حصة</span> ' + addCtl(g) + '</div>'; }).join('') + '</details>';
    }
    box.innerHTML = html;
    var opened = box.querySelector('details'); if (opened && S.mapOpen) opened.open = true;
    if (opened) opened.ontoggle = function () { S.mapOpen = opened.open; };
    box.querySelectorAll('.st').forEach(function (el) {
      el.onclick = function () {
        if (S.busy) return;
        var g = S.mapList[+el.dataset.g], k = el.dataset.k, cur = (g.ex.find(function (e) { return e.key === k; }) || {}).cat || 'present';
        g.edits[k] = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
        renderMap();
      };
    });
    box.querySelectorAll('.sme-add').forEach(function (el) {
      el.onchange = function () { if (!el.value) return; var g = S.mapList[+el.dataset.g]; g.edits[el.value] = 'absent'; renderMap(); };
    });
    box.querySelectorAll('.sme-load').forEach(function (el) {
      el.onclick = async function () {
        var g = S.mapList[+el.dataset.g]; el.disabled = true; el.textContent = 'جاري تحميل الأسماء…';
        try { var f = await loadForm(g.targets[0]); studentRows(f.form).forEach(function (s) { g.roster[s.key] = s.raw; }); }
        catch (e) { alert('تعذر تحميل أسماء الطلاب: ' + e.message); }
        renderMap();
      };
    });
  }

  /* ---------- سجل الأيام (محلي) ---------- */
  var LKEY = 'smRasdLog';
  function logLoad() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}') || {}; } catch (e) { return {}; } }
  function logSaveAll(L) {
    var ds = Object.keys(L).sort();
    while (ds.length > 60) delete L[ds.shift()];
    try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) {}
  }
  function dayEntry(dateStr, sc) {
    var ps = S.periods.filter(function (p) { return p.dateStr === dateStr && p.school.id === sc.id; });
    var e = { name: sc.name, total: ps.length, rec: 0, admin: 0, absent: [], partial: [], teachers: {}, at: Date.now(), read: false };
    ps.forEach(function (p) {
      if (p.isRecorded) e.rec++;
      if (p.byTool) { e.admin++; (e.ids = e.ids || []).push(p.idSchedule); var t = (p.teacherName || p.info || p.tip || '').trim() || ('مادة: ' + (p.title || 'غير محددة')); e.teachers[t] = (e.teachers[t] || 0) + 1; }
    });
    var G = S.groups || {}, seen = {};
    Object.keys(G).forEach(function (k) {
      var g = G[k]; if (g.dateStr !== dateStr || g.school.id !== sc.id || !(g.src || Object.keys(g.edits).length)) return;
      e.read = true;
      Object.keys(Object.assign({}, g.roster, g.edits)).forEach(function (key) {
        var c = dayCat(g, key);
        if (c === 'absent' || c === 'excused' || c === 'escape' || c === 'permit') { e.absent.push({ n: g.roster[key] || key, c: g.classroom, x: c }); seen[g.classroom + '|' + key] = 1; }
      });
      g.partial.forEach(function (x) { e.partial.push({ n: x.raw, c: g.classroom, f: x.from, a: x.at, x: x.cat }); });
    });
    // الغائبون اليدويون الذين لم تُقرأ فصولهم
    ps.forEach(function (p) { (p.marked || []).forEach(function (m) { var sk = p.classroom + '|' + m.key; if (!seen[sk] && m.cat !== 'present') { seen[sk] = 1; e.absent.push({ n: m.raw, c: p.classroom, x: m.cat }); } }); });
    return e;
  }
  function saveLog() {
    if (S.resumed) return logLoad();
    var L = logLoad();
    S.cfg.dates.forEach(function (d) {
      var ds = slash(fromYmd(d));
      S.cfg.schools.forEach(function (sc) {
        var e = dayEntry(ds, sc); if (!e.total) return;
        L[ds] = L[ds] || {};
        var old = L[ds][sc.id];
        if (old && old.ids && S.cfg.redo) e.ids = Array.from(new Set((e.ids || []).concat(old.ids)));
        L[ds][sc.id] = e;
      });
    });
    logSaveAll(L);
    return L;
  }
  // الغائبون يومين متتاليين أو أكثر (حسب الأيام المسجلة)
  function followUp(L, ds, sid) {
    var today = (L[ds] || {})[sid]; if (!today) return [];
    var prev = Object.keys(L).filter(function (d) { return d < ds && L[d][sid] && L[d][sid].read; }).sort().reverse();
    return today.absent.filter(function (a) { return a.x !== 'excused'; }).map(function (a) {
      var n = 1, k = norm(a.n);
      for (var i = 0; i < prev.length; i++) {
        var hit = L[prev[i]][sid].absent.some(function (b) { return b.c === a.c && norm(b.n) === k; });
        if (hit) n++; else break;
      }
      return { n: a.n, c: a.c, days: n };
    }).filter(function (x) { return x.days >= 2; }).sort(function (a, b) { return b.days - a.days; });
  }

  /* ---------- رسم تقرير نصي كصورة ---------- */
  function drawReport(R) {
    var Wd = 1080, pad = 60, F = function (sz, wt) { return (wt || 'bold') + ' ' + sz + 'px Tahoma, "Segoe UI", Arial'; };
    var col = function (pc) { return pc >= 90 ? '#10b981' : pc >= 70 ? '#f59e0b' : '#ef4444'; };
    var m = document.createElement('canvas').getContext('2d'); m.direction = 'rtl';
    function wrap(t, sz) {
      m.font = F(sz, 'normal'); var words = String(t).split(' '), lines = [], cur = '';
      words.forEach(function (w) { var x = cur ? cur + ' ' + w : w; if (m.measureText(x).width > Wd - 2 * pad - 20 && cur) { lines.push(cur); cur = w; } else cur = x; });
      if (cur) lines.push(cur); return lines;
    }
    var ops = [], y = 100;
    ops.push(function (g) { g.fillStyle = '#38bdf8'; g.font = F(46); g.fillText(R.title, Wd - pad, 100); });
    if (R.sub) { var sy = 145; ops.push(function (g) { g.fillStyle = '#94a3b8'; g.font = F(24, 'normal'); g.fillText(R.sub, Wd - pad, sy); }); }
    y = 200;
    (R.schools || []).forEach(function (s) {
      var yy = y + 50, pc = s.total ? Math.round(s.rec / s.total * 100) : 0;
      ops.push(function (g) {
        g.fillStyle = '#1e293b'; g.beginPath(); g.roundRect(pad - 20, yy - 50, Wd - 2 * pad + 40, 100, 18); g.fill();
        var fs = 32, maxW = Wd - 2 * pad - 360; g.font = F(fs);
        while (fs > 18 && g.measureText(s.name).width > maxW) { fs -= 2; g.font = F(fs); }
        g.fillStyle = '#f8fafc'; g.textAlign = 'right'; g.fillText(s.name, Wd - pad, yy + 12);
        g.fillStyle = col(pc); g.font = F(46); g.textAlign = 'left'; g.fillText(pc + '%', pad, yy + 16);
        g.fillStyle = '#94a3b8'; g.font = F(20, 'normal'); g.fillText('⁦' + s.rec + ' / ' + s.total + '⁩ حصة', pad + 175, yy + 10);
        g.textAlign = 'right';
      });
      y += 135;
      if (s.extra) { var ey = y; ops.push(function (g) { g.fillStyle = '#cbd5e1'; g.font = F(22, 'normal'); g.fillText(s.extra, Wd - pad, ey); }); y += 40; }
    });
    (R.sections || []).forEach(function (sec) {
      if (!sec.lines.length) return;
      y += 20;
      m.font = F(30);
      var hl = [], cur = '';
      sec.h.split(' ').forEach(function (w) { var x = cur ? cur + ' ' + w : w; if (m.measureText(x).width > Wd - 2 * pad && cur) { hl.push(cur); cur = w; } else cur = x; });
      if (cur) hl.push(cur);
      hl.forEach(function (h) { var hy = y; ops.push(function (g) { g.fillStyle = sec.color || '#38bdf8'; g.font = F(30); g.fillText(h, Wd - pad, hy); }); y += 42; });
      y += 4;
      sec.lines.forEach(function (ln) {
        wrap(ln, 23).forEach(function (w) { var ly = y; ops.push(function (g) { g.fillStyle = '#e2e8f0'; g.font = F(23, 'normal'); g.fillText(w, Wd - pad, ly); }); y += 36; });
      });
    });
    y += 40;
    var cv = document.createElement('canvas'); cv.width = Wd; cv.height = Math.max(600, y);
    var g = cv.getContext('2d'); g.direction = 'rtl'; g.textAlign = 'right';
    var grad = g.createLinearGradient(0, 0, 0, cv.height); grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#111827');
    g.fillStyle = grad; g.fillRect(0, 0, Wd, cv.height);
    ops.forEach(function (f) { f(g); });
    return cv;
  }
  // تحويل الصورة الطويلة إلى PDF بصفحات A4 (يُقص بين الأسطر لا وسطها)
  function canvasToPdf(cv) {
    var W0 = cv.width, pageH = Math.round(W0 * 841.89 / 595.28), ctx = cv.getContext('2d'), cuts = [0], y = 0;
    function safe(row) {
      var d = ctx.getImageData(0, row, W0, 1).data, r0 = d[0], g0 = d[1], b0 = d[2], n = 0;
      for (var i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r0) > 60 || Math.abs(d[i + 1] - g0) > 60 || Math.abs(d[i + 2] - b0) > 60) { if (++n > 20) return false; }
      return true;
    }
    while (cv.height - y > pageH) {
      var c = y + pageH, k = c;
      for (; k > c - 450; k -= 2) if (safe(k)) break;
      if (k <= c - 450) k = c;
      cuts.push(k); y = k;
    }
    cuts.push(cv.height);
    var enc = function (str) { var u = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; };
    var parts = [], len = 0, offs = [];
    var push = function (u) { if (typeof u === 'string') u = enc(u); parts.push(u); len += u.length; };
    var nP = cuts.length - 1, obj = function (n) { offs[n] = len; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1); push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
    var kids = []; for (var i = 0; i < nP; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(2); push('2 0 obj<</Type/Pages/Count ' + nP + '/Kids[' + kids.join(' ') + ']>>endobj\n');
    for (var p = 0; p < nP; p++) {
      var h = cuts[p + 1] - cuts[p], pc = document.createElement('canvas'); pc.width = W0; pc.height = h;
      var pg = pc.getContext('2d'); pg.fillStyle = '#ffffff'; pg.fillRect(0, 0, W0, h); pg.drawImage(cv, 0, -cuts[p]);
      var bin = atob(pc.toDataURL('image/jpeg', 0.9).split(',')[1]), jpg = enc(bin);
      var n = 3 + p * 3, dh = (h * 595.28 / W0).toFixed(2), ty = (841.89 - h * 595.28 / W0).toFixed(2);
      var cs = 'q 595.28 0 0 ' + dh + ' 0 ' + ty + ' cm /Im0 Do Q';
      obj(n); push(n + ' 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595.28 841.89]/Resources<</XObject<</Im0 ' + (n + 1) + ' 0 R>>>>/Contents ' + (n + 2) + ' 0 R>>endobj\n');
      obj(n + 1); push((n + 1) + ' 0 obj<</Type/XObject/Subtype/Image/Width ' + W0 + '/Height ' + h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + jpg.length + '>>stream\n'); push(jpg); push('\nendstream endobj\n');
      obj(n + 2); push((n + 2) + ' 0 obj<</Length ' + cs.length + '>>stream\n' + cs + '\nendstream endobj\n');
    }
    var total = 3 + nP * 3, xref = len, x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var j = 1; j < total; j++) x += String(offs[j]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer<</Size ' + total + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.download = name; a.href = u; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function deliverImage(cv, name) {
    var url = cv.toDataURL('image/png'), pdfName = name.replace(/\.png$/, '.pdf'), pdf = null;
    try { pdf = canvasToPdf(cv); saveBlob(pdf, pdfName); } catch (e) { var a = document.createElement('a'); a.download = name; a.href = url; document.body.appendChild(a); a.click(); a.remove(); }
    var body = $('sme-body');
    if (body) {
      var old = $('sme-imgv'); if (old) old.remove();
      body.insertAdjacentHTML('afterbegin', '<div id="sme-imgv" style="margin:6px 0 12px;text-align:center">' +
        '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:8px">' + (pdf ? '<button class="b go" id="sme-pdf">📄 تنزيل PDF</button>' : '') + '<button class="b pic" id="sme-png">🖼️ تنزيل صورة</button></div>' +
        '<div class="s" style="margin-bottom:6px">📌 على الجوال يمكنك أيضاً الضغط مطولاً على الصورة لحفظها أو مشاركتها</div><img src="' + url + '" style="max-width:100%;max-height:70vh;border:1px solid #334155;border-radius:10px"></div>');
      if (pdf) $('sme-pdf').onclick = function () { saveBlob(pdf, pdfName); };
      $('sme-png').onclick = function () { var a = document.createElement('a'); a.download = name; a.href = url; document.body.appendChild(a); a.click(); a.remove(); };
      body.scrollTop = 0;
    }
  }
  function fdate(ds) { var p = ds.split('/'); return '⁦' + (+p[2]) + '/' + (+p[1]) + '/' + p[0] + '⁩'; }
  /* ---------- صورة إقفال اليوم (تصميم بطاقات) ---------- */
  function shortCls(c) { var p = String(c).split(/\s*[-–]\s*/); return (p.length > 1 ? p[p.length - 1] : c).trim(); }
  function shortName(n) { var w = String(n).split(' ').filter(Boolean); return w.length > 3 ? w[0] + ' ' + w[1] + ' ' + w[w.length - 1] : w.join(' '); }
  function closingImage(dsArg) {
    var L = logLoad(), ds = typeof dsArg === 'string' ? dsArg : slash(fromYmd(S.cfg.dates[0]));
    var dayName = DAYS[new Date(ds.replace(/\//g, '-') + 'T00:00').getDay()] || '';
    var list = [];
    if (typeof dsArg === 'string') Object.keys(L[ds] || {}).forEach(function (sid) { var e = L[ds][sid]; if (e.total) list.push({ sc: { id: sid, name: e.name }, e: e, fu: followUp(L, ds, sid) }); });
    else S.cfg.schools.forEach(function (sc) { var e = (L[ds] || {})[sc.id] || dayEntry(ds, sc); if (e.total) list.push({ sc: sc, e: e, fu: followUp(L, ds, sc.id) }); });
    if (!list.length) { alert('لا توجد بيانات لهذا اليوم.'); return; }

    var Wd = 1080, P = 48, MAXH = 15000;
    var C = { bg: '#f8fafc', card: '#ffffff', line: '#e2e8f0', ink: '#0f172a', mut: '#64748b', pri: '#0369a1', abs: '#dc2626', exc: '#7c3aed', warn: '#d97706', ok: '#059669' };
    var cv = document.createElement('canvas'); cv.width = Wd; cv.height = MAXH;
    var g = cv.getContext('2d'); g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    var F = function (sz, wt) { return (wt || 'bold') + ' ' + sz + 'px Tahoma, "Segoe UI", Arial'; };
    var rr = function (x, y, w, h, r, fill, stroke) { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    var txt = function (t, x, y, sz, col, wt, al) { g.font = F(sz, wt); g.fillStyle = col; g.textAlign = al || 'right'; g.fillText(t, x, y); g.textAlign = 'right'; };
    var fit = function (t, sz, maxW, wt) { g.font = F(sz, wt); while (sz > 14 && g.measureText(t).width > maxW) { sz -= 1; g.font = F(sz, wt); } return sz; };
    var pcCol = function (pc) { return pc >= 90 ? C.ok : pc >= 70 ? C.warn : C.abs; };
    g.fillStyle = C.bg; g.fillRect(0, 0, Wd, MAXH);

    // الترويسة
    var hg = g.createLinearGradient(0, 0, Wd, 0); hg.addColorStop(0, '#0c4a6e'); hg.addColorStop(1, '#0369a1');
    g.fillStyle = hg; g.fillRect(0, 0, Wd, 190);
    txt('تقرير إقفال يوم ' + dayName, Wd - P, 82, 44, '#ffffff');
    txt(fdate(ds) + '  ·  رصد الحضور والغياب', Wd - P, 130, 24, '#bae6fd', 'normal');
    var y = 230;

    list.forEach(function (it) {
      var e = it.e, pc = e.total ? Math.round(e.rec / e.total * 100) : 0;
      var exc = e.absent.filter(function (a) { return a.x === 'excused'; }).length, abs = e.absent.length - exc;
      // اسم المدرسة
      var ns = fit(it.sc.name, 32, Wd - 2 * P);
      txt(it.sc.name, Wd - P, y, ns, C.ink);
      y += 26;
      // بطاقات المؤشرات
      var kp = [
        { v: pc + '%', l: 'نسبة الرصد', c: pcCol(pc), s: '⁦' + e.rec + '/' + e.total + '⁩ حصة' },
        { v: String(Math.max(0, e.rec - e.admin)), l: 'رصدها المعلمون', c: C.pri, s: e.total ? Math.round(Math.max(0, e.rec - e.admin) / e.total * 100) + '%' : '' },
        { v: String(e.admin), l: 'رُصدت إدارياً', c: C.warn, s: e.total ? Math.round(e.admin / e.total * 100) + '%' : '' },
        { v: String(e.absent.length), l: 'الغائبون', c: C.abs, s: exc ? abs + ' بدون عذر · ' + exc + ' بعذر' : '' }
      ];
      var kw = (Wd - 2 * P - 3 * 16) / 4;
      kp.forEach(function (k, i) {
        var x = Wd - P - (i + 1) * kw - i * 16;
        rr(x, y, kw, 150, 18, C.card, C.line);
        g.fillStyle = k.c; g.fillRect(x + kw - 8, y + 18, 6, 114);
        txt(k.v, x + kw - 26, y + 70, 46, k.c);
        txt(k.l, x + kw - 26, y + 108, 21, C.ink);
        if (k.s) txt(k.s, x + kw - 26, y + 136, fit(k.s, 17, kw - 40, 'normal'), C.mut, 'normal');
      });
      y += 190;

      var section = function (title, color, count) {
        g.fillStyle = color; g.beginPath(); g.roundRect(Wd - P - 8, y - 28, 8, 34, 4); g.fill();
        txt(title + (count != null ? '  (' + count + ')' : ''), Wd - P - 22, y, 28, C.ink);
        y += 26;
      };

      // الغياب حسب الفصل: بطاقات في عمودين
      var byC = {};
      e.absent.forEach(function (a) { (byC[a.c] = byC[a.c] || []).push(a); });
      var cls = Object.keys(byC).sort(function (a, b) { return a.localeCompare(b, 'ar', { numeric: true }); });
      if (cls.length) {
        section('الغياب حسب الفصل', C.abs, e.absent.length);
        var colW = (Wd - 2 * P - 20) / 2, colY = [y, y], lh = 34;
        cls.forEach(function (c) {
          var arr = byC[c].sort(function (a, b) { return (a.x === 'excused') - (b.x === 'excused') || a.n.localeCompare(b.n, 'ar'); });
          var h = 70 + arr.length * lh + 12, ci = colY[0] <= colY[1] ? 0 : 1, x = ci === 0 ? Wd - P - colW : P, cy = colY[ci];
          if (cy + h > MAXH - 400) return;
          rr(x, cy, colW, h, 16, C.card, C.line);
          txt(shortCls(c), x + colW - 22, cy + 42, fit(shortCls(c), 25, colW - 120), C.ink);
          rr(x + 18, cy + 16, 64, 36, 18, '#fee2e2');
          txt(String(arr.length), x + 50, cy + 42, 22, C.abs, 'bold', 'center');
          g.fillStyle = C.line; g.fillRect(x + 18, cy + 60, colW - 36, 2);
          arr.forEach(function (a, i) {
            var ly = cy + 60 + 30 + i * lh, col = a.x === 'excused' ? C.exc : a.x === 'absent' ? C.abs : C.warn;
            g.fillStyle = col; g.beginPath(); g.arc(x + colW - 30, ly - 7, 6, 0, 7); g.fill();
            var nm = shortName(a.n), tag = a.x === 'excused' ? 'بعذر' : a.x === 'escape' ? 'هارب' : a.x === 'permit' ? 'مستأذن' : '';
            txt(nm, x + colW - 46, ly, fit(nm, 21, colW - 150, 'normal'), C.ink, 'normal');
            if (tag) txt(tag, x + 26, ly, 17, col, 'bold', 'left');
          });
          colY[ci] = cy + h + 16;
        });
        y = Math.max(colY[0], colY[1]) + 30;
        // مفتاح الألوان
        [['بدون عذر', C.abs], ['بعذر', C.exc], ['هارب/مستأذن', C.warn]].forEach(function (k, i) {
          var x = Wd - P - i * 190; g.fillStyle = k[1]; g.beginPath(); g.arc(x - 8, y - 7, 7, 0, 7); g.fill(); txt(k[0], x - 24, y, 19, C.mut, 'normal');
        });
        y += 50;
      }

      // قوائم بصفوف
      var rows = function (title, color, items, render) {
        if (!items.length) return;
        section(title, color, items.length);
        var more = items.length - 30; if (more > 0) items = items.slice(0, 30).concat([{ __more: more }]);
        var h = 20 + items.length * 52;
        rr(P, y, Wd - 2 * P, h, 16, C.card, C.line);
        items.forEach(function (r, i) {
          var ry = y + 20 + i * 52;
          if (i) { g.fillStyle = '#f1f5f9'; g.fillRect(P + 20, ry, Wd - 2 * P - 40, 2); }
          if (r.__more) txt('و ' + r.__more + ' آخرون…', Wd - P - 24, ry + 34, 20, C.mut, 'normal'); else render(r, ry + 34);
        });
        y += h + 46;
      };
      rows('يحتاج متابعة — غياب متتالٍ', C.warn, it.fu, function (r, ly) {
        txt(shortName(r.n), Wd - P - 24, ly, 22, C.ink);
        txt(shortCls(r.c), Wd - P - 420, ly, 20, C.mut, 'normal');
        rr(P + 20, ly - 28, 150, 38, 19, '#fef3c7');
        txt(r.days + ' أيام', P + 95, ly - 2, 20, C.warn, 'bold', 'center');
      });
      rows('غياب جزئي — حضر ثم غاب', '#f59e0b', e.partial, function (r, ly) {
        txt(shortName(r.n), Wd - P - 24, ly, 22, C.ink);
        txt(shortCls(r.c), Wd - P - 420, ly, 20, C.mut, 'normal');
        txt('حاضر الحصة ⁦' + r.f + '⁩  ←  ' + CAT_AR[r.x] + ' الحصة ⁦' + r.a + '⁩', P + 24, ly, 19, C.warn, 'bold', 'left');
      });
      var tk = Object.keys(e.teachers).sort(function (a, b) { return e.teachers[b] - e.teachers[a]; });
      if (tk.length) {
        var mx = e.teachers[tk[0]] || 1;
        rows('الحصص المرصودة إدارياً', C.pri, tk.slice(0, 15), function (t, ly) {
          var n = e.teachers[t], bw = 300 * n / mx;
          txt(t, Wd - P - 24, ly, fit(t, 21, 480, 'normal'), C.ink, 'normal');
          rr(P + 90, ly - 22, 300, 24, 12, '#e0f2fe'); rr(P + 90 + 300 - bw, ly - 22, bw, 24, 12, '#0ea5e9');
          txt(String(n), P + 24, ly, 22, C.pri, 'bold', 'left');
        });
      }
      y += 20;
    });
    txt('أُعدّ آلياً بأداة رصد الحضور السريع — منصة مدرستي', Wd / 2, y, 18, '#94a3b8', 'normal', 'center');
    y += 40;

    var out = document.createElement('canvas'); out.width = Wd; out.height = Math.min(MAXH, y);
    out.getContext('2d').drawImage(cv, 0, 0);
    deliverImage(out, 'إقفال-اليوم-' + ds.replace(/\//g, '-') + '.png');
  }

  /* ---------- عرض السجل ---------- */
  function showLog() {
    shell();
    $('sme-sub').textContent = 'سجل الأيام المحفوظة على هذا الجهاز';
    $('sme-chips').innerHTML = '';
    var L = logLoad(), ds = Object.keys(L).sort().reverse(), body = $('sme-body');
    if (!ds.length) {
      body.innerHTML = '<div class="msg"><h4>السجل فارغ</h4>يُحفظ كل يوم تلقائياً بعد «إقفال اليوم» أو بعد أي رصد.</div>';
    } else {
      var rows = [];
      ds.forEach(function (d) {
        Object.keys(L[d]).forEach(function (sid) {
          var e = L[d][sid], pc = e.total ? Math.round(e.rec / e.total * 100) : 0, fu = followUp(L, d, sid).length;
          rows.push('<tr class="lr" data-d="' + esc(d) + '" style="cursor:pointer"><td>🖼️ ' + DAYS[new Date(d.replace(/\//g, '-') + 'T00:00').getDay()] + ' ' + esc(d) + '</td><td>' + esc(e.name) + '</td><td class="n">' + e.rec + '/' + e.total + '</td><td class="n" style="color:' + (pc >= 90 ? '#34d399' : pc >= 70 ? '#fbbf24' : '#f87171') + '">' + pc + '%</td><td class="n">' + e.admin + '</td><td class="n">' + (e.read ? e.absent.length : '—') + '</td><td class="n">' + (fu || '') + '</td></tr>');
        });
      });
      body.innerHTML = '<table class="sum"><tr><th>اليوم</th><th>المدرسة</th><th>مرصود</th><th>النسبة</th><th>رُصد إدارياً</th><th>الغياب</th><th>متابعة</th></tr>' + rows.join('') + '</table>' +
        '<div class="s">اضغط على أي يوم لإخراج تقريره PDF. «—» في الغياب: لم تُقرأ الحصص المرصودة ذلك اليوم. «متابعة»: طلاب غائبون يومين متتاليين فأكثر.</div>';
    }
    var td = slash(new Date()), redoS = Object.keys(L[td] || {}).filter(function (sid) { return (L[td][sid].ids || []).length; });
    $('sme-foot').innerHTML = (redoS.length ? '<button class="b go" id="sme-redo">🛠️ إعادة رصد حصص اليوم الإدارية (' + redoS.reduce(function (a, sid) { return a + L[td][sid].ids.length; }, 0) + ')</button>' : '') +
      (ds.length ? '<button class="b pic" id="sme-wk">📄 تقرير آخر 5 أيام (PDF)</button><button class="b sec" id="sme-clr">🗑️ مسح السجل</button>' : '') + '<button class="b sec" id="sme-cl">إغلاق</button>';
    $('sme-cl').onclick = function () { root.remove(); root = null; };
    if (redoS.length) $('sme-redo').onclick = function () {
      if (!confirm('سيُعاد رصد الحصص التي رصدتها الأداة اليوم فقط، بنسخ الغياب من حصص المعلمين من جديد. متابعة؟')) return;
      W.__smEngine.open({ closing: true, redo: true, schools: redoS.map(function (sid) { return { id: sid, name: L[td][sid].name }; }), currentSchoolId: redoS[0], concurrency: 3 });
    };
    if (!ds.length) return;
    body.querySelectorAll('tr.lr').forEach(function (tr) { tr.onclick = function () { closingImage(tr.dataset.d); }; });
    $('sme-clr').onclick = function () { if (confirm('مسح سجل الأيام من هذا الجهاز؟')) { try { localStorage.removeItem(LKEY); } catch (e) {} showLog(); } };
    $('sme-wk').onclick = function () {
      var last = ds.slice(0, 5), agg = {}, lines = [], fu = {};
      last.forEach(function (d) {
        Object.keys(L[d]).forEach(function (sid) {
          var e = L[d][sid], a = agg[sid] = agg[sid] || { name: e.name, rec: 0, total: 0, admin: 0, abs: 0 };
          a.rec += e.rec; a.total += e.total; a.admin += e.admin; a.abs += e.absent.length;
          lines.push(DAYS[new Date(d.replace(/\//g, '-') + 'T00:00').getDay()] + ' ' + fdate(d) + (Object.keys(L[d]).length > 1 ? ' — ' + e.name : '') + ' — مرصود ⁦' + e.rec + '/' + e.total + '⁩ — إدارياً ' + e.admin + ' — غياب ' + (e.read ? e.absent.length : '—'));
          followUp(L, d, sid).forEach(function (x) { var k = x.n + '|' + x.c; if (!fu[k] || fu[k].days < x.days) fu[k] = x; });
        });
      });
      var cv = drawReport({
        title: 'تقرير رصد الحضور', sub: 'من ' + fdate(last[last.length - 1]) + ' إلى ' + fdate(last[0]),
        schools: Object.keys(agg).map(function (k) { var a = agg[k]; return { name: a.name, rec: a.rec, total: a.total, extra: 'رُصد إدارياً: ' + a.admin + ' حصة · مجموع الغياب: ' + a.abs }; }),
        sections: [{ h: '📅 الأيام', lines: lines }, { h: '🔁 يحتاج متابعة', color: '#f59e0b', lines: Object.keys(fu).map(function (k) { var x = fu[k]; return x.n + ' — ' + x.c + ' — ' + x.days + ' أيام متتالية'; }) }]
      });
      deliverImage(cv, 'تقرير-الأيام-' + last[0].replace(/\//g, '-') + '.png');
    };
  }

  /* ---------- 3) الرصد مع إعادة المحاولة والتحقق ---------- */
  async function runSelected(un) {
    var picked = visibleChecks($('sme-body'), true).map(function (c) { return +c.dataset.i; });
    if (!picked.length) { alert('حدّد حصة واحدة على الأقل.'); return; }
    var cfg = S.cfg;
    var plist = picked.map(function (i) { return un[i]; });
    attachPlans(plist);
    var nPlan = plist.reduce(function (a, p) { return a + Object.keys(p.plan || {}).length; }, 0);
    var msg = 'سيتم رصد ' + picked.length + ' حصة' + (cfg.schools.length > 1 ? ' في ' + cfg.schools.length + ' مدرسة' : '') + '.\n' +
      (nPlan ? '🧠 حالات غياب منسوخة/معدّلة: ' + nPlan + ' (طالب×حصة)\n' : '') +
      (cfg.absNames.length ? '📋 قائمة الغياب (' + cfg.absNames.length + ') تُرصد غائبة.\n' : '') +
      'الباقون يُرصدون حاضرين.\n\nمتابعة؟';
    if (!confirm(msg)) return;
    primeAudio(); keepAwake(true);
    S.busy = true; S.stats = { absent: {}, noAbsentOption: 0 };
    $('sme-foot').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    $('sme-body').querySelectorAll('input').forEach(function (b) { b.disabled = true; });
    var items = picked.map(function (i) { return { p: un[i], i: i, err: '' }; });
    var done = 0;
    var pending = items.map(function (it) { return it.p; });
    rSave(pending);

    async function attempt(list, label) {
      done = 0;
      await pool(list, cfg.concurrency, async function (it) {
        for (var t = 0; t < 3; t++) {
          try {
            await recordOne(it.p, cfg.reason, deciderFor(it.p), S.stats); it.err = '';
            var pi = pending.indexOf(it.p); if (pi > -1) { pending.splice(pi, 1); rSave(pending); }
            break;
          }
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
    keepAwake(false);
    rSave([]);
    S.failed = items.filter(function (it) { return it.err; });
    notifyDone(!S.failed.length);
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
    try { saveLog(); } catch (e) {}
    $('sme-foot').innerHTML = (S.failed.length ? '<button class="b go" id="sme-rf">🔁 إعادة محاولة الفاشل (' + S.failed.length + ')</button>' : '') +
      (cfg.closing ? '<button class="b go" id="sme-ci">🔒 تقرير اليوم (PDF)</button>' : '') +
      '<button class="b pic" id="sme-img">🖼️ صورة نسب الرصد</button><button class="b sec" id="sme-log">📅 سجل الأيام</button><button class="b sec" id="sme-re">🔄 فحص من جديد</button>';
    if (cfg.closing) { $('sme-ci').onclick = closingImage; }
    $('sme-log').onclick = showLog;
    if (S.failed.length) $('sme-rf').onclick = function () { var f = S.failed.map(function (x) { return x.p; }); runList(f); };
    $('sme-img').onclick = makeImage;
    $('sme-re').onclick = start;
    progress(1, 1, 'اكتمل');
    if (cfg.closing && !S.failed.length) setTimeout(closingImage, 300);
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
    if (c.reportOnly) $('sme-sub').textContent += ' — فحص وتقرير فقط';
    if (c.closing) $('sme-sub').textContent = '🔒 إقفال اليوم — ' + c.schools.map(function (s) { return s.name; }).join(' + ');
    S.busy = true; keepAwake(true);
    S.groups = {}; S.mapOpen = false;
    try { await scan(); } catch (e) { S.scanErrors.push({ school: '', classroom: '', err: e.message }); }
    try { if (S.periods.length) await buildGroups(); } catch (e) { S.scanErrors.push({ school: '', classroom: 'قراءة الحصص المرصودة', err: e.message }); }
    S.busy = false; keepAwake(false);
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

  // أسماء الغائبين: سطر لكل اسم، أو كشف نور ملصوق (أعمدة مفصولة بجدولة/فواصل)
  function parseNames(lines) {
    var out = [], seen = {};
    lines.join('\n').split(/\r?\n/).forEach(function (ln) {
      var cells = ln.split(/\t|\s{2,}|[,،;|]/).map(function (c) { return c.trim(); }).filter(Boolean), pick = '';
      if (cells.length <= 1) pick = (cells[0] || '').replace(/^[0-9\u0660-\u0669.\-)\s]+/, '');
      else pick = cells.filter(function (c) { return /[\u0600-\u06FF]/.test(c) && c.trim().split(/\s+/).length >= 2 && !/الصف|فصل|الفصل|غائب|حاضر|بعذر|متأخر|الحصة/.test(c); })
        .sort(function (a, b) { return b.split(/\s+/).length - a.split(/\s+/).length; })[0] || '';
      pick = pick.replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
      var k = norm(pick);
      if (k.length > 1 && !seen[k]) { seen[k] = 1; out.push(pick); }
    });
    return out;
  }

  W.__smEngine = {
    showLog: showLog,
    dayImage: function (ds) { closingImage(ds); },
    detectSchool: detectSchool,
    pending: function () { var r = rLoad(); return r ? { count: r.items.length, at: r.at } : null; },
    discard: function () { try { localStorage.removeItem(RKEY); } catch (e) {} },
    resume: function () {
      var r = rLoad(); if (!r) return false;
      S.cfg = Object.assign({ reportOnly: false }, r.cfg); S.resumed = true;
      shell();
      $('sme-sub').textContent = 'استئناف رصد غير مكتمل — ' + r.items.length + ' حصة';
      S.periods = r.items; chips();
      $('sme-foot').innerHTML = '';
      runList(r.items);
      return true;
    },
    open: function (cfg) {
      if (!cfg.schools || !cfg.schools.length) {
        var cur = detectSchool();
        if (!cur) { alert('لم أتمكن من معرفة المدرسة من هذه الصفحة. افتح صفحة «الفصول المدرسية» في منصة مدرستي ثم حاول مجدداً.'); return false; }
        cfg.schools = [cur]; cfg.currentSchoolId = cur.id;
      }
      var raw = cfg.mode === 'abs' ? parseNames(cfg.names || []) : [];
      if (cfg.closing) { var t = new Date(); cfg.dates = [t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')]; cfg.copy = true; cfg.reportOnly = false; }
      S.cfg = {
        dates: cfg.dates || [], schools: cfg.schools || [], currentSchoolId: cfg.currentSchoolId,
        concurrency: Math.min(5, Math.max(1, cfg.concurrency || 3)),
        reason: (cfg.reason || '').trim() || REASON_DEFAULT,
        absRaw: raw,
        absNames: raw.map(norm),
        reportOnly: !!cfg.reportOnly,
        copy: cfg.copy !== false,
        closing: !!cfg.closing,
        redo: !!cfg.redo
      };
      S.resumed = false;
      start();
      return true;
    }
  };
})();
