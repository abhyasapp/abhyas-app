// tests/product-quality.test.js — installability and delivery invariants.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/load-globals.js';

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

describe('PWA install metadata', () => {
  it('keeps the identity, start URL and installable icon set', () => {
    expect(manifest.id).toBe('./');
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(manifest.launch_handler.client_mode).toBe('navigate-existing');
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(ROOT, icon.src))).toBe(true);
    }
    for (const shot of manifest.screenshots) {
      expect(fs.existsSync(path.join(ROOT, shot.src))).toBe(true);
    }
  });

  it('keeps visible FAQ questions aligned with FAQPage structured data', () => {
    const html = read('index.html');
    const faqBlock = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((block) => block['@type'] === 'FAQPage');
    const visible = [...html.matchAll(/<summary data-i18n>([^<]+)<\/summary>/g)]
      .map((m) => m[1].replace(/&amp;/g, '&').trim())
      .sort();
    expect(visible).toEqual(faqBlock.mainEntity.map((q) => q.name).sort());
  });

  it('translates every interactive landing question and explanation', () => {
    const script = read('js/app/index-page.js');
    const dictionary = read('js/core/i18n.js');
    const questionBlock = script.slice(
      script.indexOf('var TRY_QUESTIONS ='),
      script.indexOf('var _tryIdx'),
    );
    const strings = [...questionBlock.matchAll(/\b(?:q|exp): '([^']+)'/g)].map((m) => m[1]);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) expect(dictionary).toContain(text);
  });

  it('routes every shortcut to a unique, supported student view', () => {
    const routes = new Set([
      'home', 'offline', 'downloads', 'progress', 'subjective',
      'written', 'weekly', 'chapters', 'wrong', 'bookmarks',
    ]);
    const urls = manifest.shortcuts.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const hash = new URL(url, 'https://example.test/').hash.replace(/^#/, '');
      expect(hash).not.toBe('');
      expect(routes.has(hash)).toBe(true);
    }
  });
});

describe('delivery quality gates', () => {
  it('runs the full verification gate in CI', () => {
    const workflow = read('.github/workflows/verify.yml');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run verify');
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/branches:\s*\[\s*main\s*\]/);
  });

  it('keeps the button audit in the standard verification command', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.verify).toContain('audit:buttons');
    expect(pkg.scripts.verify).toContain('npm test');
  });
});
