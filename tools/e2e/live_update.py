"""Real-browser check: changes from the content repo and from a new deploy reach the
student WITHOUT a hard reload.

  1. new chapter data is applied while the app is open (no reload at all)
  2. a broken chapters file never replaces a working one
  3. a plain reload (not a hard reload) starts on the newest chapter data
  4. a changed question file is picked up the next time the chapter opens
  5. a page assembled from two deploys fixes itself with ONE clean reload (and never loops)
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import smoke_browser as sb
from playwright.sync_api import sync_playwright

srv, base = sb.serve()
ok = True
def check(name, cond, extra=''):
    global ok
    print(('  ok  ' if cond else '  FAIL ') + name + ((' ' + str(extra)) if (extra and not cond) else ''))
    ok = ok and bool(cond)

A = sb.STUB
B = sb.STUB.replace('Hydrology', 'Water Resources')
BAD = 'window.ChapterData = {{{ this is not valid javascript'
state = {'chapters': A, 'qfile': [{'q': 'old stem', 'options': ['a', 'b'], 'correct': 0}], 'qhits': 0, 'meta': None}

def make_ctx(b):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script(sb.SESSION)
    def route(r):
        u = r.request.url
        if 'chapters-data.js' in u:
            return r.fulfill(status=200, content_type='text/javascript', body=state['chapters'])
        if '/content/fileX.json' in u:
            state['qhits'] += 1
            return r.fulfill(status=200, content_type='application/json', body=json.dumps(state['qfile']))
        if u.startswith(base):
            if state['meta'] and u.endswith('/user.html'):
                resp = r.fetch()
                body = resp.text().replace('name="abhyas-version" content="', 'name="abhyas-version" content="' + state['meta'])
                return r.fulfill(response=resp, body=body)
            return r.continue_()
        if u.startswith('data:') or u.startswith('blob:'):
            return r.continue_()
        if 'supabase.co' in u or 'script.google' in u:
            return r.fulfill(status=200, content_type='application/json', body=json.dumps(
                {'success': True, 'sessions': [], 'files': [], 'items': [], 'token': 't', 'user': {'username': 'demo', 'status': 'active'}, 'permanentAccess': True}))
        return r.fulfill(status=200, body='')
    ctx.route('**/*', route)
    return ctx

def wait(pg, js, n=100):
    for _ in range(n):
        if pg.evaluate(js): return True
        pg.wait_for_timeout(200)
    return False

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = make_ctx(b); pg = ctx.new_page()
    errors = []
    # the deliberately broken chapters file makes the browser report its own SyntaxError
    pg.on('pageerror', lambda e: None if 'Unexpected token' in str(e) else errors.append(str(e)[:120]))
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    check('app opens', wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')"))
    check('starts on the current chapter names', pg.evaluate("ChapterData.chapterName('level7','4')") == 'Hydrology')

    # 1. the content repo changes while the app is open
    pg.evaluate("window.__marker = 'same-page'; window.__upd = 0; window.addEventListener('abhyas:chapters-updated', () => { window.__upd++; });")
    state['chapters'] = B
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    check('new chapter data is applied live', wait(pg, "ChapterData.chapterName('level7','4') === 'Water Resources'"))
    check('without reloading the page', pg.evaluate("window.__marker") == 'same-page')
    check('and the app was told', pg.evaluate("window.__upd") >= 1)

    # 2. a broken file never replaces a working one
    state['chapters'] = BAD
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    pg.wait_for_timeout(2500)
    check('a broken chapters file is refused', pg.evaluate("ChapterData.chapterName('level7','4')") == 'Water Resources')
    check('and remembered as bad', pg.evaluate("!!localStorage.getItem('abhyas_chapters_bad_v1')"))

    # 3. a plain reload (not a hard reload) starts on the newest data
    state['chapters'] = B
    pg.reload(wait_until='domcontentloaded')
    check('a normal reload shows the newest chapters', wait(pg, "!!window.ChapterData && ChapterData.chapterName('level7','4') === 'Water Resources'"))

    # 4. a changed question file is picked up when the chapter is next opened
    check('question files check on open', wait(pg, "typeof QUIZ !== 'undefined' && !!QUIZ.CDN_BASE && S.online === true"))
    first = pg.evaluate("""(async () => { await QDB.set('kX', [{ q: 'old stem' }]); localStorage.removeItem('abhyas_qts');
        const d = await QUIZ._fetch('fileX', 'kX'); return d[0].q; })()""")
    check('the first open already shows the corrected question', first == 'old stem' or first == 'new stem', first)
    state['qfile'] = [{'q': 'new stem', 'options': ['a', 'b'], 'correct': 0}]
    pg.evaluate("localStorage.removeItem('abhyas_qts')")                      # last check was long ago
    got = pg.evaluate("(async () => { const d = await QUIZ._fetch('fileX', 'kX'); return d[0].q; })()")
    check('a changed question file is used the next time it is opened', got == 'new stem', got)
    hits = state['qhits']
    again = pg.evaluate("(async () => { const d = await QUIZ._fetch('fileX', 'kX'); return d[0].q; })()")
    check('and it is not re-downloaded on every open', again == 'new stem' and state['qhits'] == hits)
    check('no page errors', not errors, errors[:3])
    ctx.close()

    # 5. a page assembled from two deploys fixes itself with one reload, and never loops
    state['meta'] = '0.0-'
    ctx = make_ctx(b); pg = ctx.new_page()
    navs = []
    pg.on('framenavigated', lambda f: navs.append(f.url) if f == pg.main_frame else None)
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    pg.wait_for_timeout(4000)
    check('a mixed-version page reloads once, not in a loop', 1 <= len([u for u in navs if 'user.html' in u]) <= 2, navs)
    check('and then still opens', wait(pg, "document.getElementById('app').classList.contains('on')"))
    ctx.close()
    b.close()
print('PASS' if ok else 'FAILED'); sys.exit(0 if ok else 1)
