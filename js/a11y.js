// HACK THE PLANET — small shared accessibility helpers (classic script).
//
// installModalTrap(getModal): while getModal() returns an open dialog
// element, Tab and Shift+Tab cycle inside it instead of reaching the canvas or
// the HUD behind it. Each level decides what counts as its open modal.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HTPA11y = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SELECTOR = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

  function focusables(rootEl) {
    return [...rootEl.querySelectorAll(SELECTOR)].filter(x => !x.disabled && !x.closest('[hidden]') &&
      (x.offsetParent !== null || x === document.activeElement));
  }

  // Keeps Tab inside rootEl. Returns true if it handled the key.
  function trapTab(e, rootEl) {
    if (e.key !== 'Tab' || !rootEl) return false;
    const f = focusables(rootEl);
    if (!f.length) { e.preventDefault(); return true; }
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); return true; }
    if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); return true; }
    return false;
  }

  function installModalTrap(getModal) {
    const handler = e => { if (e.key === 'Tab') { const m = getModal(); if (m) trapTab(e, m); } };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }

  return { focusables, trapTab, installModalTrap };
});
