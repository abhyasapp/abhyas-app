// tests/question-fast-load.test.js — how a question set opens.
//   OFFLINE: straight from the saved copy, no network call, no loader.
//   ONLINE : the CURRENT file is fetched first (QUIZ._fetch); the saved copy is never
//            used instead of it. The loader only appears if the check is slow.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('opening a question set', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 900 });
  }, 120000);
  afterAll(() => p && p.close());

  const stubs = `QUIZ._showLoader = () => { loader++; }; QUIZ._hideLoader = () => {};
                 QUIZ.startWith = (qs) => { started = qs.map(q => q.q); }; CACHE.prefetchNext = () => {};`;

  it('offline: renders the saved set immediately, with no network call and no loader', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('fast_cache_key', [{ q: 'Saved question one?', options: ['A', 'B'], correct: 0 }, { q: 'Saved question two?', options: ['A', 'B'], correct: 1 }]);
      let fetched = false, loader = 0, started = [];
      S.online = false; S.forcedOffline = false;
      QUIZ._fetch = async () => { fetched = true; throw new Error('network must not be used offline'); };
      ${stubs}
      await QUIZ.load('fast_file', 'fast_cache_key', 'practice', 'Fast chapter');
      S.online = true;
      return { fetched, loader, started };
    })()`);
    expect(out).toEqual({ fetched: false, loader: 0, started: ['Saved question one?', 'Saved question two?'] });
  });

  it('online: the current file is used even though a saved copy exists', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('cur_key', [{ q: 'Saved (old) question?', options: ['A', 'B'], correct: 0 }]);
      let fetched = 0, loader = 0, started = [];
      S.online = true; S.forcedOffline = false;
      QUIZ._fetch = async () => { fetched++; return [{ q: 'Corrected question?', options: ['A', 'B'], correct: 0 }]; };
      ${stubs}
      await QUIZ.load('cur_file', 'cur_key', 'practice', 'Current chapter');
      return { fetched, loader, started };
    })()`);
    expect(out).toEqual({ fetched: 1, loader: 0, started: ['Corrected question?'] });   // a quick check never flashes the loader
  });

  it('online and the check is slow: the loader appears, and the current file is still what opens', async () => {
    const out = await p.ev(`(async () => {
      let loader = 0, started = [];
      S.online = true; S.forcedOffline = false;
      QUIZ._fetch = () => new Promise(res => setTimeout(() => res([{ q: 'Slow but current?', options: ['A', 'B'], correct: 0 }]), 450));
      ${stubs}
      await QUIZ.load('slow_file', 'slow_key', 'practice', 'Slow chapter');
      return { loader, started };
    })()`);
    expect(out.loader).toBeGreaterThanOrEqual(1);
    expect(out.started).toEqual(['Slow but current?']);
  });

  it('offline with nothing saved: says so instead of waiting', async () => {
    const out = await p.ev(`(async () => {
      let shown = '';
      S.online = false; S.forcedOffline = false;
      QUIZ._showError = (m) => { shown = m; };
      await QUIZ.load('none_file', 'none_key', 'practice', 'None');
      S.online = true;
      return shown;
    })()`);
    expect(out).toContain('offline');
  });
});
