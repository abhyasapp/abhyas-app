// Identity priority everywhere: NON-PUBLIC id first, PUBLIC number second, position last.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { loadGlobals, ROOT } from './helpers/load-globals.js';
import { bootPage } from '../tools/lib/boot-page.mjs';

const g = loadGlobals(['js/core/qkey.js', 'js/core/question.js', 'js/report/report-shared.js', 'js/report/report-matching.js'], {
  S: { bk: [], fl: [], wr: [] },
  document: { addEventListener() {}, querySelector() { return null; }, getElementById: () => null,
              createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; } },
  location: { origin: 'https://example.test' },
  localStorage: { getItem: () => null, setItem() {} },
  addEventListener() {}, postMessage() {},
});
const K = g.QKEY;
const raw = (extra) => Object.assign({ q: 'Stem', options: ['a', 'b', 'c', 'd'], correct: 0 }, extra);

describe('where the ids come from (normQ)', () => {
  it('reads both ids by SHAPE and makes the non-public one primary', () => {
    const [x] = g.normQ([raw({ id: 48213, public_qn: '50011.110001' })], 'f');
    expect([x.nid, x.pqn, x.qid]).toEqual([48213, '50011.110001', 48213]);
  });
  it('a public id carried on `id` (a --public-qn export) is still a public id', () => {
    const [x] = g.normQ([raw({ id: '5002mixedqn10001' })], 'f2');
    expect([x.nid, x.pqn, x.qid]).toEqual([undefined, '5002mixedqn10001', '5002mixedqn10001']);
  });
  it('an explicit nid field wins over a digits-only id', () => {
    const [x] = g.normQ([raw({ nid: 7, id: 9, public_qn: 'A1.2.3' })], 'f3');
    expect(x.nid).toBe(7);
  });
  it('no ids at all: position only', () => {
    const [x] = g.normQ([raw({})], 'f4');
    expect([x.nid, x.pqn, x.qid, x.uid]).toEqual([undefined, undefined, undefined, 'f4_0']);
  });
});

describe('QKEY.same: non-public id, then public number, then position', () => {
  it('equal non-public ids are the same question even if the public number or position differ', () => {
    expect(K.same({ nid: 5, pqn: 'A.1', uid: 'f_1' }, { nid: 5, pqn: 'B.9', uid: 'f_8' })).toBe(true);
  });
  it('different non-public ids are different even if the public number matches', () => {
    expect(K.same({ nid: 5, pqn: 'A.1' }, { nid: 6, pqn: 'A.1' })).toBe(false);
  });
  it('with no non-public id on one side, the public number decides', () => {
    expect(K.same({ qid: 'A.1', uid: 'f_1' }, { nid: 5, pqn: 'A.1', uid: 'f_9' })).toBe(true);
    expect(K.same({ qid: 'A.1', uid: 'f_1' }, { nid: 5, pqn: 'A.2', uid: 'f_1' })).toBe(false);
  });
  it('legacy numeric qid is a non-public id, legacy readable qid is a public number', () => {
    expect(K.same({ qid: 48213 }, { nid: 48213, pqn: 'P.1' })).toBe(true);
    expect(K.same({ qid: 'P.1' }, { nid: 48213, pqn: 'P.1' })).toBe(true);
  });
  it('position is the last resort: same uid AND same text, and only without ids', () => {
    expect(K.same({ uid: 'f_1', q: 'Soil?' }, { uid: 'f_1', q: 'soil?' })).toBe(true);
    expect(K.same({ uid: 'f_1', q: 'Soil?' }, { uid: 'f_1', q: 'Rocks?' })).toBe(false);
    expect(K.same({ uid: 'f_1', nid: 5 }, { uid: 'f_1', nid: 6 })).toBe(false);
  });
  it('keys: q:<non-public id>, else q:<public number>, else u:<uid>', () => {
    expect(K.of({ nid: 5, pqn: 'A.1', uid: 'f_1' })).toBe('q:5');
    expect(K.of({ pqn: 'A.1', uid: 'f_1' })).toBe('q:A.1');
    expect(K.of({ uid: 'f_1' })).toBe('u:f_1');
  });
  it('a note key found under any older key is listed for migration', () => {
    expect(K.mapKeys({ nid: 5, pqn: 'A.1', uid: 'f_1' })).toEqual({ primary: 'q:5', legacy: ['q:A.1', 'f_1'] });
  });
});

