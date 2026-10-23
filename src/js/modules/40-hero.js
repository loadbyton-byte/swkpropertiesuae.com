// Hero: headline reveal and the scroll-driven Downtown Dubai photo journey.
(function () {
  'use strict';
  var SWK = window.SWK;

  // ---- Typewriter + colourful text ------------------------------------
  function splitChars(node, state) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var word = document.createElement('span');
          word.className = 'tw-word';
          Array.prototype.slice.call(part).forEach(function (ch) {
            var c = document.createElement('span');
            c.className = 'tw-char';
            c.textContent = ch;
            c.style.transitionDelay = (0.3 + state.i * 0.045).toFixed(3) + 's';
            state.i++;
            word.appendChild(c);
          });
          frag.appendChild(word);
        });
        child.parentNode.replaceChild(frag, child);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        splitChars(child, state);
      }
    });
  }

  function initTypewriter() {
    SWK.$$('[data-typewriter]').forEach(function (el) {
      if (el.hasAttribute('data-tw-init')) return;
      el.setAttribute('data-tw-init', 'true');
      if (SWK.reduced) return;
      splitChars(el, { i: 0 });
      setTimeout(function () { el.classList.add('is-typing'); }, 30);
    });
  }

  // ---- Downtown Dubai scroll journey: real photographs cross-fade and push in as you scroll ----
  SWK.reg('hero', function () {
    var hero = SWK.$('.hero');
    var wrap = SWK.$('.hero-cine');
    if (!hero) return;

    initTypewriter();

    var stage = SWK.$('[data-flight]', hero);
    var layers = SWK.$$('.dt', hero);
    var dots = SWK.$$('[data-dt-dot]', hero);
    var captions = SWK.$$('.hero__caption', hero);
    var ranges = [[0.2, 0.5], [0.5, 0.78], [0.78, 1.2]];
    var N = layers.length;
    var progress = 0;

    function flat() { if (wrap) wrap.classList.add('is-flat'); hero.classList.remove('is-gl'); }

    var update = SWK.raf(function () {
      var total = wrap ? wrap.offsetHeight - hero.offsetHeight : 0;
      var r = wrap ? wrap.getBoundingClientRect() : { top: 0 };
      progress = total > 0 ? SWK.clamp(-r.top / total, 0, 1) : 0;
      hero.style.setProperty('--p', progress.toFixed(4));
      hero.classList.toggle('is-leaving', progress > 0.16);
      captions.forEach(function (el, i) {
        var rg = ranges[i] || [2, 3];
        var fade = 0.07;
        var o = SWK.clamp((progress - rg[0]) / fade, 0, 1) * (i === captions.length - 1 ? 1 : SWK.clamp((rg[1] - progress) / fade, 0, 1));
        var t = SWK.clamp((progress - rg[0]) / (rg[1] - rg[0]), 0, 1);
        el.style.setProperty('--o', o.toFixed(3));
        el.style.setProperty('--y', ((0.5 - t) * 46).toFixed(1) + 'px');
        el.style.setProperty('--s', (0.96 + t * 0.07).toFixed(3));
      });
      // Each photograph owns an equal slice of the scroll; neighbours cross-fade, each pushes in slowly.
      var pos = progress * (N - 1);
      var active = Math.round(pos);
      layers.forEach(function (el, i) {
        var d = Math.abs(pos - i);
        var o = SWK.clamp(1 - d * 1.15, 0, 1);
        var local = pos - i;                       // -1 .. 1 around this layer
        var scale = 1.04 + (local + 1) * 0.07;     // push-in as it becomes, then passes, the focus
        el.style.opacity = o.toFixed(3);
        el.style.transform = 'translate3d(0,' + (local * -2.2).toFixed(2) + '%,0) scale(' + scale.toFixed(3) + ')';
        el.classList.toggle('is-active', i === active);
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      });
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === active); d.classList.toggle('is-past', i < active); });
    });

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var use = stage && wrap && layers.length && !SWK.reduced && !/[?&]novideo\b/.test(location.search) &&
      !(navigator.connection && navigator.connection.saveData);
    if (!use) { flat(); return; }

    // Reveal once the first photograph is decoded; if it never loads, the local poster stays.
    var first = layers[0] && SWK.$('img', layers[0]);
    var done = function () { hero.classList.add('is-gl'); update(); };
    if (first && first.complete && first.naturalWidth) done();
    else if (first) { first.addEventListener('load', done, { once: true }); setTimeout(function () { if (first.naturalWidth) done(); }, 6000); }

    // Tilt the glass search panel toward the pointer.
    var bar = SWK.$('.search-bar', hero);
    if (bar && SWK.fine) {
      bar.addEventListener('pointermove', function (ev) {
        var r = bar.getBoundingClientRect();
        var nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
        var ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
        bar.classList.add('is-tilting');
        bar.style.setProperty('--ry', (nx * 2.2).toFixed(2) + 'deg');
        bar.style.setProperty('--rx', (-ny * 3.2).toFixed(2) + 'deg');
      });
      bar.addEventListener('pointerleave', function () {
        bar.classList.remove('is-tilting');
        bar.style.setProperty('--ry', '0deg');
        bar.style.setProperty('--rx', '0deg');
      });
    }
  });
})();
