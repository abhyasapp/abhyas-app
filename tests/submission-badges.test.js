// tests/submission-badges.test.js — the Written status grammar, rendered.
//
// design-consistency only proves the classes exist in source. This boots the
// real page and renders a real submission card through MY_SUBJ._renderCard in
// each state, so a badge that is never applied (or applied with the wrong
// word) fails here instead of shipping.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const renderCard = (p, status) => p.ev(`
  (function () {
    var item = {
      id: 'test-' + ${JSON.stringify(status)},
      kind: 'qotd',
      status: ${JSON.stringify(status)},
      questionMarks: 5,
      submittedAt: '2026-11-23T09:00:00Z',
      questionText: 'Explain how load-shedding affects a small business.',
      score: ${status === 'graded' ? 4 : 'null'},
      gradedBy: 'Teacher',
      feedback: 'Good structure.',
      solveSec: 600
    };
    var box = document.getElementById('subj-mine-body');
    box.innerHTML = MY_SUBJ._renderCard(item);
    var badge = box.querySelector('.badge');
    return badge ? badge.className + '|' + badge.textContent.trim() : 'NO BADGE';
  })()
`);

describe('submission status badges render', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { waitMs: 1200 });
  }, 120000);
  afterAll(() => p && p.close());

  it('waits with the pending badge', () => {
    const out = renderCard(p, 'pending');
    expect(out).toContain('badge--pending');
    expect(out).toContain('Awaiting marking');
  });

  it('shows marked when a score came back', () => {
    const out = renderCard(p, 'graded');
    expect(out).toContain('badge--marked');
    expect(out).toContain('Marked');
  });

  it('shows returned when the paper came back unmarked', () => {
    const out = renderCard(p, 'rejected');
    expect(out).toContain('badge--returned');
    expect(out).toContain('Returned');
  });

  it('never shows two status badges at once', () => {
    const count = p.ev("document.querySelectorAll('#subj-mine-body .badge').length");
    expect(count).toBe(1);
  });

  it('stamps the card state so the left accent matches the badge', () => {
    const cls = p.ev("(document.querySelector('#subj-mine-body .subm-card')||{}).className || ''");
    expect(cls).toContain('rejected');
  });
});
