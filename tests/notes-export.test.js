// Notes export says WHICH question each note is about; library cards carry the QN chip; offline
// downloads (_fetchBatch) still exist and work.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('notes export, library chip, offline batch', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`localStorage.removeItem('abhyas_qnotes'); QNOTE._cache = null; S.bk = []; S.fl = []; S.wr = []; LIBRARY._entries = null;`);
  });

  it('every exported note names its question: QN number, id and text when this device has it', async () => {
    const rows = await p.ev(`(() => {
      S.bk = [{ uid: 'f_1', nid: 48213, pqn: 'G0011.110001', qid: 48213, q: 'Which soil holds water?' }];
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ 'q:48213': 'clay holds more', 'q:G0011.110002': 'igneous = cooled magma', 'f_9': 'old note' }));
      QNOTE._cache = null;
      return EXPORTNOTES.rows();
    })()`);
    const byNote = Object.fromEntries(rows.map(r => [r.note, r]));
    expect(byNote['clay holds more']).toMatchObject({ qn: 'G0011.110001', nid: '48213', question: 'Which soil holds water?' });
    expect(byNote['igneous = cooled magma']).toMatchObject({ qn: 'G0011.110002', question: '' });       // number only: text not on this device
    expect(rows).toHaveLength(3);
  });

  it('the text export is readable and quotable', async () => {
    const txt = await p.ev(`(() => {
      S.bk = [{ uid: 'f_1', nid: 48213, pqn: 'G0011.110001', qid: 48213, q: 'Which soil holds water?' }];
      localStorage.setItem('abhyas_qnotes', JSON.stringify({ 'q:48213': 'clay holds more' })); QNOTE._cache = null;
      return EXPORTNOTES.text();
    })()`);
    expect(txt).toContain('QN G0011.110001');
    expect(txt).toContain('Which soil holds water?');
    expect(txt).toContain('Note: clay holds more');
  });

  it('a library card shows the same QN chip as the rest of the app', async () => {
    const html = await p.ev(`LIBRARY._card({ key: 'q:48213', uid: 'f_1', nid: 48213, pqn: 'G0011.110001', qid: 48213, q: 'Which soil holds water?', options: ['Clay','Sand'], correct: 0, source: { bookmark: true } }, 0)`);
    expect(html).toContain('G0011.110001');
    expect(html).toContain('qmeta-chip');
  });

  it('_fetchBatch still downloads files for offline use (CDN path) and refuses when offline', async () => {
    const out = await p.ev(`(async () => {
      S.online = true; S.forcedOffline = false;
      QUIZ._fetchFromCDN = async (fid) => [{ q: 'from ' + fid }];
      const r = await QUIZ._fetchBatch([{ fid: 'fA', key: 'kA' }, { fid: 'fB', key: 'kB' }]);
      const a = await QDB.get('kA'), b = await QDB.get('kB');
      S.online = false;
      let offlineErr = '';
      try { await QUIZ._fetchBatch([{ fid: 'fC', key: 'kC' }]); } catch (e) { offlineErr = e.message; }
      S.online = true;
      return { saved: r.saved.length, failed: r.failed.length, a: a[0].q, b: b[0].q, offlineErr };
    })()`);
    expect(out).toMatchObject({ saved: 2, failed: 0, a: 'from fA', b: 'from fB' });
    expect(out.offlineErr.toLowerCase()).toContain('offline');
  });
});
