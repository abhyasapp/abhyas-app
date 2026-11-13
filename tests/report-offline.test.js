// tests/report-offline.test.js — every report is committed to the device
// before any network attempt, and a failed send stays queued for retry.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const Q = {
  uid: 'fastfile1234567890_4',
  fileId: 'fastfile1234567890',
  q: 'Which option is correct?',
  options: ['First', 'Second', 'Third', 'Fourth'],
  correct: 1
};

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('offline-first question reports', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 900 });
    p.ev(`
      localStorage.removeItem('abhyas_report_queue');
      S.user = { username: 'report_tester', token: 'test-token' };
      S.online = true; S.forcedOffline = false;
    `);
  }, 120000);
  afterAll(() => p && p.close());

  it('saves while offline and does not call the server', async () => {
    const out = await p.ev(`(() => {
      window.__reportCalls = [];
      S.online = false;
      USER_REPORT.openSheet(${JSON.stringify(Q)}, { section: 'practice', chosen: 2 });
      document.getElementById('qr-reason').value = 'wrong_answer';
      document.getElementById('qr-note').value = 'The marked answer looks wrong.';
      return USER_REPORT.submit().then(() => ({
        queue: JSON.parse(localStorage.getItem('abhyas_report_queue') || '[]'),
        calls: window.__reportCalls.length
      }));
    })()`);
    expect(out.calls).toBe(0);
    expect(out.queue).toHaveLength(1);
    expect(out.queue[0]).toMatchObject({ uid: Q.uid, reason: 'wrong_answer', chosen: 2 });
  });

  it('warns when the same question is already reported on this device', () => {
    p.ev(`
      localStorage.setItem('abhyas_report_queue', JSON.stringify([{ uid: ${JSON.stringify(Q.uid)}, reason: 'typo', note: '' }]));
      USER_REPORT.openSheet(${JSON.stringify(Q)}, { section: 'practice' });
    `);
    expect(p.ev("document.getElementById('mbody').textContent")).toContain('already reported this question');
  });

  it('keeps the report queued when the server rejects the send', async () => {
    p.ev(`
      S.online = true; S.forcedOffline = false;
      localStorage.removeItem('abhyas_report_queue');
      window.fetch = async (u, o) => {
        window.__reportCalls = (window.__reportCalls || []).concat([{ url: String(u), body: o && o.body }]);
        const body = { success: false, error: 'temporary server problem' };
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, clone() { return this; }, json: async () => body, text: async () => JSON.stringify(body) };
      };
      USER_REPORT.openSheet(${JSON.stringify(Q)}, { section: 'practice', chosen: 2 });
      document.getElementById('qr-reason').value = 'typo';
    `);
    await p.ev('USER_REPORT.submit()');
    await tick(250);
    const queue = p.ev("JSON.parse(localStorage.getItem('abhyas_report_queue') || '[]')");
    expect(queue).toHaveLength(1);
    expect(queue[0].reason).toBe('typo');
    expect(p.ev("(window.__reportCalls || []).some(x => String(x.body || '').includes('reportQuestion'))")).toBe(true);
  });

  it('removes the report only after the server accepts it', async () => {
    p.ev(`
      localStorage.removeItem('abhyas_report_queue');
      window.fetch = async () => {
        const body = { success: true, message: 'Thanks' };
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, clone() { return this; }, json: async () => body, text: async () => JSON.stringify(body) };
      };
      USER_REPORT.openSheet(${JSON.stringify(Q)}, { section: 'exam', chosen: 1 });
      document.getElementById('qr-reason').value = 'unclear';
    `);
    await p.ev('USER_REPORT.submit()');
    await tick(250);
    expect(p.ev("JSON.parse(localStorage.getItem('abhyas_report_queue') || '[]')")).toHaveLength(0);
  });
});
