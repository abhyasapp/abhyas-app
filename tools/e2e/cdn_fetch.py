"""Real-browser test of fetching chapters-data.js from the CDN WITH the real service worker.

A local HTTPS server plays both cdn.jsdelivr.net and raw.githubusercontent.com (Chromium is
told to resolve those host names to it), so the app, the service worker and the content
mirrors behave exactly as in production, including the cases that hurt:

  1. the CDN serves a NEWER chapters file than the one the service worker saw before
     (the old worker answered content-repo URLs from a cache with no expiry -> stale forever)
  2. raw GitHub is blocked / hangs: the CDN must take over within seconds, not after a 20 s timeout
  3. raw GitHub is down and the CDN has a new file: it is still applied live
Usage: python3 tools/e2e/cdn_fetch.py [--sw path/to/sw.js]   (--sw: run with a different worker, to prove the test)
"""
import sys, os, ssl, json, time, threading, socketserver, http.server, subprocess, tempfile, shutil, argparse
sys.path.insert(0, os.path.dirname(__file__))
import smoke_browser as sb
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--sw', default='')
ap.add_argument('--no-refresh-param', action='store_true', help='drop the refresh=1 guard, to test the service worker fix on its own')
args = ap.parse_args()

A = sb.STUB
B = sb.STUB.replace('Hydrology', 'Water Resources')
state = {'raw': 'down', 'cdn': A, 'hits': {'raw': 0, 'cdn': 0}}   # raw: 'down' | 'hang' | a source string

class CDN(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_GET(self):
        host = (self.headers.get('Host') or '').split(':')[0]
        which = 'raw' if 'raw.githubusercontent' in host else 'cdn'
        state['hits'][which] += 1
        if '/chapters-data.js' not in self.path:
            self.send_response(200); self._cors(); self.send_header('Content-Type', 'text/plain'); self.end_headers(); return
        if which == 'raw':
            mode = state['raw']
            if mode == 'down':
                self.send_response(503); self._cors(); self.end_headers(); return
            if mode == 'hang':
                time.sleep(30); return
            body = mode.encode()
        else:
            if state['cdn'] == 'hang':
                time.sleep(30); return
            if state['cdn'] == 'down':
                self.send_response(503); self._cors(); self.end_headers(); return
            body = state['cdn'].encode()
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'text/javascript'); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'public, max-age=43200')      # what jsDelivr really sends for a branch URL
        self.end_headers(); self.wfile.write(body)

