/* ══════════════════════════════════════════════════════════════════════
   js/data/chapters-loader.js — v1.46.1

   The app cannot run without ChapterData, and ChapterData comes from the
   content repo's chapters-data.js. So this file treats that one file as the
   single point of failure it is:

     • several MIRRORS of the same file are tried in turn (jsDelivr, its
       fastly / gcore hosts, raw GitHub), derived from CONTENT_CDN_BASE so a
       pin to a tag or commit applies to all of them;
     • a response is only trusted after it LOOKS like the chapters file, and
       only kept as \"good\" after it RUNS and defines the expected API;
     • the last good copy is kept apart from the newest download, so a bad
       commit to the content repo can never leave a learner without chapters;
     • the source runs from a blob: URL, not an inline <script>, so the page
       CSP needs no 'unsafe-inline' (script-src has 'self' and blob:);
     • every failure is reported (abhyas:boot-failure) for crash-report.js.

   Load order (user.html + admin.html):
     chapters-loader.js → subjective_chapters.js → subjective-data.js
     → content-index.js → ... shims ... → app.js

   MUST load before any shim that triggers ChapterData at boot.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* One source of truth: ABHYAS_CONFIG.CONTENT_CDN_BASE (js/core/config.js). To pin content to a
   commit or tag instead of the moving `main` branch, change it there and nowhere else. */
var CDN_BASE   = (window.ABHYAS_CONFIG && window.ABHYAS_CONFIG.CONTENT_CDN_BASE)
               || 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main';
var CACHE_KEY  = 'abhyas_chapters_cache_v2';   /* newest download (a candidate)   */
var GOOD_KEY   = 'abhyas_chapters_good_v1';    /* last copy that really ran OK     */
var BAD_KEY    = 'abhyas_chapters_bad_v1';     /* fingerprint of a copy that failed */
var TTL_MS     = 24 * 60 * 60 * 1000;
var MAX_FAILS  = 3;

/* ── mirrors ───────────────────────────────────────────────────────── */
function mirrorsOf(base) {
  var list = [base];
  var m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/@]+\/[^/@]+)@(.+)$/.exec(base);
  if (m) {
    list.push('https://fastly.jsdelivr.net/gh/' + m[1] + '@' + m[2]);
    list.push('https://gcore.jsdelivr.net/gh/' + m[1] + '@' + m[2]);
    list.push('https://raw.githubusercontent.com/' + m[1] + '/' + m[2]);
  }
  var extra = window.ABHYAS_CONFIG && window.ABHYAS_CONFIG.CONTENT_CDN_FALLBACKS;
  if (extra && extra.length) list = list.concat(extra);
  return list.filter(function (u, i) { return u && list.indexOf(u) === i; });
}
var MIRRORS = mirrorsOf(CDN_BASE);

/* A cache-buster is only for the very first download. Every later check is a
   CONDITIONAL request (If-None-Match): when nothing changed the server answers
   304 and almost no data is used, which is what lets the app check on every open
   even on mobile data. */
function urlFor(base, bust) {
  var u = base + '/chapters-data.js';
  return bust ? u + (u.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now() : u;
}
/* For freshness checks, raw GitHub first: jsDelivr caches a branch URL at its
   edge for hours, raw GitHub for about five minutes. The CDN mirrors still back it up. */
function freshOrder(list) {
  return list.slice().sort(function (a, b) {
    var ra = /raw\.githubusercontent\.com/.test(a) ? 0 : 1, rb = /raw\.githubusercontent\.com/.test(b) ? 0 : 1;
    return ra - rb;
  });
}

/* ── storage ───────────────────────────────────────────────────────── */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { window.warnCaught && window.warnCaught('js/data/chapters-loader.js', e); } }

