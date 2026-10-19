// js/core/net.js — one-shot reachability probe + the Google Sign-In lazy loader.

async function pingSupabase(timeoutMs = 5000) {
  if (typeof ABHYAS_CONFIG === 'undefined' || !ABHYAS_CONFIG.SUPABASE_URL) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(ABHYAS_CONFIG.SUPABASE_URL, { 
      method: 'GET', 
      signal: ctrl.signal, 
      cache: 'no-store' 
    });
    clearTimeout(to);
    return true; 
  } catch (e) { 
    return false; 
  }
}

async function pingBackend(gasUrl, timeoutMs = 12000) {
  if (!gasUrl) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${gasUrl}?action=ping&_=${Date.now()}`, {
      signal: ctrl.signal, cache: 'no-store'
    });
    clearTimeout(to);
    if (!r.ok) return false;
    const data = await r.json();
    return !!(data.pong || data.success);
  } catch (e) { return false; }
}

const GSI = {
  SRC: 'https://accounts.google.com/gsi/client',
  _p: null,
  _inject() {
    if (window.google && window.google.accounts) return;
    if (document.querySelector('script[src="' + GSI.SRC + '"]')) return;
    const s = document.createElement('script');
    s.src = GSI.SRC; s.async = true; s.defer = true;
    document.head.appendChild(s);
  },
  whenNeeded() {
    if (GSI._p) return GSI._p;
    GSI._p = new Promise(resolve => {
      const go = () => GSI._inject();
      if (document.readyState === 'complete') { setTimeout(go, 0); return; }
      window.addEventListener('load', () => setTimeout(go, 0), { once: true });
      setTimeout(go, 2500);
    });
    return GSI._p;
  }
};

function qs(params) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

const GETFILE_GATE = {
  MAX: 45, BG_MAX: 15, WINDOW: 60000,
  _hits: [], _penaltyUntil: 0,
  async take(kind) {
    const ceiling = kind === 'bg' ? this.BG_MAX : this.MAX;
    for (;;) {
      const now = Date.now();
      if (now < this._penaltyUntil) {
        await new Promise(r => setTimeout(r, Math.min(this._penaltyUntil - now, 15000)));
        continue;
      }
      this._hits = this._hits.filter(t => now - t < this.WINDOW);
      if (this._hits.length < ceiling) { this._hits.push(now); return; }
      const oldest = this._hits[0] || now;
      const waitMs = Math.min(this.WINDOW, Math.max(250, this.WINDOW - (now - oldest) + 100));
      await new Promise(r => setTimeout(r, waitMs));
    }
  },
  backoff(ms = 10000) { this._penaltyUntil = Date.now() + ms; this._hits = []; },
  etaSeconds(n) {
    const perMin = this.MAX;
    return n <= perMin ? 0 : Math.round(((n - perMin) / perMin) * 60);
  }
};

async function netFetch(url, opts, timeoutMs = 20000) {
  if (S.forcedOffline) throw new Error('OFFLINE');
  if (!S.online) throw new Error('OFFLINE');

  let targetUrl = url;
  
  if (typeof ABHYAS_CONFIG !== 'undefined' && typeof abhyasEndpointFor === 'function') {
    let action = null;
    let bodyObj = null;

    if (opts && opts.body) {
      try {
        bodyObj = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
        if (bodyObj && bodyObj.action) action = bodyObj.action;
      } catch (e) {}
    }

    if (!action && url.indexOf('action=') !== -1) {
      try {
        const urlObj = new URL(url, window.location.origin);
        action = urlObj.searchParams.get('action');
        if (!bodyObj) {
          bodyObj = {};
          for (const [k, v] of urlObj.searchParams.entries()) bodyObj[k] = v;
        }
      } catch (e) {}
    }

    if (action && abhyasEndpointFor(action, bodyObj) === 'supabase') {
      /* Preserve the query string. Without this, any GET whose params live in
         the URL (QUIZ._fetch, _fetchBatch, _revalidateQuiet, HARDQ.load)
         reaches Supabase with nothing to route on and fails. The query is
         harmless on POST — the body wins. */
      const qIdx = url.indexOf('?');
      targetUrl = qIdx === -1
        ? ABHYAS_CONFIG.SUPABASE_URL
        : ABHYAS_CONFIG.SUPABASE_URL + url.slice(qIdx);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(targetUrl, { ...(opts || {}), signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out — the server is taking too long. Try again or check your connection.', { cause: err });
    }
    throw err;
  }
}

const NETCHECK = {
  _timer: null, _failCount: 0, FAILS_BEFORE_OFFLINE: 3,
  async ping() {
    if (S.forcedOffline) return S.online;
    const wasOnline = S.online;
    let ok;
    
    try {
      ok = await pingSupabase();
      if (!ok && typeof APPS !== 'undefined') {
        ok = await pingBackend(APPS);
      }
    } catch (e) { ok = false; }

    if (ok) { 
      this._failCount = 0; 
      S.online = true; 
    } else {
      this._failCount++;
      if (!navigator.onLine || this._failCount >= this.FAILS_BEFORE_OFFLINE) S.online = false;
    }
    
    if (S.online !== wasOnline) { 
      if (typeof _updateNetBtn === 'function') _updateNetBtn(); 
      if (typeof _updateOfflineWarn === 'function') _updateOfflineWarn(); 
    }
    return S.online;
  },
  start() { if (NETCHECK._timer) return; NETCHECK._timer = setInterval(() => NETCHECK.ping(), 30000); },
  reset() { this._failCount = 0; }
};