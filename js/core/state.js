// js/core/state.js — the single in-memory state object, hydrated from
// localStorage on first load.

const S = {
  user: null,
  online: navigator.onLine,
  forcedOffline: _load(LS.FORCED_OFFLINE, false),
  bk: _load(LS.BK, []),
  fl: _load(LS.FL, []),
  wr: _load(LS.WR, []),
  prog: _load(LS.PROG, { total: 0, correct: 0, sessions: [] }),
  tt: _load(LS.TT, { sessions: [], reminders: { enabled: false, leadMinutes: 5 } }),
  stk: _load(LS.STK, { days: [], last: '' }),
  fcount: _load(LS.FCOUNT, {}),
  chapStats: _load(LS.CHAPSTATS, {}),
  weeklyAttempts: _load(LS.WK_ATTEMPTS, {}),
  cov: _load(LS.COV, {}),
  dpi: null,
  localQs: null,
  quiz: { qs: [], ans: [], mode: '', idx: 0, timer: null, elapsed: 0, left: 0, active: false, ch: '', scope: null },
  cloud: _load(LS.CLOUD, { fid: '' }),
  profile: _load(LS.PROFILE, { ver: 1, id: '' })
};

/* Post-load repairs for older saved shapes. */
if (!S.tt.reminders) S.tt.reminders = { enabled: false, leadMinutes: 5 };
if (!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
if (!S.stk.days) S.stk.days = [];
if (!S.weeklyAttempts || typeof S.weeklyAttempts !== 'object') S.weeklyAttempts = {};