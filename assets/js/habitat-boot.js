/* Trinity's Live Habitat: tiny ES5 boot. Waits for page load + idle + the
   section scrolling near view, then imports the engine: the prebuilt bundle
   (js/habitat.bundle.js, see tools/habitat-build) by default, or the raw ES
   module graph (js/habitat/main.js) with ?habitat=dev or if the bundle fails.
   ?habitat=off skips it; browsers without module support keep the static card. */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-habitat]');
  if (!els.length) return;
  var off = /[?&]habitat=off\b/.test(location.search);
  var mod = 'noModule' in document.createElement('script');
  var dev = /[?&]habitat=dev/.test(location.search);
  var dyn;
  try { dyn = new Function('u', 'return import(u)'); } catch (e) { dyn = null; }
  // Static card right away (not after load+idle): hiding the bar late shifted the page (CLS).
  if (off || !mod || !dyn) { for (var s = 0; s < els.length; s++) els[s].className += ' habitat--static'; return; }

  function start(el) {
    if (el.getAttribute('data-habitat-state')) return;
    el.setAttribute('data-habitat-state', 'loading');
    var base = el.getAttribute('data-base') || '/assets/';
    var raw = base + 'js/habitat/main.js';
    (dev ? dyn(raw) : dyn(base + 'js/habitat.bundle.js').then(null, function (e) {
      if (window.console) console.warn('[habitat] bundle failed, loading modules', e);
      return dyn(raw);
    })).then(function (m) {
      return m.mount(el, { mode: el.getAttribute('data-mode') || 'embed', api: el.getAttribute('data-api'), base: base });
    }).then(function (inst) {
      el.setAttribute('data-habitat-state', 'ready');
      el._habitat = inst;
    }, function (err) {
      el.setAttribute('data-habitat-state', 'error');
      el.className += ' habitat--static';
      if (window.console) console.warn('[habitat]', err);
    });
  }

  function arm() {
    for (var i = 0; i < els.length; i++) (function (el) {
      if (!('IntersectionObserver' in window)) { start(el); return; }
      var io = new IntersectionObserver(function (es) {
        for (var k = 0; k < es.length; k++) if (es[k].isIntersecting) { io.disconnect(); start(el); }
      }, { rootMargin: '200px' });
      io.observe(el);
    })(els[i]);
  }

  function idle() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(arm, { timeout: 2500 }); }
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle);
})();
