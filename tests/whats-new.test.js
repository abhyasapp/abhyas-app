// The What's new section: data integrity, the Settings card, and the one-time bar after an update.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

describe('release list', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('the newest entry is the running version (so shipping cannot forget it)', async () => {
    expect(await p.ev('WHATS_NEW.RELEASES[0].version')).toBe(pkg);
    expect(await p.ev('APP_VERSION')).toBe(pkg);
  });
  it('versions run newest to oldest and every item has an icon, a title and a sentence', async () => {
    const rel = await p.ev('WHATS_NEW.RELEASES');
    const v = rel.map(r => r.version.split('.').map(Number));
    for (let i = 1; i < v.length; i++) expect(v[i - 1][0] * 1000 + v[i - 1][1]).toBeGreaterThan(v[i][0] * 1000 + v[i][1]);
    for (const r of rel) {
      expect(r.title.length).toBeGreaterThan(4);
      expect(r.items.length).toBeGreaterThan(0);
      for (const it of r.items) { expect(it.icon).toMatch(/^ph-/); expect(it.title.length).toBeGreaterThan(3); expect(it.text.length).toBeGreaterThan(10); }
    }
  });
  it('the Settings card lists every release, with the newest open and marked New', async () => {
    await p.ev('WHATS_NEW.render()');
    expect(await p.ev(`document.querySelectorAll('#whats-new-list details').length`)).toBe(await p.ev('WHATS_NEW.RELEASES.length'));
    expect(await p.ev(`document.querySelector('#whats-new-list details').open`)).toBe(true);
    expect(await p.ev(`document.querySelectorAll('#whats-new-list details[open]').length`)).toBe(1);
    expect(await p.ev(`document.querySelector('#whats-new-list details summary').textContent`)).toContain('New');
    expect(await p.ev(`document.getElementById('whats-new-version').textContent`)).toBe('v' + pkg);
  });
});

describe('the one-time bar after an update', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => { await p.ev(`document.getElementById('wn-bar') && document.getElementById('wn-bar').remove(); WHATS_NEW._wired = false;`); });

  it('a brand-new install is not told about changes, and is marked as seen', async () => {
    await p.ev(`localStorage.removeItem(WHATS_NEW.SEEN_KEY); WHATS_NEW.init();`);
    expect(await p.ev(`document.getElementById('wn-bar')`)).toBeNull();
    expect(await p.ev(`localStorage.getItem(WHATS_NEW.SEEN_KEY)`)).toBe(pkg);
  });
  it('after an update it offers the news once, and dismissing marks it seen', async () => {
    await p.ev(`localStorage.setItem(WHATS_NEW.SEEN_KEY, '2.0'); S.user = Object.assign({}, S.user, { token: 't' }); S.quiz = Object.assign({}, S.quiz, { active: false }); WHATS_NEW._showBar();`);
    expect(await p.ev(`document.getElementById('wn-bar').textContent`)).toContain('updated to v' + pkg);
    await p.ev(`document.querySelector('#wn-bar button[aria-label="Dismiss"]').click()`);
    expect(await p.ev(`document.getElementById('wn-bar')`)).toBeNull();
    expect(await p.ev(`localStorage.getItem(WHATS_NEW.SEEN_KEY)`)).toBe(pkg);
  });
  it('already seen: nothing is shown', async () => {
    await p.ev(`localStorage.setItem(WHATS_NEW.SEEN_KEY, APP_VERSION); WHATS_NEW.init();`);
    await new Promise(r => setTimeout(r, 1800));
    expect(await p.ev(`document.getElementById('wn-bar')`)).toBeNull();
  });
  it('"See what\'s new" opens the card and marks the version seen', async () => {
    await p.ev(`localStorage.setItem(WHATS_NEW.SEEN_KEY, '2.0'); WHATS_NEW._showBar(); document.querySelector('#wn-bar button:not([aria-label])').click();`);
    expect(await p.ev(`localStorage.getItem(WHATS_NEW.SEEN_KEY)`)).toBe(pkg);
    expect(await p.ev('UI.cur')).toBe('data');
  });
});
