// tests/practice-calibration.test.js — confidence should change the coaching,
// not just decorate the screen. These tests cover the feedback copy, the
// compact session record, and the targeted follow-up drill.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const QUESTIONS = [
  { uid: 'cal_1', q: 'Question one', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'One is A.' },
  { uid: 'cal_2', q: 'Question two', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Two is A.' },
  { uid: 'cal_3', q: 'Question three', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'Three is A.' }
];

describe('confidence calibration', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('turns confidence signals into coaching and a targeted drill', async () => {
    await p.ev(`
      S.user = { username: 'calibration_test' };
      S.prog = { total: 0, correct: 0, sessions: [], bestRun: 0 };
      S.quiz = null;
      QUIZ._doStart(${JSON.stringify(QUESTIONS)}, 'flashcard', 'Calibration Chapter', false, {fid:'f_cal'});
      S.quiz.ans = [0, 1, 0];
      S.quiz.conf = {0:'sure', 1:'sure', 2:'guess'};
      S.quiz.idx = 1;
      QUIZ.setConf('sure');
    `);
    expect(await p.ev(`document.getElementById('fc-feedback').textContent`)).toContain('misconception');

    await p.ev(`S.quiz.idx = 2; QUIZ.setConf('guess');`);
    expect(await p.ev(`document.getElementById('fc-feedback').textContent`)).toContain('guessed');

    await p.ev(`S.quiz.startedAt = Date.now() - 60000; QUIZ.fcFinish();`);
    const panel = p.w.document.getElementById('res-calibration');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain('1 confident miss');
    expect(panel.textContent).toContain('1 lucky guess');

    const calibration = JSON.parse(await p.ev(`JSON.stringify(S.prog.sessions[0].calibration)`));
    expect(calibration).toMatchObject({
      tagged: 3, sure: 2, sureCorrect: 1, guessed: 1, guessedCorrect: 1, confidentMisses: 1
    });

    await p.ev(`
      S.prog.sessions.push(
        { total:10, correct:7, pct:70, mode:'exam', at:Date.now()-7200000,
          calibration:{ tagged:4, sure:3, sureCorrect:3, guessed:1, guessedCorrect:0, confidentMisses:0 } },
        { total:10, correct:6, pct:60, mode:'flashcard', at:Date.now()-10800000,
          calibration:{ tagged:3, sure:2, sureCorrect:2, guessed:1, guessedCorrect:0, confidentMisses:0 } }
      );
      PROG.renderPredict();
    `);
    expect(await p.ev('PROG.calibration().sure')).toBe(7);
    expect(p.w.document.getElementById('predict-card-2').textContent).toContain('sure answers right');

    await p.ev(`document.querySelector('#res-calibration [data-on-click="QUIZ.reviewConfidentMisses()"]').click()`);
    expect(await p.ev('S.quiz.qs.length')).toBe(1);
    expect(await p.ev('S.quiz.qs[0].uid')).toBe('cal_2');
    expect(await p.ev('S.quiz.ch')).toContain('Confident misses');
    expect(await p.ev('S.quiz.active')).toBe(true);
  });
});
