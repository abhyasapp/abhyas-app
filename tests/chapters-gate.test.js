// The app must wait for ChapterData; the loader must fail visibly and recover.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './helpers/load-globals.js';

const SRC = fs.readFileSync(path.join(ROOT, 'js/data/chapters-loader.js'), 'utf8').replace(/^\uFEFF/, '');
const DEFINE = 'window.ChapterData = { levels: function(){ return []; }, chapterName: function(){ return ""; }, allFileRefs: function(){ return []; } };';

function el(tag) {
  const o = { tag, style: {}, children: [], attrs: {}, listeners: {}, textContent: '', parentNode: null };
  o.setAttribute = (k, v) => { o.attrs[k] = v; };
  o.addEventListener = (n, f) => { o.listeners[n] = f; };
  o.appendChild = c => { c.parentNode = o; o.children.push(c); if (c.tag === 'script') vm.runInContext(c.textContent, ctx); return c; };
  o.removeChild = c => { o.children = o.children.filter(x => x !== c); c.parentNode = null; };
  return o;
}
let ctx, body, listeners, store;

function boot({ cache, cacheRaw, goodRaw, base, fetchFn, onLine = true }) {
  store = {};
  if (goodRaw) store.abhyas_chapters_good_v1 = goodRaw;
  if (cache) store.abhyas_chapters_cache_v2 = JSON.stringify({ source: cache, savedAt: Date.now(), fails: 0 });
  if (cacheRaw) store.abhyas_chapters_cache_v2 = cacheRaw;
  body = el('body'); listeners = {};
  const head = el('head');
  const doc = {
    body, head, documentElement: head, readyState: 'complete',
    createElement: el,
    getElementById: id => { const f = n => (n.attrs && n.attrs.id === id) || n.id === id ? n : n.children.map(f).find(Boolean); return f(body) || null; },
    addEventListener() {}, visibilityState: 'visible',
  };
  const sb = {
    console: { error() {}, warn() {}, log() {} }, Date, JSON, Promise, Math, setTimeout, clearTimeout, setInterval: () => 0,
    document: doc,
    navigator: { onLine },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    fetch: fetchFn || (() => Promise.reject(new Error('offline'))),
    CustomEvent: function () {},
  };
  if (base) sb.ABHYAS_CONFIG = { CONTENT_CDN_BASE: base };
  sb.window = sb; sb.addEventListener = (n, f) => { listeners[n] = f; };
  ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx);
  return sb;
}
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
const screenText = () => { const f = n => (n.id === 'chapters-boot' || (n.attrs && n.attrs.id === 'chapters-boot')) ? n : n.children.map(f).find(Boolean); const s = f(body); return s ? s.children.map(c => c.textContent).join(' ') : null; };

