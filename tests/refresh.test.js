// Refresh everything: Home header, More menu and Settings -> Data tools.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('wiring', () => {
  const html = read('user.html');
  it('is reachable from the More menu on every screen, and is not a seventh toolbar button', () => {
    expect(html).toMatch(/data-refresh-btn data-on-click="REFRESH\.run\(\)"[^>]*><i class="ph ph-arrows-clockwise"><\/i><span>Refresh everything<\/span>/);
    expect(html).not.toContain('tb-refresh-btn');
  });
  it('the Home header has a labelled refresh button', () => {
    const hero = read('js/features/home-hero.js');
    expect(hero).toContain('data-refresh-btn');
    expect(hero).toContain('data-on-click="REFRESH.run()"');
    expect(hero).toContain("T('Refresh chapters and questions')");
  });
  it('Settings -> Data tools: the Refresh row runs the whole refresh and shows each step in a live region', () => {
    const s = read('js/features/settings-ui.js');
    expect(s).toContain("T('Refresh everything')");
    expect(s).toContain('data-on-click="SETTINGS.refreshQuestions()"');       // the contract the Data tools test relies on
    expect(s).toMatch(/id="refresh-steps" aria-live="polite"/);
    expect(s).toMatch(/REFRESH\.run\(\)/);
  });
  it('the page carries a report panel for the two controls that are not in Settings', () => {
    expect(html).toContain('id="refresh-status"');
    expect(html).toMatch(/<ul id="refresh-status-list" data-refresh-steps aria-live="polite"/);
    expect(html).toContain('data-on-click="REFRESH.hide()"');
  });
  it('shows progress in place: no loading screen is ever raised', () => {
    expect(read('js/features/refresh.js')).not.toMatch(/_showLoader\(/);
  });
  it('is loaded by the page', () => { expect(html).toContain('js/features/refresh.js'); });
});

describe('a refresh you tap yourself does not skip on a weak connection', () => {
  const cache = read('js/features/cache.js');
  it('force bypasses the 10-minute wait AND the weak-connection wait', () => {
    expect(cache).toMatch(/if \(!force && Date\.now\(\) - this\._refreshLastAt/);
    expect(cache).toMatch(/if \(!force && this\._weakConnection\(\)\)/);
  });
});

describe('saved files that are not chapters are never swept away', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());

  it('written-answer bank and study documents are not chapter keys', async () => {
    expect(await p.ev(`[CACHE._isChapterKey('subj_abc'), CACHE._isChapterKey('studydoc:7'), CACHE._isChapterKey('lv7_file1')]`)).toEqual([false, false, true]);
  });
  it('a few missing chapters are cleaned up; a mostly-missing list is treated as damaged and left alone', async () => {
    const out = await p.ev(`(() => {
      const have = new Set(Array.from({ length: 40 }, (_, i) => 'k' + i));
      const few = CACHE.orphanKeys(have, new Map([...have].slice(0, 37).map(k => [k, 1])));
      const most = CACHE.orphanKeys(have, new Map([['k0', 1]]));
      return { few: [few.orphans.length, few.suspicious], most: [most.orphans.length, most.suspicious] };
    })()`);
    expect(out).toEqual({ few: [3, false], most: [39, true] });
  });
  it('a forced refresh updates changed sets, removes a stale chapter, keeps the written-answer bank and study documents, and says what it did', async () => {
    const out = await p.ev(`(async () => {
      S.online = true; S.forcedOffline = false; CACHE._refreshing = false; CACHE._running = false;
      for (const k of await QDB.keys()) await QDB.del(k);
      await QDB.set('chapA', [{ q: 'old A' }]); await QDB.set('chapB', [{ q: 'same B' }]); await QDB.set('gone', [{ q: 'removed chapter' }]);
      await QDB.set('subj_f1', [{ q: 'subjective' }]); await QDB.set('studydoc:9', { base64: 'AAAA' });
      window.ChapterData = window.ChapterData || { levels() { return []; }, chapterName() { return ''; }, allFileRefs() { return []; } };
      const origRefs = ChapterData.allFileRefs, origFetch = QUIZ._fetchFromCDN;
      ChapterData.allFileRefs = () => [{ key: 'chapA', fid: 'A', lv: 'l' }, { key: 'chapB', fid: 'B', lv: 'l' }];
      QUIZ._fetchFromCDN = async (fid) => fid === 'A' ? [{ q: 'new A' }] : [{ q: 'same B' }];
      const r = await CACHE.refreshFromUpdate('manual', { force: true });
      ChapterData.allFileRefs = origRefs; QUIZ._fetchFromCDN = origFetch;
      return { r, keys: (await QDB.keys()).sort(), a: (await QDB.get('chapA'))[0].q };
    })()`);
    expect(out.r).toMatchObject({ updated: 1, added: 0, orphans: 1, failed: 0, total: 2 });
    expect(out.keys).toEqual(['chapA', 'chapB', 'studydoc:9', 'subj_f1']);
    expect(out.a).toBe('new A');
  });
  it('on a weak connection a forced refresh still runs, a background one waits', async () => {
    const out = await p.ev(`(async () => {
      S.online = true; S.forcedOffline = false; CACHE._refreshing = false; CACHE._running = false; CACHE._refreshLastAt = 0;
      const orig = CACHE._weakConnection, op = CACHE._postponeRefresh; let postponed = 0;
      CACHE._weakConnection = () => true; CACHE._postponeRefresh = () => { postponed++; };
      window.ChapterData = window.ChapterData || { levels() { return []; }, chapterName() { return ''; }, allFileRefs() { return []; } };
      const bg = await CACHE.refreshFromUpdate('change');
      const forced = await CACHE.refreshFromUpdate('manual', { force: true });
      CACHE._weakConnection = orig; CACHE._postponeRefresh = op;
      return { bg: bg.skipped, forced: forced.skipped, postponed };
    })()`);
    expect(out.bg).toBe('weak-connection');
    expect(out.forced).not.toBe('weak-connection');
    expect(out.postponed).toBe(1);
  });
});

