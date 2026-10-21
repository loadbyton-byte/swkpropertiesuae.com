// Floating dock: macOS-style magnification on fine pointers.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('dock', function () {
    var dock = SWK.$('[data-dock]');
    if (!dock || !SWK.fine || SWK.reduced) return;
    var items = SWK.$$('.dock__item', dock);
    var centers = [];
    var small = window.matchMedia('(max-width: 767px)');

    function measure() {
      centers = items.map(function (el) {
        var r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
    }
    function reset() {
      dock.classList.remove('is-magnifying');
      items.forEach(function (el) { el.style.removeProperty('--mag'); });
    }

    dock.addEventListener('pointerenter', function () { if (!small.matches) measure(); });
    dock.addEventListener('pointermove', function (ev) {
      if (small.matches || ev.pointerType === 'touch') return;
      if (!centers.length) measure();
      dock.classList.add('is-magnifying');
      items.forEach(function (el, i) {
        var d = Math.abs(ev.clientX - centers[i]);
        var m = 1 + 0.62 * Math.exp(-Math.pow(d / 54, 2));
        el.style.setProperty('--mag', m.toFixed(3));
      });
    });
    dock.addEventListener('pointerleave', reset);
    window.addEventListener('resize', function () { centers = []; reset(); });
  });
})();
