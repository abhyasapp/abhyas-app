// tests/subj-queue.test.js — a saved written answer must never disappear
// because the server stayed down. Failed sends stay visible and retryable.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ITEM = {
  username: 'queue_tester',
  kind: 'qotd',
  questionId: 'qotd-1',
  questionText: 'Explain the minimum grade of concrete for RCC work.',
  chapterId: 'structure',
  marks: 10,
  solveSec: 3600,
  startedAt: 1,
  pdfData: 'data:application/pdf;base64,AA==',
  filename: 'answer.pdf',
  queuedAt: 1,
  attempts: 4,
  failed: false
};

describe('offline written-answer queue', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply: () => 'window.ChapterData = window.ChapterData || [];', waitMs: 900 });
    p.ev(`
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      localStorage.removeItem('abhyas_subj_queue_v1');
      S.user = { username: 'queue_tester', token: 'test-token' };
      S.online = true; S.forcedOffline = false;
    `);
  }, 120000);
  afterAll(() => p && p.close());

  it('keeps a failed answer instead of deleting it after the last attempt', async () => {
    const out = await p.ev(`(async () => {
      localStorage.setItem('abhyas_subj_queue_v1', JSON.stringify([${JSON.stringify(ITEM)}]));
      SUBJ_QUEUE._send = async () => ({ success: false, error: 'server unavailable' });
      await SUBJ_QUEUE.process();
      return JSON.parse(localStorage.getItem('abhyas_subj_queue_v1'))[0];
    })()`);
    expect(out).toMatchObject({ kind: 'qotd', questionId: 'qotd-1', attempts: 5, failed: true });
    expect(out.lastError).toContain('server unavailable');
  });

  it('shows the saved answer above the submissions list, even when failed', () => {
    const text = p.ev(`(() => {
      MY_SUBJ._items = [];
      MY_SUBJ._loaded = true;
      MY_SUBJ.render();
      return document.getElementById('subj-mine-body').textContent;
    })()`);
    expect(text).toContain('Saved on this device');
    expect(text).toContain('could not be sent');
    expect(text).toContain('Retry all');
  });

  it('retries every saved answer and removes only the ones the server accepts', async () => {
    p.ev(`
      localStorage.setItem('abhyas_subj_queue_v1', JSON.stringify([
        Object.assign({}, ${JSON.stringify(ITEM)}, { attempts: 5, failed: true, lastError: 'down' })
      ]));
      SUBJ_QUEUE._send = async () => ({ success: true });
    `);
    await p.ev('SUBJ_QUEUE.retryAll()');
    await wait(100);
    const left = p.ev("JSON.parse(localStorage.getItem('abhyas_subj_queue_v1') || '[]')");
    expect(left).toEqual([]);
  });

  it('does not run two send loops at the same time', async () => {
    const calls = await p.ev(`(async () => {
      localStorage.setItem('abhyas_subj_queue_v1', JSON.stringify([
        Object.assign({}, ${JSON.stringify(ITEM)}, { attempts: 0, failed: false })
      ]));
      let n = 0;
      SUBJ_QUEUE._send = async () => { n++; await new Promise(r => setTimeout(r, 80)); return { success: true }; };
      await Promise.all([SUBJ_QUEUE.process(), SUBJ_QUEUE.process()]);
      return n;
    })()`);
    expect(calls).toBe(1);
  });
});
