// tests/chapter-reset.test.js — resetting one chapter clears that chapter's
// sessions, accuracy, coverage and missed questions, and leaves every other
// chapter alone. It keeps an undo copy and writes the reset markers a sync
// needs, so a second device cannot merge the deleted work back in.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const FIXTURE = `window.ChapterData = {
  chapters(lv){ return { soil: 'Soil Mechanics', survey: 'Surveying', empty: 'Empty Chapter' }; },
  chapterFileRefs(lv, ch){
    if (ch === 'soil') return [{ fid: 'f_soil', key: 'k_soil', lv: 'level7', ch: 'soil', book: 'Book A', subtopic: 'soil' }];
    if (ch === 'empty') return [{ fid: 'f_empty', key: 'k_empty', lv: 'level7', ch: 'empty', book: 'Book C', subtopic: 'empty' }];
    return [{ fid: 'f_survey', key: 'k_survey', lv: 'level7', ch: 'survey', book: 'Book B', subtopic: 'survey' }];
  },
  chapterName(lv, ch){
    return ch === 'soil' ? 'Soil Mechanics' : ch === 'empty' ? 'Empty Chapter' : 'Surveying';
  },
  allFileRefs(){ return [
    { fid: 'f_soil', key: 'k_soil', lv: 'level7', ch: 'soil', book: 'Book A', subtopic: 'soil' },
    { fid: 'f_survey', key: 'k_survey', lv: 'level7', ch: 'survey', book: 'Book B', subtopic: 'survey' },
    { fid: 'f_empty', key: 'k_empty', lv: 'level7', ch: 'empty', book: 'Book C', subtopic: 'empty' }
  ]; },
  fileCount(){ return 10; }
};`;

const SEED = `
  localStorage.removeItem('abhyas_pre_reset_snapshot');
  localStorage.removeItem('abhyas_resets');
  S.cov = { f_soil: { p: '111222', a: 6, c: 2 }, f_survey: { p: '1122', a: 4, c: 2 } };
  S.fcount = { f_soil: 6, f_survey: 4, f_empty: 5 };
  S.wr = [
    { uid: 'f_soil_1', fileId: 'f_soil', _addedAt: 1500 },
    { uid: 'f_survey_2', fileId: 'f_survey', _addedAt: 1500 }
  ];
  S.chapStats = {
    'Soil Mechanics — Book A': { attempted: 10, correct: 8, sessions: 1, lastAt: 1000 },
    'Surveying — Book B': { attempted: 10, correct: 5, sessions: 1, lastAt: 2000 }
  };
  S.prog = { total: 20, correct: 13, sessions: [
    { chapter: 'Soil Mechanics — Book A', chapterKey: 'Soil Mechanics', lv: 'level7', ch: 'soil', fid: 'f_soil', total: 10, correct: 8, wrong: 2, skipped: 0, pct: 80, at: 1000 },
    { chapter: 'Surveying — Book B', chapterKey: 'Surveying', lv: 'level7', ch: 'survey', fid: 'f_survey', total: 10, correct: 5, wrong: 5, skipped: 0, pct: 50, at: 2000 }
  ] };
