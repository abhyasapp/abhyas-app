// tests/ui-shell.test.js — the shared shell should tell assistive technology
// which screen is current and whether the phone menu is open.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

describe('student app shell', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 1200 });
    /* bootPage has no signed-in session, so #app is still hidden. Make it
       visible before testing focus behaviour. */
    p.ev("document.getElementById('app').classList.add('on')");
  }, 120000);
  afterAll(() => p && p.close());

  it('marks the current sidebar page and matching bottom tab', async () => {
    p.ev("UI.go('wrong')");
    await tick();
    expect(p.ev("document.getElementById('nav-wrong').getAttribute('aria-current')")).toBe('page');
    expect(p.ev("document.getElementById('nav-home').hasAttribute('aria-current')")).toBe(false);
    expect(p.ev("document.getElementById('bn-progress').getAttribute('aria-current')")).toBe('page');
    expect(p.ev("document.getElementById('bn-home').hasAttribute('aria-current')")).toBe(false);
  });

  it('reports the mobile menu state and returns focus when it closes', async () => {
    p.ev('UI.sidebarToggle()');
    expect(p.ev("document.getElementById('tb-menu').getAttribute('aria-expanded')")).toBe('true');
    expect(p.ev("document.getElementById('sb').classList.contains('open')")).toBe(true);
    await tick();
    expect(p.ev("document.getElementById('sb').contains(document.activeElement)")).toBe(true);

    p.ev('UI.sidebarClose()');
    expect(p.ev("document.getElementById('tb-menu').getAttribute('aria-expanded')")).toBe('false');
    expect(p.ev("document.getElementById('sb').classList.contains('open')")).toBe(false);
    expect(p.ev('document.activeElement.id')).toBe('tb-menu');
  });

  it('keeps toast messages inside safe areas', () => {
    p.ev("toast('safe area check')");
    const stack = p.w.document.getElementById('toast-stack');
    expect(stack).not.toBeNull();
    expect(stack.style.left).toContain('safe-area-inset-left');
    expect(stack.style.right).toContain('safe-area-inset-right');
  });
});
