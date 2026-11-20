// tools/build-dist.mjs — build the PUBLISHED site into dist/ (or the folder given as argv[2]).
//
// The repository keeps one <script> per source file, which is what you edit, test and
// review. Published as-is that is 103 requests before the first screen. This script
// produces a copy where those scripts are ONE file (js/bundle.js), plus the service
// worker's precache list rewritten to match. On a throttled "slow 4G" cold load this
// took the learner page from ~5.5 s to ~4.1 s and from 121 requests to 22.
//
// Nothing generated is ever committed: the source tree stays unbundled and the CI
// deploy job (.github/workflows/pages.yml) runs this before publishing, so a forgotten
// rebuild can never ship stale code.
//
// Safety rules the bundle follows:
//   * the files are concatenated in the page's own order, NOT wrapped, so top-level
//     `const` / function declarations stay global exactly as separate classic scripts;
//   * each file is minified on its own with whitespace only (no identifier renaming), so
//     global names other scripts and inline handlers rely on are untouched;
//   * every file is announced by a /*! js/<file> */ marker comment so a stack trace line
//     can be traced back to its source file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { transform } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'tests', 'tools', 'docs', 'dist', 'coverage', '.vscode']);
const SKIP_FILES = /^(package(-lock)?\.json|eslint\.config\.mjs|vitest\.config\.mjs|\.editorconfig|\.gitattributes|\.gitignore|README\.md|SECURITY\.md)$/;

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) copyTree(path.join(src, e.name), path.join(dst, e.name)); continue; }
    if (SKIP_FILES.test(e.name)) continue;
    fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyTree(ROOT, OUT);
// The pages load their fonts and icon font from tools/vendor at runtime, so that one
// folder of `tools/` is part of the site.
copyTree(path.join(ROOT, 'tools', 'vendor'), path.join(OUT, 'tools', 'vendor'));

const SCRIPT_RE = /<script defer src="(js\/[^"]+)"><\/script>/g;
const htmlPath = path.join(OUT, 'user.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const files = [...html.matchAll(SCRIPT_RE)].map((m) => m[1]);
if (!files.length) throw new Error('build-dist: no <script defer src="js/..."> tags found in user.html');

let rawBytes = 0;
const parts = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
  rawBytes += Buffer.byteLength(src);
  let code;
  try {
    code = (await transform(src, { loader: 'js', minifyWhitespace: true, minifySyntax: false, minifyIdentifiers: false, legalComments: 'none' })).code;
  } catch (e) {
    throw new Error('build-dist: ' + f + ' does not parse: ' + (e.errors ? e.errors[0].text : e.message), { cause: e });
  }
  parts.push('/*! ' + f + ' */\n' + code.replace(/\s+$/, '') + '\n;');
}
const bundle = parts.join('\n');
fs.writeFileSync(path.join(OUT, 'js', 'bundle.js'), bundle);

// user.html: one tag where the first script was, the others removed.
let first = true;
html = html.replace(SCRIPT_RE, () => { if (first) { first = false; return '<script defer src="js/bundle.js"></script>'; } return ''; });
html = html.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(htmlPath, html);

// sw.js: precache the bundle instead of the 103 files it contains.
const swPath = path.join(OUT, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
const bundled = new Set(files.map((f) => './' + f));
sw = sw.replace(/const SHELL = \[([\s\S]*?)\];/, (_all, body) => {
  const entries = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((e) => !bundled.has(e));
  entries.push('./js/bundle.js');
  return 'const SHELL = [\n  ' + entries.map((e) => "'" + e + "'").join(',\n  ') + '\n];';
});
fs.writeFileSync(swPath, sw);

const gz = zlib.gzipSync(bundle).length;
console.log('build-dist: ' + files.length + ' scripts -> js/bundle.js');
console.log('  source ' + (rawBytes / 1024).toFixed(0) + ' KB -> ' + (bundle.length / 1024).toFixed(0) + ' KB minified -> ' + (gz / 1024).toFixed(0) + ' KB gzip');
console.log('  output: ' + path.relative(process.cwd(), OUT));
