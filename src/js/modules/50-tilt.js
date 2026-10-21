// Pointer-driven 3D tilt + moving glare for [data-tilt] cards (fine pointers only).
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('tilt', function () {
    if (!SWK.fine || SWK.reduced) return;
    SWK.$$('[data-tilt]').forEach(function (el) {
      var max = parseFloat(el.getAttribute('data-tilt')) || 6;
      var pending = null;

      function apply() {
        var p = pending;
        pending = null;
        if (!p) return;
        el.style.setProperty('--ry', (p.nx * max).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-p.ny * max).toFixed(2) + 'deg');
        el.style.setProperty('--px', p.nx.toFixed(3));
        el.style.setProperty('--py', p.ny.toFixed(3));
        el.style.setProperty('--gx', ((p.nx + 1) * 50).toFixed(1) + '%');
        el.style.setProperty('--gy', ((p.ny + 1) * 50).toFixed(1) + '%');
        el.style.setProperty('--go', '1');
      }

      el.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;
        var r = el.getBoundingClientRect();
        pending = { nx: ((ev.clientX - r.left) / r.width - 0.5) * 2, ny: ((ev.clientY - r.top) / r.height - 0.5) * 2 };
        el.classList.add('is-tilting');
        requestAnimationFrame(apply);
      });
      el.addEventListener('pointerleave', function () {
        pending = null;
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--px', '0');
        el.style.setProperty('--py', '0');
        el.style.setProperty('--go', '0');
      });
    });
  });
})();
