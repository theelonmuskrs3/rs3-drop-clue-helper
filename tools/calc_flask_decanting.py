#!/usr/bin/env python3
"""Rebuild data/calc/flask-decanting.json and the golden fixture from the RuneScape Wiki public API.
Reads: Calculator:Herblore/Flask decanting (+ /row), Module:GEIDs/data.json, Module:GEPrices/data.json, and the
Wiki's own rendering of the page (action=parse). Fails if the row template formula changed (re-verify by hand),
if any item has no GE ID, or if our arithmetic does not reproduce every Wiki-rendered cell.
Usage: python3 tools/calc_flask_decanting.py   (writes only the two files below)"""
import json, re, urllib.parse, urllib.request, html, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
UA = {'User-Agent': 'rs3-drop-clue-helper calculator port (github.com/theelonmuskrs3)'}
ROW_FORMULA = open(ROOT / 'tests' / 'flask-decanting-row-template.txt').read().strip()
def api(**p):
    p.update(format='json', formatversion=2)
    return json.load(urllib.request.urlopen(urllib.request.Request('https://runescape.wiki/api.php', data=urllib.parse.urlencode(p).encode(), headers=UA)))
def page(t):
    rv = api(action='query', prop='revisions', rvprop='content|ids|timestamp', rvslots='main', titles=t)['query']['pages'][0]['revisions'][0]
    return rv['slots']['main']['content'], rv['revid'], rv['timestamp']
src, rev, ts = page('Calculator:Herblore/Flask decanting')
row, rrev, rts = page('Calculator:Herblore/Flask decanting/row')
if row.strip() != ROW_FORMULA: sys.exit('Row template changed since verification: re-read it and update calculators.js flaskModel first.')
ids = json.loads(page('Module:GEIDs/data.json')[0]); idsrev = page('Module:GEIDs/data.json')[1]
pr_text, prrev, _ = page('Module:GEPrices/data.json'); guide = json.loads(pr_text)
rendered = api(action='parse', text=src, title='Calculator:Herblore/Flask decanting', prop='text', contentmodel='wikitext', disablelimitreport=1)['parse']['text']
if page('Module:GEPrices/data.json')[1] != prrev: sys.exit('Guide prices changed during the check; run again.')
rows = re.findall(r'\{\{/row\|flask=([^|]+)\|vial=([^}]+)\}\}', src)
cols = [dict(key='d1', label='Decanting 6 (1)s into 1 flask', dose=1, vials=6, flasks=1), dict(key='d2', label='Decanting 3 (2)s into 1 flask', dose=2, vials=3, flasks=1),
        dict(key='d3', label='Decanting 4 (3)s into 2 flasks', dose=3, vials=4, flasks=2), dict(key='d4', label='Decanting 3 (4)s into 2 flasks', dose=4, vials=3, flasks=2)]
out = dict(id='flask-decanting', title='Flask decanting', wikiPage='Calculator:Herblore/Flask decanting', path='/w/Calculator:Herblore/Flask_decanting',
           source=dict(pageRevision=rev, pageRevisionTimestamp=ts, rowTemplate='Calculator:Herblore/Flask decanting/row', rowTemplateRevision=rrev, rowTemplateRevisionTimestamp=rts,
                       itemIds='Module:GEIDs/data.json', itemIdsRevision=idsrev, mechanics='Potion flask (revision 37196221)', license='CC BY-NC-SA 3.0 (RuneScape Wiki)'),
           flask=dict(n='Potion flask', id=ids['Potion flask']), columns=cols, rows=[])
for f, v in rows:
    r = dict(flask=f, vial=v, f6=dict(n=f + ' (6)', id=ids[f + ' (6)']))
    for d in (1, 2, 3, 4): r['v%d' % d] = dict(n=f'{v} ({d})', id=ids[f'{v} ({d})'])
    out['rows'].append(r)
golden = []
for tr in re.findall(r'<tr>(.*?)</tr>', rendered, re.S):
    vals = re.findall(r'data-sort-value="([^"]*)"', tr); name = re.search(r'title="([^"]+)"', tr)
    if len(vals) == 4: golden.append(dict(flask=html.unescape(name.group(1)), values=[float(x) for x in vals]))
assert len(golden) == len(out['rows'])
g = guide
for r, gr in zip(out['rows'], golden):
    F = g[r['f6']['n']]; P = g['Potion flask']
    calc = [c['flasks'] * F - c['vials'] * g[r['v%d' % c['dose']]['n']] - c['flasks'] * P for c in cols]
    assert gr['flask'] == r['flask'] and calc == gr['values'], (r['flask'], calc, gr['values'])
names = sorted({'Potion flask'} | {x['n'] for r in out['rows'] for x in r.values() if isinstance(x, dict)})
(ROOT / 'data/calc/flask-decanting.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
(ROOT / 'tests/fixtures-flask-decanting-golden.json').write_text(json.dumps(dict(
    note=f'Wiki-rendered Calculator:Herblore/Flask decanting (rev {rev}, row rev {rrev}) with Module:GEPrices/data.json rev {prrev}; guide prices for exactly the items used.',
    gePricesRevision=prrev, guide={n: g[n] for n in names}, rows=golden), indent=1, ensure_ascii=False))
print(f'OK {len(out["rows"])} rows, {4 * len(golden)} cells reproduced; page rev {rev}, row rev {rrev}, GEPrices rev {prrev}')
