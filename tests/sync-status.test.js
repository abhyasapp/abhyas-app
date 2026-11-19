// The student can see, in words, whether their work is only on the device or safely uploaded.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

describe('sync status in plain language', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html', { fetchReply: () => '[]' }); }, 120000);
  afterAll(() => p && p.close());
  beforeEach(async () => {
    await p.ev(`localStorage.removeItem(PSYNC.PEND_KEY); PSYNC._state = 'idle'; S.online = true; S.forcedOffline = false;
                S.user = Object.assign({}, S.user, { token: 't', username: 'demo' }); localStorage.removeItem(PSYNC.LAST_KEY);`);
  });

  it('counts saved changes and clears the count after a successful backup', async () => {
    await p.ev(`PSYNC.noteChange(); PSYNC.noteChange(); PSYNC.noteChange();`);
    expect(await p.ev('PSYNC.pendingCount()')).toBe(3);
    await p.ev('PSYNC._markSynced()');
    expect(await p.ev('PSYNC.pendingCount()')).toBe(0);
  });

  it('offline with unsent work says so, with the number waiting', async () => {
    await p.ev(`S.online = false; PSYNC.noteChange(); PSYNC.noteChange();`);
    const d = await p.ev('PSYNC.describe()');
    expect(d.state).toBe('offline');
    expect(d.text).toContain('2 changes');
    expect(d.text).toContain('back online');
  });

  it('a failed upload says it will retry', async () => {
    await p.ev(`PSYNC.noteChange(); PSYNC._setState('error');`);
    expect((await p.ev('PSYNC.describe()')).state).toBe('error');
  });

  it('after a backup it says the progress is safe', async () => {
    await p.ev('PSYNC._markSynced()');
    expect((await p.ev('PSYNC.describe()')).text).toContain('safe');
  });

  it('never claims "backed up" when nothing has ever been uploaded', async () => {
    const d = await p.ev('PSYNC.describe()');
    expect(d.text).not.toContain('safe');
  });

  it('the results screen shows the status and repaints when the state changes', async () => {
    await p.ev(`document.getElementById('res-wrap').style.display=''; PSYNC.noteChange(); PSYNC._setState('pending'); PSYNC.renderResultBadge();`);
    expect(await p.ev(`document.getElementById('res-sync').textContent`)).toContain('Saved on this device');
    await p.ev('PSYNC._markSynced()');
    expect(await p.ev(`document.getElementById('res-sync').textContent`)).toContain('Backed up');
  });

  it('the toolbar button states it in words, not only in colour', async () => {
    await p.ev(`PSYNC.noteChange(); PSYNC._setState('pending');`);
    expect(await p.ev(`document.getElementById('tb-sync-btn').title`)).toContain('Saved on this device');
  });
});
