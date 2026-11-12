// tests/question-fast-load.test.js — a cached set must open without a loader
// or a network call; the loader is only for a genuine cache miss.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('cache-first question opening', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 900 });
  }, 120000);
  afterAll(() => p && p.close());

  it('renders a cached set immediately and still revalidates quietly', async () => {
    const out = await p.ev(`(async () => {
      const raw = [
        { q: 'Cached question one?', options: ['A', 'B'], correct: 0 },
        { q: 'Cached question two?', options: ['A', 'B'], correct: 1 }
      ];
      await QDB.set('fast_cache_key', raw);
      let fetched = false, loader = 0, revalidated = false, started = 0;
      QUIZ._fetch = async () => { fetched = true; throw new Error('network should not be used'); };
      QUIZ._showLoader = () => { loader++; };
      QUIZ._hideLoader = () => {};
      QUIZ._maybeRevalidate = () => { revalidated = true; };
      QUIZ.startWith = (qs) => { started = qs.length; };
      CACHE.prefetchNext = () => {};
      await QUIZ.load('fast_file', 'fast_cache_key', 'practice', 'Fast chapter');
      return { fetched, loader, revalidated, started };
    })()`);
    expect(out).toEqual({ fetched: false, loader: 0, revalidated: true, started: 2 });
  });

  it('shows the loader only when the set is not cached', async () => {
    const out = await p.ev(`(async () => {
      const raw = [{ q: 'Fresh question?', options: ['A', 'B'], correct: 0 }];
      let loader = 0, started = 0;
      QUIZ._fetch = async () => raw;
      QUIZ._showLoader = () => { loader++; };
      QUIZ._hideLoader = () => {};
      QUIZ._maybeRevalidate = () => {};
      QUIZ.startWith = (qs) => { started = qs.length; };
      CACHE.prefetchNext = () => {};
      await QUIZ.load('fresh_file', 'fresh_cache_key', 'practice', 'Fresh chapter');
      return { loader, started };
    })()`);
    expect(out.loader).toBe(1);
    expect(out.started).toBe(1);
  });
});
