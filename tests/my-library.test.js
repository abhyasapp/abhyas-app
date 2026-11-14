// tests/my-library.test.js — notes, saved questions and misses in one place.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const tick = (ms = 350) => new Promise(r => setTimeout(r, ms));

describe('My library', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply, waitMs: 800 });
  }, 120000);
  afterAll(() => p && p.close());

  it('joins a bookmark, a missed question and a note-only entry', async () => {
    p.ev(`
      S.bk.push({ uid: 'f1_0', q: 'A simply supported beam has what reaction?', options: ['Vertical only', 'Vertical and moment'], correct: 0 });
      S.wr.push({ uid: 'f1_1', q: 'What is the unit of torsion?', options: ['Nm', 'N/m'], correct: 0, _nextDue: Date.now(), _addedAt: Date.now() });
      QNOTE.set('f1_2', 'Remember: torsion uses polar moment of inertia.');
      LIBRARY.render();
    `);
    await tick();

    expect(p.ev(`document.querySelectorAll('#lib-list .lib-card').length`)).toBe(3);
    expect(p.ev(`document.querySelector('#lib-summary').textContent`)).toContain('3 items');
  });

  it('searches the note text, not only the question text', async () => {
    p.ev(`LIBRARY.search('polar moment')`);
    expect(p.ev(`document.querySelectorAll('#lib-list .lib-card').length`)).toBe(1);
    expect(p.ev(`document.querySelector('#lib-list .qnote-text').textContent`)).toContain('polar moment');
  });

  it('filters to notes and back to all', () => {
    p.ev(`LIBRARY.clearSearch(); LIBRARY.setTab('notes')`);
    expect(p.ev(`document.querySelectorAll('#lib-list .lib-card').length`)).toBe(1);
    p.ev(`LIBRARY.setTab('all')`);
    expect(p.ev(`document.querySelectorAll('#lib-list .lib-card').length`)).toBe(3);
  });

  it('reviews the selected question through the normal quiz engine', () => {
    p.ev(`
      window.__started = null;
      QUIZ.startWith = (qs, mode, label) => { window.__started = { n: qs.length, mode: mode, label: label, uid: qs[0].uid }; };
      LIBRARY.review('f1_0');
    `);
    expect(p.ev(`window.__started`)).toMatchObject({ n: 1, mode: 'flashcard', uid: 'f1_0' });
  });

  it('is reachable from the Review group in the sidebar', () => {
    expect(p.ev(`!!document.getElementById('nav-library')`)).toBe(true);
    expect(p.ev(`!!document.getElementById('view-library')`)).toBe(true);
  });
});