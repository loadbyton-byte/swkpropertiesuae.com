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
  SWK.toast = function (msg, kind, ms) {
    if (!toastHost) toastHost = document.getElementById('toasts');
    if (!toastHost || !msg) return;
    var t = document.createElement('div');
    t.className = 'toast toast--' + (kind || 'info');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    var p = document.createElement('p'); p.textContent = msg;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'toast__close'; b.setAttribute('aria-label', 'Dismiss notification'); b.textContent = '×';
    t.appendChild(p); t.appendChild(b);
    toastHost.appendChild(t);
    while (toastHost.children.length > 3) toastHost.removeChild(toastHost.firstChild);
    requestAnimationFrame(function () { t.classList.add('is-in'); });
    var gone = false;
    function close() {
      if (gone) return; gone = true;
      t.classList.remove('is-in');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }
    b.addEventListener('click', close);
    setTimeout(close, ms || (kind === 'error' ? 8000 : 5500));
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
    var cb = cbEl ? dialog(cbEl) : null;
    SWK.$$('[data-open-callback]').forEach(function (b) {
      b.addEventListener('click', function (ev) { ev.preventDefault(); if (cb) { if (lead) lead.close(true); cb.open(b); } });
    });

    // ---- Lead-capture popup (once per 14 days, never on /contact/, never over the cookie banner)
    var leadEl = SWK.$('[data-lead-popup]');
    var lead = leadEl ? dialog(leadEl) : null;
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
