/* Promotes <link rel=preload as=style> to a stylesheet once loaded (replaces the inline onload, which a strict CSP blocks). */
document.querySelectorAll('link[rel="preload"][as="style"]').forEach(function (l) {
  var go = function () { l.rel = 'stylesheet'; };
  if (l.sheet) go(); else l.addEventListener('load', go, { once: true });
});