function readSlot(key) {
  try {
    var raw = lsGet(key);
    if (!raw) return null;
    var o = JSON.parse(raw);
    if (!o || typeof o.source !== 'string' || !o.source.length) return null;
    return o;
  } catch (e) { return null; }
}
function writeSlot(key, source, extra) {
  var o = { source: source, savedAt: Date.now(), fails: 0 };
  if (extra) for (var k in extra) o[k] = extra[k];
  return lsSet(key, JSON.stringify(o));
}
function fingerprint(src) {
  var h = 5381;
  for (var i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return src.length + ':' + h;
}

/* The app must not start before ChapterData exists. js/app.js waits on this
   promise. It resolves when ChapterData is defined and never rejects: if the
   chapters cannot be loaded the retry screen stays up and the app waits. */
var _ready;
window.ChapterDataReady = new Promise(function (resolve) { _ready = resolve; });
window.__abhyasBootFailures = window.__abhyasBootFailures || [];

function reportFailure(kind, detail) {
  try {
    var rec = { kind: kind, detail: String(detail || '').slice(0, 160), at: Date.now() };
    window.__abhyasBootFailures.push(rec);
    window.dispatchEvent(new CustomEvent('abhyas:boot-failure', { detail: rec }));
  } catch (e) { window.warnCaught && window.warnCaught('js/data/chapters-loader.js', e); }
}

/* ── the contract ──────────────────────────────────────────────────── */
/* What the rest of the app relies on. A file that runs but lacks these is
   treated as a failure, exactly like one that does not run at all. */
function shapeOk() {
  var c = window.ChapterData;
  return !!c && typeof c.allFileRefs === 'function' && typeof c.chapterName === 'function'
    && typeof c.levels === 'function';
}
function looksLikeChapters(src) {
  return typeof src === 'string' && !/^\s*</.test(src) && src.indexOf('ChapterData') !== -1;
}

/* Run source WITHOUT an inline script: a blob: URL is allowed by `script-src
   'self' blob:`, an injected inline <script> is not. Falls back to the inline
   form only where blob URLs are unavailable (very old browsers, test DOMs). */
function runInline(source) {
  var s = document.createElement('script');
  s.textContent = source;
  (document.head || document.documentElement).appendChild(s);
}
function runSource(source) {
  return new Promise(function (resolve) {
    var url = null;
    try {
      if (window.URL && URL.createObjectURL && window.Blob) {
        url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      }
    } catch (e) { url = null; }
    if (!url) {
      try { runInline(source); } catch (e) { /* shapeOk() decides */ }
      resolve(); return;
    }
    var s = document.createElement('script');
    var done = function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* best effort */ }
      if (s.parentNode) s.parentNode.removeChild(s);
      resolve();
    };
    s.onload = done;
    s.onerror = function () {
      /* blob refused (older CSP) or unreadable: try the inline form once. */
      try { runInline(source); } catch (e) { /* shapeOk() decides */ }
      done();
    };
    s.src = url;
    (document.head || document.documentElement).appendChild(s);
  });
}

/* Run a source and report whether it produced a working ChapterData. */
function tryRun(source) {
  if (shapeOk()) return Promise.resolve(true);
  return runSource(source).then(function () { return shapeOk(); });
}

/* ── the loading / error screen ────────────────────────────────────── */
function removeScreen() {
  var el = document.getElementById('chapters-boot');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
function showScreen(msg, opts) {
  opts = opts || {};
  removeScreen();
  var el = document.createElement('div');
  el.id = 'chapters-boot';
  el.setAttribute('role', opts.retry ? 'alert' : 'status');
  el.style.cssText =
      'position:fixed;inset:0;background:var(--bg,#F2F4F3);color:var(--ink,#15201A);'
    + 'display:flex;align-items:center;justify-content:center;flex-direction:column;'
    + 'gap:1rem;z-index:2147483647;font-family:var(--font,system-ui,sans-serif);'
    + 'padding:2rem;text-align:center';
  if (!opts.retry) {
    var sp = document.createElement('div');
    sp.style.cssText = 'width:40px;height:40px;border:4px solid var(--sep,rgba(0,0,0,.12));'
      + 'border-top-color:var(--accent,#1E7A4C);border-radius:50%;animation:chbspin .8s linear infinite';
    el.appendChild(sp);
  }
  var m = document.createElement('div');
  m.style.cssText = 'font-size:.95rem;max-width:34ch;line-height:1.55';
  m.textContent = msg;
  el.appendChild(m);
  if (opts.hint) {
    var h = document.createElement('div');
    h.style.cssText = 'font-size:.8rem;max-width:38ch;line-height:1.5;opacity:.7';
    h.textContent = opts.hint;
    el.appendChild(h);
  }
  if (opts.retry) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Try again';
    b.style.cssText = 'padding:.65rem 1.4rem;min-height:44px;background:var(--accent,#1E7A4C);color:var(--on-accent,#fff);'
      + 'border:none;border-radius:10px;font-weight:700;font-size:.875rem;cursor:pointer;font-family:inherit';
    b.addEventListener('click', function () { coldLoad(); });
    el.appendChild(b);
  }
  var st = document.createElement('style');
  st.textContent = '@keyframes chbspin{to{transform:rotate(360deg)}}'
    + '@media (prefers-reduced-motion:reduce){#chapters-boot div{animation-duration:3s!important}}';
  el.appendChild(st);
  (document.body || document.documentElement).appendChild(el);
}
function failScreen(kind) {
  var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (kind === 'nodef') {
    showScreen('The chapters file loaded but is not in the format the app expects.',
      { retry: true, hint: 'This is a content problem, not your connection. Please tell your teacher or support.' });
  } else if (kind === 'exec') {
    showScreen('The chapters file could not be read.',
      { retry: true, hint: 'It may be damaged. Try again; if it keeps happening, tell your teacher or support.' });
  } else if (offline) {
    showScreen('You are offline, and this device has not downloaded your chapters yet.',
      { retry: true, hint: 'Connect to the internet once. Your chapters will download and then work offline.' });
  } else {
    showScreen('Could not load your chapters.',
      { retry: true, hint: 'Check your connection and try again. It will also retry on its own when you are back online.' });
  }
}

