// tests/reports-view.test.js — the student can review the reports this device
// kept, with the question text and whether each one reached the server.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('student reports view', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { waitMs: 1200 });
    p.ev(`(() => {
      localStorage.setItem('abhyas_report_history_v1', JSON.stringify([
        { uid: 'f_3', qid: 42, reason: 'wrong_answer', question: 'The reported stress question', section: 'practice', reportedAt: Date.now() - 60000, status: 'sent', sentAt: Date.now() - 59000 },
        { uid: 'f_9', reason: 'typo', question: 'A waiting question', section: 'exam', reportedAt: Date.now(), status: 'queued' }
      ]));
      UI._goRaw('reports');
    })()`);
  }, 120000);
  afterAll(() => p && p.close());

  it('shows the reported questions and their send state', () => {
    const text = p.ev("document.getElementById('reports-body').textContent");
    expect(text).toContain('The reported stress question');
    expect(text).toContain('A waiting question');
    expect(text).toContain('Sent');
    expect(text).toContain('Waiting to send');
  });

  it('opens from the Review navigation group', () => {
    expect(p.ev("document.getElementById('nav-reports').textContent")).toContain('My reports');
    expect(p.ev("document.getElementById('view-reports').classList.contains('on')")).toBe(true);
  });
});