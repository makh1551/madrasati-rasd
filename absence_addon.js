/*
 * إضافة خيار الغياب لأداة رصد الحضور — منصة مدرستي
 * الافتراضي: الجميع حاضرون (تعمل الأداة الأصلية كما هي دون أي تعديل).
 * اختياري: «يوجد غياب» → تلصق أسماء الغائبين فيُرصَدون غائبين تلقائياً والباقي حاضرين.
 */
(function () {
  'use strict';
  var ORIGINAL = 'https://cdn.jsdelivr.net/gh/makh1551/madrasati-rasd@main/attendance_tracker.js';
  var W = window;
  if (W.__smAbs) { W.__smAbs.toggle(); return; }

  /* ---------- أدوات ---------- */
  function norm(s) {
    return (s || '')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/\s+/g, ' ').trim();
  }
  var d = new Date();
  var KEY = 'smAbs_' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); // تُمسح القائمة تلقائياً كل يوم
  var st = { mode: 'all', raw: '', names: [] };
  try { var s0 = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s0) st = s0; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var lastForm = null, pending = Promise.resolve();
  var report = { matched: {}, periods: 0, noAbsentOption: 0 };

  /* ---------- قراءة نموذج الرصد ---------- */
  function labelOf(doc, r) {
    var t = '';
    if (r.id) { var l = doc.querySelector('label[for="' + CSS.escape(r.id) + '"]'); if (l) t = l.textContent; }
    if (!t) { var p = r.closest('label'); if (p) t = p.textContent; }
    if (!t && r.nextSibling) t = r.nextSibling.textContent || '';
    if (!t) t = r.getAttribute('title') || r.getAttribute('data-original-title') || '';
    return norm(t);
  }
  var ABS = norm('غائب'), EXC = norm('عذر');
  function pickAbsent(opts) {
    var o = opts.find(function (x) { return x.l.indexOf(ABS) > -1 && x.l.indexOf(EXC) < 0; }) ||
            opts.find(function (x) { return x.l.indexOf(ABS) > -1; });
    return o ? o.v : null;
  }
  function parseForm(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var form = doc.querySelector('form#SaveAttendStudents, form#UpdateAttendStudents, form[action*="SaveAttendStudents"]');
    if (!form) return null;
    var groups = {};
    form.querySelectorAll('input[type=radio]').forEach(function (r) {
      var n = r.name;
      if (!n || !/AttendStatusId$/i.test(n)) return;
      var g = groups[n] || (groups[n] = { opts: [], row: r.closest('tr') || r.parentElement });
      g.opts.push({ v: r.value, l: labelOf(doc, r) });
    });
    var fields = {}, keys = Object.keys(groups);
    if (!keys.length) return null;
    keys.forEach(function (n) {
      var g = groups[n];
      fields[n] = { text: g.row ? norm(g.row.textContent) : '', absent: pickAbsent(g.opts) };
    });
    return { fields: fields };
  }

  /* ---------- تطبيق الغياب على طلب الحفظ ---------- */
  function applyAbs(body) {
    var sp = new URLSearchParams(body), changed = 0;
    report.periods++;
    Object.keys(lastForm.fields).forEach(function (n) {
      var f = lastForm.fields[n];
      var hit = st.names.find(function (nm) { return nm && f.text.indexOf(nm) > -1; });
      if (!hit) return;
      if (!f.absent) { report.noAbsentOption++; return; }
      sp.set(n, f.absent); changed++;
      report.matched[hit] = (report.matched[hit] || 0) + 1;
    });
    lastForm = null;
    if (changed) console.log('🟠 [خيار الغياب] رُصد ' + changed + ' طالب غائباً في هذه الحصة');
    return sp.toString();
  }

  /* ---------- اعتراض الطلبات (يعمل فقط في وضع «يوجد غياب») ---------- */
  var _fetch = W.fetch.bind(W);
  W.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var active = st.mode === 'abs' && st.names.length;
    if (!active) return _fetch(input, init);

    var isSave = /SaveAttendStudents|UpdateAttendStudents/i.test(url);
    if (isSave && init && typeof init.body === 'string') {
      return pending.then(function () {
        var i2 = init;
        if (lastForm) i2 = Object.assign({}, init, { body: applyAbs(init.body) });
        return _fetch(input, i2);
      });
    }
    var p = _fetch(input, init);
    if (!isSave && /Attend/i.test(url)) {
      pending = p.then(function (res) { return res.clone().text(); }).then(function (t) {
        var h = t;
        try { var j = JSON.parse(t); if (j && j.html) h = j.html; } catch (e) {}
        var f = parseForm(h);
        if (f) lastForm = f; else if (/IndexDirector/i.test(url)) lastForm = null;
      }).catch(function () {});
    }
    return p;
  };

  /* ---------- الواجهة ---------- */
  var box = document.createElement('div');
  box.id = 'sm-abs-panel';
  box.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:10000002;width:300px;max-width:calc(100vw - 32px);' +
    'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;padding:14px;direction:rtl;' +
    'font-family:Tahoma,Segoe UI,sans-serif;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.4);';
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<b style="font-size:14px">خيار الغياب قبل الرصد</b>' +
      '<button id="sm-abs-x" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">×</button></div>' +
    '<label style="display:block;margin:6px 0;cursor:pointer"><input type="radio" name="sm-abs-mode" value="all"> ✅ الجميع حاضرون</label>' +
    '<label style="display:block;margin:6px 0;cursor:pointer"><input type="radio" name="sm-abs-mode" value="abs"> ⚠️ يوجد غياب</label>' +
    '<div id="sm-abs-wrap" style="display:none;margin-top:6px">' +
      '<div style="color:#94a3b8;font-size:12px;margin-bottom:4px">اسم كل غائب في سطر (الاسم الأول واسم الأب على الأقل، كما في المنصة):</div>' +
      '<textarea id="sm-abs-names" rows="5" style="width:100%;box-sizing:border-box;background:#1e293b;color:#f1f5f9;border:1px solid #475569;border-radius:6px;padding:6px;font-size:13px;direction:rtl"></textarea>' +
    '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px">' +
      '<button id="sm-abs-run" style="flex:2;background:#0284c7;color:#fff;border:none;border-radius:6px;padding:8px;font-weight:bold;cursor:pointer">حفظ وفتح أداة الرصد</button>' +
      '<button id="sm-abs-rep" style="flex:1;background:#334155;color:#e2e8f0;border:none;border-radius:6px;padding:8px;cursor:pointer">تقرير</button>' +
    '</div>' +
    '<div id="sm-abs-status" style="margin-top:8px;font-size:12px;color:#94a3b8"></div>';
  document.body.appendChild(box);

  var $ = function (id) { return document.getElementById(id); };
  function refresh() {
    box.querySelectorAll('input[name=sm-abs-mode]').forEach(function (r) { r.checked = r.value === st.mode; });
    $('sm-abs-wrap').style.display = st.mode === 'abs' ? 'block' : 'none';
    $('sm-abs-names').value = st.raw || '';
    $('sm-abs-status').textContent = st.mode === 'abs' && st.names.length
      ? 'الوضع الحالي: ' + st.names.length + ' غائب، والباقون حاضرون'
      : 'الوضع الحالي: جميع الطلاب حاضرون';
  }
  box.querySelectorAll('input[name=sm-abs-mode]').forEach(function (r) {
    r.onchange = function () { st.mode = r.value; $('sm-abs-wrap').style.display = st.mode === 'abs' ? 'block' : 'none'; };
  });
  $('sm-abs-x').onclick = function () { box.style.display = 'none'; };

  var loaded = false;
  function loadOriginal() {
    var s = document.createElement('script');
    s.src = ORIGINAL;
    document.body.appendChild(s);
    loaded = true;
  }
  $('sm-abs-run').onclick = function () {
    st.raw = $('sm-abs-names').value;
    st.names = st.raw.split(/\n|،|,/).map(norm).filter(function (x) { return x.length > 1; });
    if (st.mode === 'abs' && !st.names.length) { alert('اكتب أسماء الغائبين أو اختر «الجميع حاضرون».'); return; }
    save(); refresh();
    box.style.display = 'none';
    var m = document.getElementById('sm-madrasati-tracker-modal');
    if (!loaded || !m) loadOriginal(); else m.style.display = 'flex';
  };
  $('sm-abs-rep').onclick = function () {
    if (st.mode !== 'abs' || !st.names.length) { alert('الوضع: الجميع حاضرون — لا يوجد غياب مسجّل.'); return; }
    var lines = st.names.map(function (n) {
      return (report.matched[n] ? '✅ ' + n + ' — رُصد غائباً في ' + report.matched[n] + ' حصة' : '❌ ' + n + ' — لم يُعثر عليه بعد');
    });
    var msg = 'حصص حُفظت في هذه الجلسة: ' + report.periods + '\n\n' + lines.join('\n');
    if (report.noAbsentOption) msg += '\n\n⚠️ تعذّر تحديد خيار «غائب» في ' + report.noAbsentOption + ' حالة — راجعها يدوياً.';
    alert(msg);
  };

  W.__smAbs = { toggle: function () { refresh(); box.style.display = box.style.display === 'none' ? 'block' : 'none'; } };
  refresh();
})();
