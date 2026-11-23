"""Capture every student screen as a PNG, for before/after review of a UI change.

    python tools/e2e/shots.py light 390
    python tools/e2e/shots.py dark 390
    python tools/e2e/shots.py light 1280

Boots the real app over HTTP with the backend/CDN mocked (tools/e2e/harness.py),
walks every .view the page declares, and writes shots/v264/<theme>-<width>-<view>.png.
The folder is git-ignored on purpose: it is a review aid, not app content.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

srv, base = serve()
theme = sys.argv[1] if len(sys.argv) > 1 else 'light'
width = int(sys.argv[2]) if len(sys.argv) > 2 else 390
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = os.path.join(root, 'shots', 'v264')
os.makedirs(out, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    R = Run(b, base, width=width, height=844 if width < 700 else 900, theme=theme)
    pg = R.pg
    pg.goto(base + '/user.html')
    pg.wait_for_timeout(3500)
    pg.keyboard.press('Escape')          # dismiss the welcome tour so it cannot cover a screen
    pg.wait_for_timeout(300)
    views = pg.evaluate("[...document.querySelectorAll('.view')].map(v=>v.id.replace('view-',''))")
    n = 0
    for v in views:
        pg.evaluate("UI.go('%s')" % v)
        pg.wait_for_timeout(700)
        path = os.path.join(out, '%s-%d-%s.png' % (theme, width, v))
        pg.screenshot(path=path, full_page=True)
        n += 1
    b.close()
print('captured %d screens into %s' % (n, os.path.relpath(out, root)))
