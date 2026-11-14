// tests/admin-drafts.test.js — the admin queues each fix as a draft and pushes
// them together. These cover the pure helpers: draft keys, replacement, the
// event shape the Drive-to-Neon pipeline reads, and the "wrong question" check.
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/report/report-shared.js']);

const draft = (over = {}) => ({
  uid: 'fileA_12', qid: 48213, fileId: 'fileA', index: 12,
  reportId: 'r1', reportReason: 'wrong_answer', adminNote: 'per IS 456',
  closeReport: true,
  before: { question: '13. Old stem', options: ['a', 'b', 'c', 'd'] },
  after: { question: 'New stem', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' },
  ...over
});

describe('draft keys', () => {
  it('uses the stable id when the report has one', () => {
    expect(g.adminDraftKey({ uid: 'fileA_12', qid: 48213 })).toBe('q48213');
  });
  it('falls back to the positional uid for old reports', () => {
    expect(g.adminDraftKey({ uid: 'fileA_12' })).toBe('ufileA_12');
    expect(g.adminDraftKey({ uid: 'fileA_12', qid: '' })).toBe('ufileA_12');
  });
  it('same question at a different position is still one draft', () => {
    expect(g.adminDraftKey({ uid: 'fileA_12', qid: 7 })).toBe(g.adminDraftKey({ uid: 'fileB_3', qid: 7 }));
  });
});

describe('adminDraftsUpsert / Remove', () => {
  it('stores a pending draft with a fixed ISO correctedAt', () => {
    const out = g.adminDraftsUpsert([], draft(), Date.UTC(2026, 10, 13, 9, 41));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'q48213', state: 'pending', correctedAt: '2026-11-13T09:41:00.000Z' });
  });
  it('replaces the older draft of the same question instead of stacking', () => {
    let list = g.adminDraftsUpsert([], draft(), 1000);
    list = g.adminDraftsUpsert(list, draft({ after: { question: 'Newer', options: ['a', 'b'], correctIndex: 0, explanation: '' } }), 2000);
    expect(list).toHaveLength(1);
    expect(list[0].after.question).toBe('Newer');
  });
  it('ignores a draft with no way to identify the question', () => {
    expect(g.adminDraftsUpsert([], { before: {}, after: {} }, 1)).toEqual([]);
  });
  it('removes by key', () => {
    const list = g.adminDraftsUpsert(g.adminDraftsUpsert([], draft(), 1), draft({ qid: 2, uid: 'x_1' }), 2);
    expect(g.adminDraftsRemove(list, 'q48213').map(d => d.key)).toEqual(['q2']);
  });
  it('is capped', () => {
    const max = vm.runInContext('ADMIN_DRAFT_MAX', g); // a top-level const, not a global property
    expect(max).toBeGreaterThan(0);
    let list = [];
    for (let i = 0; i < max + 5; i++) list = g.adminDraftsUpsert(list, draft({ qid: i, uid: 'f_' + i }), i + 1);
    expect(list).toHaveLength(max);
  });
});

describe('adminDraftEvent — the shape sync/apply_corrections.py reads', () => {
  const ev = g.adminDraftEvent(g.adminDraftsUpsert([], draft(), Date.UTC(2026, 10, 13))[0]);
  it('carries uid, qid, fileId and the fixed correctedAt', () => {
    expect(ev).toMatchObject({ uid: 'fileA_12', qid: 48213, fileId: 'fileA', correctedAt: '2026-11-13T00:00:00.000Z' });
  });
  it('has before{question,options} and after{question,options,correctIndex,explanation}', () => {
    expect(ev.before).toEqual({ question: '13. Old stem', options: ['a', 'b', 'c', 'd'] });
    expect(ev.after).toEqual({ question: 'New stem', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' });
    expect(ev.expectedQ).toBe('13. Old stem');
  });
  it('uses a null qid for old reports and an integer-only correctIndex', () => {
    const old = g.adminDraftEvent({ ...draft({ qid: undefined }), key: 'ufileA_12', after: { question: 'x', options: ['a', 'b'], correctIndex: '1' } });
    expect(old.qid).toBeNull();
    expect(old.after.correctIndex).toBeNull();
  });
  it('closeReport defaults to true and honours false', () => {
    expect(ev.closeReport).toBe(true);
    expect(g.adminDraftEvent({ ...draft({ closeReport: false }), key: 'k' }).closeReport).toBe(false);
  });
});

describe('questionMatchesSnapshot — detects a reshuffled set', () => {
  it('matches the same question whatever its printed number', () => {
    expect(g.questionMatchesSnapshot('7. What is the unit of stress?', '12. What is the  unit of STRESS?')).toBe(true);
  });
  it('flags a different question sitting at the reported position', () => {
    expect(g.questionMatchesSnapshot('7. Define bearing of a line', '7. What is the unit of stress?')).toBe(false);
  });
  it('does not warn when the student app captured no text', () => {
    expect(g.questionMatchesSnapshot('anything', '')).toBe(true);
  });
  it('treats a truncated snapshot as a prefix', () => {
    const long = 'A'.repeat(300);
    expect(g.questionMatchesSnapshot('1. ' + long, '1. ' + long.slice(0, 120))).toBe(true);
  });
});