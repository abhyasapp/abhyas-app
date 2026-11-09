// tests/sprint-refresh.test.js — finishing a chapter through the normal
// coverage recorder must re-spread the sprint's today and future days.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('sprint plan follows chapter completion', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('drops a completed chapter and refreshes after new coverage', async () => {
    await p.ev(`
      const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const now = new Date();
      const exam = new Date(now); exam.setDate(now.getDate() + 30);
      localStorage.setItem('abhyas_sprint_start', iso(now));
      localStorage.setItem('abhyas_exam_date', iso(exam));
      localStorage.removeItem('abhyas_sprint_rest');
      localStorage.removeItem('abhyas_sprint_off');
      S.fcount = { f_done: 3, f_open: 3 };
      S.cov = { f_done: { p: '111' } };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.wr = [];
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'f_done', lv: 'Level7', ch: 'Done', book: 'Book A', key: 'k1' },
          { fid: 'f_open', lv: 'GK', ch: 'Open', book: 'Book B', key: 'k2' }
        ],
        chapterName: (lv, ch) => ch
      };
      document.getElementById('view-sprint').classList.add('on');
      SPRINT_PAGE.renderPage();
    `);

    const before = JSON.parse(await p.ev('JSON.stringify(SPRINT_PAGE.plan())'));
    expect(before.remaining).toBe(3);
    expect(before.schedule.flatMap((d) => d.slices).some((s) => s.fid === 'f_done')).toBe(false);
    expect(before.schedule.flatMap((d) => d.slices).some((s) => s.fid === 'f_open')).toBe(true);
    expect(await p.ev(`document.getElementById('sprint-cov-pct').textContent`)).toContain('50');

    await p.ev(`COV.record([
      { uid: 'f_open_0', ok: true },
      { uid: 'f_open_1', ok: true },
      { uid: 'f_open_2', ok: true }
    ])`);
    await new Promise((r) => setTimeout(r, 400));

    const after = JSON.parse(await p.ev('JSON.stringify(SPRINT_PAGE.plan())'));
    expect(after.remaining).toBe(0);
    expect(after.status).toBe('complete');
    expect(await p.ev(`document.getElementById('sprint-cov-pct').textContent`)).toContain('100');
  });
});
