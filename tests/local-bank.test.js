// Open a file: the question-bank picker lists every file the chapter tree holds and opens one
// read-only — no download, no chapter change, no stored data touched.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const REFS = [
  { lv: 'level7', ch: '4', book: '4.1 CONCRETE', subtopic: 'part 1', fid: 'AAA111', key: 'level7_4_4.1 CONCRETE_part 1' },
  { lv: 'level7', ch: '4', book: '4.1 CONCRETE', subtopic: 'part 2', fid: 'BBB222', key: 'level7_4_4.1 CONCRETE_part 2' },
  { lv: 'gk', ch: '1', book: '1.1 GEO&DEMO', subtopic: 'All', fid: 'CCC333', key: 'gk_1_1.1 GEO&DEMO_All' }
];

describe('wiring', () => {
  const html = read('user.html');
  it('the Open a file screen carries a question-bank picker beside the device file', () => {
    expect(html).toContain('id="loc-file"');
    expect(html).toContain('id="loc-bank-file"');
    expect(html).toContain('data-on-input="LOC.fillBank(this.value)"');
    expect(html).toContain('data-on-click="LOC.openBank()"');
    expect(html).toMatch(/data-on-click="LOC.start\('flashcard'\)"/);
  });
});

describe('question-bank files on the Open a file screen', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`(() => {
      window.ChapterData = {
        levels: () => ['level7', 'gk'],
        levelLabel: (lv) => (lv === 'gk' ? 'General Knowledge (shared)' : 'Level 7 — Engineering'),
        chapters: (lv) => (lv === 'gk' ? { '1': 'General Awareness' } : { '4': 'Building Construction Technology' }),
        chapterName: (lv) => (lv === 'gk' ? 'General Awareness' : 'Building Construction Technology'),
        books: () => ({}), files: () => ({}), fileCount: () => 0, chapterFileRefs: () => [],
        allFileRefs: () => ${JSON.stringify(REFS)}
      };
      LOC._refs = null;
      document.getElementById('loc-bank-q').value = '';
      S.localQs = null; S.online = true; S.forcedOffline = false;
      UI.go('local');
      return 0;
    })()`);
  });

  it('lists every file the chapter tree has, grouped by level and chapter', async () => {
    const out = await p.ev(`(() => {
      const sel = document.getElementById('loc-bank-file');
      return {
        groups: [...sel.querySelectorAll('optgroup')].map(g => g.label),
        options: [...sel.querySelectorAll('option')].map(o => o.textContent)
      };
    })()`);
    expect(out.groups).toEqual([
      'Level 7 — Engineering · Building Construction Technology',
      'General Knowledge (shared) · General Awareness'
    ]);
    expect(out.options[0]).toBe('Choose a file…');
    expect(out.options).toContain('4.1 CONCRETE — part 1');
    expect(out.options).toContain('1.1 GEO&DEMO — All');
  });

  it('search narrows the list, and clearing it brings every file back', async () => {
    const out = await p.ev(`(() => {
      LOC.fillBank('concrete');
      const only = [...document.querySelectorAll('#loc-bank-file option')].map(o => o.textContent);
      LOC.fillBank('');
      return { only, all: document.querySelectorAll('#loc-bank-file option').length };
    })()`);
    expect(out.only).toEqual(['Choose a file…', '4.1 CONCRETE — part 1', '4.1 CONCRETE — part 2']);
    expect(out.all).toBe(4);
  });

  it('opens a bank file into the local player and stores nothing', async () => {
    const out = await p.ev(`(async () => {
      const snap = async () => JSON.stringify([(await QDB.keys()).sort(), S.cov || {}, S.prog || {}, localStorage.getItem('abhyas_qts')]);
      const before = await snap();
      const orig = QUIZ._fetchFromCDN; const asked = [];
      QUIZ._fetchFromCDN = async (fid) => { asked.push(fid); return [{ q: 'What is 1 + 1?', options: ['1', '2'], correct: 1 }]; };
      document.getElementById('loc-bank-file').value = 'gk_1_1.1 GEO&DEMO_All';
      await LOC.openBank();
      QUIZ._fetchFromCDN = orig;
      const after = await snap();
      return {
        asked, n: (S.localQs || []).length, first: S.localQs && S.localQs[0].q,
        pr: document.getElementById('loc-pr').disabled, ex: document.getElementById('loc-ex').disabled,
        info: document.getElementById('loc-info').textContent,
        same: before === after
      };
    })()`);
    expect(out.asked).toEqual(['CCC333']);
    expect(out.n).toBe(1);
    expect(out.first).toBe('What is 1 + 1?');
    expect(out.pr).toBe(false);
    expect(out.ex).toBe(false);
    expect(out.info).toContain('General Awareness');
    expect(out.info).toContain('Nothing was saved or changed');
    expect(out.same).toBe(true);        // no download, no coverage, no progress, no timestamp written
  });

  it('reuses the copy already saved on the device instead of fetching it again', async () => {
    const out = await p.ev(`(async () => {
      await QDB.set('level7_4_4.1 CONCRETE_part 1', [{ q: 'Saved on the phone', options: ['a', 'b'], correct: 0 }]);
      const orig = QUIZ._fetchFromCDN; let fetched = 0;
      QUIZ._fetchFromCDN = async () => { fetched++; return []; };
      document.getElementById('loc-bank-file').value = 'level7_4_4.1 CONCRETE_part 1';
      await LOC.openBank();
      QUIZ._fetchFromCDN = orig;
      const out = { fetched, first: S.localQs && S.localQs[0].q, info: document.getElementById('loc-info').textContent };
      await QDB.del('level7_4_4.1 CONCRETE_part 1');
      return out;
    })()`);
    expect(out.fetched).toBe(0);
    expect(out.first).toBe('Saved on the phone');
    expect(out.info).toContain('this device');
  });

  it('offline and not saved it says so and keeps the set already loaded', async () => {
    const out = await p.ev(`(async () => {
      S.online = false; S.forcedOffline = true;
      S.localQs = [{ q: 'previous set' }];
      const orig = QUIZ._fetchFromCDN; let fetched = 0;
      QUIZ._fetchFromCDN = async () => { fetched++; return []; };
      document.getElementById('loc-bank-file').value = 'level7_4_4.1 CONCRETE_part 2';
      await LOC.openBank();
      QUIZ._fetchFromCDN = orig;
      S.online = true; S.forcedOffline = false;
      return { fetched, q: S.localQs[0].q, info: document.getElementById('loc-info').textContent };
    })()`);
    expect(out.fetched).toBe(0);
    expect(out.q).toBe('previous set');
    expect(out.info).toContain('offline');
  });

  it('with nothing chosen it asks for a file and fetches nothing', async () => {
    const out = await p.ev(`(async () => {
      document.getElementById('loc-bank-file').value = '';
      const orig = QUIZ._fetchFromCDN; let fetched = 0;
      QUIZ._fetchFromCDN = async () => { fetched++; return []; };
      await LOC.openBank();
      QUIZ._fetchFromCDN = orig;
      return { fetched };
    })()`);
    expect(out.fetched).toBe(0);
  });
});
