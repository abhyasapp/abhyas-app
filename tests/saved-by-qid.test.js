// tests/saved-by-qid.test.js — bookmarks, the wrong bank, notes and stats follow
// the permanent question id in the real app, and Saved / Weak spots each have
// exactly one home. No network.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const RESET = `
  localStorage.removeItem(REV.MASTERED_KEY);
  localStorage.removeItem('abhyas_qnotes'); QNOTE._cache = null;
  localStorage.removeItem('abhyas_qstats_v1'); QSTATS._cache = null;
  S.bk = []; S.fl = []; S.wr = [];
  S.prog = { total: 0, correct: 0, sessions: [] };
`;

describe('saved things follow the permanent question id', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  beforeEach(async () => { await p.ev(RESET); });
  afterAll(() => p && p.close());

  it('a bookmark survives the question moving, and never attaches to a newcomer at its old position', async () => {
    await p.ev(`REV.toggle('bk', { uid: 'f_3', qid: 'Q1', q: 'Alpha', options: ['a','b'] })`);
    expect(await p.ev(`REV.has('bk', { uid: 'f_9', qid: 'Q1' })`)).toBe(true);
    expect(await p.ev(`REV.has('bk', { uid: 'f_3', qid: 'Q2' })`)).toBe(false);
    // toggling from the new position removes the SAME question
    await p.ev(`REV.toggle('bk', { uid: 'f_9', qid: 'Q1', q: 'Alpha', options: ['a','b'] })`);
    expect(await p.ev('S.bk.length')).toBe(0);
  });

  it('a miss is not duplicated when its question moves, and mastery counts across positions', async () => {
    await p.ev(`REV.trackAnswer({ uid: 'f_3', qid: 'Q1', q: 'Alpha', options: ['a','b'] }, false)`);
    await p.ev(`REV.trackAnswer({ uid: 'f_9', qid: 'Q1', q: 'Alpha', options: ['a','b'] }, false)`);
    expect(await p.ev('S.wr.length')).toBe(1);
    for (let i = 0; i < 5; i++) await p.ev(`REV.trackAnswer({ uid: 'f_${'${'}i}', qid: 'Q1' }, true)`.replace("${i}", String(i + 20)));
    expect(await p.ev('S.wr.length')).toBe(0);
    expect(await p.ev(`REV._masteredLoad().some(x => x.qid === 'Q1')`)).toBe(true);
  });

  it('a different question that now sits at the old position is left alone', async () => {
    await p.ev(`REV.addWrong({ uid: 'f_3', qid: 'Q1', q: 'Alpha', options: ['a','b'] })`);
    await p.ev(`REV.trackAnswer({ uid: 'f_3', qid: 'Q2' }, true)`);   // answers Q2 correctly
    expect(await p.ev('S.wr[0]._streak')).toBe(0);                      // Q1's streak untouched
  });

  it('notes: stored under the qid, found from any position, never leaked to a neighbour', async () => {
    await p.ev(`QNOTE.set({ uid: 'f_3', qid: 'Q1' }, 'remember the 3 phases')`);
    expect(await p.ev(`JSON.parse(localStorage.getItem('abhyas_qnotes'))['q:Q1']`)).toBe('remember the 3 phases');
    expect(await p.ev(`QNOTE.get({ uid: 'f_9', qid: 'Q1' })`)).toBe('remember the 3 phases');
    expect(await p.ev(`QNOTE.get({ uid: 'f_3', qid: 'Q2' })`)).toBe('');
  });

  it('a legacy note under the old uid moves to the qid and cannot resurrect after clearing', async () => {
    await p.ev(`localStorage.setItem('abhyas_qnotes', JSON.stringify({ f_3: 'old note' })); QNOTE._cache = null;`);
    expect(await p.ev(`QNOTE.get({ uid: 'f_3', qid: 'Q1' })`)).toBe('old note');
    expect(await p.ev(`Object.keys(JSON.parse(localStorage.getItem('abhyas_qnotes')))`)).toEqual(['q:Q1']);
    await p.ev(`QNOTE.set('q:Q1', '')`);
    expect(await p.ev(`QNOTE.get({ uid: 'f_3', qid: 'Q1' })`)).toBe('');
  });

  it('normQ upgrades legacy saved rows to the qid by TEXT and carries their notes', async () => {
    await p.ev(`
      S.bk = [{ uid: 'f_1', q: 'Which soil holds water?', options: ['Clay','Sand'] }];
      S.wr = [{ uid: 'f_1', q: 'Which soil holds water?', options: ['Clay','Sand'], _streak: 2 }];
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ f_1: 'clay!' })); QNOTE._cache = null;
      normQ([
        { q: 'Something else', options: ['x','y'], correct: 0, public_qn: 'Z.9999' },
        { q: 'Which soil holds water?', options: ['Clay','Sand'], correct: 0, public_qn: 'Z.1234' }
      ], 'f');
    `);
    expect(await p.ev('S.bk[0].qid')).toBe('Z.1234');
    expect(await p.ev('S.wr[0].qid')).toBe('Z.1234');
    expect(await p.ev('S.wr[0]._streak')).toBe(2);
    expect(await p.ev(`Object.keys(JSON.parse(localStorage.getItem('abhyas_qnotes')))`)).toEqual(['q:Z.1234']);
  });

  it('a row is never upgraded to the question that merely sits at its old position', async () => {
    await p.ev(`
      S.bk = [{ uid: 'f_1', q: 'Which soil holds water?', options: ['Clay','Sand'] }];
      normQ([ { q: 'Totally different', options: ['x','y'], correct: 0, public_qn: 'Z.1' },
              { q: 'Also different', options: ['x','y'], correct: 0, public_qn: 'Z.2' } ], 'f');
    `);
    expect(await p.ev('S.bk[0].qid')).toBeUndefined();
  });

  it('question stats follow the qid across positions', async () => {
    await p.ev(`QSTATS.record({ uid: 'f_3', qid: 'Q1' }, true); QSTATS.record({ uid: 'f_9', qid: 'Q1' }, false);`);
    expect(await p.ev(`QSTATS.get({ uid: 'f_40', qid: 'Q1' }).attempts`)).toBe(2);
    expect(await p.ev(`QSTATS.get({ uid: 'f_3', qid: 'Q2' })`)).toBeNull();
  });
});

describe('one home for each thing', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('the sidebar has My library and Weak spots, and no separate Saved entry', async () => {
    expect(await p.ev(`!!document.getElementById('nav-library')`)).toBe(true);
    expect(await p.ev(`!!document.getElementById('nav-wrong')`)).toBe(true);
    expect(await p.ev(`!!document.getElementById('nav-bookmarks')`)).toBe(false);
    expect(await p.ev(`NAV.ALL.some(x => x.view === 'bookmarks')`)).toBe(false);
  });

  it('the old #bookmarks link opens Library > Saved', async () => {
    await p.ev(`UI.go('bookmarks')`);
    expect(await p.ev('UI.cur')).toBe('library');
    expect(await p.ev('LIBRARY.TAB')).toBe('saved');
  });

  it('Library has no Missed tab; missed questions live in Weak spots', async () => {
    expect(await p.ev(`!!document.querySelector('#lib-tabs [data-tab="missed"]')`)).toBe(false);
    expect(await p.ev(`!!document.getElementById('view-bookmarks')`)).toBe(false);
  });
});
