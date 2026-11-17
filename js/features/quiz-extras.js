// js/features/quiz-extras.js — confidence, misconceptions, recovery,
// read-aloud, fast-guess, image zoom, copy-explanation, question notes + history.

window.CONF = {
  render(){
    const box = $('fc-conf');
    if (!box) return;
    if (!S.quiz || !S.quiz.qs) { box.innerHTML = ''; return; }
    const idx = S.quiz.idx;
    const answered = S.quiz.ans[idx] !== null && S.quiz.ans[idx] !== undefined;
    if (!answered || S.quiz.reviewOnly) { box.innerHTML = ''; return; }
    const chosen = (S.quiz.conf && S.quiz.conf[idx]) || null;
    box.innerHTML =
      '<div class="conf-prompt">' +
        '<div class="conf-q">How sure were you?</div>' +
        '<div class="conf-btns" role="group" aria-label="Confidence in this answer">' +
          '<button type="button" class="conf-btn' + (chosen === 'sure' ? ' on' : '') + '" data-level="sure" data-on-click="QUIZ.setConf(\'sure\')">Sure</button>' +
          '<button type="button" class="conf-btn' + (chosen === 'unsure' ? ' on' : '') + '" data-level="unsure" data-on-click="QUIZ.setConf(\'unsure\')">Not sure</button>' +
          '<button type="button" class="conf-btn' + (chosen === 'guess' ? ' on' : '') + '" data-level="guess" data-on-click="QUIZ.setConf(\'guess\')">Guessed</button>' +
        '</div>' +
      '</div>';
  }
};

QUIZ.setConf = function(level){
  if (!S.quiz || S.quiz.reviewOnly) return;
  const idx = S.quiz.idx;
  if (!S.quiz.conf) S.quiz.conf = {};
  S.quiz.conf[idx] = level;
  const q = S.quiz.qs[idx];
  const ans = S.quiz.ans[idx];
  if (!q || ans === null || ans === undefined) { CONF.render(); return; }
  const wasWrong = !isOk(ans, q.correct);
  /* Scheduling lives in REV so the same rules apply to flashcards, exams and
     any future answer surface. A guessed-correct answer is not allowed to
     take the normal long interval. */
  if (typeof REV !== 'undefined' && REV.applyConfidence) {
    REV.applyConfidence(q, level, { correct: !wasWrong });
  }
  CONF.render();
  try { if (typeof QUIZ._paintFeedback === 'function') QUIZ._paintFeedback(); } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
  try { if (typeof PRACTICE_RESUME !== 'undefined') PRACTICE_RESUME.snapshot(); } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
};

window.MISCONCEPTIONS = {
  list(){
    try { return (S.wr || []).filter(x => x._misconception); } catch(e){ return []; }
  },
  render(){
    const box = $('misconception-slot');
    if (!box) return;
    const items = this.list();
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML =
      '<section class="misconception-card">' +
        '<div class="head"><i class="ph ph-warning-circle"></i> Misconceptions to fix' +
          '<span class="count">' + items.length + '</span></div>' +
        '<p>You were <b>sure</b> of the wrong answer on these. Fixing a misconception raises your score faster than anything else \u2014 the idea is already in your head, it just needs correcting.</p>' +
        '<button class="btn btn-solid btn-blk" data-on-click="MISCONCEPTIONS.start()">' +
          '<i class="ph ph-target"></i> Review these ' + items.length + ' now' +
        '</button>' +
      '</section>';
  },
  start(){
    const items = this.list();
    if (!items.length) return;
    QUIZ.startWith(items.slice(), 'flashcard', '\u{1F3AF} Misconceptions', null);
  }
};