`;

describe('resetting one chapter', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];' });
    p.ev(FIXTURE);
  }, 120000);
  beforeEach(async () => { await p.ev(SEED); });
  afterAll(() => p && p.close());

  it('offers every chapter with the level, id and files the reset needs', async () => {
    const list = await p.ev('PROGRESS_RESET.chapters().map(c => ({ label: c.label, lv: c.lv, ch: c.ch, fids: c.fids }))');
    expect(list).toContainEqual({
      label: 'Soil Mechanics — Book A', lv: 'level7', ch: 'soil', fids: ['f_soil']
    });
    expect(list).toContainEqual({
      label: 'Empty Chapter — Book C', lv: 'level7', ch: 'empty', fids: ['f_empty']
    });
  });

  it('clears only the chosen chapter and leaves the others alone', async () => {
    const at = await p.ev(`PROGRESS_RESET.runChapter('level7', 'soil')`);
    expect(at).toBeGreaterThan(0);

    expect(await p.ev('S.prog.sessions.map(s => s.ch).join(",")')).toBe('survey');
    expect(await p.ev('Object.keys(S.chapStats).join(",")')).toBe('Surveying — Book B');
    expect(await p.ev('!!S.cov.f_soil')).toBe(false);
    expect(await p.ev('!!S.cov.f_survey')).toBe(true);
    expect(await p.ev('S.wr.map(q => q.uid).join(",")')).toBe('f_survey_2');
  });

  it('writes reset markers for the chapter name, its label and its files', async () => {
    await p.ev(`PROGRESS_RESET.runChapter('level7', 'soil')`);
    const ch = await p.ev('PROGRESS_RESET.load().ch');
    expect(ch['Soil Mechanics']).toBeGreaterThan(0);
    expect(ch['Soil Mechanics — Book A']).toBeGreaterThan(0);
    expect(ch.f_soil).toBeGreaterThan(0);
    expect(ch['Surveying — Book B']).toBeUndefined();
  });

  it('keeps an undo copy that restores the chapter', async () => {
    await p.ev(`PROGRESS_RESET.runChapter('level7', 'soil')`);
    expect(await p.ev(`JSON.parse(localStorage.getItem('abhyas_pre_reset_snapshot')).reason`)).toBe('scoped:chapter');

    expect(await p.ev('RESET_SNAPSHOT.restore()')).toBe(true);
    expect(await p.ev('S.prog.sessions.length')).toBe(2);
    expect(await p.ev('Object.keys(S.chapStats).length')).toBe(2);
    expect(await p.ev('S.wr.length')).toBe(2);
    expect(await p.ev('PROGRESS_RESET.load().ch')).toBeUndefined();
    expect(await p.ev(`localStorage.getItem('abhyas_pre_reset_snapshot')`)).toBe(null);
  });

  it('the reset dialog entry clears the same chapter', async () => {
    const label = await p.ev("PROGRESS_RESET.chapters().find(c => c.ch === 'soil').label");
    expect(label).toBe('Soil Mechanics — Book A');

    const at = await p.ev(`PROGRESS_RESET.run('chapter', ${JSON.stringify(label)})`);
    expect(at).toBeGreaterThan(0);
    expect(await p.ev('S.prog.sessions.map(s => s.ch).join(",")')).toBe('survey');
    expect(await p.ev('!!S.cov.f_soil')).toBe(false);
    expect(await p.ev('!!S.cov.f_survey')).toBe(true);
    expect(await p.ev('S.wr.map(q => q.uid).join(",")')).toBe('f_survey_2');
  });

  it('offers the same reset beside each chapter on the progress page', async () => {
    await p.ev('PROG.render()');
    await tick();
    const btns = [...p.w.document.querySelectorAll('#chap-acc [data-on-click*="CH_GRID.resetChapter"]')];
    expect(btns.length).toBeGreaterThan(0);
    expect(btns[0].getAttribute('aria-label')).toContain('Reset chapter progress');
  });

  it('reports what a reset would remove before anything is deleted', async () => {
    expect(await p.ev(`PROGRESS_RESET.chapterImpact('level7', 'soil')`)).toEqual({
      sessions: 1, answered: 10, correct: 8, missed: 1, sets: 1, files: 1
    });
    expect(await p.ev(`PROGRESS_RESET.chapterImpact('level7', 'empty')`)).toEqual({
      sessions: 0, answered: 0, correct: 0, missed: 0, sets: 0, files: 1
    });
  });

  it('names those counts in the confirmation and deletes nothing when cancelled', async () => {
    p.ev(`window.__origAsk = ASK.confirm; ASK.confirm = (o) => { window.__asked = o; return Promise.resolve(false); };`);
    await p.ev(`CH_GRID.resetChapter('level7', 'soil')`);
    const body = await p.ev('window.__asked.body');
    expect(body).toContain('Sessions: 1');
    expect(body).toContain('Answered: 10');
    expect(body).toContain('Missed: 1');
    expect(await p.ev('S.prog.sessions.length')).toBe(2);
    p.ev('ASK.confirm = window.__origAsk; delete window.__origAsk; delete window.__asked;');
  });

  it('labels each reset-dialog chapter with how many questions it has answered', async () => {
    await p.ev('PROGRESS_RESET.open()');
    const opts = await p.ev(`[...document.querySelectorAll('#pr-chapter option')].map(o => o.textContent)`);
    expect(opts).toContain('Soil Mechanics — Book A — 10 answered');
    expect(opts).toContain('Empty Chapter — Book C');
    p.ev('closeMod()');
  });

  it('resets one set only, and marks just that file for sync', async () => {
    expect(await p.ev(`PROGRESS_RESET.setImpact('f_soil')`)).toEqual({
      sessions: 1, answered: 10, correct: 8, missed: 1, sets: 1, files: 1
    });

    expect(await p.ev(`PROGRESS_RESET.runSet('f_soil')`)).toBeGreaterThan(0);
    expect(await p.ev('S.prog.sessions.map(s => s.ch).join(",")')).toBe('survey');
    expect(await p.ev('!!S.cov.f_soil')).toBe(false);
    expect(await p.ev('!!S.cov.f_survey')).toBe(true);
    expect(await p.ev('S.wr.map(q => q.uid).join(",")')).toBe('f_survey_2');
    expect(await p.ev(`PROGRESS_RESET.load().ch.f_soil`)).toBeGreaterThan(0);
    expect(await p.ev(`PROGRESS_RESET.load().ch['Soil Mechanics — Book A']`)).toBeUndefined();
    expect(await p.ev(`JSON.parse(localStorage.getItem('abhyas_pre_reset_snapshot')).reason`)).toBe('scoped:set');

    expect(await p.ev('RESET_SNAPSHOT.restore()')).toBe(true);
    expect(await p.ev('S.prog.sessions.length')).toBe(2);
    expect(await p.ev('S.prog.total')).toBe(20);
    expect(await p.ev('S.prog.correct')).toBe(13);
    expect(await p.ev('S.wr.length')).toBe(2);
    expect(await p.ev(`PROGRESS_RESET.load().ch`)).toBeUndefined();
  });

  it('lifts one set out of a chapter-wide session without deleting the other set', async () => {
    await p.ev(`S.prog.sessions.push({
      chapter: 'Soil Mechanics — Book A', chapterKey: 'Soil Mechanics', lv: 'level7', ch: 'soil',
      total: 3, correct: 2, wrong: 1, skipped: 0, pct: 67, at: 3000,
      qres: [{ uid: 'f_soil_101', ok: true }, { uid: 'f_soil_102', ok: false }, { uid: 'f_survey_201', ok: true }]
    }); S.prog.total += 3; S.prog.correct += 2;`);

    expect(await p.ev(`PROGRESS_RESET.runSet('f_soil')`)).toBeGreaterThan(0);
    const mixed = JSON.parse(await p.ev("JSON.stringify(S.prog.sessions.find(s => s.at === 3000))"));
    expect(mixed.qres.map((q) => q.uid)).toEqual(['f_survey_201']);
    expect(mixed.total).toBe(1);
    expect(mixed.correct).toBe(1);
    expect(mixed.wrong).toBe(0);
    expect(await p.ev('S.prog.sessions.some(s => s.fid === "f_soil")')).toBe(false);
    expect(await p.ev('S.prog.total')).toBe(11);
    expect(await p.ev('S.prog.correct')).toBe(6);
  });

  it('resets a whole level and restores it from the undo copy', async () => {
    expect(await p.ev(`PROGRESS_RESET.levelImpact('level7')`)).toEqual({
      sessions: 2, answered: 20, correct: 13, missed: 2, sets: 2, files: 3
    });

    expect(await p.ev(`PROGRESS_RESET.run('level', '', 'level7')`)).toBeGreaterThan(0);
    expect(await p.ev('S.prog.sessions.length')).toBe(0);
    expect(await p.ev('Object.keys(S.chapStats).length')).toBe(0);
    expect(await p.ev('Object.keys(S.cov).length')).toBe(0);
    expect(await p.ev('S.wr.length')).toBe(0);
    expect(await p.ev(`JSON.parse(localStorage.getItem('abhyas_pre_reset_snapshot')).reason`)).toBe('scoped:level');
    const ch = await p.ev('PROGRESS_RESET.load().ch');
    expect(ch['Soil Mechanics']).toBeGreaterThan(0);
    expect(ch['Surveying — Book B']).toBeGreaterThan(0);
    expect(ch.f_empty).toBeGreaterThan(0);

    expect(await p.ev('RESET_SNAPSHOT.restore()')).toBe(true);
    expect(await p.ev('S.prog.sessions.length')).toBe(2);
    expect(await p.ev('Object.keys(S.chapStats).length')).toBe(2);
    expect(await p.ev('S.wr.length')).toBe(2);
  });

  it('offers the per-set reset only on a set that has progress', async () => {
    p.ev('S.online = false;');
    await p.ev(`CH_GRID.open('level7', 'soil')`);
    await tick(400);
    const btn = p.w.document.querySelector('#mbody [data-on-click*="CH_GRID.resetSet"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('data-on-click')).toContain('f_soil');
    p.ev('closeMod()');
  });

  it('offers a level scope in the reset dialog', async () => {
    await p.ev('PROGRESS_RESET.open()');
    p.ev(`PROGRESS_RESET._pick('level')`);
    const row = p.w.document.getElementById('pr-level-row');
    expect(row.style.display).not.toBe('none');
    const levels = [...p.w.document.querySelectorAll('#pr-level option')].map((o) => o.value);
    expect(levels).toEqual(['level7', 'level5', 'gk']);
    p.ev('closeMod()');
  });

  it('does nothing and writes no snapshot for a chapter with no progress', async () => {
    expect(await p.ev(`PROGRESS_RESET.runChapter('level7', 'empty')`)).toBe(0);
    expect(await p.ev(`localStorage.getItem('abhyas_pre_reset_snapshot')`)).toBe(null);
    expect(await p.ev('S.prog.sessions.length')).toBe(2);
  });
});
