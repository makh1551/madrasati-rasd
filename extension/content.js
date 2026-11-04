/*
 * زر «⚡ رصد» العائم ونافذته داخل صفحات منصة مدرستي.
 * تعمل مباشرة داخل الصفحة مع المحرك (engine.js المحمّل معها)، دون أي واجهات خاصة بالمتصفح،
 * لذلك تعمل على Orion في الجوال كما تعمل على Chrome وEdge.
 */
(function () {
  'use strict';
  if (window.top !== window || document.getElementById('sm-rasd-host')) return;

  var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  var now = new Date();
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var TODAY = ymd(now);
  function weekDates(off) {
    var s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + off * 7);
    return DAY_NAMES.map(function (n, i) {
      var d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
      return { name: n, date: ymd(d), label: d.getDate() + '/' + (d.getMonth() + 1), future: ymd(d) > TODAY };
    });
  }
  function weekOptions() {
    var o = '';
    for (var k = 0; k >= -10; k--) {
      var w = weekDates(k), r = w[0].label + ' – ' + w[4].label;
      var t = k === 0 ? 'الأسبوع الحالي' : k === -1 ? 'الأسبوع الماضي' : k === -2 ? 'قبل أسبوعين' : 'قبل ' + (-k) + ' أسابيع';
      o += '<option value="' + k + '">' + t + ' (' + r + ')</option>';
    }
    return o;
  }
  function pickWeeks(n) {   // كل الأيام الماضية في آخر n أسابيع (يشمل الحالي)
    selected = {};
    for (var k = 0; k > -n; k--) weekDates(k).forEach(function (d) { if (!d.future) selected[d.date] = true; });
    renderDays();
  }
  var store = {
    get: function (keys) { return new Promise(function (r) { try { chrome.storage.local.get(keys, function (v) { r(v || {}); }); } catch (e) { r({}); } }); },
    set: function (o) { try { chrome.storage.local.set(o); } catch (e) {} }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- المضيف: Shadow DOM حتى لا تتأثر النافذة بتنسيقات المنصة ---------- */
  var host = document.createElement('div');
  host.id = 'sm-rasd-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;inset:auto';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:Tahoma,"Segoe UI",Arial,sans-serif}' +
    '.fab{position:fixed;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:6px;min-height:50px;padding:0 20px;border:0;border-radius:999px;background:#0284c7;color:#fff;font-weight:700;font-size:16px;box-shadow:0 10px 26px rgba(2,132,199,.45);cursor:pointer;direction:rtl;z-index:2147483000}' +
    '.back{position:fixed;inset:0;background:rgba(2,6,23,.6);display:flex;align-items:flex-end;justify-content:center;z-index:2147483001;direction:rtl}' +
    '.sheet{background:#0f172a;color:#e2e8f0;width:100%;max-width:460px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:0 0 calc(16px + env(safe-area-inset-bottom,0px));font-size:16px;-webkit-overflow-scrolling:touch}' +
    '@media (min-width:700px){.back{align-items:center}.sheet{border-radius:18px;max-height:88vh}}' +
    '.hd{position:sticky;top:0;background:#0f172a;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px 12px;border-bottom:1px solid #334155;z-index:1}' +
    '.hd b{font-size:19px;color:#f8fafc}.hd small{display:block;color:#94a3b8;font-size:13px;margin-top:2px}' +
    '.x{width:44px;height:44px;border-radius:50%;border:0;background:#1e293b;color:#e2e8f0;font-size:24px;cursor:pointer;flex-shrink:0}' +
    '.bd{padding:14px 18px;display:flex;flex-direction:column;gap:12px}' +
    '.opt{display:flex;align-items:center;gap:10px;padding:14px;border:1.5px solid #334155;border-radius:12px;background:#1e293b;cursor:pointer;font-size:16px}' +
    '.opt.on{border-color:#0284c7}.opt input{width:20px;height:20px;margin:0}' +
    'textarea{width:100%;min-height:110px;background:#1e293b;color:#f1f5f9;border:1px solid #475569;border-radius:10px;padding:10px;font-size:16px;resize:vertical}' +
    '.hint{color:#94a3b8;font-size:13.5px;margin-bottom:6px}' +
    '.sec{border:1px solid #334155;border-radius:12px;padding:12px;background:#1e293b;display:flex;flex-direction:column;gap:10px}' +
    '.row{display:flex;align-items:center;gap:10px}.lbl{color:#94a3b8;font-size:14px;white-space:nowrap}' +
    'select{flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:10px;padding:11px;font-size:16px}' +
    '.days{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
    '.day{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 4px;border:1.5px solid #334155;border-radius:10px;cursor:pointer;font-size:15px;background:#0f172a;color:#e2e8f0;user-select:none}' +
    '.day small{color:#94a3b8;font-size:12px}.day.on{background:#0284c7;border-color:#38bdf8;color:#fff}.day.on small{color:#e0f2fe}.day.dis{opacity:.35;cursor:default}' +
    '.qp{display:flex;justify-content:space-between;gap:8px}.qp button{background:none;border:0;color:#38bdf8;font-size:14.5px;padding:6px 0;cursor:pointer}' +
    '.sc{display:flex;align-items:center;gap:10px;font-size:15px;padding:4px 0}.sc input{width:20px;height:20px;margin:0}' +
    '.go{position:sticky;bottom:0;width:100%;min-height:56px;border:0;border-radius:14px;background:#047857;color:#fff;font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45)}' +
    '.cnt{font-size:14px;color:#38bdf8;font-weight:700}.nm{flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:8px;padding:8px 10px;font-size:15px}.del{background:none;border:0;color:#64748b;font-size:22px;width:36px;height:36px;cursor:pointer}' +
    '.rep{width:100%;min-height:50px;border:1.5px solid #334155;border-radius:14px;background:#1e293b;color:#e2e8f0;font-size:15.5px;font-weight:700;cursor:pointer}' +
    '.res{border:1.5px solid #f59e0b;background:rgba(245,158,11,.08);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px;font-size:15px;color:#fde68a}.res .qp button{font-weight:700;font-size:15.5px}' +
    '.lock{width:100%;min-height:58px;border:0;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#0284c7);color:#fff;font-size:17.5px;font-weight:700;cursor:pointer;box-shadow:0 8px 22px rgba(124,58,237,.35)}.lock small{display:block;font-size:12.5px;font-weight:normal;opacity:.9;margin-top:2px}' +
    '.ck{display:flex;align-items:flex-start;gap:10px;font-size:15px;cursor:pointer}.ck input{width:20px;height:20px;margin:2px 0 0;flex-shrink:0}.ck small{display:block;color:#94a3b8;font-size:12.5px;margin-top:2px}' +
    '.lnk{background:none;border:0;color:#38bdf8;font-size:15px;padding:8px 0;cursor:pointer;text-align:center}' +
    '.go:disabled{opacity:.6}.msg{font-size:14px;line-height:1.6;color:#94a3b8;min-height:20px}.msg.err{color:#f87171}' +
    '</style>' +
    '<button class="fab" type="button" id="fab" aria-label="رصد الحضور السريع"><span aria-hidden="true">⚡</span><span>رصد</span></button>';

  var $ = function (id) { return root.getElementById(id); };
  var panel = null, selected = {}, schools = [], current = null;

  function close() { if (panel) { panel.remove(); panel = null; } $('fab').style.display = 'flex'; }

  var NAME_RE = /^(ابتدائية|متوسطة|ثانوية|مدرسة|مدارس|مجمع|روضة|معهد|الابتدائية|المتوسطة|الثانوية)\s+\S/;
  function nameIn(doc) {
    var best = '';
    doc.querySelectorAll('span,small,p,div,a,h1,h2,h3,h4,h5,h6,li,label').forEach(function (el) {
      if (el.children.length > 2) return;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 6 && t.length < 90 && NAME_RE.test(t) && (!best || t.length < best.length)) best = t;
    });
    return best;
  }
  async function schoolName() {
    var n = nameIn(document);
    if (n) return n;
    try {
      var r = await fetch('/', { credentials: 'include' });
      if (r.ok) n = nameIn(new DOMParser().parseFromString(await r.text(), 'text/html'));
    } catch (e) {}
    return n;
  }

  async function open() {
    var st = await store.get(['mode', 'names', 'namesDay', 'speed', 'schools', 'copy']);
    current = window.__smEngine && window.__smEngine.detectSchool ? window.__smEngine.detectSchool() : null;
    schools = Array.isArray(st.schools) ? st.schools : [];
    if (current) {
      if (!current.name || current.name === 'مدرستي') { var nm = await schoolName(); if (nm) current.name = nm; }
      var ex = schools.find(function (s) { return s.id === current.id; });
      if (ex) { if (!ex.named && current.name && current.name !== 'مدرستي') ex.name = current.name; }
      else { schools.forEach(function (s) { s.on = false; }); schools.push({ id: current.id, name: current.name, on: true }); }
      store.set({ schools: schools });
    }
    selected = {}; selected[TODAY] = true;
    var mode = st.mode === 'abs' ? 'abs' : 'all';
    var names = st.namesDay === TODAY ? (st.names || '') : '';

    panel = document.createElement('div');
    panel.className = 'back';
    panel.innerHTML =
      '<div class="sheet" role="dialog" aria-label="رصد الحضور السريع">' +
      '<div class="hd"><div><b>⚡ رصد الحضور السريع</b><small>يوم، أيام مختارة، أو أسبوع كامل</small></div><button class="x" type="button" id="x" aria-label="إغلاق">×</button></div>' +
      '<div class="bd">' +
      '<div class="res" id="res" style="display:none"><div id="resT"></div><div class="qp"><button type="button" id="resGo">▶️ أكمل الرصد</button><button type="button" id="resNo">تجاهل</button></div></div>' +
      '<button class="lock" type="button" id="lock">🔒 إقفال اليوم<small>فحص اليوم ← نسخ الغياب من الحصص المرصودة ← رصد ← صورة تقرير اليوم</small></button>' +
      '<label class="opt" id="oAll"><input type="radio" name="m" value="all"> ✅ جميع الطلاب حاضرون</label>' +
      '<label class="opt" id="oAbs"><input type="radio" name="m" value="abs"> ⚠️ يوجد غياب</label>' +
      '<div id="absBox" style="display:none"><div class="hint">اسم كل غائب في سطر (الاسم الأول واسم الأب على الأقل)، أو الصق كشف غياب نور الصباحي كما هو:</div><textarea id="names"></textarea></div>' +
      '<div class="sec"><div class="row"><span class="lbl">الأسبوع:</span><select id="week">' + weekOptions() + '</select></div>' +
      '<div class="days" id="days"></div>' +
      '<div class="qp"><button type="button" id="pT">اليوم فقط</button><button type="button" id="pA">هذا الأسبوع كامل</button></div>' +
      '<div class="qp"><button type="button" id="p4">آخر 4 أسابيع</button><button type="button" id="p10">آخر 10 أسابيع</button><button type="button" id="pN">إلغاء الكل</button></div>' +
      '<div class="cnt" id="cnt"></div></div>' +
      '<div class="sec"><div class="lbl">المدارس:</div><div id="sch"></div></div>' +
      '<label class="ck"><input type="checkbox" id="copy"><span>🧠 نسخ الغياب من الحصص المرصودة في اليوم نفسه<small>الغائب في حصة رصدها المعلم يُرصد غائباً في حصص فصله غير المرصودة، والمتأخر حاضراً. تظهر الاستثناءات في «خريطة الغياب» قبل الحفظ.</small></span></label>' +
      '<div class="sec"><div class="row"><span class="lbl">السرعة:</span><select id="speed"><option value="1">عادية (حصة بحصة)</option><option value="2">سريعة (حصتان معاً)</option><option value="3">أسرع (3 حصص معاً)</option><option value="4">قصوى (4 حصص معاً)</option></select></div></div>' +
      '<div class="msg" id="msg"></div>' +
      '<button class="go" type="button" id="go">🔍 فحص ومعاينة ثم رصد</button>' +
      '<button class="rep" type="button" id="rep">📊 فحص وتقرير فقط (بدون رصد)</button>' +
      '<button class="lnk" type="button" id="log">📅 سجل الأيام والتقرير الأسبوعي</button>' +
      '</div></div>';
    root.appendChild(panel);
    $('fab').style.display = 'none';

    root.querySelector('input[name=m][value="' + mode + '"]').checked = true;
    $('names').value = names;
    $('speed').value = st.speed || '3';
    $('copy').checked = st.copy !== false;
    $('copy').onchange = function () { store.set({ copy: $('copy').checked }); };
    $('lock').onclick = function () { go(false, true); };
    $('log').onclick = function () { if (window.__smEngine && window.__smEngine.showLog) { close(); window.__smEngine.showLog(); } };
    paintMode(); renderDays(); renderSchools();

    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    $('x').onclick = close;
    root.querySelectorAll('input[name=m]').forEach(function (r) { r.onchange = function () { paintMode(); save(); }; });
    $('names').oninput = save;
    $('week').onchange = renderDays;   // التحديد محفوظ عند التنقل بين الأسابيع
    $('pT').onclick = function () { $('week').value = '0'; selected = {}; selected[TODAY] = true; renderDays(); };
    $('pA').onclick = function () { weekDates(parseInt($('week').value, 10)).forEach(function (d) { if (!d.future) selected[d.date] = true; }); renderDays(); };
    $('p4').onclick = function () { pickWeeks(4); };
    $('p10').onclick = function () { pickWeeks(10); };
    $('pN').onclick = function () { selected = {}; renderDays(); };
    $('speed').onchange = function () { store.set({ speed: $('speed').value }); };
    $('go').onclick = function () { go(false); };
    $('rep').onclick = function () { go(true); };
    var pend = window.__smEngine && window.__smEngine.pending && window.__smEngine.pending();
    if (pend) {
      var mins = Math.round((Date.now() - pend.at) / 60000);
      $('resT').textContent = '⚠️ يوجد رصد لم يكتمل: ' + pend.count + ' حصة متبقية (قبل ' + (mins < 60 ? mins + ' دقيقة' : Math.round(mins / 60) + ' ساعة') + ').';
      $('res').style.display = 'flex';
      $('resGo').onclick = function () { if (window.__smEngine.resume()) close(); };
      $('resNo').onclick = function () { window.__smEngine.discard(); $('res').style.display = 'none'; };
    }
  }

  function mode() { var r = root.querySelector('input[name=m]:checked'); return r ? r.value : 'all'; }
  function paintMode() {
    $('oAll').classList.toggle('on', mode() === 'all');
    $('oAbs').classList.toggle('on', mode() === 'abs');
    $('absBox').style.display = mode() === 'abs' ? 'block' : 'none';
  }
  function save() { store.set({ mode: mode(), names: $('names').value, namesDay: TODAY }); }
  function renderDays() {
    var box = $('days'); box.innerHTML = '';
    weekDates(parseInt($('week').value, 10)).forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'day' + (d.future ? ' dis' : '') + (selected[d.date] ? ' on' : '');
      b.innerHTML = '<span>' + d.name + '</span><small>' + d.label + '</small>';
      b.disabled = d.future;
      b.setAttribute('aria-pressed', selected[d.date] ? 'true' : 'false');
      if (!d.future) b.onclick = function () { selected[d.date] = !selected[d.date]; renderDays(); };
      box.appendChild(b);
    });
    var dates = Object.keys(selected).filter(function (k) { return selected[k]; });
    var weeks = {}; dates.forEach(function (k) { var p = k.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); weeks[ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()))] = 1; });
    $('cnt').textContent = dates.length ? 'المحدد: ' + dates.length + (dates.length > 2 && dates.length < 11 ? ' أيام' : ' يوماً') + ' في ' + Object.keys(weeks).length + (Object.keys(weeks).length > 2 && Object.keys(weeks).length < 11 ? ' أسابيع' : Object.keys(weeks).length === 2 ? ' أسبوعين' : ' أسبوع') : 'لم يُحدد أي يوم';
  }
  function pick(fn) {
    selected = {};
    weekDates(parseInt($('week').value, 10)).forEach(function (d) { if (!d.future && fn(d)) selected[d.date] = true; });
    renderDays();
  }
  function renderSchools() {
    var box = $('sch');
    if (!schools.length) { box.innerHTML = '<div class="hint">ستُكتشف المدرسة من الصفحة تلقائياً عند الفحص.</div>'; return; }
    box.innerHTML = '';
    schools.forEach(function (s, i) {
      var l = document.createElement('div'); l.className = 'sc';
      l.innerHTML = '<input type="checkbox" aria-label="تحديد المدرسة"' + (s.on ? ' checked' : '') + '>' +
        '<input class="nm" type="text" aria-label="اسم المدرسة" value="' + esc(s.name) + '">' +
        (current && s.id === current.id ? '<small style="color:#38bdf8;white-space:nowrap">الحالية</small>' : '') +
        '<button class="del" type="button" aria-label="حذف المدرسة من القائمة">×</button>';
      var ins = l.querySelectorAll('input');
      ins[0].onchange = function (e) { s.on = e.target.checked; store.set({ schools: schools }); };
      ins[1].onchange = function (e) { s.name = e.target.value.trim() || s.name; s.named = true; store.set({ schools: schools }); };
      l.querySelector('.del').onclick = function () { schools.splice(i, 1); store.set({ schools: schools }); renderSchools(); };
      box.appendChild(l);
    });
    box.insertAdjacentHTML('beforeend', '<div class="hint" style="margin:4px 0 0">اضغط على الاسم لتعديله. لإضافة مدرسة: افتح «قائمة المدارس» في المنصة، وانتقل إليها، ثم افتح هذه النافذة.</div>');
  }
  function say(t, err) { var m = $('msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }

  function go(reportOnly, closing) {
    save();
    var m = mode();
    var names = $('names').value.split(/\n/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
    if (!reportOnly && !closing && m === 'abs' && !names.length) return say('اكتب أسماء الغائبين، أو اختر «جميع الطلاب حاضرون».', true);
    var dates = closing ? [TODAY] : Object.keys(selected).filter(function (k) { return selected[k] && k <= TODAY; }).sort();
    if (!dates.length) return say('اختر يوماً واحداً على الأقل.', true);
    var chosen = schools.filter(function (s) { return s.on; }).map(function (s) { return { id: s.id, name: s.name }; });
    if (schools.length && !chosen.length) return say('اختر مدرسة واحدة على الأقل.', true);
    if (!window.__smEngine) return say('لم يُحمَّل محرك الرصد. حدّث الصفحة وحاول مجدداً.', true);
    try {
      var ok = window.__smEngine.open({ mode: m, names: names, dates: dates, schools: chosen,
        currentSchoolId: current && current.id, concurrency: parseInt($('speed').value, 10), reportOnly: !!reportOnly,
        copy: $('copy').checked, closing: !!closing });
      if (ok !== false) close();
    } catch (e) { say('حدث خطأ: ' + (e && e.message || e), true); }
  }

  root.getElementById('fab').addEventListener('click', function () { open().catch(function (e) { alert('تعذّر فتح النافذة: ' + (e && e.message || e)); }); });
  (document.body || document.documentElement).appendChild(host);
})();
