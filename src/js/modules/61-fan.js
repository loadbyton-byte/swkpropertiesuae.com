// Fanned photo carousel with real 3D depth. Click a side card to bring it to
// the centre, click the centre card to open the lightbox; drag, arrows and
// the keyboard all work.
(function () {
  'use strict';
  var SWK = window.SWK;

  var SPREAD = [0, 0.72, 1.4, 1.86];     // x offset, in card widths
  var DROP = [-0.06, 0, 0.18, 0.42];     // y offset, in card widths
  var ROT = [0, 7.8, 15, 21];            // degrees
  var SCALE = [1.06, 0.98, 0.87, 0.77];
  var Z = [11, 3, 2, 1];

  SWK.reg('fan', function () {
    var root = SWK.$('[data-fan-carousel]');
    if (!root) return;
    var layout = SWK.$('[data-fan-track]', root);
    var cards = SWK.$$('[data-fan-card]', root);
    var dots = SWK.$$('[data-fan-dot]', root);
    var n = cards.length;
    if (!n) return;
    var center = Math.min(3, n - 1);

    function dist(i) {
      var d = (i - center) % n;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return d;
    }

    function render() {
      var w = cards[0].offsetWidth || 240;
      cards.forEach(function (card, i) {
        var d = dist(i);
        var a = Math.abs(d);
        var s = d < 0 ? -1 : 1;
        if (a > 3) {
          card.style.transform = 'translate3d(0,0,-200px) scale(0.3)';
          card.style.opacity = '0';
          card.style.zIndex = '0';
          card.style.pointerEvents = 'none';
          card.tabIndex = -1;
          card.setAttribute('aria-hidden', 'true');
          return;
        }
        card.style.transform =
          'translate3d(' + (s * SPREAD[a] * w).toFixed(1) + 'px,' + (DROP[a] * w).toFixed(1) + 'px,' + (-a * 70) + 'px) ' +
          'rotate(' + (s * ROT[a]) + 'deg) rotateY(' + (-s * a * 6) + 'deg) scale(' + SCALE[a] + ')';
        card.style.opacity = '1';
        card.style.zIndex = String(Z[a]);
        card.style.pointerEvents = '';
        card.tabIndex = 0;
        card.removeAttribute('aria-hidden');
        card.classList.toggle('is-center', a === 0);
      });
      dots.forEach(function (dot, i) { dot.classList.toggle('is-active', i === center); });
    }

    function go(i, focus) {
      center = ((i % n) + n) % n;
      render();
      if (focus) cards[center].focus({ preventScroll: true });
    }

    cards.forEach(function (card, i) {
      card.addEventListener('click', function () {
        if (dragged) return;
        if (i === center) {
          var items = cards.map(function (c) { var im = SWK.$('img', c); return { src: im.getAttribute('data-full') || im.currentSrc || im.src, alt: im.alt }; });
          SWK.lightbox.open(items, i, 'Portfolio photos', card);
        } else {
          go(i);
        }
      });
    });

    var prev = SWK.$('[data-fan-prev]', root);
    var next = SWK.$('[data-fan-next]', root);
    if (prev) prev.addEventListener('click', function () { go(center - 1); });
    if (next) next.addEventListener('click', function () { go(center + 1); });

    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); go(center - 1, true); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); go(center + 1, true); }
    });

    // Drag / swipe: every half card-width of travel steps one photo.
    var dragged = false, startX = 0, acc = 0, down = false;
    layout.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      down = true; dragged = false; startX = ev.clientX; acc = 0;
    });
    window.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - startX;
      if (Math.abs(dx) > 6) dragged = true;
      var step = (cards[0].offsetWidth || 240) * 0.5;
      while (dx - acc > step) { acc += step; go(center - 1); }
      while (dx - acc < -step) { acc -= step; go(center + 1); }
    });
    window.addEventListener('pointerup', function () {
      down = false;
      setTimeout(function () { dragged = false; }, 0);
    });

    window.addEventListener('resize', SWK.raf(render));
    render();
  });
})();
