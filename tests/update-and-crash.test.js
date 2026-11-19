// Stale-build notice, version display, and operational crash reports.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('stale build visibility', () => {
  it('Settings shows the running version, filled from APP_VERSION', () => {
    expect(read('user.html')).toContain('id="set-app-version"');
    expect(read('js/features/pwa.js')).toMatch(/set-app-version[\s\S]{0,160}APP_VERSION/);
  });
  it('the update notice is a persistent bar with a Reload button, not a vanishing toast', () => {
    const pwa = read('js/features/pwa.js');
    expect(pwa).toContain('pwa-update-bar');
    expect(pwa).toContain('reloadForUpdate');
    expect(pwa).not.toMatch(/toast\('.{0,3}Update ready/);
  });
  it('it never interrupts a quiz, and the app asks for a new build when it returns to the foreground', () => {
    const pwa = read('js/features/pwa.js');
    expect(pwa).toMatch(/S\.quiz && S\.quiz\.active/);
    expect(pwa).toMatch(/visibilitychange[\s\S]{0,200}r\.update\(\)|r && r\.update\(\)/);
  });
});

describe('crash reports cover what actually bit us', () => {
  const cr = read('js/core/crash-report.js');
  it('listens for CSP violations and reports only the origin of what was blocked', () => {
    expect(cr).toContain('securitypolicyviolation');
    expect(cr).toContain('.origin');
  });
  it('reports boot failures from the chapters loader, including ones raised before this file loaded', () => {
    expect(cr).toContain('abhyas:boot-failure');
    expect(cr).toContain('__abhyasBootFailures');
  });
  it('sends a kind so alerts can be set on csp and boot_failure', () => {
    expect(cr).toMatch(/kind:\s*kind \|\| 'error'/);
  });
});