describe('chapters loader', () => {
  it('has no inline onclick handler (works under any CSP)', () => {
    expect(SRC).not.toMatch(/onclick\s*=/);
  });

  it('warm start: ChapterData is defined at once and the ready promise resolves', async () => {
    const sb = boot({ cache: DEFINE });
    expect(typeof sb.ChapterData).toBe('object');
    expect(await sb.ChapterDataReady).toBe(true);
  });

  it('cold start: waits for the download, then resolves and removes the screen', async () => {
    const sb = boot({ fetchFn: () => new Promise(r => setTimeout(() => r({ ok: true, text: async () => DEFINE }), 60)) });
    expect(sb.ChapterData).toBeUndefined();
    await tick(10);                              // the screen is drawn once the empty store is known
    expect(screenText()).toContain('Loading your chapters');
    expect(await sb.ChapterDataReady).toBe(true);
    expect(screenText()).toBeNull();
    expect(store.abhyas_chapters_cache_v2).toBeTruthy();
  });

  it('cold start offline: shows an offline message with a Try again button and does NOT resolve', async () => {
    const sb = boot({ onLine: false });
    await tick(1500);                        // two attempts + backoff
    expect(screenText()).toContain('offline');
    let resolved = false; sb.ChapterDataReady.then(() => { resolved = true; });
    await tick();
    expect(resolved).toBe(false);
  }, 10000);

  it('recovers by itself when the device comes back online', async () => {
    let up = false;
    const sb = boot({ onLine: false, fetchFn: () => (up ? Promise.resolve({ ok: true, text: async () => DEFINE }) : Promise.reject(new Error('offline'))) });
    await tick(1500);
    up = true; sb.navigator.onLine = true;
    listeners.online();
    expect(await sb.ChapterDataReady).toBe(true);
  }, 10000);

  it('an HTML page (captive portal) is never run as script; it shows the connection screen', async () => {
    const sb = boot({ fetchFn: () => Promise.resolve({ ok: true, text: async () => '<html>Sign in to Wi-Fi</html>' }) });
    await tick(1500);
    expect(screenText()).toContain('Could not load your chapters');
    expect(sb.ChapterData).toBeUndefined();
  }, 10000);

  it('a file that loads but defines nothing is reported as a content problem', async () => {
    boot({ fetchFn: () => Promise.resolve({ ok: true, text: async () => 'var x = 1;' }) });
    await tick(1500);
    expect(screenText()).toContain('not in the format');
  }, 10000);

  const STALE = () => JSON.stringify({ source: DEFINE, savedAt: Date.now() - 3 * 86400000, fails: 5 });

  it('an old failing cache is kept while offline instead of being thrown away', async () => {
    const sb = boot({ onLine: false, cacheRaw: STALE() });
    expect(typeof sb.ChapterData).toBe('object');
    expect(await sb.ChapterDataReady).toBe(true);
  });

  it('...but is dropped when online, so fresh content replaces it', async () => {
    const sb = boot({ onLine: true, cacheRaw: STALE(), fetchFn: () => Promise.resolve({ ok: true, text: async () => DEFINE }) });
    expect(sb.ChapterData).toBeUndefined();          // cache refused, cold path started
    expect(await sb.ChapterDataReady).toBe(true);
  });

  it('tries the other mirrors when the first one is down', async () => {
    const seen = [];
    const sb = boot({ fetchFn: (u) => { seen.push(u); return /cdn\.jsdelivr\.net/.test(u) ? Promise.reject(new Error('down')) : Promise.resolve({ ok: true, text: async () => DEFINE }); } });
    expect(await sb.ChapterDataReady).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toContain('cdn.jsdelivr.net');
    expect(seen.some(u => /fastly|gcore|raw\.githubusercontent/.test(u))).toBe(true);
  });

  it('a bad newest copy falls back to the last good copy and is remembered as bad', async () => {
    const good = JSON.stringify({ source: DEFINE, savedAt: Date.now(), fails: 0 });
    const bad = JSON.stringify({ source: 'ChapterData = {{{ broken', savedAt: Date.now(), fails: 0 });
    store = null;
    const sb = boot({ onLine: false, cacheRaw: bad });
    store.abhyas_chapters_good_v1 = good;
    // re-boot with both slots present (boot() resets the store, so set before running)
    const sb2 = (() => {
      const s2 = boot({ onLine: false, cacheRaw: bad, goodRaw: good });
      return s2;
    })();
    expect(await sb2.ChapterDataReady).toBe(true);
    expect(store.abhyas_chapters_bad_v1).toBeTruthy();
    expect(sb).toBeTruthy();
  });

  it('the content file can be run a second time without a redeclaration error', async () => {
    // chapters-data.js declares `const CH_NAMES` / `LEVEL_LABELS` / `DRIVE` at
    // top level. The boot re-check and every background refresh run a newer
    // copy in the page that is already open, so a second run used to throw
    // "Identifier 'CH_NAMES' has already been declared" and leave the old data
    // in place. Each run now gets its own function scope.
    const V1 = 'const CH_NAMES = { gk: {} };\nwindow.CH_NAMES = CH_NAMES;\n' + DEFINE;
    const V2 = 'const CH_NAMES = { gk: { 1: "General Awareness" } };\nwindow.CH_NAMES = CH_NAMES;\n' + DEFINE + '\n// newer\n';
    let calls = 0;
    const sb = boot({ fetchFn: () => Promise.resolve({ ok: true, text: async () => (calls++ === 0 ? V1 : V2) }) });
    expect(await sb.ChapterDataReady).toBe(true);
    expect(sb.CH_NAMES).toEqual({ gk: {} });
    await tick(400);                          // the boot re-check runs 300 ms after the data arrives
    expect(sb.ChapterData).toBeTruthy();
    expect(sb.CH_NAMES).toEqual({ gk: { 1: 'General Awareness' } });
  });

  it('a pinned base produces pinned mirrors', async () => {
    const seen = [];
    boot({ base: 'https://cdn.jsdelivr.net/gh/abhyasapp/content@v12', fetchFn: (u) => { seen.push(u); return Promise.reject(new Error('x')); } });
    await tick(30);
    expect(seen.some(u => u.includes('gcore.jsdelivr.net/gh/abhyasapp/content@v12/'))).toBe(true);
    expect(seen.some(u => u.includes('raw.githubusercontent.com/abhyasapp/content/v12/'))).toBe(true);
  });
});
