// Offline report queue: 100 reports, never silently dropped; history follows the qid.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/qkey.js', 'js/report/report-shared.js'], {});
const mk = (i, over) => Object.assign({ uid: 'f_' + i, qid: 'Q' + i, reason: 'typo', note: '' }, over || {});

describe('offline report queue', () => {
  it('holds 100 reports', () => {
    let q = [];
    for (let i = 0; i < 100; i++) q = g.reportQueueAdd(q, mk(i), i + 1);
    expect(q.length).toBe(100);
  });
  it('reports full for a NEW report and does not for a re-report of a queued one', () => {
    let q = [];
    for (let i = 0; i < 100; i++) q = g.reportQueueAdd(q, mk(i), i + 1);
    expect(g.reportQueueIsFull(q, mk(500))).toBe(true);
    expect(g.reportQueueIsFull(q, mk(7))).toBe(false);          // same qid + reason: replaces
    expect(g.reportQueueIsFull(q, mk(7, { reason: 'other' }))).toBe(true);
  });
  it('keys on the qid, so a moved question is the same report', () => {
    let q = g.reportQueueAdd([], mk(1, { uid: 'f_3' }), 1);
    q = g.reportQueueAdd(q, mk(1, { uid: 'f_90', note: 'again' }), 2);
    expect(q.length).toBe(1);
    expect(q[0].note).toBe('again');
  });
  it('a different question reusing the same position is a separate report', () => {
    let q = g.reportQueueAdd([], { uid: 'f_3', qid: 'A', reason: 'typo' }, 1);
    q = g.reportQueueAdd(q, { uid: 'f_3', qid: 'B', reason: 'typo' }, 2);
    expect(q.length).toBe(2);
  });
});

describe('report history follows the permanent id', () => {
  it('updating by report object never touches another question at the same position', () => {
    const list = [
      { uid: 'f_3', qid: 'A', reason: 'typo', status: 'queued' },
      { uid: 'f_3', qid: 'B', reason: 'typo', status: 'queued' },
    ];
    const out = g.reportHistoryUpdate(list, { uid: 'f_3', qid: 'B' }, 'typo', { status: 'sent' });
    expect(out.map(x => x.status)).toEqual(['queued', 'sent']);
  });
  it('legacy string ids still work', () => {
    const list = [{ uid: 'f_1', reason: 'typo', status: 'queued' }];
    expect(g.reportHistoryUpdate(list, 'f_1', 'typo', { status: 'sent' })[0].status).toBe('sent');
  });
});
