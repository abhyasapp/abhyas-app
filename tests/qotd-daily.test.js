// Question of the day: the objective question comes from the question bank, technical levels
// skip the "Original Questions" last subtopic, GK may use it, and the answer is given in place.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const REFS = [
  { lv: 'level7', ch: '4', book: '4.1 CONCRETE', subtopic: 'part 1', fid: 'L7P1', key: 'level7_4_4.1 CONCRETE_part 1' },
  { lv: 'level7', ch: '4', book: '4.12 Original Questions', subtopic: 'DPARSAD.1-100', fid: 'L7OR', key: 'level7_4_4.12 Original Questions_DPARSAD.1-100' },
  { lv: 'gk', ch: '1', book: '1.1 GEO&DEMO', subtopic: 'All', fid: 'GKGEO', key: 'gk_1_1.1 GEO&DEMO_All' },
  { lv: 'gk', ch: '1', book: '1.12 Original Questions', subtopic: 'constitution', fid: 'GKO', key: 'gk_1_1.12 Original Questions_constitution' }
];

const STUB_QUESTIONS = [
  { q: 'The loss of head due to friction in a pipe is …', options: ['1/Rn', '64/Rn'], correct: 1, explanation: 'Because the friction factor is 64/Re.' },
  { q: 'Which pile carries its load by friction?', options: ['End bearing', 'Friction pile'], correct: 1, explanation: 'Because the friction factor is 64/Re.' }
];

describe('wiring', () => {
  const html = read('user.html');
  it('the Question of the day screen has a slot for the bank question, above the written one', () => {
    expect(html).toContain('id="qotd-daily-slot"');
    expect(html).toContain('js/features/qotd-daily.js');
    expect(html.indexOf('id="qotd-daily-slot"')).toBeLessThan(html.indexOf('id="subj-qotd-body"'));
  });
  it('the service worker caches it with the rest of the shell', () => {
    expect(read('sw.js')).toContain("./js/features/qotd-daily.js");
  });
});