/* ── network: try every mirror, two rounds ─────────────────────────── */
function fetchOne(base, timeoutMs, revalidate) {
  var ctl = ('AbortController' in window) ? new AbortController() : null;
  var to  = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
  var opts = {};
  if (ctl) opts.signal = ctl.signal;
  if (revalidate) opts.cache = 'no-cache';           /* ask the server, but accept a 304 */
  return fetch(urlFor(base, !revalidate), opts)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (src) {
      if (to) clearTimeout(to);
      /* Never execute something that is not the chapters file. A captive-portal
         or error page answers 200 with HTML. */
      if (/^\s*</.test(src)) throw new Error('html');
      if (!looksLikeChapters(src)) throw new Error('bad-source');
      return src;
    })
    .catch(function (e) { if (to) clearTimeout(to); throw e; });
}
/* Returns the first source that looks right. Mirrors are tried one after the
   other (the primary gets the longest timeout); if all fail, one more round
   after a short pause, because the first request often hits a sleeping network. */
function fetchSource(opts) {
  opts = opts || {};
  var rounds = opts.rounds || 2;
  function round(n) {
    var chain = Promise.reject(new Error('start'));
    (opts.fresh ? freshOrder(MIRRORS) : MIRRORS).forEach(function (base, i) {
      chain = chain.catch(function (e) {
        if (e && e.message === 'bad-source') badSeen = true;
        return fetchOne(base, i === 0 ? 20000 : 12000, !!opts.fresh);
      });
    });
    return chain.catch(function (e) {
      if (n < rounds) return new Promise(function (r) { setTimeout(r, 1200); }).then(function () { return round(n + 1); });
      throw (badSeen && e && e.message === 'bad-source') ? e : (e || new Error('net'));
    });
  }
  var badSeen = false;
  return round(1);
}

/* ── boot ──────────────────────────────────────────────────────────── */
var _runningSrc = '';
function finishOk(source, via) {
  _runningSrc = source;
  /* It ran and defined the API: this copy is now the last known good one. */
  var cur = readSlot(GOOD_KEY);
  if (!cur || cur.source !== source) writeSlot(GOOD_KEY, source);
  var cand = readSlot(CACHE_KEY);
  if (!cand || cand.source !== source) writeSlot(CACHE_KEY, source);
  /* BAD_KEY is deliberately kept: it stops the same broken file being fetched
     and stored again. A repaired file has a different fingerprint, so it is
     accepted as soon as it appears. */
  removeScreen();
  _ready(true);
  startBackgroundRefresh();
  return via;
}

var _loading = false;
function coldLoad() {
  if (_loading || shapeOk()) return;
  _loading = true;
  showScreen('Loading your chapters\u2026');
  fetchSource({ rounds: 2 })
    .then(function (src) {
      return tryRun(src).then(function (ok) {
        if (ok) { finishOk(src, 'cold'); return; }
        reportFailure('bad_content', 'ran but did not define a usable ChapterData');
        failScreen('nodef');
      });
    })
    .catch(function (e) {
      var bad = e && e.message === 'bad-source';
      reportFailure(bad ? 'bad_content' : 'network', e && e.message);
      failScreen(bad ? 'nodef' : 'net');
    })
    .then(function () { _loading = false; });
}

/* A stored copy is trusted only if it runs and passes the contract. The newest
   download is tried first; if it is bad, the last good copy takes over and the
   bad one is remembered so it is not downloaded or stored again. */
