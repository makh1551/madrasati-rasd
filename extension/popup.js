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
  return weekDates(parseInt($('week').value, 10))
    .filter(function (d) { return selected[d.date] && !d.future; })
    .map(function (d) { return { date: d.date, name: d.name + ' ' + d.label }; });
}

/* ---------- التعامل مع التبويب ---------- */
function activeTab() {
  return new Promise(function (res, rej) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      if (!t || !/^https:\/\/schools\.madrasati\.sa\//.test(t.url || '')) rej(new Error('notMadrasati'));
      else res(t);
    });
  });
}
function ensureClassroomsPage(tab) {
  if (/\/schoolstructure\/classrooms/i.test(tab.url || '')) return Promise.resolve(tab);
  status('جاري فتح صفحة الفصول…');
  return new Promise(function (res) {
    chrome.tabs.update(tab.id, { url: CLASSROOMS_URL }, function () {
      function done(id, info, t) {
        if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); setTimeout(function () { res(t); }, 800); }
      }
      chrome.tabs.onUpdated.addListener(done);
    });
  });
}
function run(tabId, opts) {
  return chrome.scripting.executeScript(Object.assign({ target: { tabId: tabId }, world: 'MAIN' }, opts))
    .then(function (r) { return r && r[0] ? r[0].result : undefined; });
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
async function pageRunDays(days) {
  if (window.__smRunning) return { ok: false, err: 'running' };
  window.__smRunning = true;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var visible = function (el) { return el && getComputedStyle(el).display !== 'none'; };

  // شارة حالة عائمة في الصفحة
  var badge = $('sm-ext-run-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'sm-ext-run-badge';
    badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000005;background:#065f46;color:#fff;padding:10px 14px;border-radius:10px;font:600 13px Tahoma,sans-serif;direction:rtl;box-shadow:0 6px 20px rgba(0,0,0,.35);max-width:320px;line-height:1.6';
    document.body.appendChild(badge);
  }
  var say = function (t) { badge.textContent = t; };

  // انتظار انتهاء أي تحميل/رصد جارٍ (شريط التقدم مخفي لمدة متواصلة)
  async function waitIdle(maxMs) {
    var t0 = Date.now(), calm = 0;
    while (Date.now() - t0 < maxMs) {
      var bar = $('sm-progress-bar-container');
      if (bar && !visible(bar)) { calm += 300; if (calm >= 1500) return true; } else calm = 0;
      await sleep(300);
    }
    return false;
  }

  var results = [];
  try {
    say('⏳ جاري تحميل الفصول والجداول…');
    for (var w = 0; w < 100 && !$('sm-input-date'); w++) await sleep(300);
    if (!$('sm-input-date')) return { ok: false, err: 'noTool' };
    if (!(await waitIdle(180000))) return { ok: false, err: 'timeout' };

    // التأكد من عرض اليوم
    var tabDay = $('sm-tab-day'); if (tabDay) tabDay.click();

    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      say('📅 [' + (i + 1) + '/' + days.length + '] ' + d.name + ': جاري التحميل…');
      var inp = $('sm-input-date');
      inp.value = d.date;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(600);
      if (!(await waitIdle(180000))) { results.push({ day: d.name, err: 'timeout' }); continue; }

      var unrec = document.querySelectorAll('.sm-cell-unrecorded').length;
      say('⚡ [' + (i + 1) + '/' + days.length + '] ' + d.name + ': رصد ' + unrec + ' حصة…');
      var old = $('sm-custom-confirm-modal'); if (old) old.remove();
      $('sm-btn-attend-all-unrecorded').click();

      var yes = null;
      for (var k = 0; k < 16; k++) { await sleep(250); yes = $('sm-confirm-btn-yes'); if (yes) break; }
      if (!yes) { results.push({ day: d.name, count: 0 }); continue; }   // لا توجد حصص غير مرصودة
      yes.click();
      await sleep(800);
      await waitIdle(30 * 60 * 1000);
      var left = document.querySelectorAll('.sm-cell-unrecorded').length;
      results.push({ day: d.name, count: unrec, left: left });
    }
    var total = results.reduce(function (s, r) { return s + (r.count || 0); }, 0);
    say('✅ انتهى الرصد: ' + total + ' حصة في ' + days.length + ' يوم');
    setTimeout(function () { badge.remove(); }, 15000);
    return { ok: true, results: results };
  } catch (e) {
    say('❌ توقف الرصد: ' + (e && e.message || e));
    return { ok: false, err: String(e && e.message || e) };
  } finally { window.__smRunning = false; }
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
  var days = chosenDates();
  if (quick) {
    if (!days.length) { status('اختر يوماً واحداً على الأقل.', 'err'); return; }
    var msg = 'سيتم رصد كل الحصص غير المرصودة في ' + days.length + ' يوم:\n' +
      days.map(function (d) { return '• ' + d.name; }).join('\n') + '\n\n' +
      (m === 'abs' ? '⚠️ الغائبون (' + names.length + ') سيُرصدون غائبين في كل هذه الأيام، والباقون حاضرين.' : 'جميع الطلاب سيُرصدون حاضرين.') +
      '\n\nمتابعة؟';
    if (!confirm(msg)) return;
  }
  busy(true);
  try {
    var tab = await prepare(m, names);
    if (!quick) { status('تم فتح لوحة الرصد في الصفحة.', 'ok'); window.close(); return; }

    status('بدأ الرصد. يمكنك إغلاق هذه النافذة، وتابع الشارة الخضراء أعلى صفحة المنصة. لا تغلق صفحة المنصة حتى ينتهي.');
    var r = await run(tab.id, { func: pageRunDays, args: [days] });
    if (!r) status('تعذّر التشغيل. حدّث صفحة المنصة وحاول مجدداً.', 'err');
    else if (!r.ok) {
      var why = { running: 'هناك عملية رصد جارية الآن، انتظر انتهاءها.', timeout: 'استغرق التحميل وقتاً طويلاً. تأكد من تسجيل الدخول بحساب المدير.', noTool: 'لم تظهر لوحة الرصد. حدّث صفحة الفصول وحاول مجدداً.' };
      status(why[r.err] || ('توقف: ' + r.err), 'err');
    } else {
      var lines = r.results.map(function (x) {
        if (x.err) return '⚠️ ' + x.day + ': تعذّر التحميل';
        if (!x.count) return '✅ ' + x.day + ': لا توجد حصص غير مرصودة';
        return '✅ ' + x.day + ': رُصدت ' + x.count + ' حصة' + (x.left ? ' (بقي ' + x.left + ')' : '');
      });
      status(lines.join('\n'), 'ok');
      $('status').style.whiteSpace = 'pre-line';
    }
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
$('week').onchange = function () { selected = {}; renderDays(); };
$('pickToday').onclick = function (e) { e.preventDefault(); $('week').value = '0'; pick(function (d) { return d.date === TODAY; }); };
$('pickAll').onclick = function (e) { e.preventDefault(); pick(function () { return true; }); };
$('pickNone').onclick = function (e) { e.preventDefault(); pick(function () { return false; }); };
document.querySelectorAll('input[name=mode]').forEach(function (r) { r.onchange = function () { paint(); save(); }; });
$('names').oninput = save;
$('quick').onclick = function () { start(true); };
$('open').onclick = function () { start(false); };
$('rep').onclick = showReport;
