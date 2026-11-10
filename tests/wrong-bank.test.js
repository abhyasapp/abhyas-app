// tests/wrong-bank.test.js — a missed question leaves the wrong bank after
// five correct answers, and each chapter can export its missed questions as a
// printable offline file. No network.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const SEED = `
  localStorage.removeItem(REV.MASTERED_KEY);
  S.wr = [{ uid: 'f_soil_0', fileId: 'f_soil', q: 'Which soil holds water?', options: ['Clay', 'Sand'], correct: 0, _streak: 0, _nextDue: Date.now() + 86400000 }];
  S.prog = { total: 0, correct: 0, sessions: [] };
  WRONGBY._missCache = null;
`;

describe('wrong-bank mastery and chapter downloads', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  beforeEach(async () => { await p.ev(SEED); });
  afterAll(() => p && p.close());

  it('masters a missed question after five correct answers, even before its due date', async () => {
    for (let i = 0; i < 4; i++) await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, true)`);
    expect(await p.ev('S.wr.length')).toBe(1);
    expect(await p.ev('S.wr[0]._streak')).toBe(4);

    await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, true)`);
    expect(await p.ev('S.wr.length')).toBe(0);
    expect(await p.ev(`REV._masteredLoad().some(x => x.uid === 'f_soil_0')`)).toBe(true);
  });

  it('uses confidence to price the next interval and classify a miss', async () => {
    expect(await p.ev(`REV.intervalFor(4, 'sure')`)).toBe(14);
    expect(await p.ev(`REV.intervalFor(4, 'unsure')`)).toBe(3);
    expect(await p.ev(`REV.intervalFor(4, 'guess')`)).toBe(1);

    await p.ev(`
      S.wr = [{ uid: 'f_soil_0', q: 'Which soil holds water?', options: ['Clay', 'Sand'], correct: 0, _streak: 0, _nextDue: Date.now() }];
      S.prog = { total: 0, correct: 0, sessions: [] };
      REV.trackAnswer({ uid: 'f_soil_0' }, true, { conf: 'guess' });
    `);
    expect(await p.ev('S.wr[0]._streak')).toBe(0);
    expect(await p.ev('S.wr[0]._nextDue - Date.now()')).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(await p.ev('S.wr[0]._nextDue - Date.now()')).toBeLessThan(25 * 60 * 60 * 1000);

    await p.ev(`REV.trackAnswer({ uid: 'f_survey_0' }, false, { conf: 'sure' })`);
    expect(await p.ev(`S.wr.find(x => x.uid === 'f_survey_0')._reason`)).toBe('careless');

    await p.ev(`REV.trackAnswer({ uid: 'f_survey_1' }, false, { conf: 'guess' })`);
    expect(await p.ev(`S.wr.find(x => x.uid === 'f_survey_1')._reason`)).toBe('concept');
  });

  it('takes back the streak point when a flashcard answer was a guess', async () => {
    await p.ev(`
      S.wr = [{ uid: 'f_soil_0', q: 'Which soil holds water?', options: ['Clay', 'Sand'], correct: 0, _streak: 2, _nextDue: Date.now() }];
      S.prog = { total: 0, correct: 0, sessions: [] };
      REV.trackAnswer({ uid: 'f_soil_0' }, true);
    `);
    expect(await p.ev('S.wr[0]._streak')).toBe(3);

    await p.ev(`REV.applyConfidence('f_soil_0', 'guess', { correct: true })`);
    expect(await p.ev('S.wr[0]._streak')).toBe(2);
    expect(await p.ev('S.wr[0]._nextDue - Date.now()')).toBeGreaterThan(23 * 60 * 60 * 1000);

    await p.ev(`REV.applyConfidence('f_soil_0', 'sure', { correct: true })`);
    expect(await p.ev('S.wr[0]._streak')).toBe(3);
    expect(await p.ev('S.wr[0]._nextDue - Date.now()')).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it('offers a focused smart start when more than ten questions are due', async () => {
    const out = await p.ev(`(() => {
      S.wr = Array.from({ length: 11 }, (_, i) => ({
        uid: 'f_soil_' + i, q: 'Q' + i, _nextDue: Date.now() - i * 86400000, _streak: 0
      }));
      S.prog = { total: 0, correct: 0, sessions: [] };
      WRONGBY._last = [{ name: 'Soil Mechanics', due: 11, n: 11, files: [] }];
      const el = document.getElementById('wr-list');
      WRONGBY._renderDue(el);
      const btn = el.querySelector('[data-on-click="WRONGBY.smartStart()"]');
      return { has: !!btn, text: btn ? btn.textContent : '' };
    })()`);
    expect(out.has).toBe(true);
    expect(out.text).toContain('Smart review 10 first');
  });

  it('sends a long home review queue to smart review', async () => {
    const item = await p.ev(`(() => {
      S.wr = Array.from({ length: 11 }, (_, i) => ({
        uid: 'f_soil_' + i, q: 'Q' + i, _nextDue: Date.now() - i * 86400000, _streak: 0
      }));
      const due = _dueItems().find(x => x.go.indexOf('WRONGBY.smartStart') !== -1);
      return due ? { go: due.go, meta: due.meta, sub: due.sub } : null;
    })()`);
    expect(item).toEqual({ go: 'WRONGBY.smartStart()', meta: 'Review 10', sub: 'Smart review picks the most urgent 10' });
  });

  it('builds the miss index in one pass across the whole session history', async () => {
    const out = await p.ev(`(() => {
      const sessions = [
        { qres: [{ uid: 'f_a_0', ok: false }, { uid: 'f_a_0', ok: false }, { uid: 'f_b_1', ok: true }] },
        { qres: [{ uid: 'f_b_1', ok: false }] }
      ];
      let reads = 0;
      const prog = { total: 0, correct: 0 };
      Object.defineProperty(prog, 'sessions', { get(){ reads++; return sessions; } });
      S.prog = prog;
      WRONGBY._missCache = null;
      const a = WRONGBY.missCount('f_a_0');
      const b = WRONGBY.missCount('f_b_1');
      const unknown = WRONGBY.missCount('f_missing_0');
      return { a, b, unknown, reads };
    })()`);
    expect(out).toEqual({ a: 2, b: 1, unknown: 0, reads: 1 });
  });

  it('shows the three most urgent questions with a reason and a notes action', async () => {
    const out = await p.ev(`(() => {
      S.wr = [
        { uid: 'f_soil_0', q: 'Which soil holds water?', _nextDue: Date.now() - 5 * 86400000, _reason: 'concept', _streak: 0 },
        { uid: 'f_survey_0', q: 'Survey correction?', _nextDue: Date.now() - 2 * 86400000, _reason: 'careless', _streak: 0 },
        { uid: 'f_gk_0', q: 'General awareness?', _nextDue: Date.now() - 86400000, _streak: 0 }
      ];
      S.prog = { total: 0, correct: 0, sessions: [] };
      WRONGBY._missCache = null;
      WRONGBY._last = [
        { name: 'Soil Mechanics', due: 1, n: 1, files: [] },
        { name: 'Surveying', due: 1, n: 1, files: [] },
        { name: 'General Knowledge', due: 1, n: 1, files: [] }
      ];
      const el = document.getElementById('wr-list');
      WRONGBY._renderDue(el);
      return {
        text: el.textContent,
        notes: el.querySelectorAll('[data-on-click^="WRONGBY.notesQuestion"]').length,
        first: el.querySelector('.row .t-foot').textContent
      };
    })()`);
    expect(out.text).toContain('Next in line');
    expect(out.first).toContain('Which soil holds water?');
    expect(out.text).toContain('Concept gap');
    expect(out.text).toContain('Careless');
    expect(out.notes).toBe(3);
  });

  it('ranks due questions by overdue time, misses and reason', async () => {
    const plan = await p.ev(`(() => {
      S.wr = [
        { uid: 'f_a_0', q: 'A', _nextDue: Date.now() - 3 * 86400000, _reason: 'careless', _streak: 2 },
        { uid: 'f_b_1', q: 'B', _nextDue: Date.now() - 86400000, _reason: 'concept', _streak: 1 },
        { uid: 'f_c_2', q: 'C', _nextDue: Date.now() - 86400000, _reason: 'concept', _streak: 0 },
        { uid: 'f_d_3', q: 'D', _nextDue: Date.now() + 86400000 }
      ];
      S.prog = { total: 0, correct: 0, sessions: [] };
      const p = WRONGBY.reviewPlan(2);
      return { total: p.total, overdue: p.overdue, concept: p.concept, careless: p.careless, uids: p.items.map(x => x.uid) };
    })()`);
    expect(plan).toEqual({ total: 3, overdue: 3, concept: 2, careless: 1, uids: ['f_a_0', 'f_c_2'] });
  });

  it('resets the count when the question is missed again', async () => {
    for (let i = 0; i < 3; i++) await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, true)`);
    await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, false)`);
    expect(await p.ev('S.wr[0]._streak')).toBe(0);

    for (let i = 0; i < 4; i++) await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, true)`);
    expect(await p.ev('S.wr.length')).toBe(1);
    await p.ev(`REV.trackAnswer({ uid: 'f_soil_0' }, true)`);
    expect(await p.ev('S.wr.length')).toBe(0);
  });

  it('builds a printable sheet with the correct option, explanation and note', async () => {
    const html = await p.ev(`PRINT_Q.missedHtml([
      { uid: 'f_soil_0', q: 'Which soil is <best>?', options: ['Silt & clay', 'Sand'], correct: 0, explanation: 'Fine <particles> hold water.', _reason: 'concept', _note: 'Revise <Atterberg>.' }
    ], 'Soil Mechanics — Missed questions')`);

    expect(html).toContain('Soil Mechanics — Missed questions');
    expect(html).toContain('Silt &amp; clay');
    expect(html).toContain('Fine &lt;particles&gt;');
    expect(html).toContain('Revise &lt;Atterberg&gt;');
    expect(html).toContain('Concept gap');
    expect(html).toContain('<b>Answer:</b> A. Silt &amp; clay');
    expect(html).toContain('class="opt correct"');
  });

  it('opens the written-answer library from a missed chapter or set', async () => {
    const out = await p.ev(`(() => {
      WRONGBY._last = [{
        name: 'Soil Mechanics',
        files: [{ fid: 'f_soil', ref: { lv: 'level7', ch: 'soil', subtopic: 'Soil Mechanics' } }]
      }];
      const orig = UI.go; const went = [];
      UI.go = v => { went.push(v); };
      WRONGBY.notesChapter(0); const chapterQ = QNA.q;
      WRONGBY.notesFile('f_soil'); const fileQ = QNA.q;
      UI.go = orig;
      return { went, chapterQ, fileQ, input: document.querySelector('#qna-q').value };
    })()`);
    expect(out.went).toEqual(['qna', 'qna']);
    expect(out.chapterQ).toBe('Soil Mechanics');
    expect(out.fileQ).toBe('Soil Mechanics');
    expect(out.input).toBe('Soil Mechanics');
  });

  it('opens notes for one missed question by resolving its set', async () => {
    const out = await p.ev(`(() => {
      const old = window.ChapterData;
      window.ChapterData = { allFileRefs: () => [{ fid: 'f_quiz', lv: 'level7', ch: 'quiz', subtopic: 'Quiz Topic' }] };
      WRONGBY._refs = null;
      const orig = UI.go; let went = 0;
      try {
        UI.go = () => { went++; };
        WRONGBY.notesQuestion('f_quiz_0');
      } finally {
        UI.go = orig;
        window.ChapterData = old;
        WRONGBY._refs = null;
      }
      return { went: went, q: QNA.q };
    })()`);
    expect(out.went).toBe(1);
    expect(out.q).toContain('Quiz');
  });

  it('downloads only the chosen chapter', async () => {
    await p.ev(`
      WRONGBY._last = [
        { name: 'Soil Mechanics', files: [{ items: [{ uid: 'f_soil_0', q: 'A' }] }] },
        { name: 'Surveying', files: [{ items: [{ uid: 'f_survey_0', q: 'B' }] }] }
      ];
      window.__origMissed = PRINT_Q.missed;
      window.__dl = null;
      PRINT_Q.missed = function(items, title){ window.__dl = { n: items.length, uid: items[0].uid, title: title }; };
      WRONGBY.downloadChapter(1);
      PRINT_Q.missed = window.__origMissed;
    `);
    expect(await p.ev('window.__dl')).toEqual({ n: 1, uid: 'f_survey_0', title: 'Surveying — Missed questions' });
  });

  it('offers download-all from the miss-list header, not only per chapter', () => {
    const btn = p.w.document.querySelector('#view-wrong [data-on-click="WRONGBY.downloadAll()"]');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toContain('Download all missed questions');
  });

  it('downloads every missed question as one sheet', async () => {
    await p.ev(`
      S.wr = [
        { uid: 'f_soil_0', q: 'A' },
        { uid: 'f_survey_0', q: 'B' }
      ];
      window.__origMissedAll = PRINT_Q.missed;
      window.__dlAll = null;
      PRINT_Q.missed = function(items, title){ window.__dlAll = { n: items.length, title: title }; };
      WRONGBY.downloadAll();
      PRINT_Q.missed = window.__origMissedAll;
    `);
    expect(await p.ev('window.__dlAll')).toEqual({ n: 2, title: 'All missed questions' });
  });
});