window.RECOVERY = {
  KEY: 'abhyas_last_active',
  DAYS: 3,

  markActive(){
    try { localStorage.setItem(this.KEY, String(Date.now())); } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
  },
  _gapMs(){
    try {
      const raw = Number(localStorage.getItem(this.KEY) || 0);
      if (!raw) return 0;
      return Date.now() - raw;
    } catch(e){ return 0; }
  },
  shouldShow(){
    const gap = this._gapMs();
    return gap >= this.DAYS * 24 * 60 * 60 * 1000;
  },
  render(){
    const box = $('recovery-slot');
    if (!box) return;
    if (!this.shouldShow()) { box.innerHTML = ''; return; }
    const days = Math.round(this._gapMs() / 86400000);
    box.innerHTML =
      '<section class="recovery-card">' +
        '<div class="head"><i class="ph ph-hand-waving"></i> Welcome back</div>' +
        '<p>It\u2019s been ' + days + ' day' + (days === 1 ? '' : 's') + '. Nothing is lost \u2014 your progress and streak are safe. Let\u2019s start with 5 gentle questions from the chapters you\u2019re strongest at.</p>' +
        '<div class="bg">' +
          '<button class="btn btn-solid" data-on-click="RECOVERY.start()"><i class="ph ph-play-circle"></i> Start gently</button>' +
          '<button class="btn btn-quiet" data-on-click="RECOVERY.dismiss()">Skip for now</button>' +
        '</div>' +
      '</section>';
  },
  dismiss(){
    const box = $('recovery-slot');
    if (box) box.innerHTML = '';
  },
  async start(){
    const refs = this._strongFiles();
    if (!refs.length) { QUIZ.daily(); return; }
    toast('Loading 5 gentle questions\u2026', 1500);
    const all = [];
    for (const ref of refs.slice(0, 2)) {
      try {
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        all.push(...normQ(raw, ref.fid));
      } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
      if (all.length >= 15) break;
    }
    if (!all.length) { QUIZ.daily(); return; }
    QUIZ.startWith(shuf(all).slice(0, 5), 'flashcard', '\u{1F44B} Back gently', null);
    this.markActive();
  },
  _strongFiles(){
    try {
      const entries = (typeof CHAPSTATS !== 'undefined' && CHAPSTATS.entries) ? CHAPSTATS.entries() : [];
      const strongChapters = new Set(
        entries.filter(e => e.attempted >= 5 && e.accuracy >= 70).map(e => e.chapter)
      );
      if (!strongChapters.size) return [];
      const all = ChapterData.allFileRefs();
      return shuf(all.filter(r => strongChapters.has(ChapterData.chapterName(r.lv, r.ch))));
    } catch(e){ return []; }
  }
};

window.READALOUD = {
  _btn: null,
  supported(){
    return typeof window.speechSynthesis !== 'undefined' &&
           typeof window.SpeechSynthesisUtterance !== 'undefined';
  },
  _text(){
    if (!S.quiz || !S.quiz.qs) return '';
    const q = S.quiz.qs[S.quiz.idx];
    if (!q) return '';
    const opts = (q.options || []).map((o, i) => String.fromCharCode(65 + i) + ': ' + o).join('. ');
    return (q.q || '') + '. ' + opts;
  },
  render(){
    const box = $('fc-tools');
    if (!box) return;
    if (!this.supported()) { box.innerHTML = ''; return; }
    const speaking = window.speechSynthesis.speaking;
    box.innerHTML =
      '<button type="button" class="tts-btn' + (speaking ? ' speaking' : '') + '" ' +
        'data-on-click="READALOUD.toggle()" aria-label="Read this question aloud">' +
        '<i class="ph ph-speaker-high"></i> ' + (speaking ? 'Stop' : 'Read') +
      '</button>';
  },
  toggle(){
    if (!this.supported()) return;
    if (window.speechSynthesis.speaking) { this.stop(); return; }
    const text = this._text();
    if (!text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-IN';
      u.rate = 0.95;
      u.onend = () => READALOUD.render();
      u.onerror = () => READALOUD.render();
      window.speechSynthesis.speak(u);
      this.render();
    } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
  },
  stop(){
    if (!this.supported()) return;
    try { window.speechSynthesis.cancel(); } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
    this.render();
  }
};

window.FAST_GUESS = {
  _shownAt: {},
  _durations: {},
  markShown(idx){ if (this._shownAt[idx] == null) this._shownAt[idx] = Date.now(); },
  markAnswered(idx){
    if (this._shownAt[idx] == null) return;
    this._durations[idx] = Date.now() - this._shownAt[idx];
    delete this._shownAt[idx];
  },
  reset(){ this._shownAt = {}; this._durations = {}; },
  fastWrongIndexes(quiz){
    const out = [];
    if (!quiz || !quiz.qs || !quiz.ans) return out;
    quiz.qs.forEach((q, i) => {
      const ms = this._durations[i];
      if (ms == null) return;
      const wasWrong = !isOk(quiz.ans[i], q.correct);
      if (wasWrong && ms < 10000) out.push(i);
    });
    return out;
  }
};

window.IMGZOOM = {
  open(src, alt){
    const box = $('img-fullscreen');
    const img = $('img-fullscreen-img');
    if (!box || !img) return;
    img.src = src;
    img.alt = alt || 'Question image';
    box.classList.add('show');
    document.body.style.overflow = 'hidden';
    /* Tab-trap the zoom view; Escape closes it (handled here, not shell-hooks). */
    DIALOG.open(box, { onEscape: () => IMGZOOM.close() });
  },
  close(){
    const box = $('img-fullscreen');
    if (!box) return;
    box.classList.remove('show');
    document.body.style.overflow = '';
    DIALOG.release(box);
  }
};

