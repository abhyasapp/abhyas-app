/* js/app/objective.js — SHIM during v1.45 → v1.46 migration.
   The real content now lives in js/core/scope.js and js/features/*.js.
   When the shell is updated to load those directly, delete this file. */
(function () {
  if (window.__objectiveSplitLoaded) return;
  window.__objectiveSplitLoaded = true;
  var files = [
    'js/core/scope.js',              // must run before scope consumers
    'js/features/count.js',
    'js/features/review.js',         // REV — before wrong-bank-ui patches it
    'js/features/quiz-engine.js',    // QUIZ — before every view module below
    'js/features/online-study.js',   // ONPROG + ON
    'js/features/local-file.js',     // LOC
    'js/features/mixed-practice.js'  // PSY
  ];
  files.forEach(function (f) {
    document.write('<script src="' + f + '"><\/script>');
  });
})();