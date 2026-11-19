// tests/report-history.test.js — the student's local report history keeps one
// row per question/reason and updates its send state without losing the text.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/qkey.js', 'js/report/report-shared.js']);

describe('student report history', () => {
  it('adds a queued report with its question and timestamp', () => {
    const out = g.reportHistoryAdd([], {
      uid: 'fileA_3', qid: 42, reason: 'wrong_answer',
      question: 'What is the unit of stress?', section: 'practice'
    }, 1000);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      uid: 'fileA_3', qid: 42, status: 'queued', reportedAt: 1000,
      question: 'What is the unit of stress?'
    });
  });

  it('replaces the old row when the same question is reported for the same reason', () => {
    let list = g.reportHistoryAdd([], { uid: 'f_1', reason: 'typo', question: 'Old' }, 1000);
    list = g.reportHistoryAdd(list, { uid: 'f_1', reason: 'typo', question: 'New' }, 2000);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ question: 'New', reportedAt: 2000, status: 'queued' });
  });

  it('keeps separate rows for different reasons on the same question', () => {
    let list = g.reportHistoryAdd([], { uid: 'f_1', reason: 'typo' }, 1);
    list = g.reportHistoryAdd(list, { uid: 'f_1', reason: 'wrong_answer' }, 2);
    expect(list).toHaveLength(2);
  });

  it('marks a report sent without changing its question', () => {
    const list = g.reportHistoryAdd([], { uid: 'f_1', reason: 'typo', question: 'Stem' }, 1);
    const out = g.reportHistoryUpdate(list, 'f_1', 'typo', { status: 'sent', sentAt: 5 });
    expect(out[0]).toMatchObject({ status: 'sent', sentAt: 5, question: 'Stem' });
  });

  it('does not create a row without a question reference or reason', () => {
    expect(g.reportHistoryAdd([], { reason: 'typo' }, 1)).toEqual([]);
    expect(g.reportHistoryAdd([], { uid: 'f_1' }, 1)).toEqual([]);
  });

  it('keys a public qid report separately from a uid report with the same reason', () => {
    let list = g.reportHistoryAdd([], { uid: 'f_1', reason: 'typo' }, 1);
    list = g.reportHistoryAdd(list, { uid: 'f_1', qid: '5-aaa-001-000012', reason: 'typo' }, 2);
    expect(list).toHaveLength(2);
  });

  it('updates a row addressed by its public qid', () => {
    const list = g.reportHistoryAdd([], { uid: 'f_1', qid: '5-aaa-001-000012', reason: 'typo', question: 'Stem' }, 1);
    const out = g.reportHistoryUpdateQid(list, '5-aaa-001-000012', 'typo', { status: 'sent', sentAt: 5 });
    expect(out[0]).toMatchObject({ status: 'sent', sentAt: 5, question: 'Stem' });
  });
});

describe('offline report queue', () => {
  it('queues a report that carries only a public qid', () => {
    const out = g.reportQueueAdd([], { qid: '5-aaa-001-000012', reason: 'typo' }, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ qid: '5-aaa-001-000012', reason: 'typo' });
  });

  it('dedupes the same question and reason across its qid and its uid', () => {
    let q = g.reportQueueAdd([], { uid: 'f_1', qid: '5-aaa-001-000012', reason: 'typo' }, 1);
    q = g.reportQueueAdd(q, { uid: 'f_1', qid: '5-aaa-001-000012', reason: 'typo', note: 'again' }, 2);
    expect(q).toHaveLength(1);
    expect(q[0].note).toBe('again');
  });

  it('removes a sent report keyed by its qid', () => {
    const q = g.reportQueueAdd([], { qid: '5-aaa-001-000012', reason: 'typo' }, 1);
    expect(g.reportQueueRemove(q, { qid: '5-aaa-001-000012', reason: 'typo' })).toHaveLength(0);
  });

  it('still removes a legacy uid-only report', () => {
    const q = g.reportQueueAdd([], { uid: 'f_1', reason: 'typo' }, 1);
    expect(g.reportQueueRemove(q, { uid: 'f_1', reason: 'typo' })).toHaveLength(0);
  });
});