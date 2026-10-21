(function () {
  "use strict";

  // ---- mobile navigation
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // ---- property filters (all cards are in the HTML; JS only hides/shows them)
  var filters = document.getElementById("filters");
  var results = document.getElementById("results");
  if (filters && results) {
    var cards = Array.prototype.slice.call(results.querySelectorAll(".card"));
    var countEl = document.getElementById("count-n");
    var emptyEl = document.getElementById("empty");
    var map = { community: "community", type: "type", budget: "band", status: "status" };

    var apply = function () {
      var vals = {};
      Object.keys(map).forEach(function (k) { vals[k] = filters.elements[k].value; });
      var shown = 0;
      cards.forEach(function (c) {
        var ok = Object.keys(map).every(function (k) {
          return !vals[k] || c.dataset[map[k]] === vals[k];
        });
        c.hidden = !ok;
        if (ok) shown++;
      });
      countEl.textContent = shown;
      emptyEl.hidden = shown !== 0;
      var qs = new URLSearchParams();
      Object.keys(vals).forEach(function (k) { if (vals[k]) qs.set(k, vals[k]); });
      history.replaceState(null, "", qs.toString() ? "?" + qs : location.pathname);
    };

    var params = new URLSearchParams(location.search);
    Object.keys(map).forEach(function (k) {
      var v = params.get(k);
      var sel = filters.elements[k];
      if (v && Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) sel.value = v;
    });
    filters.addEventListener("change", apply);
    filters.addEventListener("reset", function () { setTimeout(apply, 0); });
    apply();
  }

  // ---- mortgage calculator
  var calc = document.getElementById("calc");
  if (calc) {
    var $ = function (id) { return document.getElementById(id); };
    var aed = function (n) { return "AED " + Math.round(n).toLocaleString("en-US"); };
    var minDown = { resident: 20, "non-resident": 50 };

    var run = function (commit) {
      var buyer = $("c-buyer").value;
      var price = Math.min(Math.max(parseFloat($("c-price").value) || 0, 200000), 50000000);
      var min = minDown[buyer];
      var downPct = parseFloat($("c-down").value);
      var note = "";
      $("c-down").min = min;
      $("c-down-hint").textContent = "Minimum " + min + "% for " +
        (buyer === "resident" ? "UAE residents on a first property." : "non-residents.");
      if (isNaN(downPct) || downPct < min) {
        if (commit === true) {
          if (!isNaN(downPct)) note = "Down payment raised to the " + min + "% minimum for this buyer status.";
          $("c-down").value = min;
        }
        downPct = min; // calculate with the minimum, but don't rewrite the field while the user is typing
      }
      downPct = Math.min(downPct, 100);
      var years = parseInt($("c-term").value, 10);
      var rate = Math.max(parseFloat($("c-rate").value) || 0, 0);
      var down = price * downPct / 100;
      var loan = price - down;
      var n = years * 12;
      var r = rate / 100 / 12;
      var monthly = loan === 0 ? 0 : (r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n)));
      var repay = monthly * n;
      var end = new Date();
      end.setMonth(end.getMonth() + n);

      $("o-monthly").textContent = aed(monthly);
      $("o-down").textContent = aed(down);
      $("o-loan").textContent = aed(loan);
      $("o-interest").textContent = aed(repay - loan);
      $("o-repay").textContent = aed(repay);
      $("o-total").textContent = aed(repay + down);
      $("o-end").textContent = end.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      $("o-dld").textContent = aed(price * 0.04);
      $("o-admin").textContent = aed(price >= 500000 ? 4000 : 2000);
      $("o-agency").textContent = aed(price * 0.02);
      $("o-reg").textContent = aed(loan * 0.0025);
      $("o-note").textContent = note;
    };
    calc.addEventListener("input", function () { run(false); });
    calc.addEventListener("change", function () { run(true); });
    calc.addEventListener("submit", function (ev) { ev.preventDefault(); run(true); });
    run(false);
  }

  // ---- forms (contact + newsletter)
  var contactCfg = { phone: "971564330448", email: "info@swkpropertiesuae.com" };

  var status = function (form, msg, error) {
    var el = form.querySelector(".form-status");
    el.textContent = msg;
    el.classList.toggle("is-error", !!error);
    el.hidden = false;
  };

  Array.prototype.forEach.call(document.querySelectorAll("form[data-form]"), function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (form.elements.website && form.elements.website.value) return; // honeypot
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var kind = form.dataset.form;
      var data = new FormData(form);
      var endpoint = form.dataset.endpoint;
      var summary = kind === "contact"
        ? "Name: " + data.get("name") + "\nEmail: " + data.get("email") + "\nPhone: " + (data.get("phone") || "-") +
          "\nInterested in: " + data.get("interest") + "\n\n" + data.get("message")
        : "Please add " + data.get("email") + " to the SWK Properties market updates list.";
      var subject = kind === "contact" ? "Website enquiry" : "Newsletter sign-up";

      var fallback = function () {
        var url = "mailto:" + contactCfg.email + "?subject=" + encodeURIComponent(subject) +
          "&body=" + encodeURIComponent(summary);
        status(form, "Your email app should open with your message ready to send. Prefer WhatsApp? Message us on +971 56 433 0448.", false);
        window.location.href = url;
      };

      if (!endpoint) { fallback(); return; }
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("bad status");
          form.reset();
          status(form, kind === "contact"
            ? "Thank you — your message has been sent. A consultant will be in touch within one business day."
            : "Thank you — you're subscribed.", false);
        })
        .catch(function () {
          status(form, "Sorry, we couldn't send that. Please email " + contactCfg.email + " or message us on WhatsApp.", true);
        })
        .then(function () { btn.disabled = false; });
    });
  });

  // ---- prefill contact form from ?property=
  var cf = document.getElementById("contact-form");
  if (cf) {
    var prop = new URLSearchParams(location.search).get("property");
    if (prop) {
      var nameGuess = prop.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      cf.elements.message.value = "Hello, I'd like more details on " + nameGuess + ".";
      cf.elements.interest.value = "Buying a property";
    }
  }
})();