window.COPY_EXPL = {
  async copy(text, btn){
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-check"></i>';
        setTimeout(() => { btn.innerHTML = orig; }, 1200);
      }
      if (typeof toast === 'function') toast('Explanation copied');
    } catch(e){
      if (typeof toast === 'function') toast('Could not copy \u2014 long-press the text instead');
    }
  }
};

window.QNOTE = {
  KEY: 'abhyas_qnotes',
  MAX: 500,
  _cache: null,

  _load(){
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(this.KEY);
      const o = raw ? JSON.parse(raw) : {};
      this._cache = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch(e){ this._cache = {}; }
    return this._cache;
  },
  _save(){
    try { localStorage.setItem(this.KEY, JSON.stringify(this._cache || {})); } catch (e) { window.warnCaught && window.warnCaught('js/features/quiz-extras.js', e); }
  },

  /* Notes live under the question's permanent id ('q:<qid>'). Content that has
     no qid yet keeps the old positional-uid key. `who` is a question, a note key
     or a legacy uid string. A note found under the old uid is moved to the
     permanent id the first time it is read or written with a question that has
     one, so it stops depending on where the question sits in its set. */
  _keys(who){
    const k = (typeof QKEY !== 'undefined') ? QKEY.mapKeys(who) : { primary: String((who && who.uid) || who || ''), legacy: '' };
    return k;
  },
  _has(k){ return !!k && Object.prototype.hasOwnProperty.call(this._load(), k); },

  /* Move a note saved under the old positional uid to the permanent id. Done on
     every question-based read, so a later clear/edit by key can never find (or
     resurrect) a stale positional copy. */
  _adopt(k){
    if (k.legacy && k.primary && k.legacy !== k.primary && this._has(k.legacy)) this.rekey(k.legacy, k.primary);
  },

  get(who){
    const k = this._keys(who);
    if (!k.primary) return '';
    this._adopt(k);
    const m = this._load();
    const v = this._has(k.primary) ? m[k.primary] : '';
    /* Reads normalise what was damaged on the way in, so a note saved before
       this existed heals on the next render. Nothing needs the pristine value:
       exports and sync read localStorage directly, and set() repairs before
       it stores. */
    return (typeof repairPasted === 'function') ? repairPasted(v || '') : String(v || '');
  },
  set(who, text){
    const k = this._keys(who);
    if (!k.primary) return;
    this._adopt(k);
    const m = this._load();
    const raw = (typeof repairPasted === 'function')
      ? repairPasted(text)
      : String(text == null ? '' : text);
    const t = raw.slice(0, this.MAX).trim();
    if (t) m[k.primary] = t; else delete m[k.primary];
    if (k.legacy) delete m[k.legacy];          // the old positional copy is superseded
    this._save();
  },
  remove(who, containerId){
    this.set(who, '');
    if (containerId) this.render(containerId, who);
  },

  /* Move a note from one key to another (a question moved, or learned its qid).
     Never overwrites a note already at the destination, never loses one. */
  rekey(from, to){
    if (!from || !to || from === to) return false;
    const m = this._load();
    if (!this._has(from)) return false;
    if (!this._has(to)) m[to] = m[from];
    delete m[from];
    this._save();
    return true;
  },

  _inputId(key){ return 'qnote-input-' + String(key).replace(/[^a-zA-Z0-9]/g, '_'); },

  render(containerId, who, opts){
    const box = document.getElementById(containerId);
    if (!box) return;
    const key = this._keys(who).primary;
    this._adopt(this._keys(who));
    box.dataset.uid = key || '';
    if (!key) { box.innerHTML = ''; return; }

    const note = this.get(who);
    const readOnly = !!(opts && opts.readOnly);
    const editing  = !!(opts && opts.editing);
    /* Handlers receive the NOTE KEY, never a position. */
    const safeUid  = escAttrJs(key);
    const safeBox  = escAttrJs(containerId);
    const inputId  = this._inputId(key);

    if (editing) {
      box.innerHTML =
        '<div class="qnote-box editing">' +
          '<div class="qnote-hd"><i class="ph ph-note"></i> Your note</div>' +
          '<textarea class="qnote-input" id="' + inputId + '" maxlength="' + this.MAX + '" ' +
            'placeholder="Write something you want to remember about this question\u2026">' +
            esc(note) +
          '</textarea>' +
          '<div class="qnote-actions">' +
            '<button type="button" class="btn btn-sm btn-quiet" data-on-click="QNOTE.cancel(\'' + safeBox + '\')">Cancel</button>' +
            '<button type="button" class="btn btn-sm btn-solid" data-on-click="QNOTE.commit(\'' + safeUid + '\',\'' + safeBox + '\')">Save note</button>' +
          '</div>' +
        '</div>';
      setTimeout(() => { const t = document.getElementById(inputId); if (t) { t.focus(); t.selectionStart = t.value.length; } }, 30);
      return;
    }

    if (note) {
      box.innerHTML =
        '<div class="qnote-box">' +
          '<div class="qnote-hd">' +
            '<i class="ph ph-note"></i> Your note' +
            (readOnly ? '' :
              '<button type="button" class="qnote-act" data-on-click="QNOTE.edit(\'' + safeUid + '\',\'' + safeBox + '\')" aria-label="Edit your note"><i class="ph ph-pencil-simple"></i></button>' +
              '<button type="button" class="qnote-act danger" data-on-click="QNOTE.remove(\'' + safeUid + '\',\'' + safeBox + '\')" aria-label="Delete your note"><i class="ph ph-trash"></i></button>') +
          '</div>' +
          '<div class="qnote-text">' + esc(note) + '</div>' +
        '</div>';
      /* The note is written after any surrounding renderMath() call has
         already run (the flashcard renders fc-wrap first), so it renders its
         own box rather than relying on the caller's order. */
      renderMath(box);
      return;
    }

    if (readOnly) { box.innerHTML = ''; return; }

    box.innerHTML =
      '<button type="button" class="qnote-add" data-on-click="QNOTE.edit(\'' + safeUid + '\',\'' + safeBox + '\')">' +
        '<i class="ph ph-plus"></i> Add a personal note' +
      '</button>';
  },

  /* The buttons carry the note key, so edit/commit/remove act on exactly the
     question that was on screen even if the list re-sorts underneath. */
  edit(key, containerId){ this.render(containerId, key, { editing: true }); },
  cancel(containerId){
    const box = document.getElementById(containerId);
    const key = box && box.dataset ? box.dataset.uid : '';
    this.render(containerId, key);
  },
  commit(key, containerId){
    const ta = document.getElementById(this._inputId(key));
    const txt = ta ? ta.value : '';
    this.set(key, txt);
    toast(this.get(key) ? 'Note saved' : 'Note cleared');
    this.render(containerId, key);
  }
};

