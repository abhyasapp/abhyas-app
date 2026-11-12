﻿// js/features/today-plan.js — daily ten, sprint-60 widget, and the shared
// TODAY_PLAN helpers used by insights / resume / quick-5.

Object.assign(window.SPRINT = window.SPRINT || {}, {
  KEY: 'abhyas_sprint_start',

  _start(){ try { return localStorage.getItem(this.KEY) || ''; } catch(e){ return ''; } },

  _iso(d){
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },

  begin(){
    try { localStorage.setItem(this.KEY, this._iso(new Date())); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    toast('\ud83d\ude80 Day 1 of your 60-day sprint. Let\u2019s go!');
    this._refreshStrip();
  },

  reset(){
    if (!confirm('Restart your 60-day sprint from today?')) return;
    this._saveOff([]);
    this.begin();
  },

  _questionsToday(){
    const t = new Date().toDateString();
    return ((S.prog && S.prog.sessions) || [])
      .filter(s => s && s.at && new Date(s.at).toDateString() === t)
      .reduce((n, s) => n + (Number(s.total) || 0), 0);
  },

  _minutesToday(){
    const t = new Date().toDateString();
    const secs = ((S.prog && S.prog.sessions) || [])
      .filter(x => x && x.at && new Date(x.at).toDateString() === t)
      .reduce((n, x) => n + (Number(x.durationSec) || 0), 0);
    return Math.round(secs / 60);
  },

  OFF_KEY: 'abhyas_sprint_off',
  EXAM_KEY: 'abhyas_exam_date',
  _ISO: /^\d{4}-\d{2}-\d{2}$/,

  _offDays(){ try { const v = JSON.parse(localStorage.getItem(this.OFF_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => this._ISO.test(x)) : []; } catch(e){ return []; } },
  _saveOff(list){ try { localStorage.setItem(this.OFF_KEY, JSON.stringify(list.slice(-80))); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); } },
  _exam(){ try { const v = localStorage.getItem(this.EXAM_KEY) || ''; return this._ISO.test(v) ? v : ''; } catch(e){ return ''; } },

  _secPerQ(){
    const ss = ((S.prog && S.prog.sessions) || []).filter(x => x && Number(x.durationSec) > 0 && Number(x.total) > 0).slice(0, 20);
    const secs = ss.reduce((n, x) => n + Number(x.durationSec), 0), q = ss.reduce((n, x) => n + Number(x.total), 0);
    return q >= 20 ? Math.round(secs / q) : 60;
  },

  _chapters(){
    const t = Date.now();
    if (this._chC && t - this._chC.t < 300) return this._chC.v;
    const out = [];
    try {
      MASTERY.filteredChapters().forEach(c => {
        const m = MASTERY.chapter(c.lv, c.ch);
        out.push({ 
          lv: c.lv, ch: c.ch, 
          label: ChapterData.chapterName(c.lv, c.ch) + (c.lv === 'gk' ? ' (GK)' : ''),
          total: m.total || 0, attempted: m.attempted || 0, 
          wrong: m.wrong || 0, accuracy: m.accuracy, 
          state: m.state 
        });
      });
    } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    this._chC = { t, v: out };
    return out;
  },

  _inputs(){
    let total = 0, covered = 0;
    try {
      const refs = sprintRefs(ChapterData.allFileRefs());
      total = refs.length;
      covered = refs.filter(r => { const c = (S.cov || {})[r.fid]; return c && c.a > 0; }).length;
    } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    let due = 0;
    try { due = REV.dueWrong().length; } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    const known = this._chapters().filter(c => c.total > 0);
    const totalQ = known.reduce((n, c) => n + c.total, 0);
    const attemptedQ = Math.min(totalQ, known.reduce((n, c) => n + c.attempted, 0));
    const wrongQ = known.reduce((n, c) => n + (c.wrong || 0), 0);
    return {
      startISO: this._start(), now: new Date(),
      totalTopics: total, coveredTopics: covered,
      dueReview: due, questionsToday: this._questionsToday(),
      totalQ, attemptedQ, wrongQ, offDays: this._offDays(), examISO: this._exam(),
      secPerQ: this._secPerQ(), paperSize: 100
    };
  },

  render(){ return; },

  _refreshStrip(){
    try { if (window.SPRINT_PAGE && SPRINT_PAGE.renderHomeStrip) SPRINT_PAGE.renderHomeStrip(); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    try { if (window.SPRINT_PAGE && SPRINT_PAGE.renderPage)      SPRINT_PAGE.renderPage(); }      catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
  },

  startItem(i){
    const it = (this._items || [])[i];
    if (!it) return;
    if (it.kind === 'review') { try { if (REV.start) { REV.start('wr', 'flashcard', true); return; } } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); } toast('Nothing to review right now.'); return; }
    if (it.kind === 'mock') { try { if (SYLLABUS_MOCK && SYLLABUS_MOCK.start) { SYLLABUS_MOCK.start(); return; } } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); } toast('Mock papers are not available yet.'); return; }
    if (it.lv && it.ch && typeof CH_GRID !== 'undefined') CH_GRID.startChapter(it.lv, it.ch, 'flashcard');
  },

  restDay(){
    const t = this._iso(new Date()), list = this._offDays(), at = list.indexOf(t);
    if (at === -1) { list.push(t); toast('Rest day set. The other days will carry a little more.'); }
    else { list.splice(at, 1); toast('Rest day cancelled.'); }
    this._saveOff(list);
    this._refreshStrip();
  },

  examDialog(){
    const min = this._iso(new Date(Date.now() + 86400000));
    openMod('Exam date',
      '<p class="t-callout mb3">If your exam is sooner than 60 days away, the plan is shortened to finish the day before it. It never gets longer than 60 days.</p>' +
      '<label class="t-foot" for="sp-exam">Exam date</label>' +
      '<input class="input" type="date" id="sp-exam" min="' + min + '" value="' + esc(this._exam()) + '" style="margin:var(--sp-1) 0 var(--sp-3)">' +
      '<div class="bg"><button class="btn btn-a" type="button" data-on-click="SPRINT.saveExam()">Save</button>' +
      '<button class="btn btn-quiet" type="button" data-on-click="SPRINT.clearExam()">Remove date</button></div>');
  },
  saveExam(){
    const v = (document.getElementById('sp-exam') || {}).value || '';
    if (!this._ISO.test(v) || v <= this._iso(new Date())) { toast('Pick a date after today.'); return; }
    try { localStorage.setItem(this.EXAM_KEY, v); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    closeMod(); toast('Exam date saved.');
    this._refreshStrip();
  },
  clearExam(){
    try { localStorage.removeItem(this.EXAM_KEY); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    closeMod();
    this._refreshStrip();
  },

  go(){
    const plan = sprintPlan(this._inputs());
    if (plan.state === 'active' && plan.sized) {
      const items = sprintToday(plan, this._chapters());
      this._items = items;
      const first = items.findIndex(it => it.kind !== 'rest');
      if (first !== -1) { this.startItem(first); return; }
    }
    if (plan.state === 'active' && plan.mock) {
      try { if (typeof SYLLABUS_MOCK !== 'undefined' && SYLLABUS_MOCK.start) { SYLLABUS_MOCK.start(); return; } } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    }
    TODAY_PLAN.start();
  }
});

