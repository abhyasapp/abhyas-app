// tests/bottom-nav.test.js — the phone bottom bar (Home / Practice / Written /
// Progress / More) has to open its sheet and its rows have to move the app.
// The rows are data-on-click handlers, and js/core/actions.js is a safe
// interpreter with no function expressions: a handler it cannot parse is
// dropped silently, which is exactly how the bottom bar once went dead.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const tick = (ms = 350) => new Promise(r => setTimeout(r, ms));

describe('Phone bottom bar', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply, waitMs: 800 });
  }, 120000);
  afterAll(() => p && p.close());

  it('opens a sheet for each tab, with rows the handler parser can run', () => {
    const tabs = p.ev(`
      ['study', 'subjective', 'progress', 'more'].map(key => {
        BN.open(key);
        const rows = [...document.querySelectorAll('#bn-sheet-grid .bn-sheet-item')];
        const handlers = rows.map(b => b.getAttribute('data-on-click') || '');
        BN.close();
        return { key, rows: rows.length, handlers };
      })
    `);
    expect(tabs.map(t => t.key)).toEqual(['study', 'subjective', 'progress', 'more']);
    tabs.forEach(t => {
      expect(t.rows).toBeGreaterThan(0);
      t.handlers.forEach(h => {
        /* No function expressions: the parser stops at `function(` and the
           whole tap is discarded at click time. */
        expect(h).not.toContain('function(');
        expect(h).toMatch(/^BN\.(go|tour)\(/);
      });
    });
    expect(tabs[0].handlers[0]).toBe("BN.go('online')");
  });

  it('a tapped row closes the sheet and opens that screen', async () => {
    p.ev(`BN.open('study')`);
    await tick(100);
    expect(p.ev(`document.getElementById('bn-sheet').classList.contains('show')`)).toBe(true);

    p.ev(`document.querySelector('#bn-sheet-grid .bn-sheet-item').click()`);
    await tick(400);

    expect(p.ev(`document.getElementById('bn-sheet').classList.contains('show')`)).toBe(false);
    expect(p.ev(`(document.querySelector('.view.on') || {}).id`)).toBe('view-online');
    expect(p.ev(`document.body.style.overflow`)).toBe('');
  });

  it('the how-it-works row opens the tour from the Tools sheet', async () => {
    expect(p.ev(`typeof BN.tour`)).toBe('function');
    p.ev(`
      BN.open('more');
      const tourRow = [...document.querySelectorAll('#bn-sheet-grid .bn-sheet-item')]
        .find(b => b.getAttribute('data-on-click') === 'BN.tour()');
      tourRow.click();
    `);
    await tick(400);
    expect(p.ev(`!!document.getElementById('tut-modal')`)).toBe(true);
    p.ev(`document.getElementById('tut-modal').remove()`);
  });
});
