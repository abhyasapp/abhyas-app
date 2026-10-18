/* ═══════════════════════════════════════════════════════════════════════
   js/core/config.js — backend endpoints, version, feature flags.
   MUST load FIRST — before constants.js, before any shim.
   MUST load EXACTLY ONCE (do not reference from any shim or app.js).

   Migration status: Supabase is primary. Google Apps Script still serves
   Drive-only actions (objective question files, chapter data, verify email,
   hard questions, resend verification).
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.46.0';
window.APP_VERSION = APP_VERSION;

const ABHYAS_CONFIG = Object.freeze({
  // Supabase Edge Function (primary backend — used by everything not in DRIVE_ACTIONS)
  SUPABASE_URL: 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api',

  // Google Apps Script (kept only for Drive-only actions listed below)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec',

  // Google Sign-In client ID (used by js/core/net.js GSI loader, when wired)
  GOOGLE_CLIENT_ID: '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com',

  // Optional CDN mirror for question files. Empty = GAS-only (slower but works).
  // Fill in when a CDN or public Drive mirror exists.
  CONTENT_CDN_BASE: 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main',

  // Actions still served by Google Apps Script. Case-insensitive.
  // Anything NOT in this list routes to SUPABASE_URL.
  DRIVE_ACTIONS: [
    'getfile',
    'getfiles',
    'getcontentkey',
    'gethardquestions',
    'resendverification',
    'verifyemail'
  ]
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;

/**
 * Returns 'gas' or 'supabase' for a given backend action name.
 * @param {string} action
 * @returns {'gas'|'supabase'}
 */
function abhyasEndpointFor(action) {
  const a = String(action || '').toLowerCase();
  return ABHYAS_CONFIG.DRIVE_ACTIONS.indexOf(a) !== -1 ? 'gas' : 'supabase';
}
window.abhyasEndpointFor = abhyasEndpointFor;