// Featured listings slider: arrows, dots, swipe, keyboard and focus-follow.
(function () {
  'use strict';
  var SWK = window.SWK;

  var ARROW = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
  };

  SWK.reg('slider', function () {
    var root = SWK.$('[data-feature-slider]');
    if (!root) return;
    var viewport = SWK.$('.feature-slider__viewport', root);
    var track = SWK.$('.feature-slider__track', root);
    var slides = Array.prototype.slice.call(track.children);
    var nav = SWK.$('.feature-slider__nav', root);
    if (!slides.length || !nav) return;

    nav.innerHTML =
      '<button type="button" class="feature-slider__arrow" data-fs-prev aria-label="Previous listings">' + ARROW.prev + '</button>' +
      '<div class="feature-slider__dots" data-fs-dots></div>' +
      '<button type="button" class="feature-slider__arrow" data-fs-next aria-label="Next listings">' + ARROW.next + '</button>';
    var prev = SWK.$('[data-fs-prev]', nav);
    var next = SWK.$('[data-fs-next]', nav);
    var dotsEl = SWK.$('[data-fs-dots]', nav);

    var index = 0;
    function perView() {
      return Math.max(1, parseInt(getComputedStyle(track).getPropertyValue('--slides-per-view'), 10) || 1);
    }
    function maxIndex() { return Math.max(0, slides.length - perView()); }

    function buildDots() {
      dotsEl.innerHTML = '';
      for (var i = 0; i <= maxIndex(); i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'feature-slider__dot';
        b.setAttribute('aria-label', 'Go to listings ' + (i + 1));
        (function (k) { b.addEventListener('click', function () { to(k); }); })(i);
        dotsEl.appendChild(b);
      }
    }

    function render() {
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      var step = slides[0].offsetWidth + gap;
      track.style.transform = 'translate3d(' + (-index * step) + 'px,0,0)';
      var dots = SWK.$$('.feature-slider__dot', dotsEl);
      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === index);
        if (i === index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      prev.disabled = index <= 0;
      next.disabled = index >= maxIndex();
      var pv = perView();
      slides.forEach(function (s, i) {
        var on = i >= index && i < index + pv;
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
        SWK.$$('a,button', s).forEach(function (el) { el.tabIndex = on ? 0 : -1; });
      });
    }

    function to(i) {
      index = SWK.clamp(i, 0, maxIndex());
      render();
    }

    prev.addEventListener('click', function () { to(index - 1); });
    next.addEventListener('click', function () { to(index + 1); });

    // Keyboard focus landing on a slide scrolls the clipped viewport; undo that
    // and slide the track instead.
    viewport.addEventListener('focusin', function (ev) {
      viewport.scrollLeft = 0;
      var s = ev.target.closest && ev.target.closest('.property-card--feature');
      var i = slides.indexOf(s);
      if (i < 0) return;
      var pv = perView();
      if (i < index) to(i);
      else if (i > index + pv - 1) to(i - pv + 1);
    });
    viewport.addEventListener('scroll', function () { viewport.scrollLeft = 0; });
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight') to(index + 1);
      else if (ev.key === 'ArrowLeft') to(index - 1);
    });

    var x0 = null, y0 = null;
    viewport.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; y0 = ev.clientY; });
    viewport.addEventListener('pointerup', function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0, dy = ev.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) to(index + (dx < 0 ? 1 : -1));
    });
    viewport.addEventListener('click', function (ev) {
      // a swipe that ends on a card must not also follow its link
      if (suppress) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    var suppress = false;
    viewport.addEventListener('pointermove', function (ev) {
      suppress = x0 !== null && Math.abs(ev.clientX - x0) > 12;
    });
    viewport.addEventListener('pointerup', function () { setTimeout(function () { suppress = false; }, 0); });

    var lastPv = perView();
    window.addEventListener('resize', SWK.raf(function () {
      var pv = perView();
      if (pv !== lastPv) { lastPv = pv; buildDots(); }
      index = SWK.clamp(index, 0, maxIndex());
      render();
    }));

    buildDots();
    render();
  });
})();
