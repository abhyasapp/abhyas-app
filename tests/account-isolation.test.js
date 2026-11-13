// Signing into a different account on the same device must not inherit the
// previous student's notes, sprint, report queue, attempts or sync state.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('account switching on a shared device', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html');
  }, 120000);
  afterAll(() => p && p.close());

  it('clears the previous student\'s data but keeps device preferences', () => {
    const out = p.ev(`(() => {
      localStorage.clear();
      localStorage.setItem('abhyas_last_user', JSON.stringify('olduser'));
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ q1: 'old note' }));
      localStorage.setItem('abhyas_report_queue', JSON.stringify([{ uid: 'q1', reason: 'typo' }]));
      localStorage.setItem('abhyas_resets', JSON.stringify({ all: 1 }));
      localStorage.setItem('abhyas_last_sync', JSON.stringify({ u: 'olduser', at: 1 }));
      localStorage.setItem('abhyas_weekly_attempts', JSON.stringify({ w1: { score: 10 } }));
      localStorage.setItem('abhyas_theme', 'dark');
      localStorage.setItem('abhyas_lang', 'np');
      localStorage.setItem('abhyas_dl_groups', JSON.stringify(['level7']));

      S.user = { username: 'newuser' };
      S.bk = [{ uid: 'q1' }];
      S.wr = [{ uid: 'q2' }];
      S.weeklyAttempts = { w1: { score: 10 } };
      S.prog = { total: 42, correct: 20, sessions: [{ at: 1 }], bestRun: 5 };
      QNOTE._cache = { q1: 'old note' };
      SPRINT_LOG.addNew('2026-01-01', 7);
      MY_SUBJ._loaded = true;
      MY_SUBJ._items = [{ id: 'old' }];

      AUTH._resetUserScopedLocalDataIfDifferentUser('newuser');
      return {
        qnotes: localStorage.getItem('abhyas_qnotes'),
        reports: localStorage.getItem('abhyas_report_queue'),
        resets: localStorage.getItem('abhyas_resets'),
        lastSync: localStorage.getItem('abhyas_last_sync'),
        attempts: localStorage.getItem('abhyas_weekly_attempts'),
        sprintLog: localStorage.getItem('abhyas_sprint_log'),
        lastUser: JSON.parse(localStorage.getItem('abhyas_last_user') || 'null'),
        theme: localStorage.getItem('abhyas_theme'),
        lang: localStorage.getItem('abhyas_lang'),
        downloads: JSON.parse(localStorage.getItem('abhyas_dl_groups') || '[]'),
        bk: S.bk.length, wr: S.wr.length, prog: S.prog.total,
        weekly: Object.keys(S.weeklyAttempts).length,
        noteCache: QNOTE._cache,
        sprintDays: Object.keys(SPRINT_LOG.days()).length,
        mySubjLoaded: MY_SUBJ._loaded,
        mySubjItems: MY_SUBJ._items.length
      };
    })()`);

    expect(out.qnotes).toBeNull();
    expect(out.reports).toBeNull();
    expect(out.resets).toBeNull();
    expect(out.lastSync).toBeNull();
    expect(out.attempts).toBeNull();
    expect(out.sprintLog).toBeNull();
    expect(out.lastUser).toBe('newuser');
    expect(out.bk).toBe(0);
    expect(out.wr).toBe(0);
    expect(out.prog).toBe(0);
    expect(out.weekly).toBe(0);
    expect(out.noteCache).toBeNull();
    expect(out.sprintDays).toBe(0);
    expect(out.mySubjLoaded).toBe(false);
    expect(out.mySubjItems).toBe(0);

    expect(out.theme).toBe('dark');
    expect(out.lang).toBe('np');
    expect(out.downloads).toEqual(['level7']);
  });

  it('does not clear anything when the same account signs in again', () => {
    const out = p.ev(`(() => {
      localStorage.setItem('abhyas_last_user', JSON.stringify('sameuser'));
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ q1: 'keep me' }));
      AUTH._resetUserScopedLocalDataIfDifferentUser('sameuser');
      return localStorage.getItem('abhyas_qnotes');
    })()`);
    expect(out).toBe(JSON.stringify({ q1: 'keep me' }));
  });
});