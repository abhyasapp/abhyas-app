// tests/practice-resume.test.js — continuity for flashcard practice. The
// existing resume card should restore the run, confidence, elapsed time and
// skipped history, and leaving should never promise a resume it cannot keep.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'resume_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'One is A.' },
  { uid: 'resume_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Two is A.' },
  { uid: 'resume_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Three is A.' }
];

const startQuiz = `QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'flashcard', 'Resume Chapter', false, {fid:'f_resume'});`;

describe('practice continuity', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  beforeEach(async () => {
    await p.ev(`
      localStorage.removeItem('abhyas_practice_snap');
      S.user = { username: 'resume_test' };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 3 };
      S.quiz = null;
      ${startQuiz}
    `);
  });
  afterAll(() => p && p.close());

  it('restores the streak, confidence, timer and visited questions', async () => {
    await p.ev('QUIZ.fcAnswer(0)');
    await new Promise(r => setTimeout(r, 250));
    await p.ev('QUIZ.fcNav(1)');
    await p.ev('QUIZ.fcAnswer(0)');
    await p.ev(`S.quiz.elapsed = 95; S.quiz.conf = {0:'sure'}; S.quiz.bestRunBefore = 3;`);
    await p.ev('PRACTICE_RESUME.snapshot(true)');

    const snap = JSON.parse(await p.ev(`localStorage.getItem('abhyas_practice_snap')`));
    expect(snap).toMatchObject({ run: 2, bestRunBefore: 3, elapsed: 95, conf: { 0: 'sure' } });
    expect(snap.shown).toContain(0);

    await p.ev('S.quiz = null; PRACTICE_RESUME.render();');
    const card = p.w.document.getElementById('practice-resume-slot');
    expect(card.textContent).toContain('Q2 of 3');
    expect(card.textContent).toContain('2 in a row');
    expect(card.textContent).toContain('Continue');

    await p.ev('PRACTICE_RESUME.start()');
    expect(await p.ev('S.quiz.idx')).toBe(1);
    expect(await p.ev('S.quiz.run')).toBe(2);
    expect(await p.ev('S.quiz.bestRunBefore')).toBe(3);
    expect(await p.ev('S.quiz.elapsed')).toBe(95);
    expect(await p.ev(`S.quiz.conf['0']`)).toBe('sure');
    expect(await p.ev('S.quiz.shown.has(0)')).toBe(true);
    expect(await p.ev(`document.getElementById('fc-run').textContent`)).toContain('2 in a row');
    expect(await p.ev(`document.getElementById('fc-tmr').textContent`)).toBe('01:35');
  });

  it('offers a real leave-and-resume choice instead of claiming to discard progress', async () => {
    await p.ev('QUIZ.fcAnswer(0)');
    await p.ev('QUIZ._exitGuard(function(){})');
    expect(await p.ev(`document.getElementById('qem-leave') !== null`)).toBe(true);
    expect(await p.ev(`document.getElementById('qem-leave').textContent`)).toContain('resume later');

    await p.ev(`document.getElementById('qem-leave').click()`);
    expect(await p.ev('S.quiz.active')).toBe(false);
    expect(await p.ev(`document.getElementById('quiz-wrap').style.display`)).toBe('none');
    expect(await p.ev(`PRACTICE_RESUME.valid() !== null`)).toBe(true);
    expect(p.w.document.getElementById('practice-resume-slot').textContent).toContain('Unfinished practice');
  });

  it('moves to the next question with Enter after answering', async () => {
    await p.ev('QUIZ.fcAnswer(0)');
    await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}))`);
    expect(await p.ev('S.quiz.idx')).toBe(1);
  });

  it('restarts the same set from the results screen', async () => {
    await p.ev(`S.quiz.ans = [0, 1, 0]; S.quiz.active = false;`);
    await p.ev('QUIZ.practiceAgain()');
    expect(await p.ev('S.quiz.active')).toBe(true);
    expect(await p.ev('S.quiz.qs.length')).toBe(3);
    expect(await p.ev(`S.quiz.ans.every(a => a === null)`)).toBe(true);
    expect(await p.ev('S.quiz.ch')).toBe('Resume Chapter');
  });
});
