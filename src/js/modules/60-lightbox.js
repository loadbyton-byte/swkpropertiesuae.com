// Shared accessible lightbox (dialog, focus trap, keyboard + swipe).
(function () {
  'use strict';
  var SWK = window.SWK;

  var ICON = {
    close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
  };

  var root, imgEl, counterEl, list = [], index = 0, opener = null, label = 'Photo viewer';

  function build() {
    root = document.createElement('div');
    root.className = 'lightbox';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label);
    root.hidden = true;
    root.innerHTML =
      '<div class="lightbox__frame">' +
      '<button type="button" class="lightbox__close" aria-label="Close viewer">' + ICON.close + '</button>' +
      '<button type="button" class="lightbox__prev" aria-label="Previous photo">' + ICON.prev + '</button>' +
      '<img alt="">' +
      '<button type="button" class="lightbox__next" aria-label="Next photo">' + ICON.next + '</button>' +
      '<p class="lightbox__counter" aria-live="polite"></p>' +
      '</div>';
    document.body.appendChild(root);
    imgEl = SWK.$('img', root);
    counterEl = SWK.$('.lightbox__counter', root);

    SWK.$('.lightbox__close', root).addEventListener('click', close);
    SWK.$('.lightbox__prev', root).addEventListener('click', function () { show(index - 1); });
    SWK.$('.lightbox__next', root).addEventListener('click', function () { show(index + 1); });
    root.addEventListener('click', function (ev) { if (ev.target === root) close(); });

    var x0 = null;
    var frame = SWK.$('.lightbox__frame', root);
    frame.addEventListener('pointerdown', function (ev) { x0 = ev.clientX; });
    frame.addEventListener('pointerup', function (ev) {
      if (x0 === null) return;
      var dx = ev.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    });
  }

  function show(i) {
    if (!list.length) return;
    index = (i + list.length) % list.length;
    imgEl.src = list[index].src;
    imgEl.alt = list[index].alt || '';
    counterEl.textContent = (index + 1) + ' / ' + list.length;
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowLeft') show(index - 1);
    else if (ev.key === 'ArrowRight') show(index + 1);
    else if (ev.key === 'Tab') {
      var f = SWK.$$('button', root);
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }

  function open(items, i, title, trigger) {
    if (!root) build();
    list = items;
    label = title || 'Photo viewer';
    root.setAttribute('aria-label', label);
    opener = trigger || document.activeElement;
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    show(i);
    document.addEventListener('keydown', onKey);
    var closeBtn = SWK.$('.lightbox__close', root);
    closeBtn.focus();
    if (document.activeElement !== closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
  }

  function close() {
    if (!root) return;
    root.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    setTimeout(function () { root.hidden = true; }, 300);
    if (opener && opener.focus) opener.focus();
  }

  SWK.lightbox = { open: open, close: close };

  // Property detail galleries: buttons with data-lightbox-index.
  SWK.reg('lightbox', function () {
    var gal = SWK.$('[data-gallery]');
    if (!gal) return;
    var btns = SWK.$$('[data-lightbox-index]', gal);
    var items = btns.map(function (b) {
      var img = SWK.$('img', b);
      return { src: b.getAttribute('data-full') || img.src, alt: img.alt };
    });
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { SWK.lightbox.open(items, i, gal.getAttribute('aria-label'), b); });
    });
  });
})();
