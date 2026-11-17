// Fields are never autofilled, except sign-in/sign-up credentials.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('no autofill', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('existing text fields and textareas get autocomplete=off', async () => {
    const bad = await p.ev(`[...document.querySelectorAll('input[type=text],input[type=search],input[type=number],textarea')]
      .filter(e => !e.matches('[data-allow-autofill]') && e.getAttribute('autocomplete') !== 'off').map(e => e.id || e.className)`);
    expect(bad).toEqual([]);
  });

  it('fields built later (sheets, modals, note editors) are covered too', async () => {
    await p.ev(`document.body.insertAdjacentHTML('beforeend', '<div><input id="t-a" type="text"><textarea id="t-b"></textarea></div>')`);
    await new Promise(r => setTimeout(r, 50));
    expect(await p.ev(`document.getElementById('t-a').getAttribute('autocomplete')`)).toBe('off');
    expect(await p.ev(`document.getElementById('t-b').getAttribute('autocorrect')`)).toBe('off');
  });

  it('password fields and opted-in fields keep their autofill', async () => {
    await p.ev(`document.body.insertAdjacentHTML('beforeend', '<input id="t-p" type="password" autocomplete="current-password"><input id="t-k" type="text" data-allow-autofill autocomplete="email">')`);
    await new Promise(r => setTimeout(r, 50));
    expect(await p.ev(`document.getElementById('t-p').getAttribute('autocomplete')`)).toBe('current-password');
    expect(await p.ev(`document.getElementById('t-k').getAttribute('autocomplete')`)).toBe('email');
  });
});
