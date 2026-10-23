// Core namespace. Every feature registers itself with SWK.reg() and runs in its
// own try/catch on DOMContentLoaded, so one failing module can never take the
// rest of the page down with it.
(function () {
  'use strict';

  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };

  var SWK = (window.SWK = window.SWK || {});
  SWK.modules = [];
  SWK.reduced = mq('(prefers-reduced-motion: reduce)').matches;
  SWK.fine = mq('(hover: hover) and (pointer: fine)').matches;
  SWK.$ = function (sel, root) { return (root || document).querySelector(sel); };
  SWK.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  SWK.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  SWK.lerp = function (a, b, t) { return a + (b - a) * t; };
  SWK.reg = function (name, fn) { SWK.modules.push({ name: name, fn: fn }); };
  SWK.raf = function (fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  };

  function run() {
    SWK.modules.forEach(function (m) {
      try { m.fn(); } catch (err) { console.error('[swk] module "' + m.name + '" failed:', err); }
    });
  }

  // The bundle concatenates every module after this file, so defer the run
  // until they have all registered (a microtask, or DOMContentLoaded).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else Promise.resolve().then(run);
})();

// Preloader hand-off + resilient image loading.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('preloader', function () {
    function hide() {
      clearTimeout(window.__swkPreloaderTimer);
      var el = SWK.$('.preloader');
      if (!el) return;
      if (el.classList.contains('is-visible')) {
        // The loader only shows on a slow load. Before lifting it, make sure the first paint
        // is clean: web fonts settled and the hero picture decoded, never longer than 1.5s,
        // and never shown for less than 450ms (no flicker).
        var hero = SWK.$('.hero__bg img');
        var parts = [
          document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
          hero && hero.decode ? hero.decode().catch(function () {}) : Promise.resolve()
        ];
        var cap = new Promise(function (r) { setTimeout(r, 1500); });
        Promise.race([Promise.all(parts), cap]).then(function () {
          var wait = Math.max(0, 450 - (Date.now() - (window.__swkShownAt || 0)));
          setTimeout(function () {
            el.classList.add('is-hidden');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
          }, wait);
        });
      } else if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide, { once: true });
  });

  // Fade images in once loaded; show a quiet tile (not the browser's broken
  // icon) if one fails. Without JS, images are simply visible.
  SWK.reg('images', function () {
    function ok(img) { img.classList.add('is-loaded'); }
    function bad(img) { img.classList.add('is-broken'); img.classList.add('is-loaded'); }
    SWK.$$('img').forEach(function (img) {
      if (img.complete) { (img.naturalWidth > 0 ? ok : bad)(img); return; }
      img.addEventListener('load', function () { ok(img); }, { once: true });
      img.addEventListener('error', function () { bad(img); }, { once: true });
    });
  });
})();

// Scroll reveal for [data-reveal] (paired with the .js-gated CSS in base.css).
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('reveal', function () {
    var items = SWK.$$('[data-reveal]');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || SWK.reduced) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-reveal-delay') || '0', 10);
        if (delay) el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-visible');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    items.forEach(function (el) { io.observe(el); });
  });
})();

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

// Top navigation bar: transparent over the hero, a frosted bar once the page scrolls.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('header', function () {
    var bar = SWK.$('[data-site-header]');
    if (!bar) return;
    var update = SWK.raf(function () { bar.classList.toggle('is-scrolled', window.scrollY > 12); });
    window.addEventListener('scroll', update, { passive: true });
    update();
  });
})();

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

// Shared accessible lightbox (dialog, focus trap, keyboard + swipe).
(function () {
  'use strict';
  var SWK = window.SWK;

  var ICON = {
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
  };

  var root, imgEl, counterEl, list = [], index = 0, opener = null, label = 'Photo viewer';

  function build() {
    root = document.createElement('div');
    root.className = 'lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label);
    root.hidden = true;
    root.innerHTML =
      '<div class="lightbox__frame">' +
      '<button type="button" class="lightbox__close" aria-label="Close viewer">' + ICON.close + '</button>' +
      '<button type="button" class="lightbox__prev" aria-label="Previous photo">' + ICON.prev + '</button>' +
      '<img alt="">' +
      '<button type="button" class="lightbox__next" aria-label="Next photo">' + ICON.next + '</button>' +
      '<p class="lightbox__counter" aria-live="polite"></p>' +
      '</div>';
    document.body.appendChild(root);
    imgEl = SWK.$('img', root);
    counterEl = SWK.$('.lightbox__counter', root);

    SWK.$('.lightbox__close', root).addEventListener('click', close);
    SWK.$('.lightbox__prev', root).addEventListener('click', function () { show(index - 1); });
    SWK.$('.lightbox__next', root).addEventListener('click', function () { show(index + 1); });
    root.addEventListener('click', function (ev) { if (ev.target === root) close(); });

    var x0 = null;
    var frame = SWK.$('.lightbox__frame', root);
    frame.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; });
    frame.addEventListener('pointerup', function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    });
  }

  function show(i) {
    if (!list.length) return;
    index = (i + list.length) % list.length;
    imgEl.src = list[index].src;
    imgEl.alt = list[index].alt || '';
    counterEl.textContent = (index + 1) + ' / ' + list.length;
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowLeft') show(index - 1);
    else if (ev.key === 'ArrowRight') show(index + 1);
    else if (ev.key === 'Tab') {
      var f = SWK.$$('button', root);
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }

  function open(items, i, title, trigger) {
    if (!root) build();
    list = items;
    label = title || 'Photo viewer';
    root.setAttribute('aria-label', label);
    opener = trigger || document.activeElement;
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    show(i);
    document.addEventListener('keydown', onKey);
    var closeBtn = SWK.$('.lightbox__close', root);
    closeBtn.focus();
    if (document.activeElement !== closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
  }

  function close() {
    if (!root) return;
    root.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    setTimeout(function () { root.hidden = true; }, 300);
    if (opener && opener.focus) opener.focus();
  }

  SWK.lightbox = { open: open, close: close };

  // Property detail galleries: buttons with data-lightbox-index.
  SWK.reg('lightbox', function () {
    var gal = SWK.$('[data-gallery]');
    if (!gal) return;
    var btns = SWK.$$('[data-lightbox-index]', gal);
    var items = btns.map(function (b) {
      var img = SWK.$('img', b);
      return { src: b.getAttribute('data-full') || img.src, alt: img.alt };
    });
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { SWK.lightbox.open(items, i, gal.getAttribute('aria-label'), b); });
    });
  });
})();

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

