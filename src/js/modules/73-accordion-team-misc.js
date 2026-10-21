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
