// Settings → Data tools: download every set, refresh the questions, and clean up only
// what is provably useless. These exercise the real page scripts in jsdom.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('data tools', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('clean up drops broken cached sets, keeps every real download, and clears the freshness stamps', async () => {
    const out = await p.ev(`(async () => {
      await QDB.clear();
      await QDB.set('L7-1', [{ q: 'valid question', options: ['a','b'], correct: 0 }]);
      await QDB.set('L7-2', { success: false, error: 'network' });
      /* A key the chapter data does not know: still a download, so it must survive.
         Cache keys and chapter-data keys are different strings. */
      await QDB.set('level7_9_Book_Topic', [{ q: 'unknown key but real content', options: ['a','b'], correct: 0 }]);
      localStorage.setItem('abhyas_qts', JSON.stringify({ 'L7-1': Date.now(), 'GK-1': Date.now() }));
      const res = await DATA.cleanupCache();
      const left = (await QDB.keys()).sort();
      const stamps = localStorage.getItem('abhyas_qts');
      return { res, left: left, stamps: stamps };
    })()`);
    expect(out.left).toEqual(['L7-1', 'level7_9_Book_Topic']);
    expect(out.res.stale).toBe(1);      // the entry the server returned as an error
    expect(out.res.stamps).toBe(2);
    expect(out.stamps).toBe(null);
  });

  it('refuses to refresh questions while a quiz is running', async () => {
    const out = await p.ev(`(async () => {
      const prev = S.quiz;
      S.quiz = { active: true };
      S.online = true; S.forcedOffline = false;
      const ok = await DATA.refreshQuestions();
      S.quiz = prev;
      return ok;
    })()`);
    expect(out).toBe(false);
  });

  it('refuses to refresh questions with no connection', async () => {
    const out = await p.ev(`(async () => {
      const prev = { online: S.online, forced: S.forcedOffline };
      S.online = false; S.forcedOffline = false;
      const ok = await DATA.refreshQuestions();
      S.online = prev.online; S.forcedOffline = prev.forced;
      return ok;
    })()`);
    expect(out).toBe(false);
  });

  it('the storage card offers backup, download-all, refresh and clean up', async () => {
    const html = await p.ev(`(async () => {
      await SETTINGS.renderStorage();
      return document.getElementById('storage-card-body').innerHTML;
    })()`);
    expect(html).toContain('data-on-click="DATA.exportAll()"');
    expect(html).toContain('data-on-click="SETTINGS.downloadAll()"');
    expect(html).toContain('data-on-click="SETTINGS.refreshQuestions()"');
    expect(html).toContain('data-on-click="SETTINGS.cleanup()"');
    expect(html).toContain('data-on-click="SETTINGS.removeDownloads()"');
  });
});
