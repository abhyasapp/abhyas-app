// The bundled Public Health questions must merge once, keep their topics and
// source year, and never duplicate a question the server already returned.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const ctx = loadGlobals(['js/data/subjective-seed.js', 'js/features/subj-bank.js']);
const adminCtx = loadGlobals(['js/data/subjective-seed.js', 'js/admin/features/subjective-import.js']);

describe('bundled subjective questions', () => {
  it('adds all 67 Public Health questions across the three topics', () => {
    const byChapter = { publicHealth: [] };
    ctx._mergeSeedQuestions(byChapter);
    const qs = byChapter.publicHealth;
    expect(qs).toHaveLength(67);
    expect(qs.filter(q => q.topic === 'Water Supply')).toHaveLength(30);
    expect(qs.filter(q => q.topic === 'Sanitation / Sewerage')).toHaveLength(23);
    expect(qs.filter(q => q.topic === 'Environment')).toHaveLength(14);
    expect(qs.find(q => q.id === 'seed-ph-san-07').marks).toBe(2.5);
    expect(qs[0].source).toContain('2076/05/13');
    expect(qs[0].marks).toBe(10);
  });

  it('does not duplicate a question already present in the server file', () => {
    const first = ctx.SUBJECTIVE_SEED.publicHealth[0];
    const byChapter = { publicHealth: [{ q: first.q, topic: 'Water Supply', marks: 10 }] };
    ctx._mergeSeedQuestions(byChapter);
    expect(byChapter.publicHealth).toHaveLength(67);
    expect(byChapter.publicHealth.filter(q => q.q === first.q)).toHaveLength(1);
    expect(byChapter.publicHealth[0].source).toBe(first.source);
  });

  it('keeps a single source label on every question', () => {
    const byChapter = {};
    ctx._mergeSeedQuestions(byChapter);
    expect(byChapter.publicHealth.every(q => q.source && /\d{4}\/\d{2}\/\d{2}/.test(q.source))).toBe(true);
  });

  it('reads half marks and exam years without rounding them away', () => {
    expect(ctx._parseMarks(2.5)).toBe(2.5);
    expect(ctx._parseMarks('[2.5]')).toBe(2.5);
    expect(ctx._parseMarks('2.5+2.5=5')).toBe(5);
    expect(ctx._sourceYear('PSC–2080/10/20')).toBe('2080');
    expect(ctx._sourceYear('')).toBe('');
  });

  it('creates server import items in the three topic sections', () => {
    const items = adminCtx.SUBJADMIN.seedItems();
    expect(items).toHaveLength(67);
    expect(new Set(items.map(q => q.topic))).toEqual(new Set(['Water Supply', 'Sanitation / Sewerage', 'Environment']));
    expect(items.find(q => q.question.includes('safe management of wastewater')).marks).toBe(2.5);
    const sections = adminCtx.SUBJADMIN.seedSections();
    expect(sections.map(s => [s.topic, s.items.length])).toEqual([
      ['Water Supply', 30],
      ['Sanitation / Sewerage', 23],
      ['Environment', 14]
    ]);
  });
});