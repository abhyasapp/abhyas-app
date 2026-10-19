import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/config.js']);

describe('backend routing', () => {
  it('SMTP-only actions go to Google Apps Script, case-insensitively', () => {
    for (const a of ['verifyEmail', 'resendVerification', 'RequestPasswordReset', 'resetPassword'])
      expect(g.abhyasEndpointFor(a)).toBe('gas');
  });
  it('everything else (incl. content, keys, corrections) goes to Supabase', () => {
    for (const a of ['checkSession', 'saveProgress', 'getProgress', 'login', 'GETFILES', 'getContentKey',
                     'getHardQuestions', 'getCorrections', '', null, undefined])
      expect(g.abhyasEndpointFor(a)).toBe('supabase');
  });
  it('getfile routes by file id shape (Storage path vs bare Drive id)', () => {
    expect(g.abhyasEndpointFor('getFile', { fileId: 'weekly-sets/a.json' })).toBe('supabase');
    expect(g.abhyasEndpointFor('getFile', { fileId: '1AbC_dEf-GhIjKlMnOpQrStUv' })).toBe('gas');
  });
  it('config is frozen and has both endpoints', () => {
    expect(Object.isFrozen(g.ABHYAS_CONFIG)).toBe(true);
    expect(g.ABHYAS_CONFIG.SUPABASE_URL).toMatch(/^https:\/\//);
    expect(g.ABHYAS_CONFIG.GAS_URL).toMatch(/^https:\/\/script\.google\.com\//);
  });
});
