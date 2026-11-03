'use strict';

var $ = function (id) { return document.getElementById(id); };
var d = new Date();
var DAY = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

/* ---------- حفظ الإعدادات (قائمة الغياب تُمسح كل يوم) ---------- */
function load(cb) {
  chrome.storage.local.get(['mode', 'namesDay', 'names'], function (r) {
    cb({ mode: r.mode === 'abs' ? 'abs' : 'all', names: r.namesDay === DAY ? (r.names || '') : '' });
  });
}
function save() {
  chrome.storage.local.set({ mode: mode(), names: $('names').value, namesDay: DAY });
}
function mode() {
  var r = document.querySelector('input[name=mode]:checked');
  return r ? r.value : 'all';
}
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

/* ---------- تشغيل داخل الصفحة ---------- */
function activeTab() {
  return new Promise(function (res, rej) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var t = tabs && tabs[0];
      if (!t || !/^https:\/\/schools\.madrasati\.sa\//.test(t.url || '')) rej(new Error('notMadrasati'));
      else res(t);
    });
  });
}
function run(tabId, opts) {
  return chrome.scripting.executeScript(Object.assign({ target: { tabId: tabId }, world: 'MAIN' }, opts))
    .then(function (r) { return r && r[0] ? r[0].result : undefined; });
}

// تُنفَّذ داخل الصفحة
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
async function pageQuickRun() {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var num = function (el) {
    if (!el) return NaN;
    var t = el.textContent.replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); }).replace(/[^\d]/g, '');
    return t ? parseInt(t, 10) : NaN;
  };
  var t0 = Date.now(), last = '', stable = 0;
  while (Date.now() - t0 < 120000) {
    var btn = $('sm-btn-attend-all-unrecorded');
    var prog = $('sm-progress-bar-container');
    var working = prog && getComputedStyle(prog).display !== 'none';
    var classes = num($('sm-stat-classes'));
    var unrec = num($('sm-stat-unrecorded'));
    var cells = document.querySelectorAll('.sm-cell-unrecorded').length;
    var sig = classes + '|' + unrec + '|' + cells + '|' + document.querySelectorAll('.sm-cell-recorded').length;
    if (!working && classes > 0) {
      stable = sig === last ? stable + 1 : 0; last = sig;
      if (stable >= 3) {
        var count = !isNaN(unrec) ? unrec : cells;
        if (!count && !cells) return { ok: true, count: 0 };
        if (!btn || btn.disabled) return { ok: false, err: 'noButton' };
        btn.click();
        for (var i = 0; i < 24; i++) {
          await sleep(250);
          var yes = $('sm-confirm-btn-yes');
          if (yes && yes.offsetParent !== null) { yes.click(); return { ok: true, count: count }; }
        }
        return { ok: true, count: count, noConfirm: true };
      }
    } else { stable = 0; last = sig; }
    await sleep(500);
  }
  return { ok: false, err: 'timeout' };
}

async function start(quick) {
  save();
  var m = mode(), names = namesList();
  if (m === 'abs' && !names.length) { status('اكتب أسماء الغائبين، أو اختر «جميع الطلاب حاضرون».', 'err'); return; }
  if (quick) {
    var msg = m === 'abs'
      ? 'سيتم رصد كل الحصص غير المرصودة لليوم:\n• ' + names.length + ' طالب غائب\n• الباقون حاضرون\n\nمتابعة؟'
      : 'سيتم رصد كل الحصص غير المرصودة لليوم بجميع الطلاب حاضرين.\n\nمتابعة؟';
    if (!confirm(msg)) return;
  }
  busy(true);
  try {
    var tab = await activeTab();
    status('جاري التجهيز…');
    await run(tab.id, { func: pageSetCfg, args: [{ mode: m, names: names }] });
    await run(tab.id, { files: ['page_addon.js'] });
    var state = await run(tab.id, { func: pageToolState });
    if (state === 'need') await run(tab.id, { files: ['attendance_tracker.js'] });
    if (!quick) { status('تم فتح لوحة الرصد في الصفحة.', 'ok'); window.close(); return; }

    status('جاري تحميل الفصول والحصص… (لا تغلق صفحة المنصة)');
    var r = await run(tab.id, { func: pageQuickRun });
    if (!r) status('تعذّر التشغيل. حدّث صفحة المنصة وحاول مجدداً.', 'err');
    else if (!r.ok && r.err === 'timeout') status('استغرق التحميل وقتاً طويلاً. تأكد من تسجيل الدخول بحساب المدير، ثم حاول مجدداً.', 'err');
    else if (!r.ok) status('لم يُعثر على زر الرصد الجماعي. استخدم «فتح لوحة الرصد التفصيلية».', 'err');
    else if (r.count === 0) status('✅ لا توجد حصص غير مرصودة اليوم.', 'ok');
    else if (r.noConfirm) status('بدأ الرصد. أكّد العملية في نافذة المنصة إن ظهر طلب تأكيد.', 'ok');
    else status('✅ بدأ رصد ' + r.count + ' حصة. تابع شريط التقدم في صفحة المنصة.', 'ok');
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
document.querySelectorAll('input[name=mode]').forEach(function (r) { r.onchange = function () { paint(); save(); }; });
$('names').oninput = save;
$('quick').onclick = function () { start(true); };
$('open').onclick = function () { start(false); };
$('rep').onclick = showReport;
