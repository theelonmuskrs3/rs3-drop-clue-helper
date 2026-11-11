#!/usr/bin/env python3
"""Check (no writes): the Wiki's Flask decanting calculator prices = Module:GEPrices/data.json (Jagex Grand Exchange guide
prices), and the public Weird Gloop exchange API (api.weirdgloop.org/exchange, CORS *) returns the same guide price for every
item ID the calculator uses; then reproduce every Wiki-rendered cell from the Weird Gloop prices (gross, no tax, as the Wiki).
Usage: python3 tools/flask_guide_source_check.py [MISSING_JSON]  (MISSING_JSON: {name: id} of items with no RS Wiki Prices trade)"""
import json, re, html, sys, urllib.parse, urllib.request, urllib.error, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
UA = {'User-Agent': 'rs3-drop-clue-helper calculator check (github.com/theelonmuskrs3)'}
def get(url, data=None):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=60))
        except urllib.error.HTTPError as e:
            if e.code < 500 or a == 3: raise
            __import__('time').sleep(2 * (a + 1))
def api(**p): p.update(format='json', formatversion=2); return get('https://runescape.wiki/api.php', urllib.parse.urlencode(p).encode())
def page(t):
    rv = api(action='query', prop='revisions', rvprop='content|ids|timestamp', rvslots='main', titles=t)['query']['pages'][0]['revisions'][0]
    return rv['slots']['main']['content'], rv['revid'], rv['timestamp']
D = json.load(open(ROOT / 'data/calc/flask-decanting.json'))
items = {D['flask']['n']: D['flask']['id']}
for r in D['rows']:
    for k in ('f6', 'v1', 'v2', 'v3', 'v4'): items[r[k]['n']] = r[k]['id']
src, rev, _ = page(D['wikiPage'])
gtxt, grev, gts = page('Module:GEPrices/data.json'); G = json.loads(gtxt)
rendered = api(action='parse', text=src, title=D['wikiPage'], prop='text', contentmodel='wikitext', disablelimitreport=1)['parse']['text']
ids = list(items.values()); W = {}
for i in range(0, len(ids), 100): W.update(get('https://api.weirdgloop.org/exchange/history/rs/latest?id=' + '|'.join(map(str, ids[i:i + 100]))))
wp = {n: (W.get(str(i)) or {}).get('price') for n, i in items.items()}
wts = sorted({(W.get(str(i)) or {}).get('timestamp') for i in ids} - {None})
diff = {n: (G.get(n), wp[n]) for n in items if G.get(n) != wp[n]}
print(f'page rev {rev}; Module:GEPrices/data.json rev {grev} ({gts}); Weird Gloop timestamps {wts}')
print(f'{len(items)} items: Weird Gloop guide price == Module:GEPrices for {len(items) - len(diff)}; differ {len(diff)} {list(diff.items())[:6]}')
golden = []
for tr in re.findall(r'<tr>(.*?)</tr>', rendered, re.S):
    vals = re.findall(r'data-sort-value="([^"]*)"', tr); name = re.search(r'title="([^"]+)"', tr)
    if len(vals) == 4: golden.append((html.unescape(name.group(1)), [float(x) for x in vals]))
ok = bad = 0; badl = []
for r, (gn, gv) in zip(D['rows'], golden):
    assert gn == r['flask']
    for c, v in zip(D['columns'], gv):
        x = c['flasks'] * wp[r['f6']['n']] - c['vials'] * wp[r['v%d' % c['dose']]['n']] - c['flasks'] * wp['Potion flask']
        if x == v: ok += 1
        else: bad += 1; badl.append((r['flask'], c['key'], x, v))
print(f'Wiki-rendered cells reproduced from Weird Gloop guide prices: {ok}/{ok + bad}; mismatches {badl[:6]}')
if len(sys.argv) > 1:
    M = json.load(open(sys.argv[1]))
    print('items with no RS Wiki Prices trade -> guide price (Weird Gloop | Module:GEPrices):', {n: (wp[n], G.get(n), (W.get(str(i)) or {}).get('timestamp')) for n, i in M.items()})
    for r, (gn, gv) in zip(D['rows'], golden):
        for c, v in zip(D['columns'], gv):
            used = [r['f6']['n'], r['v%d' % c['dose']]['n'], 'Potion flask']
            if any(u in M for u in used): print(f"  affected {r['flask']} {c['key']}: Wiki {int(v)} | from Weird Gloop {c['flasks'] * wp[used[0]] - c['vials'] * wp[used[1]] - c['flasks'] * wp[used[2]]}")
sys.exit(1 if diff or bad else 0)
