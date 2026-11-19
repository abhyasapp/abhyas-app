// js/core/crash-report.js — sends a short note to Activity log when something throws.
// At most 5 per page load. Never any answers or personal details.

(function () {
  let sent = 0;
  const seen = {};

  /* `kind` separates the incidents that matter operationally from ordinary
     script errors: 'csp' (the browser blocked something the page needed) and
     'boot_failure' (the app could not start). Those two get their own small
     allowance so a noisy page cannot use up the budget before they are sent. */
  let sentSpecial = 0;
  function report(msg, src, line, kind) {
    try {
      const special = kind === 'csp' || kind === 'boot_failure';
      if (special ? sentSpecial >= 5 : sent >= 5) return;
      msg = String(msg || '').slice(0, 200);
      if (!msg || msg === 'Script error.' || seen[msg]) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.SUPABASE_URL) || '';
      if (!url) return;
      seen[msg] = 1;
      if (special) sentSpecial++; else sent++;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        keepalive: true,
        body: JSON.stringify({
          action: 'logClientError',
          kind: kind || 'error',
          msg,
          src: String(src || '').split('/').pop().slice(0, 80),
          line: line || 0,
          page: (location.pathname || '').split('/').pop() || 'index',
          v: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
          ua: (navigator.userAgent || '').slice(0, 80)
        })
      }).catch(() => {});
    } catch (e) { window.warnCaught && window.warnCaught('js/core/crash-report.js', e); }
  }

  window.addEventListener('error', e => report(e.message, e.filename, e.lineno));

  /* A blocked script, style, font or request. Only the directive and the ORIGIN
     of what was blocked are sent, never a full URL (it can carry tokens). */
  document.addEventListener('securitypolicyviolation', e => {
    let blocked = String(e.blockedURI || '');
    try { if (/^https?:/i.test(blocked)) blocked = new URL(blocked).origin; } catch (err) { blocked = blocked.slice(0, 40); }
    report('CSP blocked ' + (e.violatedDirective || e.effectiveDirective || '?') + ': ' + blocked, e.sourceFile || 'csp', e.lineNumber || 0, 'csp');
  });

  /* chapters-loader.js announces when the app cannot start (bad content, every
     mirror down). It may run before this file, so it also keeps a queue. */
  function bootFailure(d) { if (d) report('boot_failure ' + d.kind + ': ' + (d.detail || ''), 'chapters-loader.js', 0, 'boot_failure'); }
  window.addEventListener('abhyas:boot-failure', e => bootFailure(e && e.detail));
  (window.__abhyasBootFailures || []).forEach(bootFailure);
  window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    report(r && r.message ? r.message : String(r), 'promise', 0);
  });
})();