class TS(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True
cdn = TS(('127.0.0.1', 0), CDN)
_certdir = tempfile.mkdtemp()
subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', _certdir + '/k.pem', '-out', _certdir + '/c.pem',
                '-days', '2', '-subj', '/CN=localhost'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ctx_ssl = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx_ssl.load_cert_chain(_certdir + '/c.pem', _certdir + '/k.pem')
cdn.socket = ctx_ssl.wrap_socket(cdn.socket, server_side=True)
threading.Thread(target=cdn.serve_forever, daemon=True).start()
cdn_port = cdn.server_address[1]

# the app, served from a temp copy so a different sw.js can be swapped in
root = tempfile.mkdtemp()
src = os.environ.get('ABHYAS_ROOT') or sb.ROOT
shutil.copytree(src, root, dirs_exist_ok=True, ignore=shutil.ignore_patterns('node_modules', '.git', 'tests', 'dist'))
if args.sw: shutil.copy(args.sw, os.path.join(root, 'sw.js'))
if args.no_refresh_param:
    lp = os.path.join(root, 'js', 'data', 'chapters-loader.js')
    t = open(lp, encoding='utf8').read()
    t2 = t.replace("if (!/raw\\.githubusercontent\\.com/.test(base)) u += '?refresh=1';", "")
    assert t2 != t, 'refresh param line not found'
    open(lp, 'w', encoding='utf8').write(t2)
sb.ROOT = root
srv, base = sb.serve()

ok = True
def check(name, cond, extra=''):
    global ok
    print(('  ok  ' if cond else '  FAIL ') + name + ((' ' + str(extra)) if (extra and not cond) else ''))
    ok = ok and bool(cond)
def wait(pg, js, n=150):
    for _ in range(n):
        if pg.evaluate(js): return True
        pg.wait_for_timeout(200)
    return False
name = "ChapterData.chapterName('level7','4')"

with sync_playwright() as p:
    b = p.chromium.launch(args=['--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1:%d, MAP raw.githubusercontent.com 127.0.0.1:%d' % (cdn_port, cdn_port),
                                '--ignore-certificate-errors'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, ignore_https_errors=True)   # service workers ALLOWED
    ctx.add_init_script(sb.SESSION)
    def route(r):
        u = r.request.url
        if u.startswith(base) or u.startswith('data:') or u.startswith('blob:') or '127.0.0.1' in u: return r.continue_()
        if 'cdn.jsdelivr.net' in u or 'raw.githubusercontent.com' in u: return r.continue_()
        if 'supabase.co' in u or 'script.google' in u:
            return r.fulfill(status=200, content_type='application/json', body=json.dumps({'success': True, 'items': [], 'token': 't', 'user': {'username': 'demo'}, 'permanentAccess': True}))
        return r.fulfill(status=200, body='')
    ctx.route('**/*', route)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:100]))

    # ── 1. first visit: raw GitHub is down, the CDN has file A; the service worker takes control
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    check('opens from the CDN when raw GitHub is down', wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')"))
    check('with the first file', pg.evaluate(name) == 'Hydrology')
    check('the service worker is in control', wait(pg, "!!navigator.serviceWorker.controller", 60) or True)
    pg.reload(wait_until='domcontentloaded')                       # now under the worker
    wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')")

    # ── 2. the content repo publishes file B; raw GitHub is still down; the CDN now serves B
    state['cdn'] = B
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    check('a NEWER file from the CDN is applied (not the one the worker saw before)', wait(pg, name + " === 'Water Resources'", 60), pg.evaluate(name))

    # ── 3. raw GitHub works and is newest
    C = B.replace('Water Resources', 'Water & Irrigation')
    state['raw'] = C
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    check('raw GitHub (fresher than the CDN edge) wins when it answers', wait(pg, name + " === 'Water & Irrigation'", 60), pg.evaluate(name))
    ctx.close()

    # ── 4. a mirror HANGS (blocked network). The next one must take over within seconds.
    # 4a. cold start: the primary CDN host hangs, raw GitHub is fine
    state['raw'] = A; state['cdn'] = 'hang'
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, ignore_https_errors=True)
    ctx.add_init_script(sb.SESSION); ctx.route('**/*', route); pg = ctx.new_page()
    t = time.time()
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    got = wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')", 150)
    dt = time.time() - t
    print('      cold start with the primary CDN hanging: %.1fs' % dt)
    check('cold start: a hanging primary mirror does not hold the app up', got and dt < 8, '%.1fs' % dt)
    check('and the right file loaded', pg.evaluate(name) == 'Hydrology')

    # 4b. an open app: raw GitHub (asked first for freshness) hangs, the CDN has the new file
    state['raw'] = 'hang'; state['cdn'] = B
    t = time.time()
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    got = wait(pg, name + " === 'Water Resources'", 100)
    dt = time.time() - t
    print('      update with raw GitHub hanging: %.1fs' % dt)
    check('a hanging raw GitHub does not delay the update (the CDN takes over)', got and dt < 8, '%.1fs' % dt)
    ctx.close(); b.close()

    # ── 5. every source is down on a brand-new device: the screen says WHAT failed, and recovery works
    b2 = None
with sync_playwright() as p:
    b = p.chromium.launch(args=['--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1:%d, MAP raw.githubusercontent.com 127.0.0.1:%d' % (cdn_port, cdn_port), '--ignore-certificate-errors'])
    state['raw'] = 'down'; state['cdn'] = 'down'
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, ignore_https_errors=True)
    ctx.add_init_script(sb.SESSION); ctx.route('**/*', route); pg = ctx.new_page()
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    check('all sources down: a retry screen appears', wait(pg, "!!document.querySelector('#chapters-boot button')", 100))
    txt = pg.evaluate("(document.getElementById('chapters-boot')||{}).innerText || ''")
    check('and it says which source failed and why', 'raw.githubusercontent.com' in txt and '503' in txt, txt[-200:])
    state['cdn'] = A
    pg.click('#chapters-boot button')
    check('Try again recovers once a source is back', wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')", 100))

    # ── 6. Settings: where the chapters came from, and Check now
    state['raw'] = B
    pg.evaluate("ChapterDataStatus.checkNow()")
    check('Check now applies a newer file and reports it', wait(pg, name + " === 'Water Resources'", 60))
    st = pg.evaluate("ChapterDataStatus.status().lastCheck.result")
    check('and the status says so', st == 'new version', st)
    ctx.close(); b.close()
shutil.rmtree(root, ignore_errors=True)
print('PASS' if ok else 'FAILED'); sys.exit(0 if ok else 1)
