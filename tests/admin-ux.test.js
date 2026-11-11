// tests/admin-ux.test.js — regressions for the console-wide hardening pass.
// These boot the real admin page so the static dialog markup, router bindings
// and feature modules are exercised together.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';

describe('admin console UX hardening', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 1200 });
  }, 120000);
  afterAll(() => p && p.close());

  it('opens Change Password from the static dialog markup', () => {
    p.ev('ADMIN.changePassword()');
    expect(p.ev("document.getElementById('ov-pwd').classList.contains('show')")).toBe(true);
    p.ev("MODAL.close('pwd')");
  });

  it('neutralises spreadsheet formulas but keeps real numbers numeric', () => {
    const csv = p.ev(`ADMIN.toCSV(['Name','Score'], [
      ['=HYPERLINK("http://evil")', 12],
      ['+1', -2],
      ['@cmd', 'safe']
    ])`);
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"\'+1"');
    expect(csv).toContain('"\'@cmd"');
    expect(csv).toContain('"12"');
    expect(csv).toContain('"-2"');
  });

  it('adds clearable search fields and keyboard-sortable table headers', () => {
    expect(p.ev("!!document.querySelector('#u-search').closest('.search-wrap')")).toBe(true);
    expect(p.ev("!!document.querySelector('#u-search').closest('.search-wrap').querySelector('.search-clear')")).toBe(true);
    expect(p.ev("document.querySelector('th.sortable').tabIndex")).toBe(0);
    expect(p.ev("document.querySelector('th.sortable').getAttribute('aria-label')")).toMatch(/^Sort by /);
    expect(p.ev("document.querySelector('th').scope")).toBe('col');
  });

  it('includes every content section in the command palette', () => {
    p.ev("ADMIN.creds = { user: 'tester', token: 'tok' }; ADMIN._perms = { role: 'owner', features: {} }; document.getElementById('app').classList.add('on'); PALETTE.open();");
    const labels = p.ev('PALETTE._items.map(i => i.title)');
    expect(labels).toContain('Study PDFs');
    expect(labels).toContain('Q&A splitter');
    p.ev('PALETTE.close()');
  });

  it('does not claim a one-year grant succeeded when it failed', async () => {
    p.ev(`
      ADMIN.creds = { user: 'tester', token: 'tok', expires: Date.now() + 3600000 };
      ADMIN.data.payments = [{ username: 'stu1', status: 'pending' }];
      ADMIN.post = async (action) => action === 'adminReviewPayment'
        ? { success: true }
        : { success: false, error: 'grant refused' };
      ADMIN.refresh = async () => true;
      document.body.insertAdjacentHTML('beforeend',
        '<input id="rej-reason" value=""><select id="grant-duration"><option value="year" selected>Year</option></select>');
      MODAL.confirmReview('stu1', 'verified')
    `);
    await new Promise(r => setTimeout(r, 30));
    const toasts = p.ev("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent)");
    expect(toasts.some(t => /Payment verified, but one-year access could not be granted/.test(t))).toBe(true);
  });
});
