// tests/design-consistency.test.js — the v2.64 portal contract.
//
// The ten components in the "v2.64 — ONE PORTAL, ONE SYSTEM" block are the one
// place a surface style is defined. These assertions keep later edits honest:
// a new literal colour, an unpaired tab, or a layout style creeping back into
// the page fails here instead of in review.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tokens = read('css/tokens.css');
const css = read('css/app.css');
const html = read('user.html');

const systemStart = css.indexOf('v2.64 — ONE PORTAL, ONE SYSTEM');
const system = systemStart < 0 ? '' : css.slice(systemStart);

describe('the v2.64 layout contract exists in tokens', () => {
  it.each(['--gutter', '--tap-min', '--content-measure', '--card-pad', '--card-gap'])('defines %s', (name) => {
    expect(tokens).toContain(name + ':');
  });
  it('keeps the 44px tap floor', () => {
    expect(tokens).toMatch(/--tap-min:\s*44px/);
  });
});

describe('the component layer', () => {
  it('is present in app.css', () => {
    expect(systemStart).toBeGreaterThan(-1);
  });
  it.each(['.pg-head', '.card', '.row', '.stat', '.list-item', '.empty-state', '.skeleton', '.tabbar', '.banner', '.meter'])('defines %s', (sel) => {
    expect(system).toContain(sel + '{');
  });
  it('introduces no literal colours, so light and dark cannot drift', () => {
    const hex = system.match(/#[0-9a-fA-F]{3,8}/g) || [];
    expect(hex).toEqual([]);
    const rgb = system.match(/\brgba?\([^)]*\)/g) || [];
    expect(rgb).toEqual([]);
  });
  it('has balanced braces', () => {
    const open = (system.match(/\{/g) || []).length;
    const close = (system.match(/\}/g) || []).length;
    expect(open).toBe(close);
  });
});

describe('tabs and toggle groups are announced correctly', () => {
  it('every role=tab controls a real tabpanel', () => {
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs.length).toBeGreaterThan(0);
    for (const tag of tabs) {
      const controls = /aria-controls="([^"]+)"/.exec(tag);
      expect(controls, tag).not.toBeNull();
      const id = controls[1];
      const target = new RegExp('id="' + id + '"[^>]*role="tabpanel"');
      expect(target.test(html), id).toBe(true);
    }
  });
  it('every tablist only contains tabs', () => {
    const bars = [...html.matchAll(/<div[^>]*role="tablist"[^>]*>([\s\S]*?)<\/div>/g)];
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      const buttons = bar[1].match(/<button\b[^>]*>/g) || [];
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b).toContain('role="tab"');
    }
  });
  it('filter bars use pressed buttons, not tabs', () => {
    for (const id of ['lib-tabs', 'ws-tabs']) {
      const bar = new RegExp('id="' + id + '"[^>]*role="group"');
      expect(bar.test(html), id).toBe(true);
    }
  });
});

describe('the Written status grammar', () => {
  const submissions = read('js/features/submissions.js');
  it.each(['badge--pending{', 'badge--marked{', 'badge--returned', 'badge--failed'])('defines %s in css', (needle) => {
    expect(system).toContain('.' + needle);
  });
  it('uses pending, marked and returned in the submissions card', () => {
    for (const cls of ['badge--pending', 'badge--marked', 'badge--returned']) {
      expect(submissions).toContain(cls);
    }
  });
  it('keeps one PDF-item surface for the Written screens', () => {
    expect(system).toContain('.pdf-item,.sd-card,.subm-card{');
  });
});

describe('one header per screen', () => {
  it('every view has a page header or its own documented hero', () => {
    const views = [...html.matchAll(/<div class="view[^"]*" id="(view-[a-z-]+)">([\s\S]*?)(?=<div class="view|<\/main>)/g)];
    expect(views.length).toBeGreaterThanOrEqual(19);
    for (const [, id, body] of views) {
      const hasHeader = body.includes('class="pg-head"');
      const ownHero = ['view-home', 'view-sprint'].includes(id);
      expect(hasHeader || ownHero, id).toBe(true);
    }
  });
  it('keeps inline layout styles out of the page', () => {
    const styles = html.match(/style="[^"]*"/g) || [];
    expect(styles.length).toBeLessThanOrEqual(60);
  });
});
