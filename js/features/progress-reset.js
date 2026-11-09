// js/features/progress-reset.js — scoped resets with undo, and the pre-reset
// snapshot.
// MUST load AFTER: core/state.js (S), core/storage.js (_save),
// core/text.js (esc), core/constants.js (LS), core/modal.js (openMod, closeMod),
// core/toast.js (toast, toastUndo), core/sync.js (mergeResets — only via
// PSYNC on the other end), data/chapters-data.js (ChapterData),
// core/psync.js (PSYNC), features/data.js (DATA.exportAll),
// features/home.js (HOME), features/progress.js (PROG), features/review.js (REV).
// SPRINT / WRONGBY / QHIST are referenced at call time only.

const PROGRESS_RESET = {
  KEY: 'abhyas_resets',
  SCOPES: {
    all:    { label:'Reset all progress',  word:'START FRESH', help:'Questions answered, accuracy, chapter coverage, wrong bank, exam history, study days and the 60-day sprint all go back to zero.' },
    wr:     { label:'Only the wrong bank', word:'RESET',       help:'Empties the wrong bank. Your accuracy, chapters and exam history stay.' },
    sprint: { label:'Only the 60-day sprint', word:'RESET',    help:'Restarts the sprint from Day 1 today. Nothing else changes.' },
    chapter:{ label:'Only one chapter',    word:'RESET',       help:'Clears that chapter\u2019s accuracy, coverage, sessions and wrong-bank questions.' },
    level:  { label:'Only one level',      word:'RESET',       help:'Clears every chapter in that level: accuracy, coverage, sessions and wrong-bank questions.' },
    exams:  { label:'Only exam history',   word:'RESET',       help:'Removes past timed-exam results from your history. Weekly-test results are kept (they are ranked on the server).' }
  },

  load(){ try { const v = JSON.parse(localStorage.getItem(this.KEY) || '{}'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch(e){ return {}; } },
  save(r){ try { localStorage.setItem(this.KEY, JSON.stringify(r || {})); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } },

  /* one question left the wrong bank (removed, or graduated after the 14-day review) */
  noteRemoved(uid){
    if(!uid) return;
    const r = this.load(); r.rm = r.rm || {};
    r.rm[String(uid)] = Date.now();
    const keys = Object.keys(r.rm);
    if(keys.length > 400){ keys.sort((x,y)=>r.rm[y]-r.rm[x]); const t = {}; keys.slice(0,400).forEach(k=>{ t[k] = r.rm[k]; }); r.rm = t; }
    this.save(r);
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
  },
  /* the whole wrong bank was cleared; returns the marker time so an undo can lift it */
  noteWrongCleared(){
    const T = Date.now(), r = this.load(); r.wr = T; this.save(r);
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return T;
  },
  /* undo: ignore the markers made at these times, everywhere */
  lift(times){
    const list = (times || []).map(Number).filter(v => v > 0);
    if(!list.length) return;
    const r = this.load();
    r.un = Array.from(new Set((r.un || []).concat(list))).slice(-40);
    ['all','wr','exams','sprint'].forEach(k => { if(list.indexOf(r[k]) !== -1) delete r[k]; });
    ['ch','rm'].forEach(k => { if(!r[k]) return; Object.keys(r[k]).forEach(id => { if(list.indexOf(r[k][id]) !== -1) delete r[k][id]; }); if(!Object.keys(r[k]).length) delete r[k]; });
    this.save(r);
  },
  /* loading an older backup file on purpose: its data must not be thrown away by an earlier reset */
  liftAll(){
    const r = this.load(), t = [];
    ['all','wr','exams','sprint'].forEach(k => { if(r[k]) t.push(r[k]); });
    ['ch','rm'].forEach(k => { Object.keys(r[k] || {}).forEach(id => t.push(r[k][id])); });
    this.lift(t);
    return t.length > 0;
  },

  chapters(){
    const out = [], seen = new Map();
    try {
      (ChapterData.allFileRefs() || []).forEach(ref => {
        const name = ChapterData.chapterName(ref.lv, ref.ch);
        const label = `${name} \u2014 ${ref.book}`;
        const hit = seen.get(label);
        if(hit){ hit.fids.push(ref.fid); return; }
        const item = { label, name, lv: ref.lv, ch: ref.ch, fids: [ref.fid] };
        seen.set(label, item);
        out.push(item);
      });
    } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
    /* also offer chapters that only exist in the saved stats (a file that is no longer listed) */
    Object.keys(S.chapStats || {}).forEach(k => { if(!seen.has(k)){ const item = { label:k, name:k, lv:'', ch:'', fids:[] }; seen.set(k, item); out.push(item); } });
    return out.sort((x,y)=>x.label.localeCompare(y.label));
  },

  /* Every chapter of one level, and the files and labels it covers. */
  _levelTarget(lv){
    let refs;
    try { refs = ChapterData.allFileRefs() || []; } catch (e) { refs = []; }
    const names = new Set(), labels = new Set(), fids = new Set();
    refs.forEach(r => {
      if(!r || r.lv !== lv) return;
      let name;
      try { name = ChapterData.chapterName(r.lv, r.ch) || ''; } catch (e) { name = ''; }
      if(name) names.add(name);
      if(name && r.book) labels.add(name + ' \u2014 ' + r.book);
      if(r.fid) fids.add(r.fid);
    });
    return { level: lv, names: Array.from(names), labels: Array.from(labels), fids: Array.from(fids), name:'', label:'', wholeLevel: true, wholeChapter: false };
  },

  _day(){ const d = new Date(), p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); },

  /* Reset one chapter everywhere it is counted. Called by the chapter sheet
     (the whole chapter, every book) and by the reset dialog (one list entry,
     which is scoped to its book). */
  /* The target a reset acts on: one chapter (all its books) or one dialog
     entry (a single book), resolved to the labels and files it covers. */
  _target(lv, ch, entry){
    let refs = [];
    if(!(entry && Array.isArray(entry.fids))){
      try { refs = ChapterData.chapterFileRefs(lv, ch) || []; } catch (e) { refs = []; }
    }
    const fids = (entry && Array.isArray(entry.fids)) ? entry.fids.slice() : refs.map(r => r && r.fid).filter(Boolean);
    let name = (entry && entry.name) || '';
    if(!name){
      try { name = ChapterData.chapterName(lv, ch) || ''; } catch (e) { name = ''; }
    }
    const first = refs.find(r => r && r.book);
    const label = (entry && entry.label) || (name && first ? name + ' \u2014 ' + first.book : name);
    return { name: String(name || ''), label: String(label || ''), lv: lv || '', ch: ch || '', fids: fids, wholeChapter: !entry };
  },

  _matches(target, s){
    if(!s) return false;
    const fids = target._fids || (target._fids = new Set((target.fids || []).filter(Boolean)));
    if(s.fid && fids.has(s.fid)) return true;
    if(target.wholeLevel){
      if(s.lv === target.level) return true;
      const names = target._names || (target._names = new Set(target.names || []));
      const labels = target._labels || (target._labels = new Set(target.labels || []));
      if(names.has(s.chapterKey)) return true;
      const c = String(s.chapter || '');
      if(labels.has(c)) return true;
      for(const n of names) if(n && c.indexOf(n + ' \u2014 ') === 0) return true;
      return false;
    }
    const name = target.name || '';
    if(target.wholeChapter){
      if(target.lv && target.ch && s.lv === target.lv && s.ch === target.ch) return true;
      if(name && s.chapterKey && s.chapterKey === name) return true;
      const c = String(s.chapter || '');
      return !!c && (c === name || c === target.label || (!!name && c.indexOf(name + ' \u2014 ') === 0));
    }
    return !!s.chapter && s.chapter === target.label;
  },

  runChapter(lv, ch, entry){
    const target = this._target(lv, ch, entry);
    if(!target.name && !target.fids.length) return 0;
    return this._resetChapter(target);
  },

  runLevel(lv){
    const target = this._levelTarget(lv);
    if(!target.fids.length && !target.names.length) return 0;
    return this._resetChapter(target);
  },

  /* What a reset would remove right now, so the confirmation can say what is at
     stake and a target with no progress can say so without a dialog. */
  _impact(target){
    const fids = new Set((target.fids || []).filter(Boolean));
    const sessions = (Array.isArray(S.prog.sessions) ? S.prog.sessions : []).filter(s => this._matches(target, s));
    let answered = 0, correct = 0;
    sessions.forEach(s => { answered += Number(s.total) || 0; correct += Number(s.correct) || 0; });
    const missed = (S.wr || []).filter(q => {
      if(!q) return false;
      const f = q.fileId || (typeof fidFromUid === 'function' ? fidFromUid(String(q.uid || '')) : '');
      return !!(f && fids.has(f));
    }).length;
    const sets = Array.from(fids).filter(f => !!(S.cov && S.cov[f])).length;
    return { sessions: sessions.length, answered: answered, correct: correct, missed: missed, sets: sets, files: fids.size };
  },

  chapterImpact(lv, ch, entry){
    return this._impact(this._target(lv, ch, entry));
  },

  levelImpact(lv){
    return this._impact(this._levelTarget(lv));
  },

  /* A set is one downloaded file. Its own sessions go; its answers inside
     chapter-wide sessions are lifted out without deleting other sets' work. */
  setImpact(fid){
    if(!fid) return { sessions:0, answered:0, correct:0, missed:0, sets:0, files:0 };
    const sessions = Array.isArray(S.prog.sessions) ? S.prog.sessions : [];
    let n = 0, answered = 0, correct = 0;
    sessions.forEach(s => {
      if(!s) return;
      if(s.fid === fid){
        n++; answered += Number(s.total) || 0; correct += Number(s.correct) || 0;
      } else if(Array.isArray(s.qres)){
        const mine = s.qres.filter(q => q && q.uid && typeof fidFromUid === 'function' && fidFromUid(String(q.uid)) === fid);
        if(mine.length){ n++; answered += mine.length; correct += mine.filter(q => q.ok).length; }
      }
    });
    const missed = (S.wr || []).filter(q => {
      if(!q) return false;
      const f = q.fileId || (typeof fidFromUid === 'function' ? fidFromUid(String(q.uid || '')) : '');
      return f === fid;
    }).length;
    return { sessions:n, answered:answered, correct:correct, missed:missed, sets:(S.cov && S.cov[fid]) ? 1 : 0, files:1 };
  },

  runSet(fid){
    if(!fid) return 0;
    const sessions = Array.isArray(S.prog.sessions) ? S.prog.sessions : [];
    let removedTotal = 0, removedCorrect = 0, removedSessions = 0, touched = 0;
    const kept = [];
    sessions.forEach(s => {
      if(!s) return;
      if(s.fid === fid){
        removedSessions++; removedTotal += Number(s.total) || 0; removedCorrect += Number(s.correct) || 0;
        return;
      }
      if(Array.isArray(s.qres) && s.qres.length){
        let rm = 0, rmOk = 0;
        const qk = [];
        s.qres.forEach(q => {
          if(q && q.uid && typeof fidFromUid === 'function' && fidFromUid(String(q.uid)) === fid){ rm++; if(q.ok) rmOk++; }
          else qk.push(q);
        });
        if(rm){
          touched++;
          s.qres = qk;
          s.correct = Math.max(0, (Number(s.correct) || 0) - rmOk);
          s.wrong   = Math.max(0, (Number(s.wrong) || 0) - (rm - rmOk));
          s.total   = Math.max(0, (Number(s.total) || 0) - rm);
          removedTotal += rm; removedCorrect += rmOk;
          if(!s.qres.length && !(Number(s.total) || 0)) return;
        }
      }
      kept.push(s);
    });
    const dropWr = q => {
      if(!q) return false;
      const f = q.fileId || (typeof fidFromUid === 'function' ? fidFromUid(String(q.uid || '')) : '');
      return f === fid;
    };
    const removedWr = (S.wr || []).filter(dropWr);
    const hadCov = !!(S.cov && S.cov[fid]);
    if(!removedSessions && !touched && !removedWr.length && !hadCov) return 0;

    const T = Date.now();
    RESET_SNAPSHOT.save('scoped:set', [T]);
    S.prog.sessions = kept;
    S.prog.total = Math.max(0, (Number(S.prog.total) || 0) - removedTotal);
    S.prog.correct = Math.max(0, (Number(S.prog.correct) || 0) - removedCorrect);
    if(S.cov) delete S.cov[fid];
    S.wr = (S.wr || []).filter(q => !dropWr(q));

    const r = this.load();
    r.ch = r.ch || {};
    r.ch[fid] = T;
    if(removedWr.length){
      r.rm = r.rm || {};
      removedWr.forEach(q => { if(q && q.uid != null) r.rm[String(q.uid)] = T; });
      const keys = Object.keys(r.rm);
      if(keys.length > 400){
        keys.sort((x, y) => r.rm[y] - r.rm[x]);
        const keep = {};
        keys.slice(0, 400).forEach(k => { keep[k] = r.rm[k]; });
        r.rm = keep;
      }
    }
    this.save(r);
    return this._commit(T);
  },

  _resetChapter(target){
    const fids = new Set((target.fids || []).filter(Boolean));
    const name = String(target.name || '');
    const label = String(target.label || name);
    const sessions = Array.isArray(S.prog.sessions) ? S.prog.sessions : [];
    const removed = sessions.filter(s => this._matches(target, s));
    const labels = Array.from(new Set(removed.map(s => s && s.chapter).filter(Boolean)));
    const statKeys = new Set();
    const levelNames = target.wholeLevel ? (target.names || []) : [];
    Object.keys(S.chapStats || {}).forEach(k => {
      if(k === name || k === label || labels.indexOf(k) !== -1 || (target.wholeChapter && !!name && k.indexOf(name + ' \u2014 ') === 0)){ statKeys.add(k); return; }
      if(target.wholeLevel && (levelNames.indexOf(k) !== -1 || (target.labels || []).indexOf(k) !== -1 || levelNames.some(n => n && k.indexOf(n + ' \u2014 ') === 0))) statKeys.add(k);
    });
    const fidOf = q => {
      if(!q) return '';
      if(q.fileId) return q.fileId;
      return (typeof fidFromUid === 'function') ? fidFromUid(String(q.uid || '')) : '';
    };
    const dropWr = q => { const f = fidOf(q); return !!(f && fids.has(f)); };
    const removedWr = (S.wr || []).filter(dropWr);
    const covHit = Array.from(fids).some(f => !!(S.cov && S.cov[f]));
    if(!removed.length && !removedWr.length && !covHit && !statKeys.size) return 0;

    const T = Date.now();
    RESET_SNAPSHOT.save(target.wholeLevel ? 'scoped:level' : 'scoped:chapter', [T]);
    S.prog.sessions = sessions.filter(s => !this._matches(target, s));
    if(S.chapStats) statKeys.forEach(k => { delete S.chapStats[k]; });
    if(S.cov) fids.forEach(f => { delete S.cov[f]; });
    S.wr = (S.wr || []).filter(q => !dropWr(q));

    const r = this.load();
    r.ch = r.ch || {};
    const markKeys = [name, label].concat(labels, Array.from(fids), Array.from(statKeys));
    if(target.wholeLevel) markKeys.push.apply(markKeys, (target.names || []).concat(target.labels || []));
    markKeys.forEach(k => { if(k) r.ch[k] = T; });
    if(removedWr.length){
      r.rm = r.rm || {};
      removedWr.forEach(q => { if(q && q.uid != null) r.rm[String(q.uid)] = T; });
      const keys = Object.keys(r.rm);
      if(keys.length > 400){
        keys.sort((x, y) => r.rm[y] - r.rm[x]);
        const keep = {};
        keys.slice(0, 400).forEach(k => { keep[k] = r.rm[k]; });
        r.rm = keep;
      }
    }
    this.save(r);
    return this._commit(T);
  },

  /* Does the work. Returns the marker time, or 0 when nothing was done. */
  run(scope, chapterLabel, level){
    if(!this.SCOPES[scope]) return 0;
    if(scope === 'chapter'){
      const chapter = this.chapters().find(c => c.label === chapterLabel);
      return chapter ? this.runChapter(chapter.lv, chapter.ch, chapter) : 0;
    }
    if(scope === 'level') return this.runLevel(level || 'level7');
    const T = Date.now();
    RESET_SNAPSHOT.save('scoped:' + scope, [T]);
    const r = this.load();
    if(scope === 'all'){
      S.prog = Object.assign({}, S.prog, { total:0, correct:0, sessions:[], bestRun:0, gen:T });
      S.chapStats = {}; S.cov = {}; S.wr = []; S.stk = {days:[], last:''}; S.fcount = {};
      try { localStorage.removeItem('abhyas_practice_snap'); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      try { localStorage.setItem('abhyas_sprint_start', this._day()); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      try { localStorage.removeItem('abhyas_sprint_off'); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      try { if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG.clear(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      r.all = T; r.sprint = T;
    } else if(scope === 'wr'){
      S.wr = []; r.wr = T;
    } else if(scope === 'sprint'){
      try { localStorage.setItem('abhyas_sprint_start', this._day()); localStorage.removeItem('abhyas_sprint_off'); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      try { if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG.clear(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      r.sprint = T;
    } else if(scope === 'exams'){
      S.prog.sessions = (S.prog.sessions || []).filter(s => !(s && s.mode === 'exam'));
      r.exams = T;
    }
    this.save(r);
    return this._commit(T);
  },

  /* The tail every scoped reset shares: persist the stores, refresh whatever
     is on screen, and tell sync. Returns the marker time. */
  _commit(T){
    _save(LS.PROG, S.prog); _save(LS.CHAPSTATS, S.chapStats); _save(LS.COV, S.cov);
    _save(LS.WR, S.wr); _save(LS.STK, S.stk); _save(LS.FCOUNT, S.fcount);
    try { localStorage.removeItem(LS.EXAM_SNAP); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
    try { if(typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; if(typeof QHIST !== 'undefined') QHIST._cache = null; } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
    try { HOME.render(); PROG.render(); HOME.updateBadges(); REV.renderList('wr'); if(typeof SPRINT !== 'undefined') SPRINT.render(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
    try { RESET_SNAPSHOT.renderCard(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return T;
  },

  /* ── the dialog ── */
  _scope: 'all',
  open(){
    this._scope = 'all';
    const opts = Object.keys(this.SCOPES).map(k => {
      const s = this.SCOPES[k];
      return `<label class="pr-opt"><input type="radio" name="pr-scope" value="${k}"${k==='all'?' checked':''} data-on-change="PROGRESS_RESET._pick('${k}')"><span><b>${esc(s.label)}</b><span class="t-foot" style="display:block">${esc(s.help)}</span></span></label>`;
    }).join('');
    const chs = this.chapters().map(c => {
      const n = this.chapterImpact(c.lv, c.ch, c).answered;
      return `<option value="${esc(c.label)}">${esc(c.label)}${n ? ' \u2014 ' + n + ' answered' : ''}</option>`;
    }).join('');
    openMod('Reset progress', `
      <p class="t-callout mb3">Bookmarks, flags, notes, downloaded PDFs and your reports are <b>never</b> removed.</p>
      <div class="pr-list" role="radiogroup" aria-label="What to reset">${opts}</div>
      <div id="pr-chapter-row" style="display:none;margin:var(--sp-2) 0"><label class="t-foot" for="pr-chapter">Chapter</label>
        <select class="input" id="pr-chapter">${chs || '<option value="">No chapters yet</option>'}</select></div>
      <div id="pr-level-row" style="display:none;margin:var(--sp-2) 0"><label class="t-foot" for="pr-level">Level</label>
        <select class="input" id="pr-level"><option value="level7">Level 7</option><option value="level5">Level 5</option><option value="gk">General Knowledge</option></select></div>
      <div class="t-foot" style="margin:var(--sp-3) 0 var(--sp-1)"><b>Back up first</b> (recommended)</div>
      <div class="bg" style="margin-bottom:var(--sp-1)">
        <button type="button" class="btn btn-quiet btn-sm" data-on-click="PROGRESS_RESET._backupFile()"><i class="ph ph-download-simple"></i> Download backup (JSON)</button>
        <button type="button" class="btn btn-quiet btn-sm" data-on-click="PROGRESS_RESET._backupCloud()"><i class="ph ph-cloud-arrow-up"></i> Back up to cloud</button>
      </div>
      <div id="pr-backup-msg" class="t-foot" aria-live="polite" style="min-height:1.2em">No backup made yet. A 24-hour undo copy is kept on this device either way.</div>
      <label class="t-foot" for="pr-typed" style="display:block;margin-top:var(--sp-3)" id="pr-typed-lbl">Type START FRESH to confirm</label>
      <input class="input" id="pr-typed" autocomplete="off" autocapitalize="characters" data-on-input="PROGRESS_RESET._check()" style="margin:var(--sp-1) 0 var(--sp-3)">
      <div class="bg"><button type="button" class="btn btn-r" id="pr-go" disabled data-on-click="PROGRESS_RESET._go()"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
      <button type="button" class="btn btn-quiet" data-on-click="closeMod()">Cancel</button></div>`);
  },
  _pick(k){
    this._scope = k;
    const row = document.getElementById('pr-chapter-row'); if(row) row.style.display = (k === 'chapter') ? '' : 'none';
    const lvRow = document.getElementById('pr-level-row'); if(lvRow) lvRow.style.display = (k === 'level') ? '' : 'none';
    const lbl = document.getElementById('pr-typed-lbl'); if(lbl) lbl.textContent = 'Type ' + this.SCOPES[k].word + ' to confirm';
    const t = document.getElementById('pr-typed'); if(t) t.value = '';
    this._check();
  },
  _check(){
    const t = document.getElementById('pr-typed'), go = document.getElementById('pr-go');
    if(!t || !go) return;
    const word = this.SCOPES[this._scope].word;
    const chOk = this._scope !== 'chapter' || !!(document.getElementById('pr-chapter') || {}).value;
    go.disabled = !(chOk && t.value.trim().toUpperCase() === word);
  },
  _backupFile(){
    try { DATA.exportAll(); this._msg('Backup file downloaded. Keep it somewhere safe.'); } catch(e){ this._msg('Could not make the file. Try again.'); }
  },
  async _backupCloud(){
    if(!S.user || !S.user.token){ this._msg('Log in to back up to the cloud.'); return; }
    if(!S.online || S.forcedOffline){ this._msg('You are offline. Download the file instead.'); return; }
    this._msg('Backing up\u2026');
    try { await PSYNC.pushNow(); this._msg('Cloud backup done.'); } catch(e){ this._msg('Cloud backup failed. Download the file instead.'); }
  },
  _msg(t){ const el = document.getElementById('pr-backup-msg'); if(el) el.textContent = t; },
  _go(){
    const scope = this._scope;
    const ch = (document.getElementById('pr-chapter') || {}).value || '';
    const lv = (document.getElementById('pr-level') || {}).value || 'level7';
    const T = this.run(scope, ch, lv);
    closeMod();
    if(!T){ toast('Nothing was reset.'); return; }
    toastUndo('Reset done: ' + this.SCOPES[scope].label.replace(/^Reset /,'').toLowerCase(), () => {
      if(RESET_SNAPSHOT.restore()){ try { HOME.render(); PROG.render(); HOME.updateBadges(); REV.renderList('wr'); RESET_SNAPSHOT.renderCard(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } toast('Restored.'); }
    }, 12000);
  }
};
window.PROGRESS_RESET = PROGRESS_RESET;

const RESET_SNAPSHOT = {
  KEY: 'abhyas_pre_reset_snapshot',
  /* v1.37: the undo copy is kept until the NEXT reset replaces it. The app never expires it by itself. */
  TTL_MS: Infinity,

  save(reason, created){
    try {
      let sprint = ''; try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      const snap = {
        at: Date.now(),
        reason: reason || 'reset',
        created: Array.isArray(created) ? created : [],
        sprint,
        sprintOff: (function(){ try { return localStorage.getItem('abhyas_sprint_off') || ''; } catch(e){ return ''; } })(),
        sprintLog: (function(){ try { return localStorage.getItem('abhyas_sprint_log') || ''; } catch(e){ return ''; } })(),
        fcount:    S.fcount,
        prog:      S.prog,
        bk:        S.bk,
        fl:        S.fl,
        wr:        S.wr,
        stk:       S.stk,
        chapStats: S.chapStats,
        cov:       S.cov,
        tt:        S.tt
      };
      localStorage.setItem(this.KEY, JSON.stringify(snap));
      return true;
    } catch(e){
      console.warn('[reset-snapshot] save failed:', e);
      return false;
    }
  },

  read(){
    try {
      const raw = localStorage.getItem(this.KEY);
      if(!raw) return null;
      const snap = JSON.parse(raw);
      if(!snap || !snap.at) return null;
      if(Date.now() - snap.at > this.TTL_MS){ this.clear(); return null; }
      return snap;
    } catch(e){ return null; }
  },

  clear(){ try { localStorage.removeItem(this.KEY); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } },

  restore(){
    const snap = this.read();
    if(!snap) return false;
    if(snap.prog)      S.prog      = snap.prog;
    if(snap.bk)        S.bk        = snap.bk;
    if(snap.fl)        S.fl        = snap.fl;
    if(snap.wr)        S.wr        = snap.wr;
    if(snap.stk)       S.stk       = snap.stk;
    if(snap.chapStats) S.chapStats = snap.chapStats;
    if(snap.cov)       S.cov       = snap.cov;
    if(snap.tt)        S.tt        = snap.tt;
    if(snap.fcount)    { S.fcount = snap.fcount; _save(LS.FCOUNT, S.fcount); }
    if(snap.sprint)    { try { localStorage.setItem('abhyas_sprint_start', snap.sprint); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } }
    if(snap.sprintOff) { try { localStorage.setItem('abhyas_sprint_off', snap.sprintOff); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } }
    if(snap.sprintLog) { try { localStorage.setItem('abhyas_sprint_log', snap.sprintLog); if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG._resetMemory(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); } }
    /* undo the reset markers this reset made, so other devices stop applying them too */
    if(Array.isArray(snap.created) && snap.created.length) PROGRESS_RESET.lift(snap.created);
    _save(LS.PROG, S.prog);
    _save(LS.BK, S.bk);
    _save(LS.FL, S.fl);
    _save(LS.WR, S.wr);
    _save(LS.STK, S.stk);
    _save(LS.CHAPSTATS, S.chapStats);
    _save(LS.COV, S.cov);
    _save(LS.TT, S.tt);
    this.clear();
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return true;
  },

  renderCard(){
    const snap = this.read();
    const slot = document.getElementById('reset-recover-slot');
    if(!slot) return;
    if(!snap){ slot.innerHTML = ''; return; }
    const mins = Math.max(1, Math.round((Date.now() - snap.at) / 60000));
    const ago = mins < 60 ? mins + ' min ago' : Math.round(mins/60) + ' h ago';
    const labels = { reset:'Reset this device', resetCloud:'Reset progress everywhere', deleteAccount:'Delete account',
      'scoped:all':'Reset all progress', 'scoped:wr':'Reset wrong bank', 'scoped:sprint':'Reset 60-day sprint',
      'scoped:chapter':'Reset one chapter', 'scoped:set':'Reset one set', 'scoped:level':'Reset one level', 'scoped:exams':'Reset exam history' };
    slot.innerHTML =
      '<section class="card" style="border-color:var(--warning-line);background:var(--warning-soft)">' +
        '<div class="card-hd"><h3 style="color:var(--warning)"><i class="ph ph-arrow-counter-clockwise"></i> Recover your data?</h3></div>' +
        '<p class="t-callout" style="color:var(--ink);margin-bottom:var(--sp-3)">' +
          'You ran <b>' + esc(labels[snap.reason] || snap.reason) + '</b> ' + esc(ago) + '. ' +
          'A safety copy was kept on this device. Restore it to bring everything back?' +
        '</p>' +
        '<div class="bg">' +
          '<button class="btn btn-solid" data-on-click="RESET_SNAPSHOT._doRestore()"><i class="ph ph-arrow-counter-clockwise"></i> Restore</button>' +
          '<button class="btn btn-quiet" data-on-click="RESET_SNAPSHOT._dismiss()">Discard</button>' +
        '</div>' +
      '</section>';
  },

  _doRestore(){
    if(this.restore()){
      toast('✅ Your data has been restored.');
      try { HOME.render(); PROG.render(); } catch (e) { window.warnCaught && window.warnCaught('js/features/progress-reset.js', e); }
      this.renderCard();
    } else {
      toast('Could not restore — the snapshot may have expired.');
      this.renderCard();
    }
  },

  _dismiss(){
    this.clear();
    this.renderCard();
    toast('Snapshot discarded.');
  }
};
window.RESET_SNAPSHOT = RESET_SNAPSHOT;