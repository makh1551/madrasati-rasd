/*
 * زر «⚡ رصد» العائم داخل صفحات منصة مدرستي.
 * يفتح نافذة الإضافة نفسها داخل الصفحة، فلا حاجة لفتح قائمة الإضافات في كل مرة (مفيد على الجوال).
 */
(function () {
  'use strict';
  if (window.top !== window || document.getElementById('sm-rasd-fab')) return;

  var fab = document.createElement('button');
  fab.id = 'sm-rasd-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'رصد الحضور السريع');
  fab.innerHTML = '<span style="font-size:18px;line-height:1">⚡</span><span>رصد</span>';
  fab.style.cssText = [
    'position:fixed', 'z-index:2147483000', 'direction:rtl',
    'left:calc(16px + env(safe-area-inset-left, 0px))', 'bottom:calc(84px + env(safe-area-inset-bottom, 0px))',
    'display:flex', 'align-items:center', 'gap:6px', 'min-height:48px', 'padding:0 18px',
    'border:0', 'border-radius:999px', 'background:#0284c7', 'color:#fff',
    'font:700 15px Tahoma,"Segoe UI",sans-serif', 'box-shadow:0 10px 26px rgba(2,132,199,.45)', 'cursor:pointer'
  ].join(';');

  var wrap = null;
  function close() { if (wrap) { wrap.remove(); wrap = null; } fab.style.display = 'flex'; }
  function open() {
    if (wrap) return close();
    var phone = Math.min(screen.width, screen.height) < 700;
    wrap = document.createElement('div');
    wrap.id = 'sm-rasd-panel';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(2,6,23,.55);display:flex;align-items:' + (phone ? 'stretch' : 'center') + ';justify-content:center';
    var fr = document.createElement('iframe');
    fr.src = chrome.runtime.getURL('popup.html?embed=1');
    fr.title = 'رصد الحضور السريع';
    fr.style.cssText = phone
      ? 'border:0;width:100%;height:100%;background:#0f172a'
      : 'border:0;width:380px;height:min(720px,92vh);border-radius:16px;background:#0f172a;box-shadow:0 24px 70px rgba(0,0,0,.55)';
    wrap.appendChild(fr);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    fab.style.display = 'none';
  }
  fab.addEventListener('click', open);
  window.addEventListener('message', function (e) {
    if (e.data && e.data.smRasd === 'close' && wrap && e.source === wrap.querySelector('iframe').contentWindow) close();
  });
  document.body.appendChild(fab);
})();
