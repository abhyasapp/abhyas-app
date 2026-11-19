// js/core/qkey.js — ONE definition of "which question is this?".
//
// A question can carry up to three identities, strongest first:
//   1. nid  the NON-PUBLIC id: the internal numeric id (digits only, e.g. 48213).
//   2. pqn  the PUBLIC question number: the readable id the pipeline publishes
//           as `public_qn` (e.g. "50011.110001", "G0011.110001").
//   3. uid  `<fileId>_<position>`. It changes whenever a set is re-exported, so
//           it is the LAST resort, used only for content that publishes neither
//           id, and then only while the question text still agrees.
//
// Priority everywhere (solving, progress, saved, wrong bank, notes, stats, sync,
// backup, reports, corrections): nid -> pqn -> uid.
//
// `qid` is kept on every record as the PRIMARY id (nid when there is one, else
// pqn), because older code and the backend read it. Records saved before this
// priority existed hold only a `qid`; its SHAPE says what it was: digits only is
// a non-public id, anything else is a public number. `ids()` normalises both.
//
// Rules (same()):
//   a. both sides have a nid       -> same iff the nids are equal (decisive).
//   b. else both have a pqn        -> same iff the pqns are equal (decisive).
//   c. else both have a uid        -> same iff uids are equal AND, when both
//                                     still carry the text, the text agrees.
//   d. a bare string may be a key ('q:<id>' / 'u:<uid>') or a legacy id.
//
// Load AFTER core/state.js; BEFORE core/question.js and every consumer.

