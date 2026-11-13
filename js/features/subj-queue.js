// js/features/subj-queue.js — the offline written-answer queue.
// One pending item per (user, kind, questionId): a retake replaces the
// previous queued item instead of stacking.

const SUBJ_QUEUE = {
  KEY: 'abhyas_subj_queue_v1',
  MAX_BYTES: 2 * 1024 * 1024,
  MAX_TOTAL_BYTES: 3.6 * 1024 * 1024,
  MAX_ATTEMPTS: 5,
  _running: false,

  read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; }
    catch (e) { return []; }
  },
  write(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list || [])); return true; }
    catch (e) {
      window.warnCaught && window.warnCaught('js/features/subj-queue.js', e);
      return false;
    }
  },
  add(item) {
    const list = this.read().filter(x => !(
      x.username === item.username &&
      x.kind === item.kind &&
      x.questionId === item.questionId
    ));
    list.push(Object.assign({}, item, { queuedAt: Date.now(), attempts: 0, failed: false }));
    const json = JSON.stringify(list);
    if (json.length > this.MAX_TOTAL_BYTES) return false;
    return this.write(list);
  },
  removeFor(username, kind, questionId) {
    return this.write(this.read().filter(x => !(
      x.username === username && x.kind === kind && x.questionId === questionId
    )));
  },
  forUser(username) {
    return this.read().filter(x => x.username === username);
  },
  resetItem(item) {
    item.attempts = 0;
    item.failed = false;
    delete item.lastError;
    delete item.lastAttemptAt;
  },
  retry(kind, questionId) {
    const user = this._user();
    if (!user) return;
    const list = this.read();
    const item = list.find(x => x.username === user.username && x.kind === kind && x.questionId === questionId);
    if (!item) return;
    this.resetItem(item);
    if (!this.write(list)) return;
    this._refresh();
    if (typeof navigator !== 'undefined' && !navigator.onLine && typeof toast === 'function') {
      toast('Saved. This answer will send when you are back online.');
    }
    this.process();
  },
  retryAll() {
    const user = this._user();
    if (!user) return;
    const list = this.read();
    let changed = false;
    list.forEach(x => {
      if (x.username !== user.username) return;
      this.resetItem(x);
      changed = true;
    });
    if (!changed) return;
    if (!this.write(list)) return;
    this._refresh();
    if (typeof navigator !== 'undefined' && !navigator.onLine && typeof toast === 'function') {
      toast('Saved answers will send when you are back online.');
    }
    this.process();
  },
  async discard(kind, questionId) {
    const user = this._user();
    if (!user) return;
    const item = this.read().find(x => x.username === user.username && x.kind === kind && x.questionId === questionId);
    if (!item) return;
    if (typeof ASK !== 'undefined' && ASK.confirm) {
      const ok = await ASK.confirm({
        title: 'Discard this saved answer?',
        body: 'The PDF is on this device only. Discarding it cannot be undone.',
        ok: 'Discard',
        danger: true
      });
      if (!ok) return;
    }
    this.removeFor(user.username, kind, questionId);
    this._refresh();
    if (typeof toast === 'function') toast('Saved answer discarded.');
  },
  async discardAll() {
    const user = this._user();
    if (!user) return;
    const mine = this.forUser(user.username);
    if (!mine.length) return;
    if (typeof ASK !== 'undefined' && ASK.confirm) {
      const ok = await ASK.confirm({
        title: 'Discard all saved answers?',
        body: 'These are the answers waiting on this device. Discarding them cannot be undone.',
        ok: 'Discard all',
        danger: true
      });
      if (!ok) return;
    }
    this.write(this.read().filter(x => x.username !== user.username));
    this._refresh();
    if (typeof toast === 'function') toast('Saved answers discarded.');
  },
  _user() {
    try { return (typeof S !== 'undefined' && S && S.user) ? S.user : null; }
    catch (e) { return null; }
  },
  _refresh() {
    try { if (typeof MY_SUBJ !== 'undefined' && MY_SUBJ.render) MY_SUBJ.render(); } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
  },

  async process() {
    if (this._running) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    /* Respect the app's own connection state too. A forced-offline student
       must not have saved answer PDFs uploaded by the 60-second background
       retry while they are trying to save data. */
    try {
      if (typeof S !== 'undefined' && S && (S.forcedOffline || !S.online)) return;
    } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
    let user = null;
    try { user = (typeof S !== 'undefined' && S && S.user) ? S.user : null; } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
    if (!user || !user.token) return;
    const list = this.read();
    if (!list.length) return;
    this._running = true;
    const remaining = [];
    let sentAny = false;
    let newlyFailed = 0;
    try {
      for (const item of list) {
        if (item.username !== user.username) { remaining.push(item); continue; }
        if (item.failed) { remaining.push(item); continue; }
        item.attempts = (item.attempts || 0) + 1;
        item.lastAttemptAt = Date.now();
        try {
          const res = await this._send(item, user);
          if (res && (res.success || res.alreadySubmitted)) {
            sentAny = true;
            this._markSubmitted(item);
            continue;
          }
          item.lastError = (res && res.error) || (res && res.sessionInvalid ? 'Your session expired. Sign in again.' : 'The server did not accept this answer.');
          if (item.attempts >= this.MAX_ATTEMPTS) { item.failed = true; newlyFailed++; }
          remaining.push(item);
        } catch (e) {
          item.lastError = (e && e.message) || 'Network error while sending.';
          if (item.attempts >= this.MAX_ATTEMPTS) { item.failed = true; newlyFailed++; }
          remaining.push(item);
        }
      }
      this.write(remaining);
    } finally {
      this._running = false;
    }
    if (sentAny && typeof toast === 'function') toast('✅ Queued answer sent.', 4500);
    if (newlyFailed && typeof toast === 'function') {
      toast('⚠️ A saved answer could not be sent. Open My submissions to retry or discard it — it has not been deleted.', 8000);
    }
    this._refresh();
    try { if (typeof SUBJ !== 'undefined') { SUBJ._renderQotd(); SUBJ._renderExam(); } } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
    try { if (typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh(); } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
  },

  _markSubmitted(item) {
    if (item.kind === 'qotd') {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_QOTD) || 'null');
        if (raw) { raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_QOTD, JSON.stringify(raw)); }
      } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
      try { if (typeof QOTD !== 'undefined' && QOTD) { QOTD.submitted = true; QOTD.submittedAt = Date.now(); QOTD.queued = false; } } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
    }
    if (item.kind === 'exam') {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_EXAM) || 'null');
        if (raw) { raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_EXAM, JSON.stringify(raw)); }
      } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
      try { if (typeof EXAM !== 'undefined' && EXAM) { EXAM.submitted = true; EXAM.submittedAt = Date.now(); EXAM.queued = false; } } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); }
    }
  },

  async _send(item, user) {
    /* submitSubjectiveAnswer is Supabase per handover §3. Route explicitly
       rather than going through GAS_URL, which would 404. */
    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.SUPABASE_URL) || '';
    if (!url) return { success: false, error: 'Backend URL not configured.' };
    const body = JSON.stringify({
      action: 'submitSubjectiveAnswer',
      username: user.username, token: user.token,
      kind: item.kind,
      questionId: item.questionId,
      questionText: item.questionText,
      chapterId: item.chapterId,
      marks: item.marks,
      solveSec: item.solveSec,
      startedAt: item.startedAt,
      pdfData: item.pdfData,
      filename: item.filename
    });
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 45000) : null;
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body, signal: ctrl && ctrl.signal
      });
      if (timer) clearTimeout(timer);
      if (!r.ok) return { success: false, error: 'HTTP ' + r.status };
      return await r.json();
    } catch (e) {
      if (timer) clearTimeout(timer);
      throw e;
    }
  },

  _scheduled: false,
  scheduleProcess() {
    if (this._scheduled) return;
    this._scheduled = true;
    setTimeout(() => {
      this._scheduled = false;
      this.process().catch(() => {});
    }, 1200);
  }
};

window.addEventListener('online', () => SUBJ_QUEUE.scheduleProcess());
setTimeout(() => SUBJ_QUEUE.scheduleProcess(), 3000);
setInterval(() => { try { SUBJ_QUEUE.process(); } catch (e) { window.warnCaught && window.warnCaught('js/features/subj-queue.js', e); } }, 60000);
window.SUBJ_QUEUE = SUBJ_QUEUE;