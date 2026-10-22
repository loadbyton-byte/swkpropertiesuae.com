// Scroll-driven depth: scrubbed 3D entrances, parallax skyline layers and the
// interior page-header skyline. One rAF-throttled pass over only the elements
// currently near the viewport.
(function () {
  'use strict';
  var SWK = window.SWK;

  var SCRUB = [
    '.section-header', '.section-head-row', '.calculator', '.feature-slider', '.fan-carousel-wrap',
    '.testimonials-carousel', '.marquee', '.split-block', '.stat-ribbon'
  ].join(',');

  var ease = function (t) { return t * t * (3 - 2 * t); };

  SWK.reg('scroll3d', function () {
    if (SWK.reduced) return;

    var vh = window.innerHeight;
    var scrub = SWK.$$(SCRUB).filter(function (el) {
      return !el.hasAttribute('data-reveal') && !el.closest('[data-reveal]') && !el.closest('.hero');
    });
    var groups = SWK.$$('[data-parallax-group]');
    var pageHero = SWK.$('.page-hero');
    var live = [];

    scrub.forEach(function (el) { el.classList.add('scrub'); });

    function layout() {
      vh = window.innerHeight;
      update();
    }

    var update = SWK.raf(function () {
      // Scrubbed entrances: 0 as the element's top edge enters the viewport, 1 once it
      // reaches ~62% of the way up. Reversible until fully settled.
      for (var i = 0; i < live.length; i++) {
        var el = live[i];
        var r = el.getBoundingClientRect();
        var t = SWK.clamp((vh - r.top) / (vh * 0.38), 0, 1);
        el.style.setProperty('--dp', ease(t).toFixed(3));
        if (t >= 1) { el.classList.add('scrub-done'); live.splice(i, 1); i--; }
      }

      groups.forEach(function (g) {
        var r = g.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        var t = (vh / 2 - (r.top + r.height / 2)) / vh; // -1..1 around the viewport centre
        SWK.$$('[data-depth]', g).forEach(function (layer) {
          var d = parseFloat(layer.getAttribute('data-depth')) || 0;
          layer.style.setProperty('--ly', (t * d * 220).toFixed(1) + 'px');
          layer.style.setProperty('--lx', (t * d * -70).toFixed(1) + 'px');
        });
        var sun = SWK.$('.skyline__sun', g);
        if (sun) sun.style.setProperty('--sy', (t * 70).toFixed(1) + 'px');
      });

      if (pageHero) {
        var h = pageHero.offsetHeight || 1;
        pageHero.style.setProperty('--hp', SWK.clamp(window.scrollY / h, 0, 1).toFixed(3));
      }
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var el = en.target;
          if (el.classList.contains('scrub-done')) { io.unobserve(el); return; }
          var idx = live.indexOf(el);
          if (en.isIntersecting && idx === -1) live.push(el);
          else if (!en.isIntersecting && idx !== -1) live.splice(idx, 1);
        });
        update();
      }, { rootMargin: '0px 0px 8% 0px' });
      scrub.forEach(function (el) { io.observe(el); });
    } else {
      scrub.forEach(function (el) { el.classList.add('scrub-done'); });
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', layout);
    update();
  });
})();
