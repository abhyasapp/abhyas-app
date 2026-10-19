/* ═══════════════════════════════════════════════════════════════════════
   js/core/config.js — backend endpoints, version, feature flags.
   MUST load FIRST — before constants.js, before any shim.
   MUST load EXACTLY ONCE (do not reference from any shim or app.js).

   Migration status: Supabase is primary for everything except SMTP.

   Still on Google Apps Script (SMTP / MailApp only):
     • resendverification     — email
     • verifyemail            — email
     • requestpasswordreset   — email
     • resetpassword          — email

   Everything else — including content fetch, corrections, hard-question
   feed, profile updates and reporting — is handled by Supabase.

   Routed by fileId prefix (see abhyasEndpointFor):
     • getfile                — Storage path (weekly-sets/, subjective-content/,
                                 study-docs/, subjective/, uploads/, etc.)
                                 → Supabase
                              — Bare Drive ID (no slash — objective chapters)
                                 → Apps Script (client should prefer CDN)
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.47.0';
window.APP_VERSION = APP_VERSION;

const ABHYAS_CONFIG = Object.freeze({
  // Supabase Edge Function — primary backend
  SUPABASE_URL: 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api',

  // Google Apps Script — for SMTP-only actions listed below
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec',

  // Google Sign-In client ID (used by js/core/net.js GSI loader)
  GOOGLE_CLIENT_ID: '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com',

  // CDN mirror for objective chapter question files (still Drive-backed).
  // Objective questions are fetched DIRECTLY from this CDN by the client —
  // they never route through getfile/getfiles on either backend.
  CONTENT_CDN_BASE: 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main',

  // Storage bucket prefixes — kept for reference / any direct checks.
  // abhyasIsSupabasePath() below uses a broader rule (any path with a
  // slash counts as Storage) because Supabase's getfile falls back to a
  // bucket-wide filename search when no explicit prefix matches.
  SUPABASE_BUCKET_PREFIXES: [
    'weekly-sets/',
    'subjective-content/',
    'study-docs/',
    'subjective/'
  ],

  // Actions that ALWAYS route to Google Apps Script.
  // These four depend on MailApp (SMTP) and are not yet migrated.
  //
  // NOT in this list (all handled by Supabase now):
  //   getfiles, getcontentkey, gethardquestions, getcorrections,
  //   reportquestion, updateprofile
  //
  // Also NOT in this list (belong on Supabase by default):
  //   login, signup, checksession, logoutotherdevices, submitpayment,
  //   getpublicinfo, getfile, saveprogress, getprogress, etc.
  DRIVE_ACTIONS: [
    'resendverification',
    'verifyemail',
    'requestpasswordreset',
    'resetpassword'
  ]
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;

/**
 * Returns true if the fileId looks like a Supabase Storage path
 * rather than a Drive file ID.
 *
 * Rule: any string containing '/' is a Storage path.
 * Drive IDs never contain slashes (they are pure [A-Za-z0-9_-]).
 * Supabase's getfile falls back to a bucket-wide filename search when
 * the explicit bucket prefix is unknown, so 'uploads/x.pdf', 'sets/x.json'
 * etc. all work end-to-end.
 *
 * @param {string} fileId
 * @returns {boolean}
 */
function abhyasIsSupabasePath(fileId) {
  const fid = String(fileId || '');
  if (!fid) return false;
  // Explicit bucket prefix — definitely Storage.
  if (ABHYAS_CONFIG.SUPABASE_BUCKET_PREFIXES.some(p => fid.indexOf(p) === 0)) return true;
  // Any slash — treat as Storage path (Drive IDs never contain slashes).
  if (fid.indexOf('/') !== -1) return true;
  return false;
}
window.abhyasIsSupabasePath = abhyasIsSupabasePath;

/**
 * Returns 'gas' or 'supabase' for a given backend action name.
 *
 * For getfile:
 *   - If the fileId looks like a Storage path (contains '/') → 'supabase'
 *   - Otherwise (bare Drive ID) → 'gas'
 *
 * For getfiles (batch):
 *   - Routed to Supabase (all batch fetches are Storage paths now).
 *
 * For everything else: presence in DRIVE_ACTIONS decides.
 *
 * @param {string} action
 * @param {Object} [params] — optional; needed for getfile routing
 * @returns {'gas'|'supabase'}
 */
function abhyasEndpointFor(action, params) {
  const a = String(action || '').toLowerCase();

  // getfile: route by fileId shape
  if (a === 'getfile') {
    const fid = params && (
      params.fileId || params.file_id || params.id || params.path
    );
    return abhyasIsSupabasePath(fid) ? 'supabase' : 'gas';
  }

  // Everything explicitly listed → gas
  if (ABHYAS_CONFIG.DRIVE_ACTIONS.indexOf(a) !== -1) return 'gas';

  // Default: Supabase
  return 'supabase';
}
window.abhyasEndpointFor = abhyasEndpointFor;