// tests/question-qid.test.js — the stable question id the app derives from a
// content file. Reports, corrections and progress all key on this value, so it
// must come from the published id and never from the question's position.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

// question.js wires a couple of browser APIs at load time; give it inert
// stand-ins so the normaliser can be exercised without a DOM.
const g = loadGlobals(['js/core/question.js'], {
  document: {
    addEventListener() {},
    querySelector() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
  },
  location: { origin: 'https://example.test' },
  addEventListener() {},
  postMessage() {},
});

const q = (extra = {}) => ({ q: 'Stem', options: ['a', 'b', 'c', 'd'], correct: 0, ...extra });

describe('question identity from content', () => {
  it('prefers the NON-PUBLIC id over the public number, and keeps both', () => {
    const [item] = g.normQ([q({ id: 48213, public_qn: 'G0011.110001' })], 'fileA');
    expect(item.qid).toBe(48213);              // primary = non-public id
    expect(item.nid).toBe(48213);
    expect(item.pqn).toBe('G0011.110001');
  });

  it('keeps the numeric id when no public id is published', () => {
    const [item] = g.normQ([q({ id: 48213 })], 'fileB');
    expect(item.qid).toBe(48213);
  });

  it('accepts a public id carried on id by a --public-qn export', () => {
    const [item] = g.normQ([q({ id: '5002mixedqn10001' })], 'fileC');
    expect(item.qid).toBe('5002mixedqn10001');
  });

  it('accepts a dotted digits-only public id', () => {
    const [item] = g.normQ([q({ public_qn: '50011.110001' })], 'fileD');
    expect(item.qid).toBe('50011.110001');
  });

  it('leaves qid undefined when nothing usable is published', () => {
    const [item] = g.normQ([q({})], 'fileE');
    expect(item.qid).toBeUndefined();
  });

  it('never substitutes the position for an unusable id', () => {
    const [item] = g.normQ([q({ id: 'nonsense' })], 'fileF');
    expect(item.qid).toBeUndefined();
    expect(item.uid).toBe('fileF_0');
  });
});
