// App lock wiring and admin permission hints (the behaviour itself is exercised in
// real Chromium by tools/e2e/applock.py, because jsdom has no Web Crypto).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('app lock', () => {
  const lock = read('js/features/app-lock.js');
  it('stores a salted PBKDF2 hash, never the PIN', () => {
    expect(lock).toContain('PBKDF2');
    expect(lock).toContain('getRandomValues');
    expect(lock).not.toMatch(/setItem\([^)]*\bpin\b/);
  });
  it('is loaded by the app and has a Settings card wired through the dispatcher', () => {
    const html = read('user.html');
    expect(html).toContain('js/features/app-lock.js');
    expect(html).toContain('APPLOCK.enable()');
    expect(html).toContain('APPLOCK.disable()');
    expect(html).not.toMatch(/onclick=/);
  });
  it('is removed on sign-out and when another account signs in', () => {
    const auth = read('js/core/auth.js');
    expect(auth.match(/abhyas_applock/g).length).toBeGreaterThanOrEqual(2);
  });
  it('looks up the user from the stored session, because S.user is not loaded when the lock shows', () => {
    expect(lock).toMatch(/localStorage\.getItem\(k\)/);
  });
  it('forgot-PIN goes through sign-out, and wrong tries back off', () => {
    expect(lock).toContain('AUTH.logout()');
    expect(lock).toContain('_coolUntil');
  });
});

describe('admin permission hints', () => {
  it('a missing permission shows a locked button that names the permission, instead of nothing', () => {
    const core = read('js/admin/core.js');
    expect(core).toContain('lockedBtn(');
    expect(core).toMatch(/needs the/);
    for (const f of ['js/admin/features/users.js', 'js/admin/features/payments.js']) {
      expect(read(f)).toContain('ADMIN.lockedBtn(');
    }
  });
  it('the locked button is disabled and announced to screen readers', () => {
    const core = read('js/admin/core.js');
    expect(core).toMatch(/type="button" disabled aria-disabled="true"/);
  });
});
