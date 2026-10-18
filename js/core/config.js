/* ═══════════════════════════════════════════════════════════════════════
   js/core/config.js — backend endpoints, version, feature flags.
   MUST load FIRST — before constants.js, before any shim.
   MUST load EXACTLY ONCE (do not reference from any shim or app.js).

   Migration status: Supabase is primary.

   Still on Google Apps Script (Drive-only):
     • getfiles               — batch fetch of objective chapter files
     • getcontentkey          — decryption key for encrypted objective content
     • gethardquestions       — flashcard badge
     • resendverification     — email
     • verifyemail            — email

   Routed by fileId prefix (see abhyasEndpointFor):
     • getfile                — Storage path (weekly-sets/, subjective-content/,
                                 study-docs/, subjective/) → Supabase
                              — Drive ID (objective chapters) → Apps Script
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.47.0';
window.APP_VERSION = APP_VERSION;

const ABHYAS_CONFIG = Object.freeze({
  // Supabase Edge Function — primary backend
  SUPABASE_URL: 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api',

  // Google Apps Script — for Drive-only actions listed below
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec',

  // Google Sign-In client ID (used by js/core/net.js GSI loader)
  GOOGLE_CLIENT_ID: '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com',

  // CDN mirror for objective chapter question files (still Drive-backed)
  CONTENT_CDN_BASE: 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main',

  // Storage bucket prefixes — if a fileId starts with one of these,
  // it lives in Supabase Storage.
  SUPABASE_BUCKET_PREFIXES: [
    'weekly-sets/',
    'subjective-content/',
    'study-docs/',
    'subjective/'
  ],

  // Actions that ALWAYS route to Google Apps Script.
  // getfile is handled separately (see abhyasEndpointFor) because it
  // routes by fileId prefix — some files are Storage, some are Drive.
  DRIVE_ACTIONS: [
    'getfiles',
    'getcontentkey',
    'gethardquestions',
    'resendverification',
    'verifyemail'
  ]
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;

/**
 * Returns true if the fileId looks like a Supabase Storage path
 * (starts with a known bucket prefix) rather than a Drive ID.
 * @param {string} fileId
 * @returns {boolean}
 */
function abhyasIsSupabasePath(fileId) {
  const fid = String(fileId || '');
  if (!fid) return false;
  return ABHYAS_CONFIG.SUPABASE_BUCKET_PREFIXES.some(p => fid.indexOf(p) === 0);
}
window.abhyasIsSupabasePath = abhyasIsSupabasePath;

/**
 * Returns 'gas' or 'supabase' for a given backend action name.
 *
 * For getfile / getfiles:
 *   - If a fileId param is provided and starts with a known bucket
 *     prefix → 'supabase'
 *   - Otherwise (Drive ID or batch) → 'gas'
 *
 * For everything else: presence in DRIVE_ACTIONS decides.
 *
 * @param {string} action
 * @param {Object} [params] — optional; needed for getfile routing
 * @returns {'gas'|'supabase'}
 */
function abhyasEndpointFor(action, params) {
  const a = String(action || '').toLowerCase();

  // getfile: route by fileId prefix
  if (a === 'getfile') {
    const fid = params && (
      params.fileId || params.file_id || params.id || params.path
    );
    return abhyasIsSupabasePath(fid) ? 'supabase' : 'gas';
  }

  // getfiles (batch) and everything else in the drive list → gas
  if (ABHYAS_CONFIG.DRIVE_ACTIONS.indexOf(a) !== -1) return 'gas';

  // Default: Supabase
  return 'supabase';
}
window.abhyasEndpointFor = abhyasEndpointFor;