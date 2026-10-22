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
          : kind === 'callback'
            ? 'Thank you — we will call you back at your preferred time.'
            : 'Thank you — you\'re subscribed.';

        if (!endpoint) {
          var body = kind === 'callback'
            ? 'Please call me back.\nName: ' + data.get('name') + '\nPhone: ' + data.get('phone') + '\nBest time: ' + (data.get('when') || '-')
            : kind === 'contact'
            ? 'Name: ' + data.get('name') + '\nEmail: ' + data.get('email') + '\nPhone: ' + (data.get('phone') || '-') +
              '\nInterested in: ' + data.get('interest') + '\n\n' + data.get('message')
            : 'Please add ' + data.get('email') + ' to the SWK Properties market updates list.';
          status(form, 'Your email app should open with your message ready to send. Prefer WhatsApp? Message us on ' + CFG.phone + '.', 'ok');
          window.location.href = 'mailto:' + CFG.email + '?subject=' + encodeURIComponent(kind === 'contact' ? 'Website enquiry' : kind === 'callback' ? 'Callback request' : 'Newsletter sign-up') +
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
