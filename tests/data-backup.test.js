// A downloaded backup must include the things a student cannot rebuild:
// saved notes and the 60-day sprint history, not just quiz totals.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('downloaded backup payload', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html');
  }, 120000);
  afterAll(() => p && p.close());

  it('includes notes, sprint history and reset history', () => {
    const out = p.ev(`(() => {
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ q1: 'remember this' }));
      localStorage.setItem('abhyas_resets', JSON.stringify({ wr: 123 }));
      SPRINT_LOG.addNew('2026-01-01', 9);
      const data = DATA._backupPayload();
      return {
        note: data.qnotes && data.qnotes.q1,
        sprintDay: data.sprintLog && data.sprintLog.days && data.sprintLog.days['2026-01-01'],
        reset: data.resets && data.resets.wr,
        hasWeekly: !!data.weeklyAttempts,
        hasTimetable: !!data.tt,
        exportedAt: data.exportedAt
      };
    })()`);
    expect(out.note).toBe('remember this');
    expect(out.sprintDay.newSeen).toBe(9);
    expect(out.reset).toBe(123);
    expect(out.hasWeekly).toBe(true);
    expect(out.hasTimetable).toBe(true);
    expect(typeof out.exportedAt).toBe('string');
  });

  it('restores those notes and sprint days from the backup', async () => {
    const out = await p.ev(`(async () => {
      QNOTE._cache = null;
      await DATA._applyImport({
        qnotes: { q9: 'restored note' },
        sprintLog: { v: 1, days: { '2026-02-02': { ts: 1, q: 4, c: 3, w: 1, sk: 0, sec: 0, ses: 1, newSeen: 4, kinds: {}, mocks: [], byCh: {}, planned: { new: 4 } } }, base: null },
        resets: {}
      });
      return { note: QNOTE.get('q9'), day: SPRINT_LOG.days()['2026-02-02'] && SPRINT_LOG.days()['2026-02-02'].newSeen };
    })()`);
    expect(out.note).toBe('restored note');
    expect(out.day).toBe(4);
  });
});