window.TODAY_PLAN = {
  _plan: null,

  _entries(){
    try {
      if (typeof CHAPSTATS === 'undefined' || !CHAPSTATS.entries) return [];
      return CHAPSTATS.entries().filter(e => e.attempted >= 5);
    } catch(e){ return []; }
  },

  _weakest(n){
    return this._entries()
      .slice()
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, n);
  },

  _dueReview(){
    try {
      if (typeof REV === 'undefined' || !REV.dueWrong) return 0;
      return REV.dueWrong().length;
    } catch(e){ return 0; }
  },

  _resumeCtx(){
    try {
      const sessions = (S.prog && S.prog.sessions) || [];
      const last = sessions.find(s => s && s.fid && s.lv && s.ch);
      if (!last || !last.fid) return null;
      const ref = chapterRef(last.fid);
      if (!ref) return null;
      const at = Number(last.at) || 0;
      if (Date.now() - at > 14 * 24 * 60 * 60 * 1000) return null;
      return {
        fid: ref.fid,
        title: ChapterData.chapterName(ref.lv, ref.ch),
        subtopic: ref.subtopic || ref.book || '',
        when: at
      };
    } catch(e){ return null; }
  },

  _renderResume(){
    const slot = $('resume-slot');
    if (!slot) return;
    const ctx = this._resumeCtx();
    if (!ctx) { slot.innerHTML = ''; return; }
    const mins = Math.max(1, Math.round((Date.now() - ctx.when) / 60000));
    const when = mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago';
    slot.innerHTML =
      '<button class="resume-chip" data-on-click="TODAY_PLAN.resume()">' +
        '<i class="ph ph-play"></i>' +
        '<span class="grow">Continue <b>' + esc(ctx.title) + '</b>' +
          (ctx.subtopic ? ' \u00b7 ' + esc(ctx.subtopic) : '') +
          '<span class="t-cap" style="display:block;opacity:.7">Last opened ' + when + '</span>' +
        '</span>' +
        '<i class="ph ph-arrow-right arrow"></i>' +
      '</button>';
  },

  resume(){
    const ctx = this._resumeCtx();
    if (!ctx) { toast('Nothing to continue yet \u2014 pick a chapter to start.'); return; }
    const ref = chapterRef(ctx.fid);
    if (!ref) { toast('That chapter is not available right now.'); return; }
    QUIZ.load(ref.fid, ref.key, 'flashcard',
      ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book,
      { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid });
  },

  render(){
    const box = $('today-body');
    if (!box) return;

    const due = this._dueReview();
    const weak = this._weakest(3);
    const newRef = this._pickNew();
    this._plan = { due, weak, newRef, total: 30 };

    let html = '';
    if (due > 0) {
      html += '<div class="banner banner-warning"><i class="ph ph-repeat"></i><span>You have <b>' + due + '</b> review questions due.</span></div>';
    }
    if (weak.length) {
      html += '<div class="t-foot mb2">Focus areas: ' + weak.map(w => '<b>' + esc(w.chapter) + '</b>').join(', ') + '</div>';
    }
    box.innerHTML = html;
  },

  _pickNew(){
    try {
      const all = ChapterData.allFileRefs();
      const seen = new Set();
      Object.keys(S.cov || {}).forEach(fid => {
        const c = S.cov[fid];
        if (c && c.a > 0) seen.add(fid);
      });
      const fresh = all.filter(r => !seen.has(r.fid));
      if (!fresh.length) return null;
      return fresh[Math.floor(Math.random() * fresh.length)];
    } catch(e){ return null; }
  },

  start(){
    const p = this._plan;
    if (!p) { QUIZ.daily(); return; }
    if (p.due > 0 && typeof REV !== 'undefined' && REV.start) { REV.start('wr', 'flashcard', true); return; }
    if (p.weak.length) {
      const first = p.weak[0];
      const ref = ChapterData.allFileRefs().find(r =>
        ChapterData.chapterName(r.lv, r.ch) === first.chapter
      );
      if (ref) {
        QUIZ.load(ref.fid, ref.key, 'flashcard',
          ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book,
          { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid });
        return;
      }
    }
    if (p.newRef) {
      const r = p.newRef;
      QUIZ.load(r.fid, r.key, 'flashcard',
        ChapterData.chapterName(r.lv, r.ch) + ' \u2014 ' + r.book,
        { lv: r.lv, ch: r.ch, book: r.book, sub: r.subtopic, fid: r.fid });
      return;
    }
    QUIZ.daily();
  },

  quick5(){
    toast('Loading 5 questions\u2026', 1500);
    const p = this._plan;
    const refs = p && p.newRef
      ? [p.newRef]
      : (typeof ChapterData !== 'undefined' ? ChapterData.allFileRefs() : []).slice(0, 3);
    if (!refs.length) { toast('No content available yet.'); return; }
    (async () => {
      const all = [];
      for (const ref of refs) {
        try {
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          all.push(...normQ(raw, ref.fid));
        } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
        if (all.length >= 15) break;
      }
      if (!all.length) { toast('Could not load a quick set \u2014 try again.'); return; }
      const picked = shuf(all).slice(0, 5);
      QUIZ.startWith(picked, 'flashcard', '\u26a1 Quick 5', null);
    })();
  }
};