// Properties page: filters (community, type, budget, status) + pagination.
// All cards are in the server-rendered HTML; JS only hides/shows them, so
// crawlers and no-JS visitors still get every listing.
(function () {
  'use strict';
  var SWK = window.SWK;
  var PAGE_SIZE = 9;

  function matchesBudget(price, key) {
    if (!key) return true;
    var parts = key.split('-').map(Number);
    var min = parts[0], max = parts[1];
    return max ? price >= min && price <= max : price >= min;
  }

  SWK.reg('listings', function () {
    var grid = SWK.$('[data-properties-grid]');
    var bar = SWK.$('[data-filters]');
    if (!grid || !bar) return;
    var cards = SWK.$$('.property-card', grid);
    var countEl = SWK.$('[data-results-count]');
    var emptyEl = SWK.$('[data-empty-state]');
    var pager = SWK.$('[data-pagination]');
    var fields = ['community', 'type', 'budget', 'status'];
    var page = 1;

    var params = new URLSearchParams(location.search);
    fields.forEach(function (name) {
      var sel = bar.elements[name];
      var v = params.get(name);
      if (sel && v && Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) sel.value = v;
    });
    page = Math.max(1, parseInt(params.get('page'), 10) || 1);

    function draw(scroll) {
      var f = {};
      fields.forEach(function (name) { f[name] = bar.elements[name] ? bar.elements[name].value : ''; });
      var matched = cards.filter(function (c) {
        if (f.community && c.dataset.community !== f.community) return false;
        if (f.type && c.dataset.type !== f.type) return false;
        if (f.status && c.dataset.status !== f.status) return false;
        return matchesBudget(Number(c.dataset.price), f.budget);
      });
      var pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
      page = Math.min(page, pages);
      var from = (page - 1) * PAGE_SIZE;
      cards.forEach(function (c) { c.hidden = true; });
      matched.slice(from, from + PAGE_SIZE).forEach(function (c) { c.hidden = false; });
      if (countEl) countEl.textContent = matched.length + ' propert' + (matched.length === 1 ? 'y' : 'ies') + ' found';
      if (emptyEl) emptyEl.hidden = matched.length !== 0;

      if (pager) {
        pager.innerHTML = '';
        if (pages > 1) {
          for (var i = 1; i <= pages; i++) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = String(i);
            b.setAttribute('aria-label', 'Page ' + i);
            if (i === page) { b.className = 'is-active'; b.setAttribute('aria-current', 'page'); }
            (function (k) { b.addEventListener('click', function () { page = k; draw(true); }); })(i);
            pager.appendChild(b);
          }
        }
      }

      var qs = new URLSearchParams();
      fields.forEach(function (name) { if (f[name]) qs.set(name, f[name]); });
      if (page > 1) qs.set('page', String(page));
      history.replaceState(null, '', qs.toString() ? '?' + qs : location.pathname);
      if (scroll) grid.scrollIntoView({ behavior: SWK.reduced ? 'auto' : 'smooth', block: 'start' });
    }

    bar.addEventListener('change', function () { page = 1; draw(false); });
    bar.addEventListener('submit', function (ev) { ev.preventDefault(); });
    var reset = SWK.$('[data-filters-reset]', bar);
    if (reset) reset.addEventListener('click', function () {
      fields.forEach(function (name) { if (bar.elements[name]) bar.elements[name].value = ''; });
      page = 1; draw(false);
    });
    draw(false);
  });
})();