describe('Refresh everything', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`S.online = true; S.forcedOffline = false; S.quiz = S.quiz || {}; S.quiz.active = false; REFRESH.running = false; REFRESH._lines = [];
                window.__loader = 0; QUIZ._showLoader = () => { window.__loader++; }; 0`);
  });

  it('during a quiz it refuses and says why, and changes nothing', async () => {
    const out = await p.ev(`(async () => { S.quiz.active = true; const r = await REFRESH.run(); S.quiz.active = false;
      return { r, lines: REFRESH._lines.length, running: REFRESH.running }; })()`);
    expect(out).toEqual({ r: false, lines: 0, running: false });
  });
  it('offline it says so instead of failing quietly', async () => {
    const txt = await p.ev(`(async () => { S.online = false; await REFRESH.run(); S.online = true; return REFRESH._lines.map(l => l.text).join(' '); })()`);
    expect(txt).toContain('offline');
  });
  it('online it runs every step in place, reports each in words, and never shows a loading screen', async () => {
    const out = await p.ev(`(async () => {
      window.ChapterDataStatus = { checkNow: async () => {}, status: () => ({ lastCheck: { result: 'new version' }, source: {}, tried: [] }) };
      const orq = DATA.refreshQuestions, occ = DATA.cleanupCache, op = PSYNC.pushNow;
      DATA.refreshQuestions = async () => { DATA._lastRefresh = { skipped: '', added: 1, updated: 2, orphans: 0, failed: 0, total: 5 }; return true; };
      DATA.cleanupCache = async () => ({ stale: 1, stamps: 0, buckets: 2, bytes: 0 });
      PSYNC.pushNow = async () => {};
      S.user = Object.assign({}, S.user, { token: 't' });
      const ok = await REFRESH.run();
      DATA.refreshQuestions = orq; DATA.cleanupCache = occ; PSYNC.pushNow = op;
      return { ok, labels: REFRESH._lines.map(l => l.label), texts: REFRESH._lines.map(l => l.text), states: REFRESH._lines.map(l => l.state),
               dom: document.querySelectorAll('#refresh-steps li').length, loader: window.__loader, running: REFRESH.running };
    })()`);
    expect(out.ok).toBe(true);
    expect(out.labels).toEqual(['Chapters', 'App', 'Questions', 'Progress', 'Tidy']);
    expect(out.texts[0]).toContain('New chapters found');
    expect(out.texts[2]).toContain('2 sets updated');
    expect(out.texts[2]).toContain('1 set added');
    expect(out.texts[4]).toContain('1 broken download');
    expect(out.states).not.toContain('working');
    expect(out.loader).toBe(0);
    expect(out.running).toBe(false);
  });
  it('a step that fails is reported, and the others still run', async () => {
    const out = await p.ev(`(async () => {
      window.ChapterDataStatus = { checkNow: async () => { throw new Error('boom'); }, status: () => ({ lastCheck: {}, source: {}, tried: [] }) };
      const orq = DATA.refreshQuestions;
      DATA.refreshQuestions = async () => { DATA._lastRefresh = { skipped: '', added: 0, updated: 0, orphans: 0, failed: 0, total: 3 }; return true; };
      await REFRESH.run();
      DATA.refreshQuestions = orq;
      return REFRESH._lines.map(l => l.label + ':' + l.state);
    })()`);
    expect(out[0]).toBe('Chapters:warn');
    expect(out).toContain('Questions:ok');
    expect(out).toContain('Tidy:ok');
  });
  it('every Refresh control spins while it works and stops after', async () => {
    const out = await p.ev(`(async () => {
      document.body.insertAdjacentHTML('beforeend', '<button id="rb1" data-refresh-btn></button><button id="rb2" data-refresh-btn></button>');
      REFRESH._busy(true);
      const during = [...document.querySelectorAll('[data-refresh-btn]')].every(b => b.classList.contains('is-busy') && b.getAttribute('aria-busy') === 'true');
      REFRESH._busy(false);
      const after = [...document.querySelectorAll('[data-refresh-btn]')].every(b => !b.classList.contains('is-busy') && b.getAttribute('aria-busy') === 'false');
      return { during, after };
    })()`);
    expect(out).toEqual({ during: true, after: true });
  });
  it('tapped from the Home header or the More menu, every step is visible on screen', async () => {
    const out = await p.ev(`(async () => {
      window.ChapterDataStatus = { checkNow: async () => {}, status: () => ({ lastCheck: { result: 'up to date' }, source: {}, tried: [] }) };
      const orq = DATA.refreshQuestions, occ = DATA.cleanupCache, op = PSYNC.pushNow;
      DATA.refreshQuestions = async () => { DATA._lastRefresh = { skipped: '', added: 1, updated: 0, orphans: 0, failed: 0, total: 4 }; return true; };
      DATA.cleanupCache = async () => ({ stale: 0, stamps: 0, buckets: 0, bytes: 0 });
      PSYNC.pushNow = async () => {};
      S.user = Object.assign({}, S.user, { token: 't' });
      const waitDone = async () => { for (let i = 0; i < 400 && REFRESH.running; i++) await new Promise(r => setTimeout(r, 20)); };
      UI.go('home');                                        // home hero and More menu both live here
      const onHome = !!document.querySelector('#view-home.on');
      const panel = document.getElementById('refresh-status');
      const hiddenAtStart = panel.hidden;

      document.querySelector('#tb-menu-pop [data-refresh-btn]').click();
      const started = REFRESH.running;
      await waitDone();
      const menuItems = [...document.querySelectorAll('#refresh-status-list li')].map(li => li.textContent);
      const shownFromMenu = !panel.hidden;

      REFRESH.hide(); REFRESH._lines = [];                  // same run again, this time from the hero
      const heroBtn = document.querySelector('#home-hero [data-refresh-btn]');
      if (heroBtn) heroBtn.click();
      await waitDone();
      const heroItems = [...document.querySelectorAll('#refresh-status-list li')].map(li => li.textContent);
      const shownFromHero = !panel.hidden;

      UI.go('data');                                        // the card carries the same list there
      const hiddenInSettings = panel.hidden;
      await new Promise(r => setTimeout(r, 400));
      const settingsLi = document.querySelectorAll('#refresh-steps li').length;
      DATA.refreshQuestions = orq; DATA.cleanupCache = occ; PSYNC.pushNow = op;
      return { onHome, started, hiddenAtStart, shownFromMenu, menuItems,
               hasHeroBtn: !!heroBtn, shownFromHero, heroItems, hiddenInSettings, settingsLi, running: REFRESH.running };
    })()`);
    expect(out.onHome).toBe(true);
    expect(out.started).toBe(true);
    expect(out.hiddenAtStart).toBe(true);
    expect(out.running).toBe(false);
    expect(out.shownFromMenu).toBe(true);
    expect(out.menuItems.length).toBe(5);
    expect(out.menuItems.join(' | ')).toMatch(/Chapters: Up to date/);
    expect(out.menuItems.join(' | ')).toMatch(/Tidy: Nothing to clear/);
    expect(out.hasHeroBtn).toBe(true);
    expect(out.shownFromHero).toBe(true);
    expect(out.heroItems.length).toBe(5);
    expect(out.hiddenInSettings).toBe(true);                 // no duplicate list over the card
    expect(out.settingsLi).toBe(5);
  });
  it('it never changes progress, notes or saved questions', async () => {
    const out = await p.ev(`(async () => {
      S.wr = [{ uid: 'f_1', nid: 5, q: 'missed' }]; S.bk = [{ uid: 'f_2', nid: 6, q: 'saved' }];
      QNOTE.set({ uid: 'f_1', nid: 5, qid: 5 }, 'my note');
      const before = JSON.stringify([S.wr, S.bk, localStorage.getItem('abhyas_qnotes')]);
      window.ChapterDataStatus = { checkNow: async () => {}, status: () => ({ lastCheck: { result: 'up to date' }, source: {}, tried: [] }) };
      await REFRESH.run();
      return JSON.stringify([S.wr, S.bk, localStorage.getItem('abhyas_qnotes')]) === before;
    })()`);
    expect(out).toBe(true);
  });
});
