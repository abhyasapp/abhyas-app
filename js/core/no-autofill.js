// js/core/no-autofill.js — browsers must never autofill or autocorrect the
// fields a student or admin types into (search boxes, notes, report details,
// question text, filters, etc.).
//
// Sign-in and sign-up fields are left alone on purpose: a password manager
// filling a password is the one autofill that helps. Mark any other field that
// should keep autofill with data-allow-autofill.
(function () {
  'use strict';

  const KEEP = 'input[type="password"], [data-allow-autofill], ' +
    '#form-login input, #form-signup input, #gate-form input, ' +
    '#pwd-current, #pwd-new, #pwd-confirm, #del-pw';
  const FIELDS = 'input, textarea, select';
  const SKIP_TYPES = /^(checkbox|radio|button|submit|reset|range|file|color|hidden|image)$/i;

  function harden(el) {
    if (!el || el.nodeType !== 1 || el.__noAF) return;
    el.__noAF = true;
    try {
      if (el.matches(KEEP)) return;
      if (el.tagName === 'INPUT' && SKIP_TYPES.test(el.type || '')) return;
      el.setAttribute('autocomplete', 'off');
      if (el.tagName !== 'SELECT') {
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', el.getAttribute('autocapitalize') || 'off');
        el.setAttribute('data-lpignore', 'true');   // LastPass
        el.setAttribute('data-1p-ignore', '');      // 1Password
        el.setAttribute('data-form-type', 'other'); // Dashlane
      }
    } catch (e) { window.warnCaught && window.warnCaught('js/core/no-autofill.js', e); }
  }

  function sweep(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(FIELDS)) harden(root);
    const list = root.querySelectorAll ? root.querySelectorAll(FIELDS) : [];
    for (let i = 0; i < list.length; i++) harden(list[i]);
  }

  function start() {
    sweep(document.body);
    /* Modals, sheets and lists build their fields later, so watch for them. */
    new MutationObserver(muts => {
      for (let i = 0; i < muts.length; i++) {
        const added = muts[i].addedNodes;
        for (let j = 0; j < added.length; j++) sweep(added[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
    /* Forms that are not credentials: stop the browser offering saved entries. */
    document.querySelectorAll('form').forEach(f => {
      if (!f.matches('#form-login, #form-signup, #gate-form, [data-allow-autofill]')) f.setAttribute('autocomplete', 'off');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
