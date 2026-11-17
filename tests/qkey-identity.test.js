// tests/qkey-identity.test.js — saved things follow the PERMANENT question id,
// never the position. A re-export reuses positions for different questions;
// matching on uid alone attached notes, bookmarks and misses to the wrong one.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

function mkStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function boot() {
  const store = mkStorage();
  const g = loadGlobals(['js/core/qkey.js', 'js/core/sync.js', 'js/report/report-matching.js'], {
    S: { bk: [], fl: [], wr: [] },
    LS: { BK: 'bk', FL: 'fl', WR: 'wr' },
    _save() {},
    localStorage: store,
    document: { getElementById: () => null },
  });
  return g;
}

describe('QKEY.same', () => {
  const g = boot();
  const K = g.QKEY;

  it('same qid is the same question even when the position moved', () => {
    expect(K.same({ uid: 'f_3', qid: 'Q1' }, { uid: 'f_9', qid: 'Q1' })).toBe(true);
  });
  it('same position but a different qid is NOT the same question', () => {
    expect(K.same({ uid: 'f_3', qid: 'Q1' }, { uid: 'f_3', qid: 'Q2' })).toBe(false);
  });
  it('legacy rows fall back to uid, but only when the text still agrees', () => {
    expect(K.same({ uid: 'f_3', q: 'Soil?' }, { uid: 'f_3', qid: 'Q9', q: 'soil?' })).toBe(true);
    expect(K.same({ uid: 'f_3', q: 'Soil?' }, { uid: 'f_3', qid: 'Q9', q: 'Something else entirely' })).toBe(false);
  });
  it('keys: permanent id first, uid only as a fallback', () => {
    expect(K.of({ uid: 'f_3', qid: 'Q1' })).toBe('q:Q1');
    expect(K.of({ uid: 'f_3' })).toBe('u:f_3');
    expect(K.mapKeys({ uid: 'f_3', qid: 'Q1' })).toEqual({ primary: 'q:Q1', legacy: 'f_3' });
    expect(K.mapKeys({ uid: 'f_3' })).toEqual({ primary: 'f_3', legacy: '' });
  });
  it('accepts note keys and bare legacy strings', () => {
    expect(K.same({ uid: 'f_3', qid: 'Q1' }, 'q:Q1')).toBe(true);
    expect(K.same({ uid: 'f_3' }, 'u:f_3')).toBe(true);
    expect(K.same({ uid: 'f_3', qid: 'Q1' }, 'f_3')).toBe(true);
    expect(K.same({ uid: 'f_4', qid: 'Q1' }, 'f_3')).toBe(false);
  });
});

describe('sync merge', () => {
  const g = boot();
  it('does not collapse two different questions that reused a position', () => {
    const a = { uid: 'f_3', qid: 'Q1', q: 'one' }, b = { uid: 'f_3', qid: 'Q2', q: 'two' };
    const m = g.mergeSyncData({ bk: [a] }, { bk: [b] });
    expect(m.bk.map(x => x.qid).sort()).toEqual(['Q1', 'Q2']);
  });
  it('merges the same question that moved', () => {
    const a = { uid: 'f_3', qid: 'Q1', q: 'one' }, b = { uid: 'f_8', qid: 'Q1', q: 'one' };
    expect(g.mergeSyncData({ wr: [a] }, { wr: [b] }).wr.length).toBe(1);
  });
  it('keeps one row when a legacy copy meets its upgraded twin', () => {
    const legacy = { uid: 'f_3', q: 'One' }, upgraded = { uid: 'f_3', qid: 'Q1', q: 'one' };
    const m = g.mergeSyncData({ bk: [legacy] }, { bk: [upgraded] });
    expect(m.bk.length).toBe(1);
    expect(m.bk[0].qid).toBe('Q1');
  });
});

describe('corrections', () => {
  const g = boot();
  const fresh = [
    { uid: 'f_0', qid: 'Q2', q: 'Another question', options: ['x', 'y'], fileId: 'f' },
    { uid: 'f_1', qid: 'Q1', q: 'Completely rewritten stem by the teacher', options: ['a', 'b'], correct: 1, fileId: 'f' },
  ];
  it('finds a saved question by qid even if the teacher rewrote the stem and it moved', () => {
    const old = { uid: 'f_0', qid: 'Q1', q: 'Original stem', options: ['a', 'b'], fileId: 'f' };
    const r = g.applyCorrectionsToList([old], 'f', fresh, 1);
    expect(r.withdrawn).toBe(0);
    expect(r.list[0].uid).toBe('f_1');
    expect(r.list[0].qid).toBe('Q1');
  });
  it('never matches on position when another question now holds the slot', () => {
    const old = { uid: 'f_0', qid: 'Q9', q: 'Gone', options: ['a', 'b'], fileId: 'f' };
    const r = g.applyCorrectionsToList([old], 'f', fresh, 1);
    expect(r.list[0]._withdrawn).toBe(true);
  });
  it('reports the note rekey when a question moves or learns its qid', () => {
    const moved = { uid: 'f_0', qid: 'Q1', q: 'Original stem', fileId: 'f' };
    expect(g.applyCorrectionsToList([moved], 'f', fresh, 1).rekeys).toEqual([]);   // key is q:Q1 either way
    const legacy = { uid: 'f_1', q: 'Completely rewritten stem by the teacher', options: ['a', 'b'], fileId: 'f' };
    const r = g.applyCorrectionsToList([legacy], 'f', fresh, 1);
    expect(r.rekeys).toEqual([{ from: 'f_1', to: 'q:Q1' }]);
  });
});
