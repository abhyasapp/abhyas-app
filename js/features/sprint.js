/* ===================================================================
 * js/features/sprint.js
 *
 * The rich 60-day sprint page + Home strip. Exposed as SPRINT_PAGE so it
 * never collides with js/features/today-plan.js which defines window.SPRINT.
 *
 * Storage keys:
 *   abhyas_sprint_start    ISO date "2026-10-01"
 *   abhyas_sprint_exam     ISO date "2027-01-15"
 *   abhyas_sprint_rest     JSON array of ISO dates
 *   abhyas_sprint_off      JSON array of ISO dates (taken off)
 * =================================================================== */
(function () {
  'use strict';

  const KEY_START = 'abhyas_sprint_start';
  const KEY_EXAM  = 'abhyas_sprint_exam';
  const KEY_REST  = 'abhyas_sprint_rest';
  const KEY_OFF   = 'abhyas_sprint_off';

  const PHASES = [
    { name: 'Learn', from: 1,  to: 35 },
    { name: 'Drill', from: 36, to: 52 },
    { name: 'Mock',  from: 53, to: 60 },
  ];

  let _inited = false;

  // ── state ────────────────────────────────────────────────────────
  function _read() {
    let start = null, exam = null, rest = [], off = [];
    try {
      start = localStorage.getItem(KEY_START);
      exam  = localStorage.getItem(KEY_EXAM);
      rest  = JSON.parse(localStorage.getItem(KEY_REST) || '[]');
      off   = JSON.parse(localStorage.getItem(KEY_OFF)  || '[]');
    } catch (e) {}
    if (!start) {
      const d = new Date(); d.setHours(0,0,0,0);
      start = _iso(d);
      try { localStorage.setItem(KEY_START, start); } catch (e) {}
    }
    if (!exam) {
      const d = _fromIso(start); d.setDate(d.getDate() + 59);
      exam = _iso(d);
      try { localStorage.setItem(KEY_EXAM, exam); } catch (e) {}
    }
    return { start, exam, rest, off };
  }

  function _write(field, value) {
    try {
      localStorage.setItem(
        field === 'rest' ? KEY_REST :
        field === 'off'  ? KEY_OFF  :
        field === 'exam' ? KEY_EXAM : KEY_START,
        typeof value === 'string' ? value : JSON.stringify(value)
      );
    } catch (e) {}
  }

  function _iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function _fromIso(s) {
    const [y,m,d] = s.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  function _todayIso() {
    const d = new Date(); d.setHours(0,0,0,0); return _iso(d);
  }
  function _dayNum() {
    const { start } = _read();
    const startD = _fromIso(start).getTime();
    const todayD = new Date(); todayD.setHours(0,0,0,0);
    return Math.max(1, Math.min(60, Math.floor((todayD.getTime() - startD) / 86400000) + 1));
  }
  function _phaseOf(day) {
    return PHASES.find(p => day >= p.from && day <= p.to) || PHASES[PHASES.length-1];
  }
  function _daysToExam() {
    const { exam } = _read();
    const e = _fromIso(exam).getTime();
    const t = new Date(); t.setHours(0,0,0,0);
    return Math.max(0, Math.round((e - t.getTime()) / 86400000));
  }
  function _fmtDate(iso) {
    const d = _fromIso(iso);
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return wd + ', ' + d.getDate() + ' ' + mo;
  }

  // ── eligible chapter pool (Level 7 + GK, exclude "original" books) ─
  function isEligible(meta) {
    if (!meta) return false;
    const lvl = String(meta.level || '').toLowerCase();
    if (lvl !== 'level7' && lvl !== 'gk') return false;
    const book = String(meta.book || meta.bookName || meta.title || '');
    if (/original/i.test(book)) return false;
    return true;
  }

  // ── real data sources ─
  function _wrongBank() {
    try { return (typeof S !== 'undefined' && S.wr) ? S.wr : []; } catch (e) { return []; }
  }
  function _chapStats() {
    try { return (typeof S !== 'undefined' && S.chapStats) ? S.chapStats : {}; } catch (e) { return {}; }
  }
  function _streak() {
    try { return (typeof STREAK !== 'undefined' && STREAK.currentStreak) ? STREAK.currentStreak() : 0; } catch (e) { return 0; }
  }
  function _studyDays() {
    try { return (typeof S !== 'undefined' && S.stk && Array.isArray(S.stk.days)) ? S.stk.days : []; } catch (e) { return []; }
  }

  // ── daily targets & actual progress ─────────────────────────────
  function _todayStats() {
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    const todayTime = todayMidnight.getTime();
    const sessions = (typeof S !== 'undefined' && S.prog && S.prog.sessions) ? S.prog.sessions : [];
    
    let newDone = 0, revDone = 0, drillDone = 0, timeDoneMins = 0;
    
    sessions.forEach(s => {
      const sTime = Number(s.at || s.ts || s.date);
      if (sTime >= todayTime) {
        const count = Number(s.count || s.n || s.total || 1);
        if (s.type === 'review' || s.mode === 'review' || s.scope === 'review') revDone += count;
        else if (s.type === 'drill' || s.mode === 'drill' || s.scope === 'drill') drillDone += count;
        else newDone += count;
        
        // Safely assume s.time / s.dur is in seconds, convert to minutes
        const sec = Number(s.time || s.dur || s.duration || s.elapsed || 0);
        timeDoneMins += Math.round(sec / 60); 
      }
    });
    
    return { newDone, revDone, drillDone, timeDoneMins };
  }

  function _targets() {
    const day = _dayNum();
    const phase = _phaseOf(day);
    const daysLeft = Math.max(1, 60 - day + 1);
    const today = _todayStats();

    const now = Date.now();
    let reviewsDue = _wrongBank().filter(q => {
      const due = Number(q && (q._nextDue || q.nextDue || 0));
      return !due || due <= now;
    }).length;

    // New target — remaining questions across eligible chapters / days left.
    let newTarget = 20;
    try {
      const ch = _remainingQuestions();
      if (ch > 0) newTarget = Math.min(200, Math.max(5, Math.ceil(ch / daysLeft)));
    } catch (e) {}

    let drillTarget = 40;
    try { const wr = _wrongBank(); if (wr.length > 0) drillTarget = Math.max(20, Math.min(150, wr.length)); } catch (e) {}

    const perMin = 0.9;
    const timeTarget = Math.round((newTarget + reviewsDue + drillTarget) * perMin);

    return {
      phase,
      new:     { done: today.newDone, target: newTarget },
      reviews: { done: today.revDone, target: Math.max(10, Math.min(30, reviewsDue || 20)) },
      drill:   { done: today.drillDone, target: drillTarget },
      time:    { done: today.timeDoneMins, target: timeTarget },
    };
  }

  function _remainingQuestions() {
    try {
      if (typeof ChapterData === 'undefined' || !ChapterData.allFileRefs) return 0;
      const stats = _chapStats();
      const fcount = (typeof S !== 'undefined' && S.fcount) ? S.fcount : {};
      const cov = (typeof S !== 'undefined' && S.cov) ? S.cov : {};
      let total = 0;
      ChapterData.allFileRefs().forEach(ref => {
        if (!isEligible({ level: ref.lv, book: ref.book })) return;
        const n = fcount[ref.fid];
        if (!n) return;
        const c = cov[ref.fid];
        let seen = 0;
        if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
        total += Math.max(0, n - seen);
      });
      return total;
    } catch (e) { return 0; }
  }

  function _studyDaysLast7() {
    const days = [];
    const today = new Date(); today.setHours(0,0,0,0);
    const { rest, off } = _read();
    const restSet = new Set(rest), offSet = new Set(off);
    const studySet = new Set(_studyDays());

    const dow = (today.getDay() + 6) % 7; // Mon = 0
    const monday = new Date(today); monday.setDate(today.getDate() - dow);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const iso = _iso(d);
      days.push({
        iso,
        lbl: ['M','T','W','T','F','S','S'][i],
        studied: studySet.has(iso),
        rest: restSet.has(iso),
        off: offSet.has(iso),
        today: iso === _iso(today),
        future: d > today,
      });
    }
    return days;
  }

  function renderHomeStrip() {
    const el = document.getElementById('sprint-card');
    if (!el) return;
    const day = _dayNum();
    const phase = _phaseOf(day);
    const t = _targets();
    const pct = Math.round((day / 60) * 100);
    el.style.display = '';
    el.setAttribute('data-on-click', "UI.go('sprint')");
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Open 60-day sprint, day ' + day);
    el.innerHTML =
      '<div class="sp-ic"><i class="ph ph-calendar-check"></i></div>' +
      '<div class="sp-body">' +
        '<div class="sp-title">Day ' + day + ' <small>' + phase.name + '</small></div>' +
        '<div class="sp-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sp-sub">' + t.new.target + ' new · ' + t.reviews.target + ' reviews due</div>' +
      '</div>' +
      '<div class="sp-chev"><i class="ph ph-arrow-right"></i></div>';
  }

  function renderPage() {
    const day = _dayNum();
    const phase = _phaseOf(day);
    const { exam } = _read();
    const t = _targets();
    const daysLeft = _daysToExam();

    _setText('sprint-phase-label', phase.name + ' phase');
    _setText('sprint-day-meta',    'Day ' + day + ' of 60');

    _setText('sprint-today-date', _fmtDate(_todayIso()));
    _setText('sprint-streak', String(_streak()));
    const counts = [
      t.new.done     >= t.new.target,
      t.reviews.done >= t.reviews.target,
      t.drill.done   >= t.drill.target,
      t.time.done    >= t.time.target,
    ];
    const doneN = counts.filter(Boolean).length;
    const pct = Math.round((doneN / 4) * 100);
    _setHtml('sprint-today-pct', pct + '<span class="pct">%</span>');
    _setHtml('sprint-today-cap',
      '<strong>' + doneN + ' of 4</strong> targets done<br>' +
      '<span class="streak"><i class="ph ph-flame"></i> <span id="sprint-streak">' + _streak() + '</span>-day streak</span>');
    const bar = document.querySelector('#sprint-today-bar > i');
    if (bar) bar.style.width = pct + '%';
    const barHost = document.getElementById('sprint-today-bar');
    if (barHost) barHost.setAttribute('aria-valuenow', pct);

    ['new','reviews','drill','time'].forEach(key => {
      const tgt = document.querySelector('.target[data-target="' + key + '"]');
      if (!tgt) return;
      const v = tgt.querySelector('.v');
      const of = tgt.querySelector('.of');
      const fill = tgt.querySelector('.bar > i');
      const tgtData = t[key];
      const valStr = key === 'time' ? _fmtMinutes(tgtData.done) : String(tgtData.done);
      const ofStr  = key === 'time' ? _fmtMinutes(tgtData.target) : String(tgtData.target);
      if (v) v.textContent = valStr;
      if (of) of.textContent = '/ ' + ofStr;
      if (fill) {
        const p = tgtData.target > 0 ? Math.min(100, Math.round(tgtData.done / tgtData.target * 100)) : 0;
        fill.style.width = p + '%';
      }
      tgt.classList.toggle('done', tgtData.done >= tgtData.target && tgtData.target > 0);
    });

    _renderTodayList(t);
    _renderWeek();

    _setText('sprint-day-count', 'Day ' + day + ' / 60');
    _setText('sprint-journey-sub',
      daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' to exam · finishes ' + _fmtDate(exam));
    PHASES.forEach(p => {
      const el = document.getElementById('sprint-phase-' + p.name.toLowerCase());
      if (!el) return;
      el.classList.remove('active','past','future');
      let progress = 0, state = 'Upcoming';
      if (day > p.to) { el.classList.add('past'); progress = 100; state = 'Complete'; }
      else if (day >= p.from) {
        el.classList.add('active');
        progress = Math.round((day - p.from + 1) / (p.to - p.from + 1) * 100);
        state = 'In progress';
      } else el.classList.add('future');
      const stateEl = el.querySelector('.phase-state');
      if (stateEl) stateEl.textContent = state;
      const fill = el.querySelector('.bar > i');
      if (fill) fill.style.width = progress + '%';
      const b = el.querySelector('.bar');
      if (b) b.setAttribute('aria-valuenow', progress);
    });

    const paceEl = document.getElementById('sprint-pace-verdict');
    if (paceEl) {
      const expectPct = day / 60;
      const actualPct = doneN / 4;
      const verdict = actualPct + 0.05 >= expectPct ? 'ok' : 'warn';
      paceEl.className = 'pace-item ' + verdict;
      paceEl.innerHTML = verdict === 'ok'
        ? '<i class="ph ph-check-circle"></i> <strong>On track</strong> for exam day'
        : '<i class="ph ph-warning"></i> <strong>Behind</strong> — catch up today';
    }
    const examEl = document.getElementById('sprint-exam-date');
    if (examEl) examEl.innerHTML = '<i class="ph ph-calendar"></i> Exam <strong>' + _fmtDate(exam) + '</strong>';
  }

  function _renderTodayList(t) {
    const host = document.getElementById('sprint-today-list');
    if (!host) return;
    const rows = [
      { icon: 'ph-chart-line', cls: '',        title: 'New questions', sub: t.new.target + ' to go · about ' + _fmtMinutes(Math.round(t.new.target * 0.9)), label: 'Start',  click: "UI.go('online')" },
      { icon: 'ph-arrows-clockwise', cls: 'review', title: 'Review due', sub: t.reviews.target + ' question' + (t.reviews.target === 1 ? '' : 's') + ' · spaced repetition', label: 'Review', click: "REV.start('wr','flashcard',true)" },
      { icon: 'ph-lightning', cls: 'drill', title: 'Drill', sub: t.drill.target + ' from your weak chapters', label: 'Drill', click: "PSY.start('weak')" },
    ];
    host.innerHTML = rows.map(r =>
      '<div class="list-row">' +
        '<div class="row-ic ' + r.cls + '"><i class="ph ' + r.icon + '"></i></div>' +
        '<div class="row-body">' +
          '<div class="row-title">' + _esc(r.title) + '</div>' +
          '<div class="row-sub">' + _esc(r.sub) + '</div>' +
        '</div>' +
        '<button class="row-btn' + (r.label === 'Review' ? ' ghost' : '') + '" type="button" data-on-click="' + r.click + '">' + _esc(r.label) + '</button>' +
      '</div>'
    ).join('');
  }

  function _renderWeek() {
    const host = document.getElementById('sprint-week');
    if (!host) return;
    const days = _studyDaysLast7();
    let done = 0, possible = 0;
    host.innerHTML = days.map(d => {
      const cls = ['day'];
      if (d.today) cls.push('today');
      if (d.studied) { cls.push('full'); done++; possible++; }
      else if (d.rest) { cls.push('rest'); }
      else if (d.off)  { cls.push('off'); }
      else if (d.future) {}
      else { possible++; }
      return '<div class="' + cls.join(' ') + '">' +
        '<div class="day-lbl">' + d.lbl + '</div>' +
        '<div class="day-dot"></div>' +
      '</div>';
    }).join('');
    const hint = document.getElementById('sprint-week-hint');
    if (hint) hint.textContent = done + ' of ' + possible + ' days';
  }

  function _setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function _setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function _fmtMinutes(m) {
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h + 'h' + (rem ? ' ' + rem + 'm' : '');
  }
  function _esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  window.SPRINT_PAGE = {
    init() {
      if (_inited) { renderHomeStrip(); renderPage(); return; }
      _read();
      renderHomeStrip();
      renderPage();
      _inited = true;
    },
    render() { renderHomeStrip(); renderPage(); },
    renderHomeStrip,
    renderPage,
    isEligible,

    takeTodayOff() {
      const today = _todayIso();
      const { off } = _read();
      if (!off.includes(today)) off.push(today);
      _write('off', off);
      if (typeof toast === 'function') toast('Today marked as rest. The other days carry a little more.');
      renderPage(); renderHomeStrip();
    },
    setExamDate(iso) { _write('exam', iso); renderPage(); },
    addRestDay(iso) {
      const { rest } = _read();
      if (!rest.includes(iso)) rest.push(iso);
      _write('rest', rest);
      renderPage();
    },
    removeRestDay(iso) {
      const { rest } = _read();
      const idx = rest.indexOf(iso);
      if (idx >= 0) rest.splice(idx, 1);
      _write('rest', rest);
      renderPage();
    },
  };

  window.SPRINT = window.SPRINT || {};
  window.SPRINT.takeTodayOff    = window.SPRINT_PAGE.takeTodayOff;
  window.SPRINT.setExamDate     = window.SPRINT_PAGE.setExamDate;
  window.SPRINT.addRestDay      = window.SPRINT_PAGE.addRestDay;
  window.SPRINT.removeRestDay   = window.SPRINT_PAGE.removeRestDay;
  window.SPRINT.renderPage      = window.SPRINT_PAGE.renderPage;
  window.SPRINT.renderHomeStrip = window.SPRINT_PAGE.renderHomeStrip;

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

  function _boot() {
    window.SPRINT_PAGE.init();
    _hookNav();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }
})();