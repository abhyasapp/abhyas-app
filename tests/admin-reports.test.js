// tests/admin-reports.test.js — reports must be reviewable one level and one
// chapter at a time, even when old reports predate the metadata.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const rows = [
  { id: 'r1', fileId: 'f_l5_survey', status: 'open', reason: 'typo', questionSnapshot: 'Level 5 survey question', reportedBy: 'a', openReporters: 3, reportedAt: Date.now() - 3000 },
  { id: 'r2', fileId: 'f_l5_struct', status: 'open', reason: 'unclear', questionSnapshot: 'Level 5 structure question', reportedBy: 'b', openReporters: 1, reportedAt: Date.now() - 2000 },
  { id: 'r3', fileId: 'f_l7_survey', status: 'open', reason: 'typo', questionSnapshot: 'Level 7 survey question', reportedBy: 'c', openReporters: 2, reportedAt: Date.now() - 1000 },
  { id: 'r4', fileId: 'weekly_123', status: 'open', reason: 'other', questionSnapshot: 'Weekly set question', reportedBy: 'd', openReporters: 1, reportedAt: Date.now() }
];

describe('admin reported-question review', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 1200 });
    p.ev(`
      window.ChapterData = {
        allFileRefs: () => [
          { fid: 'f_l5_survey', lv: 'L5', ch: 'survey' },
          { fid: 'f_l5_struct', lv: 'L5', ch: 'struct' },
          { fid: 'f_l7_survey', lv: 'L7', ch: 'survey' }
        ],
        levelLabel: lv => lv === 'L5' ? 'Level 5' : 'Level 7',
        chapterName: (lv, ch) => ch === 'survey' ? 'Surveying' : 'Structures'
      };
      CHAPTERS._map = null; CHAPTERS._levels = null;
      ADMIN.state.qrPage = 1;
      QREPORTS.filter = 'open';
      QREPORTS.levelFilter = 'all';
      QREPORTS.chapterFilter = 'all';
      QREPORTS.reasonFilter = 'all';
      QREPORTS.sortMode = 'newest';
      QREPORTS.multiOnly = false;
      QREPORTS.searchTerm = '';
      QREPORTS.render(${JSON.stringify(rows)});
    `);
  }, 120000);
  afterAll(() => p && p.close());

  const options = id => [...p.w.document.getElementById(id).options].map(o => o.textContent);
  const cards = () => [...p.w.document.querySelectorAll('#qreports-list .sub-card')];

  it('lists levels and all chapters before filtering', () => {
    expect(options('qreports-level-filter')).toEqual(['All levels', 'Level 5', 'Level 7', 'Other']);
    expect(options('qreports-chapter-filter')).toEqual(['All chapters', 'Structures', 'Surveying', 'Weekly set or unknown']);
    expect(cards()).toHaveLength(4);
  });

  it('scopes chapters to the selected level and shows one chapter at a time', () => {
    p.ev("QREPORTS.setLevelFilter('Level 5')");
    expect(options('qreports-chapter-filter')).toEqual(['All chapters', 'Structures', 'Surveying']);
    expect(cards()).toHaveLength(2);

    p.ev("QREPORTS.setChapterFilter('Surveying')");
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain('Level 5 survey question');
  });

  it('summarises the triage load and surfaces the highest-impact work', () => {
    const summary = p.ev("document.getElementById('qr-summary').textContent");
    expect(summary).toContain('open');
    expect(summary).toContain('multiple reports');
    expect(summary).toContain('Triage highest impact');

    p.ev("QREPORTS.nextOpen()");
    expect(cards()).toHaveLength(4);
    expect(cards()[0].textContent).toContain('3 students');
    expect(p.ev("document.getElementById('qreports-sort').value")).toBe('reported');
  });

  it('only links real Drive ids, never a weekly set or a Storage path', () => {
    expect(p.ev("QREPORTS._driveLink('weekly_1750000000000')")).toBe('');
    expect(p.ev("QREPORTS._driveLink('storage/questions/f_l5_survey.json')")).toBe('');
    expect(p.ev("QREPORTS._driveLink('1AbCdEfGhIjKlMnOpQrStUvWxYz012345')")).toContain('drive.google.com');
  });

  it('offers a direct Google search for every reported question', () => {
    const links = [...p.w.document.querySelectorAll('#qreports-list a[href^="https://www.google.com/search?q="]')];
    expect(links).toHaveLength(4);
    expect(links.every(a => a.target === '_blank' && a.rel === 'noopener')).toBe(true);
    expect(decodeURIComponent(links[0].href)).toContain('Level 5 survey question');
  });

  it('filters to questions with more than one reporter', () => {
    p.ev('QREPORTS.setMulti(true)');
    expect(cards()).toHaveLength(2);
    expect(cards().every((c) => /students/.test(c.textContent))).toBe(true);
  });

  it('resets level, chapter, status and sorting together', () => {
    p.ev('QREPORTS.clearFilters()');
    expect(p.ev("document.getElementById('qreports-level-filter').value")).toBe('all');
    expect(p.ev("document.getElementById('qreports-chapter-filter').value")).toBe('all');
    expect(p.ev("document.getElementById('qreports-sort').value")).toBe('newest');
    expect(p.ev('QREPORTS.multiOnly')).toBe(false);
    expect(cards()).toHaveLength(4);
  });
});
