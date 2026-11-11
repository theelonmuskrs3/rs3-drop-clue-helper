#!/usr/bin/env python3
"""Model check: every main-tab label word fits its tile (no clipped or split letters) at the widths parents check.

Uses the real Cinzel 700 glyph advances from fonts/cinzel-latin-700-normal.woff2 (needs fontTools + brotli) and the tab
geometry neon.css gives at each width (header padding, grid columns/spans, gap, button padding, font size, letter spacing).
This is arithmetic, not a browser: the real-browser check stays the gate. Exit 1 on any label word that does not fit.
"""
import os, sys
from fontTools.ttLib import TTFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = TTFont(ROOT + '/fonts/cinzel-latin-700-normal.woff2'); cmap = f.getBestCmap(); hm = f['hmtx']; upm = f['head'].unitsPerEm
def width(word, px, ls): return sum(hm[cmap[ord(c)]][0] for c in word) / upm * px + ls * px * len(word)
css = open(ROOT + '/neon.css').read()
for rule in ('.tabs{grid-template-columns:repeat(12,minmax(0,1fr));gap:5px}',
             '.tabs button{grid-column:span 3;font-size:10px;letter-spacing:.02em;padding:7px 2px 6px}',
             '.tabs button[data-tab=calculators],.tabs button[data-tab=map]{grid-column:span 6}',
             '.tabs button{font-size:9.5px;letter-spacing:.02em;padding-left:1px;padding-right:1px}'):
    assert rule in css, 'neon.css no longer has the rule this model assumes: ' + rule
LABELS = ['Monsters', 'Items', 'Grand Exchange', 'Character', 'Clues', 'Quests', 'Training', 'Money', 'Calculators', 'Map']
WIDE = ('Calculators', 'Map')
def geometry(vw):
    pad = 8 if vw <= 420 else 12 if vw <= 560 else 18 if vw <= 1000 else 16
    W = min(vw - 2 * pad, 1180)
    if vw <= 479:
        gap = 4 if vw <= 360 else 5; px, ls = (9.5, .02) if vw <= 360 else (10, .02)
        col = (W - 11 * gap) / 12
        return {l: col * (6 if l in WIDE else 3) + gap * (5 if l in WIDE else 2) for l in LABELS}, px, ls, (1 if vw <= 360 else 2), True
    if vw <= 699: gap, px, ls, bpad, cols = 5, 9.5, .02, 1, 5
    elif vw <= 779: gap, px, ls, bpad, cols = 6, 11, .04, 2, 5
    else: gap, px, ls, bpad, cols = 4, 10, .02, 1, 5
    return {l: (W - (cols - 1) * gap) / cols for l in LABELS}, px, ls, bpad, False
bad = []
# Widths above 1000px use the row layout (icon beside label) that this model does not reproduce; they are left to the
# real-browser check (parent reported 1280px tiles fine), so the model only gates phone/tablet widths.
for vw in (320, 340, 360, 375, 390, 414, 430, 479, 480, 560, 600, 699, 700, 779, 780, 800, 1000):
    tile, px, ls, bpad, short = geometry(vw); worst = None
    for l in LABELS:
        text = 'Calcs' if (short and l == 'Calculators') else l
        inner = tile[l] - 2 * bpad - 2   # 1px border each side
        for word in text.upper().split():
            need = width(word, px, ls); spare = inner - need
            if worst is None or spare < worst[0]: worst = (spare, word, need, inner)
            if spare < 2: bad.append((vw, word, round(need, 1), round(inner, 1)))
    print('%5dpx tightest %-11s needs %5.1fpx of %5.1fpx (spare %.1f)' % (vw, worst[1], worst[2], worst[3], worst[0]))
if bad: print('DOES NOT FIT:', bad); sys.exit(1)
print('nav_fit_check: every tab word fits with >=2px to spare at all checked widths')
