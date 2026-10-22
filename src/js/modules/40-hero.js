// Hero: headline reveal and the scroll-scrubbed WebGL fly-through.
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

  // ---- Boulevard fly-through: real photographs as textured planes, driven by scroll ----
  SWK.reg('hero', function () {
    var hero = SWK.$('.hero');
    var wrap = SWK.$('.hero-cine');
    if (!hero) return;

    initTypewriter();

    var flight = SWK.$('[data-flight]', hero);
    var panels = SWK.$$('[data-pz]', hero).map(function (el) { return { el: el, z: parseFloat(el.getAttribute('data-pz')) }; });
    var captions = SWK.$$('.hero__caption', hero);
    var ranges = [[0.26, 0.52], [0.52, 0.78], [0.78, 1.2]];
    var progress = 0;
    var TRAVEL = 3300;

    function flat() { if (wrap) wrap.classList.add('is-flat'); hero.classList.remove('is-gl', 'is-gl-pending'); }

    var update = SWK.raf(function () {
      var total = wrap ? wrap.offsetHeight - hero.offsetHeight : 0;
      var r = wrap ? wrap.getBoundingClientRect() : { top: 0 };
      progress = total > 0 ? SWK.clamp(-r.top / total, 0, 1) : 0;
      hero.style.setProperty('--p', progress.toFixed(4));
      hero.style.setProperty('--sway', (Math.sin(progress * Math.PI * 2) * 34).toFixed(1) + 'px');
      hero.classList.toggle('is-leaving', progress > 0.18);
      captions.forEach(function (el, i) {
        var rg = ranges[i] || [2, 3];
        var fade = 0.07;
        var o = SWK.clamp((progress - rg[0]) / fade, 0, 1) * (i === captions.length - 1 ? 1 : SWK.clamp((rg[1] - progress) / fade, 0, 1));
        var t = SWK.clamp((progress - rg[0]) / (rg[1] - rg[0]), 0, 1);
        el.style.setProperty('--o', o.toFixed(3));
        el.style.setProperty('--y', ((0.5 - t) * 46).toFixed(1) + 'px');
        el.style.setProperty('--s', (0.96 + t * 0.07).toFixed(3));
      });
      // Panels fade in far away and out as they pass the camera
      var travel = progress * TRAVEL;
      panels.forEach(function (pn) {
        var z = pn.z + travel;
        var o = SWK.clamp((z + 7600) / 1800, 0, 1) * SWK.clamp((380 - z) / 260, 0, 1);
        pn.el.style.opacity = o.toFixed(3);
      });
    });

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var use = flight && wrap && !SWK.reduced && !/[?&]novideo\b/.test(location.search) &&
      !(navigator.connection && navigator.connection.saveData);
    if (!use) { flat(); return; }

    // Reveal once the backdrop photo is decoded, so the first frame is never half-built.
    var back = SWK.$('.flight__back img', hero);
    var done = function () { hero.classList.add('is-gl'); update(); };
    if (back && back.decode) back.decode().then(done, done); else done();

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
