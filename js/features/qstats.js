// js/features/qstats.js — a small rolling memory of how you do on each
// question. Session selection uses it to aim at the 50–80% success band instead
// of showing questions at random.
// MUST load AFTER: core/format.js (shuf). localStorage only; no network.

const QSTATS = {
  KEY: 'abhyas_qstats_v1',
  MAX: 8000,
  _cache: null,

  _load(){
    if(this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(this.KEY);
      const o = raw ? JSON.parse(raw) : {};
      this._cache = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { this._cache = {}; }
    return this._cache;
  },

  _save(d){
    try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { window.warnCaught && window.warnCaught('js/features/qstats.js', e); }
  },

  _trim(d){
    const keys = Object.keys(d);
    if(keys.length <= this.MAX) return;
    keys.sort((a, b) => (d[a].t || 0) - (d[b].t || 0));
    keys.slice(0, keys.length - this.MAX).forEach(k => { delete d[k]; });
  },

  /* Keyed by the permanent id ('q:<qid>'); a question with no qid keeps its uid.
     Counts recorded under the old positional uid are folded into the permanent
     id the first time that question is seen with one. */
  _keys(who){
    return (typeof QKEY !== 'undefined') ? QKEY.mapKeys(who) : { primary: String((who && who.uid) || who || ''), legacy: '' };
  },
  _slot(d, who, create){
    const k = this._keys(who);
    if(!k.primary) return null;
    let r = d[k.primary];
    if(k.legacy && d[k.legacy]){
      const o = d[k.legacy];
      if(!r){ r = d[k.primary] = { a: o.a || 0, c: o.c || 0, t: o.t || 0 }; }
      else { r.a = (r.a || 0) + (o.a || 0); r.c = (r.c || 0) + (o.c || 0); r.t = Math.max(r.t || 0, o.t || 0); }
      delete d[k.legacy];
    }
    if(!r && create) r = d[k.primary] = { a: 0, c: 0, t: 0 };
    return r || null;
  },

  get(who){
    if(!who) return null;
    const r = this._slot(this._load(), who, false);
    if(!r || !r.a) return null;
    return { attempts: r.a, correct: r.c, p: r.c / r.a, at: r.t || 0 };
  },

  record(who, ok){
    if(!who) return;
    const d = this._load();
    const r = this._slot(d, who, true);
    if(!r) return;
    r.a++;
    if(ok) r.c++;
    r.t = Date.now();
    this._trim(d);
    this._save(d);
  },

  recordSession(qres){
    if(!Array.isArray(qres) || !qres.length) return;
    const d = this._load(), now = Date.now();
    qres.forEach(q => {
      if(!q || (!q.uid && !q.qid)) return;
      const r = this._slot(d, q, true);
      if(!r) return;
      r.a++;
      if(q.ok) r.c++;
      r.t = now;
    });
    this._trim(d);
    this._save(d);
  },

  difficulty(who){
    const s = this.get(who);
    if(!s || s.attempts < 3) return 'unknown';
    if(s.p <= 0.45) return 'hard';
    if(s.p >= 0.8) return 'easy';
    return 'medium';
  },

  _target(phase){ return phase === 'learn' ? 0.6 : phase === 'drill' ? 0.5 : 0.7; },

  /* Near the target first, then unseen questions (shuffled), then the ones far
     from the target so nothing is permanently hidden. */
  order(qs, phase){
    if(!Array.isArray(qs) || qs.length < 2) return qs;
    const target = this._target(phase);
    const near = [], unknown = [], far = [];
    qs.forEach(q => {
      const s = (q && (q.uid || q.qid)) ? this.get(q) : null;
      if(!s || s.attempts < 3){ unknown.push(q); return; }
      (Math.abs(s.p - target) <= 0.2 ? near : far).push(q);
    });
    return near.concat(shuf(unknown), shuf(far));
  },

  clear(){
    try { localStorage.removeItem(this.KEY); } catch (e) { window.warnCaught && window.warnCaught('js/features/qstats.js', e); }
    this._cache = null;
  }
};

window.QSTATS = QSTATS;
