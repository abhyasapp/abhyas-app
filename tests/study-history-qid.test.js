// tests/study-history-qid.test.js — per-question study history must follow the
// stable qid, so a re-export that renumbers uid does not lose it, and a lookup
// made by qid finds what was recorded under uid (and the other way round).
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const S = {
  prog: {
    sessions: [
      {
        qres: [
          { uid: 'fileA_0', qid: 48213, ok: false },
          { uid: 'fileA_0', qid: 48213, ok: true },
          // Same question after a re-export: new position, same public id.
          { uid: 'fileZ_9', qid: 48213, ok: false },
          // Legacy row with no qid at all.
          { uid: 'fileC_2', ok: false },
        ],
      },
    ],
  },
};

// These two scripts attach to UI objects at load time; the indexes under test
// only need the shared state, so stand the rest in inertly.
const g = loadGlobals(['js/features/quiz-extras.js', 'js/features/wrong-bank-ui.js'], {
  S,
  QUIZ: {},
  REV: { renderList() {} },
  QNOTE: {},
  ChapterData: { allFileRefs: () => [], find: () => null },
  $: () => null,
  toast() {},
  shuf: a => a,
  today: () => '2026-01-01',
  esc: s => String(s),
  escAttrJs: s => String(s),
  fidFromUid: uid => String(uid).split('_')[0],
  _save() {},
  document: { getElementById: () => null, addEventListener() {}, querySelector() { return null; } },
  addEventListener() {},
});

describe('per-question study history', () => {
  it('counts one record per question across a renumbering', () => {
    const rec = g.QHIST.forUid(48213);
    expect(rec).toMatchObject({ seen: 3, correct: 1 });
  });

  it('still finds the same record by its old positional uid', () => {
    expect(g.QHIST.forUid('fileA_0')).toMatchObject({ seen: 3, correct: 1 });
    expect(g.QHIST.forUid('fileZ_9')).toMatchObject({ seen: 3, correct: 1 });
  });

  it('counts misses per question, by qid and by either uid', () => {
    expect(g.WRONGBY.missCount(48213)).toBe(2);
    expect(g.WRONGBY.missCount('fileA_0')).toBe(2);
    expect(g.WRONGBY.missCount('fileZ_9')).toBe(2);
  });

  it('keeps a legacy position-only question working', () => {
    expect(g.WRONGBY.missCount('fileC_2')).toBe(1);
    expect(g.QHIST.forUid('fileC_2')).toMatchObject({ seen: 1, correct: 0 });
  });

  it('returns nothing for a question never answered', () => {
    expect(g.WRONGBY.missCount(99999)).toBe(0);
    expect(g.QHIST.forUid(99999)).toBeNull();
  });
});
