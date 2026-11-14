// tests/content-health.test.js — reported + most-missed questions in one queue.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const tick = (ms = 350) => new Promise(r => setTimeout(r, ms));

describe('admin: Content health', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 900 });
    p.ev(`
      HEALTH._rows = []; HEALTH._qmap = {}; HEALTH._reports = []; HEALTH._missed = [];
      ADMIN.post = async (action) => {
        if (action === 'adminListQuestionReports') return { success: true, reports: [
          { id: 'r1', uid: 'f1_0', qid: 7, fileId: 'f1', status: 'open', reason: 'wrong_answer', reportedAt: Date.now(), questionSnapshot: 'A beam is loaded as shown.' },
          { id: 'r2', uid: 'f1_0', qid: 7, fileId: 'f1', status: 'open', reason: 'unclear', reportedAt: Date.now() - 1000 }
        ] };
        if (action === 'adminMostMissedQuestions') return { success: true, results: [
          { uid: 'f1_0', fileId: 'f1', index: 0, wrongRate: 80, total: 10, uniqueStudents: 8 }
        ] };
        if (action === 'getFiles') return { success: true, files: {
          f1: { success: true, content: JSON.stringify([{ q: 'A beam is loaded as shown. What is the reaction?' }]) }
        } };
        return { success: true };
      };
    `);
  }, 120000);
  afterAll(() => p && p.close());

  it('joins two reports and a most-missed row into one combined question', async () => {
    await p.ev('HEALTH.load(true)');
    await tick();

    expect(p.ev(`document.querySelectorAll('#ch-list .miss').length`)).toBe(1);
    expect(p.ev(`document.querySelector('#ch-list .miss-q').textContent`)).toContain('beam');
    expect(p.ev(`document.querySelector('#ch-metrics').textContent`)).toContain('Open reports');
    expect(p.ev(`document.querySelector('#ch-metrics').textContent`)).toContain('Reported and heavily missed');
  });

  it('filters to combined questions and shows the report count', () => {
    p.ev(`HEALTH.setFilter('combined')`);
    expect(p.ev(`document.querySelectorAll('#ch-list .miss').length`)).toBe(1);
    expect(p.ev(`document.querySelector('#ch-list .miss').textContent`)).toContain('2 open reports');
    p.ev(`HEALTH.setFilter('missed')`);
    expect(p.ev(`document.querySelectorAll('#ch-list .miss').length`)).toBe(1);
  });

  it('searches by the loaded question text', () => {
    p.ev(`HEALTH.setFilter('all'); HEALTH.search('reaction')`);
    expect(p.ev(`document.querySelectorAll('#ch-list .miss').length`)).toBe(1);
    p.ev(`HEALTH.search('nothing-matches-this')`);
    expect(p.ev(`document.querySelectorAll('#ch-list .miss').length`)).toBe(0);
  });
});