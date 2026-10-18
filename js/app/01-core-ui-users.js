/* js/app/01-core-ui-users.js — SHIM during v1.45 → v1.46 migration.
   The real content now lives in js/admin/*. Delete this file when the shell
   is updated. */
(function () {
  if (window.__admin1SplitLoaded) return;
  window.__admin1SplitLoaded = true;
  [
    'js/admin/core.js',
    'js/admin/features/today.js',
    'js/admin/features/users.js',
    'js/admin/features/admins.js',
    'js/admin/features/palette.js',
    'js/admin/features/expiring.js'
  ].forEach(f => document.write('<script src="' + f + '"><\/script>'));
})();