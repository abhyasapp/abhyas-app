// js/core/qkey.js — ONE definition of "which question is this?".
//
// A question has two identities:
//   qid  permanent id published by the content pipeline (public_qn). It never
//        changes, whatever order the set is exported in.
//   uid  `<fileId>_<position>`. It changes whenever a set is re-exported, so it
//        can only ever be a fallback for content that publishes no qid.
//
// Everything a student saves (bookmarks, wrong bank, notes, stats) must follow
// the qid. Matching on uid alone is the bug this file exists to remove: after a
// re-export the same uid points at a DIFFERENT question, and the old match
// quietly attached a note, a bookmark or a miss to the wrong one.
//
// Rules, in order:
//   1. Both sides have a qid  -> same question iff the qids are equal. The uid is
//      ignored, so a moved question still matches and a reused position never does.
//   2. Otherwise both have a uid -> same iff the uids are equal AND, when both
//      sides still carry the question text, the text agrees (a legacy record
//      whose position now holds another question is rejected).
//   3. A bare string is accepted as a key ('q:<qid>' / 'u:<uid>') or as a legacy
//      id that may be either.
//
// MUST load AFTER: core/state.js (S) and BEFORE core/question.js (normQ calls
// QKEY.adoptSet), features/review.js, features/quiz-extras.js.

(function () {
  'use strict';

  const hasId = v => v !== undefined && v !== null && String(v) !== '';
  const stemOf = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const optsOf = q => Array.isArray(q && q.options) ? q.options.map(o => stemOf(o)).join('|') : '';

  /* Normalise anything a caller might hold into { qid, uid, any, q, options }. */
  function ref(x) {
    if (x && typeof x === 'object') {
      return { qid: hasId(x.qid) ? String(x.qid) : '', uid: hasId(x.uid) ? String(x.uid) : '', any: '', q: stemOf(x.q), options: optsOf(x) };
    }
    const s = hasId(x) ? String(x) : '';
    if (s.indexOf('q:') === 0) return { qid: s.slice(2), uid: '', any: '', q: '', options: '' };
    if (s.indexOf('u:') === 0) return { qid: '', uid: s.slice(2), any: '', q: '', options: '' };
    return { qid: '', uid: '', any: s, q: '', options: '' };
  }

  function sameText(a, b) {
    if (!a.q || !b.q) return true;                 // nothing to compare, trust the uid
    return a.q === b.q || (!!a.options && a.options === b.options);
  }

  function same(a, b) {
    const x = ref(a), y = ref(b);
    if (x.any || y.any) {
      const s = x.any || y.any, o = x.any ? y : x;
      return !!s && (o.qid === s || o.uid === s || (!!x.any && !!y.any && x.any === y.any));
    }
    if (x.qid && y.qid) return x.qid === y.qid;
    if (x.uid && y.uid) return x.uid === y.uid && sameText(x, y);
    return false;
  }

  /* 'q:<qid>' when the question has a permanent id, else 'u:<uid>'. */
  function of(x) {
    const r = ref(x);
    if (r.qid) return 'q:' + r.qid;
    if (r.uid) return 'u:' + r.uid;
    return r.any ? r.any : '';
  }

  function indexOf(list, x) {
    if (!Array.isArray(list)) return -1;
    for (let i = 0; i < list.length; i++) if (list[i] && same(list[i], x)) return i;
    return -1;
  }
  const find = (list, x) => { const i = indexOf(list, x); return i < 0 ? null : list[i]; };
  const has = (list, x) => indexOf(list, x) > -1;

  /* Key used in id-keyed maps (notes, stats). New data always lands under the
     permanent id; the legacy uid is returned too so reads can still find old data. */
  function mapKeys(x) {
    const r = ref(x);
    if (r.qid) return { primary: 'q:' + r.qid, legacy: r.uid || '' };
    if (r.uid) return { primary: r.uid, legacy: '' };
    return { primary: r.any, legacy: '' };
  }

  /* A stored record learns its permanent id the first time the question is seen
     again with one. Only done when the text agrees, so a record can never adopt
     the identity of whatever now sits at its old position. */
  function adopt(item, q) {
    if (!item || !q || !hasId(q.qid)) return false;
    if (hasId(item.qid)) return false;
    const a = ref(item), b = ref(q);
    if (!a.q || !b.q || !(a.q === b.q || (!!a.options && a.options === b.options))) return false;
    item.qid = q.qid;
    if (hasId(q.uid)) item.uid = q.uid;
    return true;
  }

  /* Called once per freshly parsed set (normQ). Upgrades legacy bookmark / flag /
     wrong-bank records (and the notes saved under their old uid) to the permanent
     id. Cheap: it only does work when a stored record still lacks a qid. */
  function adoptSet(questions) {
    try {
      if (typeof S === 'undefined' || !Array.isArray(questions) || !questions.length) return 0;
      const lists = [S.bk, S.fl, S.wr].filter(Array.isArray);
      const legacy = [];
      lists.forEach(l => l.forEach(it => { if (it && !hasId(it.qid) && it.q) legacy.push(it); }));
      if (!legacy.length) return 0;
      const byStem = new Map();
      questions.forEach(q => { if (q && hasId(q.qid) && q.q) byStem.set(stemOf(q.q), q); });
      let n = 0;
      const dirty = new Set();
      legacy.forEach(it => {
        const q = byStem.get(stemOf(it.q));
        if (!q) return;
        const oldUid = it.uid;
        if (adopt(it, q)) {
          n++;
          lists.forEach(l => { if (l.indexOf(it) > -1) dirty.add(l); });
          try { if (typeof QNOTE !== 'undefined' && QNOTE.rekey && oldUid) QNOTE.rekey(oldUid, 'q:' + q.qid); } catch (e) { window.warnCaught && window.warnCaught('js/core/qkey.js', e); }
        }
      });
      if (n && typeof _save === 'function' && typeof LS !== 'undefined') {
        if (dirty.has(S.bk)) _save(LS.BK, S.bk);
        if (dirty.has(S.fl)) _save(LS.FL, S.fl);
        if (dirty.has(S.wr)) _save(LS.WR, S.wr);
      }
      return n;
    } catch (e) { window.warnCaught && window.warnCaught('js/core/qkey.js', e); return 0; }
  }

  window.QKEY = { ref, same, of, indexOf, find, has, mapKeys, adopt, adoptSet, stemOf };
})();
