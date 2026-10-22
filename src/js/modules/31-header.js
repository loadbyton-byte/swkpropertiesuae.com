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
