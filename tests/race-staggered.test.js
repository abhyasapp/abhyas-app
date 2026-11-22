// raceStaggered: a dead or hanging source costs ~staggerMs, not its whole timeout.
import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/net.js'], {
  S: { online: true }, document: { addEventListener() {}, getElementById: () => null },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {},
  navigator: { onLine: true }, AbortController, setTimeout, clearTimeout, Promise, Error, fetch: () => Promise.reject(new Error('n/a')),
});
const race = g.raceStaggered;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('raceStaggered', () => {
  it('the first source answers: the others never start', async () => {
    let second = 0;
    const v = await race([async () => 'A', async () => { second++; return 'B'; }], 50, 1000);
    expect(v).toBe('A'); await sleep(80); expect(second).toBe(0);
  });
  it('a failed source hands over at once, not after the stagger', async () => {
    const t = Date.now();
    const v = await race([async () => { throw new Error('down'); }, async () => 'B'], 800, 3000);
    expect(v).toBe('B'); expect(Date.now() - t).toBeLessThan(300);
  });
  it('a HANGING source is overtaken after the stagger, and is aborted', async () => {
    let aborted = false;
    const hang = (signal) => new Promise((_, rej) => signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }));
    const t = Date.now();
    const v = await race([hang, async () => 'B'], 120, 5000);
    expect(v).toBe('B'); expect(Date.now() - t).toBeLessThan(500);
    await sleep(20); expect(aborted).toBe(true);
  });
  it('the slower source can still win if the first is merely slow and then fails', async () => {
    const v = await race([() => sleep(60).then(() => { throw new Error('late fail'); }), async () => 'B'], 20, 1000);
    expect(v).toBe('B');
  });
  it('rejects only when every source failed, with the last error', async () => {
    await expect(race([async () => { throw new Error('one'); }, async () => { throw new Error('two'); }], 10, 1000)).rejects.toThrow('two');
  });
  it('gives up after the overall limit', async () => {
    const never = () => new Promise(() => {});
    await expect(race([never, never], 20, 150)).rejects.toThrow('timeout');
  });
});
