// The published site is a BUILT copy: one bundle instead of 103 scripts. These tests
// make sure the build is faithful (same scripts, same order, nothing lost) and that the
// precache list still matches what is published.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows .pathname is '/D:/...', which path.resolve
// turns into a nonexistent 'D:\D:\...' and makes every spawn fail with ENOENT.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let OUT;
let html, bundle, sw;

beforeAll(() => {
  OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'abhyas-dist-'));
  // process.execPath, not 'node': the bare name does not resolve under vitest on Windows.
  execFileSync(process.execPath, ['tools/build-dist.mjs', OUT], { cwd: ROOT, stdio: 'pipe' });
  html = fs.readFileSync(path.join(OUT, 'user.html'), 'utf8');
  bundle = fs.readFileSync(path.join(OUT, 'js', 'bundle.js'), 'utf8');
  sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
}, 60000);

describe('dist build', () => {
  const sources = () => [...read('user.html').matchAll(/<script defer src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]);

  it('replaces every deferred page script with one bundle tag', () => {
    expect([...html.matchAll(/<script defer src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1])).toEqual(['js/bundle.js']);
  });

  it('keeps the scripts that must stay separate (boot paint/core, async css, Google sign-in)', () => {
    expect(html).toContain('js/boot/user-boot-paint.js');
    expect(html).toContain('js/boot/user-boot-core.js');
    expect(html).toContain('js/boot/async-css.js');
    expect(html).toContain('accounts.google.com/gsi/client');
  });

  it('contains every source file, in the page\'s own order, each behind a marker comment', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(90);
    let at = -1;
    for (const f of files) {
      const i = bundle.indexOf('/*! ' + f + ' */');
      expect(i, f).toBeGreaterThan(at);
      at = i;
    }
  });

  it('is not wrapped, so top-level declarations stay global exactly as in separate scripts', () => {
    expect(bundle.trimStart().startsWith('/*! js/')).toBe(true);
    expect(bundle).toMatch(/\nconst (QKEY|ABHYAS_CONFIG|APP_VERSION)\b|const APP_VERSION/);
    expect(bundle).not.toMatch(/^\(function\(\)\{[\s\S]{0,40}\/\*! js\//);
  });

  it('does not rename identifiers (inline handlers and other scripts rely on global names)', () => {
    for (const name of ['QUIZ', 'PSYNC', 'WRONGBY', 'QKEY', 'ChapterData']) expect(bundle, name).toContain(name);
    expect(bundle).toContain('window.QKEY');
  });

  it('precaches the bundle and no longer the files inside it', () => {
    const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(shell).toContain('./js/bundle.js');
    for (const f of sources()) expect(shell).not.toContain('./' + f);
  });

  it('every precached file exists in the built site', () => {
    const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const e of shell) {
      const rel = e === './' ? 'index.html' : e.replace(/^\.\//, '');
      expect(fs.existsSync(path.join(OUT, rel)), e).toBe(true);
    }
  });

  it('ships the fonts and icons the pages load at runtime, and none of the dev-only folders', () => {
    expect(fs.existsSync(path.join(OUT, 'tools', 'vendor', 'phosphor'))).toBe(true);
    for (const d of ['tests', 'node_modules', '.git', 'docs', '.github']) expect(fs.existsSync(path.join(OUT, d)), d).toBe(false);
    expect(fs.existsSync(path.join(OUT, 'tools', 'build-dist.mjs'))).toBe(false);
  });

  it('the source tree is left untouched (nothing generated is ever committed)', () => {
    expect(read('user.html')).not.toContain('js/bundle.js');
    expect(fs.existsSync(path.join(ROOT, 'js', 'bundle.js'))).toBe(false);
  });
});
