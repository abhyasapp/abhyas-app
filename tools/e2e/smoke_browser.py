"""Real-browser deploy gate: load the app COLD, then WARM (reload), and fail on
anything the unit tests and the HTTP smoke test cannot see.

Why: both of the incidents that shipped past 500+ green unit tests were
runtime-only (a CSP that blocked the chapters file; an icon stylesheet that did
not apply on warm loads). HTTP was 200 and nothing ever executed the page.

Asserts, on the cold load AND again after a reload:
  - no page errors, no console errors, no CSP violations
  - window.ChapterData is defined and passes the loader's contract
  - the icon font is really loaded (document.fonts.check)
  - the first screen painted (#app.on)

Usage
  python3 tools/e2e/smoke_browser.py                      # serve this repo locally, mock the CDN
  python3 tools/e2e/smoke_browser.py --base https://abhyas.app --live-cdn
      (against the deployed site and the REAL content CDN; the backend is always
       stubbed, so no account is needed)
  --scenario bad-commit   a bad chapters file on the primary mirror (must fall back)
  --scenario mirror       primary mirror down (must use another mirror)
  --scenario poisoned-cache  the newest stored copy is bad and the network is down
                          (must fall back to the last good copy, offline)
Exit code 0 = pass, 1 = fail.
"""
import argparse, functools, http.server, json, os, re, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
STUB = open(os.path.join(os.path.dirname(__file__), 'chapters_stub.js.txt')).read()
BAD = 'this is not the chapters file { oops'


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def serve():
    h = functools.partial(Q, directory=ROOT)
    s = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h)
    s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, 'http://127.0.0.1:%d' % s.server_address[1]


SESSION = """
if(!localStorage.getItem('abhyas_session')){
  localStorage.setItem('abhyas_session',JSON.stringify({type:'user',username:'demo',name:'Demo Student',
    email:'d@x.np',token:'t',access:{level:'permanent',permanent:true,accessType:'permanent'},lastVerified:Date.now()}));
  localStorage.setItem('abhyas_tutorial_seen',JSON.stringify({demo:true}));
}
window.__csp = [];
document.addEventListener('securitypolicyviolation', function(e){
  window.__csp.push(e.violatedDirective + ' ' + String(e.blockedURI).slice(0,80));
});
"""


def run(base, live_cdn, scenario, page_name):
    problems = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        ctx.add_init_script(SESSION)
        if scenario == 'poisoned-cache':
            ctx.add_init_script(
                "if(!localStorage.getItem('abhyas_chapters_good_v1')){"
                "localStorage.setItem('abhyas_chapters_good_v1',JSON.stringify({source:%s,savedAt:Date.now(),fails:0}));"
                "localStorage.setItem('abhyas_chapters_cache_v2',JSON.stringify({source:%s,savedAt:Date.now(),fails:0}));}"
                % (json.dumps(STUB), json.dumps('ChapterData = {{{ broken')))

        def route(r):
            u = r.request.url
            if 'chapters-data.js' in u:
                if live_cdn and scenario == 'normal':
                    return r.continue_()
                if scenario == 'poisoned-cache':
                    return r.abort()
                host_primary = 'cdn.jsdelivr.net' in u
                if scenario == 'bad-commit' and host_primary:
                    return r.fulfill(status=200, content_type='text/javascript', body=BAD)
                if scenario == 'mirror' and host_primary:
                    return r.abort()
                return r.fulfill(status=200, content_type='text/javascript', body=STUB)
            if u.startswith(base) or u.startswith('data:') or u.startswith('blob:'):
                return r.continue_()
            if 'supabase.co' in u or 'script.google' in u:
                return r.fulfill(status=200, content_type='application/json', body=json.dumps(
                    {'success': True, 'sessions': [], 'files': [], 'items': [], 'token': 't',
                     'user': {'username': 'demo', 'status': 'active'}, 'permanentAccess': True}))
            if re.search(r'/content/.+\.json', u):
                return r.fulfill(status=200, content_type='application/json', body='[]')
            if 'cdn.jsdelivr.net' in u or 'raw.githubusercontent.com' in u:
                return r.continue_() if live_cdn else r.fulfill(status=200, body='')
            return r.continue_()

        ctx.route('**/*', route)
        pg = ctx.new_page()
        errors = []
        # In the poisoned-cache scenario the browser itself reports the deliberately broken
        # file's SyntaxError; what matters there is that the app recovers from it.
        pg.on('pageerror', lambda e: None if (scenario == 'poisoned-cache' and 'Unexpected token' in str(e))
              else errors.append('pageerror: ' + str(e)[:160]))
        # A third-party host that is unreachable from the CI box is not the app's fault;
        # a same-site request that fails IS (a missing file, a bad path), so that is checked below.
        pg.on('console', lambda m: errors.append('console.error: ' + m.text[:160])
              if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
        pg.on('requestfailed', lambda r: errors.append('request failed: ' + r.url[:120])
              if r.url.startswith(base) else None)

        def check(label):
            # Polled from outside the page: wait_for_function evaluates a string in-page,
            # which the admin page's strict CSP (rightly) forbids.
            ready = ("!!window.ChapterData && !!document.getElementById('app') && document.getElementById('app').classList.contains('on')"
                     if page_name.startswith('user') else
                     "!!window.ChapterData && !!document.getElementById('gate')")
            for _ in range(100):
                if pg.evaluate(ready): break
                pg.wait_for_timeout(200)
            else:
                raise Exception('%s never became ready (is ChapterData defined? is the loading screen stuck?)' % label)
            pg.wait_for_timeout(800)
            info = pg.evaluate("""() => ({
              shape: !!(window.ChapterData && typeof ChapterData.allFileRefs==='function'
                        && typeof ChapterData.chapterName==='function' && typeof ChapterData.levels==='function'),
              csp: window.__csp || [],
              fonts: document.fonts.check('1em Phosphor'),
              boot: !!document.getElementById('chapters-boot'),
              ver: window.APP_VERSION || ''
            })""")
            if not info['shape']: problems.append(label + ': ChapterData is missing or fails the contract')
            if info['csp']: problems.append(label + ': CSP violations: ' + '; '.join(info['csp'][:3]))
            if info['boot']: problems.append(label + ': the chapters loading/error screen is still showing')
            if not info['fonts']: problems.append(label + ': the icon font (Phosphor) is not loaded')
            if errors: problems.append(label + ': ' + ' | '.join(errors[:4]))
            errors.clear()
            return info

        try:
            pg.goto(base + '/' + page_name, wait_until='domcontentloaded')
            check('cold ' + page_name)
            pg.reload(wait_until='domcontentloaded')
            info = check('warm ' + page_name)
            print('  %s: ok (v%s)' % (page_name, info['ver']))
        except Exception as e:
            problems.append('%s: %s' % (page_name, str(e).splitlines()[0][:200]))
        b.close()
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='')
    ap.add_argument('--live-cdn', action='store_true')
    ap.add_argument('--scenario', default='normal', choices=['normal', 'bad-commit', 'mirror', 'poisoned-cache'])
    ap.add_argument('--pages', default='user.html')
    a = ap.parse_args()
    srv = None
    base = a.base.rstrip('/')
    if not base:
        srv, base = serve()
    print('smoke_browser: %s  scenario=%s  cdn=%s' % (base, a.scenario, 'live' if a.live_cdn else 'mock'))
    problems = []
    for name in a.pages.split(','):
        problems += run(base, a.live_cdn, a.scenario, name.strip())
    if problems:
        print('\nFAILED:')
        for x in problems: print('  -', x)
        sys.exit(1)
    print('PASS')


if __name__ == '__main__':
    main()