window.DAILY10 = {
  COUNT: 10,
  _dateKey(){
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  },
  _seed(){ return parseInt(this._dateKey().replace(/-/g, ''), 10) || 20250101; },
  _rng(seed){
    let a = seed >>> 0;
    return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  _openedFids(){
    const cov = S.cov || {};
    return Object.keys(cov).filter(f => cov[f] && (cov[f].a || 0) > 0);
  },
  _doneKey(){ return 'abhyas_daily10_done'; },
  _streakKey(){ return 'abhyas_daily10_streak'; },
  _yesterdayKey(){
    const d = new Date(); d.setDate(d.getDate() - 1);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  },
  isDone(){ try { return localStorage.getItem(this._doneKey()) === this._dateKey(); } catch(e){ return false; } },
  _streakData(){ try { return JSON.parse(localStorage.getItem(this._streakKey()) || 'null') || { last: '', count: 0 }; } catch(e){ return { last: '', count: 0 }; } },
  streak(){
    const s = this._streakData();
    return (s.last === this._dateKey() || s.last === this._yesterdayKey()) ? (Number(s.count) || 0) : 0;
  },
  markDone(){
    const today = this._dateKey();
    try { localStorage.setItem(this._doneKey(), today); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    const s = this._streakData();
    if (s.last !== today) {
      const next = { last: today, count: s.last === this._yesterdayKey() ? (Number(s.count) || 0) + 1 : 1 };
      try { localStorage.setItem(this._streakKey(), JSON.stringify(next)); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    }
  },
  _weakCount(){
    const fids = new Set(this._openedFids());
    let n = 0;
    ((S.wr) || []).forEach(q => {
      if (!q || q._withdrawn) return;
      const uid = String(q.uid || ''), i = uid.lastIndexOf('_');
      if (i > 0 && fids.has(uid.slice(0, i))) n++;
    });
    return n;
  },
  _prioritize(list, weak){
    return list.slice().sort((a, b) => (weak.has(b.uid) ? 1 : 0) - (weak.has(a.uid) ? 1 : 0));
  },
  async build(){
    const fids = this._openedFids();
    if (!fids.length) return [];
    const rng = this._rng(this._seed());
    const all = [];
    const shuffled = fids.slice();
    for (let i = shuffled.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t; }
    for (const fid of shuffled){
      const ref = (typeof chapterRef === 'function') ? chapterRef(fid) : null;
      if (!ref) continue;
      try {
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        const qs = normQ(raw, ref.fid);
        for (const q of qs){
          const hist = (typeof QHIST !== 'undefined') ? QHIST.forUid(q.uid) : null;
          if (hist && hist.seen > 0 && hist.correct === hist.seen) continue;
          all.push(q);
        }
      } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
      if (all.length >= 200) break;
    }
    for (let i = all.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = all[i]; all[i] = all[j]; all[j] = t; }
    const weak = new Set(((S.wr) || []).filter(q => q && !q._withdrawn).map(q => q.uid));
    return this._prioritize(all, weak).slice(0, this.COUNT);
  },
  async start(){
    QUIZ._showLoader('Building today\u2019s 10\u2026');
    let picked = [];
    try { picked = await this.build(); } catch (e) { window.warnCaught && window.warnCaught('js/features/today-plan.js', e); }
    QUIZ._hideLoader();
    if (!picked.length){ toast('Open a chapter once and the daily set begins tomorrow.', 5000); return; }
    QUIZ.startWith(picked, 'flashcard', '\u2600\ufe0f Daily 10 \u2014 ' + this._dateKey(),
      { daily10: true, daily10Date: this._dateKey() });
  },
  render(){
    const box = document.getElementById('daily10-slot');
    if (!box) return;
    const fids = this._openedFids();
    if (!fids.length){ box.innerHTML = ''; return; }
    const streak = this.streak();
    if (this.isDone()){
      box.innerHTML =
        '<section class="card daily10-done">' +
          '<div class="card-hd"><h3><i class="ph ph-sun"></i> Daily 10</h3>' +
            '<span class="ctag tg"><i class="ph ph-check"></i> Done today</span></div>' +
          '<p class="t-foot">Today\u2019s set is complete' + (streak ? ' \u00b7 ' + streak + '-day streak' : '') + '. A fresh set arrives tomorrow.</p>' +
        '</section>';
      return;
    }
    const weak = this._weakCount();
    box.innerHTML =
      '<section class="card" style="border-color:var(--accent-line)">' +
        '<div class="card-hd"><h3><i class="ph ph-sun"></i> Daily 10</h3>' +
          '<span class="ctag ta">' + this.COUNT + ' questions</span></div>' +
        '<p class="t-foot" style="margin-bottom:var(--sp-2);line-height:1.5">A fresh set of ' + this.COUNT + ' questions from your opened chapters. Same for you all day, new one tomorrow.</p>' +
        '<div class="daily10-meta">' +
          (streak ? '<span class="daily10-streak"><i class="ph ph-flame"></i> ' + streak + '-day streak</span>' : '') +
          (weak ? '<span><i class="ph ph-target"></i> ' + Math.min(weak, this.COUNT) + ' missed questions included</span>' : '') +
        '</div>' +
        '<button class="btn btn-solid btn-blk" data-on-click="DAILY10.start()">' +
          '<i class="ph ph-play-circle"></i> Start today\u2019s ' + this.COUNT + '</button>' +
      '</section>';
  }
};