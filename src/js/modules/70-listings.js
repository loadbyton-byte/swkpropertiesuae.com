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