describe('merging devices and backups', () => {
  it('a legacy row and its upgraded twin become one row that learns both ids', () => {
    const out = K.mergeLists([{ uid: 'f_1', qid: 'A.1', q: 'Stem', _streak: 2 }], [{ uid: 'f_9', nid: 5, pqn: 'A.1', qid: 5, q: 'Stem' }]);
    expect(out).toHaveLength(1);
    expect(out[0]._streak).toBe(2);                         // this device's progress is kept
    expect([out[0].nid, out[0].pqn, out[0].qid]).toEqual([5, 'A.1', 5]);
  });
  it('different questions that reused a position stay separate', () => {
    expect(K.mergeLists([{ uid: 'f_1', nid: 5 }], [{ uid: 'f_1', nid: 6 }])).toHaveLength(2);
  });
  it('stays fast for a large wrong bank', () => {
    const a = [], b = [];
    for (let i = 0; i < 5000; i++) { a.push({ uid: 'f_' + i, nid: i }); b.push({ uid: 'g_' + i, nid: i }); }
    const t = Date.now();
    expect(K.mergeLists(a, b)).toHaveLength(5000);
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('history grouping (misses, "seen N times")', () => {
  it('follows a question through a re-export and never merges two different ones', () => {
    const ix = K.makeIndex();
    const a1 = ix.add({ uid: 'f_1', nid: 5, pqn: 'A.1' });
    const a2 = ix.add({ uid: 'f_9', nid: 5 });               // same question, new position
    const b = ix.add({ uid: 'f_1', nid: 6 });                // a different question took position f_1
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
  });
  it('older history without ids is still reachable by position', () => {
    const ix = K.makeIndex();
    const c = ix.add({ uid: 'f_3' });
    expect(ix.find({ uid: 'f_3', nid: 5 })).toBe(c);
    expect(ix.find({ uid: 'f_4', nid: 5 })).toBe('');
  });
});

describe('corrections find the question by id first', () => {
  const fresh = [
    { uid: 'f_0', nid: 9, pqn: 'B.2', q: 'An unrelated question', options: ['x', 'y'], fileId: 'f' },
    { uid: 'f_1', nid: 5, pqn: 'A.1', q: 'Completely rewritten by the teacher', options: ['a', 'b'], correct: 1, fileId: 'f' },
  ];
  it('by non-public id, even when the text was rewritten and the question moved', () => {
    const r = g.matchCorrectedQuestion({ uid: 'f_0', nid: 5, q: 'Original', options: ['a', 'b'] }, fresh);
    expect([r.kind, r.question.nid]).toEqual(['moved', 5]);
  });
  it('by public number when the saved copy only has that', () => {
    const r = g.matchCorrectedQuestion({ uid: 'f_0', qid: 'A.1', q: 'Original' }, fresh);
    expect(r.question.pqn).toBe('A.1');
  });
  it('never by position when the position now holds a different id', () => {
    const r = g.matchCorrectedQuestion({ uid: 'f_0', nid: 77, q: 'An unrelated question', options: ['x', 'y'] }, fresh);
    expect(r.kind).toBe('none');
  });
  it('position + text only for a question that has no id at all', () => {
    const r = g.matchCorrectedQuestion({ uid: 'f_0', q: 'An unrelated question', options: ['x', 'y'] }, fresh);
    expect(r.kind).toBe('same');
  });
  it('the corrected copy keeps both ids', () => {
    const r = g.applyCorrectionsToList([{ uid: 'f_0', qid: 'A.1', q: 'Original', fileId: 'f' }], 'f', fresh, 1);
    expect([r.list[0].nid, r.list[0].pqn, r.list[0].qid]).toEqual([5, 'A.1', 5]);
  });
});

describe('reports', () => {
  it('one question + reason is queued once however it is identified', () => {
    let q = g.reportQueueAdd([], { uid: 'f_1', qid: 'A.1', reason: 'typo' }, 1);
    q = g.reportQueueAdd(q, { uid: 'f_7', nid: 5, pqn: 'A.1', qid: 5, reason: 'typo', note: 'again' }, 2);
    expect(q).toHaveLength(1);
  });
  it('different non-public ids at the same position are separate reports', () => {
    let q = g.reportQueueAdd([], { uid: 'f_1', nid: 5, reason: 'typo' }, 1);
    q = g.reportQueueAdd(q, { uid: 'f_1', nid: 6, reason: 'typo' }, 2);
    expect(q).toHaveLength(2);
  });
  it('history marks the right row sent', () => {
    const list = [{ uid: 'f_1', nid: 5, reason: 'typo', status: 'queued' }, { uid: 'f_1', nid: 6, reason: 'typo', status: 'queued' }];
    const out = g.reportHistoryUpdate(list, { uid: 'f_1', nid: 6 }, 'typo', { status: 'sent' });
    expect(out.map(x => x.status)).toEqual(['queued', 'sent']);
  });
  it('the report sent to the server carries nid, pqn, qid and uid', () => {
    const src = require_('js/report/userreport.js');
    expect(src).toMatch(/nid: q\.nid != null \? q\.nid : ''/);
    expect(src).toMatch(/pqn: q\.pqn \|\| ''/);
  });
});

import fs from 'node:fs';
function require_(f) { return fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'); }

describe('in the real app: saved items, notes, history, backup', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`localStorage.removeItem('abhyas_qnotes'); QNOTE._cache = null; S.bk = []; S.fl = []; S.wr = [];
                S.prog = { total: 0, correct: 0, sessions: [] }; WRONGBY._missCache = null; QHIST._cache = null;`);
  });

  it('a saved row from before the priority upgrades to both ids, and its note follows', async () => {
    await p.ev(`
      S.wr = [{ uid: 'f_1', qid: 'G0011.110001', q: 'Which soil holds water?', options: ['Clay','Sand'], _streak: 2 }];
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ 'q:G0011.110001': 'old public-keyed note' })); QNOTE._cache = null;
      normQ([{ q: 'Which soil holds water?', options: ['Clay','Sand'], correct: 0, id: 48213, public_qn: 'G0011.110001' }], 'f');`);
    expect(await p.ev('[S.wr[0].nid, S.wr[0].pqn, S.wr[0].qid, S.wr[0]._streak]')).toEqual([48213, 'G0011.110001', 48213, 2]);
    expect(await p.ev(`Object.keys(JSON.parse(localStorage.getItem('abhyas_qnotes')))`)).toEqual(['q:48213']);
  });

  it('a note from another device under a different key is combined, not lost', async () => {
    await p.ev(`localStorage.setItem('abhyas_qnotes', JSON.stringify({ 'q:48213': 'note A', 'q:G0011.110001': 'note B' })); QNOTE._cache = null;`);
    const t = await p.ev(`QNOTE.get({ uid: 'f_1', nid: 48213, pqn: 'G0011.110001', qid: 48213 })`);
    expect(t).toContain('note A');
    expect(t).toContain('note B');
  });

  it('misses and "seen N times" follow the ids across positions', async () => {
    await p.ev(`S.prog.sessions = [
      { qres: [{ uid: 'f_1', nid: 5, ok: false }, { uid: 'f_9', nid: 5, ok: false }, { uid: 'f_1', nid: 6, ok: true }] },
      { qres: [{ uid: 'f_3', ok: false }] } ];`);
    expect(await p.ev(`WRONGBY.missCount({ uid: 'f_40', nid: 5 })`)).toBe(2);
    expect(await p.ev(`WRONGBY.missCount({ uid: 'f_1', nid: 6 })`)).toBe(0);      // a neighbour is not blamed
    expect(await p.ev(`WRONGBY.missCount({ uid: 'f_3' })`)).toBe(1);              // position-only history still counts
    expect(await p.ev(`QHIST.forUid({ uid: 'f_77', nid: 5 }).seen`)).toBe(2);
  });

  it('the backup file carries both ids, and importing an older backup does not duplicate', async () => {
    await p.ev(`S.wr = [{ uid: 'f_2', nid: 5, pqn: 'G0011.110001', qid: 5, q: 'Stem', _streak: 3 }];`);
    const payload = await p.ev(`DATA._backupPayload()`);
    expect(payload.wr[0]).toMatchObject({ nid: 5, pqn: 'G0011.110001', qid: 5 });
    const out = await p.ev(`(async () => {
      const r = await PSYNC.mergeIn({ wr: [{ uid: 'f_9', qid: 'G0011.110001', q: 'Stem' }], bk: [], fl: [], prog: { sessions: [] }, qnotes: {} }, 'test');
      return { ok: r.ok, n: S.wr.length, streak: S.wr[0]._streak };
    })()`);
    expect(out).toMatchObject({ n: 1, streak: 3 });
  });
});

describe('coverage (which questions you have seen) follows the ids', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  const set = (ids) => ids.map(id => `{ q: 'Question ${id}', options: ['a','b'], correct: 0, id: ${id} }`).join(',');

  it('re-ordering a file does not move "seen" onto other questions', async () => {
    await p.ev(`S.cov = {}; S.wr = []; S.bk = []; S.fl = [];
      const a = normQ([${set([101, 102, 103, 104])}], 'fileX');           // first export
      COV.record([{ uid: 'fileX_1', ok: true, nid: 102, qid: 102 }, { uid: 'fileX_3', ok: false, nid: 104, qid: 104 }]);`);
    expect(await p.ev(`S.cov.fileX.p`)).toBe('0102');
    // re-export: new order, one question inserted at the top
    await p.ev(`normQ([${set([200, 104, 101, 103, 102])}], 'fileX');`);
    expect(await p.ev(`S.cov.fileX.p`)).toBe('02001'.replace('02001', '02001'.length ? '0' + '2' + '0' + '0' + '1' : ''));   // 200:0, 104:2, 101:0, 103:0, 102:1
  });

  it('a file that was already studied before ids existed keeps its bits the first time ids are seen', async () => {
    await p.ev(`S.cov = { fileY: { p: '1020', a: 2, c: 1, t: 1 } }; normQ([${set([301, 302, 303, 304])}], 'fileY');`);
    expect(await p.ev(`S.cov.fileY.p`)).toBe('1020');
    expect(await p.ev(`S.cov.fileY.m['301']`)).toBe('1');
    expect(await p.ev(`S.cov.fileY.m['303']`)).toBe('2');
  });

  it('rebuilding from history uses the ids on each answer, not their old positions', async () => {
    await p.ev(`S.cov = {}; S.prog = { total: 0, correct: 0, sessions: [
      { qres: [{ uid: 'fileZ_0', nid: 501, qid: 501, ok: true }, { uid: 'fileZ_1', nid: 502, qid: 502, ok: false }] } ] };
      COV.rebuildFromSessions();`);
    expect(await p.ev(`S.cov.fileZ.m`)).toEqual({ '501': '1', '502': '2' });
    await p.ev(`normQ([${set([502, 999, 501])}], 'fileZ');`);                 // new order
    expect(await p.ev(`S.cov.fileZ.p`)).toBe('201');
  });
});

