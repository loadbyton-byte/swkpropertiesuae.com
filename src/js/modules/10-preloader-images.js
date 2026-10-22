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