window.QHIST = {
  _cache: null,
  /* One record per question, reachable by its stable qid and by the positional
     uid it happened to have when each answer was recorded. A re-export
     renumbers uid but never qid, so history used to vanish for any question
     whose uid changed — and lookups made by qid found nothing at all. */
  _index(){
    if (this._cache) return this._cache;
    const recs = {};   // identity -> record
    const name = {};   // any uid/qid seen -> identity
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for (let i = 0; i < sessions.length; i++){
      const qres = sessions[i] && sessions[i].qres;
      if (!Array.isArray(qres)) continue;
      for (let j = 0; j < qres.length; j++){
        const r = qres[j];
        if (!r) continue;
        const id = r.qid || r.uid;
        if (!id) continue;
        const key = name[id] || (name[id] = id);
        const rec = recs[key] || (recs[key] = { seen: 0, correct: 0 });
        rec.seen++;
        if (r.ok) rec.correct++;
        if (r.uid) name[r.uid] = key;
        if (r.qid) name[r.qid] = key;
      }
    }
    const map = {};
    for (const id in name) map[id] = recs[name[id]];
    this._cache = map;
    return map;
  },
  forUid(uid){ return this._index()[uid] || null; },
  render(containerId, uid){
    const box = document.getElementById(containerId);
    if (!box) return;
    if (!uid){ box.innerHTML = ''; return; }
    const r = this.forUid(uid);
    if (!r || r.seen < 2){ box.innerHTML = ''; return; }
    const pct = Math.round((r.correct / r.seen) * 100);
    const cls = pct >= 70 ? 'ok' : pct >= 40 ? 'mid' : 'low';
    box.innerHTML =
      '<div class="qhist-line">' +
        '<i class="ph ph-clock-counter-clockwise"></i> ' +
        'Seen ' + r.seen + '\u00d7 \u00b7 ' + r.correct + ' correct ' +
        '<b class="' + cls + '">(' + pct + '%)</b>' +
      '</div>';
  }
};