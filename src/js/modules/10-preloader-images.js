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
        el.classList.add('is-hidden');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
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
