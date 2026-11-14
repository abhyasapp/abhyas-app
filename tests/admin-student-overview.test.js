// tests/admin-student-overview.test.js — the Student 360 panel.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));

describe('admin: Student 360', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 900 });
    p.ev(`
      ADMIN.creds = { user: 'tester', token: 'tok' };
      ADMIN._perms = { role: 'owner', features: {} };
      ADMIN.data.users = [{
        username: 's1', name: 'Sita Student', status: 'trial',
        trialExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString()
      }];
      ADMIN.data.payments = [];
      ADMIN.data.admins = [];
    `);
  }, 120000);
  afterAll(() => p && p.close());

  it('shows study activity, weak chapters and an at-risk signal', async () => {
    p.ev(`
      USERS._overview = {};
      ADMIN.post = async (action, params) => action === 'adminGetStudentOverview' ? (window.__ovParams = params, {
        success: true,
        study: {
          questionsAnswered: 120, accuracy: 82, streakDays: 4,
          lastActiveAt: new Date(Date.now() - 12 * 86400000).toISOString(),
          minutes: 300, mockPapers: 2,
          weakChapters: [{ name: 'Hydraulics', accuracy: 44, attempted: 20 }]
        },
        reports: { open: 1, total: 2, recent: [] },
        submissions: { pending: 1, graded: 2 }
      }) : { success: false, error: 'unexpected action' };
      USERS.view('s1');
    `);
    await tick();

    const text = p.ev(`document.getElementById('user360').textContent`);
    expect(p.ev(`window.__ovParams.targetUsername`)).toBe('s1');
    expect(text).toContain('120');
    expect(text).toContain('82%');
    expect(text).toContain('No practice for 12 days');
    expect(text).toContain('Hydraulics');
    expect(text).toContain('Watch this student');
  });

  it('falls back cleanly when the backend has no overview action', async () => {
    p.ev(`
      USERS._overview = {};
      ADMIN.post = async () => ({ success: false, error: 'Unknown action' });
      USERS.view('s1');
    `);
    await tick();
    const text = p.ev(`document.getElementById('user360').textContent`);
    expect(text).toContain('not available on this backend yet');
    expect(text).toContain('Account and payment details below are current');
  });
});