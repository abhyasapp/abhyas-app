/* js/app/subjective.js — SHIM. */
(function () {
  if (window.__subjectiveSplitLoaded) return;
  window.__subjectiveSplitLoaded = true;
  var files = [
    'js/core/subjective-api.js',
    'js/features/subj-bank.js',
    'js/features/subj-pdf.js',
    'js/features/subj-queue.js',
    'js/features/subj-builder.js',
    'js/features/subj-qotd.js',
    'js/features/subj-exam.js',
    'js/features/subj-list.js',
    'js/features/subj-public.js'
    // REMOVED: 'js/admin/subj-smart.js' — 4 KB wasted on every student session
  ];
  files.forEach(function (f) {
    document.write('<script src="' + f + '"><\/script>');
  });
})();