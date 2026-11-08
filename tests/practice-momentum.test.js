// tests/practice-momentum.test.js — the small “feel good” layer around a
// finished flashcard run: live correct streak, supportive feedback, and a
// results recap that compares the session with what came before it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'momentum_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'One is A.' },
  { uid: 'momentum_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Two is A.' },
  { uid: 'momentum_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Three is A.' }
];

describe('practice momentum', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('shows a streak, supportive feedback, and a personal-best recap', async () => {
    await p.ev(`
      S.prog = {
        total: 0,
        correct: 0,
        bestRun: 1,
        sessions: [{
          chapter: 'Momentum Chapter', mode: 'flashcard',
          total: 10, correct: 3, pct: 30, at: Date.now() - 3600000
        }]
      };
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'flashcard', 'Momentum Chapter', false, null);
    `);

    await p.ev('QUIZ.fcAnswer(0)');
    await p.ev('QUIZ.fcNav(1)');
    await p.ev('QUIZ.fcAnswer(0)');

    expect(await p.ev(`document.getElementById('fc-run').hidden`)).toBe(false);
    expect(await p.ev(`document.getElementById('fc-run').textContent`)).toContain('2 in a row');
    expect(await p.ev(`document.getElementById('fc-feedback').textContent`)).toContain('Keep the rhythm');
    expect(await p.ev('S.prog.bestRun')).toBe(2);

    /* Quiz navigation is intentionally debounced so a double-tap cannot skip
       a question; wait out that guard before moving again. */
    await new Promise(r => setTimeout(r, 250));
    await p.ev('QUIZ.fcNav(1)');
    await p.ev('QUIZ.fcAnswer(1)');
    expect(await p.ev(`document.getElementById('fc-run').hidden`)).toBe(true);
    expect(await p.ev(`document.getElementById('fc-feedback').textContent`)).toContain('Not quite');

    await p.ev('QUIZ.fcFinish()');
    const recap = await p.ev(`document.getElementById('res-recap').textContent`);
    expect(recap).toContain('New best run: 2');
    expect(recap).toContain('+37% vs last session');
    expect(recap).toContain('New best for this chapter');
    expect(await p.ev(`document.getElementById('res-wrap').style.display`)).not.toBe('none');
    expect(await p.ev('S.prog.sessions[0].pct')).toBe(67);
  });
});
