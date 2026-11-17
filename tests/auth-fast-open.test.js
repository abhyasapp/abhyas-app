// The app opens at once for a still-valid session and verifies in the background.
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { loadGlobals } from './helpers/load-globals.js';

function setup({ reply, online = true }) {
  const calls = [];
  const store = {};
  const g = loadGlobals(['js/core/auth.js'], {
    S: { online, forcedOffline: false, user: null },
    LS: { USER: 'u', LAST_USER: 'lu' },
    APPS: 'https://x',
    _load: (k, d) => (k in store ? store[k] : d),
    _save: (k, v) => { store[k] = v; },
    netFetch: () => { calls.push('net'); return reply(); },
    computeAccessLevel: () => ({ level: 'permanent' }),
    toast() {},
    localStorage: { setItem() {}, removeItem(k) { delete store[k]; }, getItem() { return null; } },
    document: { getElementById: () => null },
  });
  return { g, calls, store };
}
const session = () => ({ type: 'user', username: 'a', token: 't', lastVerified: 0, access: { level: 'permanent' } });

describe('AUTH.restore', () => {
  it('enters before the network answers, then keeps the session when the server agrees', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { g, store } = setup({ reply: () => gate.then(() => ({ json: async () => ({ success: true, user: { username: 'a' }, token: 't2' }) })) });
    store.u = session();
    let entered = false;
    g.__enter = () => { entered = true; }; vm.runInContext('AUTH._enter = __enter', g);
    g.__bounce = () => { throw new Error('should not bounce'); }; vm.runInContext('AUTH._bounce = __bounce', g);
    await vm.runInContext('AUTH.restore()', g);
    expect(entered).toBe(true);                 // opened without waiting for the server
    release();
    await new Promise(r => setTimeout(r, 0));
    expect(store.u.token).toBe('t2');           // background check refreshed the session
  });

  it('signs the student out when the server rejects the session', async () => {
    const { g, store } = setup({ reply: () => Promise.resolve({ json: async () => ({ success: false, sessionInvalid: true }) }) });
    store.u = session();
    let bounced = 0;
    g.__enter = () => {}; vm.runInContext('AUTH._enter = __enter', g);
    g.__bounce = () => { bounced++; }; vm.runInContext('AUTH._bounce = __bounce', g);
    await vm.runInContext('AUTH.restore()', g);
    await new Promise(r => setTimeout(r, 0));
    expect(bounced).toBe(1);
    expect(store.u).toBeUndefined();
  });

  it('an expired trial still waits for the server before opening', async () => {
    const { g, store, calls } = setup({ reply: () => Promise.resolve({ json: async () => ({ success: true, user: {}, token: 't' }) }) });
    store.u = { type: 'user', username: 'a', token: 't', lastVerified: 0, access: { level: 'trial', trialExpiresAt: '2000-01-01' } };
    let entered = false;
    g.__enter = () => { entered = true; }; vm.runInContext('AUTH._enter = __enter', g);
    await vm.runInContext('AUTH.restore()', g);
    expect(calls.length).toBe(1);
    expect(entered).toBe(true);
  });
});
