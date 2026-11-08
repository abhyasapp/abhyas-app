// The results screen used to do this arithmetic inline. It now calls scorePaper,
// so negative marking and the cut-off can be checked without a DOM.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/format.js', 'js/core/loksewa.js']);
const { scorePaper, loksewaScore, isLoksewaFormat } = g;

const q = (correct) => ({ correct });
// Every question's correct option is 0; answering 1 is wrong, null is skipped.
const fill = (correctN, wrongN, skippedN) => {
  const qs = [], ans = [];
  for (let i = 0; i < correctN; i++) { qs.push(q(0)); ans.push(0); }
  for (let i = 0; i < wrongN; i++) { qs.push(q(0)); ans.push(1); }
  for (let i = 0; i < skippedN; i++) { qs.push(q(0)); ans.push(null); }
  return { qs, ans };
};

describe('scorePaper — counting', () => {
  it('splits correct, wrong and blank answers', () => {
    const qs = [q(0), q(1), q(2), q(3), q(0)];
    const ans = [0, 1, 0, null, undefined];
    const r = scorePaper(ans, qs, {});
    expect(r).toMatchObject({ total: 5, correct: 2, wrong: 1, skipped: 2, rawPct: 40, pct: 40 });
    expect(r.loksewa).toBe(null);
  });
  it('treats missing answers as skipped, not wrong', () => {
    const r = scorePaper([], [q(0), q(1), q(2)], {});
    expect(r).toMatchObject({ total: 3, correct: 0, wrong: 0, skipped: 3, pct: 0 });
  });
  it('ignores extra answers beyond the paper', () => {
    const r = scorePaper([0, 0, 0, 0], [q(0), q(0)], {});
    expect(r.total).toBe(2);
    expect(r.correct).toBe(2);
  });
  it('compares string option indices like the numbers they are', () => {
    const r = scorePaper(['2', '1', 0], [q(2), q(1), q(0)], {});
    expect(r.correct).toBe(3);
  });
  it('handles an empty paper without dividing by zero', () => {
    const r = scorePaper([], [], { weeklyId: 'w1' });
    expect(r).toMatchObject({ total: 0, correct: 0, wrong: 0, skipped: 0, rawPct: 0, pct: 0 });
    expect(r.loksewa).toBe(null);
  });
});

describe('scorePaper — Loksewa negative marking', () => {
  it('charges 0.2 per wrong answer and leaves skipped questions free', () => {
    const { qs, ans } = fill(6, 3, 1);
    const r = scorePaper(ans, qs, { weeklyId: 'w1' });
    expect(r.loksewa.score).toBeCloseTo(5.4, 10);
    expect(r.loksewa.pct).toBe(54);
    expect(r.pct).toBe(54);
    expect(r.rawPct).toBe(60);                 // plain accuracy is still reported separately
  });
  it('passes at exactly the 40% cut-off', () => {
    const { qs, ans } = fill(5, 5, 0);
    const r = scorePaper(ans, qs, { loksewaMock: true });
    expect(r.loksewa.score).toBe(4);
    expect(r.loksewa.cutOff).toBe(4);
    expect(r.loksewa.passed).toBe(true);
  });
  it('fails just under the cut-off', () => {
    const { qs, ans } = fill(5, 6, 0);         // 5 − 1.2 = 3.8 of 11 (34.5%)
    const r = scorePaper(ans, qs, { hourlySprint: true });
    expect(r.loksewa.score).toBeCloseTo(3.8, 10);
    expect(r.loksewa.passed).toBe(false);
  });
  it('never shows a negative percentage on the ring, but keeps the real score', () => {
    const { qs, ans } = fill(0, 10, 0);
    const r = scorePaper(ans, qs, { weeklyId: 'w1' });
    expect(r.loksewa.score).toBe(-2);
    expect(r.loksewa.pct).toBe(-20);
    expect(r.pct).toBe(0);
    expect(r.loksewa.passed).toBe(false);
  });
  it('all-skipped earns nothing and loses nothing', () => {
    const { qs, ans } = fill(0, 0, 10);
    const r = scorePaper(ans, qs, { weeklyId: 'w1' });
    expect(r.loksewa.score).toBe(0);
    expect(r.loksewa.pct).toBe(0);
    expect(r.loksewa.passed).toBe(false);
  });
  it('plain practice is scored on accuracy, with no penalty', () => {
    const { qs, ans } = fill(7, 3, 0);
    const r = scorePaper(ans, qs, {});
    expect(r.pct).toBe(70);
    expect(r.loksewa).toBe(null);
  });
});

describe('Loksewa helpers', () => {
  it('recognises the three Loksewa scopes', () => {
    expect(isLoksewaFormat({ weeklyId: 'w1' })).toBe(true);
    expect(isLoksewaFormat({ loksewaMock: { id: 1 } })).toBe(true);
    expect(isLoksewaFormat({ hourlySprint: true })).toBe(true);
    expect(isLoksewaFormat({})).toBe(false);
    expect(isLoksewaFormat(null)).toBe(false);
  });
  it('loksewaScore rounds to one decimal of a percent and assumes out-of marks', () => {
    const s = loksewaScore(30, 10, 50);
    expect(s.score).toBe(28);
    expect(s.pct).toBe(56);
    expect(s.cutOff).toBe(20);
    expect(s.passed).toBe(true);
  });
});