// Mortgage calculator: loan maths, % / AED down-payment toggle, term pills,
// payoff date, donut chart. Behaviour matches the original calculator, with
// input validation (minimum deposit, sane ranges) and clearer totals added.
(function () {
  'use strict';
  var SWK = window.SWK;

  var MIN_DOWN_PCT = 20;           // UAE residents, first property (CBUAE guidance)
  var SERVICE_RATE = 0.007;        // illustrative annual service charge, % of price
  var INSURANCE_RATE = 0.0035;     // illustrative annual loan insurance, % of loan

  function money(v) {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(v);
  }

  function mortgage(price, downPct, ratePct, years) {
    var down = price * (downPct / 100);
    var loan = Math.max(price - down, 0);
    var r = ratePct / 100 / 12;
    var n = years * 12;
    var monthly = loan === 0 ? 0 : (r === 0 ? loan / n : (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    var repaid = monthly * n;
    return { down: down, loan: loan, monthly: monthly, interest: repaid - loan, repaid: repaid };
  }

  function wire(root) {
    var $ = function (s) { return SWK.$(s, root); };
    var price = $('[data-calc-field="price"]');
    var down = $('[data-calc-field="down"]');
    var rate = $('[data-calc-field="rate"]');
    var start = $('[data-calc-field="startDate"]');
    var hint = $('[data-calc-hint]');
    var hintDefault = hint ? hint.textContent : '';
    if (!price || !down || !rate) return;

    var terms = SWK.$$('[data-calc-term]', root);
    var units = SWK.$$('[data-down-unit]', root);
    var years = 25;
    var mode = 'percent';
    var out = {};
    ['monthlyPayment', 'downAmount', 'loanAmount', 'totalInterest', 'totalPayment', 'totalCost', 'piAmount', 'svcAmount', 'insAmount', 'endDate'].forEach(function (k) {
      out[k] = $('[data-calc-output="' + k + '"]');
    });
    var seg = { pi: $('[data-seg="pi"]'), svc: $('[data-seg="svc"]'), ins: $('[data-seg="ins"]') };
    var CIRC = 2 * Math.PI * 48;

    function num(el, fallback) { var v = parseFloat(el.value); return isFinite(v) ? v : fallback; }

    function currentPct(p) {
      var raw = num(down, 0);
      return mode === 'percent' ? raw : (p > 0 ? (raw / p) * 100 : 0);
    }

    function setSeg(circle, frac, offset) {
      if (!circle) return;
      var len = CIRC * Math.max(0, frac);
      circle.style.strokeDasharray = len + ' ' + Math.max(0, CIRC - len);
      circle.style.strokeDashoffset = String(-CIRC * offset);
    }

    function recalc(commit) {
      var p = SWK.clamp(num(price, 0), 0, 500000000);
      var pct = currentPct(p);
      var r = SWK.clamp(num(rate, 0), 0, 25);
      var msg = '';
      if (p < 200000 || num(price, 0) > 50000000) msg = 'Enter a value between AED 200,000 and AED 50,000,000.';
      p = SWK.clamp(p, 200000, 50000000);
      if (pct < MIN_DOWN_PCT) {
        msg = 'Raised to the ' + MIN_DOWN_PCT + '% minimum UAE banks typically require on a first home.';
        pct = MIN_DOWN_PCT;
        if (commit) {
          down.value = mode === 'percent' ? MIN_DOWN_PCT : Math.round(p * MIN_DOWN_PCT / 100);
        }
      }
      if (pct > 100) pct = 100;
      // The hint always occupies the same space (default helper text <-> warning),
      // so showing a warning on blur can never shift the controls under the pointer.
      if (hint) { hint.textContent = msg || hintDefault; hint.classList.toggle('is-warning', !!msg); }

      var m = mortgage(p, pct, r, years);
      var svc = (p * SERVICE_RATE) / 12;
      var ins = (m.loan * INSURANCE_RATE) / 12;
      var total = m.monthly + svc + ins;

      function set(k, v) { if (out[k]) out[k].textContent = v; }
      set('monthlyPayment', money(total));
      set('downAmount', money(m.down));
      set('loanAmount', money(m.loan));
      set('totalInterest', money(m.interest));
      set('totalPayment', money(m.repaid));
      set('totalCost', money(m.repaid + m.down));
      set('piAmount', money(m.monthly));
      set('svcAmount', money(svc));
      set('insAmount', money(ins));

      var pf = total > 0 ? m.monthly / total : 0;
      var sf = total > 0 ? svc / total : 0;
      var inf = total > 0 ? ins / total : 0;
      setSeg(seg.pi, pf, 0);
      setSeg(seg.svc, sf, pf);
      setSeg(seg.ins, inf, pf + sf);

      if (out.endDate) {
        var s = start && start.value ? new Date(start.value + 'T00:00:00') : new Date();
        if (isNaN(s.getTime())) s = new Date();
        var e = new Date(s);
        e.setFullYear(e.getFullYear() + years);
        out.endDate.value = e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }

    [price, down, rate].forEach(function (f) { f.addEventListener('input', function () { recalc(false); }); f.addEventListener('change', function () { recalc(true); }); });
    if (start) start.addEventListener('change', function () { recalc(true); });

    units.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('is-active')) return;
        var p = SWK.clamp(num(price, 0), 200000, 50000000);
        var pct = currentPct(p);
        mode = btn.getAttribute('data-down-unit');
        down.value = mode === 'percent' ? Math.round(pct * 10) / 10 : Math.round(p * (pct / 100));
        down.step = mode === 'percent' ? '1' : '10000';
        units.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        recalc(true);
      });
    });

    terms.forEach(function (btn) {
      btn.addEventListener('click', function () {
        years = Number(btn.getAttribute('data-calc-term'));
        terms.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        recalc(true);
      });
    });

    var again = $('[data-calc-recalc]');
    if (again) again.addEventListener('click', function () { recalc(true); });

    var dBtn = $('[data-calc-disclosure]');
    var dPanel = $('[data-calc-disclosure-panel]');
    if (dBtn && dPanel) {
      dBtn.addEventListener('click', function () {
        var open = dPanel.hidden;
        dPanel.hidden = !open;
        dBtn.setAttribute('aria-expanded', String(open));
        dBtn.classList.toggle('is-open', open);
      });
    }

    if (start && !start.value) {
      var d = new Date();
      start.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    recalc(false);
  }

  SWK.reg('calculator', function () { SWK.$$('[data-calculator]').forEach(wire); });
})();

