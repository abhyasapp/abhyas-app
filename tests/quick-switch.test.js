// tests/quick-switch.test.js — one searchable sheet should reach every screen
// and the small set of shell actions without adding permanent chrome.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('student quick switch', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 1200 });
    p.ev("document.getElementById('app').classList.add('on')");
  }, 120000);
  afterAll(() => p && p.close());

  it('opens with Ctrl+K and lists destinations plus actions', async () => {
    p.ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))");
    await tick();
    expect(p.ev("document.getElementById('quick-modal').classList.contains('show')")).toBe(true);
    expect(p.ev("document.getElementById('quick-input').getAttribute('aria-expanded')")).toBe('true');
    const labels = p.ev("[...document.querySelectorAll('#quick-list .qi-name')].map(n => n.textContent)");
    expect(labels).toContain('Home');
    expect(labels).toContain('Weak spots');
    expect(labels).toContain('Search questions');
  });

  it('filters in place and opens the selected screen', async () => {
    p.ev(`
      const i = document.getElementById('quick-input');
      i.value = 'weak spots';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    const names = p.ev("[...document.querySelectorAll('#quick-list .qi-name')].map(n => n.textContent)");
    expect(names[0]).toBe('Weak spots');
    p.ev('QUICK.pick(0)');
    await tick();
    expect(p.ev("document.getElementById('quick-modal').classList.contains('show')")).toBe(false);
    expect(p.ev("document.getElementById('view-wrong').classList.contains('on')")).toBe(true);
    expect(p.ev("document.getElementById('quick-input').getAttribute('aria-expanded')")).toBe('false');
  });

  it('closes with Escape and restores the page scroll state', async () => {
    p.ev('QUICK.open()');
    await tick();
    expect(p.ev("document.body.style.overflow")).toBe('hidden');
    p.ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await tick();
    expect(p.ev("document.getElementById('quick-modal').classList.contains('show')")).toBe(false);
    expect(p.ev("document.body.style.overflow")).toBe('');
  });
});
