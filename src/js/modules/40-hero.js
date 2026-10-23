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

  // ---- Cinematic caption beats (letter-by-letter film titles) -----------
  function splitCaptionChars(node, state) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var word = document.createElement('span');
          word.className = 'cw';
          Array.prototype.slice.call(part).forEach(function (ch) {
            var c = document.createElement('span');
            c.className = 'cc';
            c.textContent = ch;
            c._v = -1;
            state.i++;
            word.appendChild(c);
          });
          frag.appendChild(word);
        });
        child.parentNode.replaceChild(frag, child);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        splitCaptionChars(child, state);
      }
    });
  }

  function initCaptionChars() {
    return SWK.$$('.hero__caption').map(function (cap) {
      var line = SWK.$('.cap-line', cap);
      if (!line) return [];
      splitCaptionChars(line, { i: 0 });
      return SWK.$$('.cc', line);
    });
  }

  // ---- Scroll-scrubbed stock video ------------------------------------
  SWK.reg('hero', function () {
    var hero = SWK.$('.hero');
    var wrap = SWK.$('.hero-cine');
    if (!hero) return;

    initTypewriter();
    var charSets = SWK.reduced ? [] : initCaptionChars();

    var video = SWK.$('.hero__video', hero);
    var captions = SWK.$$('.hero__caption', hero);
    // Curiosity pacing: three title cards, strictly separated beats — each
    // act fully leaves the frame before the next rises (a long, deliberate
    // Hollywood hold that asks to keep scrolling).
    var ranges = [[0.16, 0.44], [0.56, 0.80], [0.90, 1.2]];
    var progress = 0, target = 0, ready = false, failed = false, raf = 0;
    var mobile = window.matchMedia('(max-width: 767px)').matches;

    function flat() { if (wrap) wrap.classList.add('is-flat'); hero.classList.remove('is-gl', 'is-gl-pending'); failed = true; }

    var update = SWK.raf(function () {
      var total = wrap ? wrap.offsetHeight - hero.offsetHeight : 0;
      var r = wrap ? wrap.getBoundingClientRect() : { top: 0 };
      progress = total > 0 ? SWK.clamp(-r.top / total, 0, 1) : 0;
      hero.style.setProperty('--p', progress.toFixed(4));
      hero.classList.toggle('is-leaving', progress > 0.18);
      // Park the footage once it is no longer on stage: the video keeps
      // decoding 60fps otherwise, costing CPU/battery on every section
      // below the hero. It seeks fine while paused, so the scrub still works.
      if (video && ready && !failed && video.duration) {
        var parked = progress > 0.22;
        if (parked !== video.paused) {
          if (parked) video.pause();
          else {
            var resume = video.play();
            if (resume && resume.catch) resume.catch(function () {});
          }
        }
      }
      captions.forEach(function (el, i) {
        var rg = ranges[i] || [2, 3];
        var outW = 0.09;
        var outO = i === captions.length - 1 ? 1 : SWK.clamp((rg[1] - progress) / outW, 0, 1);
        var o = SWK.clamp((progress - rg[0]) / 0.05, 0, 1) * outO;
        el.style.setProperty('--o', o.toFixed(3));

        // Per-letter reveal: characters start a stagger apart and rise over
        // 0.05 of scroll — a film-title cascade that builds curiosity. The
        // stagger adapts so the cascade always fits before the fade-out.
        var chars = charSets[i] || [];
        var stagger = chars.length ? Math.min(0.011, (rg[1] - rg[0]) * 0.92 / chars.length) : 0;
        var active = progress > rg[0] - 0.02 && progress < rg[1] + outW + 0.12;
        for (var k = 0; k < chars.length; k++) {
          var c = chars[k];
          var co = 0;
          if (active) co = SWK.clamp((progress - (rg[0] + k * stagger)) / 0.05, 0, 1) * outO;
          if (c._v !== co) { c._v = co; c.style.setProperty('--co', co.toFixed(3)); }
        }
      });
      target = progress;
      if (ready && !raf) raf = requestAnimationFrame(seek);
    });

    // Ease the video's playhead toward the scroll position (smooth, never jumpy).
    function seek() {
      raf = 0;
      if (!video || !ready || failed || !video.duration) return;
      var want = target * (video.duration - 0.05);
      var diff = want - video.currentTime;
      if (Math.abs(diff) > 0.012) {
        var next = video.currentTime + diff * 0.22;
        try { if (video.fastSeek && Math.abs(diff) > 0.6) video.fastSeek(next); else video.currentTime = next; } catch (e) { /* noop */ }
        raf = requestAnimationFrame(seek);
      }
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var useVideo = video && wrap && !SWK.reduced && !/[?&]novideo\b/.test(location.search) &&
      !(navigator.connection && navigator.connection.saveData);
    if (!useVideo) { flat(); return; }

    hero.classList.add('is-gl-pending');
    var timer = setTimeout(flat, 12000);
    video.addEventListener('loadeddata', function () {
      clearTimeout(timer);
      ready = true;
      hero.classList.remove('is-gl-pending');
      hero.classList.add('is-gl');
      video.currentTime = 0.001;
      update();
    });
    video.addEventListener('error', function () { clearTimeout(timer); flat(); });
    video.src = mobile ? video.getAttribute('data-video-mobile') : video.getAttribute('data-video-desktop');
    video.load();

    // Pointer parallax: the footage tilts a few degrees with the cursor.
    if (SWK.fine) {
      hero.addEventListener('pointermove', function (ev) {
        var r = hero.getBoundingClientRect();
        var nx = ((ev.clientX - r.left) / r.width - 0.5) * 2, ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
        hero.style.setProperty('--tx', (nx * 14).toFixed(1) + 'px');
        hero.style.setProperty('--ty', (ny * 10).toFixed(1) + 'px');
      });
    }

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
