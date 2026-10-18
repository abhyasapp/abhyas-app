// js/core/auth.js — login session, offline fallback, logout, periodic recheck.

const AUTH = {
  async restore() {
    const u = _load(LS.USER, null);
    if (!u || u.type !== 'user' || !u.username) { AUTH._bounce(); return; }
    
    // 1. OFFLINE LOGIN: If offline, skip server check and log in using local cache
    if (S.forcedOffline || !S.online) {
      if (AUTH._isValidOffline(u)) AUTH._enter(u); else AUTH._bounce();
      return;
    }

    // 2. QUICK RESTORE: If verified recently (last 30s), don't spam the server
    const age = Date.now() - (Number(u.lastVerified) || 0);
    if (age >= 0 && age < 30 * 1000 && AUTH._isValidOffline(u)) { AUTH._enter(u); return; }

    // 3. SERVER CHECK: Verify token with Supabase
    try {
      const { res } = await AUTH._checkSessionOnce(u);
      if (!res.success) {
        // If token failed, check if they still have valid local offline access
        if (AUTH._isValidOffline(u)) AUTH._enter(u); else AUTH._bounce();
        return;
      }
      
      const updated = AUTH._buildSession(u, res);
      _save(LS.USER, updated);
      AUTH._enter(updated);
    } catch {
      // Fallback to local offline cache if the network drops during this check
      if (AUTH._isValidOffline(u)) AUTH._enter(u); else AUTH._bounce();
    }
  },

  async _checkSessionOnce(u) {
    const r = await netFetch(APPS, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'checkSession', token: u.token, username: u.username })
    }, 15000);
    const res = await r.json();
    return { res };
  },

  _isValidOffline(u) {
    const a = u.access || {};
    if (a.level === 'permanent') return true;
    if (a.level === 'trial' && a.trialExpiresAt) return new Date(a.trialExpiresAt) > Date.now();
    return false;
  },

  _buildSession(prevSession, res) {
    const user = res.user || {};
    const access = computeAccessLevel(res, user);
    return {
      ...prevSession,
      username: user.username || prevSession.username,
      name: user.name || prevSession.name,
      email: user.email || prevSession.email,
      mobile: user.mobile || prevSession.mobile,
      access,
      needsPayment: !!res.needsPayment,
      adminCapable: prevSession.adminCapable || !!res.adminCapable,
      lastVerified: Date.now()
    };
  },

  _bounce() {
    const onScreen = () => { const w = document.getElementById('quiz-wrap'); return !!(w && w.style.display !== 'none'); };
    if (onScreen()) {
      if (AUTH._bounceWaiting) return;
      AUTH._bounceWaiting = true;
      toast('Session expired. Please sign in again after finishing this quiz.', 6000);
      const t = setInterval(() => { if (!onScreen()) { clearInterval(t); window.location.href = 'index.html'; } }, 1500);
      return;
    }
    window.location.href = 'index.html';
  },

  _notifyPaymentNeeded() {
    if (AUTH._paywallNotifiedAt && Date.now() - AUTH._paywallNotifiedAt < 30 * 1000) return;
    AUTH._paywallNotifiedAt = Date.now();
    try {
      if (typeof toast === 'function') toast('Your access has ended. Complete payment to continue.', 8000);
    } catch (e) {}
  },

  _resetUserScopedLocalDataIfDifferentUser(username) {
    try { if (typeof CONTENT_CRYPTO !== 'undefined') CONTENT_CRYPTO.clear(); } catch (e) {}
    const lastUser = _load(LS.LAST_USER, '');
    const norm = v => String(v || '').trim().toLowerCase();
    if (lastUser && norm(lastUser) !== norm(username)) {
      try { const keepUser = S.user; S.user = { username: lastUser }; PSYNC._snapshot('before-account-switch'); S.user = keepUser; } catch (e) {}
      [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.TT, LS.COV].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      S.prog = { total: 0, correct: 0, sessions: [] };
      S.bk = []; S.fl = []; S.wr = [];
      S.stk = { days: [], last: '' };
      S.cov = {};
      S.chapStats = {};
      S.tt = { sessions: [], reminders: { enabled: false, leadMinutes: 5 } };
    }
    _save(LS.LAST_USER, username);
  },

  _enter(user) {
    S.user = user;
    AUTH._resetUserScopedLocalDataIfDifferentUser(user.username);
    document.getElementById('sg').style.display = 'none';
    document.getElementById('app').classList.add('on');
    document.getElementById('uchip').textContent = '👤 ' + (user?.name || user?.username || 'Student');
    AUTH._updateSidebarCard(user);
    if (!S.online) document.getElementById('offbar').classList.add('show');
    APP.init();
    TUTORIAL.maybeAutoOpen(user);
    PSYNC.pullIfEmpty();
    TT._startReminderChecker();
    if (typeof PUSH !== 'undefined') PUSH.silentRefresh();
    WEEKLY.init();
    if (typeof SB_HINTS !== 'undefined') setTimeout(() => SB_HINTS.refresh(), 200);
    if (user.needsPayment) AUTH._notifyPaymentNeeded();
  },

  _updateSidebarCard(user) {
    const nameEl = document.getElementById('sb-uname');
    const statusEl = document.getElementById('sb-ustatus');
    if (nameEl) nameEl.textContent = user?.name || user?.username || 'Student';
    if (statusEl) {
      const a = user?.access || {};
      if (a.level === 'permanent' && a.accessType === 'yearly') {
        statusEl.textContent = a.accessExpiresAt ? `📅 Access until ${new Date(a.accessExpiresAt).toLocaleDateString()}` : '📅 Yearly access';
      } else if (a.level === 'permanent') {
        statusEl.textContent = '✅ Permanent access';
      } else if (a.level === 'trial') {
        statusEl.textContent = a.trialExpiresAt ? `⏳ Trial until ${new Date(a.trialExpiresAt).toLocaleString()}` : '⏳ Trial access';
      } else if (user?.needsPayment) {
        statusEl.textContent = '⚠️ Access expired';
      } else {
        statusEl.textContent = '—';
      }
    }
  },

  async logout() {
    try { if (typeof CONTENT_CRYPTO !== 'undefined') CONTENT_CRYPTO.clear(); } catch (e) {}
    if (!(await ASK.confirm({ title: 'Log out?', body: 'Your progress is saved to your account.', ok: 'Log out' }))) return;
    if (S.user && S.user.token && S.online && !S.forcedOffline && PSYNC._timer) {
      let confirmed = false;
      try {
        await Promise.race([
          PSYNC.pushNow().then(() => { confirmed = true; }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('logout-push-timeout')), 1500))
        ]);
      } catch (e) {
        console.warn('[AUTH.logout] pushNow did not complete in 1.5s — falling back to beacon:', e && e.message);
      }
      if (!confirmed) PSYNC._beaconSync();
    }
    localStorage.removeItem(LS.USER);
    window.location.href = 'index.html';
  },

  _revalidateTimer: null,
  _visibilityBound: false,
  RECHECK_MS: 10 * 60 * 1000,

  startPeriodicRecheck() {
    if (AUTH._revalidateTimer) clearInterval(AUTH._revalidateTimer);
    AUTH._revalidateTimer = setInterval(() => AUTH._periodicRecheckTick(), AUTH.RECHECK_MS);
    if (!AUTH._visibilityBound) {
      AUTH._visibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && S.user) {
          const last = S.user.lastVerified || 0;
          if (Date.now() - last > AUTH.RECHECK_MS) AUTH._periodicRecheckTick();
        }
      });
    }
  },

  async _periodicRecheckTick() {
    if (document.visibilityState === 'hidden') return;
    // Do not recheck if offline, so users stay logged in offline
    if (!S.online || S.forcedOffline || !S.user) return;
    
    try {
      const { res } = await AUTH._checkSessionOnce(S.user);
      if (res.success) {
        const updated = AUTH._buildSession(S.user, res);
        _save(LS.USER, updated);
        S.user = updated;
        AUTH._updateSidebarCard(updated);
        if (updated.needsPayment) AUTH._notifyPaymentNeeded();
      } else if (res.sessionInvalid) {
        try { localStorage.setItem('abhyas_notice', 'You were signed out because this account was used on another device, or the session expired. Please sign in again.'); } catch (e) {}
        localStorage.removeItem(LS.USER);
        AUTH._bounce();
      }
    } catch (e) { 
      console.warn('[AUTH] periodic session recheck failed, will retry next interval:', e); 
    }
  }
};