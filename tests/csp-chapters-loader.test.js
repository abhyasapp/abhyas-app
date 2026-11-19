// tests/csp-chapters-loader.test.js - the chapters loader runs the CDN source from a
// blob: URL, so no page needs 'unsafe-inline' or 'unsafe-eval' in script-src.
//
// History: v2.52 dropped 'unsafe-inline' while the loader still injected an inline
// <script>; every boot then died with "did not define ChapterData". The loader now
// uses a blob: script, so the strict policy and the loader agree. This test is the
// coupling in BOTH directions: strict CSP needs the blob loader, and the blob
// loader needs blob: allowed and the mirror hosts reachable by fetch.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const PAGES = ['user.html', 'admin.html', 'index.html'];
const read = (file) => fs.readFileSync(new URL(file, ROOT), 'utf8');

function cspOf(file) {
  const tag = /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+>/i.exec(read(file));
  const content = tag && /content="([^"]*)"/i.exec(tag[0]);
  return content ? content[1] : '';
}
function directive(csp, name) {
  const part = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' '));
  return part ? part.slice(name.length).trim() : '';
}

describe('CSP matches what the chapters loader needs', () => {
  const loader = read('js/data/chapters-loader.js');

  it('the loader executes the CDN source from a blob: URL', () => {
    expect(loader).toMatch(/createObjectURL/);
    expect(loader).toMatch(/s\.src\s*=\s*url/);
  });

  for (const page of PAGES) {
    const csp = cspOf(page);
    it(page + ': declares a CSP', () => { expect(csp).not.toBe(''); });
    it(page + ': script-src is strict (no unsafe-inline / unsafe-eval) and allows blob:', () => {
      const src = directive(csp, 'script-src');
      expect(src).not.toMatch(/'unsafe-inline'/);
      expect(src).not.toMatch(/'unsafe-eval'/);
      expect(src).toMatch(/\bblob:/);
    });
    it(page + ': connect-src reaches every content mirror', () => {
      const c = directive(csp, 'connect-src');
      for (const host of ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'raw.githubusercontent.com']) {
        expect(c, host).toContain(host);
      }
    });
  }
});
