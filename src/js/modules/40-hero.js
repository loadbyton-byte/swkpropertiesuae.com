// Hero: headline typewriter, colourful "UAE", scroll-scrubbed WebGL fly-through.
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
    SWK.$$('[data-colorful-text]').forEach(function (el) {
      var chars = SWK.$$('.tw-char', el);
      chars.forEach(function (c, i) { c.classList.add('cv-char'); c.style.setProperty('--cvd', (-i * 0.55).toFixed(2) + 's'); });
      if (!SWK.reduced && chars.length) {
        setInterval(function () {
          var c = chars[(Math.random() * chars.length) | 0];
          c.classList.remove('cv-pulse');
          void c.offsetWidth;
          c.classList.add('cv-pulse');
        }, 1400);
      }
    });
  }

  // ---- WebGL gate -------------------------------------------------------
  function webglOK() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) { return false; }
  }

  function wantsGL() {
    if (SWK.reduced) return false;
    if (/[?&]nowebgl\b/.test(location.search)) return false;
    var nav = navigator;
    if (nav.connection && nav.connection.saveData) return false;
    if (nav.deviceMemory && nav.deviceMemory < 2) return false;
    return webglOK();
  }

  SWK.reg('hero', function () {
    var hero = SWK.$('.hero');
    var wrap = SWK.$('.hero-cine');
    if (!hero) return;

    initTypewriter();

    var useGL = !!wrap && wantsGL();
    var canvas = SWK.$('.hero__gl', hero);
    if (!useGL || !canvas) {
      if (wrap) wrap.classList.add('is-flat');
      return;
    }

    var captions = SWK.$$('.hero__caption', hero);
    var ranges = [[0.26, 0.52], [0.52, 0.78], [0.78, 1.2]];
    var progress = 0;
    var scene = null;
    var visible = true;
    var mobile = window.matchMedia('(max-width: 767px)').matches;

    function flatten() {
      if (scene) { try { scene.dispose(); } catch (e) { /* noop */ } scene = null; }
      hero.classList.remove('is-gl', 'is-gl-pending');
      wrap.classList.add('is-flat');
    }

    var update = SWK.raf(function () {
      var total = wrap.offsetHeight - hero.offsetHeight;
      var r = wrap.getBoundingClientRect();
      progress = total > 0 ? SWK.clamp(-r.top / total, 0, 1) : 0;
      hero.style.setProperty('--p', progress.toFixed(4));
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
      if (scene) scene.setProgress(progress);
    });

    hero.classList.add('is-gl-pending');
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var giveUp = setTimeout(flatten, 15000);

    var src = (window.SWK_ASSETS || '/assets/js/') + 'hero-scene.js' + (window.SWK_V ? '?v=' + window.SWK_V : '');
    import(src).then(function (mod) {
      try {
        scene = mod.createHeroScene(canvas, { mobile: mobile });
      } catch (err) {
        console.warn('[swk] WebGL hero unavailable, using the photo hero.', err && err.message);
        clearTimeout(giveUp);
        flatten();
        return;
      }
      scene.onReady = function () {
        clearTimeout(giveUp);
        hero.classList.remove('is-gl-pending');
        hero.classList.add('is-gl');
      };
      scene.onSlow = flatten;
      scene.setProgress(progress);

      if (window.ResizeObserver) new ResizeObserver(function () { if (scene) scene.resize(); }).observe(canvas);
      else window.addEventListener('resize', function () { if (scene) scene.resize(); });

      canvas.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); flatten(); });

      function sync() {
        if (!scene) return;
        if (visible && !document.hidden) scene.start(); else scene.stop();
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
          sync();
        }, { threshold: 0 }).observe(hero);
      }
      document.addEventListener('visibilitychange', sync);
      sync();

      if (SWK.fine) {
        hero.addEventListener('pointermove', function (ev) {
          if (!scene || ev.pointerType === 'touch') return;
          var r = hero.getBoundingClientRect();
          scene.setPointer(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
        });
        hero.addEventListener('pointerleave', function () { if (scene) scene.setPointer(0, 0); });
      }
    }).catch(function (err) {
      console.warn('[swk] could not load the WebGL hero, using the photo hero.', err && err.message);
      clearTimeout(giveUp);
      flatten();
    });

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