describe('a real answered quiz stores the ids everywhere', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('session history, wrong bank, coverage, saved rows and the report all carry nid, pqn, qid and uid', async () => {
    const out = await p.ev(`(async () => {
      S.cov = {}; S.wr = []; S.bk = []; S.fl = []; S.prog = { total: 0, correct: 0, sessions: [] };
      localStorage.removeItem('abhyas_qnotes'); QNOTE._cache = null; WRONGBY._missCache = null; QHIST._cache = null;
      const qs = normQ([
        { q: 'Which soil holds water?', options: ['Clay','Sand'], correct: 0, id: 48213, public_qn: 'G0011.110001' },
        { q: 'Which rock is igneous?',  options: ['Granite','Shale'], correct: 0, id: 48214, public_qn: 'G0011.110002' }
      ], 'fileQ');
      S.quiz = { qs, ans: [1, 0], mode: 'exam', idx: 0, timer: null, elapsed: 0, left: 100, examTotal: 180, warned: [],
                 active: true, ch: 'T', skipped: new Set(), shown: new Set(), scope: null, startedAt: Date.now(), reviewOnly: false };
      REV.trackAnswer(qs[0], false); REV.trackAnswer(qs[1], true);          // answered wrong, then right
      REV.toggle('bk', qs[1]);                                              // starred
      QUIZ._showResults();
      const sess = S.prog.sessions[0] || {};
      const row0 = (sess.qres || [])[0] || {};
      const rep = (typeof USER_REPORT !== 'undefined' && USER_REPORT._body) ? USER_REPORT._body(qs[0], 'typo', 'note') : null;
      return { row0, wr: S.wr[0], bk: S.bk[0], cov: S.cov.fileQ, rep: rep && { uid: rep.uid, qid: rep.qid, nid: rep.nid, pqn: rep.pqn } };
    })()`);
    expect(out.row0).toMatchObject({ uid: 'fileQ_0', nid: 48213, pqn: 'G0011.110001', qid: 48213, ok: false });
    expect(out.wr).toMatchObject({ uid: 'fileQ_0', nid: 48213, pqn: 'G0011.110001', qid: 48213 });
    expect(out.bk).toMatchObject({ uid: 'fileQ_1', nid: 48214, pqn: 'G0011.110002' });
    expect(out.cov.m).toEqual({ '48213': '2', '48214': '1' });
    if (out.rep) expect(out.rep).toEqual({ uid: 'fileQ_0', qid: 48213, nid: 48213, pqn: 'G0011.110001' });
  });
});

describe('cloud sync keeps coverage by id', () => {
  const sg = loadGlobals(['js/core/qkey.js', 'js/core/sync.js'], {});
  it('merging two devices keeps and unions the id map and forces a realign', () => {
    const L = { cov: { f: { p: '1000', a: 1, c: 1, t: 5, m: { '1': '1' } } } };
    const R = { cov: { f: { p: '0200', a: 1, c: 0, t: 9, m: { '9': '2', '1': '2' } } } };
    const m = sg.mergeSyncData(L, R);
    expect(m.cov.f.m).toEqual({ '1': '2', '9': '2' });      // the newer device wins a conflict
    expect(m.cov.f.sig).toBe('');
  });
  it('a record only one side has keeps its id map', () => {
    const m = sg.mergeSyncData({ cov: {} }, { cov: { f: { p: '01', a: 1, c: 1, t: 1, m: { '7': '1' } } } });
    expect(m.cov.f.m).toEqual({ '7': '1' });
  });
});
