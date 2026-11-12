// tests/daily10.test.js — the daily set should remember a streak, prefer
// questions the student has missed, and show a done state instead of vanishing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('Daily 10', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]', waitMs: 1000 });
    p.ev(`
      localStorage.removeItem('abhyas_daily10_done');
      localStorage.removeItem('abhyas_daily10_streak');
      S.cov = { 'a': { a: 1 } };
      S.fcount = { 'a': 10 };
      S.wr = [{ uid: 'a_1' }, { uid: 'a_2' }];
      DAILY10.render();
    `);
    await tick();
  }, 120000);
  afterAll(() => p && p.close());

  it('shows the missed-question count and no streak before the first run', () => {
    const text = p.ev("document.getElementById('daily10-slot').textContent");
    expect(text).toContain('Daily 10');
    expect(text).toContain('2 missed questions included');
    expect(text).not.toContain('day streak');
  });

  it('marks the set done and keeps a visible streak card', async () => {
    p.ev('DAILY10.markDone(); DAILY10.render();');
    await tick();
    const text = p.ev("document.getElementById('daily10-slot').textContent");
    expect(text).toContain('Done today');
    expect(text).toContain('1-day streak');
    expect(p.ev('DAILY10.streak()')).toBe(1);
  });

  it('puts missed questions ahead of the rest of the pool', () => {
    const order = p.ev(`DAILY10._prioritize(
      [{ uid: 'a_1' }, { uid: 'b_2' }, { uid: 'a_3' }],
      new Set(['b_2'])
    ).map(q => q.uid)`);
    expect(order).toEqual(['b_2', 'a_1', 'a_3']);
  });

  it('drops an old streak instead of carrying it forward', () => {
    p.ev("localStorage.setItem('abhyas_daily10_streak', JSON.stringify({ last: '2020-01-01', count: 12 }))");
    expect(p.ev('DAILY10.streak()')).toBe(0);
  });
});
