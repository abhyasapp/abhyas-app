// tests/psync.test.js — the rules that protect a student's progress when a
// local copy and a cloud copy are merged.
//
// PSYNC is the only place where the app writes over saved progress. The three
// things that must never regress: a merge that would drop entries is refused,
// an accepted merge keeps every entry, and the payload sent to the server stays
// small enough that a backup never fails for size.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const DAY = 24 * 60 * 60 * 1000;

const LS = {
  PROG: 'abhyas_prog', CHAPSTATS: 'abhyas_chapstats', COV: 'abhyas_cov',
  BK: 'abhyas_bk', FL: 'abhyas_fl', WR: 'abhyas_wr', STK: 'abhyas_stk',
  USER: 'abhyas_session',
};

let store, S, saved, mergeImpl, g, PSYNC;

function reset() {
  store = new Map();
  saved = [];
  mergeImpl = (local, remote) => remote;
  S = {
    user: { username: 'ram', token: 't' },
    online: true, forcedOffline: false,
    prog: { total: 10, correct: 6, sessions: [{ at: Date.now() - 1000, total: 4 }] },
    chapStats: { 'Hydrology': { attempted: 3 } },
    cov: { L5_1_book_a: 1 },
    bk: [11], fl: [22], wr: [33],
    stk: { days: [], last: '' },
  };
}

const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};

beforeEach(() => {
  reset();
  g = loadGlobals(['js/core/psync.js'], {
    localStorage, LS, S, setTimeout, clearTimeout,
    _save: (k, v) => { saved.push([k, v]); store.set(k, JSON.stringify(v)); return true; },
    mergeSyncData: (local, remote) => mergeImpl(local, remote),
    syncDecode: async v => (typeof v === 'string' ? JSON.parse(v) : v),
    document: { addEventListener() {}, getElementById() { return null; } },
    addEventListener() {},
  });
  PSYNC = g.PSYNC;
});

const fullLocal = () => PSYNC._fullLocal();

describe('merge safety', () => {
  it('accepts a merge that keeps every entry', () => {
    const local = fullLocal();
    expect(PSYNC._mergeKeepsEverything(local, local)).toBe(true);

    const bigger = { ...local, wr: [...local.wr, 44], bk: [...local.bk, 55] };
    expect(PSYNC._mergeKeepsEverything(local, bigger)).toBe(true);
  });

  it('refuses a merge that would drop a wrong answer, bookmark, note or session', () => {
    store.set('abhyas_qnotes', JSON.stringify({ q1: 'note' }));
    const local = fullLocal();
    expect(local.qnotes).toEqual({ q1: 'note' });
    expect(PSYNC._mergeKeepsEverything(local, { ...local, wr: [] })).toBe(false);
    expect(PSYNC._mergeKeepsEverything(local, { ...local, bk: [] })).toBe(false);
    expect(PSYNC._mergeKeepsEverything(local, { ...local, prog: { ...local.prog, sessions: [] } })).toBe(false);
    expect(PSYNC._mergeKeepsEverything(local, { ...local, qnotes: {} })).toBe(false);
  });

  it('refuses a merge that would lower the lifetime totals', () => {
    const local = fullLocal();
    expect(PSYNC._mergeKeepsEverything(local, { ...local, prog: { ...local.prog, total: 9 } })).toBe(false);
    expect(PSYNC._mergeKeepsEverything(local, { ...local, prog: { ...local.prog, correct: 5 } })).toBe(false);
  });

  it('cancels mergeIn and changes nothing when the cloud copy is smaller', async () => {
    mergeImpl = local => ({ ...local, wr: [], bk: [] });
    const before = JSON.stringify([...store.entries()]);

    const out = await PSYNC.mergeIn({}, 'test');

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/would have removed data/i);
    expect(JSON.stringify([...store.entries()])).toBe(before);
    expect(S.wr).toEqual([33]);
  });

  it('applies a safe merge and reports exactly what was added', async () => {
    mergeImpl = local => ({
      ...local,
      wr: [...local.wr, 44, 55],
      qnotes: { q1: 'note' },
      resets: {},
    });

    const out = await PSYNC.mergeIn({}, 'test');

    expect(out.ok).toBe(true);
    expect(out.added.wr).toBe(2);
    expect(out.added.notes).toBe(1);
    expect(S.wr).toEqual([33, 44, 55]);
    expect(store.get('abhyas_qnotes')).toBe(JSON.stringify({ q1: 'note' }));
  });

  it('refuses an empty or unreadable cloud copy instead of wiping the device', async () => {
    expect((await PSYNC.mergeIn(null)).ok).toBe(false);
    expect((await PSYNC.mergeIn('not json')).ok).toBe(false);
    expect(S.wr).toEqual([33]);
  });

  it('keeps the device copy when the remote merge data is corrupted', async () => {
    mergeImpl = () => { throw new Error('bad shape'); };
    const out = await PSYNC.mergeIn({}, 'test');
    expect(out.ok).toBe(false);
    expect(S.wr).toEqual([33]);
  });
});

