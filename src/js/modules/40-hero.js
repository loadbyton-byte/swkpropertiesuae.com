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

  // ---- Scroll-scrubbed stock video ------------------------------------
  SWK.reg('hero', function () {
    var hero = SWK.$('.hero');
    var wrap = SWK.$('.hero-cine');
    if (!hero) return;

    initTypewriter();

    var video = SWK.$('.hero__video', hero);
    var captions = SWK.$$('.hero__caption', hero);
    var ads = SWK.$$('[data-ad]', hero);
    var adRanges = [[0.10, 0.42], [0.26, 0.58], [0.44, 0.78], [0.62, 0.92], [0.78, 1.05]];
    var ranges = [[0.26, 0.52], [0.52, 0.78], [0.78, 1.2]];
    var progress = 0, target = 0, ready = false, failed = false, raf = 0;
    var mobile = window.matchMedia('(max-width: 767px)').matches;

    function flat() { if (wrap) wrap.classList.add('is-flat'); hero.classList.remove('is-gl', 'is-gl-pending'); failed = true; }

    var update = SWK.raf(function () {
      var total = wrap ? wrap.offsetHeight - hero.offsetHeight : 0;
      var r = wrap ? wrap.getBoundingClientRect() : { top: 0 };
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
      ads.forEach(function (el, i) {
        var rg = adRanges[i] || [2, 3];
        var o = SWK.clamp((progress - rg[0]) / 0.06, 0, 1) * SWK.clamp((rg[1] - progress) / 0.06, 0, 1);
        var t = SWK.clamp((progress - rg[0]) / (rg[1] - rg[0]), 0, 1);
        el.style.setProperty('--o', o.toFixed(3));
        el.style.setProperty('--y', ((0.5 - t) * 60).toFixed(1) + 'px');
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
