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
      S.fcount = { 'l7-a': 10, 'l5-a': 20, 'gk-a': 30, 'l7-old': 99 };
      S.cov = {}; S.wr = []; S.prog = { total: 0, correct: 0, sessions: [] };
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'l7-a', lv: 'Level7', ch: 'L7 Chapter', book: 'Book A', key: 'k1' },
          { fid: 'l7-old', lv: 'Level7', ch: 'Old Chapter', book: '1.12 Original Questions', key: 'k-old' },
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

  it('never schedules the Original Questions duplicate bank', () => {
    const plan = p.ev('SPRINT_PAGE.plan()');
    expect(plan.perUnit.some((u) => u.fid === 'l7-old')).toBe(false);
    expect(plan.schedule.flatMap((d) => d.slices).some((s) => s.fid === 'l7-old')).toBe(false);
  });

  it('offers topics from every level in the focus sheet', async () => {
    p.ev('SPRINT_PAGE.openFocus()');
    await tick();
    const labels = p.ev("[...document.querySelectorAll('#mbody .focus-lv-hd strong')].map((n) => n.textContent)");
    expect(labels).toEqual(['Level 7', 'Level 5', 'General Knowledge']);
    expect(p.ev("document.querySelectorAll('#mbody [data-focus-key]').length")).toBe(3);
    expect(p.ev("document.getElementById('mbody').textContent")).not.toContain('Old Chapter');
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

  it('shows progress and filters topics by search', async () => {
    p.ev(`
      localStorage.removeItem('abhyas_sprint_focus');
      S.cov = { 'l7-a': { p: '1100000000' } };
      SPRINT_PAGE.renderPage();
      SPRINT_PAGE.openFocus();
    `);
    await tick();
    expect(p.ev("document.querySelector('[data-focus-key=\"level7|L7 Chapter\"]').closest('.focus-row').textContent")).toContain('2/10');
    p.ev("document.querySelector('#mbody [data-focus-lv=\"level5\"]').click()");
    expect(p.ev("document.querySelector('[data-focus-key=\"level5|L5 Chapter\"]').checked")).toBe(true);
    expect(p.ev("document.getElementById('focus-count').textContent")).toContain('Q');
    p.ev("const s = document.getElementById('focus-search'); s.value = 'L5'; s.dispatchEvent(new Event('input'));");
    expect(p.ev("document.querySelectorAll('#mbody .focus-row:not([hidden])').length")).toBe(1);
    expect(p.ev("document.querySelector('#mbody .focus-lv').hidden")).toBe(true);
  });

  it('offers a one-tap start-all and pace expectations for the day', async () => {
    p.ev("document.getElementById('mbg').click();");
    await tick(60);
    p.ev("localStorage.removeItem('abhyas_sprint_focus'); S.fcount = { 'l7-a': 100, 'l5-a': 20, 'gk-a': 300, 'l7-old': 99 }; S.cov = {}; SPRINT_PAGE.renderPage();");
    await tick(60);
    expect(p.ev("document.getElementById('sprint-start-all').hidden")).toBe(false);
    expect(p.ev("document.getElementById('sprint-targets-hint').textContent")).toContain('left today');
    expect(p.ev("document.getElementById('sprint-pace-stats').textContent")).toContain('Expected');
    expect(p.ev("document.getElementById('sprint-pace-stats').textContent")).toContain('Actual');
  });
});
