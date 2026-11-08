// tests/study-tools.test.js — the marks map, per-question difficulty memory and
// the exam-week card. These are pure local features: no network, no server.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const FIXTURE = `window.ChapterData = {
  allFileRefs(){ return [
    { fid: 'f_soil', key: 'k_soil', lv: 'level7', ch: 'soil', book: 'Book A', subtopic: 'soil' },
    { fid: 'f_survey', key: 'k_survey', lv: 'level7', ch: 'survey', book: 'Book B', subtopic: 'survey' },
    { fid: 'f_gk', key: 'k_gk', lv: 'gk', ch: 'gk', book: 'GK', subtopic: 'gk' }
  ]; },
  chapterName(lv, ch){
    return ch === 'soil' ? 'Soil Mechanics' : ch === 'survey' ? 'Surveying' : 'General Knowledge';
  },
  chapterFileRefs(lv, ch){ return this.allFileRefs().filter(r => r.lv === lv && r.ch === ch); }
};`;

const SEED = `
  localStorage.removeItem('abhyas_qstats_v1');
  localStorage.removeItem('abhyas_exam_date');
  localStorage.removeItem('abhyas_last_sync');
  localStorage.setItem('abhyas_lscheme', JSON.stringify({ groups: [
    { name: 'General Knowledge', marks: 25, level: 'gk', chapters: ['gk'] },
    { name: 'Civil Engineering', marks: 50, level: 'level7', chapters: ['soil', 'survey'] }
  ] }));
  S.fcount = { f_soil: 10, f_survey: 30, f_gk: 40 };
  S.chapStats = {
    'Soil Mechanics': { attempted: 10, correct: 8, sessions: 2, lastAt: 1000 },
    'Surveying': { attempted: 10, correct: 5, sessions: 2, lastAt: 2000 },
    'General Knowledge': { attempted: 10, correct: 8, sessions: 2, lastAt: 3000 }
  };
  S.cov = { f_soil: { p: '1', a: 10 }, f_survey: { p: '1', a: 10 }, f_gk: { p: '1', a: 10 } };
  S.wr = [];
  S.prog = { total: 30, correct: 21, sessions: [] };
  MARKS_MAP._cache.at = 0;
  QSTATS._cache = null;
`;

describe('study planning and adaptive tools', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
    p.ev(FIXTURE);
  }, 120000);
  beforeEach(async () => { await p.ev(SEED); });
  afterAll(() => p && p.close());

  it('ranks chapters by marks at stake and accuracy gap', async () => {
    const rows = await p.ev('MARKS_MAP.rows()');
    const survey = rows.find((r) => r.name === 'Surveying');
    expect(survey.marks).toBe(37.5);
    expect(survey.accuracy).toBeCloseTo(0.5, 5);
    expect(survey.score).toBeCloseTo(18.8, 1);
    expect(rows[0].name).toBe('Surveying');
  });

  it('renders the top three with a study action', async () => {
    await p.ev('MARKS_MAP.render()');
    const slot = p.w.document.getElementById('marks-map-slot');
    expect(slot.textContent).toContain('Surveying');
    expect(slot.textContent).toContain('Highest return next');
    expect(slot.querySelectorAll('[data-on-click^="MARKS_MAP.start"]').length).toBeGreaterThan(1);
  });

  it('learns per-question difficulty and puts the target band first', async () => {
    await p.ev(`for (let i = 0; i < 10; i++) QSTATS.record('q_hard', i < 1);`);
    await p.ev(`for (let i = 0; i < 10; i++) QSTATS.record('q_mid', i < 5);`);
    await p.ev(`for (let i = 0; i < 10; i++) QSTATS.record('q_easy', i < 9);`);

    expect(await p.ev(`QSTATS.difficulty('q_hard')`)).toBe('hard');
    expect(await p.ev(`QSTATS.difficulty('q_mid')`)).toBe('medium');
    expect(await p.ev(`QSTATS.difficulty('q_easy')`)).toBe('easy');

    const order = await p.ev(`QSTATS.order([{ uid: 'q_easy' }, { uid: 'q_hard' }, { uid: 'q_mid' }], 'learn').map(q => q.uid)`);
    expect(order[0]).toBe('q_mid');
  });

  it('records a whole session once and aggregates repeat attempts', async () => {
    const stat = await p.ev(`QSTATS.recordSession([
      { uid: 'q_a', ok: true }, { uid: 'q_a', ok: false }, { uid: 'q_b', ok: true }
    ]); JSON.stringify(QSTATS.get('q_a'))`);
    expect(JSON.parse(stat)).toMatchObject({ attempts: 2, correct: 1, p: 0.5 });
    expect(await p.ev(`QSTATS.get('q_b').attempts`)).toBe(1);
  });

  it('keeps the last successful backup time across a reload', async () => {
    await p.ev('PSYNC._markSynced()');
    expect(await p.ev('PSYNC.lastSync() > 0')).toBe(true);
    expect(p.w.document.getElementById('psync-status').textContent).toContain('Last backed up');

    await p.ev(`PSYNC._state = 'idle'; PSYNC.renderHealth();`);
    expect(p.w.document.getElementById('psync-status').textContent).toContain('just now');
  });

  it('shows the final-stretch card only inside the last three days', async () => {
    const date = await p.ev(`(function(){
      const d = new Date(); d.setDate(d.getDate() + 2);
      const z = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
    })()`);
    await p.ev(`localStorage.setItem('abhyas_exam_date', ${JSON.stringify(date)}); EXAM_MODE.render();`);
    expect(await p.ev('EXAM_MODE.daysLeft()')).toBe(2);
    expect(await p.ev('EXAM_MODE.active()')).toBe(true);
    const slot = p.w.document.getElementById('exam-mode-slot');
    expect(slot.textContent).toContain('Exam in 2 days');
    expect(slot.textContent).toContain('Final mock');

    await p.ev(`localStorage.setItem('abhyas_exam_date', '2000-01-01'); EXAM_MODE.render();`);
    expect(await p.ev('EXAM_MODE.active()')).toBe(false);
    expect(slot.innerHTML).toBe('');
  });
});
