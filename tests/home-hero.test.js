// The home hero: greeting, date, streak, accuracy and a one-tap continue.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('home hero', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('shows the name, the streak, the accuracy and a Continue button', async () => {
    const html = await p.ev(`(() => {
      S.user = { name: 'Sita Kumari', username: 'sita', token: 't' };
      S.stk = { days: ['2026-11-20', '2026-11-21', '2026-11-22'], last: '2026-11-22' };
      S.prog = { total: 40, correct: 34, sessions: [{ fid: 'L7-4', lv: 'level7', ch: '4' }] };
      /* jsdom never receives the CDN's chapters-data.js, so install a stub syllabus. */
      if (typeof window.ChapterData === 'undefined') window.ChapterData = { allFileRefs: () => [] };
      ChapterData.allFileRefs = () => [{ fid: 'L7-4', lv: 'level7', ch: '4', key: 'L7-4' }];
      ChapterData.chapterName = () => 'Hydrology';
      HOME_HERO.render();
      return document.getElementById('home-hero').innerHTML;
    })()`);
    expect(html).toContain('Sita');
    expect(html).toContain('3');          // three active days
    expect(html).toContain('85%');        // 34 of 40
    expect(html).toContain('Continue');
    expect(html).toContain('hh-cta');
  });

  it('offers "Pick a chapter" when this device has no history at all', async () => {
    const html = await p.ev(`(() => {
      S.user = { name: 'Sita', token: 't' };
      S.stk = { days: [], last: '' };
      S.prog = { total: 0, correct: 0, sessions: [] };
      HOME_HERO.render();
      return document.getElementById('home-hero').innerHTML;
    })()`);
    expect(html).toContain("UI.go('online')");
    expect(html).not.toContain('Continue');
  });

  it('escapes a name that contains markup', async () => {
    const html = await p.ev(`(() => {
      S.user = { name: '<img src=x onerror=alert(1)>', token: 't' };
      HOME_HERO.render();
      return document.getElementById('home-hero').innerHTML;
    })()`);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