describe('the day\'s question from the question bank', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`(() => {
      window.ChapterData = {
        levels: () => ['level7', 'gk'],
        levelLabel: (lv) => (lv === 'gk' ? 'General Knowledge (shared)' : 'Level 7 — Engineering'),
        chapters: (lv) => (lv === 'gk' ? { '1': 'General Awareness' } : { '4': 'Building Construction Technology' }),
        chapterName: (lv) => (lv === 'gk' ? 'General Awareness' : 'Building Construction Technology'),
        books: () => ({}), files: () => ({}), fileCount: () => 0, chapterFileRefs: () => [],
        allFileRefs: () => ${JSON.stringify(REFS)}
      };
      S.online = true; S.forcedOffline = false;
      S.wr = []; S.prog.sessions = []; S.prog.total = 0; S.prog.correct = 0;   // a clean slate per test
      localStorage.removeItem('abhyas_qotd_daily_v1');
      document.getElementById('qotd-daily-slot').innerHTML = '';
      window.__asked = [];
      window.__origFetch = window.__origFetch || QUIZ._fetchFromCDN;
      QUIZ._fetchFromCDN = async (fid) => { window.__asked.push(fid); return ${JSON.stringify(STUB_QUESTIONS)}; };
      return 0;
    })()`);
  });

  it('a technical level never uses its Original Questions bucket, and GK may', async () => {
    const out = await p.ev(`QOTD_DAILY.eligible(${JSON.stringify(REFS)}).map(r => r.key)`);
    expect(out).toContain('level7_4_4.1 CONCRETE_part 1');
    expect(out).not.toContain('level7_4_4.12 Original Questions_DPARSAD.1-100');
    expect(out).toContain('gk_1_1.1 GEO&DEMO_All');
    expect(out).toContain('gk_1_1.12 Original Questions_constitution');
  });

  it('offline with nothing saved it says so instead of showing a question', async () => {
    const out = await p.ev(`(async () => {
      S.online = false; S.forcedOffline = true;
      const got = await QOTD_DAILY.pick();
      await QOTD_DAILY.render();
      const txt = document.getElementById('qotd-daily-slot').textContent;
      S.online = true; S.forcedOffline = false;
      return { q: got && got.q, offline: !!(got && got.offline), txt };
    })()`);
    expect(out.q).toBe(null);
    expect(out.offline).toBe(true);
    expect(out.txt).toContain('not saved on this device');
  });

  it('picks one eligible file for today, reads one question from it, and stores nothing', async () => {
    const out = await p.ev(`(async () => {
      const before = JSON.stringify([(await QDB.keys()).sort(), S.cov || {}, localStorage.getItem('abhyas_qts')]);
      const got = await QOTD_DAILY.pick();
      const after = JSON.stringify([(await QDB.keys()).sort(), S.cov || {}, localStorage.getItem('abhyas_qts')]);
      return { date: got.date, key: got.ref.key, fid: got.ref.fid, asked: window.__asked.slice(),
               q: got.q && got.q.q, opts: (got.q && got.q.options || []).length, same: before === after };
    })()`);
    expect(out.date).toBe(await p.ev('QOTD_DAILY.dateKey()'));
    expect(['level7_4_4.1 CONCRETE_part 1', 'gk_1_1.1 GEO&DEMO_All', 'gk_1_1.12 Original Questions_constitution']).toContain(out.key);
    expect(out.asked).toEqual([out.fid]);          // one file, the eligible one, and no other
    expect(out.opts).toBe(2);
    expect(out.q).toBeTruthy();
    expect(out.same).toBe(true);                    // nothing downloaded, saved or re-timestamped
  });

  it('shows the question with tappable options and does not give the answer away', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      const card = document.getElementById('qotd-daily-card');
      const txt = card ? card.textContent : '';
      const btns = card ? [...card.querySelectorAll('button[data-on-click^="QOTD_DAILY.answer("]')] : [];
      return { txt, n: btns.length, enabled: btns.every(b => !b.disabled),
               marks: (txt.match(/[✓✗]/g) || []).length,
               why: txt.includes('Because the friction factor'),
               cards: document.querySelectorAll('#qotd-daily-slot .card').length };
    })()`);
    expect(out.cards).toBe(1);
    expect(out.n).toBe(2);
    expect(out.enabled).toBe(true);
    expect(out.txt).toContain('Question of the day');
    expect(out.marks).toBe(0);                      // no ✓ or ✗ before answering
    expect(out.why).toBe(false);                    // and no explanation either
  });

  it('one tap answers it in place: the right option and the wrong one are marked, the reason shows, the day ends', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      const correct = QOTD_DAILY.current().q.correct;
      const wrong = correct === 0 ? 1 : 0;
      document.querySelector('[data-on-click="QOTD_DAILY.answer(' + wrong + ')"]').click();
      await new Promise(r => setTimeout(r, 50));
      const card = document.getElementById('qotd-daily-card');
      const txt = card.textContent;
      const btns = [...card.querySelectorAll('button[data-on-click^="QOTD_DAILY.answer("]')];
      const saved = JSON.parse(localStorage.getItem('abhyas_qotd_daily_v1') || 'null');
      const before = localStorage.getItem('abhyas_qotd_daily_v1');
      document.querySelector('[data-on-click="QOTD_DAILY.answer(' + correct + ')"]').click();
      await new Promise(r => setTimeout(r, 50));
      return { wrong, saved, locked: btns.every(b => b.disabled),
               streak: QOTD_DAILY.streak(), done: QOTD_DAILY.doneToday(),
               unchanged: localStorage.getItem('abhyas_qotd_daily_v1') === before,
               marks: (txt.match(/[✓✗]/g) || []).length, why: txt.includes('Because the friction factor') };
    })()`);
    expect(out.saved.chosen).toBe(out.wrong);
    expect(out.saved.ok).toBe(false);
    expect(out.locked).toBe(true);                  // no second guess
    expect(out.marks).toBe(2);                      // ✓ on the right option, ✗ on the wrong one
    expect(out.why).toBe(true);
    expect(out.streak).toBe(1);
    expect(out.done).toBe(true);
    expect(out.unchanged).toBe(true);               // tapping again after answering stores nothing new
  });

  it('a right answer is recorded as right, and only that one small record is stored', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      const correct = QOTD_DAILY.current().q.correct;
      document.querySelector('[data-on-click="QOTD_DAILY.answer(' + correct + ')"]').click();
      await new Promise(r => setTimeout(r, 50));
      const saved = JSON.parse(localStorage.getItem('abhyas_qotd_daily_v1') || 'null');
      const txt = document.getElementById('qotd-daily-card').textContent;
      return { ok: saved && saved.ok, chosen: saved && saved.chosen, count: saved && saved.count,
               keys: Object.keys(saved || {}).sort(), text: txt.includes('Correct') };
    })()`);
    expect(out.ok).toBe(true);
    expect(out.chosen).toBe(1);
    expect(out.count).toBe(1);
    expect(out.keys).toEqual(['chosen', 'count', 'date', 'ok', 'picked', 'user']);
    expect(out.text).toBe(true);
  });

  it('a different question for the same day is not treated as already answered', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      document.querySelector('[data-on-click="QOTD_DAILY.answer(1)"]').click();
      await new Promise(r => setTimeout(r, 50));
      const answered = QOTD_DAILY.doneToday();
      const picked = JSON.parse(localStorage.getItem('abhyas_qotd_daily_v1')).picked;
      const cur = QOTD_DAILY.current();
      const sameQ = { ...cur.q };
      cur.q = { ...cur.q, qid: 'moved-on', uid: 'moved-on' };   // the bank changed under us
      const afterMove = QOTD_DAILY.doneToday();
      const stored = JSON.parse(localStorage.getItem('abhyas_qotd_daily_v1'));
      cur.q = sameQ;
      return { answered, picked, afterMove, stillStored: !!stored.picked };
    })()`);
    expect(out.answered).toBe(true);
    expect(out.picked).toContain('#');
    expect(out.afterMove).toBe(false);
    expect(out.stillStored).toBe(true);
  });

  it('a wrong answer joins the miss list and the practice history, like any other answer', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      const q = QOTD_DAILY.current().q, ref = QOTD_DAILY.current().ref;
      const before = { wr: S.wr.length, total: S.prog.total || 0, sessions: (S.prog.sessions || []).length };
      const wrong = q.correct === 0 ? 1 : 0;
      document.querySelector('[data-on-click="QOTD_DAILY.answer(' + wrong + ')"]').click();
      await new Promise(r => setTimeout(r, 80));
      const miss = S.wr.find(x => x && x.uid === q.uid);
      const sess = S.prog.sessions[0];
      return { fid: ref.fid, uid: q.uid,
               dWr: S.wr.length - before.wr, dTotal: (S.prog.total || 0) - before.total,
               dSessions: (S.prog.sessions || []).length - before.sessions,
               miss: !!miss, dueNow: !!(miss && (miss._nextDue || 0) <= Date.now() + 1000),
               sess: sess && { total: sess.total, correct: sess.correct, wrong: sess.wrong, fid: sess.fid },
               row: sess && sess.qres && sess.qres[0] };
    })()`);
    expect(out.miss).toBe(true);                    // in the miss list
    expect(out.dueNow).toBe(true);                  // and due, not waiting for a later date
    expect(out.dWr).toBe(1);
    expect(out.dTotal).toBe(1);                     // counts in the totals
    expect(out.dSessions).toBe(1);                  // and in the practice history
    expect(out.sess).toMatchObject({ total: 1, correct: 0, wrong: 1 });
    expect(out.sess.fid).toBe(out.fid);
    expect(out.row).toMatchObject({ uid: out.uid, ok: false });
  });

  it('a right answer counts in the history and does not add to the miss list', async () => {
    const out = await p.ev(`(async () => {
      await QOTD_DAILY.render();
      const q = QOTD_DAILY.current().q;
      const before = { wr: S.wr.length, total: S.prog.total || 0, correct: S.prog.correct || 0 };
      document.querySelector('[data-on-click="QOTD_DAILY.answer(' + q.correct + ')"]').click();
      await new Promise(r => setTimeout(r, 80));
      const sess = S.prog.sessions[0];
      return { dWr: S.wr.length - before.wr, dTotal: (S.prog.total || 0) - before.total,
               dCorrect: (S.prog.correct || 0) - before.correct,
               sess: sess && { total: sess.total, correct: sess.correct, wrong: sess.wrong },
               row: sess && sess.qres && sess.qres[0] };
    })()`);
    expect(out.dWr).toBe(0);
    expect(out.dTotal).toBe(1);
    expect(out.dCorrect).toBe(1);
    expect(out.sess).toMatchObject({ total: 1, correct: 1, wrong: 0 });
    expect(out.row.ok).toBe(true);
  });
});
