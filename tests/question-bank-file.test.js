// tests/question-bank-file.test.js — the offline question-bank export that
// students open from "Open a file". One JSON file per chapter, shaped like
//   { subject, chapter, chapter_id, count, questions: [ {number, id, question,
//     question_image, options: {A..D}, correct_answer: "C", solution} ] }
// The parser has to read that shape as it stands, or the whole file loads empty.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

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

/* Trimmed copy of a real export file (ch187 estimating & costing). */
const FILE = {
  subject: 'General Technical Subject',
  chapter: 'Estimating, Costing and Valuation',
  chapter_id: 187,
  count: 2,
  questions: [
    {
      number: 1, id: 6673,
      question: 'The floor area included the area of the balcony up to ............',
      question_image: null,
      options: { A: '100%', B: '75%', C: '50%', D: '25%' },
      correct_answer: 'C',
      solution: 'The correct answer is C because the floor area includes balconies up to 50%.',
      difficulty: 1,
    },
    {
      number: 2, id: 6750,
      question: 'The expected out turn of brick work in cement mortar in foundation and plinth per mason per day, is ..........',
      question_image: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnO/view',
      options: { A: '1.00 m³', B: '1.25 m³', C: '1.50 m³', D: '1.75 m³' },
      correct_answer: 'B',
      solution: 'A mason lays about 1.25 m³ of brick work per day.',
      difficulty: 2,
    },
  ],
};

describe('the offline question-bank export opens', () => {
  const qs = g.normQ(FILE, 'local');

  it('reads every question in the file, not none', () => {
    expect(qs).toHaveLength(2);
    expect(qs[0].q).toContain('floor area included');
    expect(qs[1].q).toContain('brick work');
  });

  it('reads options published as an object keyed by letter, in that order', () => {
    expect(qs[0].options).toEqual(['100%', '75%', '50%', '25%']);
    expect(qs[1].options).toEqual(['1.00 m³', '1.25 m³', '1.50 m³', '1.75 m³']);
  });

  it('turns correct_answer letters into the option index the quiz marks', () => {
    expect(qs[0].correct).toBe(2);       // "C"
    expect(qs[1].correct).toBe(1);       // "B"
  });

  it('keeps the worked solution as the explanation and the id as the question id', () => {
    expect(qs[0].explanation).toContain('balconies up to 50%');
    expect(qs[0].qid).toBe(6673);
    expect(qs[1].qid).toBe(6750);
  });

  it('shows a question_image, and does not invent one when it is null', () => {
    expect(qs[0].img).toBeFalsy();
    expect(qs[1].img).toBe('https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnO&sz=w1200');
  });

  it('orders lettered options even when the keys arrive unsorted', () => {
    const [item] = g.normQ({ questions: [{
      id: 1, question: 'Pick one', options: { D: 'four', B: 'two', A: 'one', C: 'three' }, correct_answer: 'D',
    }] }, 'local');
    expect(item.options).toEqual(['one', 'two', 'three', 'four']);
    expect(item.correct).toBe(3);
  });

  it('turns exported rich text into the plain text the app prints', () => {
    const [item] = g.normQ({ questions: [{
      id: 9,
      question: '<p>If NPV is \\(+ve\\) then NFV is ...</p>',
      options: { A: '<p>\\(+ve\\)</p>', B: '<p>&nbsp;</p>', C: '<p>0 &amp; more</p>', D: '<p>all of these</p>' },
      correct_answer: 'A',
      solution: '<p>Because &lt;NPV&gt; is positive.</p>',
    }] }, 'local');
    expect(item.q).toBe('If NPV is \\(+ve\\) then NFV is ...');   // maths left for KaTeX
    expect(item.options).toEqual(['\\(+ve\\)', '', '0 & more', 'all of these']);
    expect(item.explanation).toBe('Because <NPV> is positive.');
    expect(item.correct).toBe(0);
  });

  it('leaves plain text exactly as it is', () => {
    const [item] = g.normQ([{ q: 'A wall 3 m high', options: ['1', '2'], correct: 0 }], 'local');
    expect(item.q).toBe('A wall 3 m high');
    expect(item.options).toEqual(['1', '2']);
  });

  it('still reads lettered correct answers written as "B)" or "B."', () => {
    const qs2 = g.normQ([
      { q: 'One', options: ['a', 'b', 'c'], correct_answer: 'B)' },
      { q: 'Two', options: ['a', 'b', 'c'], correct_answer: 'c.' },
    ], 'local');
    expect(qs2[0].correct).toBe(1);
    expect(qs2[1].correct).toBe(2);
  });
});
