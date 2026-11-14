// tests/reports-view.test.js — My reports is a tab inside Weak spots, next to
// Misconceptions and Hardest 20, not a separate screen in the sidebar.
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
      UI._goRaw('wrong');
      WRONGBY.tab('reports');
    })()`);
  }, 120000);
  afterAll(() => p && p.close());

  it('shows the reported questions and their send state', () => {
    const text = p.ev("document.getElementById('wr-reports-list').textContent");
    expect(text).toContain('The reported stress question');
    expect(text).toContain('A waiting question');
    expect(text).toContain('Sent');
    expect(text).toContain('Waiting to send');
  });

  it('sits in the Weak spots tab row and hides the miss list', () => {
    expect(p.ev("document.querySelector('#ws-tabs button[data-tab=\"reports\"]').textContent")).toContain('My reports');
    expect(p.ev("document.getElementById('wr-reports-pane').hidden")).toBe(false);
    expect(p.ev("document.getElementById('wr-weak-pane').hidden")).toBe(true);
    expect(p.ev("document.querySelector('#ws-tabs button[data-tab=\"reports\"]').classList.contains('active')")).toBe(true);
  });
});