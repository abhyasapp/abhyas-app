// tests/sprint-focus.test.js — choosing topics from every level must narrow
// the daily plan, coverage and subject breakdown to those topics.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

describe('60-day focus topics', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]', waitMs: 1000 });
    await p.ev(`
      localStorage.removeItem('abhyas_sprint_focus');
      const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const now = new Date(), exam = new Date(now);
      exam.setDate(now.getDate() + 40);
      localStorage.setItem('abhyas_sprint_start', iso(now));
      localStorage.setItem('abhyas_exam_date', iso(exam));
      localStorage.removeItem('abhyas_sprint_rest');
      localStorage.removeItem('abhyas_sprint_off');
      S.fcount = { 'l7-a': 10, 'l5-a': 20, 'gk-a': 30 };
      S.cov = {}; S.wr = []; S.prog = { total: 0, correct: 0, sessions: [] };
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'l7-a', lv: 'Level7', ch: 'L7 Chapter', book: 'Book A', key: 'k1' },
          { fid: 'l5-a', lv: 'Level5', ch: 'L5 Chapter', book: 'Book B', key: 'k2' },
          { fid: 'gk-a', lv: 'GK', ch: 'GK Chapter', book: 'Book C', key: 'k3' }
        ],
        chapterName: (lv, ch) => ch
      };
      document.getElementById('view-sprint').classList.add('on');
      SPRINT_PAGE.renderPage();
    `);
  }, 120000);
  afterAll(() => p && p.close());

  it('defaults to Level 7 + GK and leaves Level 5 out', () => {
    const plan = p.ev('SPRINT_PAGE.plan()');
    expect(plan.perUnit.map((u) => u.fid).sort()).toEqual(['gk-a', 'l7-a']);
    expect(plan.levelList.map((l) => l.id)).toEqual(['l7', 'gk']);
  });

  it('offers topics from every level in the focus sheet', async () => {
    p.ev('SPRINT_PAGE.openFocus()');
    await tick();
    const labels = p.ev("[...document.querySelectorAll('#mbody .focus-lv-hd strong')].map((n) => n.textContent)");
    expect(labels).toEqual(['Level 7', 'Level 5', 'General Knowledge']);
    expect(p.ev("document.querySelectorAll('#mbody [data-focus-key]').length")).toBe(3);
  });

  it('saves a Level 5-only focus and rebuilds targets and breakdown', async () => {
    p.ev("document.querySelector('#mbody [data-focus-set=\"none\"]').click()");
    p.ev("document.querySelector('#mbody [data-focus-key=\"level5|L5 Chapter\"]').checked = true");
    p.ev("document.querySelector('#mbody #focus-save').click()");
    await tick();
    const plan = p.ev('SPRINT_PAGE.plan()');
    expect(plan.perUnit.map((u) => u.fid)).toEqual(['l5-a']);
    expect(plan.remaining).toBe(20);
    expect(plan.levelList.map((l) => l.id)).toEqual(['level5']);
    expect(p.ev("document.getElementById('sprint-cov-levels').textContent")).toContain('Level 5');
    expect(p.ev("document.getElementById('sprint-cov-levels').textContent")).not.toContain('Level 7');
    expect(p.ev("JSON.parse(localStorage.getItem('abhyas_sprint_focus'))")).toEqual(['level5|L5 Chapter']);
  });
});
