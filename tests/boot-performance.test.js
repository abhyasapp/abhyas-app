// tests/boot-performance.test.js — the version cache scan must not delay Home.
// Regression guard for a launch path that used to await one IndexedDB read per
// downloaded question set before rendering the first screen.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('boot efficiency', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 300 });
  }, 120000);
  afterAll(() => p && p.close());

  it('reaches Home before a slow version cache scan', async () => {
    const homeMs = await p.ev(`(async () => {
      window.ChapterData = { allFileRefs: () => [], levels: () => [], chapterName: () => '', levelLabel: () => '' };
      QDB.keys = async () => ['slow_cache_entry'];
      QDB.get = async () => { await new Promise(r => setTimeout(r, 500)); return { ok: true }; };
      localStorage.setItem('abhyas_qscan', '0');
      S.user = { username: 'boot_bench', token: 'tok' };
      S.profile = S.profile || { id: 'boot_bench' };
      window.__homeAt = 0;
      UI.go = function(){ if(!window.__homeAt) window.__homeAt = performance.now(); };
      APP._booted = false;
      const started = performance.now();
      await APP.init();
      return Math.round(window.__homeAt - started);
    })()`);
    expect(homeMs).toBeLessThan(200);
  });
});
