// The browse list must use the real source, year, marks and attempt filters,
// not just chapter and search text.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('subjective question filters', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { waitMs: 1300 });
    await p.ev(`(async () => {
      if (typeof SUBJ !== 'undefined' && !SUBJ.ready()) await SUBJ.init();
      localStorage.removeItem('abhyas_subj_attempted_v1');
      S.user = { username: 'filter_tester', token: 'test-token' };
      SUBJ._listFilter = { query:'', chapter:'', year:'', status:'', marks:'' };
      _renderList();
    })()`);
  }, 120000);
  afterAll(() => p && p.close());

  it('shows the exam source under the question', async () => {
    const text = await p.ev(`document.getElementById('subj-list-body').textContent`);
    expect(text).toContain('2076/05/13');
    expect(text).toContain('2.5M');
  });

  it('filters by exam year and by marks', async () => {
    const out = await p.ev(`(() => {
      const year = document.getElementById('subj-list-year');
      year.value = '2080'; SUBJ._filterList();
      const years = document.querySelectorAll('.subj-q-row').length;
      const only2080 = Array.from(document.querySelectorAll('.qsrc')).every(el => el.textContent.includes('2080'));
      const marks = document.getElementById('subj-list-marks');
      marks.value = '2.5'; SUBJ._filterList();
      const half = document.querySelectorAll('.subj-q-row').length;
      return { years, only2080, half };
    })()`);
    expect(out.years).toBeGreaterThan(0);
    expect(out.only2080).toBe(true);
    expect(out.half).toBe(1);
  });

  it('separates attempted questions from the rest and clears all filters', async () => {
    const out = await p.ev(`(() => {
      _markSubjAttempted('seed-ph-ws-01');
      document.getElementById('subj-list-year').value = '';
      document.getElementById('subj-list-marks').value = '';
      const status = document.getElementById('subj-list-status');
      status.value = 'attempted'; SUBJ._filterList();
      const attempted = document.querySelectorAll('.subj-q-row').length;
      status.value = 'unseen'; SUBJ._filterList();
      const unseen = document.querySelectorAll('.subj-q-row').length;
      SUBJ._clearListFilters();
      const all = document.querySelectorAll('.subj-q-row').length;
      return { attempted, unseen, all };
    })()`);
    expect(out.attempted).toBe(1);
    expect(out.unseen).toBe(66);
    expect(out.all).toBe(67);
  });

  it('prints the generated full paper rather than a chapter bank', async () => {
    const out = await p.ev(`(() => {
      const html = PRINT_Q.examSheetHtml({ sections: [
        { name: 'Group A — Structure + Geotech', questions: [
          { q: 'Explain the water treatment steps.', marks: 5, modelAnswer: 'Screening, sedimentation, filtration, disinfection.' },
          { q: 'Design a septic tank.', marks: 10, hint: 'Use IS 2470.' }
        ] }
      ] }, { instructions: true });
      const noInstructions = PRINT_Q.examSheetHtml({ sections: [
        { name: 'Group A', questions: [{ q: 'One question', marks: 5 }] }
      ] }, { instructions: false });
      return {
        printButtons: document.querySelectorAll('.subj-group-hd button[data-on-click*="subjSheet"]').length,
        total: html.includes('Total marks') && html.includes('15'),
        marks: html.includes('5 M') && html.includes('10 M'),
        model: html.includes('filtration, disinfection'),
        hint: html.includes('IS 2470'),
        instructions: html.includes('Instructions') && !noInstructions.includes('Instructions')
      };
    })()`);
    expect(out.printButtons).toBe(0);
    expect(out.total).toBe(true);
    expect(out.marks).toBe(true);
    expect(out.model).toBe(true);
    expect(out.hint).toBe(true);
    expect(out.instructions).toBe(true);
  });
});