/* js/app/02-reports-study-pdfs-grading.js — SHIM. */
(function () {
  if (window.__admin2SplitLoaded) return;
  window.__admin2SplitLoaded = true;
  [
    'js/admin/features/dashboard.js',
    'js/admin/features/weeklysets.js',
    'js/admin/features/studydocs.js',
    'js/admin/features/subjective-store.js',
    'js/admin/features/subjective-grade-card.js',
    'js/admin/features/subjective-qotd.js',
    'js/admin/features/subjective-exam.js'
  ].forEach(f => document.write('<script src="' + f + '"><\/script>'));
})();