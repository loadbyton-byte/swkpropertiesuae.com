// Portfolio fan: each photo reacts to the pointer with a subtle tilt, parallax and moving highlight.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('portfolio-hover', function () {
    if (!SWK.fine || SWK.reduced) return;
    SWK.$$('.fan-card').forEach(function (card) {
      var img = SWK.$('img', card);
      var pend = null;
      function apply() {
        var p = pend; pend = null;
        if (!p) return;
        card.style.setProperty('--fx', p.nx.toFixed(3));
        card.style.setProperty('--fy', p.ny.toFixed(3));
        card.style.setProperty('--fgx', ((p.nx + 1) * 50).toFixed(1) + '%');
        card.style.setProperty('--fgy', ((p.ny + 1) * 50).toFixed(1) + '%');
        card.style.setProperty('--fgo', '1');
      }
      card.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;
        var r = card.getBoundingClientRect();
        pend = { nx: ((ev.clientX - r.left) / r.width - 0.5) * 2, ny: ((ev.clientY - r.top) / r.height - 0.5) * 2 };
        card.classList.add('is-reacting');
        requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', function () {
        pend = null;
        card.classList.remove('is-reacting');
        ['--fx', '--fy'].forEach(function (k) { card.style.setProperty(k, '0'); });
        card.style.setProperty('--fgo', '0');
      });
      if (img) img.draggable = false;
    });
  });
})();
