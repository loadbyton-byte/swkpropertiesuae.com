// Mortgage calculator: loan maths, % / AED down-payment toggle, term pills,
// payoff date, donut chart. Behaviour matches the original calculator, with
// input validation (minimum deposit, sane ranges) and clearer totals added.
(function () {
  'use strict';
  var SWK = window.SWK;

  var MIN_DOWN_PCT = 20;           // UAE residents, first property (CBUAE guidance)
  var SERVICE_RATE = 0.007;        // illustrative annual service charge, % of price
  var INSURANCE_RATE = 0.0035;     // illustrative annual loan insurance, % of loan

  function money(v) {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(v);
  }

  function mortgage(price, downPct, ratePct, years) {
    var down = price * (downPct / 100);
    var loan = Math.max(price - down, 0);
    var r = ratePct / 100 / 12;
    var n = years * 12;
    var monthly = loan === 0 ? 0 : (r === 0 ? loan / n : (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    var repaid = monthly * n;
    return { down: down, loan: loan, monthly: monthly, interest: repaid - loan, repaid: repaid };
  }

  function wire(root) {
    var $ = function (s) { return SWK.$(s, root); };
    var price = $('[data-calc-field="price"]');
    var down = $('[data-calc-field="down"]');
    var rate = $('[data-calc-field="rate"]');
    var start = $('[data-calc-field="startDate"]');
    var hint = $('[data-calc-hint]');
    var hintDefault = hint ? hint.textContent : '';
    if (!price || !down || !rate) return;

    var terms = SWK.$$('[data-calc-term]', root);
    var units = SWK.$$('[data-down-unit]', root);
    var years = 25;
    var mode = 'percent';
    var out = {};
    ['monthlyPayment', 'downAmount', 'loanAmount', 'totalInterest', 'totalPayment', 'totalCost', 'piAmount', 'svcAmount', 'insAmount', 'endDate'].forEach(function (k) {
      out[k] = $('[data-calc-output="' + k + '"]');
    });
    var seg = { pi: $('[data-seg="pi"]'), svc: $('[data-seg="svc"]'), ins: $('[data-seg="ins"]') };
    var CIRC = 2 * Math.PI * 48;

    function num(el, fallback) { var v = parseFloat(el.value); return isFinite(v) ? v : fallback; }

    function currentPct(p) {
      var raw = num(down, 0);
      return mode === 'percent' ? raw : (p > 0 ? (raw / p) * 100 : 0);
    }

    function setSeg(circle, frac, offset) {
      if (!circle) return;
      var len = CIRC * Math.max(0, frac);
      circle.style.strokeDasharray = len + ' ' + Math.max(0, CIRC - len);
      circle.style.strokeDashoffset = String(-CIRC * offset);
    }

    function recalc(commit) {
      var p = SWK.clamp(num(price, 0), 0, 500000000);
      var pct = currentPct(p);
      var r = SWK.clamp(num(rate, 0), 0, 25);
      var msg = '';
      if (p < 200000 || num(price, 0) > 50000000) msg = 'Enter a value between AED 200,000 and AED 50,000,000.';
      p = SWK.clamp(p, 200000, 50000000);
      if (pct < MIN_DOWN_PCT) {
        msg = 'Raised to the ' + MIN_DOWN_PCT + '% minimum UAE banks typically require on a first home.';
        pct = MIN_DOWN_PCT;
        if (commit) {
          down.value = mode === 'percent' ? MIN_DOWN_PCT : Math.round(p * MIN_DOWN_PCT / 100);
        }
      }
      if (pct > 100) pct = 100;
      // The hint always occupies the same space (default helper text <-> warning),
      // so showing a warning on blur can never shift the controls under the pointer.
      if (hint) { hint.textContent = msg || hintDefault; hint.classList.toggle('is-warning', !!msg); }

      var m = mortgage(p, pct, r, years);
      var svc = (p * SERVICE_RATE) / 12;
      var ins = (m.loan * INSURANCE_RATE) / 12;
      var total = m.monthly + svc + ins;

      function set(k, v) { if (out[k]) out[k].textContent = v; }
      set('monthlyPayment', money(total));
      set('downAmount', money(m.down));
      set('loanAmount', money(m.loan));
      set('totalInterest', money(m.interest));
      set('totalPayment', money(m.repaid));
      set('totalCost', money(m.repaid + m.down));
      set('piAmount', money(m.monthly));
      set('svcAmount', money(svc));
      set('insAmount', money(ins));

      var pf = total > 0 ? m.monthly / total : 0;
      var sf = total > 0 ? svc / total : 0;
      var inf = total > 0 ? ins / total : 0;
      setSeg(seg.pi, pf, 0);
      setSeg(seg.svc, sf, pf);
      setSeg(seg.ins, inf, pf + sf);

      if (out.endDate) {
        var s = start && start.value ? new Date(start.value + 'T00:00:00') : new Date();
        if (isNaN(s.getTime())) s = new Date();
        var e = new Date(s);
        e.setFullYear(e.getFullYear() + years);
        out.endDate.value = e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }

    [price, down, rate].forEach(function (f) { f.addEventListener('input', function () { recalc(false); }); f.addEventListener('change', function () { recalc(true); }); });
    if (start) start.addEventListener('change', function () { recalc(true); });

    units.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('is-active')) return;
        var p = SWK.clamp(num(price, 0), 200000, 50000000);
        var pct = currentPct(p);
        mode = btn.getAttribute('data-down-unit');
        down.value = mode === 'percent' ? Math.round(pct * 10) / 10 : Math.round(p * (pct / 100));
        down.step = mode === 'percent' ? '1' : '10000';
        units.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        recalc(true);
      });
    });

    terms.forEach(function (btn) {
      btn.addEventListener('click', function () {
        years = Number(btn.getAttribute('data-calc-term'));
        terms.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        recalc(true);
      });
    });

    var again = $('[data-calc-recalc]');
    if (again) again.addEventListener('click', function () { recalc(true); });

    var dBtn = $('[data-calc-disclosure]');
    var dPanel = $('[data-calc-disclosure-panel]');
    if (dBtn && dPanel) {
      dBtn.addEventListener('click', function () {
        var open = dPanel.hidden;
        dPanel.hidden = !open;
        dBtn.setAttribute('aria-expanded', String(open));
        dBtn.classList.toggle('is-open', open);
      });
    }

    if (start && !start.value) {
      var d = new Date();
      start.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    recalc(false);
  }

  SWK.reg('calculator', function () { SWK.$$('[data-calculator]').forEach(wire); });
})();
