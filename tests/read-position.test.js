// tests/read-position.test.js — long notes and per-question PDFs should reopen
// where the student stopped, and the reading lists should say so.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('PDF reading positions', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' });
  }, 120000);
  afterAll(() => p && p.close());

  it('stores a page, clamps it to the document length and returns null for unknown keys', async () => {
    const out = await p.ev(`(() => {
      const first = PDFVIEW.rememberPosition('studydoc:test', 7, 20);
      const tooFar = PDFVIEW.rememberPosition('studydoc:test', 99, 20);
      return { first, tooFar, unknown: PDFVIEW.position('studydoc:missing') };
    })()`);
    expect(out.first).toMatchObject({ page: 7, total: 20 });
    expect(out.tooFar.page).toBe(20);
    expect(out.unknown).toBeNull();
  });

  it('surfaces the most recently read PDF on Home and opens that document', async () => {
    const out = await p.ev(`(() => {
      STUDYDOCS.docs = [
        { id: 'd1', title: 'Long notes', category: 'notes', sizeBytes: 2048 },
        { id: 'd2', chapterId: 'qna.geotech.soil-mechanics', title: 'Define bearing capacity', sizeBytes: 2048 }
      ];
      const pos = JSON.parse(localStorage.getItem('abhyas_pdf_positions') || '{}');
      pos['studydoc:d1'] = { page: 4, total: 12, at: 1 };
      pos['studydoc:d2'] = { page: 2, total: 3, at: 2 };
      localStorage.setItem('abhyas_pdf_positions', JSON.stringify(pos));
      READING_RESUME.render();
      const html = document.querySelector('#reading-resume-slot').innerHTML;
      const orig = STUDYDOCS.open;
      let opened = null;
      STUDYDOCS.open = id => { opened = id; };
      READING_RESUME.open();
      STUDYDOCS.open = orig;
      return { html, opened };
    })()`);
    expect(out.html).toContain('Continue reading');
    expect(out.html).toContain('Define bearing capacity');
    expect(out.html).toContain('Question &amp; answer');
    expect(out.html).toContain('page 2 of 3');
    expect(out.html).not.toContain('Long notes');
    expect(out.opened).toBe('d2');
  });

  it('shows Continue p. N in both model answers and questions', async () => {
    await p.ev(`
      PDFVIEW.rememberPosition('studydoc:d1', 4, 12);
      STUDYDOCS.docs = [{ id: 'd1', title: 'Long notes', category: 'notes', sizeBytes: 2048 }];
      STUDYDOCS.loaded = true;
      STUDYDOCS.render();
      QNA.docs = [{
        id: 'd1',
        chapterId: 'qna.geotech.soil-mechanics',
        title: 'Define bearing capacity',
        description: '10M · Terzaghi first',
        sortOrder: 1
      }];
      QNA.loaded = true;
      QNA.render();
    `);
    await tick();

    expect(await p.ev(`document.querySelector('#studydocs-body').textContent`)).toContain('Continue p. 4');
    expect(await p.ev(`document.querySelector('#qna-body').textContent`)).toContain('Continue p. 4');
  });
});
