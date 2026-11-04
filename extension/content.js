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
    '.go:disabled{opacity:.6}.msg{font-size:14px;line-height:1.6;color:#94a3b8;min-height:20px}.msg.err{color:#f87171}' +
    '</style>' +
    '<button class="fab" type="button" id="fab" aria-label="رصد الحضور السريع"><span aria-hidden="true">⚡</span><span>رصد</span></button>';

  var $ = function (id) { return root.getElementById(id); };
  var panel = null, selected = {}, schools = [], current = null;

  function close() { if (panel) { panel.remove(); panel = null; } $('fab').style.display = 'flex'; }

  async function open() {
    var st = await store.get(['mode', 'names', 'namesDay', 'speed', 'schools']);
    current = window.__smEngine && window.__smEngine.detectSchool ? window.__smEngine.detectSchool() : null;
    schools = Array.isArray(st.schools) ? st.schools : [];
    if (current) {
      var ex = schools.find(function (s) { return s.id === current.id; });
      if (ex) { if (current.name && current.name !== 'مدرستي') ex.name = current.name; }
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
      '<label class="opt" id="oAll"><input type="radio" name="m" value="all"> ✅ جميع الطلاب حاضرون</label>' +
      '<label class="opt" id="oAbs"><input type="radio" name="m" value="abs"> ⚠️ يوجد غياب</label>' +
      '<div id="absBox" style="display:none"><div class="hint">اسم كل غائب في سطر (الاسم الأول واسم الأب على الأقل):</div><textarea id="names"></textarea></div>' +
      '<div class="sec"><div class="row"><span class="lbl">الأسبوع:</span><select id="week"><option value="0">الأسبوع الحالي</option><option value="-1">الأسبوع الماضي</option><option value="-2">قبل أسبوعين</option></select></div>' +
      '<div class="days" id="days"></div>' +
      '<div class="qp"><button type="button" id="pT">اليوم فقط</button><button type="button" id="pA">الأسبوع كامل</button><button type="button" id="pN">إلغاء التحديد</button></div></div>' +
      '<div class="sec"><div class="lbl">المدارس:</div><div id="sch"></div></div>' +
      '<div class="sec"><div class="row"><span class="lbl">السرعة:</span><select id="speed"><option value="1">عادية (حصة بحصة)</option><option value="2">سريعة (حصتان معاً)</option><option value="3">أسرع (3 حصص معاً)</option><option value="4">قصوى (4 حصص معاً)</option></select></div></div>' +
      '<div class="msg" id="msg"></div>' +
      '<button class="go" type="button" id="go">🔍 فحص ومعاينة ثم رصد</button>' +
      '</div></div>';
    root.appendChild(panel);
    $('fab').style.display = 'none';

    root.querySelector('input[name=m][value="' + mode + '"]').checked = true;
    $('names').value = names;
    $('speed').value = st.speed || '3';
    paintMode(); renderDays(); renderSchools();

    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });
    $('x').onclick = close;
    root.querySelectorAll('input[name=m]').forEach(function (r) { r.onchange = function () { paintMode(); save(); }; });
    $('names').oninput = save;
    $('week').onchange = function () { selected = {}; renderDays(); };
    $('pT').onclick = function () { $('week').value = '0'; pick(function (d) { return d.date === TODAY; }); };
    $('pA').onclick = function () { pick(function () { return true; }); };
    $('pN').onclick = function () { pick(function () { return false; }); };
    $('speed').onchange = function () { store.set({ speed: $('speed').value }); };
    $('go').onclick = go;
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
    schools.forEach(function (s) {
      var l = document.createElement('label'); l.className = 'sc';
      l.innerHTML = '<input type="checkbox"' + (s.on ? ' checked' : '') + '><span>' + esc(s.name) + (current && s.id === current.id ? ' <small style="color:#94a3b8">(الحالية)</small>' : '') + '</span>';
      l.querySelector('input').onchange = function (e) { s.on = e.target.checked; store.set({ schools: schools }); };
      box.appendChild(l);
    });
  }
  function say(t, err) { var m = $('msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }

  function go() {
    save();
    var m = mode();
    var names = $('names').value.split(/\n|،|,/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
    if (m === 'abs' && !names.length) return say('اكتب أسماء الغائبين، أو اختر «جميع الطلاب حاضرون».', true);
    var dates = weekDates(parseInt($('week').value, 10)).filter(function (d) { return selected[d.date] && !d.future; }).map(function (d) { return d.date; });
    if (!dates.length) return say('اختر يوماً واحداً على الأقل.', true);
    var chosen = schools.filter(function (s) { return s.on; }).map(function (s) { return { id: s.id, name: s.name }; });
    if (schools.length && !chosen.length) return say('اختر مدرسة واحدة على الأقل.', true);
    if (!window.__smEngine) return say('لم يُحمَّل محرك الرصد. حدّث الصفحة وحاول مجدداً.', true);
    try {
      var ok = window.__smEngine.open({ mode: m, names: names, dates: dates, schools: chosen,
        currentSchoolId: current && current.id, concurrency: parseInt($('speed').value, 10) });
      if (ok !== false) close();
    } catch (e) { say('حدث خطأ: ' + (e && e.message || e), true); }
  }

  root.getElementById('fab').addEventListener('click', function () { open().catch(function (e) { alert('تعذّر فتح النافذة: ' + (e && e.message || e)); }); });
  (document.body || document.documentElement).appendChild(host);
})();
