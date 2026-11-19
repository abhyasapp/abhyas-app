// js/features/app-lock.js — an optional PIN lock for shared / borrowed phones.
//
// What it is: a screen that must be unlocked when the app is opened and after
// it has been in the background for a few minutes, so a friend who picks up the
// phone cannot read or change the student's progress.
// What it is NOT: protection against someone who can inspect the phone's
// storage with developer tools. The PIN is stored only as a salted PBKDF2 hash
// (never in plain text), and the Settings card says plainly what it does.
//
// Forgot the PIN? The only way back in is to sign out (which asks for the
// account password to sign in again), and signing out removes the PIN.
const APPLOCK = {
  KEY: 'abhyas_applock',
  ITER: 150000,
  GRACE_MS: 3 * 60 * 1000,          // in the background longer than this => lock again
  _hiddenAt: 0,
  _locked: false,
  _fails: 0,

  /* ── storage ─────────────────────────────────────────────────────── */
  _read() {
    try {
      const o = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      return (o && o.salt && o.hash && o.u === this._user()) ? o : null;
    } catch (e) { return null; }
  },
  /* At launch S.user is not loaded yet (the lock must show BEFORE the app starts),
     so fall back to the stored session. */
  _user() {
    try { if (S.user && S.user.username) return S.user.username; } catch (e) { /* not loaded yet */ }
    try {
      const k = (typeof LS !== 'undefined' && LS.USER) || 'abhyas_session';
      const o = JSON.parse(localStorage.getItem(k) || 'null');
      return (o && o.username) || '';
    } catch (e) { return ''; }
  },
  enabled() { return !!this._read(); },

  _b64(buf) { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); },
  _unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); },
  async _hash(pin, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return this._b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: this.ITER }, key, 256));
  },
  _supported() { return !!(window.crypto && crypto.subtle && crypto.getRandomValues); },
  _validPin(p) { return /^\d{4,6}$/.test(String(p || '')); },

  /* ── settings card ───────────────────────────────────────────────── */
  async enable() {
    const a = document.getElementById('lock-pin-new'), b = document.getElementById('lock-pin-again');
    const pin = a ? a.value : '', again = b ? b.value : '';
    if (!this._supported()) { this._msg('This browser cannot create a PIN lock.', true); return; }
    if (!this._validPin(pin)) { this._msg('Use 4 to 6 digits.', true); return; }
    if (pin !== again) { this._msg('The two PINs are not the same.', true); return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const rec = { u: this._user(), salt: this._b64(salt), hash: await this._hash(pin, salt), it: this.ITER, len: pin.length, at: Date.now() };
    try { localStorage.setItem(this.KEY, JSON.stringify(rec)); } catch (e) { this._msg('Could not save the PIN on this device.', true); return; }
    if (a) a.value = ''; if (b) b.value = '';
    this._msg('PIN lock is on. The app will ask for it when you open it and after a few minutes away.');
    this.renderSettings();
  },
  async disable() {
    const cur = document.getElementById('lock-pin-current');
    const ok = await this._check(cur ? cur.value : '');
    if (!ok) { this._msg('That is not your current PIN.', true); return; }
    try { localStorage.removeItem(this.KEY); } catch (e) { window.warnCaught && window.warnCaught('js/features/app-lock.js', e); }
    if (cur) cur.value = '';
    this._msg('PIN lock is off.');
    this.renderSettings();
  },
  _msg(text, bad) {
    const el = document.getElementById('lock-msg');
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? 'var(--ros,#B3261E)' : 'var(--ink-3,#555)';
  },
  renderSettings() {
    const on = this.enabled();
    const setup = document.getElementById('lock-setup'), off = document.getElementById('lock-off');
    if (setup) setup.hidden = on;
    if (off) off.hidden = !on;
    const st = document.getElementById('lock-state');
    if (st) st.textContent = on ? 'On' : 'Off';
  },

  /* ── checking a PIN ──────────────────────────────────────────────── */
  async _check(pin) {
    const rec = this._read();
    if (!rec || !this._validPin(pin)) return false;
    try { return (await this._hash(pin, this._unb64(rec.salt))) === rec.hash; } catch (e) { return false; }
  },

  /* ── the lock screen ─────────────────────────────────────────────── */
  lock() {
    if (this._locked || !this.enabled()) return;
    this._locked = true;
    const el = document.createElement('div');
    el.id = 'applock';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'App locked');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:var(--bg,#F2F4F3);color:var(--ink,#15201A);display:flex;'
      + 'flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center;font-family:var(--font,system-ui,sans-serif)';
    const h = document.createElement('div'); h.style.cssText = 'font-size:1.1rem;font-weight:700'; h.textContent = 'Abhyas is locked';
    const sub = document.createElement('div'); sub.style.cssText = 'font-size:.85rem;opacity:.75;max-width:30ch'; sub.textContent = 'Enter your PIN to continue.';
    const inp = document.createElement('input');
    inp.id = 'applock-pin'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.autocomplete = 'off';
    inp.setAttribute('aria-label', 'PIN');
    inp.style.cssText = 'font-size:1.6rem;letter-spacing:.5em;text-align:center;width:11ch;min-height:52px;border-radius:12px;'
      + 'border:1.5px solid var(--sep-strong,#999);background:var(--surface,#fff);color:inherit;-webkit-text-security:disc;text-security:disc';
    const err = document.createElement('div'); err.id = 'applock-err'; err.setAttribute('role', 'alert');
    err.style.cssText = 'min-height:1.2em;font-size:.8rem;color:var(--ros,#B3261E)';
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Unlock';
    go.style.cssText = 'min-height:48px;padding:0 2rem;border:none;border-radius:12px;background:var(--accent,#1E7A4C);color:var(--on-accent,#fff);font-weight:700;font-size:.95rem;cursor:pointer;font-family:inherit';
    const forgot = document.createElement('button'); forgot.type = 'button'; forgot.textContent = 'Forgot PIN? Sign out';
    forgot.style.cssText = 'min-height:44px;background:none;border:none;color:var(--ink-3,#555);text-decoration:underline;font-size:.8rem;cursor:pointer;font-family:inherit';
    const attempt = async () => {
      if (Date.now() < (this._coolUntil || 0)) { err.textContent = 'Too many tries. Wait a moment.'; return; }
      go.disabled = true;
      const ok = await this._check(inp.value);
      go.disabled = false;
      if (ok) { this._fails = 0; this._unlock(); return; }
      this._fails++;
      inp.value = '';
      if (this._fails >= 5) { this._coolUntil = Date.now() + Math.min(5 * 60000, 15000 * Math.pow(2, this._fails - 5)); err.textContent = 'Too many tries. Wait a moment.'; }
      else err.textContent = 'Wrong PIN. ' + (5 - this._fails) + ' tries left before a short wait.';
      inp.focus();
    };
    go.addEventListener('click', attempt);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    const want = (this._read() || {}).len || 6;
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, ''); if (inp.value.length === want) attempt(); });
    forgot.addEventListener('click', () => { try { AUTH.logout(); } catch (e) { window.warnCaught && window.warnCaught('js/features/app-lock.js', e); } });
    el.append(h, sub, inp, err, go, forgot);
    document.body.appendChild(el);
    try { document.getElementById('app') && document.getElementById('app').setAttribute('aria-hidden', 'true'); } catch (e) { /* cosmetic */ }
    setTimeout(() => inp.focus(), 50);
  },
  _unlock() {
    this._locked = false;
    const el = document.getElementById('applock');
    if (el) el.remove();
    try { document.getElementById('app') && document.getElementById('app').removeAttribute('aria-hidden'); } catch (e) { /* cosmetic */ }
  },

  /* ── when to lock ────────────────────────────────────────────────── */
  init() {
    if (this._wired) return;
    this._wired = true;
    this.renderSettings();
    if (this.enabled()) this.lock();                                     // on open
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { this._hiddenAt = Date.now(); return; }
      if (this._hiddenAt && Date.now() - this._hiddenAt > this.GRACE_MS) this.lock();
      this._hiddenAt = 0;
    });
  }
};
window.APPLOCK = APPLOCK;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => APPLOCK.init());
else APPLOCK.init();
