/* js/app/04-payments.js — SHIM. */
(function () {
  if (window.__admin4SplitLoaded) return;
  window.__admin4SplitLoaded = true;
  [
    'js/admin/features/payments.js',
    'js/admin/router.js'
  ].forEach(f => document.write('<script src="' + f + '"><\/script>'));
})();