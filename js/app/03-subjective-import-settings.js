/* js/app/03-subjective-import-settings.js — SHIM. */
(function () {
  if (window.__admin3SplitLoaded) return;
  window.__admin3SplitLoaded = true;
  [
    'js/admin/subj-smart.js',                    // ← ADD — SUBJADMIN.parse() needs SUBJ_SMART
    'js/admin/features/subjective-hourly.js',
    'js/admin/features/subjective-pdf.js',
    'js/admin/features/subjective-import.js',
    'js/admin/features/data.js',
    'js/admin/features/settings.js',
    'js/admin/features/logs.js'
  ].forEach(f => document.write('<script src="' + f + '"><\/script>'));
})();