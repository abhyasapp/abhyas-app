// tests/exam-palette.test.js — a long timed paper is easier to finish when the
// question grid can answer "what is blank?" and "what did I flag?" directly.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'palette_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0 },
  { uid: 'palette_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0 },
  { uid: 'palette_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0 },
  { uid: 'palette_4', q: 'Question four', options: ['A', 'B', 'C', 'D'], correct: 0 }
];

describe('exam question grid filters', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('counts and filters all, blank, answered and marked questions', async () => {
    await p.ev(`
      S.user = { username: 'palette_test' };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.quiz = null;
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'exam', 'Palette Chapter', false, {});
      S.quiz.ans = [0, null, 2, null];
      S.quiz.marked = new Set([2]);
      QUIZ.showPalette();
    `);

    const counts = await p.ev(`[...document.querySelectorAll('#mbody [data-pal-filter]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim())`);
    expect(counts).toEqual(['All 4', 'Unanswered 2', 'Marked 1', 'Answered 2']);

    await p.ev(`QUIZ.palFilter('unanswered')`);
    expect(await p.ev(`[...document.querySelectorAll('#pal-grid button')].map(b => b.dataset.qi)`)).toEqual(['1', '3']);
    expect(await p.ev(`document.querySelector('#mbody [data-pal-filter="unanswered"]').getAttribute('aria-pressed')`)).toBe('true');

    await p.ev(`QUIZ.palFilter('marked')`);
    expect(await p.ev(`[...document.querySelectorAll('#pal-grid button')].map(b => b.dataset.qi)`)).toEqual(['2']);

    await p.ev(`QUIZ.palFilter('answered')`);
    expect(await p.ev(`[...document.querySelectorAll('#pal-grid button')].map(b => b.dataset.qi)`)).toEqual(['0', '2']);

    await p.ev(`QUIZ.palFilter('all')`);
    expect(await p.ev(`document.querySelectorAll('#pal-grid button').length`)).toBe(4);

    await p.ev(`S.quiz.marked = new Set(); QUIZ.palFilter('marked')`);
    expect(await p.ev(`document.querySelectorAll('#pal-grid button').length`)).toBe(0);
    expect(await p.ev(`document.querySelector('#mbody .empty').textContent`)).toContain('No marked questions yet');

    await p.ev(`
      if (typeof closeMod === 'function') closeMod();
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'exam', 'Fresh Chapter', false, {});
    `);
    expect(await p.ev('QUIZ._palFilter')).toBe('all');
  });
});
