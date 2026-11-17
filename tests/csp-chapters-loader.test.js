// tests/csp-chapters-loader.test.js — the chapters loader runs the CDN source by
// writing it into an inline <script>, so the page CSP must allow inline script.
//
// v2.52 tightened script-src and dropped 'unsafe-inline'. The browser then
// refused to execute the chapters source, window.ChapterData was never defined,
// and every cold AND warm boot showed "Chapters data loaded but did not define
// ChapterData. Contact support." This test is that coupling, in both directions:
// if the loader keeps using an inline script the CSP must keep 'unsafe-inline',
// and if somebody replaces the loader the CSP may be tightened again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const PAGES = ['user.html', 'admin.html', 'index.html'];

const read = (file) => fs.readFileSync(new URL(file, ROOT), 'utf8');

function cspOf(file) {
  const html = read(file);
  const tag = /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+>/i.exec(html);
  if (!tag) return '';
  const content = /content="([^"]*)"/i.exec(tag[0]);
  return content ? content[1] : '';
}

function directive(csp, name) {
  const part = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' '));
  return part ? part.slice(name.length).trim() : '';
}

describe('CSP matches what the chapters loader needs', () => {
  const loader = read('js/data/chapters-loader.js');
  const usesInlineScript = /\.textContent\s*=\s*source/.test(loader);

  it('the loader executes the CDN source as an inline script', () => {
    expect(usesInlineScript).toBe(true);
  });

  it('every page declares a CSP', () => {
    for (const page of PAGES) expect(cspOf(page), page).not.toBe('');
  });

  for (const page of PAGES) {
    it(`${page}: script-src allows inline script while the loader needs it`, () => {
      const scriptSrc = directive(cspOf(page), 'script-src');
      expect(scriptSrc).toContain("'self'");
      if (usesInlineScript) expect(scriptSrc).toContain("'unsafe-inline'");
    });

    it(`${page}: script-src does not need 'unsafe-eval'`, () => {
      expect(directive(cspOf(page), 'script-src')).not.toContain("'unsafe-eval'");
    });

    it(`${page}: connect-src lets the loader reach the content CDN`, () => {
      expect(directive(cspOf(page), 'connect-src')).toContain('cdn.jsdelivr.net');
    });
  }
});
