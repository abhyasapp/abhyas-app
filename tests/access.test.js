import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

// This function decides who gets paid content — it must never regress silently.
const { computeAccessLevel } = loadGlobals(['js/core/access.js']);

describe('computeAccessLevel', () => {
  it('permanent when server says permanentAccess', () => {
    expect(computeAccessLevel({ permanentAccess: true }, {}).level).toBe('permanent');
  });
  it('permanent when user.status is active', () => {
    expect(computeAccessLevel({}, { status: 'active' }).level).toBe('permanent');
  });
  it('trial', () => {
    const a = computeAccessLevel({ isTrial: true, trialExpiresAt: '2026-12-01' }, {});
    expect(a.level).toBe('trial');
    expect(a.trialExpiresAt).toBe('2026-12-01');
    expect(a.permanent).toBe(false);
  });
  it('pending_review only when payment is pending', () => {
    expect(computeAccessLevel({ needsPayment: true }, { status: 'payment_pending' }).level)
      .toBe('pending_review');
  });
  it('expired when payment needed and nothing pending', () => {
    expect(computeAccessLevel({ needsPayment: true }, { status: 'expired' }).level).toBe('expired');
  });
  it('unknown for an empty response — and never grants access', () => {
    const a = computeAccessLevel({}, {});
    expect(a.level).toBe('unknown');
    expect(a.permanent).toBe(false);
  });
  it('permanent beats trial and needsPayment', () => {
    expect(computeAccessLevel({ permanentAccess: true, isTrial: true, needsPayment: true }, {}).level)
      .toBe('permanent');
  });
  it('falls back to res.user when user arg is omitted', () => {
    expect(computeAccessLevel({ user: { status: 'active' } }).level).toBe('permanent');
  });
  it('defaults accessType to permanent', () => {
    expect(computeAccessLevel({ permanentAccess: true }, {}).accessType).toBe('permanent');
  });
});
