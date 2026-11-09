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
