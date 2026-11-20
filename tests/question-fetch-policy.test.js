// Question files: online -> always the CURRENT file; offline -> saved copy; slow -> saved copy, refreshed behind.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('question file fetch policy', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`S.online = true; S.forcedOffline = false; QUIZ._inflight = {}; QUIZ.SAVED_AFTER_MS = 3500;
                QUIZ.__calls = 0; QUIZ.__orig = QUIZ.__orig || QUIZ._fetchFromCDN;`);
  });

  it('online: the fetched current file wins over the saved copy', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('k1', [{ q: 'saved' }]);
      QUIZ._fetchFromCDN = async () => { QUIZ.__calls++; return [{ q: 'current' }]; };
      const d = await QUIZ._fetch('f1', 'k1');
      return { q: d[0].q, calls: QUIZ.__calls, stored: (await QDB.get('k1'))[0].q };
    })()`);
    expect(out).toEqual({ q: 'current', calls: 1, stored: 'current' });
  });

  it('offline: the saved copy, and no request is made', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('k2', [{ q: 'saved' }]); S.online = false;
      QUIZ._fetchFromCDN = async () => { QUIZ.__calls++; return [{ q: 'current' }]; };
      const d = await QUIZ._fetch('f2', 'k2');
      return { q: d[0].q, calls: QUIZ.__calls };
    })()`);
    expect(out).toEqual({ q: 'saved', calls: 0 });
  });

  it('online but slow: the saved copy opens, and the request finishes behind it and refreshes the saved copy', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('k3', [{ q: 'saved' }]); QUIZ.SAVED_AFTER_MS = 40;
      QUIZ._fetchFromCDN = () => new Promise(res => setTimeout(() => res([{ q: 'current' }]), 250));
      const d = await QUIZ._fetch('f3', 'k3');
      const first = d[0].q;
      await new Promise(r => setTimeout(r, 400));
      return { first, later: (await QDB.get('k3'))[0].q };
    })()`);
    expect(out).toEqual({ first: 'saved', later: 'current' });
  });

  it('online but the request fails: the saved copy is used', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('k4', [{ q: 'saved' }]);
      QUIZ._fetchFromCDN = async () => { throw new Error('CDN 500'); };
      const d = await QUIZ._fetch('f4', 'k4');
      return d[0].q;
    })()`);
    expect(out).toBe('saved');
  });

  it('two opens at once make one request', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('k5', [{ q: 'saved' }]);
      QUIZ._fetchFromCDN = () => new Promise(res => { QUIZ.__calls++; setTimeout(() => res([{ q: 'current' }]), 60); });
      const [a, b] = await Promise.all([QUIZ._fetch('f5', 'k5'), QUIZ._fetch('f5', 'k5')]);
      return { a: a[0].q, b: b[0].q, calls: QUIZ.__calls };
    })()`);
    expect(out).toEqual({ a: 'current', b: 'current', calls: 1 });
  });

  it('the CDN fetch always asks for the current file (raw GitHub first, conditional)', async () => {
    const src = await p.ev(`QUIZ.__orig.toString()`);
    expect(src).toContain("fresh === false");
    expect(src).toContain("'no-cache'");
    expect(await p.ev(`QUIZ._rawBase()`)).toContain('raw.githubusercontent.com/abhyasapp/content/');
  });
});
