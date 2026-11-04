'use strict';

var $ = function (id) { return document.getElementById(id); };
var CLASSROOMS_URL = 'https://schools.madrasati.sa/SchoolStructure/ClassRooms';
var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
var now = new Date();
var TODAY = ymd(now);

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function weekDates(offset) {
  var s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset * 7);
  return DAY_NAMES.map(function (n, i) {
    var d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
    return { name: n, date: ymd(d), label: d.getDate() + '/' + (d.getMonth() + 1), future: ymd(d) > TODAY };
  });
}

/* ---------- الإعدادات (قائمة الغياب تُمسح كل يوم) ---------- */
function load(cb) {
  chrome.storage.local.get(['mode', 'namesDay', 'names'], function (r) {
    cb({ mode: r.mode === 'abs' ? 'abs' : 'all', names: r.namesDay === TODAY ? (r.names || '') : '' });
  });
}
function save() { chrome.storage.local.set({ mode: mode(), names: $('names').value, namesDay: TODAY }); }
function mode() { var r = document.querySelector('input[name=mode]:checked'); return r ? r.value : 'all'; }
function paint() {
  var m = mode();
  $('optAll').classList.toggle('on', m === 'all');
  $('optAbs').classList.toggle('on', m === 'abs');
  $('absBox').style.display = m === 'abs' ? 'block' : 'none';
}
function status(msg, cls) { var s = $('status'); s.textContent = msg; s.className = cls || ''; }
function busy(b) { $('quick').disabled = b; $('open').disabled = b; }
function namesList() {
  return $('names').value.split(/\n|،|,/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
}

/* ---------- اختيار الأيام ---------- */
var selected = {};
function renderDays() {
  var list = weekDates(parseInt($('week').value, 10));
  $('days').innerHTML = '';
  list.forEach(function (d) {
    var el = document.createElement('label');
    el.className = 'day' + (d.future ? ' dis' : '') + (selected[d.date] ? ' on' : '');
    el.innerHTML = '<span>' + d.name + '</span><small>' + d.label + '</small>';
    el.title = d.future ? 'يوم لم يأتِ بعد' : d.date;
    if (!d.future) el.onclick = function () { selected[d.date] = !selected[d.date]; renderDays(); };
    $('days').appendChild(el);
  });
}
function pick(fn) {
  selected = {};
  weekDates(parseInt($('week').value, 10)).forEach(function (d) { if (!d.future && fn(d)) selected[d.date] = true; });
  renderDays();
}
function chosenDates() {
  return Object.keys(selected).filter(function (k) { return selected[k] && k <= TODAY; }).sort()
    .map(function (k) { return { date: k, name: k }; });
}

/* ---------- التعامل مع التبويب ---------- */
var EMBED = /[?&]embed=1/.test(location.search);
function closeUI() {
  if (EMBED) { try { parent.postMessage({ smRasd: 'close' }, '*'); } catch (e) {} }
  else window.close();
}
// البحث عن تبويب مدرستي بعدة طرق، لأن بعض متصفحات الجوال لا تُرجع التبويب أو رابطه بالطريقة المعتادة
function q(opts) { return new Promise(function (r) { try { chrome.tabs.query(opts, function (t) { r(t || []); }); } catch (e) { r([]); } }); }
function isMad(u) { return /^https:\/\/schools\.madrasati\.sa\//.test(u || ''); }
async function activeTab() {
  var cands = [].concat(await q({ active: true, currentWindow: true }), await q({ active: true, lastFocusedWindow: true }),
    await q({ url: 'https://schools.madrasati.sa/*', active: true }), await q({ url: 'https://schools.madrasati.sa/*' }));
  for (var i = 0; i < cands.length; i++) {
    var t = cands[i];
    if (isMad(t.url)) return t;
    if (!t.url && t.id != null) {   // الرابط مخفي: نسأل الصفحة نفسها
      try {
        var href = await run(t.id, { func: function () { return location.href; } });
        if (isMad(href)) { t.url = href; return t; }
      } catch (e) {}
    }
  }
  throw new Error('notMadrasati');
}
function ensureClassroomsPage(tab) {
  if (/\/schoolstructure\/classrooms/i.test(tab.url || '')) return Promise.resolve(tab);
  status('جاري فتح صفحة الفصول…');
  return new Promise(function (res, rej) {
    var finished = false, t0 = Date.now();
    function finish(t) { if (finished) return; finished = true; setTimeout(function () { res(t || tab); }, 1200); }
    chrome.tabs.update(tab.id, { url: CLASSROOMS_URL }, function () {
      // بعض متصفحات الجوال لا تدعم onUpdated جيداً، فنتحقق من حالة التبويب دورياً أيضاً
      (function poll() {
        if (finished) return;
        chrome.tabs.get(tab.id, function (t) {
          if (t && t.status === 'complete' && /\/schoolstructure\/classrooms/i.test(t.url || '')) finish(t);
          else if (Date.now() - t0 > 30000) { finished = true; rej(new Error('تعذّر فتح صفحة الفصول. افتحها يدوياً ثم اضغط الزر مجدداً.')); }
          else setTimeout(poll, 500);
        });
      })();
    });
  });
}
// يعمل في عالم الإضافة المعزول (Isolated) — مدعوم في Chrome وEdge ومتصفحات الجوال التي تدعم الإضافات.
// كل ما تحتاجه الأداة (الصفحة، fetch بجلسة المستخدم، localStorage) متاح فيه، دون الحاجة إلى عالم الصفحة.
function run(tabId, opts) {
  return chrome.scripting.executeScript(Object.assign({ target: { tabId: tabId } }, opts))
    .then(function (r) {
      var x = r && r[0];
      if (x && x.error) throw new Error(String(x.error.message || x.error));
      return x ? x.result : undefined;
    });
}

/* ---------- دوال تُنفَّذ داخل الصفحة ---------- */
function pageSetCfg(cfg) { window.__smAbsCfg = cfg; return true; }
function pageToolState() {
  var m = document.getElementById('sm-madrasati-tracker-modal');
  if (m) { m.style.display = 'flex'; return 'exists'; }
  return 'need';
}
function pageAbsReport() {
  var a = window.__smAbsExt;
  return a ? { matched: a.report.matched, periods: a.report.periods, noAbs: a.report.noAbsentOption } : null;
}
function pageSchool() {
  var q = new URLSearchParams(location.search);
  var id = q.get('schoolId') || q.get('SchoolId') || (document.getElementById('hSchoolId') || {}).value ||
    (document.querySelector('input[name="SchoolId"]') || {}).value || localStorage.getItem('madrasati_hSchoolId') || localStorage.getItem('globalschoolId') || '';
  var el = document.querySelector('.school-name, .user-school-name, #schoolName, .navbar-brand span');
  var nm = (el && el.textContent.trim()) || localStorage.getItem('school_name_' + id) || localStorage.getItem('madrasati_schoolName') || '';
  return { id: String(id || ''), name: nm };
}

/* ---------- المدارس المحفوظة ---------- */
var schoolList = [], currentId = '';
function renderSchools() {
  var box = $('schools');
  if (!schoolList.length) return;
  box.innerHTML = '';
  schoolList.forEach(function (sc, i) {
    var row = document.createElement('label'); row.className = 'sc';
    row.innerHTML = '<input type="checkbox"' + (sc.on ? ' checked' : '') + '><span>' + sc.name.replace(/</g, '&lt;') + '</span>' +
      (sc.id === currentId ? '<small>(الحالية)</small>' : '') + '<span class="del" title="حذف من القائمة">×</span>';
    row.querySelector('input').onchange = function (e) { sc.on = e.target.checked; saveSchools(); };
    row.querySelector('.del').onclick = function (e) { e.preventDefault(); schoolList.splice(i, 1); saveSchools(); renderSchools(); };
    box.appendChild(row);
  });
}
function saveSchools() { chrome.storage.local.set({ schools: schoolList }); }
function chosenSchools() { return schoolList.filter(function (s) { return s.on; }).map(function (s) { return { id: s.id, name: s.name }; }); }
function loadSchools() {
  chrome.storage.local.get(['schools', 'speed'], async function (r) {
    schoolList = Array.isArray(r.schools) ? r.schools : [];
    if (r.speed) $('speed').value = r.speed;
    try {
      var tab = await activeTab();
      var cur = await run(tab.id, { func: pageSchool });
      if (cur && cur.id) {
        currentId = cur.id;
        var ex = schoolList.find(function (s) { return s.id === cur.id; });
        if (ex) { if (cur.name) ex.name = cur.name; }
        else { schoolList.forEach(function (s) { s.on = false; }); schoolList.push({ id: cur.id, name: cur.name || ('مدرسة ' + cur.id), on: true }); }
        saveSchools();
      }
    } catch (e) {}
    renderSchools();
  });
}

/* ---------- التشغيل ---------- */
async function prepare(m, names) {
  var tab = await activeTab();
  tab = await ensureClassroomsPage(tab);
  status('جاري التجهيز…');
  await run(tab.id, { func: pageSetCfg, args: [{ mode: m, names: names }] });
  await run(tab.id, { files: ['page_addon.js'] });
  var state = await run(tab.id, { func: pageToolState });
  if (state === 'need') await run(tab.id, { files: ['attendance_tracker.js'] });
  return tab;
}

async function start(quick) {
  save();
  var m = mode(), names = namesList();
  if (m === 'abs' && !names.length) { status('اكتب أسماء الغائبين، أو اختر «جميع الطلاب حاضرون».', 'err'); return; }
  busy(true);
  try {
    if (!quick) {
      await prepare(m, names);
      status('تم فتح اللوحة التفصيلية في الصفحة.', 'ok'); closeUI(); return;
    }
    var days = chosenDates();
    if (!days.length) { status('اختر يوماً واحداً على الأقل.', 'err'); return; }
    var schools = chosenSchools();
    if (!schools.length && schoolList.length) { status('اختر مدرسة واحدة على الأقل.', 'err'); return; }
    var tab = await activeTab();
    tab = await ensureClassroomsPage(tab);
    var cur = await run(tab.id, { func: pageSchool });
    await run(tab.id, { files: ['engine.js'] });
    await run(tab.id, {
      func: function (cfg) { return window.__smEngine.open(cfg); },
      args: [{ mode: m, names: names, dates: days.map(function (d) { return d.date; }), schools: schools,
               currentSchoolId: cur && cur.id, concurrency: parseInt($('speed').value, 10) }]
    });
    chrome.storage.local.set({ speed: $('speed').value });
    closeUI();
  } catch (e) {
    if (e && e.message === 'notMadrasati') status('افتح منصة مدرستي (schools.madrasati.sa) بحساب المدير أولاً، ثم اضغط الزر.', 'err');
    else status('حدث خطأ: ' + (e && e.message || e), 'err');
  } finally { busy(false); }
}

async function showReport() {
  try {
    var tab = await activeTab();
    var r = await run(tab.id, { func: pageAbsReport });
    if (!r) { alert('لم يُنفَّذ رصد بالغياب في هذه الصفحة بعد.'); return; }
    var norm = function (s) {
      return s.replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, ' ').trim();
    };
    var lines = namesList().map(function (n) {
      var c = r.matched[norm(n)];
      return c ? '✅ ' + n + ' — غائب في ' + c + ' حصة' : '❌ ' + n + ' — لم يُعثر عليه';
    });
    var msg = 'حصص حُفظت: ' + r.periods + '\n\n' + lines.join('\n');
    if (r.noAbs) msg += '\n\n⚠️ تعذّر تحديد خيار «غائب» في ' + r.noAbs + ' حالة — راجعها يدوياً.';
    alert(msg);
  } catch (e) { alert('افتح صفحة منصة مدرستي أولاً.'); }
}

/* ---------- ربط الواجهة ---------- */
load(function (s) {
  document.querySelector('input[name=mode][value="' + s.mode + '"]').checked = true;
  $('names').value = s.names;
  paint();
});
selected[TODAY] = true;
renderDays();
(function () {
  var o = '';
  for (var k = 0; k >= -10; k--) {
    var w = weekDates(k), r = w[0].label + ' – ' + w[4].label;
    var t = k === 0 ? 'الأسبوع الحالي' : k === -1 ? 'الأسبوع الماضي' : k === -2 ? 'قبل أسبوعين' : 'قبل ' + (-k) + ' أسابيع';
    o += '<option value="' + k + '">' + t + ' (' + r + ')</option>';
  }
  $('week').innerHTML = o;
})();
$('week').onchange = renderDays;   // التحديد محفوظ عند التنقل بين الأسابيع
$('pickToday').onclick = function (e) { e.preventDefault(); $('week').value = '0'; pick(function (d) { return d.date === TODAY; }); };
$('pickAll').onclick = function (e) { e.preventDefault(); pick(function () { return true; }); };
$('pickNone').onclick = function (e) { e.preventDefault(); pick(function () { return false; }); };
document.querySelectorAll('input[name=mode]').forEach(function (r) { r.onchange = function () { paint(); save(); }; });
$('names').oninput = save;
if ($('close')) $('close').onclick = closeUI;
$('quick').onclick = function () { start(true); };
$('open').onclick = function () { start(false); };
loadSchools();
