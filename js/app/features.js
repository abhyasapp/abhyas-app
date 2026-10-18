/* js/app/features.js — SHIM. */
(function () {
  if (window.__featuresSplitLoaded) return;
  window.__featuresSplitLoaded = true;
  var files = [
    'js/features/pwa.js',
    'js/features/weekly.js',
    'js/core/router.js',             // UI
    'js/core/progress.js',            // ← ADD
    'js/features/chapter-stats.js',   // ← ADD
    'js/features/progress.js',
    'js/features/streak.js',
    'js/features/home.js',
    'js/features/home-layout.js',     // ← ADD
    'js/features/sprint.js',          // ← ADD
    'js/features/timetable.js',
    'js/features/cache.js',
    'js/features/data.js',
    'js/features/progress-reset.js',
    'js/features/tutorial.js',
    'js/features/boot.js',
    'js/features/net-toggle.js',
    'js/features/module-sheet.js',
    'js/features/focus.js'
  ];
  files.forEach(function (f) {
    document.write('<script src="' + f + '"><\/script>');
  });
})();