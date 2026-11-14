// tests/admin-drafts-push.test.js — queued admin fixes are pushed together:
// one batch call when the backend has it, one-by-one when it does not, and a
// failed or conflicting fix stays visible instead of being lost.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';

const reports = () => ([
  { id: 'r1', uid: 'fileA_3', qid: 101, fileId: 'fileA', status: 'open', reason: 'wrong_answer', questionSnapshot: 'Stem one', reportedBy: 'a', openReporters: 1, reportedAt: Date.now() },
  { id: 'r2', uid: 'fileA_9', qid: 102, fileId: 'fileA', status: 'open', reason: 'typo', questionSnapshot: 'Stem two', reportedBy: 'b', openReporters: 1, reportedAt: Date.now() }
]);

describe('admin drafts: push', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 1200 });
  }, 120000);
  afterAll(() => p && p.close());

  /* Fresh drafts + a scripted backend before every test. `mode` decides how
     adminApplyCorrections answers. */
  const setup = (mode) => p.ev(`(() => {
    localStorage.removeItem('abhyas_admin_qdrafts_v1');
    ADMIN_DRAFTS.items = []; ADMIN_DRAFTS._loaded = true; ADMIN_DRAFTS._noBatch = false;
    ADMIN_DRAFTS.auto = false; ADMIN_DRAFTS.busy = false;
    ADMIN_REPORT._qcache = {}; ADMIN_REPORT._prefetching = true;   /* keep the background prefetch out of the call log */
    window.__calls = [];
    const list = ${JSON.stringify(reports())};
    ADMIN_REPORT.all = list;
    ADMIN.post = async (action, body) => {
      window.__calls.push({ action, body });
      if (action === 'adminListQuestionReports') return { success: true, reports: list };
      if (action === 'adminApplyCorrections') {
        const items = JSON.parse(body.items);
        if (${JSON.stringify(mode)} === 'unsupported') return { success: false, error: 'Unknown action: adminApplyCorrections' };
        if (${JSON.stringify(mode)} === 'partial') return { success: true, results: [
          { key: items[0].key, ok: true },
          { key: items[1].key, ok: false, conflict: true, error: 'The question changed since you opened it.' } ] };
        if (${JSON.stringify(mode)} === 'down') return { success: false, error: 'Database is unavailable' };
        return { success: true, results: items.map(i => ({ key: i.key, ok: true })) };
      }
      return { success: true };
    };
    const mk = (r, q) => ({ uid: r.uid, qid: r.qid, fileId: r.fileId, index: Number(r.uid.split('_')[1]),
      reportId: r.id, reportReason: r.reason, closeReport: true,
      before: { question: '1. ' + r.questionSnapshot, options: ['a', 'b', 'c', 'd'] },
      after: { question: q, options: ['a', 'b', 'c', 'd'], correctIndex: 1, explanation: '' } });
    ADMIN_DRAFTS.add(mk(list[0], 'Fixed one'));
    ADMIN_DRAFTS.add(mk(list[1], 'Fixed two'));
  })()`);

  const calls = () => p.ev('window.__calls.map(c => c.action)');
  const states = () => p.ev('ADMIN_DRAFTS.items.map(d => d.key + ":" + d.state)');

  it('pushes every draft in ONE batch call and reloads the list once', async () => {
    setup('ok');
    expect(await p.ev('ADMIN_DRAFTS.counts().pending')).toBe(2);
    await p.ev('ADMIN_DRAFTS.pushAll()');
    const c = await calls();
    expect(c.filter(a => a === 'adminApplyCorrections')).toHaveLength(1);
    expect(c).not.toContain('adminUpdateQuestion');
    expect(c.filter(a => a === 'adminListQuestionReports')).toHaveLength(1);
    expect(await states()).toEqual([]);
    expect(await p.ev('localStorage.getItem("abhyas_admin_qdrafts_v1") && JSON.parse(localStorage.getItem("abhyas_admin_qdrafts_v1")).items.length')).toBe(0);
  });

  it('sends the pipeline event shape for each fix', async () => {
    setup('ok');
    await p.ev('ADMIN_DRAFTS.pushAll()');
    const items = await p.ev('JSON.parse(window.__calls.find(c => c.action === "adminApplyCorrections").body.items)');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      uid: 'fileA_3', qid: 101, fileId: 'fileA', closeReport: true,
      before: { question: '1. Stem one' }, after: { question: 'Fixed one', correctIndex: 1 }
    });
    expect(items[0].correctedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('keeps a conflicting fix visible and removes the ones that succeeded', async () => {
    setup('partial');
    await p.ev('ADMIN_DRAFTS.pushAll()');
    expect(await states()).toEqual(['q102:conflict']);
    expect(await p.ev('ADMIN_DRAFTS.items[0].error')).toContain('changed');
  });

  it('keeps every draft when the whole push fails', async () => {
    setup('down');
    await p.ev('ADMIN_DRAFTS.pushAll()');
    expect(await states()).toEqual(['q101:failed', 'q102:failed']);
  });

  it('automatic pushes do not retry drafts that already failed', async () => {
    setup('down');
    await p.ev('ADMIN_DRAFTS.pushAll()');
    p.ev('window.__calls = []');
    await p.ev('ADMIN_DRAFTS.pushAll(true)');
    expect(await calls()).toEqual([]);
  });

  it('falls back to one-by-one saves when the backend has no batch action', async () => {
    setup('unsupported');
    await p.ev('ADMIN_DRAFTS.pushAll()');
    const c = await calls();
    expect(c.filter(a => a === 'adminUpdateQuestion')).toHaveLength(2);
    expect(c.filter(a => a === 'adminUpdateQuestionReportStatus')).toHaveLength(2);
    expect(await states()).toEqual([]);
    expect(await p.ev('ADMIN_DRAFTS._noBatch')).toBe(true);
    const first = await p.ev('window.__calls.find(c => c.action === "adminUpdateQuestion").body');
    expect(first).toMatchObject({ fileId: 'fileA', index: 3, qid: 101, expectedQ: '1. Stem one' });
  });

  it('survives a closed tab: drafts reload from the device, a half-sent push counts as waiting', async () => {
    setup('ok');
    p.ev('ADMIN_DRAFTS.items[0].state = "pushing"; ADMIN_DRAFTS.save(); ADMIN_DRAFTS.items = []; ADMIN_DRAFTS._loaded = false; ADMIN_DRAFTS.load();');
    expect(await states()).toEqual(['q101:pending', 'q102:pending']);
  });

  it('will not mark a report fixed while its fix is still only a draft', async () => {
    setup('ok');
    p.ev('window.__calls = []');
    await p.ev('ADMIN_REPORT.setStatus("r1", "resolved")');
    expect(await calls()).toEqual([]);
    expect(await p.ev('ADMIN_REPORT.all.find(r => r.id === "r1").status')).toBe('open');
  });
});