/* ===================================================================
 * js/features/sprint.js — 60-day sprint page + Home strip (v2).
 *
 * Brain:   js/features/sprint-plan.js    (what to study on which day; pure, tested)
 * Memory:  js/features/sprint-log.js     (one durable record per day)
 * Words:   js/features/sprint-report.js  (daily remarks, grade, text report)
 * This file connects them to the real app: reads coverage, draws the screen,
 * launches the practice, and listens for finished sessions.
 * =================================================================== */
(function () {
  'use strict';

  /* Falls back to English when i18n.js is not loaded (or the key is missing). */
  const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);

  const P = window.SPRINT_PLAN, LOG = window.SPRINT_LOG, REP = window.SPRINT_REPORT;

  const KEY_START = 'abhyas_sprint_start';
  const KEY_EXAM_LEGACY = 'abhyas_sprint_exam';   // older builds: never settable from any screen
  const KEY_EXAM  = 'abhyas_exam_date';           // the ONE exam date (Home countdown, Today plan and the sprint share it)
  const KEY_REST  = 'abhyas_sprint_rest';
  const KEY_OFF   = 'abhyas_sprint_off';
  const KEY_FOCUS = 'abhyas_sprint_focus';
  const FOCUS_DEFAULT_LEVELS = ['level7', 'gk'];
  const FOCUS_LEVELS = ['level7', 'level5', 'gk'];
  const FOCUS_LABELS = { level7: 'Level 7', level5: 'Level 5', gk: 'General Knowledge' };
  const PLAN_LEVEL_LABELS = { l7: 'Level 7', level5: 'Level 5', gk: 'General Knowledge' };

  const PERMIN = 0.9;                    // minutes per practice question (unchanged from v1)
  let _inited = false;
  let _counting = false;                 // "Count my syllabus" is running
  let _countMsg = '';

  // ── settings (kept in the same localStorage keys, so Reset Progress and cloud sync keep working) ──
  function _iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _todayIso() { return _iso(new Date()); }
  /** start, the real exam date (may be ''), and `end` = the last day of the sprint:
   *  60 days, or the day before the exam if that comes sooner (as the exam-date dialog promises). */
  function _read() {
    let start = null, examDate = '', rest = [], off = [];
    try {
      start = localStorage.getItem(KEY_START);
      examDate = localStorage.getItem(KEY_EXAM) || '';
      if (!P.validIso(examDate)) examDate = localStorage.getItem(KEY_EXAM_LEGACY) || '';
      rest  = JSON.parse(localStorage.getItem(KEY_REST) || '[]');
      off   = JSON.parse(localStorage.getItem(KEY_OFF)  || '[]');
    } catch (e) { /* use defaults */ }
    if (!Array.isArray(rest)) rest = [];
    if (!Array.isArray(off)) off = [];
    if (!P.validIso(start)) { start = _todayIso(); try { localStorage.setItem(KEY_START, start); } catch (e) { window.warnCaught && window.warnCaught('js/features/sprint.js', e); } }
    if (!P.validIso(examDate) || examDate <= start) examDate = '';
    let end = P.addDays(start, 59);
    if (examDate && P.addDays(examDate, -1) < end) end = P.addDays(examDate, -1);
    return { start, end, examDate, rest: rest.filter(P.validIso), off: off.filter(P.validIso) };
  }
  function _write(field, value) {
    try {
      localStorage.setItem(
        field === 'rest' ? KEY_REST : field === 'off' ? KEY_OFF : field === 'exam' ? KEY_EXAM : KEY_START,
        typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) { /* storage full / private mode */ }
  }

  // ── eligible pool: every exam level, excluding "original" books ──────────────────────────
  function _lvKey(lv) {
    const v = String(lv || '').toLowerCase();
    return v === 'gk' ? 'gk' : v === 'level5' ? 'level5' : v === 'level7' ? 'level7' : v;
  }
  function _focusKey(lv, ch) { return _lvKey(lv) + '|' + String(ch == null ? '' : ch); }
  /* The last subchapter of every chapter is the "Original Questions" bank: source copies of the
     same questions already classified under the chapter's real subtopics. Counting it would
     schedule duplicates in different arrangements, so it is never eligible for the plan. */
  function _isOldQuestionBank(meta) {
    if (!meta) return false;
    const label = [meta.book, meta.subchapter, meta.subtopic, meta.name, meta.title]
      .filter(Boolean).join(' ');
    return /\boriginal\b/i.test(label) || /\bold\s+questions?\b/i.test(label);
  }
  function isEligible(meta) {
    if (!meta) return false;
    if (FOCUS_LEVELS.indexOf(_lvKey(meta.level)) === -1) return false;
    return !_isOldQuestionBank(meta);
  }
  function _allTopicRefs() {
    try {
      if (typeof ChapterData === 'undefined' || !ChapterData.allFileRefs) return [];
      return ChapterData.allFileRefs().filter((r) => isEligible({
        level: r.lv, book: r.book, subtopic: r.subtopic, name: r.name
      }));
    } catch (e) { return []; }
  }
  function _focusSet() {
    try {
      const raw = localStorage.getItem(KEY_FOCUS);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? new Set(arr.filter((x) => typeof x === 'string')) : null;
    } catch (e) { return null; }
  }
  function _defaultFocusKeys(refs) {
    return new Set((refs || []).filter((r) => FOCUS_DEFAULT_LEVELS.indexOf(_lvKey(r.lv)) !== -1).map((r) => _focusKey(r.lv, r.ch)));
  }
  function _eligibleRefs() {
    const refs = _allTopicRefs();
    const focus = _focusSet();
    if (focus) return refs.filter((r) => focus.has(_focusKey(r.lv, r.ch)));
    return refs.filter((r) => FOCUS_DEFAULT_LEVELS.indexOf(_lvKey(r.lv)) !== -1);
  }
  /* All chapters a student can focus on, grouped by level. Level 5 is offered here even though
     the default plan stays Level 7 + GK, so choosing it is an explicit student decision. */
  function _topicGroups() {
    const groups = {}, order = [];
    _allTopicRefs().forEach((r) => {
      const lv = _lvKey(r.lv);
      if (FOCUS_LEVELS.indexOf(lv) === -1) return;
      if (!groups[lv]) { groups[lv] = { lv, chapters: {}, order: [] }; order.push(lv); }
      const g = groups[lv], key = String(r.ch == null ? '' : r.ch);
      if (!g.chapters[key]) {
        let name = key;
        try { name = ChapterData.chapterName(r.lv, r.ch) || key; } catch (e) { /* fall back to the chapter id */ }
        g.chapters[key] = { key: _focusKey(r.lv, r.ch), ch: r.ch, name, n: 0, seen: 0, sets: 0 };
        g.order.push(key);
      }
      const c = g.chapters[key];
      c.sets++;
      const n = Math.max(0, Number((_S().fcount || {})[r.fid]) || 0);
      c.n += n;
      c.seen += _seenIn(r.fid, n);
    });
    return FOCUS_LEVELS.filter((lv) => groups[lv]).map((lv) => ({
      lv,
      label: FOCUS_LABELS[lv],
      chapters: groups[lv].order.map((k) => groups[lv].chapters[k])
    }));
  }
  const _S = () => (typeof S !== 'undefined' ? S : {});

  function _seenIn(fid, n) {
    const c = (_S().cov || {})[fid];
    if (!c || !c.p) return 0;
    let seen = 0;
    for (let i = 0; i < c.p.length && i < n; i++) if (c.p[i] !== '0') seen++;
    return seen;
  }

  /** Per-chapter accuracy from recorded sessions; null until that chapter has enough answers. */
  function _chapterAccuracy(refs) {
    const byFid = {};
    refs.forEach((r) => { byFid[r.fid] = _focusKey(r.lv, r.ch); });
    const sums = {};
    ((_S().prog && _S().prog.sessions) || []).forEach((s) => {
      const key = s && byFid[s.fid], total = Number(s && s.total) || 0;
      if (!key || total < 1) return;
      const a = sums[key] || (sums[key] = { c: 0, t: 0 });
      a.t += total; a.c += Number(s.correct) || 0;
    });
    const out = {};
    Object.keys(sums).forEach((key) => {
      const a = sums[key];
      out[key] = a.t >= 10 ? Math.round(a.c / a.t * 100) : null;
    });
    return out;
  }

  /** The syllabus as the planner needs it. Files whose size is not known yet are counted separately. */
  function _syllabus() {
    const fcount = _S().fcount || {};
    const refs = _eligibleRefs();
    const chapterAcc = _chapterAccuracy(refs);
    const units = [], unknown = [];
    refs.forEach((r) => {
      const n = fcount[r.fid];
      if (n == null) { unknown.push(r); return; }
      let name = r.fid;
      try { name = ChapterData.chapterName(r.lv, r.ch) || r.fid; } catch (e) { window.warnCaught && window.warnCaught('js/features/sprint.js', e); }
      const acc = chapterAcc[_focusKey(r.lv, r.ch)];
      units.push({
        fid: r.fid, lv: r.lv, ch: r.ch, book: r.book, name, n: Number(n) || 0,
        seen: _seenIn(r.fid, Number(n) || 0), priority: acc == null ? 100 : acc,
      });
    });
    return { units, unknown };
  }

  function _fidOfQ(q) {
    if (!q) return '';
    if (q.fileId) return String(q.fileId);
    const uid = String(q.uid || ''), i = uid.lastIndexOf('_');
    return i > 0 ? uid.slice(0, i) : '';
  }
  function _focusFids() { return new Set(_eligibleRefs().map((r) => r.fid)); }
  function _dueReviews() {
    const fids = _focusFids();
    try {
      if (typeof REV !== 'undefined' && REV.dueWrong) return REV.dueWrong().filter((q) => fids.has(_fidOfQ(q))).length;
    } catch (e) { window.warnCaught && window.warnCaught('js/features/sprint.js', e); }
    const now = Date.now();
    return ((_S().wr) || []).filter((q) => q && !q._withdrawn && fids.has(_fidOfQ(q)) && (q._nextDue == null || Number(q._nextDue) <= now)).length;
  }

  function _streak() {
    try { return (typeof STREAK !== 'undefined' && STREAK.currentStreak) ? STREAK.currentStreak() : 0; } catch (e) { return 0; }
  }

  // ── plan + today's targets ───────────────────────────────────────────────────────────────
  function _plan() {
    const cfg = _read();
    const today = _todayIso();
    const { units, unknown } = _syllabus();
    const seenAll = units.reduce((a, u) => a + u.seen, 0);
    if (!LOG.baseline() || LOG.baseline().start !== cfg.start) LOG.setBaseline(cfg.start, seenAll - (LOG.dayRec(today).newSeen || 0));
    const base = LOG.baseline();
    const plan = P.buildPlan({
      units, today, start: cfg.start, exam: cfg.end, rest: cfg.rest, off: cfg.off,
      newDoneToday: (LOG.days()[today] || {}).newSeen || 0, baselineSeen: base ? base.seen : 0,
    });
    plan.unknownFiles = unknown;
    plan.cfg = cfg;
    plan.mastery = _syllabusAccuracy(plan);
    plan.mastered = plan.status === 'complete' && plan.mastery.met;
    const days = LOG.days();
    const rate = P.recentRate(days, today, cfg.rest, cfg.off, 7);
    plan.rate = Math.round(rate * 10) / 10;
    plan.projectedFinish = plan.remaining === 0 ? today : P.projectFinish(plan.remaining, rate, today, cfg.rest, cfg.off);
    return plan;
  }

  function _targets(plan) {
    const today = _todayIso();
    const rec = LOG.days()[today] || { q: 0, sec: 0, newSeen: 0, kinds: {}, mocks: [] };
    const kinds = rec.kinds || {};
    const phase = plan.phase;
    const due = _dueReviews();
    const reviewDone = kinds.review || 0;

    const newT = plan.unknownFiles.length ? plan.quotaToday : (((LOG.days()[today] || {}).planned || {}).new || plan.quotaToday);
    if (!plan.unknownFiles.length && plan.quotaToday) LOG.setPlanned(today, plan.quotaToday);

    const reviewT = Math.min(30, due + reviewDone);                               // only what actually exists
    const focusFids = _focusFids();
    const wrongCount = ((_S().wr) || []).filter((q) => q && !q._withdrawn && focusFids.has(_fidOfQ(q))).length;
    const drillT = phase === 'Learn' ? (wrongCount ? Math.min(15, wrongCount + (kinds.drill || 0)) : 0)
                 : phase === 'Drill' ? 40 : (wrongCount ? 20 : 0);
    const mockT = phase === 'Mock' ? 1 : 0;

    const mockDone = (rec.mocks || []).length;
    const minutes = Math.round((newT + reviewT + drillT) * PERMIN + mockT * 75);
    const leftNew = Math.max(0, newT - (rec.newSeen || 0));
    const leftReviews = Math.max(0, reviewT - reviewDone);
    const leftDrill = Math.max(0, (phase === 'Mock' ? mockT : drillT) - (phase === 'Mock' ? mockDone : (kinds.drill || 0)));
    const minutesLeft = Math.round((leftNew + leftReviews + leftDrill) * PERMIN + (phase === 'Mock' ? Math.max(0, mockT - mockDone) * 75 : 0));
    return {
      phase,
      new:     { done: rec.newSeen || 0, target: newT },
      reviews: { done: reviewDone, target: reviewT },
      drill:   phase === 'Mock' ? { done: mockDone, target: mockT, label: T('Mock test') } : { done: kinds.drill || 0, target: drillT, label: 'Drill' },
      time:    { done: Math.round((rec.sec || 0) / 60), target: Math.max(10, minutes) },
      due, minutesLeft,
    };
  }

  // ── helpers for drawing ──────────────────────────────────────────────────────────────────
  function _esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function _setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function _fmtMinutes(m) { if (m < 60) return m + 'm'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? ' ' + r + 'm' : ''); }
  function _fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()] + ', ' + d + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
  }
  function _bar(label, pct, cls) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="bar thin ' + (cls || '') + '" role="progressbar" aria-label="' + _esc(label) + '" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p + '%"></i></div>';
  }
  function _pill(text, tone) { return '<span class="sp-pill ' + (tone || '') + '">' + _esc(text) + '</span>'; }
  function _lvLabel(lv) {
    const v = _lvKey(lv);
    return v === 'gk' ? 'GK' : v === 'level5' ? 'Level 5' : 'Level 7';
  }

  /* "Complete" means two things: every question has been seen AND accuracy on the syllabus is at least
     MASTERY_GOAL%. Accuracy comes from practice sessions that belong to a syllabus chapter (session.fid). */
  const MASTERY_GOAL = 85;
  function _syllabusAccuracy(plan) {
    const fids = new Set((plan.perUnit || []).map((u) => u.fid));
    const by = {}; let c = 0, t = 0;
    ((typeof S !== 'undefined' && S.prog && S.prog.sessions) || []).forEach((x) => {
      const tot = Number(x && x.total) || 0;
      if (!tot || !fids.has(x.fid)) return;
      const k = by[x.fid] || (by[x.fid] = { t: 0, c: 0 });
      k.t += tot; k.c += Number(x.correct) || 0; t += tot; c += Number(x.correct) || 0;
    });
    const below = (plan.perUnit || []).filter((u) => by[u.fid] && by[u.fid].t >= 5 && Math.round(by[u.fid].c / by[u.fid].t * 100) < MASTERY_GOAL)
      .map((u) => ({ name: u.name, acc: Math.round(by[u.fid].c / by[u.fid].t * 100) })).sort((a, b) => a.acc - b.acc);
    const overall = t >= 20 ? Math.round(c / t * 100) : null;      // too few answers to judge
    return { goal: MASTERY_GOAL, overall, attempted: t, below, met: overall !== null && overall >= MASTERY_GOAL };
  }

  const STATUS = {
    'covered':    { icon: 'ph-target',        cls: 'warn', text: T('All covered — raise accuracy to 85%') },
    'ahead':      { icon: 'ph-trend-up',      cls: 'ok',   text: T('Ahead of schedule') },
    'on-track':   { icon: 'ph-check-circle',  cls: 'ok',   text: T('On track for exam day') },
    'behind':     { icon: 'ph-warning',       cls: 'warn', text: T('Behind schedule') },
    'compressed': { icon: 'ph-warning',       cls: 'warn', text: T('Syllabus still unfinished') },
    'complete':   { icon: 'ph-seal-check',    cls: 'ok',   text: T('Syllabus complete') },
  };

  // ── Home strip ───────────────────────────────────────────────────────────────────────────
  function renderHomeStrip() {
    const el = document.getElementById('sprint-card');
    if (!el) return;
    const plan = _plan();
    const t = _targets(plan);
    const pct = Math.round(plan.dayNum / plan.N * 100);
    let sub;
    if (plan.unknownFiles.length) sub = T('Set up your syllabus to get daily chapters');
    else if (plan.status === 'complete' && !plan.mastered) sub = 'All covered \u00b7 accuracy ' + (plan.mastery.overall === null ? '\u2014' : plan.mastery.overall + '%') + ' (goal ' + MASTERY_GOAL + '%)';
    else if (plan.status === 'complete') sub = 'Syllabus complete \u00b7 ' + t.reviews.target + ' reviews due';
    else if (plan.status === 'behind' || plan.status === 'compressed') sub = plan.todayRemaining + ' new today \u00b7 behind by ' + plan.behindBy;
    else sub = plan.todayRemaining + ' new \u00b7 ' + t.due + ' reviews due';
    el.style.display = '';
    el.setAttribute('data-on-click', "UI.go('sprint')");
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.innerHTML =
      '<div class="sp-ic"><i class="ph ph-calendar-check"></i></div>' +
      '<div class="sp-body">' +
        '<div class="sp-title">Day ' + plan.dayNum + ' <small>' + plan.phase + '</small></div>' +
        '<div class="sp-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sp-sub">' + _esc(sub) + '</div>' +
      '</div>' +
      '<div class="sp-chev"><i class="ph ph-arrow-right"></i></div>';
  }

  // ── Page ─────────────────────────────────────────────────────────────────────────────────
  function renderPage() {
    let plan;
    try { plan = _plan(); } catch (e) { console.error('[SPRINT] plan failed', e); return; }
    const t = _targets(plan);
    const steps = [
      () => _renderHeader(plan, t),
      () => _renderToday(plan, t),
      () => _renderCoverage(plan),
      () => _renderUpcoming(plan),
      () => _renderWeek(plan),
      () => _renderReports(plan),
      () => _renderJourney(plan),
      () => _renderSettings(plan),
    ];
    steps.forEach((fn) => { try { fn(); } catch (e) { console.error('[SPRINT] render step failed', e); } });
  }

  function _renderHeader(plan, t) {
    _setText('sprint-phase-label', plan.phase + ' phase');
    _setText('sprint-day-meta', 'Day ' + plan.dayNum + ' of ' + plan.N);
    _setText('sprint-today-date', _fmtDate(_todayIso()));
    const applicable = ['new', 'reviews', 'drill', 'time'].filter((k) => t[k].target > 0);
    const score = applicable.length ? applicable.reduce((a, k) => a + Math.min(1, t[k].done / t[k].target), 0) / applicable.length : 1;
    const doneN = applicable.filter((k) => t[k].done >= t[k].target).length;
    const pct = Math.round(score * 100);
    _setHtml('sprint-today-pct', pct + '<span class="pct">%</span>');
    _setHtml('sprint-today-cap',
      '<strong>' + doneN + ' of ' + applicable.length + '</strong> targets done<br>' +
      '<span class="streak"><i class="ph ph-flame"></i><span><span id="sprint-streak">' + _streak() + '</span>-day streak</span></span>');
    const bar = document.querySelector('#sprint-today-bar > i');
    if (bar) bar.style.width = pct + '%';
    const host = document.getElementById('sprint-today-bar');
    if (host) host.setAttribute('aria-valuenow', pct);

    ['new', 'reviews', 'drill', 'time'].forEach((key) => {
      const tgt = document.querySelector('.target[data-target="' + key + '"]');
      if (!tgt) return;
      const d = t[key];
      const lbl = tgt.querySelector('.target-lbl');
      if (lbl) lbl.textContent = key === 'new' ? 'New' : key === 'reviews' ? 'Reviews' : key === 'drill' ? (d.label || 'Drill') : 'Time';
      const v = tgt.querySelector('.v'), of = tgt.querySelector('.of'), fill = tgt.querySelector('.bar > i');
      if (v) v.textContent = key === 'time' ? _fmtMinutes(d.done) : String(d.done);
      if (of) of.textContent = d.target > 0 ? '/ ' + (key === 'time' ? _fmtMinutes(d.target) : d.target) : T('none due ✓');
      if (fill) fill.style.width = (d.target > 0 ? Math.min(100, Math.round(d.done / d.target * 100)) : 100) + '%';
      tgt.classList.toggle('done', d.target > 0 && d.done >= d.target);
    });
    const hint = document.getElementById('sprint-targets-hint');
    if (hint) hint.textContent = t.minutesLeft > 0
      ? T('~{m} left today', { m: _fmtMinutes(t.minutesLeft) })
      : T('All targets done');

    // plan status line
    const st = STATUS[plan.status === 'complete' && !plan.mastered ? 'covered' : plan.status] || STATUS['on-track'];
    const paceEl = document.getElementById('sprint-pace-verdict');
    if (paceEl) {
      let detail = '';
      if (plan.status === 'behind') detail = ' \u2014 ' + plan.behindBy + ' questions behind; ' + plan.requiredPerDay + ' a day finishes it by ' + _fmtDate(plan.finishesOn || plan.learnEnd);
      else if (plan.status === 'compressed') detail = ' \u2014 ' + plan.remaining + ' left; ' + plan.requiredPerDay + ' a day finishes by ' + _fmtDate(plan.finishesOn || plan.exam);
      else if (plan.status === 'ahead') detail = ' by ' + plan.aheadBy + ' questions';
      paceEl.className = 'pace-item ' + st.cls;
      paceEl.innerHTML = '<i class="ph ' + st.icon + '"></i><span><strong>' + st.text + '</strong>' + _esc(detail) + '</span>';
    }
    const examEl = document.getElementById('sprint-exam-date');
    if (examEl) examEl.innerHTML = plan.cfg.examDate
      ? '<i class="ph ph-calendar"></i><span>Exam <strong>' + _esc(_fmtDate(plan.cfg.examDate)) + '</strong></span>'
      : '<i class="ph ph-calendar"></i><span>Sprint ends <strong>' + _esc(_fmtDate(plan.exam)) + '</strong> \u00b7 set your exam date below</span>';
  }

  function _row(icon, cls, title, sub, label, attrs, done) {
    return '<div class="list-row' + (done ? ' is-done' : '') + '">' +
      '<div class="row-ic ' + cls + '"><i class="ph ' + icon + '"></i></div>' +
      '<div class="row-body"><div class="row-title">' + _esc(title) + '</div><div class="row-sub">' + _esc(sub) + '</div></div>' +
      (done ? '<span class="row-done"><i class="ph ph-check-circle"></i> ' + T('Done') + '</span>'
            : '<button class="row-btn' + (cls === 'review' ? ' ghost' : '') + '" type="button" ' + attrs + '>' + _esc(label) + '</button>') +
      '</div>';
  }

  function _renderToday(plan, t) {
    const host = document.getElementById('sprint-today-list');
    if (!host) return;
    const rows = [];

    if (plan.unknownFiles.length) {
      rows.push(_row('ph-books', '', T('Set up your syllabus'), T('Count the questions so every chapter gets a day'), T('Set up'), 'data-sprint="count"'));
    }
    const onRest = plan.quotaToday === 0 && plan.remaining > 0 && plan.status !== 'compressed';
    if (plan.remaining > 0 && plan.todaySlices.length) {
      plan.todaySlices.forEach((s) => {
        rows.push(_row('ph-chart-line', '', s.name,
          s.count + ' new question' + (s.count === 1 ? '' : 's') + ' \u00b7 ' + _lvLabel(s.lv) + ' \u00b7 about ' + _fmtMinutes(Math.round(s.count * PERMIN)),
          'Start', 'data-sprint="new" data-fid="' + _esc(s.fid) + '" data-count="' + s.count + '"'));
      });
    } else if (plan.remaining > 0 && plan.todayRemaining === 0 && plan.quotaToday > 0) {
      rows.push(_row('ph-check-circle', '', T('New questions for today'), plan.quotaToday + ' of ' + plan.quotaToday + ' covered', '', '', true));
    } else if (onRest) {
      rows.push(_row('ph-moon', '', T('Rest day'), T('No new questions today. The plan has spread them over the other days.'), '', '', true));
    } else if (plan.remaining === 0 && !plan.unknownFiles.length) {
      rows.push(_row('ph-seal-check', '', T('Syllabus complete'), T('Every question in your focus has been seen. Time to sharpen.'), '', '', true));
    }

    if ((plan.status === 'behind' || plan.status === 'compressed') && plan.todayRemaining > 0 && plan.todaySlices.length > 1) {
      rows.push(_row('ph-arrow-up-right', 'drill', T('Catch up today'),
        plan.todayRemaining + ' new across ' + plan.todaySlices.length + ' chapters', T('Catch up'), 'data-sprint="catchup"'));
    }

    if (t.reviews.target > 0) {
      rows.push(_row('ph-arrows-clockwise', 'review', 'Review due',
        t.due + ' question' + (t.due === 1 ? '' : 's') + ' \u00b7 spaced repetition', 'Review', 'data-sprint="review"', t.reviews.done >= t.reviews.target));
    }
    if (plan.phase === 'Mock') {
      rows.push(_row('ph-timer', 'drill', T('Timed mock test'), '50 mixed questions, exam conditions (90 seconds each)', 'Start', 'data-sprint="mock"', t.drill.done >= t.drill.target));
    } else if (t.drill.target > 0) {
      rows.push(_row('ph-lightning', 'drill', T('Drill your weak spots'),
        'Up to ' + Math.min(20, t.drill.target) + ' questions you missed or find hard', 'Drill', 'data-sprint="drill"', t.drill.done >= t.drill.target));
    }
    if (!rows.length) rows.push(_row('ph-smiley', '', T('Nothing due'), T('You are all caught up for today.'), '', '', true));
    host.innerHTML = rows.join('');
    const startAll = document.getElementById('sprint-start-all');
    if (startAll) startAll.hidden = !(plan.todaySlices.length > 1 && plan.todayRemaining > 0);
  }

  function _renderCoverage(plan) {
    _setHtml('sprint-cov-pct', plan.coveragePct + '<span class="pct">%</span>');
    _setText('sprint-cov-hint', plan.seenAll + ' of ' + plan.totalAll + ' questions');
    let cap;
    if (plan.status === 'complete' && !plan.mastered) {
      const m = plan.mastery, weak = m.below.slice(0, 3).map((x) => _esc(x.name) + ' ' + x.acc + '%').join(' \u00b7 ');
      cap = T('Every question in your focus has been seen.') + ' ' +
        (m.overall === null ? T('No accuracy data yet') : T('Accuracy is {a}%. Bring every chapter to {g}% to finish.', { a: m.overall, g: MASTERY_GOAL })) +
        (weak ? '<br><span class="t-foot">' + weak + '</span>' : '');
    }
    else if (plan.status === 'complete') cap = T('Every question in your focus has been seen.');
    else cap = '<strong>' + plan.remaining + '</strong> new questions left \u00b7 new content ends <strong>' + _esc(_fmtDate(plan.contentEnd || plan.learnEnd)) + '</strong>';
    _setHtml('sprint-cov-cap', cap);
    const bar = document.querySelector('#sprint-cov-bar > i');
    if (bar) bar.style.width = plan.coveragePct + '%';
    const barHost = document.getElementById('sprint-cov-bar');
    if (barHost) barHost.setAttribute('aria-valuenow', plan.coveragePct);

    const levelRows = (plan.levelList && plan.levelList.length)
      ? plan.levelList
      : [{ id: 'l7', pct: plan.levels.l7.pct }, { id: 'gk', pct: plan.levels.gk.pct }];
    const lvRows = levelRows.map((l) => {
      const label = PLAN_LEVEL_LABELS[l.id] || l.id;
      return '<div class="cov-lv"><span>' + _esc(label) + '</span><strong>' + l.pct + '%</strong>' + _bar(label + ' covered', l.pct) + '</div>';
    }).join('');
    _setHtml('sprint-cov-levels', lvRows +
      '<div class="cov-lv"><span>' + T('Accuracy goal') + ' ' + MASTERY_GOAL + '%</span><strong>' + (plan.mastery.overall === null ? '\u2014' : plan.mastery.overall + '%') + '</strong>' +
        _bar('Accuracy on the syllabus', plan.mastery.overall === null ? 0 : plan.mastery.overall, plan.mastery.met ? 'ok' : '') + '</div>');

    const banner = document.getElementById('sprint-count-banner');
    if (banner) {
      const u = plan.unknownFiles.length;
      if (_counting) {
        banner.hidden = false;
        banner.innerHTML = '<i class="ph ph-hourglass"></i><div><strong>' + T('Counting your syllabus…') + '</strong><br><span id="sprint-count-msg">' + _esc(_countMsg) + '</span></div>';
      } else if (u) {
        banner.hidden = false;
        banner.innerHTML = '<i class="ph ph-info"></i><div><strong>' + u + ' question set' + (u === 1 ? '' : 's') + ' not counted yet.</strong><br>' +
          'Until they are, the plan covers only the sets already counted. Counting downloads them once, and they then work offline.</div>' +
          '<button class="row-btn" type="button" data-sprint="count">' + T('Count now') + '</button>';
      } else banner.hidden = true;
    }

    // per-chapter list, grouped by chapter, in syllabus order
    const groups = [], idx = {};
    plan.perUnit.forEach((u) => {
      const k = u.lv + '|' + u.ch;
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ lv: u.lv, name: u.name, n: 0, seen: 0, fids: [] }); }
      const g = groups[idx[k]]; g.n += u.n; g.seen += u.seen; g.fids.push(u.fid);
    });
    const dateOf = (fids) => { const d = plan.schedule.find((s) => s.slices.some((x) => fids.indexOf(x.fid) !== -1)); return d ? d.iso : null; };
    _setHtml('sprint-chapters', groups.map((g) => {
      const pct = g.n ? Math.round(g.seen / g.n * 100) : 100;
      const when = pct >= 100 ? T('Done') : (dateOf(g.fids) ? 'Scheduled ' + _fmtDate(dateOf(g.fids)) : 'Scheduled');
      const icon = pct >= 100 ? 'ph-check-circle' : pct > 0 ? 'ph-circle-half' : 'ph-circle';
      return '<div class="chap-row2 ' + (pct >= 100 ? 'is-done' : '') + '"><i class="ph ' + icon + '"></i>' +
        '<div class="chap-main"><div class="chap-top"><span class="chap-name">' + _esc(g.name) + '</span><span class="chap-meta">' + g.seen + '/' + g.n + '</span></div>' +
        _bar(g.name + ' covered', pct) + '<div class="chap-when">' + _esc(_lvLabel(g.lv) + ' \u00b7 ' + when) + '</div></div></div>';
    }).join('') || '<p class="t-foot">' + T('Chapters appear here once your syllabus is counted.') + '</p>');
  }

  function _renderUpcoming(plan) {
    const host = document.getElementById('sprint-upcoming');
    if (!host) return;
    const startIdx = plan.schedule.length && plan.schedule[0].iso === plan.today ? 1 : 0;
    const next = plan.schedule.slice(startIdx, startIdx + 5).filter((d) => d.slices.length);
    const rows = next.map((d) => {
      const parts = {};
      d.slices.forEach((s) => { parts[s.name] = (parts[s.name] || 0) + s.count; });
      const text = Object.keys(parts).slice(0, 3).map((n) => n + ' (' + parts[n] + ')').join(' \u00b7 ') + (Object.keys(parts).length > 3 ? ' \u00b7 \u2026' : '');
      return '<div class="up-row"><div class="up-date"><strong>' + _esc(_fmtDate(d.iso)) + '</strong><span>Day ' + d.dayNum + '</span></div><div class="up-text">' + _esc(text) + '</div><div class="up-n">' + d.newTarget + '</div></div>';
    });
    if (plan.contentEnd && plan.contentEnd < plan.learnEnd) {
      rows.push('<div class="up-row up-buffer"><div class="up-date"><strong>Revision</strong><span>after new content</span></div>' +
        '<div class="up-text">The last ' + plan.bufferDays + ' Learn days stay free of new questions for reviews, drills and weak chapters.</div>' +
        '<div class="up-n">' + plan.bufferDays + 'd</div></div>');
    }
    host.innerHTML = rows.length ? rows.join('') : '<p class="t-foot">' + (plan.remaining === 0 ? 'No more new questions to schedule.' : T('Nothing scheduled yet.')) + '</p>';
  }

  function _renderWeek(plan) {
    const host = document.getElementById('sprint-week');
    if (!host) return;
    const { rest, off } = plan.cfg;
    const restSet = new Set(rest), offSet = new Set(off);
    const logDays = LOG.days();
    const stk = new Set((_S().stk && Array.isArray(_S().stk.days)) ? _S().stk.days : []);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;
    let done = 0, possible = 0, html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() - dow + i);
      const iso = _iso(d), isToday = iso === _iso(today), future = d > today;
      const studied = !!(logDays[iso] && logDays[iso].q > 0) || stk.has(iso);
      const cls = ['day']; if (isToday) cls.push('today');
      if (studied) { cls.push('full'); done++; possible++; }
      else if (restSet.has(iso)) cls.push('rest');
      else if (offSet.has(iso)) cls.push('off');
      else if (!future) possible++;
      html += '<div class="' + cls.join(' ') + '"><div class="day-lbl">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i] + '</div><div class="day-dot"></div></div>';
    }
    host.innerHTML = html;
    _setText('sprint-week-hint', done + ' of ' + possible + ' days');
  }

  // ── Reports ──────────────────────────────────────────────────────────────────────────────
  function _renderReports(plan) {
    const days = LOG.days();
    const { rest, off, start } = plan.cfg;
    const today = _todayIso();
    const restSet = new Set(rest), offSet = new Set(off);

    // today, live
    const tr = REP.dayRemark(days[today], { iso: today, today, isRest: restSet.has(today), isOff: offSet.has(today) });
    _setHtml('sprint-report-today',
      '<div class="rep-tone ' + tr.tone + '"><div class="rep-title">' + _esc(tr.title) + '</div>' +
      tr.lines.map((l) => '<p>' + _esc(l) + '</p>').join('') + '</div>');

    // last 14 days
    const rows = [];
    for (let i = 1; i <= 14; i++) {
      const iso = P.addDays(today, -i);
      if (iso < start) break;
      const rec = days[iso];
      const rm = REP.dayRemark(rec, { iso, today, isRest: restSet.has(iso), isOff: offSet.has(iso) });
      const meta = rec && rec.q ? rec.q + ' Q \u00b7 ' + rm.acc + '%' : (rm.tone === 'rest' ? 'Rest' : T('No practice'));
      rows.push(
        '<div class="rep-day ' + rm.tone + '">' +
          '<button class="rep-head" type="button" data-sprint="toggle-day" aria-expanded="false" aria-controls="rep-' + iso + '">' +
            '<span class="rep-dot"></span>' +
            '<span class="rep-date"><strong>' + _esc(_fmtDate(iso)) + '</strong><small>Day ' + (P.diffDays(start, iso) + 1) + '</small></span>' +
            '<span class="rep-meta">' + _esc(meta) + '</span><i class="ph ph-caret-down"></i>' +
          '</button>' +
          '<div class="rep-body" id="rep-' + iso + '" hidden><div class="rep-title">' + _esc(rm.title) + '</div>' + rm.lines.map((l) => '<p>' + _esc(l) + '</p>').join('') + '</div>' +
        '</div>');
    }
    _setHtml('sprint-report-days', rows.join('') || '<p class="t-foot">' + T('Your daily reports appear here after your first day.') + '</p>');

    // sprint-wide
    const sum = REP.summarize(days, { today, start, exam: plan.exam, rest, off, plan, streak: _streak() });
    plan._sum = sum;
    const gradeCls = sum.grade === '\u2014' ? '' : sum.scores.overall >= 80 ? 'ok' : sum.scores.overall >= 60 ? 'mid' : 'low';
    const scoreRow = (label, v) => '<div class="score-row"><span>' + label + '</span><strong>' + Math.round(v) + '</strong>' + _bar(label + ' score', v) + '</div>';
    const board = (title, list) => list.length
      ? '<div class="board"><h3>' + title + '</h3>' + list.map((c) => '<div class="board-row"><span>' + _esc(c.name) + '</span><strong>' + c.acc + '%</strong></div>').join('') + '</div>' : '';
    _setHtml('sprint-summary',
      '<div class="grade-row"><div class="grade-badge ' + gradeCls + '" aria-label="Sprint grade ' + _esc(sum.grade) + '">' + _esc(sum.grade) + '</div>' +
      '<div class="grade-text"><strong>' + T('Sprint grade') + '</strong><span>' + (sum.totalQ ? 'Overall ' + sum.scores.overall + ' / 100' : T('Starts after your first session')) + '</span></div></div>' +
      '<div class="scores">' + scoreRow('Coverage', sum.scores.coverage) + scoreRow('Accuracy', sum.scores.accuracy) + scoreRow('Consistency', sum.scores.consistency) + '</div>' +
      '<div class="stat-grid">' +
        '<div><strong>' + sum.totalQ + '</strong><span>Answered</span></div>' +
        '<div><strong>' + (sum.totalQ ? sum.accOverall + '%' : '\u2014') + '</strong><span>Accuracy</span></div>' +
        '<div><strong>' + sum.activeDays + '/' + sum.studyDaysElapsed + '</strong><span>' + T('Active days') + '</span></div>' +
        '<div><strong>' + _fmtMinutes(Math.round(sum.totalSec / 60)) + '</strong><span>Studied</span></div>' +
      '</div>' + _sparkline(sum.trend) +
      (sum.mocks.length ? '<div class="mock-row"><span>Mock tests</span>' + sum.mocks.slice(-5).map((m) => _pill(m.pct + '%', m.pct >= 60 ? 'ok' : 'warn')).join('') + '</div>' : '') +
      board(T('Needs the most work'), sum.weakest) + board('Strongest', sum.strongest) +
      '<p class="rep-proj">' + _esc(sum.projection || '') + '</p><p class="rep-advice">' + _esc(sum.advice) + '</p>');
  }

  function _sparkline(trend) {
    if (!trend || trend.length < 2) return '';
    const w = 300, h = 56, pad = 6;
    const pts = trend.map((t, i) => [pad + i * (w - 2 * pad) / (trend.length - 1), h - pad - (t.acc / 100) * (h - 2 * pad)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return '<div class="spark"><div class="spark-lbl">Accuracy, last ' + trend.length + ' active days</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Accuracy trend, from ' + trend[0].acc + '% to ' + trend[trend.length - 1].acc + '%"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="currentColor"/>').join('') + '</svg></div>';
  }

  function _renderJourney(plan) {
    _setText('sprint-day-count', 'Day ' + plan.dayNum + ' / ' + plan.N);
    const target = plan.cfg.examDate || plan.exam;
    const left = Math.max(0, P.diffDays(_todayIso(), target));
    _setText('sprint-journey-sub', left + ' day' + (left === 1 ? '' : 's') + (plan.cfg.examDate ? ' to your exam' : ' left in the sprint') + ' \u00b7 ' + _fmtDate(target));
    const sp = plan.split;
    const ranges = { learn: [1, sp.learn], drill: [sp.learn + 1, sp.learn + sp.drill], mock: [sp.learn + sp.drill + 1, plan.N] };
    ['learn', 'drill', 'mock'].forEach((name) => {
      const el = document.getElementById('sprint-phase-' + name);
      if (!el) return;
      const [from, to] = ranges[name];
      const rangeEl = el.querySelector('.phase-range');
      if (rangeEl) rangeEl.textContent = to >= from ? 'Day ' + from + '\u2013' + to : 'Day \u2014';
      el.classList.remove('active', 'past', 'future');
      let progress = 0, state = 'Upcoming';
      if (to < from) { el.classList.add('future'); state = T('Not used'); }
      else if (plan.dayNum > to) { el.classList.add('past'); progress = 100; state = 'Complete'; }
      else if (plan.dayNum >= from) { el.classList.add('active'); progress = Math.round((plan.dayNum - from + 1) / (to - from + 1) * 100); state = T('In progress'); }
      else el.classList.add('future');
      const stateEl = el.querySelector('.phase-state'); if (stateEl) stateEl.textContent = state;
      const fill = el.querySelector('.bar > i'); if (fill) fill.style.width = progress + '%';
      const b = el.querySelector('.bar'); if (b) b.setAttribute('aria-valuenow', progress);
    });

    const diff = plan.coveragePct - plan.expectedPct;
    const proj = plan.remaining === 0 ? T('Done') : (plan.projectedFinish ? _fmtDate(plan.projectedFinish) : '\u2014');
    _setHtml('sprint-pace-stats',
      '<div><span>' + T('Expected') + '</span><strong>' + plan.expectedPct + '%</strong></div>' +
      '<div><span>' + T('Actual') + '</span><strong>' + plan.coveragePct + '%</strong><small class="' + (diff >= 0 ? 'ok' : 'warn') + '">' + (diff >= 0 ? '+' : '') + diff + '%</small></div>' +
      '<div><span>' + T('Projected') + '</span><strong>' + _esc(proj) + '</strong><small>' + (plan.rate > 0 ? plan.rate + ' ' + T('Q/day') : '\u2014') + '</small></div>');
  }

  function _focusSummary() {
    if (!_focusSet()) return T('All Level 7 + GK topics');
    const refs = _eligibleRefs();
    const chapters = new Set(refs.map((r) => _focusKey(r.lv, r.ch)));
    const levels = FOCUS_LEVELS.filter((lv) => refs.some((r) => _lvKey(r.lv) === lv)).map((lv) => FOCUS_LABELS[lv]);
    if (!chapters.size) return T('No topics selected');
    return chapters.size + ' ' + (chapters.size === 1 ? 'topic' : 'topics') +
      (levels.length ? ' · ' + levels.join(', ') : '');
  }

  function _renderFocus() {
    const summary = document.getElementById('sprint-focus-summary');
    if (summary) summary.textContent = _focusSummary();
    const chips = document.getElementById('sprint-focus-chips');
    if (!chips) return;
    if (!_focusSet()) { chips.innerHTML = ''; return; }
    const names = [];
    _eligibleRefs().forEach((r) => {
      let name = String(r.ch == null ? '' : r.ch);
      try { name = ChapterData.chapterName(r.lv, r.ch) || name; } catch (e) { /* keep the id */ }
      if (names.indexOf(name) === -1) names.push(name);
    });
    chips.innerHTML = names.slice(0, 6).map((n) => '<span class="rest-chip">' + _esc(n) + '</span>').join('') +
      (names.length > 6 ? '<span class="t-foot">+' + (names.length - 6) + ' more</span>' : '');
  }

  function _paintFocusCount() {
    const box = document.getElementById('mbody');
    if (!box) return;
    const boxes = Array.from(box.querySelectorAll('[data-focus-key]'));
    const on = boxes.filter((x) => x.checked);
    const q = on.reduce((n, x) => n + (Number(x.getAttribute('data-q')) || 0), 0);
    const el = document.getElementById('focus-count');
    if (el) el.textContent = on.length + ' of ' + boxes.length + ' ' + T('topics') + ' \u00b7 ' + q + ' Q';
  }

  function toggleFocusLevel(btn) {
    const box = document.getElementById('mbody');
    if (!box || !btn) return;
    const prefix = btn.getAttribute('data-focus-lv') + '|';
    const rows = Array.from(box.querySelectorAll('[data-focus-key]')).filter((x) => x.getAttribute('data-focus-key').indexOf(prefix) === 0);
    const turnOn = !rows.length || !rows.every((x) => x.checked);
    rows.forEach((x) => { x.checked = turnOn; });
    _paintFocusCount();
  }

  function openFocus() {
    const groups = _topicGroups();
    if (!groups.length) { toast(T('No topics are available yet. Open a chapter once while online.')); return; }
    const defaults = _defaultFocusKeys(_allTopicRefs());
    const selected = _focusSet() || defaults;
    let html = '<p class="t-foot" style="margin-bottom:10px">' + T('Choose the topics you want the plan to cover. You can mix Level 7, Level 5 and GK.') + '</p>' +
      '<input class="input focus-search" id="focus-search" type="search" placeholder="' + T('Search topics…') + '" aria-label="' + T('Search topics…') + '">' +
      '<div class="bg" style="margin-bottom:10px">' +
        '<button class="btn btn-sm btn-quiet" type="button" data-focus-set="all">' + T('All levels') + '</button>' +
        '<button class="btn btn-sm btn-quiet" type="button" data-focus-set="default">' + T('Level 7 + GK') + '</button>' +
        '<button class="btn btn-sm btn-quiet" type="button" data-focus-set="none">' + T('Clear') + '</button>' +
      '</div>';
    groups.forEach((g) => {
      html += '<div class="focus-lv"><div class="focus-lv-hd"><strong>' + _esc(g.label) + '</strong><span>' + g.chapters.length + ' ' + T('topics') + '</span>' +
        '<button class="focus-all" type="button" data-focus-lv="' + g.lv + '" data-on-click="SPRINT_PAGE.toggleFocusLevel(this)" aria-label="' + T('Select all topics in this level') + '">' + T('All') + '</button></div>';
      g.chapters.forEach((c) => {
        const checked = selected.has(c.key) ? ' checked' : '';
        const pct = c.n ? Math.round(c.seen / c.n * 100) : 0;
        const progress = c.n ? c.seen + '/' + c.n + ' \u00b7 ' + pct + '%' : c.sets + (c.sets === 1 ? ' set' : ' sets');
        html += '<label class="focus-row" data-search="' + _esc((c.name + ' ' + c.key).toLowerCase()) + '"><input type="checkbox" data-focus-key="' + _esc(c.key) + '" data-q="' + (c.n || 0) + '"' + checked + '>' +
          '<span class="grow"><span>' + _esc(c.name) + '</span><small>' + _esc(progress) + '</small></span>' +
          '<span class="t-foot">' + (c.n ? c.n + ' Q' : '') + '</span></label>';
      });
      html += '</div>';
    });
    html += '<div class="set-row" style="margin-top:12px"><span class="t-foot" id="focus-count"></span>' +
      '<button class="btn btn-solid" type="button" id="focus-save">' + T('Use these topics') + '</button></div>';
    openMod(T('Focus topics'), html, { wide: true });
    const box = document.getElementById('mbody');
    const boxes = () => Array.from(box.querySelectorAll('[data-focus-key]'));
    const paintCount = _paintFocusCount;
    box.querySelectorAll('[data-focus-set]').forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.getAttribute('data-focus-set');
        boxes().forEach((x) => { x.checked = mode === 'all' || (mode === 'default' && defaults.has(x.getAttribute('data-focus-key'))); });
        paintCount();
      };
    });
    const search = document.getElementById('focus-search');
    if (search) search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      boxes().forEach((x) => { const row = x.closest('.focus-row'); if (row) row.hidden = !!q && row.getAttribute('data-search').indexOf(q) === -1; });
      Array.from(box.querySelectorAll('.focus-lv')).forEach((sec) => {
        sec.hidden = !Array.from(sec.querySelectorAll('.focus-row')).some((r) => !r.hidden);
      });
    };
    boxes().forEach((x) => { x.onchange = paintCount; });
    paintCount();
    document.getElementById('focus-save').onclick = () => {
      const keys = boxes().filter((x) => x.checked).map((x) => x.getAttribute('data-focus-key'));
      if (!keys.length) { toast(T('Choose at least one topic.')); return; }
      const same = keys.length === defaults.size && keys.every((k) => defaults.has(k));
      try {
        if (same) localStorage.removeItem(KEY_FOCUS);
        else localStorage.setItem(KEY_FOCUS, JSON.stringify(keys));
      } catch (e) { window.warnCaught && window.warnCaught('js/features/sprint.js', e); }
      const today = _todayIso();
      const units = _syllabus().units;
      const seenAll = units.reduce((a, u) => a + u.seen, 0);
      const cfg = _read();
      LOG.setBaseline(cfg.start, Math.max(0, seenAll - (LOG.dayRec(today).newSeen || 0)), true);
      const fresh = _plan();
      if (!fresh.unknownFiles.length) LOG.setPlanned(today, fresh.quotaToday, true);
      closeMod();
      renderPage(); renderHomeStrip();
      toast(T('Focus saved. Daily targets now cover only these topics.'), 4500);
    };
    DIALOG.open(document.getElementById('mbg'), { focus: '[data-focus-key]' });
  }

  function _renderSettings(plan) {
    _renderFocus();
    const ex = document.getElementById('sprint-exam-input');
    if (ex && document.activeElement !== ex) { ex.value = plan.cfg.examDate || ''; ex.min = P.addDays(_todayIso(), 1); }
    const restIn = document.getElementById('sprint-rest-input');
    if (restIn) { restIn.min = _todayIso(); restIn.max = plan.exam; }
    const list = document.getElementById('sprint-rest-list');
    if (list) {
      const upcoming = plan.cfg.rest.filter((d) => d >= _todayIso()).sort();
      list.innerHTML = upcoming.length ? upcoming.map((d) =>
        '<span class="rest-chip">' + _esc(_fmtDate(d)) + '<button type="button" data-sprint="remove-rest" data-iso="' + d + '" aria-label="Remove rest day ' + _esc(_fmtDate(d)) + '"><i class="ph ph-x"></i></button></span>').join('')
        : '<span class="t-foot">' + T('No rest days planned.') + '</span>';
    }
  }

  // ── Launchers: real practice, not just a link to a list ─────────────────────────────────
  const RUN = {
    _ref(fid) { return _eligibleRefs().find((r) => r.fid === fid) || chapterRef(fid); },
    async _load(ref) { return normQ(await QUIZ._fetch(ref.fid, ref.key), ref.fid); },
    _seenQ(q) {
      const uid = String((q && q.uid) || ''), i = uid.lastIndexOf('_');
      if (i < 1) return false;
      const c = (_S().cov || {})[uid.slice(0, i)];
      if (!c || !c.p) return false;
      const ch = c.p[parseInt(uid.slice(i + 1), 10)];
      return !!ch && ch !== '0';
    },

    async startNew(fid, count) {
      const ref = RUN._ref(fid);
      if (!ref) { toast(T('That set is not available.')); return; }
      QUIZ._showLoader(T('Opening today’s questions…'));
      let qs = [];
      try { qs = await RUN._load(ref); } catch (e) { /* handled below */ }
      QUIZ._hideLoader();
      if (!qs.length) { toast(T('Could not load this set. Open it once while online, then it works offline.'), 5000); return; }
      const fresh = qs.filter((q) => !RUN._seenQ(q));
      if (!fresh.length) { toast(T('Nothing new is left in this set.')); renderPage(); return; }
      const picked = fresh.slice(0, Math.max(1, count || fresh.length));
      const name = ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book;
      QUIZ._doStart(picked, 'flashcard', name, false, { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid, sprint: 'new' });
    },

    async _startSlices(slices, total, title, tag, meta) {
      if (!slices.length || !total) { toast(T('Nothing new left to catch up on today.')); return; }
      QUIZ._showLoader(T('Building your catch-up block…'));
      const picked = [];
      for (const slice of slices) {
        const ref = RUN._ref(slice.fid);
        if (!ref) continue;
        const need = Math.min(Math.max(0, Number(slice.count) || 0), total - picked.length);
        if (!need) continue;
        try {
          const qs = await RUN._load(ref);
          let taken = 0;
          for (const q of qs) {
            if (taken >= need || picked.length >= total) break;
            if (!RUN._seenQ(q)) { picked.push(q); taken++; }
          }
        } catch (e) { /* skip this chapter and keep the rest */ }
        if (picked.length >= total) break;
      }
      QUIZ._hideLoader();
      if (!picked.length) { toast(T('Could not load today’s chapters. Try again.'), 4500); return; }
      QUIZ._doStart(picked, 'flashcard', title, false, Object.assign({ sprint: tag }, meta || {}));
    },

    async startAllNew() {
      const plan = _plan();
      const slices = Array.isArray(plan.todaySlices) ? plan.todaySlices : [];
      await RUN._startSlices(slices, plan.todayRemaining, T('Today’s new questions'), 'new', { todayChapters: slices.length });
    },

    async startCatchUp() {
      const plan = _plan();
      const slices = Array.isArray(plan.todaySlices) ? plan.todaySlices : [];
      await RUN._startSlices(slices, plan.todayRemaining, T('Sprint catch-up'), 'catchup', { catchupChapters: slices.length });
    },

    startReview() {
      const fids = _focusFids();
      let arr;
      try { arr = REV.dueWrong(); } catch (e) { arr = []; }
      arr = (arr || []).filter((q) => fids.has(_fidOfQ(q)));
      if (!arr.length) { toast(T('Nothing due for review right now 🎉')); return; }
      QUIZ._doStart(shuf(arr.slice()).slice(0, 30), 'flashcard', '\uD83D\uDD01 Wrong Bank (Due Today)', true, { sprint: 'review' });
    },

    async startDrill() {
      const n = 20;
      const eligible = new Set(_eligibleRefs().map((r) => r.fid));
      const fidOf = (q) => { const u = String((q && q.uid) || ''), i = u.lastIndexOf('_'); return i > 0 ? u.slice(0, i) : ''; };
      let pool = ((_S().wr) || []).filter((q) => q && !q._withdrawn && eligible.has(fidOf(q)));
      pool = shuf(pool.slice()).slice(0, n);
      if (pool.length < n) {                                  // top up from the weakest chapters
        try {
          const weak = (typeof CHAPSTATS !== 'undefined' ? CHAPSTATS.entries() : []).filter((e) => e.attempted >= 3).sort((a, b) => a.accuracy - b.accuracy).slice(0, 2);
          for (const w of weak) {
            const ref = _eligibleRefs().find((r) => ChapterData.chapterName(r.lv, r.ch) === w.chapter);
            if (!ref) continue;
            const have = new Set(pool.map((q) => q.uid));
            const more = shuf((await RUN._load(ref)).filter((q) => !have.has(q.uid)));
            pool = pool.concat(more.slice(0, n - pool.length));
            if (pool.length >= n) break;
          }
        } catch (e) { /* offline: use what we have */ }
      }
      if (!pool.length) { toast(T('Your drill appears once you have a few missed questions. Keep practising.'), 4500); return; }
      QUIZ._doStart(pool, 'flashcard', '\uD83C\uDFAF Sprint drill', true, { sprint: 'drill' });
    },

    async startMock(n) {
      n = n || 50;
      const refs = shuf(_eligibleRefs().filter((r) => (_S().fcount || {})[r.fid] > 0));
      if (!refs.length) { toast(T('Count your syllabus first so a mock can be built.')); return; }
      QUIZ._showLoader(T('Building your mock test…'));
      let pool = [], i = 0;
      const worker = async () => {
        while (i < refs.length && i < 14 && pool.length < n * 2) {
          const ref = refs[i++];
          try { pool = pool.concat(await RUN._load(ref)); } catch (e) { /* skip */ }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      QUIZ._hideLoader();
      if (pool.length < 10) { toast(T('Could not build a mock. Check your connection and try again.'), 4500); return; }
      QUIZ._doStart(shuf(pool).slice(0, n), 'exam', T('Sprint mock test'), true, { sprint: 'mock' });
    },

    async count() {
      if (_counting) return;
      const todo = _plan().unknownFiles.slice();
      if (!todo.length) { renderPage(); return; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast(T('Connect to the internet once to count your syllabus.'), 4500); return; }
      _counting = true; let done = 0, failed = 0, i = 0;
      const tick = () => { _countMsg = done + ' of ' + todo.length + ' sets'; const m = document.getElementById('sprint-count-msg'); if (m) m.textContent = _countMsg; };
      renderPage(); tick();
      const worker = async () => {
        while (i < todo.length) {
          const ref = todo[i++];
          const n = await CNT.forFile(ref);
          if (n == null) failed++;
          done++; tick();
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      _counting = false;
      toast(failed ? failed + ' set(s) could not be counted. Try again later.' : T('Syllabus counted. Your daily plan is ready.'), 4500);
      renderPage(); renderHomeStrip();
    },
  };

  // ── Copy report ──────────────────────────────────────────────────────────────────────────
  async function _copyReport() {
    const plan = _plan();
    const days = LOG.days();
    const sum = plan._sum || REP.summarize(days, { today: _todayIso(), start: plan.start, exam: plan.exam, rest: plan.cfg.rest, off: plan.cfg.off, plan, streak: _streak() });
    const text = REP.reportText(sum, { plan });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      toast(T('Report copied. Paste it anywhere to share.'));
    } catch (e) { toast(T('Could not copy. Select the report and copy it manually.')); }
  }

  // ── Export the plan ──────────────────────────────────────────────────────────────────────
  function exportCalendar() {
    try {
      const plan = _plan();
      if (!plan || !plan.schedule || !plan.schedule.length) {
        toast(T('Count your syllabus first — there is no plan to export yet.'), 4500);
        return;
      }
      const text = P.calendarText(plan);
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'abhyas-60-day-plan.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(T('Calendar downloaded. Import it into Google Calendar, Apple Calendar or Outlook.'), 6000);
    } catch (e) {
      toast(T('Could not create the calendar file. Try again.'), 4500);
    }
  }

  // ── Settings actions ─────────────────────────────────────────────────────────────────────
  function setExamDate(iso) {
    if (!P.validIso(iso)) { toast(T('Pick a valid exam date.')); return false; }
    if (iso <= _todayIso()) { toast(T('Pick a date after today.')); return false; }
    if (iso > P.addDays(_todayIso(), 800)) { toast(T('That is too far away.')); return false; }
    _write('exam', iso);
    try { if (typeof HOME !== 'undefined' && HOME.render) HOME.render(); } catch (e) { /* ignore */ }
    renderPage(); renderHomeStrip();
    toast(T('Exam date saved. Your plan has been re-spread.'));
    return true;
  }
  function addRestDay(iso) {
    if (!P.validIso(iso)) return;
    const { rest } = _read();
    if (!rest.includes(iso)) rest.push(iso);
    _write('rest', rest); renderPage(); renderHomeStrip();
  }
  function removeRestDay(iso) {
    const { rest } = _read();
    const i = rest.indexOf(iso);
    if (i >= 0) rest.splice(i, 1);
    _write('rest', rest); renderPage(); renderHomeStrip();
  }
  function takeTodayOff() {
    const today = _todayIso();
    const { off } = _read();
    if (!off.includes(today)) off.push(today);
    _write('off', off);
    if (typeof toast === 'function') toast(T('Today is a rest day. The other days carry a little more.'));
    renderPage(); renderHomeStrip();
  }

  // ── Event delegation for the sprint screen (no inline handlers) ──────────────────────────
  function _onClick(e) {
    const el = e.target.closest && e.target.closest('[data-sprint]');
    if (!el) return;
    const act = el.getAttribute('data-sprint');
    if (act === 'new') RUN.startNew(el.getAttribute('data-fid'), Number(el.getAttribute('data-count')) || 0);
    else if (act === 'all-new') RUN.startAllNew();
    else if (act === 'catchup') RUN.startCatchUp();
    else if (act === 'review') RUN.startReview();
    else if (act === 'drill') RUN.startDrill();
    else if (act === 'mock') RUN.startMock(50);
    else if (act === 'count') RUN.count();
    else if (act === 'focus') openFocus();
    else if (act === 'copy-report') _copyReport();
    else if (act === 'export-calendar') exportCalendar();
    else if (act === 'save-exam') { const i = document.getElementById('sprint-exam-input'); if (i) setExamDate(i.value); }
    else if (act === 'add-rest') {
      const i = document.getElementById('sprint-rest-input');
      if (!i || !i.value) { toast(T('Pick a date first.')); return; }
      addRestDay(i.value); i.value = '';
    }
    else if (act === 'remove-rest') removeRestDay(el.getAttribute('data-iso'));
    else if (act === 'toggle-day') {
      const body = document.getElementById(el.getAttribute('aria-controls'));
      const open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      el.closest('.rep-day').classList.toggle('open', !open);
      if (body) body.hidden = open;
    }
  }

  // ── Tracking: exact "new questions" and a durable day log ────────────────────────────────
  function _countNew(qres) {
    if (!Array.isArray(qres) || !qres.length) return;
    const fcount = _S().fcount || {};
    const eligible = _eligibleRefs().reduce((m, r) => { m[r.fid] = true; return m; }, {});
    const cov = _S().cov || {};
    const seen = {};
    let fresh = 0;
    qres.forEach((q) => {
      const uid = String((q && q.uid) || ''), i = uid.lastIndexOf('_');
      if (i < 1 || seen[uid]) return;
      seen[uid] = true;
      const fid = uid.slice(0, i), idx = parseInt(uid.slice(i + 1), 10);
      if (!eligible[fid] || !isFinite(idx) || idx < 0) return;
      if (fcount[fid] != null && idx >= fcount[fid]) return;
      const c = cov[fid];
      const ch = c && c.p ? c.p[idx] : undefined;
      if (!ch || ch === '0') fresh++;
    });
    if (fresh) LOG.addNew(_todayIso(), fresh);
  }

  let _refreshT = null;
  function _refreshSoon() {
    if (_refreshT) return;
    _refreshT = setTimeout(() => {
      _refreshT = null;
      try {
        const v = document.getElementById('view-sprint');
        if (v && v.classList.contains('on')) renderPage();
        renderHomeStrip();
      } catch (e) { /* ignore */ }
    }, 250);
  }

  function _hookTracking() {
    if (typeof COV === 'undefined' || typeof PROG === 'undefined') { setTimeout(_hookTracking, 100); return; }
    if (COV._sprintHooked) return;
    COV._sprintHooked = true;
    const origRecord = COV.record.bind(COV);
    COV.record = function (qres) {
      try { _countNew(qres); } catch (e) { console.error('[SPRINT] countNew', e); }
      const out = origRecord(qres);
      /* Coverage can change without a recorded session (e.g. a chapter run
         that is finished elsewhere). Re-spread today and future days now. */
      try { _refreshSoon(); } catch (e) { console.error('[SPRINT] refresh', e); }
      return out;
    };
    const origSession = PROG.recordSession.bind(PROG);
    PROG.recordSession = function (sess) {
      const out = origSession(sess);
      try { LOG.recordSession(sess, _todayIso()); _refreshSoon(); } catch (e) { console.error('[SPRINT] log', e); }
      return out;
    };
  }

  window.SPRINT_PAGE = {
    init() {
      if (!_inited) {
        _read();
        const v = document.getElementById('view-sprint');
        if (v) v.addEventListener('click', _onClick);
        const strip = document.getElementById('sprint-card');
        if (strip) strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (window.UI) window.UI.go('sprint'); } });
        _inited = true;
      }
      renderHomeStrip(); renderPage();
    },
    render() { renderHomeStrip(); renderPage(); },
    renderHomeStrip, renderPage, isEligible, openFocus, toggleFocusLevel,
    focusKeys: () => _eligibleRefs().map((r) => _focusKey(r.lv, r.ch)),
    takeTodayOff, setExamDate, addRestDay, removeRestDay, exportCalendar,
    run: RUN, plan: _plan, targets: () => _targets(_plan()),
  };

  window.SPRINT = window.SPRINT || {};
  ['takeTodayOff', 'setExamDate', 'addRestDay', 'removeRestDay', 'renderPage', 'renderHomeStrip', 'exportCalendar'].forEach((k) => { window.SPRINT[k] = window.SPRINT_PAGE[k]; });
  window.SPRINT.run = RUN;

  function _hookNav() {
    if (!window.UI || typeof window.UI.go !== 'function') { setTimeout(_hookNav, 50); return; }
    if (window.UI._sprintPageHooked) return;
    window.UI._sprintPageHooked = true;
    const orig = window.UI.go.bind(window.UI);
    window.UI.go = function (view) {
      const out = orig.apply(null, arguments);
      if (view === 'sprint') setTimeout(() => window.SPRINT_PAGE.renderPage(), 0);
      if (view === 'home')   setTimeout(() => window.SPRINT_PAGE.renderHomeStrip(), 0);
      return out;
    };
  }

  function _boot() { window.SPRINT_PAGE.init(); _hookNav(); _hookTracking(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot, { once: true });
  else _boot();
})();