// Contact + newsletter forms. With a configured endpoint they POST via fetch;
// without one they open a pre-filled email instead of pretending to send.
(function () {
  'use strict';
  var SWK = window.SWK;
  var CFG = { email: 'info@swkpropertiesuae.com', phone: '+971 56 433 0448' };

  var RULES = {
    name: 'Please enter your name.',
    email: 'Please enter a valid email address.',
    phone: 'Please enter a valid phone number, including country code.',
    message: 'Please tell us a little about what you need.',
    consent: 'Please tick the box to continue.'
  };

  function fieldWrap(el) { return el.closest('.form-field') || el.closest('.form-check') || el.parentNode; }

  function showError(el, msg) {
    var wrap = fieldWrap(el);
    wrap.classList.toggle('has-error', !!msg);
    var err = SWK.$('.form-error', wrap);
    if (!err && msg) {
      err = document.createElement('span');
      err.className = 'form-error';
      err.id = (el.id || el.name) + '-error';
      wrap.appendChild(err);
    }
    if (err) err.textContent = msg || '';
    if (msg && err) el.setAttribute('aria-describedby', err.id); else el.removeAttribute('aria-describedby');
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate(form) {
    var first = null;
    Array.prototype.slice.call(form.elements).forEach(function (el) {
      if (!el.name || el.type === 'submit' || el.type === 'button' || el.name === 'website') return;
      var msg = '';
      if (!el.checkValidity()) msg = RULES[el.name] || el.validationMessage;
      showError(el, msg);
      if (msg && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  function status(form, msg, kind) {
    var el = SWK.$('.form-status', form);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('form-success', kind !== 'error');
    el.hidden = false;
    if (SWK.toast) SWK.toast(msg, kind === 'error' ? 'error' : 'success');
  }

  SWK.reg('forms', function () {
    SWK.$$('form[data-form]').forEach(function (form) {
      form.noValidate = true;
      form.addEventListener('input', function (ev) {
        var t = ev.target;
        if (t.name && fieldWrap(t).classList.contains('has-error') && t.checkValidity()) showError(t, '');
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (form.elements.website && form.elements.website.value) return;
        if (!validate(form)) return;

        var kind = form.getAttribute('data-form');
        var data = new FormData(form);
        var endpoint = form.getAttribute('data-endpoint');
        var done = kind === 'contact'
          ? 'Thank you — your message has been received. A consultant will be in touch within one business day.'
          : kind === 'viewing'
            ? 'Thank you — we have your viewing request and will confirm shortly.'
          : kind === 'callback'
            ? 'Thank you — we will call you back at your preferred time.'
            : 'Thank you — you\'re subscribed.';

        if (!endpoint) {
          var body = kind === 'viewing'
            ? 'Please book me a viewing.\nProperty page: ' + location.href + '\nName: ' + data.get('name') + '\nPhone: ' + data.get('phone') + '\nWhen: ' + data.get('date') + ' ' + data.get('time')
            : kind === 'callback'
            ? 'Please call me back.\nName: ' + data.get('name') + '\nPhone: ' + data.get('phone') + '\nBest time: ' + (data.get('when') || '-')
            : kind === 'contact'
            ? 'Name: ' + data.get('name') + '\nEmail: ' + data.get('email') + '\nPhone: ' + (data.get('phone') || '-') +
              '\nInterested in: ' + data.get('interest') + '\n\n' + data.get('message')
            : 'Please add ' + data.get('email') + ' to the SWK Properties market updates list.';
          status(form, 'Your email app should open with your message ready to send. Prefer WhatsApp? Message us on ' + CFG.phone + '.', 'ok');
          window.location.href = 'mailto:' + CFG.email + '?subject=' + encodeURIComponent(kind === 'contact' ? 'Website enquiry' : kind === 'callback' ? 'Callback request' : kind === 'viewing' ? 'Viewing request' : 'Newsletter sign-up') +
            '&body=' + encodeURIComponent(body);
          return;
        }

        var btn = SWK.$('button[type="submit"]', form);
        if (btn) btn.disabled = true;
        fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
          .then(function (res) {
            if (!res.ok) throw new Error('status ' + res.status);
            form.reset();
            status(form, done, 'ok');
          })
          .catch(function () {
            status(form, 'Sorry, that did not send. Please email ' + CFG.email + ' or message us on WhatsApp.', 'error');
          })
          .then(function () { if (btn) btn.disabled = false; });
      });
    });

    // Prefill from ?property=<id>
    var cf = SWK.$('#contact-form');
    if (cf) {
      var prop = new URLSearchParams(location.search).get('property');
      if (prop && cf.elements.message && !cf.elements.message.value) {
        var title = prop.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        cf.elements.message.value = 'Hello, I\'d like more details on ' + title + '.';
        if (cf.elements.interest) cf.elements.interest.value = 'Buying a property';
      }
    }
  });
})();

// FAQ accordion, team photo-stack carousel, scroll progress, stat counters.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('accordion', function () {
    SWK.$$('[data-accordion-item]').forEach(function (item) {
      var trigger = SWK.$('[data-accordion-trigger]', item);
      var panel = SWK.$('[data-accordion-panel]', item);
      if (!trigger || !panel) return;
      panel.style.maxHeight = '0px';
      panel.setAttribute('aria-hidden', 'true');
      trigger.addEventListener('click', function () {
        var open = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', String(!open));
        item.classList.toggle('is-open', !open);
        panel.setAttribute('aria-hidden', String(open));
        panel.style.maxHeight = open ? '0px' : panel.scrollHeight + 'px';
      });
    });
    window.addEventListener('resize', SWK.raf(function () {
      SWK.$$('[data-accordion-item].is-open [data-accordion-panel]').forEach(function (p) { p.style.maxHeight = p.scrollHeight + 'px'; });
    }));
  });

  SWK.reg('team', function () {
    var root = SWK.$('[data-testimonials-carousel]');
    if (!root) return;
    var dataEl = SWK.$('#team-data');
    if (!dataEl) return;
    var items = JSON.parse(dataEl.textContent);
    var photos = SWK.$$('[data-tc-photo]', root);
    var textEl = SWK.$('[data-tc-text]', root);
    var active = 0;

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function renderText() {
      var t = items[active];
      var words = t.bio.split(' ');
      textEl.innerHTML =
        '<h3 class="tc-name">' + esc(t.name) + '</h3>' +
        '<p class="tc-designation">' + esc(t.role) + '</p>' +
        '<p class="tc-quote">' + words.map(function (w) { return '<span class="tc-word">' + esc(w) + '</span>'; }).join(' ') + '</p>';
      var els = SWK.$$('.tc-word', textEl);
      if (SWK.reduced) { els.forEach(function (w) { w.classList.add('is-in'); }); return; }
      els.forEach(function (w, i) { w.style.transitionDelay = (i * 0.02) + 's'; });
      setTimeout(function () { els.forEach(function (w) { w.classList.add('is-in'); }); }, 16);
    }

    function set(i) {
      active = ((i % items.length) + items.length) % items.length;
      photos.forEach(function (p, k) {
        p.classList.toggle('is-active', k === active);
        p.style.zIndex = k === active ? '999' : String(items.length + 2 - k);
      });
      renderText();
    }

    SWK.$('[data-tc-prev]', root).addEventListener('click', function () { set(active - 1); });
    SWK.$('[data-tc-next]', root).addEventListener('click', function () { set(active + 1); });

    var media = SWK.$('[data-tc-media]', root);
    var x0 = null;
    media.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; });
    media.addEventListener('pointerup', function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) set(active + (dx < 0 ? 1 : -1));
    });
    set(0);
  });

  // The glow layers are large blurred blobs; only paint/animate those on screen.
  SWK.reg('glow-visibility', function () {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var glow = SWK.$('.ambient-glow', entry.target);
        if (glow) glow.classList.toggle('is-off', !entry.isIntersecting);
      });
    }, { rootMargin: '120px 0px' });
    SWK.$$('.ambient-glow-host').forEach(function (host) {
      var glow = SWK.$('.ambient-glow', host);
      if (glow) glow.classList.add('is-off');
      io.observe(host);
    });
  });

  SWK.reg('scroll-progress', function () {
    var bar = SWK.$('.scroll-progress');
    if (!bar) return;
    var update = SWK.raf(function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--scroll-p', h > 0 ? SWK.clamp(window.scrollY / h, 0, 1).toFixed(4) : '0');
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  SWK.reg('counters', function () {
    var els = SWK.$$('[data-count]');
    if (!els.length || SWK.reduced || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        var end = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var t0 = performance.now();
        (function tick(now) {
          var t = SWK.clamp((now - t0) / 1400, 0, 1);
          var e = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(end * e) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { el.textContent = '0' + (el.getAttribute('data-suffix') || ''); io.observe(el); });
  });
})();

// Site-wide UI systems: toasts, announcement bar, cookie consent (gates analytics),
// lead-capture popup, callback modal, back-to-top and connectivity notices.
(function () {
  'use strict';
  var SWK = window.SWK;

  function store(k, v) {
    try {
      if (v === undefined) return window.localStorage.getItem(k);
      if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v);
    } catch (err) { /* storage blocked */ }
    return null;
  }
  function cfg() {
    var el = document.getElementById('swk-config');
    try { return el ? JSON.parse(el.textContent) : {}; } catch (err) { return {}; }
  }

  // ---- Toasts --------------------------------------------------------------
  var toastHost;
  SWK.toast = function (msg, kind, ms, actions) {
    if (!toastHost) toastHost = document.getElementById('toasts');
    if (!toastHost || !msg) return;
    var t = document.createElement('div');
    t.className = 'toast toast--' + (kind || 'info');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var wrap = document.createElement('div'); wrap.className = 'toast__body';
    var p = document.createElement('p'); p.textContent = msg; wrap.appendChild(p);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'toast__close'; b.setAttribute('aria-label', 'Dismiss notification'); b.textContent = '\u00d7';
    t.appendChild(wrap); t.appendChild(b);
    toastHost.appendChild(t);
    if (actions && actions.length) {
      var row = document.createElement('div'); row.className = 'toast__actions';
      actions.forEach(function (a) {
        var el = document.createElement(a.href ? 'a' : 'button');
        el.textContent = a.label;
        if (a.href) { el.href = a.href; if (/^http/.test(a.href)) { el.target = '_blank'; el.rel = 'noopener noreferrer'; } } else el.type = 'button';
        el.addEventListener('click', function () { if (a.onclick) a.onclick(); close(); });
        row.appendChild(el);
      });
      wrap.appendChild(row);
    }
    while (toastHost.children.length > 3) toastHost.removeChild(toastHost.firstChild);
    requestAnimationFrame(function () { t.classList.add('is-in'); });
    var gone = false;
    function close() {
      if (gone) return; gone = true;
      t.classList.remove('is-in');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }
    b.addEventListener('click', close);
    setTimeout(close, ms || (actions ? 14000 : kind === 'error' ? 8000 : 5500));
  };

  // ---- Dialog helper (focus trap, ESC, backdrop click, focus return) -------
  var openDialog = null;
  function dialog(el) {
    var api = { el: el, opener: null };
    function focusables() {
      return SWK.$$('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])', el)
        .filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
    }
    api.open = function (opener) {
      if (openDialog && openDialog !== api) openDialog.close(true);
      api.opener = opener || document.activeElement;
      el.hidden = false;
      document.documentElement.classList.add('has-dialog');
      requestAnimationFrame(function () {
        el.classList.add('is-open');
        var f = SWK.$('[data-autofocus]', el) || focusables()[0];
        if (f) f.focus();
      });
      openDialog = api;
    };
    api.close = function (silent) {
      el.classList.remove('is-open');
      document.documentElement.classList.remove('has-dialog');
      setTimeout(function () { if (!el.classList.contains('is-open')) el.hidden = true; }, 250);
      if (openDialog === api) openDialog = null;
      if (!silent && api.opener && api.opener.focus) api.opener.focus();
      if (api.onclose) api.onclose();
    };
    el.addEventListener('click', function (ev) {
      if (ev.target === el || ev.target.closest('[data-dialog-close]')) api.close();
    });
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); api.close(); return; }
      if (ev.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    return api;
  }

  // ---- Analytics, loaded only after consent --------------------------------
  var analyticsLoaded = false;
  function loadScript(src) {
    var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s);
  }
  function loadAnalytics(c, consent) {
    if (analyticsLoaded || !consent || !consent.a) return;
    var a = c.analytics || {};
    if (!a.ga4 && !a.gtm && !a.metaPixel) return;
    analyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];
    if (a.ga4) {
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', a.ga4, { anonymize_ip: true });
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(a.ga4));
    }
    if (a.gtm) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(a.gtm));
    }
    if (a.metaPixel && consent.m) {
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      n.queue = []; n.loaded = true; n.version = '2.0'; n.push = n;
      loadScript('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', a.metaPixel);
      window.fbq('track', 'PageView');
    }
  }

  SWK.reg('ui', function () {
    var C = cfg();

    // Toast region fallback.
    toastHost = document.getElementById('toasts');

    // ---- Announcement bar
    var ann = SWK.$('[data-announce]');
    if (ann) {
      var annBtn = SWK.$('[data-announce-close]', ann);
      if (annBtn) annBtn.addEventListener('click', function () {
        store('swk_ann', ann.getAttribute('data-announce'));
        document.documentElement.classList.add('ann-off');
      });
    }

    // ---- Cookie consent
    var banner = SWK.$('[data-cookie-banner]');
    var prefsEl = SWK.$('[data-cookie-prefs]');
    var prefs = prefsEl ? dialog(prefsEl) : null;
    var consent = null;
    try { consent = JSON.parse(store('swk_consent_v1') || 'null'); } catch (err) { consent = null; }
    SWK.consent = consent;

    function saveConsent(a, m) {
      consent = { a: !!a, m: !!m, t: Date.now() };
      store('swk_consent_v1', JSON.stringify(consent));
      SWK.consent = consent;
      if (banner) banner.classList.remove('is-in');
      setTimeout(function () { if (banner) banner.hidden = true; }, 350);
      loadAnalytics(C, consent);
      if (prefs && !prefsEl.hidden) prefs.close(true);
      if (SWK.toast) SWK.toast(a || m ? 'Preferences saved. Thank you.' : 'Only essential cookies are in use.', 'success', 3500);
      scheduleLeadPopup();
    }
    if (banner) {
      if (!consent) setTimeout(function () { banner.hidden = false; requestAnimationFrame(function () { banner.classList.add('is-in'); }); }, 1400);
      SWK.$$('[data-cookie-accept]').forEach(function (b) { b.addEventListener('click', function () { saveConsent(true, true); }); });
      SWK.$$('[data-cookie-reject]').forEach(function (b) { b.addEventListener('click', function () { saveConsent(false, false); }); });
      SWK.$$('[data-cookie-customise]').forEach(function (b) { b.addEventListener('click', function () { if (prefs) prefs.open(b); }); });
    }
    if (prefsEl) {
      var tA = SWK.$('[name="cc-analytics"]', prefsEl), tM = SWK.$('[name="cc-marketing"]', prefsEl);
      var sv = SWK.$('[data-cookie-save]', prefsEl);
      if (sv) sv.addEventListener('click', function () { saveConsent(tA && tA.checked, tM && tM.checked); });
      SWK.$$('[data-cookie-accept-all]', prefsEl).forEach(function (b) { b.addEventListener('click', function () { saveConsent(true, true); }); });
    }
    SWK.$$('[data-cookie-settings]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!prefs) return;
        var tA = SWK.$('[name="cc-analytics"]', prefsEl), tM = SWK.$('[name="cc-marketing"]', prefsEl);
        if (tA) tA.checked = !!(consent && consent.a);
        if (tM) tM.checked = !!(consent && consent.m);
        prefs.open(b);
      });
    });
    loadAnalytics(C, consent);

    // ---- Callback modal
    var cbEl = SWK.$('[data-callback-modal]');
    var cb = cbEl ? dialog(cbEl) : null; var lead = null;
    SWK.$$('[data-open-callback]').forEach(function (b) {
      b.addEventListener('click', function (ev) { ev.preventDefault(); if (cb) { if (lead) lead.close(true); cb.open(b); } });
    });

    // ---- Viewing modal
    var vwEl = SWK.$('[data-viewing-modal]');
    var vw = vwEl ? dialog(vwEl) : null;
    SWK.$$('[data-open-viewing]').forEach(function (b) {
      b.addEventListener('click', function (ev) { ev.preventDefault(); if (vw) vw.open(b); });
    });
    var vwDate = vwEl && SWK.$('[name="date"]', vwEl);
    if (vwDate) { var d = new Date(); d.setDate(d.getDate() + 1); vwDate.min = d.toISOString().slice(0, 10); }

    // ---- Save listing (local shortlist)
    SWK.$$('[data-save-listing]').forEach(function (b) {
      var id = b.getAttribute('data-save-listing');
      var list = [];
      try { list = JSON.parse(store('swk_saved') || '[]'); } catch (err) { list = []; }
      function paint() { var on = list.indexOf(id) > -1; b.classList.toggle('is-saved', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? 'Saved to shortlist' : 'Save listing'; }
      paint();
      b.addEventListener('click', function () {
        var i = list.indexOf(id);
        if (i > -1) list.splice(i, 1); else list.push(id);
        store('swk_saved', JSON.stringify(list)); paint();
        SWK.toast(i > -1 ? 'Removed from your shortlist.' : 'Saved to your shortlist on this device.', 'success', 3200);
      });
    });

    // ---- Helpful nudges (once per session each, never stacked on dialogs)
    function once(k) { try { if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); return true; } catch (err) { return true; } }
    var onProperty = /^\/properties\/[^/]+\/$/.test(location.pathname);
    if (onProperty) {
      setTimeout(function () {
        if (openDialog || (banner && !banner.hidden && !consent) || !once('swk_nudge_prop')) return;
        SWK.toast('Interested in this property? We can arrange a viewing or send the brochure.', 'promo', 16000, [
          { label: 'Book a viewing', onclick: function () { if (vw) vw.open(null); } },
          { label: 'WhatsApp us', href: (C.whatsapp || 'https://wa.me/971564330448') }
        ]);
      }, 40000);
    }
    var deep = SWK.raf(function () {
      var h = document.documentElement.scrollHeight - innerHeight;
      if (location.pathname === '/' && h > 0 && window.scrollY / h > 0.7 && !openDialog && once('swk_nudge_home')) {
        window.removeEventListener('scroll', deep);
        SWK.toast('Ready to take the next step? Speak to a consultant, no obligation.', 'promo', 14000, [
          { label: 'Request a callback', onclick: function () { if (cb) cb.open(null); } },
          { label: 'Browse listings', href: '/properties/' }
        ]);
      }
    });
    if (location.pathname === '/') window.addEventListener('scroll', deep, { passive: true });
    // Mortgage calculator hint
    if (location.pathname === '/mortgage/') {
      setTimeout(function () {
        if (!openDialog && once('swk_nudge_mort')) SWK.toast('Tip: most Dubai buyers can finance up to 80% of the price. Our team can compare lenders for you.', 'info', 12000, [{ label: 'Talk to us', href: '/contact/' }]);
      }, 25000);
    }

    // ---- Lead-capture popup (once per 14 days, never on /contact/, never over the cookie banner)
    var leadEl = SWK.$('[data-lead-popup]');
    lead = leadEl ? dialog(leadEl) : null;
    var leadShown = false, leadTimer = null;
    function leadAllowed() {
      if (!lead || leadShown || openDialog) return false;
      if (/^\/(contact|privacy|terms|cookies)\//.test(location.pathname)) return false;
      var last = parseInt(store('swk_lead') || '0', 10);
      if (last && Date.now() - last < 14 * 864e5) return false;
      if (banner && !banner.hidden && !consent) return false;
      return true;
    }
    function showLead() {
      if (!leadAllowed()) return;
      leadShown = true;
      store('swk_lead', String(Date.now()));
      lead.open(null);
    }
    function scheduleLeadPopup() {
      if (!lead || leadTimer || C.popup === undefined || !C.popup.enabled) return;
      var delay = Math.max(8, C.popup.delaySeconds || 30) * 1000;
      leadTimer = setTimeout(showLead, delay);
      document.addEventListener('mouseout', function onOut(ev) {
        if (ev.clientY <= 0 && !ev.relatedTarget && SWK.fine && leadAllowed() && Date.now() - t0 > 12000) {
          document.removeEventListener('mouseout', onOut); showLead();
        }
      });
    }
    var t0 = Date.now();
    if (consent || !banner) scheduleLeadPopup();

    // ---- Journal topic filter
    var chips = SWK.$$('[data-blog-filter]');
    if (chips.length) {
      var items = SWK.$$('[data-category]');
      var counter = SWK.$('[data-blog-count]');
      chips.forEach(function (c) {
        c.addEventListener('click', function () {
          var v = c.getAttribute('data-blog-filter'), shown = 0;
          chips.forEach(function (o) { var on = o === c; o.classList.toggle('is-active', on); o.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          items.forEach(function (it) { var ok = v === 'all' || it.getAttribute('data-category') === v; it.hidden = !ok; if (ok) shown++; });
          if (counter) counter.textContent = shown + (shown === 1 ? ' article' : ' articles');
        });
      });
    }

    // ---- Office open / closed (Dubai time)
    SWK.$$('[data-open-status]').forEach(function (el) {
      try {
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        var o = {}; parts.forEach(function (x) { o[x.type] = x.value; });
        var mins = parseInt(o.hour, 10) * 60 + parseInt(o.minute, 10), day = o.weekday;
        var open = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].indexOf(day) > -1 && mins >= 540 && mins < 1140) || (day === 'Sat' && mins >= 600 && mins < 960);
        el.textContent = open ? 'Open now' : 'Closed now';
        el.classList.toggle('is-open', open);
      } catch (err) { el.textContent = ''; }
    });

    // ---- Back to top
    var top = SWK.$('[data-back-top]');
    if (top) {
      var upd = SWK.raf(function () { top.classList.toggle('is-in', window.scrollY > window.innerHeight * 0.9); });
      window.addEventListener('scroll', upd, { passive: true }); upd();
      top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: SWK.reduced ? 'auto' : 'smooth' }); });
    }

    // ---- Share / copy link
    SWK.$$('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        var data = { title: document.title, url: location.href };
        if (navigator.share) { navigator.share(data).catch(function () {}); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(location.href).then(function () { SWK.toast('Link copied to clipboard.', 'success', 3000); },
            function () { SWK.toast('Copy failed. Please copy the address from your browser.', 'error'); });
        } else SWK.toast(location.href, 'info');
      });
    });

    // ---- Connectivity
    window.addEventListener('offline', function () { SWK.toast('You are offline. Some features may not work until you reconnect.', 'error', 7000); });
    window.addEventListener('online', function () { SWK.toast('Back online.', 'success', 3000); });
  });
})();

