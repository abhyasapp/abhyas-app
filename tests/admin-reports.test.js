// tests/admin-reports.test.js — reports must be reviewable one level and one
// chapter at a time, even when old reports predate the metadata.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const rows = [
  { id: 'r1', fileId: 'f_l5_survey', status: 'open', reason: 'typo', questionSnapshot: 'Level 5 survey question', reportedBy: 'a', reportedAt: Date.now() },
  { id: 'r2', fileId: 'f_l5_struct', status: 'open', reason: 'unclear', questionSnapshot: 'Level 5 structure question', reportedBy: 'b', reportedAt: Date.now() },
  { id: 'r3', fileId: 'f_l7_survey', status: 'open', reason: 'typo', questionSnapshot: 'Level 7 survey question', reportedBy: 'c', reportedAt: Date.now() },
  { id: 'r4', fileId: 'weekly_123', status: 'open', reason: 'other', questionSnapshot: 'Weekly set question', reportedBy: 'd', reportedAt: Date.now() }
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

  it('resets level, chapter and status together', () => {
    p.ev('QREPORTS.clearFilters()');
    expect(p.ev("document.getElementById('qreports-level-filter').value")).toBe('all');
    expect(p.ev("document.getElementById('qreports-chapter-filter').value")).toBe('all');
    expect(cards()).toHaveLength(4);
  });
});
