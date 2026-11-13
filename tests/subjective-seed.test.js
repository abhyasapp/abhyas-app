// The bundled Public Health questions must merge once, keep their topics and
// source year, and never duplicate a question the server already returned.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const ctx = loadGlobals(['js/data/subjective-seed.js', 'js/features/subj-bank.js']);

describe('bundled subjective questions', () => {
  it('adds all 67 Public Health questions across the three topics', () => {
    const byChapter = { publicHealth: [] };
    ctx._mergeSeedQuestions(byChapter);
    const qs = byChapter.publicHealth;
    expect(qs).toHaveLength(67);
    expect(qs.filter(q => q.topic === 'Water Supply')).toHaveLength(30);
    expect(qs.filter(q => q.topic === 'Sanitation / Sewerage')).toHaveLength(23);
    expect(qs.filter(q => q.topic === 'Environment')).toHaveLength(14);
    expect(qs[0].source).toContain('2076/05/13');
    expect(qs[0].marks).toBe(10);
  });

  it('does not duplicate a question already present in the server file', () => {
    const first = ctx.SUBJECTIVE_SEED.publicHealth[0];
    const byChapter = { publicHealth: [{ q: first.q, topic: 'Water Supply', marks: 10 }] };
    ctx._mergeSeedQuestions(byChapter);
    expect(byChapter.publicHealth).toHaveLength(67);
    expect(byChapter.publicHealth.filter(q => q.q === first.q)).toHaveLength(1);
  });

  it('keeps a single source label on every question', () => {
    const byChapter = {};
    ctx._mergeSeedQuestions(byChapter);
    expect(byChapter.publicHealth.every(q => q.source && /\d{4}\/\d{2}\/\d{2}/.test(q.source))).toBe(true);
  });
});