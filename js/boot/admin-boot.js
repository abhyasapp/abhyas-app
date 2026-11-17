/* ═══════════════════════════════════════════════════════════════════════
   admin.html — final paint pass. Everything here is a small, idempotent
   enhancement on top of what core.js / router.js / features/* already do.
   Nothing here introduces new behaviour; it only fills the gaps in the
   static markup so the operator always sees accurate state.
   ═══════════════════════════════════════════════════════════════════════ */
(function adminFinalize(){
  'use strict';

  /* ── 1. Account name / role in the menu ── */
  function paintAccount(){
    if (typeof ADMIN === 'undefined' || !ADMIN.creds) return;
    const nameEl = document.getElementById('account-name');
    if (nameEl && nameEl.textContent !== ADMIN.creds.user) {
      nameEl.textContent = ADMIN.creds.user || 'admin';
    }
    const roleEl = document.getElementById('account-role');
    if (roleEl) {
      const isOwner = ADMIN._perms && ADMIN._perms.role === 'owner';
      const text = isOwner ? 'Owner' : 'Admin';
      if (roleEl.textContent !== text) roleEl.textContent = text;
    }
    /* The avatar in the topbar starts as "AD" — keep it in sync. */
    const av = document.getElementById('account-avatar');
    if (av && ADMIN.creds.user) {
      const initials = String(ADMIN.creds.user).slice(0, 2).toUpperCase();
      if (av.textContent !== initials) av.textContent = initials;
    }
    /* Populate the settings "your account" line if that view is open. */
    const line = document.getElementById('settings-account-line');
    if (line) {
      const isOwner = ADMIN._perms && ADMIN._perms.role === 'owner';
      const text = ADMIN.creds.user + ' · ' + (isOwner ? 'Owner' : 'Admin');
      if (line.textContent !== text) line.textContent = text;
    }
  }

  /* ── 2. Backend-version + last-sync line in the menu ── */
  function paintBackend(){
    const versionEl = document.getElementById('backend-version');
    if (versionEl) {
      const v = (typeof APP_VERSION !== 'undefined') ? 'v' + APP_VERSION : '';
      const text = 'Backend ' + (v || '—');
      if (versionEl.textContent !== text) versionEl.textContent = text;
    }
    const syncEl = document.getElementById('backend-sync');
    if (syncEl) {
      const last = (typeof ADMIN !== 'undefined' && ADMIN._lastSync) || 0;
      if (!last) {
        if (syncEl.textContent !== 'Not synced yet') syncEl.textContent = 'Not synced yet';
        return;
      }
      const mins = Math.floor((Date.now() - last) / 60000);
      let text;
      if (mins < 1) text = 'Synced just now';
      else if (mins < 60) text = 'Synced ' + mins + 'm ago';
      else text = 'Synced ' + Math.floor(mins / 60) + 'h ago';
      if (syncEl.textContent !== text) syncEl.textContent = text;
    }
  }

  /* ── 3. Fallback banner colour shift while a fallback is active ── */
  window.addEventListener('abhyas:fallback', () => {
    const bar = document.getElementById('fallback-banner');
    if (!bar) return;
    bar.setAttribute('data-fallback-active', '1');
    setTimeout(() => bar.removeAttribute('data-fallback-active'), 24000);
  });

  /* ── 4. Paint immediately, then on a slow interval ── */
  paintAccount();
  paintBackend();
  setTimeout(paintAccount, 500);
  setTimeout(paintBackend, 500);
  setTimeout(paintBackend, 3000);
  setInterval(paintAccount, 2000);
  setInterval(paintBackend, 3000);

  /* ── 5. Populate the forced-password note when that dialog opens ── */
  const _origChangePassword = (typeof ADMIN !== 'undefined' && ADMIN.changePassword)
    ? ADMIN.changePassword.bind(ADMIN) : null;
  if (_origChangePassword && ADMIN) {
    ADMIN.changePassword = function () {
      _origChangePassword();
      const note = document.getElementById('pwd-forced-note');
      if (note) note.hidden = !this._forcedPwChange;
      const cancel = document.getElementById('pwd-cancel');
      if (cancel) cancel.hidden = !!this._forcedPwChange;
    };
  }
})();
