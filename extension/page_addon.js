/*
 * يعمل داخل صفحة منصة مدرستي (MAIN world).
 * يعترض طلب حفظ الرصد: في وضع «يوجد غياب» يرصد الأسماء المحددة غائبين والباقي حاضرين.
 * الإعدادات تأتي من الإضافة عبر window.__smAbsCfg
 */
(function () {
  'use strict';
  var W = window;

  function norm(s) {
    return (s || '')
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/\s+/g, ' ').trim();
  }

  function readCfg() {
    var c = W.__smAbsCfg || {};
    return {
      mode: c.mode === 'abs' ? 'abs' : 'all',
      names: (c.names || []).map(norm).filter(function (x) { return x.length > 1; })
    };
  }

  // إذا كانت الإضافة محمّلة مسبقاً، نكتفي بتحديث الإعدادات
  if (W.__smAbsExt) { W.__smAbsExt.st = readCfg(); return; }

  var api = W.__smAbsExt = { st: readCfg(), report: { matched: {}, periods: 0, noAbsentOption: 0 } };
  var lastForm = null, pending = Promise.resolve();

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
    var keys = Object.keys(groups);
    if (!keys.length) return null;
    var fields = {};
    keys.forEach(function (n) {
      var g = groups[n];
      fields[n] = { text: g.row ? norm(g.row.textContent) : '', absent: pickAbsent(g.opts) };
    });
    return { fields: fields };
  }
  function applyAbs(body) {
    var st = api.st, rep = api.report;
    var sp = new URLSearchParams(body), changed = 0;
    rep.periods++;
    Object.keys(lastForm.fields).forEach(function (n) {
      var f = lastForm.fields[n];
      var hit = st.names.find(function (nm) { return f.text.indexOf(nm) > -1; });
      if (!hit) return;
      if (!f.absent) { rep.noAbsentOption++; return; }
      sp.set(n, f.absent); changed++;
      rep.matched[hit] = (rep.matched[hit] || 0) + 1;
    });
    lastForm = null;
    return sp.toString();
  }

  var _fetch = W.fetch.bind(W);
  W.fetch = function (input, init) {
    var st = api.st;
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!(st.mode === 'abs' && st.names.length)) return _fetch(input, init);

    var isSave = /SaveAttendStudents|UpdateAttendStudents/i.test(url);
    if (isSave && init && typeof init.body === 'string') {
      return pending.then(function () {
        var i2 = lastForm ? Object.assign({}, init, { body: applyAbs(init.body) }) : init;
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
})();
