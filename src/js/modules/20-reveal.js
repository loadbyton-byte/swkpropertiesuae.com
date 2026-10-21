// Scroll reveal for [data-reveal] (paired with the .js-gated CSS in base.css).
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('reveal', function () {
    var items = SWK.$$('[data-reveal]');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || SWK.reduced) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
        if (delay) el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach(function (el) { io.observe(el); });
  });
})();
