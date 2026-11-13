// Large cloud progress records are gz1: compressed. The Chapters view must
// decode them with syncDecode instead of showing the compressed bytes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('server progress coverage', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { waitMs: 1000 });
  }, 120000);
  afterAll(() => p && p.close());

  it('decodes a compressed getProgress payload', async () => {
    const out = await p.ev(`(async () => {
      const payload = 'gz1:stub';
      window.syncDecode = async (text) => {
        if (text !== payload) throw new Error('unexpected payload');
        return { prog: { sessions: [{ qres: [{ uid: 'file_1', ok: true }, { uid: 'file_1', ok: false }] }] }, cov: {} };
      };
      S.user = { username: 'progress_tester', token: 'test-token' };
      S.online = true; S.forcedOffline = false;
      window.fetch = async () => ({ json: async () => ({ success: true, data: payload }) });
      await SERVER_PROG.load(true);
      await new Promise(r => setTimeout(r, 80));
      return { prefix: payload.slice(0, 4), rows: SERVER_PROG._rows.length,
        text: document.getElementById('srv-list').textContent };
    })()`);
    expect(out.prefix).toBe('gz1:');
    expect(out.rows).toBe(1);
    expect(out.text).toContain('2 attempts');
    expect(out.text).not.toContain('is not valid JSON');
  });
});