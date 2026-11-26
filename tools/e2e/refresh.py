"""Real-browser check of Refresh everything: Home header, More menu, Settings -> Data tools."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import smoke_browser as sb
from playwright.sync_api import sync_playwright

srv, base = sb.serve()
A = sb.STUB
B = sb.STUB.replace('Hydrology', 'Water Resources')
state = {'chapters': A}
ok = True
def check(name, cond, extra=''):
    global ok
    print(('  ok  ' if cond else '  FAIL ') + name + ((' ' + str(extra)) if (extra and not cond) else ''))
    ok = ok and bool(cond)
def wait(pg, js, n=100):
    for _ in range(n):
        if pg.evaluate(js): return True
        pg.wait_for_timeout(200)
    return False

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', accept_downloads=True)
    ctx.add_init_script(sb.SESSION)
    def route(r):
        u = r.request.url
        if 'chapters-data.js' in u: return r.fulfill(status=200, content_type='text/javascript', body=state['chapters'])
        if u.startswith(base) or u.startswith('data:') or u.startswith('blob:'): return r.continue_()
        if 'supabase.co' in u or 'script.google' in u:
            return r.fulfill(status=200, content_type='application/json', body=json.dumps({'success': True, 'items': [], 'token': 't', 'user': {'username': 'demo'}, 'permanentAccess': True}))
        if '/content/' in u: return r.fulfill(status=200, content_type='application/json', body='[]')
        return r.fulfill(status=200, body='')
    ctx.route('**/*', route)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:120]))
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    check('app opens', wait(pg, "!!window.ChapterData && document.getElementById('app').classList.contains('on')"))
    name = "ChapterData.chapterName('level7','4')"
    pg.evaluate("window.__loader = 0; QUIZ._showLoader = () => { window.__loader++; }; 0")

    # 1. the Home header button picks up a change made on the server
    pg.evaluate("UI.go('home')"); pg.wait_for_timeout(500)
    check('the Home header has a Refresh button', pg.is_visible('.hh-refresh'))
    check('it is labelled for screen readers', 'Refresh' in (pg.get_attribute('.hh-refresh', 'aria-label') or ''))
    state['chapters'] = B
    pg.click('.hh-refresh')
    check('it applies the new chapters', wait(pg, name + " === 'Water Resources'"), pg.evaluate(name))
    check('and finishes', wait(pg, "!REFRESH.running"))
    check('with no loading screen', pg.evaluate("window.__loader") == 0)

    # 2. the More menu, reachable from any screen
    pg.evaluate("UI.go('data')"); pg.wait_for_timeout(300)
    pg.click('#tb-more-btn')
    check('the More menu has Refresh everything', pg.is_visible('.tb-menu-item[data-refresh-btn]'))
    state['chapters'] = A
    pg.click('.tb-menu-item[data-refresh-btn]')
    check('it refreshes from the menu too', wait(pg, name + " === 'Hydrology'"), pg.evaluate(name))
    check('and finishes (menu)', wait(pg, "!REFRESH.running"))

    # 3. Settings -> Data tools: the row, the step list, the result
    pg.evaluate("UI.go('data')"); pg.wait_for_timeout(500)
    check('Data tools has the Refresh everything row', pg.evaluate("document.querySelector('#storage-card-body').textContent.includes('Refresh everything')"))
    pg.click('#storage-card-body [data-on-click="SETTINGS.refreshQuestions()"]')
    check('it works in place and shows five steps', wait(pg, "!REFRESH.running && document.querySelectorAll('#refresh-steps li').length === 5"))
    texts = pg.evaluate("[...document.querySelectorAll('#refresh-steps li')].map(l => l.textContent)")
    print('     ' + ' | '.join(t[:40] for t in texts))
    check('every step says what happened', all(':' in t and len(t) > 12 for t in texts))
    check('the list is a polite live region', pg.evaluate("document.getElementById('refresh-steps').getAttribute('aria-live')") == 'polite')
    check('no loading screen was shown', pg.evaluate("window.__loader") == 0)
    check('the last result survives the card being redrawn', (pg.evaluate("SETTINGS.renderStorage().then(() => document.querySelectorAll('#refresh-steps li').length)")) == 5)

    # 4. backup still works from the same card
    with pg.expect_download(timeout=10000) as dl:
        pg.click('#storage-card-body button:has-text("Download backup")')
    check('Download backup saves a file', dl.value.suggested_filename.startswith('abhyas'), dl.value.suggested_filename)

    # 5. not during a quiz
    pg.evaluate("S.quiz.active = true; REFRESH._lines = []; window.__r = null; REFRESH.run().then(v => { window.__r = v; }); 0")
    pg.wait_for_timeout(300)
    check('during a quiz it refuses and changes nothing', pg.evaluate("window.__r") is False and pg.evaluate("REFRESH._lines.length") == 0)
    check('no page errors', not [e for e in errors if 'Unexpected token' not in e], errors[:3])
    ctx.close(); b.close()
print('PASS' if ok else 'FAILED'); sys.exit(0 if ok else 1)
