// tests/sprint-catchup.test.js — a behind-schedule day can be repaired in one
// mixed-chapter session instead of starting each chapter row separately.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('sprint catch-up session', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('builds one session across today’s chapters when the plan is behind', async () => {
    await p.ev(`
      const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const now = new Date();
      const start = new Date(now); start.setDate(now.getDate() - 20);
      const exam = new Date(now); exam.setDate(now.getDate() + 30);
      localStorage.setItem('abhyas_sprint_start', iso(start));
      localStorage.setItem('abhyas_exam_date', iso(exam));
      localStorage.removeItem('abhyas_sprint_rest');
      localStorage.removeItem('abhyas_sprint_off');
      S.fcount = { f_l7a: 20, f_l7b: 20, f_gk: 20 };
      S.cov = {};
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.wr = [];
      S.quiz = null;
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'f_l7a', lv: 'Level7', ch: 'L7-A', book: 'Book A', key: 'k1' },
          { fid: 'f_l7b', lv: 'Level7', ch: 'L7-B', book: 'Book B', key: 'k2' },
          { fid: 'f_gk', lv: 'GK', ch: 'GK-A', book: 'Book C', key: 'k3' }
        ],
        chapterName: (lv, ch) => ch
      };
      QUIZ._fetch = async (fid) => Array.from({ length: 10 }, (_, i) => ({
        uid: fid + '_' + i, q: 'Question ' + i, options: ['A', 'B', 'C', 'D'], correct: 0, explanation: ''
      }));
      SPRINT_PAGE.renderPage();
    `);

    const plan = JSON.parse(await p.ev('JSON.stringify(SPRINT_PAGE.plan())'));
    expect(plan.status).toBe('behind');
    expect(plan.todaySlices.length).toBeGreaterThan(1);
    expect(plan.todayRemaining).toBeGreaterThan(1);

    const row = p.w.document.querySelector('[data-sprint="catchup"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Catch up');

    await p.ev(`document.querySelector('[data-sprint="catchup"]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    expect(await p.ev('S.quiz.qs.length')).toBe(plan.todayRemaining);
    expect(await p.ev('S.quiz.ch')).toBe('Sprint catch-up');
    expect(await p.ev(`S.quiz.scope.sprint`)).toBe('new');
    expect(await p.ev(`new Set(S.quiz.qs.map(q => q.uid.replace(/_\\d+$/, ''))).size`)).toBe(plan.todaySlices.length);
  });
});
