// js/features/refresh.js — "Refresh everything".
//
// One tap, outside a quiz, does every useful refresh and reports each step in words, IN PLACE:
// the list lives in Settings -> Data tools and, for the Home header and the More menu (which
// are not on that screen), in the page-level #refresh-status panel. There is no blocking
// loading screen and the student can keep using the app while it works.
//
//   Chapters   is chapters-data.js current?                      (ChapterDataStatus.checkNow)
//   App        is there a newer version of the app?              (service worker update)
//   Questions  are the question files saved on this device current?  (DATA.refreshQuestions)
//   Progress   is the latest work backed up?                     (PSYNC.pushNow)
//   Tidy       broken cached files and old build caches          (DATA.cleanupCache)
//
// It reuses the Data tools that already exist rather than carrying its own copies, and it never
// touches progress, notes, saved questions or the miss list.
const REFRESH = {
  running: false,
  _lines: [],

  inQuiz() { try { return !!(S.quiz && S.quiz.active); } catch (e) { return false; } },
  online() { try { return !!S.online && !S.forcedOffline; } catch (e) { return false; } },
  ver() { return (typeof APP_VERSION !== 'undefined') ? APP_VERSION : ''; },

  /* ── the in-place progress list ────────────────────────────────────── */
  _set(key, label, state, text) {
    const i = this._lines.findIndex(l => l.key === key);
    const line = { key, label, state, text };
    if (i < 0) this._lines.push(line); else this._lines[i] = line;
    this._paint();
  },
  /* Every [data-refresh-steps] list is painted, so the report is never written somewhere that
     is not on screen: the Settings card has one, and #refresh-status has one for the two
     controls that live outside Settings. */
  _paint() {
    document.querySelectorAll('[data-refresh-steps]').forEach(ul => this._paintInto(ul));
  },
  _paintInto(ul) {
    ul.textContent = '';
    this._lines.forEach(l => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;gap:.55rem;align-items:flex-start;padding:.2rem 0;font-size:.82rem';
      const ic = document.createElement('i');
      ic.setAttribute('aria-hidden', 'true');
      ic.className = 'ph ' + ({ working: 'ph-circle-notch', ok: 'ph-check-circle', warn: 'ph-warning', skip: 'ph-minus-circle' }[l.state] || 'ph-circle');
      ic.style.cssText = 'margin-top:.12rem;color:' + (l.state === 'ok' ? 'var(--accent)' : l.state === 'warn' ? 'var(--ros,#B3261E)' : 'var(--ink-3)');
      if (l.state === 'working') ic.classList.add('refresh-spin');
      const t = document.createElement('div');
      const b = document.createElement('b'); b.textContent = l.label + ': ';
      t.append(b, document.createTextNode(l.text));
      li.append(ic, t);
      ul.appendChild(li);
    });
  },
  /* The page-level report. In Settings the same list is already in the card, so the panel is
     not shown there; it is also cleared when the student leaves the screen. */
  _panel(on) {
    const p = document.getElementById('refresh-status');
    if (p) p.hidden = !on;
  },
  hide() { this._panel(false); },
  _onDataScreen() {
    const v = document.getElementById('view-data');
    return !!(v && v.classList.contains('on'));
  },
  _busy(on) {
    this.running = on;
    /* every Refresh control: the Home header button and the More-menu item */
    document.querySelectorAll('[data-refresh-btn]').forEach(b => { b.classList.toggle('is-busy', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); });
    document.querySelectorAll('[data-on-click="SETTINGS.refreshQuestions()"]').forEach(x => { x.disabled = on; x.setAttribute('aria-busy', on ? 'true' : 'false'); });
  },
  /* CACHE reports "Refreshing downloads · 12/80" here while the button is working. */
  _onBadge(msg) {
    if (msg === null || msg === undefined) return;
    this._set('questions', 'Questions', 'working', 'Checking saved question sets ' + String(msg).replace(/^Refreshing downloads\s*·\s*/, ''));
  },

  /* ── Refresh everything ────────────────────────────────────────────── */
  async run() {
    if (this.running) return false;
    if (this.inQuiz()) { toast('Finish or leave your quiz first, then refresh.'); return false; }
    this._lines = [];
    this._paint();
    this._panel(!this._onDataScreen());
    if (!this.online()) {
      this._set('net', 'Connection', 'warn', 'You are offline. Refresh needs the internet; your saved questions still work.');
      toast('You are offline. Nothing to refresh right now.');
      return false;
    }
    this._busy(true);
    const notes = [];
    try {
      /* 1. chapters */
      this._set('chapters', 'Chapters', 'working', 'Checking for new chapters\u2026');
      try {
        if (window.ChapterDataStatus) {
          await window.ChapterDataStatus.checkNow();
          const r = window.ChapterDataStatus.status().lastCheck;
          const said = r.result === 'new version' ? 'New chapters found and applied.' : r.result === 'up to date' ? 'Up to date.'
            : r.result ? 'Could not check (' + r.result + ').' : 'Checked.';
          this._set('chapters', 'Chapters', r.result === 'new version' || r.result === 'up to date' ? 'ok' : 'warn', said);
          if (r.result === 'new version') notes.push('new chapters');
        } else this._set('chapters', 'Chapters', 'skip', 'Not available.');
      } catch (e) { this._set('chapters', 'Chapters', 'warn', 'Could not check right now.'); }

      /* 2. the app itself */
      this._set('app', 'App', 'working', 'Looking for a new version\u2026');
      try {
        const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null;
        if (reg) {
          await reg.update();
          const fresh = !!(reg.installing || reg.waiting);
          this._set('app', 'App', 'ok', fresh ? 'A newer version is being installed. You will be asked to reload.' : 'Up to date (v' + this.ver() + ').');
          if (fresh) notes.push('a new app version');
        } else this._set('app', 'App', 'ok', 'Up to date (v' + this.ver() + ').');
      } catch (e) { this._set('app', 'App', 'skip', 'Could not check right now.'); }

      /* 3. the question files */
      this._set('questions', 'Questions', 'working', 'Fetching the newest question files\u2026');
      try {
        const done = await DATA.refreshQuestions({ quiet: true });
        const q = DATA._lastRefresh;
        if (!done) this._set('questions', 'Questions', 'skip', 'Not available right now.');
        else if (!q) this._set('questions', 'Questions', 'ok', 'Fetched the newest copy of the last chapter you used.');
        else if (q.skipped === 'download-running') this._set('questions', 'Questions', 'skip', 'A download is already running; it will finish first.');
        else if (q.skipped) this._set('questions', 'Questions', 'skip', 'Nothing to check yet.');
        else if (!q.total) this._set('questions', 'Questions', 'ok', 'No question sets are saved for offline yet. Use "Download all sets" to save them.');
        else {
          const bits = [];
          if (q.updated) bits.push(q.updated + (q.updated === 1 ? ' set updated' : ' sets updated'));
          if (q.added) bits.push(q.added + (q.added === 1 ? ' set added' : ' sets added'));
          if (q.orphans) bits.push(q.orphans + ' no longer in the list, removed');
          if (q.failed) bits.push(q.failed + ' could not be checked');
          this._set('questions', 'Questions', q.failed ? 'warn' : 'ok', (bits.length ? bits.join(', ') : 'All ' + q.total + ' saved sets are current') + '.');
          if (q.updated || q.added) notes.push((q.updated + q.added) + ' question sets');
        }
      } catch (e) { this._set('questions', 'Questions', 'warn', 'Could not check the saved sets.'); }

      /* 4. progress */
      this._set('progress', 'Progress', 'working', 'Backing up\u2026');
      try {
        if (S.user && S.user.token && typeof PSYNC !== 'undefined' && PSYNC.pushNow) {
          await PSYNC.pushNow();
          const d = PSYNC.describe();
          this._set('progress', 'Progress', d.state === 'error' ? 'warn' : 'ok', d.text);
        } else this._set('progress', 'Progress', 'ok', 'Saved on this device.');
      } catch (e) { this._set('progress', 'Progress', 'warn', 'Could not back up right now; it will retry.'); }

      /* 5. tidy: only what is provably useless (see DATA.cleanupCache) */
      this._set('tidy', 'Tidy', 'working', 'Clearing old files\u2026');
      try {
        const t = await DATA.cleanupCache();
        const bits = [];
        if (t.stale) bits.push(t.stale + ' broken ' + (t.stale === 1 ? 'download' : 'downloads'));
        if (t.buckets) bits.push(t.buckets + ' old app ' + (t.buckets === 1 ? 'cache' : 'caches'));
        this._set('tidy', 'Tidy', 'ok', bits.length ? 'Removed ' + bits.join(', ') + '.' : 'Nothing to clear.');
      } catch (e) { this._set('tidy', 'Tidy', 'skip', 'Nothing to clear.'); }

      try { if (window.SETTINGS && SETTINGS.renderStorage) await SETTINGS.renderStorage(); } catch (e) { window.warnCaught && window.warnCaught('js/features/refresh.js', e); }
      this._paint();
      toast(notes.length ? 'Refreshed: ' + notes.join(', ') + '.' : 'Everything is up to date.', 5000);
      return true;
    } finally {
      this._busy(false);
    }
  }
};
/* Leaving the screen takes the report with it: it describes what just happened here, and
   Settings keeps its own copy in the card. */
if (typeof UI !== 'undefined' && UI.onEnterAny) UI.onEnterAny(() => REFRESH.hide());

window.REFRESH = REFRESH;
