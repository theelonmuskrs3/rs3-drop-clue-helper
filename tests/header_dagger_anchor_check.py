"""Header dagger: every poison drip anchor (neon.css .nx-dds .d1-.d4, percent of the picture) sits on the underside edge of the
green blade in brand/dds.webp: opaque just above the point, transparent just below. python3 tests/header_dagger_anchor_check.py"""
import re, sys, pathlib
from PIL import Image
base = pathlib.Path(__file__).resolve().parent.parent
css = (base / 'neon.css').read_text()
im = Image.open(base / 'brand/dds.webp').convert('RGBA'); W, H = im.size; a = im.split()[3]
bad = []
for d in ('d1', 'd2', 'd3', 'd4'):
    m = re.search(r'\.nx-dds \.' + d + r'\{left:([\d.]+)%;top:([\d.]+)%', css)
    x, y = float(m[1]) / 100 * W, float(m[2]) / 100 * H
    above = max(a.getpixel((round(x), round(y) - k)) for k in (2, 3))
    below = max(a.getpixel((round(x) + dx, round(y) + k)) for k in (4, 5) for dx in (-1, 0, 1))
    r, g, b, _ = im.getpixel((round(x), round(y) - 3))
    ok = above > 200 and below < 40 and g > r and g > b   # on the green (poisoned) blade, at its lower edge
    print(d, f'({x:.0f},{y:.0f}) of {W}x{H}: above alpha {above}, below alpha {below}, colour {r},{g},{b}', 'OK' if ok else 'OFF EDGE')
    if not ok: bad.append(d)
assert W >= 288 and abs(W / H - 599 / 539) < .01, 'HD copy of File:Dragon dagger (p++) detail.png (599x539)'
sys.exit('FAIL ' + ' '.join(bad) if bad else 0)
