"""Real-browser check of the PIN app lock (needs Web Crypto, which jsdom lacks)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import *

srv, base = serve()
ok = True
def check(name, cond, extra=''):
    global ok
    print(('  ok  ' if cond else '  FAIL ') + name + (' ' + str(extra) if (extra and not cond) else ''))
    ok = ok and bool(cond)

with sync_playwright() as p:
    b = p.chromium.launch()
    r = Run(b, base, sw='block')
    pg = r.pg
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    pg.wait_for_function("document.getElementById('app') && document.getElementById('app').classList.contains('on')", timeout=20000) if False else None
    for _ in range(100):
        if pg.evaluate("!!window.ChapterData && document.getElementById('app').classList.contains('on')"): break
        pg.wait_for_timeout(200)

    check('off by default: no lock screen', pg.evaluate("!document.getElementById('applock')"))
    check('settings card shows setup', pg.evaluate("!document.getElementById('lock-setup').hidden"))

    # reject a short PIN and a mismatch, then enable
    pg.evaluate("document.getElementById('lock-pin-new').value='12'; document.getElementById('lock-pin-again').value='12'; APPLOCK.enable()")
    pg.wait_for_timeout(300)
    check('short PIN rejected', 'Use 4 to 6 digits' in pg.evaluate("document.getElementById('lock-msg').textContent"))
    pg.evaluate("document.getElementById('lock-pin-new').value='2468'; document.getElementById('lock-pin-again').value='1111'; APPLOCK.enable()")
    pg.wait_for_timeout(300)
    check('mismatch rejected', 'not the same' in pg.evaluate("document.getElementById('lock-msg').textContent"))
    pg.evaluate("document.getElementById('lock-pin-new').value='2468'; document.getElementById('lock-pin-again').value='2468'; APPLOCK.enable()")
    pg.wait_for_timeout(600)
    check('enabled', pg.evaluate("APPLOCK.enabled()"))
    stored = pg.evaluate("localStorage.getItem('abhyas_applock')")
    check('the PIN is never stored in plain text', '2468' not in stored and 'hash' in stored)
    check('card switched to the turn-off form', pg.evaluate("!document.getElementById('lock-off').hidden"))

    # background longer than the grace period locks; a short absence does not
    pg.evaluate("APPLOCK.GRACE_MS = 60000; Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    check('a short absence does not lock', pg.evaluate("!document.getElementById('applock')"))
    pg.evaluate("APPLOCK.GRACE_MS = 0; Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(20)
    pg.evaluate("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
    check('a long absence locks', pg.evaluate("!!document.getElementById('applock')"))
    check('the app behind is hidden from screen readers', pg.evaluate("document.getElementById('app').getAttribute('aria-hidden')") == 'true')

    # wrong then right PIN
    pg.fill('#applock-pin', '9999'); pg.click('#applock button'); pg.wait_for_timeout(500)
    check('wrong PIN keeps it locked and says so', pg.evaluate("!!document.getElementById('applock')") and 'Wrong PIN' in pg.evaluate("document.getElementById('applock-err').textContent"))
    pg.fill('#applock-pin', '2468'); pg.wait_for_timeout(800)
    check('right PIN unlocks', pg.evaluate("!document.getElementById('applock')"))
    check('and the app is readable again', pg.evaluate("document.getElementById('app').getAttribute('aria-hidden')") is None)

    # a fresh open asks for the PIN
    pg.reload(wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
    check('opening the app asks for the PIN', pg.evaluate("!!document.getElementById('applock')"))

    # five wrong tries => a wait
    for _ in range(5):
        pg.fill('#applock-pin', '0000'); pg.click('#applock button'); pg.wait_for_timeout(350)
    check('5 wrong tries trigger a wait', 'Too many' in pg.evaluate("document.getElementById('applock-err').textContent"))

    # turning it off needs the current PIN
    pg.evaluate("localStorage.getItem('abhyas_applock')")
    pg.evaluate("APPLOCK._coolUntil = 0; APPLOCK._unlock()")
    pg.evaluate("document.getElementById('lock-pin-current').value='1234'; APPLOCK.disable()"); pg.wait_for_timeout(500)
    check('turning off with a wrong PIN is refused', pg.evaluate("APPLOCK.enabled()"))
    pg.evaluate("document.getElementById('lock-pin-current').value='2468'; APPLOCK.disable()"); pg.wait_for_timeout(500)
    check('turning off with the right PIN works', not pg.evaluate("APPLOCK.enabled()"))
    errs = [e for e in r.errors if 'Failed to load resource' not in e[1]]
    check('no page errors', not errs, errs[:3])
    b.close()
print('PASS' if ok else 'FAILED'); sys.exit(0 if ok else 1)
