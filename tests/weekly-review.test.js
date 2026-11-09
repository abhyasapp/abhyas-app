// tests/weekly-review.test.js — a weekly attempt should be reviewable as a whole
// paper or as just the answers that cost marks, without changing the official score.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'w_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'One is A.' },
  { uid: 'w_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Two is A.' },
  { uid: 'w_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Three is A.' },
  { uid: 'w_4', q: 'Question four', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Four is A.' }
];

describe('weekly attempt review', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('offers a focused review of only the missed answers', async () => {
    await p.ev(`
      S.user = { username: 'weekly_review_test' };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.quiz = null;
      WEEKLY.sets = [{ id: 'w1', title: 'Weekly 1', released: true, fileId: 'f_w1' }];
      WEEKLY.attempts = {
        w1: {
          weeklyId: 'w1', answers: [0, 1, null, 0], total: 4, correct: 2,
          skipped: 1, pct: 50, at: Date.now()
        }
      };
      WEEKLY._savePaper('w1', ${JSON.stringify(QUESTIONS)}, [0, 1, null, 0]);
      WEEKLY._showRetakeModal(WEEKLY.sets[0], WEEKLY.attempts.w1);
    `);

    expect(p.w.document.getElementById('bd-sheet').textContent).toContain('Review 2 missed answers');
    expect(p.w.document.getElementById('bd-sheet').textContent).toContain('Practice 2 missed');

    await p.ev(`MODAL.close('sheet'); WEEKLY.reviewMissedById('w1');`);
    expect(await p.ev('S.quiz.qs.length')).toBe(2);
    expect(await p.ev(`S.quiz.qs.map(q => q.uid).join(',')`)).toBe('w_2,w_3');
    expect(await p.ev(`JSON.stringify(S.quiz.ans)`)).toBe('[1,null]');
    expect(await p.ev('S.quiz.reviewOnly')).toBe(true);
    expect(await p.ev('S.quiz.scope.weeklyReviewMissed')).toBe(true);
    expect(await p.ev('S.quiz.ch')).toContain('Missed');

    await p.ev(`WEEKLY.practiceMissedById('w1')`);
    expect(await p.ev('S.quiz.qs.length')).toBe(2);
    expect(await p.ev(`S.quiz.qs.map(q => q.uid).join(',')`)).toBe('w_2,w_3');
    expect(await p.ev(`JSON.stringify(S.quiz.ans)`)).toBe('[null,null]');
    expect(await p.ev('S.quiz.reviewOnly')).toBe(false);
    expect(await p.ev('S.quiz.scope.weeklyId === undefined')).toBe(true);
    expect(await p.ev('S.quiz.scope.weeklyPracticeMissed')).toBe(true);
    expect(await p.ev('S.quiz.ch')).toContain('Practice missed');

    await p.ev(`S.quiz = { scope: { weeklyId: 'w1' } }; QUIZ.practiceWeeklyMissed()`);
    expect(await p.ev('S.quiz.qs.length')).toBe(2);
    expect(await p.ev('S.quiz.ch')).toContain('Practice missed');
    expect(p.w.document.getElementById('res-missed')).not.toBeNull();
  });
});
