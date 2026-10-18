/* js/app/user-page.js — SHIM. */
(function () {
  if (window.__userPageSplitLoaded) return;
  window.__userPageSplitLoaded = true;
  var files = [
    'js/features/session.js',
    'js/features/quiz-extras.js',
    'js/features/quiz-wrappers.js',
    'js/features/quiz-search.js',

    'js/core/insights.js',            // ← ADD
    'js/features/pdf-viewer.js',      // ← ADD
    'js/features/print-q.js',         // ← ADD

    'js/features/chapter-nav.js',
    'js/features/study-docs.js',
    'js/features/insights.js',
    'js/features/today-plan.js',
    'js/features/submissions.js',
    'js/features/hourly.js',
    'js/features/syllabus.js',
    'js/features/wrong-bank-ui.js',
    'js/features/home-ui.js',
    'js/features/shell-ui.js',
    'js/features/shell-hooks.js'
  ];
  files.forEach(function (f) {
    document.write('<script src="' + f + '"><\/script>');
  });
})();