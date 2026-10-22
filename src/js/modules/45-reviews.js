// Review slider: text-only quotes that cross-fade on a timer, with progress, counter and arrows.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('reviews', function () {
    var root = SWK.$('[data-reviews]');
    if (!root) return;
    var slides = SWK.$$('[data-rv-slide]', root);
    if (slides.length < 2) return;
    var bar = SWK.$('[data-rv-progress]', root);
    var now = SWK.$('[data-rv-now]', root);
    var DURATION = 7000;
    var idx = 0, timer = null, start = 0, paused = false, raf = 0, elapsed = 0;

    function show(n, dir) {
      var prev = slides[idx];
      idx = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) {
        var on = i === idx;
        s.classList.toggle('is-active', on);
        s.classList.toggle('is-prev', s === prev && !on);
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
        s.style.setProperty('--dir', dir || 1);
      });
      if (now) now.textContent = String(idx + 1).padStart(2, '0');
      elapsed = 0; start = performance.now();
    }

    function tick(t) {
      raf = requestAnimationFrame(tick);
      if (paused || SWK.reduced) { start = t - elapsed; return; }
      elapsed = t - start;
      if (bar) bar.style.transform = 'scaleX(' + Math.min(elapsed / DURATION, 1) + ')';
      if (elapsed >= DURATION) show(idx + 1, 1);
    }

    SWK.$('[data-rv-next]', root).addEventListener('click', function () { show(idx + 1, 1); });
    SWK.$('[data-rv-prev]', root).addEventListener('click', function () { show(idx - 1, -1); });
    root.addEventListener('mouseenter', function () { paused = true; });
    root.addEventListener('mouseleave', function () { paused = false; });
    root.addEventListener('focusin', function () { paused = true; });
    root.addEventListener('focusout', function () { paused = false; });
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight') show(idx + 1, 1); else if (ev.key === 'ArrowLeft') show(idx - 1, -1);
    });

    // Only run while on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { if (!raf) { start = performance.now() - elapsed; raf = requestAnimationFrame(tick); } }
        else { cancelAnimationFrame(raf); raf = 0; }
      }).observe(root);
    } else { raf = requestAnimationFrame(tick); }
    show(0, 1);
  });
})();