(function () {
  'use strict';
  var S = window.SWK;
  S.reg('concierge', function () {
    var toggle=S.$('[data-chat-toggle]'), panel=S.$('#swk-chat-panel');
    if(!toggle || !panel) return;
    var input=S.$('#swk-chat-input'), log=S.$('[data-chat-log]'), transcript=[];
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}
    toggle.addEventListener('click',function(){panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden) input.focus();});
    S.$('[data-chat-close]').addEventListener('click',close);
    panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}});
    function add(text,user){var p=document.createElement('p');p.className='swk-chat__message'+(user?' swk-chat__message--user':'');p.textContent=text;log.appendChild(p);log.scrollTop=log.scrollHeight;while(log.children.length>30)log.firstElementChild.remove();}
    function reply(text){
      var q=text.toLowerCase(), answer;
      if(/human|speak|agent|person|live|contact/.test(q))answer='Our team can pick this up on WhatsApp. Use the button below to share this conversation. Availability depends on the team; this assistant cannot confirm that an agent is online.';
      else if(/off.?plan|payment|developer/.test(q))answer='For an off-plan shortlist, tell SWK your budget, preferred area and target handover date. Ask for the payment schedule, project registration details and what is included in the price. Explore current options on our Properties page, then confirm availability with a consultant.';
      else if(/sell|valuation/.test(q))answer='Selling in Dubai? Share the community, building, property type and whether it is tenanted with our team. A useful valuation compares similar homes and their condition. Use WhatsApp below to request a property-specific conversation; please do not post identity documents here.';
      else if(/rent|yield|invest|roi/.test(q))answer='Start with the purchase price, realistic rent, service charges, maintenance and expected vacancy. Our mortgage calculator can help with financing estimates. Returns are not guaranteed; SWK can help you compare the assumptions behind a shortlist.';
      else if(/mortgage|loan|financ/.test(q))answer='Our Mortgage page includes a calculator for monthly payment estimates. Share your purchase budget and whether you are a resident with the SWK team for a personal discussion. Rates and eligibility need confirmation with a lender.';
      else if(/buy|home|villa|apartment|budget|bedroom/.test(q))answer='To build a useful shortlist, tell us your budget in AED, preferred neighbourhood, number of bedrooms and whether you want to move in or invest. Browse the Properties page or use the WhatsApp button to send your brief directly to SWK.';
      else answer='I can help with buying, off-plan homes, selling and the next steps in a Dubai property search. For current prices, availability or a question specific to you, send your brief to the SWK team using the WhatsApp button below.';
      add(text,true);add(answer,false);transcript.push('You: '+text,'SWK assistant: '+answer);transcript=transcript.slice(-12);
      S.$('[data-chat-handoff]').href='https://wa.me/971564330448?text='+encodeURIComponent('Hello SWK, I would like a consultant to help.\n\n'+transcript.join('\n'));
    }
    S.$('[data-chat-form]').addEventListener('submit',function(e){e.preventDefault();var text=input.value.trim();if(!text)return;reply(text.slice(0,1000));input.value='';});
    S.$$('[data-chat-topic]').forEach(function(b){b.addEventListener('click',function(){reply(b.textContent);});});
  });
  S.reg('review-stories',function(){
    var root=S.$('[data-review-carousel]');if(!root)return;
    var slides=S.$$('[data-review-slide]',root),i=0,paused=S.reduced,timer,pause=S.$('[data-review-pause]',root);
    function show(n){i=(n+slides.length)%slides.length;slides.forEach(function(s,k){s.hidden=k!==i;});S.$('[data-review-count]',root).textContent=(i+1)+' / '+slides.length;}
    function stop(){clearInterval(timer);}
    function start(){stop();if(!paused&&!document.hidden)timer=setInterval(function(){show(i+1);},8000);}
    S.$('[data-review-prev]',root).addEventListener('click',function(){show(i-1);start();});
    S.$('[data-review-next]',root).addEventListener('click',function(){show(i+1);start();});
    function label(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
    pause.addEventListener('click',function(){paused=!paused;label();start();});
    root.addEventListener('mouseenter',stop);root.addEventListener('mouseleave',start);
    root.addEventListener('focusin',stop);root.addEventListener('focusout',function(e){if(!root.contains(e.relatedTarget))start();});
    document.addEventListener('visibilitychange',start);label();start();
  });
  S.reg('premium-pointer',function(){
    if(S.reduced||!S.fine)return;
    S.$$('.fan-card,.service-card').forEach(function(card){
      var point={clientX:0,clientY:0}; var update=S.raf(function(){var e=point;var r=card.getBoundingClientRect();card.style.setProperty('--image-x',((e.clientX-r.left)/r.width-.5)*-12+'px');card.style.setProperty('--image-y',((e.clientY-r.top)/r.height-.5)*-12+'px');card.style.setProperty('--spot-x',e.clientX-r.left+'px');card.style.setProperty('--spot-y',e.clientY-r.top+'px');}); card.addEventListener('pointermove',function(e){point.clientX=e.clientX;point.clientY=e.clientY;update();});
      card.addEventListener('pointerleave',function(){card.style.setProperty('--image-x','0px');card.style.setProperty('--image-y','0px');});
    });
  });
})();
