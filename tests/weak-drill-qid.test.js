// tests/weak-drill-qid.test.js — the weak drill must recognise a wrong answer
// after the set it came from is re-exported. The stored row keeps its qid but
// its uid is positional and changes, so matching on uid alone reported "no
// wrong answers yet" while the list was full.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/features/mixed-practice.js'], {
  S: { wr: [] },
  ChapterData: { chapters: () => ({}), fileCount: () => 0 },
  QUIZ: {},
  document: { getElementById: () => null, addEventListener() {} },
  addEventListener() {},
  localStorage: { getItem: () => null, setItem() {} },
});

const wr = [
  { uid: 'fileA_4', qid: 48213, q: 'old position, numeric id' },
  { uid: 'fileB_9', qid: 'G0011.110001', q: 'public id' },
  { uid: 'fileC_2', q: 'legacy row, position only' },
  { uid: 'fileD_0', qid: 7, _withdrawn: true },
];

describe('weak drill membership', () => {
  const keys = g.weakKeys(wr);

  it('matches by public qid even when the position moved', () => {
    expect(g.isWeakQuestion({ uid: 'fileZ_31', qid: 48213 }, keys)).toBe(true);
    expect(g.isWeakQuestion({ uid: 'fileZ_0', qid: 'G0011.110001' }, keys)).toBe(true);
  });

  it('still matches a legacy row by position', () => {
    expect(g.isWeakQuestion({ uid: 'fileC_2' }, keys)).toBe(true);
  });

  it('does not match an unrelated question', () => {
    expect(g.isWeakQuestion({ uid: 'fileX_1', qid: 999 }, keys)).toBe(false);
    expect(g.isWeakQuestion({ uid: 'fileY_2' }, keys)).toBe(false);
  });

  it('ignores a withdrawn row', () => {
    expect(g.isWeakQuestion({ uid: 'fileD_0', qid: 7 }, keys)).toBe(false);
  });
});
