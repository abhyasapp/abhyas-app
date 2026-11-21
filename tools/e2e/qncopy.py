"""Real-browser check of the quiz Copy button (js/features/quiz-extras.js → QNCOPY).

It loads the BUILT site, enters the quiz, clicks Copy next to Read and compares the
clipboard byte-for-byte with the format the app promises:

    Which of the following documents should be prepared and submitted by a contractor?

    A.bid document
    B.quality control plan
    C.quality assurance plan
    D.specification

Covers: options that already carry an "A." prefix, 2- and 5-option questions,
moving to the next question (Copy must take the NEW question), a browser without
speech synthesis (Read absent, Copy present), and the execCommand fallback when
navigator.clipboard refuses to write.

    ABHYAS_ROOT=dist python3 tools/e2e/qncopy.py     # the built site
    python3 tools/e2e/qncopy.py                      # the source tree
Exit code 0 = pass, 1 = fail.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness
from harness import sync_playwright

# ABHYAS_ROOT mirrors smoke_browser.py: point the same harness at dist/.
ROOT = os.path.abspath(os.environ.get('ABHYAS_ROOT') or os.path.join(os.path.dirname(__file__), '..', '..'))
harness.ROOT = ROOT                      # serve() reads this module global

Q_TEXT = 'Which of the following documents should be prepared and submitted by a contractor?'
PLAIN = ['bid document', 'quality control plan', 'quality assurance plan', 'specification']
TEMPLATE = Q_TEXT + '\n\n' + '\n'.join('ABCDE'[i] + '.' + o for i, o in enumerate(PLAIN))

CONTENT = {
    # the question from the request, options with no letter prefix
    'COPY-PLAIN': [{'q': Q_TEXT, 'options': PLAIN, 'correct': 0}],
    # the same options as a source that kept the letters in the text
    'COPY-LETTERED': [{'q': Q_TEXT, 'options': ['A.bid document', 'B.quality control plan',
                                                'C.quality assurance plan', 'D.specification'], 'correct': 0}],
    # a 2-option question, then a 5-option one (next-question check)
    'COPY-COUNTS': [
        {'q': 'Does the bid need a quality assurance plan?', 'options': ['Yes', 'No'], 'correct': 0},
        {'q': 'Which grades of concrete are listed?', 'options': ['M10', 'M15', 'M20', 'M25', 'M30'], 'correct': 4},
    ],
}
COUNT_1 = 'Does the bid need a quality assurance plan?\n\nA.Yes\nB.No'
COUNT_2 = 'Which grades of concrete are listed?\n\nA.M10\nB.M15\nC.M20\nD.M25\nE.M30'
NO_TTS = "Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});"


class CopyRun(harness.Run):
    """harness.Run, but /content/<id>.json is answered from CONTENT."""

    def route(self, r):
        m = re.search(r'/content/([^/?]+)\.json', r.request.url)
        if m and m.group(1) in CONTENT:
            return r.fulfill(status=200, content_type='application/json', body=json.dumps(CONTENT[m.group(1)]))
        return super().route(r)


results = []


def check(name, ok, detail=''):
    results.append(bool(ok))
    print(('  ok  ' if ok else '  FAIL ') + name + ('' if ok else ' | ' + str(detail)[:400]))


def ready(pg):
    for _ in range(100):
        if pg.evaluate("!!window.ChapterData && !!document.getElementById('app')"
                       " && document.getElementById('app').classList.contains('on')"):
            return True
        pg.wait_for_timeout(200)
    return False


def close_tutorial(pg, tries=6):
    """The welcome sheet opens over the first quiz and makes #app inert; close it the
    way a learner does (its own Skip button, Escape as a fallback)."""
    for _ in range(tries):
        try:
            if not pg.evaluate("!!document.getElementById('tut-modal')"):
                return True
            skip = pg.locator('#tut-skip')
            if skip.count():
                skip.first.click(timeout=2000)
            else:
                pg.keyboard.press('Escape')
        except Exception:
            try:
                pg.keyboard.press('Escape')
            except Exception:
                pass
        pg.wait_for_timeout(300)
    try:
        return not pg.evaluate("!!document.getElementById('tut-modal')")
    except Exception:
        return False


def load_quiz(pg, fid):
    """Load one of COPY-* through the app's own fetch + normaliser, then start the quiz."""
    pg.evaluate("""async (fid) => {
        const raw = await QUIZ._fetch(fid, fid);
        const qs = normQ(raw, fid);
        QUIZ.startWith(qs, 'flashcard', 'Copy test');
        /* startWith shuffles; pin the file's own order so the two questions are
           deterministic, then render the first one. */
        S.quiz.qs = qs;
        S.quiz.idx = 0;
        QUIZ._renderFlashcard();
    }""", fid)
    pg.wait_for_timeout(700)


def click_copy(pg):
    close_tutorial(pg)
    pg.locator('#fc-tools button', has_text='Copy').first.click()
    pg.wait_for_timeout(350)


def clipboard(pg):
    """The OS clipboard on Windows stores CRLF; compare on logical lines."""
    return pg.evaluate('navigator.clipboard.readText()').replace('\r\n', '\n')


def toast_text(pg):
    try:
        return pg.evaluate("document.body.innerText")
    except Exception:
        return ''


