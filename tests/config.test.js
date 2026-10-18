import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/config.js']);

describe('backend routing', () => {
  it('Drive-only actions go to Google Apps Script, case-insensitively', () => {
    for (const a of ['getFile', 'GETFILES', 'getContentKey', 'verifyEmail', 'resendVerification', 'getHardQuestions'])
      expect(g.abhyasEndpointFor(a)).toBe('gas');
  });
  it('everything else goes to Supabase', () => {
    for (const a of ['checkSession', 'saveProgress', 'getProgress', 'login', '', null, undefined])
      expect(g.abhyasEndpointFor(a)).toBe('supabase');
  });
  it('config is frozen and has both endpoints', () => {
    expect(Object.isFrozen(g.ABHYAS_CONFIG)).toBe(true);
    expect(g.ABHYAS_CONFIG.SUPABASE_URL).toMatch(/^https:\/\//);
    expect(g.ABHYAS_CONFIG.GAS_URL).toMatch(/^https:\/\/script\.google\.com\//);
  });
});
