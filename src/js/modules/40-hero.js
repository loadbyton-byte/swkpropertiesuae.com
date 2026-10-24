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
            c.style.transitionDelay = (0.05 + state.i * 0.012).toFixed(3) + 's';
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

    var spatial = /[?&](?:scene=3d|hold)\b/.test(location.search);
    var modeLinks = SWK.$$('[data-hero-mode]');
    modeLinks.forEach(function (link) { if ((link.getAttribute('data-hero-mode') === '3d') === spatial) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    if (spatial) {
      hero.classList.add('is-spatial-mode');
      var source = SWK.$('.hero__bg source', hero), poster = SWK.$('.hero__bg img', hero);
      if (source) source.srcset = '/assets/images/hero/hero-scene-mobile-cinematic.webp';
      if (poster) { poster.src = '/assets/images/hero/hero-scene-cinematic.webp'; poster.alt = 'Stylised Dubai skyline rendered in 3D'; }
    } else {
      hero.classList.add('is-photo-mode');
      if (wrap && !SWK.reduced && !/[?&]nowebgl\b/.test(location.search)) {
        var photoCaptions = SWK.$$('.hero__caption', hero);
        var photoUpdate = SWK.raf(function () {
          var extent = wrap.offsetHeight - hero.offsetHeight;
          var p = extent > 0 ? SWK.clamp(-wrap.getBoundingClientRect().top / extent, 0, 1) : 0;
          hero.style.setProperty('--p', p.toFixed(4)); hero.classList.toggle('is-leaving', p > 0.18);
          [[0.26,0.52],[0.52,0.78],[0.78,1.2]].forEach(function(r,i){var el=photoCaptions[i];if(!el)return;var t=SWK.clamp((p-r[0])/(r[1]-r[0]),0,1);var o=SWK.clamp((p-r[0])/.07,0,1)*(i===2?1:SWK.clamp((r[1]-p)/.07,0,1));el.style.setProperty('--o',o.toFixed(3));el.style.setProperty('--y',((.5-t)*46).toFixed(1)+'px');el.style.setProperty('--s',(.96+t*.07).toFixed(3));});
        });
        window.addEventListener('scroll', photoUpdate, {passive:true}); window.addEventListener('resize', photoUpdate); photoUpdate();
      } else if (wrap) wrap.classList.add('is-flat');
      return;
    }
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
      hero.classList.remove('is-gl', 'is-gl-pending', 'is-spatial-mode');
      hero.classList.add('is-photo-mode');
      var fallbackSource = SWK.$('.hero__bg source', hero), fallbackImage = SWK.$('.hero__bg img', hero);
      if (fallbackSource) fallbackSource.srcset = '/assets/images/hero/dubai-cinema-home.webp';
      if (fallbackImage) { fallbackImage.src = '/assets/images/hero/dubai-cinema-home.webp'; fallbackImage.alt = 'AI-created cinematic Dubai architectural visualisation'; }
      modeLinks.forEach(function (link) { if (link.getAttribute('data-hero-mode') === 'cinematic') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
      // Retain the scroll stage and chapter transitions when switching away from a slow GPU.
      // Collapsing the stage during a journey would move the entire page under the visitor.
      if (SWK.reduced) wrap.classList.add('is-flat');
      if (update) update();
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
        scene = mod.createHeroScene(canvas, { mobile: mobile, hold: /[?&]hold\b/.test(location.search) });
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
