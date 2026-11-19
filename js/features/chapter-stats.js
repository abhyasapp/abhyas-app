// js/features/chapter-stats.js — the per-chapter accuracy rollup and the
// per-file coverage store. Moved from the ORIGINAL 01-state-storage-helpers.js
// (they lived there as top-level consts). MUST load AFTER: core/constants.js
// (LS), core/storage.js (_save), core/state.js (S).

const CHAPSTATS = {
  record(sess){
    const key = sess.chapter || 'Unknown';
    const rec = S.chapStats[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
    rec.attempted += sess.total || 0;
    rec.correct += sess.correct || 0;
    rec.sessions += 1;
    rec.lastAt = sess.at || Date.now();
    S.chapStats[key] = rec;
    _save(LS.CHAPSTATS, S.chapStats);
  },
  entries(){
    return Object.entries(S.chapStats)
      .map(([chapter, d]) => ({
        chapter, attempted: d.attempted, correct: d.correct,
        accuracy: d.attempted ? Math.round((d.correct/d.attempted)*100) : 0,
        sessions: d.sessions, lastAt: d.lastAt
      }))
      .sort((a,b)=>b.lastAt-a.lastAt);
  },
  rebuildFromSessions(){
    const rebuilt = {};
    (S.prog.sessions||[]).forEach(s=>{
      const key = s.chapter || 'Unknown';
      const rec = rebuilt[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
      rec.attempted += s.total || 0;
      rec.correct += s.correct || 0;
      rec.sessions += 1;
      if((s.at||0) > rec.lastAt) rec.lastAt = s.at||0;
      rebuilt[key] = rec;
    });
    Object.entries(rebuilt).forEach(([key, rec])=>{
      if(!S.chapStats[key]) S.chapStats[key] = rec;
    });
    _save(LS.CHAPSTATS, S.chapStats);
  }
};

const COV = {
  _ok(){
    if(!S.cov || typeof S.cov !== 'object' || Array.isArray(S.cov)) S.cov = {};
    return true;
  },
  /* Coverage is recorded TWICE, and the two copies have different jobs:
       m  { <primary id>: '1'|'2' }  the truth for every question that has an id
          (non-public id, else public number), so it survives a re-export;
       p  a string with one character per POSITION in the file (0 unseen, 1 right,
          2 wrong): the fast form the sprint, insights and chapter screens read.
     p is a cache of m for the file's CURRENT order. alignSet() rebuilds it
     whenever a file's order changes, so no screen ever reads bits that belong to
     another question. Questions with no id only have p (position is all there is). */
  _idKey(q){
    if(typeof QKEY === 'undefined') return '';
    const k = QKEY.of(q);
    return k && k.charAt(0) === 'q' ? k.slice(2) : '';
  },
  _sig(questions){
    let h = 5381, n = 0;
    for(const q of questions){
      const k = COV._idKey(q) || '-';
      for(let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
      h = ((h << 5) + h + 124) | 0; n++;
    }
    return n + ':' + h;
  },
  /* Called once per parsed set (normQ). Cheap when nothing changed. */
  alignSet(questions){
    try {
      if(!Array.isArray(questions) || !questions.length || !COV._ok() || typeof QKEY === 'undefined') return;
      const fid = questions[0] && questions[0].fileId;
      const rec = fid && S.cov[fid];
      if(!rec || !COV._idKey(questions[0]) && !questions.some(q => COV._idKey(q))) return;
      const sig = COV._sig(questions);
      if(rec.sig === sig) return;
      let changed = false;
      const pstr = String(rec.p || '');
      rec.m = (rec.m && typeof rec.m === 'object') ? rec.m : {};
      let trustBits = false;
      if(rec.sig === undefined){
        /* First time this file is seen with ids. The old position bits can be
           trusted only if the file is still in the order they were recorded
           against. Anything already recorded BY ID is a witness: if each such
           question still sits at a position whose bit agrees, the order is
           unchanged; one disagreement means it moved, and the bits are dropped
           in favour of the ids. */
        const pos = new Map();
        questions.forEach((q, i) => { const k = COV._idKey(q); if(k) pos.set(k, i); });
        trustBits = Object.keys(rec.m).every(k => !pos.has(k) || pstr[pos.get(k)] === rec.m[k]);
      }
      if(trustBits || (rec.sig === undefined && !Object.keys(rec.m).length)){
        questions.forEach((q, i) => { const k = COV._idKey(q); const b = pstr[i]; if(k && b && b !== '0' && !rec.m[k]) rec.m[k] = b; });
      } else {
        /* The order changed (re-export, questions added or removed), or a merge
           added ids from another device: rebuild p from the ids for the current order. */
        rec.p = questions.map((q, i) => { const k = COV._idKey(q); return k ? (rec.m[k] || '0') : (pstr[i] || '0'); }).join('');
      }
      rec.sig = sig; changed = true;
      if(changed) _save(LS.COV, S.cov);
    } catch (e) { window.warnCaught && window.warnCaught('js/features/chapter-stats.js', e); }
  },
  _add(q){
    if(!q || !q.uid) return;
    const uid = String(q.uid);
    const i = uid.lastIndexOf('_');
    if(i < 1) return;
    const fid = uid.slice(0, i);
    if(fid === 'local') return;
    const idx = parseInt(uid.slice(i + 1), 10);
    if(!isFinite(idx) || idx < 0 || idx > 20000) return;
    const rec = S.cov[fid] || (S.cov[fid] = {p:'', a:0, c:0});
    rec.t = Date.now();      /* v1.33: lets a reset on another device tell old coverage from new */
    if(rec.p.length <= idx) rec.p = rec.p.padEnd(idx + 1, '0');
    rec.p = rec.p.slice(0, idx) + (q.ok ? '1' : '2') + rec.p.slice(idx + 1);
    const ik = COV._idKey(q);
    if(ik){ (rec.m || (rec.m = {}))[ik] = q.ok ? '1' : '2'; }
    rec.a = (rec.a || 0) + 1;
    if(q.ok) rec.c = (rec.c || 0) + 1;
  },
  record(qres){
    if(!Array.isArray(qres) || !COV._ok()) return;
    qres.forEach(q => COV._add(q));
    _save(LS.COV, S.cov);
  },
  rebuildFromSessions(){
    if(!COV._ok()) return;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for(let i = sessions.length - 1; i >= 0; i--){
      (sessions[i].qres || []).forEach(q => COV._add(q));
    }
    _save(LS.COV, S.cov);
  },
  merge(remote){
    if(!remote || typeof remote !== 'object' || !COV._ok()) return;
    Object.keys(remote).forEach(fid => {
      const r = remote[fid];
      if(!r || typeof r !== 'object') return;
      const rp = String(r.p || '');
      const l = S.cov[fid];
      const rm = (r.m && typeof r.m === 'object') ? r.m : null;
      if(!l){ S.cov[fid] = {p: rp, a: Number(r.a) || 0, c: Number(r.c) || 0, t: Number(r.t) || 0}; if(rm) S.cov[fid].m = Object.assign({}, rm); return; }
      if(rm){
        /* Ids are the truth: union them (a wrong answer '2' is kept over nothing,
           a later right answer on THIS device is kept), then force a realign so p
           is rebuilt for the current order of the file. */
        l.m = l.m || {};
        Object.keys(rm).forEach(k => { if(!l.m[k]) l.m[k] = rm[k]; });
        l.sig = '';
      }
      let out = '';
      const n = Math.max(rp.length, l.p.length);
      for(let i = 0; i < n; i++){
        const a = l.p[i] || '0', b = rp[i] || '0';
        out += (a !== '0') ? a : b;
      }
      l.p = out;
      l.a = Math.max(l.a || 0, Number(r.a) || 0);
      l.c = Math.max(l.c || 0, Number(r.c) || 0);
    });
    _save(LS.COV, S.cov);
  }
};

window.CHAPSTATS = CHAPSTATS;
window.COV       = COV;