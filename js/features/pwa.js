// js/features/pwa.js — install banner, fullscreen, service-worker registration.

const PWA = {
  init() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      S.dpi = e;
      const btn = document.getElementById('installBtn');
      if (btn) { btn.style.display = ''; btn.title = 'Install App'; }
      // Banner shows at most once (first login/prompt). After that, or once
      // dismissed, install is available only via the menu button.
      try {
        if (localStorage.getItem('pwa_banner_dismissed') === '1') return;
        if (localStorage.getItem('pwa_banner_shown') === '1') return;
        localStorage.setItem('pwa_banner_shown', '1');
      } catch (e) { window.warnCaught && window.warnCaught('js/features/pwa.js', e); }
      PWA._showInstallBanner();
    });
    window.addEventListener('appinstalled', () => {
      S.dpi = null;
      toast('📲 App installed!');
      const btn = document.getElementById('installBtn');
      if (btn) btn.style.display = 'none';
      PWA._hideInstallBanner();
    });
    const verEl = document.getElementById('set-app-version');
    if (verEl && typeof APP_VERSION !== 'undefined') verEl.textContent = APP_VERSION;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_ACTIVATED' && e.data.version !== (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')) {
          PWA._updateReady(e.data.version);
        }
      });
      /* Browsers only look for a new service worker when the page is opened, so a
         phone that never closes the app can run an old build for days. Ask
         explicitly: when the app comes back to the foreground and every hour. */
      const ask = () => { navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ask(); });
      setInterval(ask, 60 * 60 * 1000);
    }
  },
  /* A new build is waiting. A toast that vanishes after 8 s (and is skipped
     during a quiz) is easy to miss, so this stays as a bar until the student
     reloads, and waits for the quiz to end instead of interrupting it. */
  _updateVersion: '',
  _updateReady(version) {
    PWA._updateVersion = version || PWA._updateVersion || 'new';
    /* Nobody is looking and nothing is in progress: just apply it, so the next
       time the app is opened it is already the new version. */
    if (document.visibilityState === 'hidden' && !(S.quiz && S.quiz.active)) { PWA.reloadForUpdate(); return; }
    PWA._showUpdateBar();
  },
  _showUpdateBar() {
    if (document.getElementById('pwa-update-bar')) return;
    if (S.quiz && S.quiz.active) {                 // never interrupt a quiz; try again shortly
      if (!PWA._updateRetry) PWA._updateRetry = setInterval(() => {
        if (!(S.quiz && S.quiz.active)) { clearInterval(PWA._updateRetry); PWA._updateRetry = null; PWA._showUpdateBar(); }
      }, 4000);
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'pwa-update-bar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:.75rem;right:.75rem;top:calc(var(--safe-t,0px) + .5rem);z-index:9998;display:flex;align-items:center;gap:.6rem;'
      + 'background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--accent-line,var(--sep,#ccc));border-radius:12px;padding:.6rem .8rem;box-shadow:var(--sh-3,0 6px 20px rgba(0,0,0,.18))';
    const t = document.createElement('div');
    t.style.cssText = 'flex:1;font-size:.8rem;line-height:1.35';
    t.textContent = 'A new version of Abhyas is ready.';
    const go = document.createElement('button');
    go.type = 'button'; go.textContent = 'Reload';
    go.style.cssText = 'min-height:44px;padding:0 1rem;border:none;border-radius:10px;background:var(--accent,#1E7A4C);color:var(--on-accent,#fff);font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit';
    go.addEventListener('click', () => PWA.reloadForUpdate());
    const x = document.createElement('button');
    x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '\u00d7';
    x.style.cssText = 'min-width:44px;min-height:44px;border:none;background:none;color:var(--ink-3,#555);font-size:1.2rem;cursor:pointer';
    x.addEventListener('click', () => bar.remove());
    bar.append(t, go, x);
    document.body.appendChild(bar);
  },
  /* One clean reload with every shell file fetched from the network (the service
     worker stops answering from cache for a few seconds). Once per version, so a
     genuinely broken deploy can never put the page in a reload loop. Returns true
     when a reload was started. */
  forceFresh(why) {
    try {
      const key = 'abhyas_fresh_tried';
      const tried = sessionStorage.getItem(key);
      const ver = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '';
      if (tried === ver) return false;
      sessionStorage.setItem(key, ver);
      const go = () => location.reload();
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (c) { c.postMessage({ type: 'FRESH_SHELL' }); setTimeout(go, 150); } else go();
      return true;
    } catch (e) { window.warnCaught && window.warnCaught('js/features/pwa.js', e); return false; }
  },
  reloadForUpdate() { try { location.reload(); } catch (e) { window.warnCaught && window.warnCaught('js/features/pwa.js', e); } },
  _showInstallBanner() {
    try { if (localStorage.getItem('pwa_banner_dismissed') === '1') return; } catch (e) {}
    if (document.getElementById('pwa-install-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-install-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Install Abhyas');
    bar.style.cssText = 'position:fixed;left:.75rem;right:.75rem;bottom:calc(var(--bn-h,0px) + .75rem + var(--safe-b,0px));background:var(--c2);border:1px solid var(--bd);border-radius:var(--r2);padding:.7rem .9rem;display:flex;align-items:center;gap:.6rem;z-index:9997;box-shadow:var(--sh3)';
    bar.innerHTML = `
      <div style="font-size:1.3rem"><i class="ph ph-device-mobile"></i></div>
      <div style="flex:1;font-size:.76rem;color:var(--t2);line-height:1.3">Install this app for faster, offline access</div>
      <button id="pwa-install-go" style="padding:.4rem .75rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r1);color:var(--on-accent,#0F0A00);font-weight:700;font-size:.76rem;cursor:pointer;font-family:var(--ff)">Install</button>
      <button id="pwa-install-x" aria-label="Dismiss install prompt" style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;min-height:24px;background:none;border:none;color:var(--t3);font-size:.9rem;cursor:pointer;padding:.2rem"><i class="ph ph-x"></i></button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => { try { FLOATSPACE.sync('pwa-banner', bar); } catch (e) { window.warnCaught && window.warnCaught('js/features/pwa.js', e); } });
    document.getElementById('pwa-install-go').onclick = () => { PWA.install(); PWA._hideInstallBanner(); };
    document.getElementById('pwa-install-x').onclick = () => { try { localStorage.setItem('pwa_banner_dismissed', '1'); } catch (e) {} PWA._hideInstallBanner(); };
  },
  _hideInstallBanner() {
    const bar = document.getElementById('pwa-install-banner');
    if (bar) bar.remove();
    try { FLOATSPACE.sync('pwa-banner', null); } catch (e) { window.warnCaught && window.warnCaught('js/features/pwa.js', e); }
  },
  install() {
    if (S.dpi) {
      S.dpi.prompt();
      S.dpi.userChoice.then(() => { S.dpi = null; });
      const b = document.getElementById('installBtn');
      if (b) b.style.display = 'none';
    } else toast('Install option not available — try your browser\'s "Add to Home Screen" menu.');
  },
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      /* Optional chaining alone made this a silent no-op in browsers that
         do not expose the Fullscreen API (older iOS, embedded webviews).
         Tell the student instead of pretending the tap did something. */
      if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') {
        toast('Fullscreen is not available in this browser');
        return;
      }
      document.documentElement.requestFullscreen().catch(() => toast('Fullscreen could not start'));
    } else if (typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch?.(() => {});
    }
  }
};

window.PWA = PWA;