(function () {
  'use strict';

  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const DIGITS = /^\d+$/;
  const stemOf = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const optsOf = q => Array.isArray(q && q.options) ? q.options.map(o => stemOf(o)).join('|') : '';

  /* Classify one raw id by its shape. */
  function kindOf(v) {
    if (!has(v)) return '';
    const s = String(v).trim();
    return DIGITS.test(s) ? 'nid' : 'pqn';
  }

  /* Everything we know about a question's identity, normalised. Accepts a
     question, a stored record (new or legacy), a report, or a key string. */
  function ids(x) {
    const r = { nid: '', pqn: '', uid: '', any: '', q: '', options: '' };
    if (x && typeof x === 'object') {
      if (has(x.nid)) r.nid = String(x.nid).trim();
      if (has(x.pqn)) r.pqn = String(x.pqn).trim();
      if (has(x.public_qn) && !r.pqn) r.pqn = String(x.public_qn).trim();
      if (has(x.qid)) {                       // legacy / primary: its shape says what it is
        const k = kindOf(x.qid), s = String(x.qid).trim();
        if (k === 'nid' && !r.nid) r.nid = s;
        if (k === 'pqn' && !r.pqn) r.pqn = s;
      }
      if (has(x.uid)) r.uid = String(x.uid).trim();
      r.q = stemOf(x.q); r.options = optsOf(x);
      return r;
    }
    const s = has(x) ? String(x).trim() : '';
    if (s.indexOf('q:') === 0) { const v = s.slice(2); if (kindOf(v) === 'nid') r.nid = v; else if (v) r.pqn = v; }
    else if (s.indexOf('u:') === 0) r.uid = s.slice(2);
    else r.any = s;
    return r;
  }

  const primary = x => { const r = ids(x); return r.nid || r.pqn || ''; };

  function sameText(a, b) {
    if (!a.q || !b.q) return true;
    return a.q === b.q || (!!a.options && a.options === b.options);
  }

  function same(a, b) {
    const x = ids(a), y = ids(b);
    if (x.any || y.any) {
      const s = x.any || y.any, o = x.any ? y : x;
      return !!s && (o.nid === s || o.pqn === s || o.uid === s || (!!x.any && !!y.any && x.any === y.any));
    }
    if (x.nid && y.nid) return x.nid === y.nid;
    if (x.pqn && y.pqn) return x.pqn === y.pqn;
    if (x.uid && y.uid) return x.uid === y.uid && sameText(x, y);
    return false;
  }

  /* 'q:<primary id>' when the question has a permanent id, else 'u:<uid>'. */
  function of(x) {
    const r = ids(x);
    if (r.nid) return 'q:' + r.nid;
    if (r.pqn) return 'q:' + r.pqn;
    if (r.uid) return 'u:' + r.uid;
    return r.any || '';
  }

  const indexOf = (list, x) => {
    if (!Array.isArray(list)) return -1;
    for (let i = 0; i < list.length; i++) if (list[i] && same(list[i], x)) return i;
    return -1;
  };
  const find = (list, x) => { const i = indexOf(list, x); return i < 0 ? null : list[i]; };
  const has_ = (list, x) => indexOf(list, x) > -1;

  /* Keys in id-keyed maps (notes, stats). New data goes under `primary`; `legacy`
     lists every older key the same question may have been saved under: the old
     public-first key, the other id, and the positional uid. */
  function mapKeys(x) {
    const r = ids(x);
    const prim = r.nid ? 'q:' + r.nid : r.pqn ? 'q:' + r.pqn : (r.uid || r.any);
    const legacy = [];
    const add = k => { if (k && k !== prim && legacy.indexOf(k) === -1) legacy.push(k); };
    if (r.nid || r.pqn) { add(r.nid && 'q:' + r.nid); add(r.pqn && 'q:' + r.pqn); add(r.uid); }
    return { primary: prim, legacy };
  }

  /* Bring a stored record up to the current identity. It learns every id the
     question carries. A record that already matches by id is upgraded outright;
     a record with NO id at all is adopted only when the text agrees, so it can
     never take the identity of whatever now sits at its old position. */
  function adopt(item, q) {
    if (!item || !q) return false;
    const a = ids(item), b = ids(q);
    if (!b.nid && !b.pqn) return false;
    const ok = (a.nid || a.pqn)
      ? same(item, q)
      : (!!a.q && !!b.q && (a.q === b.q || (!!a.options && a.options === b.options)));
    if (!ok) return false;
    let changed = false;
    if (b.nid && String(item.nid || '') !== b.nid) { item.nid = q.nid !== undefined ? q.nid : b.nid; changed = true; }
    if (b.pqn && String(item.pqn || '') !== b.pqn) { item.pqn = b.pqn; changed = true; }
    const prim = b.nid || b.pqn;
    if (prim && String(item.qid === undefined ? '' : item.qid) !== prim) { item.qid = (q.qid !== undefined ? q.qid : prim); changed = true; }
    if (has(q.uid) && item.uid !== q.uid) { item.uid = q.uid; changed = true; }
    return changed;
  }

  /* Called once per freshly parsed set (normQ). Upgrades stored bookmarks, flags
     and wrong-bank rows (and the notes saved under their old keys) to the current
     ids: by id when the row has one, by TEXT when it has none. Cheap: it returns
     at once when nothing stored needs upgrading. */
  function adoptSet(questions) {
    try {
      if (typeof S === 'undefined' || !Array.isArray(questions) || !questions.length) return 0;
      const lists = [S.bk, S.fl, S.wr].filter(Array.isArray);
      const byNid = new Map(), byPqn = new Map(), byStem = new Map();
      let built = false;
      const build = () => {
        built = true;
        questions.forEach(q => {
          if (!q) return;
          const r = ids(q);
          if (r.nid) byNid.set(r.nid, q);
          if (r.pqn) byPqn.set(r.pqn, q);
          if ((r.nid || r.pqn) && r.q) byStem.set(r.q, q);
        });
      };
      let n = 0;
      const dirty = new Set();
      lists.forEach(l => l.forEach(it => {
        if (!it) return;
        const a = ids(it);
        /* Already fully upgraded (has the primary id AND both ids it could have)? skip cheaply. */
        if (a.nid && a.pqn && has(it.qid)) return;
        if (!built) build();
        let q = null;
        if (a.nid) q = byNid.get(a.nid) || null;
        if (!q && a.pqn) q = byPqn.get(a.pqn) || null;
        if (!q && !a.nid && !a.pqn && a.q) q = byStem.get(a.q) || null;
        if (!q) return;
        const before = mapKeys(it);
        if (adopt(it, q)) {
          n++; dirty.add(l);
          try {
            if (typeof QNOTE !== 'undefined' && QNOTE.rekey) {
              const to = mapKeys(it).primary;
              before.legacy.concat([before.primary]).forEach(k => { if (k && k !== to) QNOTE.rekey(k, to); });
            }
          } catch (e) { window.warnCaught && window.warnCaught('js/core/qkey.js', e); }
        }
      }));
      if (n && typeof _save === 'function' && typeof LS !== 'undefined') {
        if (dirty.has(S.bk)) _save(LS.BK, S.bk);
        if (dirty.has(S.fl)) _save(LS.FL, S.fl);
        if (dirty.has(S.wr)) _save(LS.WR, S.wr);
      }
      return n;
    } catch (e) { window.warnCaught && window.warnCaught('js/core/qkey.js', e); return 0; }
  }

  /* Merge two lists of question records (devices, backups, imports) without
     duplicates. Rows are the same question per same(). The FIRST row is kept (it
     carries this device's progress on the question) and learns any id the other
     copy knows. Hash lookups keep this linear, so a large wrong bank is cheap. */
  function mergeLists(a, b) {
    const out = [], seenJson = new Set();
    const byNid = new Map(), byPqn = new Map(), byUid = new Map();
    const reg = (row, idx) => {
      const r = ids(row);
      if (r.nid) byNid.set(r.nid, idx);
      if (r.pqn) byPqn.set(r.pqn, idx);
      if (r.uid) { const l = byUid.get(r.uid) || []; if (l.indexOf(idx) < 0) l.push(idx); byUid.set(r.uid, l); }
    };
    const locate = (row, r) => {
      if (r.nid && byNid.has(r.nid)) return byNid.get(r.nid);
      if (!r.nid && r.pqn && byPqn.has(r.pqn)) return byPqn.get(r.pqn);
      if (r.nid && r.pqn && byPqn.has(r.pqn)) { const i = byPqn.get(r.pqn); if (same(out[i], row)) return i; }
      if (r.uid && byUid.has(r.uid)) {
        const l = byUid.get(r.uid);
        for (let k = 0; k < l.length; k++) if (same(out[l[k]], row)) return l[k];
      }
      return -1;
    };
    const put = row => {
      if (!row) return;
      const r = ids(row);
      if (!r.nid && !r.pqn && !r.uid) {           // no identity at all: de-duplicate by content
        const j = JSON.stringify(row);
        if (!seenJson.has(j)) { seenJson.add(j); out.push(row); }
        return;
      }
      const i = locate(row, r);
      if (i < 0) { out.push(row); reg(row, out.length - 1); return; }
      const cur = out[i], c = ids(cur);
      /* Compare the stored FIELDS: a legacy row's qid already implies an id, but
         the explicit nid / pqn fields are what newer code and the server read. */
      if (!has(cur.nid) && r.nid) cur.nid = row.nid !== undefined ? row.nid : r.nid;
      if (!has(cur.pqn) && r.pqn) cur.pqn = r.pqn;
      const prim = ids(cur); const p = prim.nid || prim.pqn;
      if (p && String(cur.qid === undefined ? '' : cur.qid) !== p) cur.qid = prim.nid ? (cur.nid !== undefined ? cur.nid : prim.nid) : p;
      reg(cur, i);
    };
    (Array.isArray(a) ? a : []).forEach(put);
    (Array.isArray(b) ? b : []).forEach(put);
    return out;
  }

  /* Groups per-answer history rows into questions. Used by miss counts and by
     "seen N times". add(row) files a row under its question and returns that
     question's canonical key; find(question | id) returns the key to read back.
     Rows carrying an id are joined by nid, then pqn; a row with NEITHER (history
     from before ids existed) is joined by position. A position never steals an
     id'd question, so a reused position cannot merge two different questions. */
  function makeIndex() {
    const alias = Object.create(null), idless = Object.create(null);
    return {
      add(row) {
        const k = ids(row);
        const an = k.nid ? 'n:' + k.nid : '', ap = k.pqn ? 'p:' + k.pqn : '', au = k.uid ? 'u:' + k.uid : '';
        if (!an && !ap && !au) return '';
        const canon = (an && alias[an]) || (ap && alias[ap]) || ((!an && !ap) ? alias[au] : '') || (an || ap || au);
        if (an) alias[an] = canon;
        if (ap) alias[ap] = canon;
        if (au && !alias[au]) alias[au] = canon;
        if (!an && !ap) idless[canon] = true;
        return canon;
      },
      find(who) {
        if (!who) return '';
        if (typeof who !== 'object') {
          const s = String(who);
          return alias['n:' + s] || alias['p:' + s] || alias['u:' + s] || '';
        }
        const k = ids(who);
        if (k.nid && alias['n:' + k.nid]) return alias['n:' + k.nid];
        if (k.pqn && alias['p:' + k.pqn]) return alias['p:' + k.pqn];
        if (k.uid) {
          const c = alias['u:' + k.uid];
          if (!k.nid && !k.pqn) return c || '';
          return (c && idless[c]) ? c : '';       // older history, still counted
        }
        return '';
      }
    };
  }

  window.QKEY = { ids, kindOf, primary, same, of, indexOf, find, has: has_, mapKeys, adopt, adoptSet, mergeLists, makeIndex, stemOf };
})();
