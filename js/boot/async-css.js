/* Promotes <link rel=preload as=style> to a stylesheet (replaces the inline onload, which a strict CSP blocks).
   Promoted immediately rather than on the load event: a stylesheet served from cache has already
   fired its load event before this script runs, and a preload link keeps sheet === null, so an
   event listener never fires and the CSS is never applied. That silently dropped every icon in the
   app (the Phosphor glyph stylesheet is loaded this way) on the second and later visits. */
document.querySelectorAll('link[rel="preload"][as="style"]').forEach(function (l) {
  l.rel = 'stylesheet';
});
