// tests/practice-review.test.js — make a finished set easier to repair:
// filter the review cards by outcome, and jump straight to skipped questions.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'review_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'One is A.' },
  { uid: 'review_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Two is A.' },
  { uid: 'review_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Three is A.' },
  { uid: 'review_4', q: 'Question four', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Four is A.' }
];

describe('results review controls', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('jumps to skipped questions and filters the finished review', async () => {
    await p.ev(`
      S.user = { username: 'review_test' };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 1 };
      S.quiz = null;
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'flashcard', 'Review Chapter', false, {fid:'f_review'});
      S.quiz.ans = [0, 1, null, 0];
      S.quiz.conf = {0:'sure', 1:'sure', 3:'guess'};
      S.quiz.idx = 0;
      QUIZ._renderFlashcard();
    `);

    expect(await p.ev(`document.getElementById('fc-unanswered').hidden`)).toBe(false);
    expect(await p.ev(`document.getElementById('fc-unanswered-n').textContent`)).toBe('1');
    await p.ev('QUIZ.fcNextUnanswered()');
    expect(await p.ev('S.quiz.idx')).toBe(2);
    expect(await p.ev(`document.getElementById('fc-unanswered').hidden`)).toBe(true);

    await p.ev(`S.quiz.startedAt = Date.now() - 60000; QUIZ.fcFinish();`);
    await new Promise(r => setTimeout(r, 120));

    expect(p.w.document.getElementById('res-skipped').hidden).toBe(false);
    expect(p.w.document.getElementById('res-skipped').textContent).toContain('Practice skipped (1)');
    expect(p.w.document.getElementById('res-recap').textContent).toContain('s per question');

    const filters = p.w.document.getElementById('res-filters');
    expect(filters.hidden).toBe(false);
    expect(filters.textContent).toContain('All 4');
    expect(filters.textContent).toContain('Wrong 1');
    expect(filters.textContent).toContain('Skipped 1');
    expect(filters.textContent).toContain('Confident misses 1');

    /* The wrong-first reorder runs after the cards are painted. */
    expect(p.w.document.querySelector('#res-review .qcard').dataset.qi).toBe('1');

    await p.ev(`QUIZ.filterReview('wrong')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(1);
    expect(p.w.document.querySelector('#res-review .qcard:not([hidden])').dataset.state).toBe('wrong');
    expect(await p.ev(`document.querySelector('#res-filters [data-review-filter="wrong"]').getAttribute('aria-pressed')`)).toBe('true');

    await p.ev(`QUIZ.filterReview('skipped')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(1);
    expect(p.w.document.querySelector('#res-review .qcard:not([hidden])').dataset.qi).toBe('2');

    await p.ev(`QUIZ.filterReview('confident')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(1);

    await p.ev(`QUIZ.filterReview('all')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(4);

    await p.ev(`document.getElementById('res-skipped').click()`);
    expect(await p.ev('S.quiz.qs.length')).toBe(1);
    expect(await p.ev('S.quiz.qs[0].uid')).toBe('review_3');
    expect(await p.ev('S.quiz.ch')).toContain('(Skipped)');
  });

  it('filters marked questions and practices only those', async () => {
    await p.ev(`
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.quiz = null;
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'flashcard', 'Marked Chapter', false, {fid:'f_mark'});
      S.quiz.ans = [0, 1, null, 0];
      S.quiz.marked = new Set([1, 2]);
      S.quiz.startedAt = Date.now() - 60000;
      QUIZ.fcFinish();
    `);
    await new Promise(r => setTimeout(r, 120));

    expect(p.w.document.getElementById('res-marked').hidden).toBe(false);
    expect(p.w.document.getElementById('res-marked').textContent).toContain('Practice marked (2)');
    expect(p.w.document.getElementById('res-filters').textContent).toContain('Marked 2');

    await p.ev(`window.__resScrolls = 0; Element.prototype.scrollIntoView = function(){ window.__resScrolls++; }; HTMLElement.prototype.scrollIntoView = function(){ window.__resScrolls++; }; QUIZ.filterReview('marked')`);
    await new Promise(r => setTimeout(r, 120));
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(2);
    expect(await p.ev('window.__resScrolls')).toBeGreaterThan(0);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard:not([hidden])')].every(c => c.dataset.marked === '1')`)).toBe(true);

    await p.ev(`document.getElementById('res-marked').click()`);
    expect(await p.ev('S.quiz.qs.length')).toBe(2);
    expect(await p.ev(`S.quiz.qs.map(q => q.uid).sort().join(',')`)).toBe('review_2,review_3');
    expect(await p.ev('S.quiz.ch')).toContain('(Marked)');
  });

  it('reviews a mixed paper chapter by chapter', async () => {
    await p.ev(`
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'survey', lv: 'level7', ch: 'survey' },
          { fid: 'struct', lv: 'level7', ch: 'struct' }
        ],
        chapterName: (lv, ch) => ch === 'survey' ? 'Surveying' : 'Structures'
      };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.quiz = null;
      QUIZ._doStart([
        { uid: 'survey_1', q: 'Survey one', options: ['A', 'B', 'C', 'D'], correct: 0 },
        { uid: 'survey_2', q: 'Survey two', options: ['A', 'B', 'C', 'D'], correct: 0 },
        { uid: 'struct_1', q: 'Structure one', options: ['A', 'B', 'C', 'D'], correct: 0 },
        { uid: 'struct_2', q: 'Structure two', options: ['A', 'B', 'C', 'D'], correct: 0 }
      ], 'flashcard', 'Mixed paper', false, { fid: 'mixed' });
      S.quiz.ans = [0, 1, null, 0];
      S.quiz.startedAt = Date.now() - 60000;
      QUIZ.fcFinish();
    `);
    await new Promise(r => setTimeout(r, 140));

    expect(p.w.document.getElementById('res-chapter-row').hidden).toBe(false);
    const options = p.w.document.getElementById('res-chapter-filter').options;
    expect([...options].map(o => o.textContent)).toEqual([
      'All chapters (4)', 'Surveying (2)', 'Structures (2)'
    ]);
    expect(p.w.document.querySelector('#res-review .qcard[data-chapter="level7:survey"]').textContent).toContain('Surveying');

    await p.ev(`QUIZ.filterReviewChapter('level7:survey')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(2);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard:not([hidden])')].every(c => c.dataset.chapter === 'level7:survey')`)).toBe(true);
    expect(p.w.document.getElementById('res-chapter-note').textContent).toBe('2 of 4 in Surveying');

    await p.ev(`QUIZ.filterReview('wrong')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(1);
    expect(p.w.document.querySelector('#res-review .qcard:not([hidden])').dataset.qi).toBe('1');

    await p.ev(`QUIZ.filterReviewChapter('level7:struct')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(0);
    expect(p.w.document.getElementById('res-filter-empty').hidden).toBe(false);
    expect(p.w.document.getElementById('res-filter-empty').textContent).toBe('No wrong answers in Structures.');

    await p.ev(`QUIZ.filterReviewChapter('')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(1);
    await p.ev(`QUIZ.filterReview('all')`);
    expect(await p.ev(`[...document.querySelectorAll('#res-review .qcard')].filter(c => !c.hidden).length`)).toBe(4);
  });
});
