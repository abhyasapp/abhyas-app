// tests/boot-async-css.test.js — a preloaded stylesheet that is already cached never
// fires another load event, and a preload link never exposes `sheet`. If the promotion
// waits for either signal, the stylesheet is never applied and the app loses every icon
// (the Phosphor stylesheet is loaded through this exact path).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './helpers/load-globals.js';

const SRC = fs.readFileSync(path.join(ROOT, 'js/boot/async-css.js'), 'utf8');

function promote(link) {
  link.addEventListener = function () { throw new Error('must not depend on a load event'); };
  const sandbox = { document: { querySelectorAll: () => [link] } };
  vm.runInContext(SRC, vm.createContext(sandbox), { filename: 'js/boot/async-css.js' });
  return link;
}

describe('async CSS promotion', () => {
  it('applies a preload whose load event already fired (warm cache)', () => {
    // A finished preload: no pending event, and link.sheet stays null for rel=preload.
    const link = promote({ rel: 'preload', sheet: null });
    expect(link.rel).toBe('stylesheet');
  });

  it('applies a preload that still has a sheet handle', () => {
    const link = promote({ rel: 'preload', sheet: {} });
    expect(link.rel).toBe('stylesheet');
  });
});
