import { describe, it, expect } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

/* Question details chips: the quiz shows the stable question id and other
   descriptive fields, and the Settings switch can hide them. */
describe('question details chips', () => {
  it('shows ID, set position and optional fields, and hides on switch off', async () => {
    const p = await bootPage(ROOT, 'user.html');
    try {
      const html = p.ev(`qMetaHtml({ qid: 123, uid: 'fid_4', fileId: 'fid', year: '2080', difficulty: 'Hard', tags: ['law'] })`);
      expect(html).toContain('ID</b> 123');
      // The set is named by its chapter and position; the Drive file id is
      // plumbing and must never reach the learner-facing UI.
      expect(html).toContain('Set</b> #5');
      expect(html).not.toContain('fid');
      expect(p.ev(`qMetaHtml({ qid: 'G0011.110001', uid: 'fid_0', fileId: 'fid' })`)).toContain('ID</b> G0011.110001');
      expect(html).toContain('2080');
      expect(html).toContain('Hard');
      expect(html).toContain('#law');
      expect(p.ev(`qMetaHtml({ uid: 'local_0', fileId: 'local' })`)).toBe('');
      p.ev(`localStorage.setItem('abhyas_qmeta', '0')`);
      expect(p.ev(`qMetaHtml({ qid: 123, uid: 'fid_4', fileId: 'fid' })`)).toBe('');
    } finally { p.close(); }
  });
});