function bootFromStore() {
  var cand = readSlot(CACHE_KEY);
  var good = readSlot(GOOD_KEY);
  /* An old, repeatedly failing candidate is dropped, but only online: offline,
     an old copy of the chapters beats an empty screen. */
  if (cand && cand.fails >= MAX_FAILS && cand.savedAt && Date.now() - cand.savedAt > TTL_MS
      && navigator.onLine !== false) { lsDel(CACHE_KEY); cand = null; }
  var order = [];
  if (cand) order.push({ slot: 'cand', src: cand.source });
  if (good && (!cand || good.source !== cand.source)) order.push({ slot: 'good', src: good.source });
  if (!order.length) return Promise.resolve(false);
  function next(i) {
    if (i >= order.length) return Promise.resolve(false);
    var o = order[i];
    return tryRun(o.src).then(function (ok) {
      if (ok) { finishOk(o.src, o.slot); return true; }
      reportFailure('bad_content', 'stored ' + o.slot + ' copy failed');
      if (o.slot === 'cand') { lsSet(BAD_KEY, fingerprint(o.src)); lsDel(CACHE_KEY); }
      else lsDel(GOOD_KEY);
      return next(i + 1);
    });
  }
  return next(0);
}

/* ── background refresh ────────────────────────────────────────────── */
var _inFlight = false;
var _lastFresh = 0;
var _bgStarted = false;

function weakConnection() {
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return !!(c && (c.saveData
    || c.type === 'cellular'
    || /^(slow-2g|2g|3g)$/i.test(c.effectiveType || '')));
}
/* Run a newer chapters file in the page that is already open and swap it in,
   so a change from the content repo shows up without any reload. The old
   ChapterData stays in place until the new one has run AND passes the contract;
   a file that fails is remembered as bad and never replaces a working one. */
function applyLive(src) {
  var old = window.ChapterData;
  return runSource(src).then(function () {
    var changed = window.ChapterData !== old;
    if (changed && shapeOk()) return true;
    if (changed) window.ChapterData = old;             /* defined something unusable: put the good one back */
    return false;
  });
}

function fetchFresh(reason) {
  if (_inFlight) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (reason === 'visible' || reason === 'interval') {
    var gap = weakConnection() ? 15 * 60 * 1000 : 60 * 1000;
    if (Date.now() - _lastFresh < gap) return;
  }
  _lastFresh = Date.now();
  _inFlight = true;
  fetchSource({ rounds: 1, fresh: true })
    .then(function (src) {
      if (src === _runningSrc) {                                              /* unchanged */
        var c0 = readSlot(CACHE_KEY);
        if (!c0 || c0.source !== src) writeSlot(CACHE_KEY, src);
        return;
      }
      if (lsGet(BAD_KEY) === fingerprint(src)) return;                        /* known-bad: do not run it again */
      return applyLive(src).then(function (ok) {
        if (ok) {
          _runningSrc = src;
          writeSlot(GOOD_KEY, src); writeSlot(CACHE_KEY, src);
          lsDel(BAD_KEY);
          try {
            window.dispatchEvent(new CustomEvent('abhyas:chapters-updated', { detail: { reason: reason || 'background', applied: true } }));
          } catch (e) { window.warnCaught && window.warnCaught('js/data/chapters-loader.js', e); }
        } else {
          lsSet(BAD_KEY, fingerprint(src));
          reportFailure('bad_content', 'a newer chapters file failed to run; the working copy was kept');
        }
      });
    })
    .catch(function () { /* offline or every mirror down: keep what we have */ })
    .then(function () { _inFlight = false; });
}
function startBackgroundRefresh() {
  if (_bgStarted) return;
  _bgStarted = true;
  setTimeout(function () { fetchFresh('boot'); }, 300);           /* every open checks for newer chapters */
  window.addEventListener('online', function () { fetchFresh('online'); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') fetchFresh('visible');
  });
  window.addEventListener('pageshow', function (e) { if (e && e.persisted) fetchFresh('visible'); });
  setInterval(function () { fetchFresh('interval'); }, 5 * 60 * 1000);
}

/* ── go ────────────────────────────────────────────────────────────── */
if (shapeOk()) { removeScreen(); _ready(true); startBackgroundRefresh(); return; }   /* defined by an earlier script */

window.addEventListener('online', function () { if (!shapeOk()) coldLoad(); });
bootFromStore().then(function (ok) { if (!ok) coldLoad(); });

})();
