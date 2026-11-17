// @vitest-environment jsdom
/* global window, document */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

describe('data-on-* dispatcher (no eval)', () => {
  beforeAll(() => {
    window.calls = [];
    window.QUIZ = { go: (...a) => window.calls.push(a) };
    (0, window.eval)(fs.readFileSync('js/core/actions.js', 'utf8'));
  });
  const click = (code, setup) => {
    const el = document.createElement('button');
    el.setAttribute('data-on-click', code);
    document.body.appendChild(el);
    if (setup) setup(el);
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return el;
  };
  it('calls globals with literals and escaped strings', () => {
    window.calls.length = 0;
    click("QUIZ.go('a\\'b', 3, true, {x:1})");
    expect(window.calls[0]).toEqual(["a'b", 3, true, { x: 1 }]);
  });
  it('supports this, &&, ; and return false', () => {
    window.calls.length = 0;
    const el = click("event.target===this&&QUIZ.go(this.id);QUIZ.go('2')", e => { e.id = 'z'; });
    expect(window.calls).toEqual([['z'], ['2']]);
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    click('return false');
    expect(el).toBeTruthy(); expect(ev.defaultPrevented).toBe(false);
  });
  it('never evaluates arbitrary code', () => {
    window.pwned = 0;
    click('window.pwned = 1');
    click('(function(){window.pwned=1})()');
    expect(window.pwned).toBe(0);
  });
});
