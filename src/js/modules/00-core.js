// Core namespace. Every feature registers itself with SWK.reg() and runs in its
// own try/catch on DOMContentLoaded, so one failing module can never take the
// rest of the page down with it.
(function () {
  'use strict';

  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };

  var SWK = (window.SWK = window.SWK || {});
  SWK.modules = [];
  SWK.reduced = mq('(prefers-reduced-motion: reduce)').matches;
  SWK.fine = mq('(hover: hover) and (pointer: fine)').matches;
  SWK.$ = function (sel, root) { return (root || document).querySelector(sel); };
  SWK.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  SWK.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  SWK.lerp = function (a, b, t) { return a + (b - a) * t; };
  SWK.reg = function (name, fn) { SWK.modules.push({ name: name, fn: fn }); };
  SWK.raf = function (fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  };

  function run() {
    SWK.modules.forEach(function (m) {
      try { m.fn(); } catch (err) { console.error('[swk] module "' + m.name + '" failed:', err); }
    });
  }

  // The bundle concatenates every module after this file, so defer the run
  // until they have all registered (a microtask, or DOMContentLoaded).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else Promise.resolve().then(run);
})();
