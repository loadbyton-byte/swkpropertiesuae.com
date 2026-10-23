// Fixed listing console (right beneath the announcement bar): page arrows,
// a live readout fed by the featured deck / listing grid, and the
// scroll-to-listings pill.
(function () {
  'use strict';
  var SWK = window.SWK;

  SWK.reg('console', function () {
    var c = SWK.$('[data-deck-console]');
    var now = c && SWK.$('[data-deck-now]', c);
    var total = c && SWK.$('[data-deck-total]', c);
    if (!c) return;

    function pad(v) {
      var s = String(v);
      return ('00' + s).slice(-2);
    }

    document.addEventListener('swk:deck-state', function (ev) {
      if (!now || !ev.detail) return;
      now.textContent = pad(ev.detail.i);
      total.textContent = pad(ev.detail.n);
      c.classList.toggle('is-live', ev.detail.n > 1);
    });
    // Modules below this one (listings) register later; ask for them to sync.
    document.dispatchEvent(new CustomEvent('swk:deck-state-request'));

    document.addEventListener('click', function (ev) {
      var pageBtn = ev.target.closest ? ev.target.closest('[data-deck-page]') : null;
      if (pageBtn) {
        ev.preventDefault();
        document.dispatchEvent(new CustomEvent('swk:deck-page', { detail: { dir: Number(pageBtn.getAttribute('data-deck-page')) || 1 } }));
        return;
      }
      var jump = ev.target.closest ? ev.target.closest('[data-jump-listings]') : null;
      if (!jump) return;
      ev.preventDefault();
      var target = SWK.$('[data-properties-grid], [data-feature-slider]') || SWK.$('#main');
      if (target) target.scrollIntoView({ behavior: SWK.reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