describe('payload sent to the server', () => {
  it('omits the large per-question lists and keeps only recent sessions', () => {
    const now = Date.now();
    S.prog.sessions = [
      { at: now - 10 * DAY }, { at: now - 100 * DAY },
      ...Array.from({ length: 140 }, (_, i) => ({ at: now - i * 1000 })),
    ];

    const p = PSYNC._syncPayloadForServer();

    expect(p.wr).toEqual([]);
    expect(p.bk).toEqual([]);
    expect(p.fl).toEqual([]);
    expect(p.qnotes).toEqual({});
    expect(p.prog.sessions).toHaveLength(100);
    expect(p.prog.sessions.every(s => s.at >= now - 60 * DAY)).toBe(true);
    for (let i = 1; i < p.prog.sessions.length; i++) {
      expect(p.prog.sessions[i - 1].at).toBeGreaterThanOrEqual(p.prog.sessions[i].at);
    }
  });

  it('drops the sprint log when the caller asks for the small payload', () => {
    g.SPRINT_LOG = { exportForSync: () => ({ days: { '2026-02-10': { q: 10 } } }) };
    expect(PSYNC._syncPayloadForServer().sprintLog).toBeTruthy();
    expect(PSYNC._syncPayloadForServer({ noLog: true }).sprintLog).toBeUndefined();
  });
});

describe('local snapshots and revision', () => {
  it('keeps at most three snapshots, newest first', () => {
    S.wr = [1]; expect(PSYNC._snapshot('one')).toBe(true);
    S.wr = [1, 2]; expect(PSYNC._snapshot('two')).toBe(true);
    S.wr = [1, 2, 3]; expect(PSYNC._snapshot('three')).toBe(true);
    S.wr = [1, 2, 3, 4]; expect(PSYNC._snapshot('four')).toBe(true);

    const list = PSYNC.listSnapshots();
    expect(list).toHaveLength(3);
    expect(list.map(s => s.reason)).toEqual(['four', 'three', 'two']);
  });

  it('does not snapshot an empty account', () => {
    S.prog = { total: 0, correct: 0, sessions: [] };
    S.bk = []; S.fl = []; S.wr = [];
    expect(PSYNC._snapshot('empty')).toBe(false);
  });

  it('hides snapshots taken by a different account', () => {
    S.wr = [1];
    PSYNC._snapshot('mine');
    S.user = { username: 'sita', token: 't2' };
    expect(PSYNC.listSnapshots()).toHaveLength(0);
  });

  it('round-trips the server revision used for conflict detection', () => {
    expect(PSYNC._rev()).toBe('');
    PSYNC._setRev('2026-02-10T12:00:00Z');
    expect(PSYNC._rev()).toBe('2026-02-10T12:00:00Z');
  });
});