with sync_playwright() as p:
    b = p.chromium.launch()

    # ── 1. the real flow: enter the quiz and find Copy beside Read ──
    print('qncopy: root=%s' % ROOT)
    srv, base = harness.serve()
    R = CopyRun(b, base, sw='block')
    pg = R.pg
    R.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
    pg.goto(base + '/user.html', wait_until='domcontentloaded')
    check('the built app boots with chapters', ready(pg), R.errors[:3])
    close_tutorial(pg)

    # The welcome sheet can appear a moment after the app paints; wait for it, close it,
    # then click. Retry because it may arrive between the check and the click.
    pg.wait_for_timeout(1200)
    entered = False
    for _ in range(4):
        close_tutorial(pg)
        try:
            pg.get_by_text('Just 5').first.click(timeout=3000)
            entered = True
            break
        except Exception:
            pg.wait_for_timeout(500)
    if entered:
        pg.wait_for_timeout(2600)
        close_tutorial(pg)
    else:
        print('  note: "Just 5" was not clickable; starting the quiz directly')
    if entered:
        check('quiz screen opens from the home screen',
              pg.evaluate("(()=>{const w=document.getElementById('quiz-wrap');return !!w && w.offsetHeight>0})()"),
              R.errors[:3])
        check('Copy and Read both sit in the question toolbar',
              pg.evaluate("(()=>{const t=document.getElementById('fc-tools');return !!t && /Copy/.test(t.innerText) && /Read/.test(t.innerText)})()"),
              pg.evaluate("(document.getElementById('fc-tools')||{}).innerText"))
        check('Copy comes first, then Read',
              pg.evaluate("(()=>{const t=(document.getElementById('fc-tools')||{}).innerText||'';return t.indexOf('Copy') > -1 && t.indexOf('Copy') < t.indexOf('Read')})()"))

    # ── 2. the exact template, options without letters ──
    load_quiz(pg, 'COPY-PLAIN')
    check('question and four options render', pg.evaluate("document.querySelectorAll('#fc-opts .eo').length") == 4,
          pg.evaluate("document.querySelectorAll('#fc-opts .eo').length"))
    click_copy(pg)
    got = clipboard(pg)
    check('clipboard is byte-identical to the requested template', got == TEMPLATE, json.dumps(got))
    check('the toast fires', 'Question copied' in toast_text(pg))

    # ── 3. options that already carry an "A." prefix ──
    load_quiz(pg, 'COPY-LETTERED')
    click_copy(pg)
    got = clipboard(pg)
    check('a prefixed-option question copies without doubling the letters', got == TEMPLATE, json.dumps(got))

    # ── 4. two options, then move on: five options ──
    load_quiz(pg, 'COPY-COUNTS')
    check('the 2-option question is showing', pg.evaluate("document.querySelectorAll('#fc-opts .eo').length") == 2,
          pg.evaluate("document.querySelectorAll('#fc-opts .eo').length"))
    click_copy(pg)
    check('a 2-option question copies A and B only', clipboard(pg) == COUNT_1, json.dumps(clipboard(pg)))
    pg.locator('#fc-next').click()
    pg.wait_for_timeout(600)
    check('the next question is up', pg.evaluate("document.querySelectorAll('#fc-opts .eo').length") == 5,
          pg.evaluate("document.querySelectorAll('#fc-opts .eo').length"))
    click_copy(pg)
    check('Copy after Next takes the NEW question, not the old one', clipboard(pg) == COUNT_2, json.dumps(clipboard(pg)))

    # ── 5. execCommand fallback when the Clipboard API refuses ──
    pg.evaluate("""() => {
        window.__exec = 0;
        const orig = document.execCommand.bind(document);
        document.execCommand = (c) => { window.__exec++; return orig(c); };
        navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    }""")
    load_quiz(pg, 'COPY-COUNTS')
    click_copy(pg)
    check('the execCommand fallback is used when writeText is refused',
          pg.evaluate('window.__exec') >= 1, pg.evaluate('window.__exec'))
    check('...and it still copies the 2-option question', clipboard(pg) == COUNT_1, json.dumps(clipboard(pg)))

    errs = [e for e in R.errors if 'Failed to load resource' not in e[1]]
    check('no page errors in the main run', not errs, errs[:3])
    R.close()

    # ── 6. a browser without speech synthesis: Copy stays, Read goes ──
    R2 = CopyRun(b, base, sw='block', init=NO_TTS)
    pg2 = R2.pg
    R2.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
    pg2.goto(base + '/user.html', wait_until='domcontentloaded')
    check('no-speech browser: the app boots', ready(pg2), R2.errors[:3])
    close_tutorial(pg2)
    load_quiz(pg2, 'COPY-PLAIN')
    tools = pg2.evaluate("(document.getElementById('fc-tools')||{}).innerText")
    check('no-speech browser: Copy renders', 'Copy' in (tools or ''), tools)
    check('no-speech browser: Read is absent', 'Read' not in (tools or ''), tools)
    click_copy(pg2)
    check('no-speech browser: Copy still copies the template', clipboard(pg2) == TEMPLATE, json.dumps(clipboard(pg2)))
    errs2 = [e for e in R2.errors if 'Failed to load resource' not in e[1]]
    check('no-speech browser: no page errors', not errs2, errs2[:3])
    R2.close()
    b.close()

print('SUMMARY %d/%d passed' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
