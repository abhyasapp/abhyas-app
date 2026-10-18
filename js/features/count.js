// js/features/count.js — ask how many questions are inside each file, once.

const CNT_AUTO_LIMIT = 20;

const CNT = {
  _lastError: null,
  async forFile(ref) {
    if (!ref.fid) return null;
    if (S.fcount[ref.fid] != null) return S.fcount[ref.fid];
    try {
      const raw = await QUIZ._fetch(ref.fid, ref.key);
      const n = normQ(raw, ref.fid).length;
      S.fcount[ref.fid] = n;
      _save(LS.FCOUNT, S.fcount);
      return n;
    } catch (e) { CNT._lastError = e && e.message; return null; }
  },
  knownTotal(leaves) {
    let sum = 0, unknown = 0;
    leaves.forEach(ref => {
      const n = S.fcount[ref.fid];
      if (n == null) unknown++; else sum += n;
    });
    return { total: sum, files: leaves.length, unknown };
  },
  async totalFor(lv, ch, book, sub, { force = false, onTick } = {}) {
    const leaves = scopeLeaves(lv, ch, book, sub);
    const known = CNT.knownTotal(leaves);
    if (known.unknown === 0) return known;
    if (!force && leaves.length > CNT_AUTO_LIMIT) return { ...known, needsConfirm: true };
    let sum = 0, unknown = 0, done = 0;
    const CONC = 4; let i = 0;
    async function worker() {
      while (i < leaves.length) {
        const ref = leaves[i++];
        const n = await CNT.forFile(ref);
        if (n == null) unknown++; else sum += n;
        done++;
        onTick && onTick(done, leaves.length);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONC, leaves.length)) }, worker));
    return { total: sum, files: leaves.length, unknown };
  }
};