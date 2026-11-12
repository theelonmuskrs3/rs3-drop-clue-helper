#!/usr/bin/env python3
"""Rebuild data/calc/herblore-potions.json and its golden fixture from the RuneScape Wiki public API.
Source: Calculator:Herblore/Potions, section "Making from clean herbs" (rows {{/t|...}} = Module:Herb calc row, plus the
page's hand-written Sanfew serum row), Module:GEIDs/data.json, Module:GEPrices/data.json, and the Wiki's own rendering
(action=parse). Fails if Module:Herb calc row changed since verification (tests/herb-calc-row-module.txt), if the Sanfew row
changed, if a priced item has no GE ID, or if the guide prices changed during the run.
Usage: python3 tools/calc_herblore_potions.py   (writes only the two files below)"""
import json, re, urllib.parse, urllib.request, html, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
UA = {'User-Agent': 'rs3-drop-clue-helper calculator port (github.com/theelonmuskrs3)'}
MODULE = open(ROOT / 'tests' / 'herb-calc-row-module.txt').read().strip()
def api(**p):
    p.update(format='json', formatversion=2)
    return json.load(urllib.request.urlopen(urllib.request.Request('https://runescape.wiki/api.php', data=urllib.parse.urlencode(p).encode(), headers=UA)))
def page(t):
    rv = api(action='query', prop='revisions', rvprop='content|ids|timestamp', rvslots='main', titles=t)['query']['pages'][0]['revisions'][0]
    return rv['slots']['main']['content'], rv['revid'], rv['timestamp']
TITLE = 'Calculator:Herblore/Potions'
src, rev, ts = page(TITLE)
mod, mrev, mts = page('Module:Herb calc row')
if mod.strip() != MODULE: sys.exit('Module:Herb calc row changed since verification: re-read it and update calculators.js potionProfit first.')
ids_text, idsrev, _ = page('Module:GEIDs/data.json'); ids = json.loads(ids_text)
pr_text, prrev, prts = page('Module:GEPrices/data.json'); guide = json.loads(pr_text)
sec_src = src[src.index('==Making from clean herbs=='):src.index('|}', src.index('==Making from clean herbs=='))]
rendered = api(action='parse', text=sec_src + '\n|}\n<references/>', title=TITLE, prop='text', contentmodel='wikitext', disablelimitreport=1)['parse']['text']
if page('Module:GEPrices/data.json')[1] != prrev: sys.exit('Guide prices changed during the check; run again.')
SANFEW = ("{{#vardefineecho:sanf|{{#expr:{{GEP|Sanfew serum (3)}} -{{GEP|Super restore (3)}} -{{GEP|Unicorn horn dust}} -{{GEP|Nail beast nails}}}}}}")
if SANFEW not in sec_src: sys.exit('Sanfew serum row changed since verification.')
def item(n, nv=False, img=None, q=1, txt=None):
    d = dict(n=n)
    if txt and txt != n: d['txt'] = txt
    if img and img != n: d['img'] = img
    if q != 1: d['q'] = q
    if nv: d['nv'] = True
    elif n not in ids: sys.exit('No GE ID for ' + n)
    else: d['id'] = ids[n]
    return d
rows = []
for m in re.finditer(r'\{\{/t\|(.*?)\}\}|<!-- Sanfew serum -->', sec_src, re.S):
    if not m.group(1):   # the page's hand-written row: Super restore (3) base, Unicorn horn dust + (untradeable) Snake weed, no SoC effect shown
        rows.append(dict(pot=item('Sanfew serum (3)', txt='Sanfew serum'), lv=65, xp=192, vial=dict(item('Super restore (3)'), ref=True),
                         herb=[item('Unicorn horn dust'), item('Clean snake weed', nv=True, txt='Snake weed')],
                         unf=[item('Mixture - step 1', nv=True, img='Mixture - step 1 (3)'), item('Mixture - step 2', nv=True, img='Mixture - step 2 (3)')],
                         sec=item('Nail beast nails'), soc=1, socNote=False, manual=True)); continue
    a = dict(kv.split('=', 1) for kv in m.group(1).split('|'))
    hc = lambda k: bool(a.get(k, '').strip())
    pot = a.get('potname') or (a.get('pot', '') + ' (3)')
    herbsort = (a.get('herbname') or a.get('herb', ''))
    herbsort = herbsort[:1].upper() + herbsort[1:]
    herb = a.get('herbname') or 'Clean ' + a.get('herb', '')
    unf = a.get('unf') or herbsort + ' potion (unfinished)'
    vial = a.get('vial') or 'Vial of water'
    r = dict(pot=item(pot, hc('potnv'), a.get('potimg'), int(a.get('potqty') or 1)), lv=float(a['lv']), xp=float(a['xp']),
             vial=dict(item(vial), **({'ref': True} if hc('vial') else {})),
             herb=[item(herb, hc('herbnv'), a.get('herbimg'), txt=herbsort)],
             unf=[] if unf == 'no' else [item(unf, hc('unfnv'), a.get('unfimg'))],
             sec=item(a['sec'], hc('secnv'), a.get('secimg'), int(a.get('secqty') or 1)), soc=int(a.get('soc') or 0))
    for k in ('lv', 'xp'): r[k] = int(r[k]) if r[k] == int(r[k]) else r[k]
    rows.append(r)
priced = sorted({x['n'] for r in rows for x in [r['pot'], r['vial'], r['sec'], *r['herb'], *r['unf']] if not x.get('nv')})
out = dict(id='herblore-potions', title='Potion making', wikiPage=TITLE, section='Making from clean herbs', path='/w/Calculator:Herblore/Potions',
           source=dict(pageRevision=rev, pageRevisionTimestamp=ts, rowModule='Module:Herb calc row', rowModuleRevision=mrev, rowModuleRevisionTimestamp=mts,
                       itemIds='Module:GEIDs/data.json', itemIdsRevision=idsrev, license='CC BY-NC-SA 3.0 (RuneScape Wiki)'), rows=rows)
# Wiki's own rendering: 14 cells per row, data-sort-value of each
golden = []
for tr in re.findall(r'<tr>(.*?)</tr>', rendered, re.S):
    tds = re.findall(r'<td([^>]*)>', tr)
    if len(tds) != 14: continue
    sv = [html.unescape(re.search(r'data-sort-value="([^"]*)"', t).group(1)) for t in tds]
    cells = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
    shown = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<sup.*?</sup>', '', c)))).strip() for c in cells]
    golden.append(dict(pot=sv[0], lv=sv[1], xp=sv[2], herb=sv[4], unf=sv[6], sec=sv[8], ge=sv[9], profit=sv[10], perXp=sv[11], soc=sv[12], socPerXp=sv[13],
                       shown=dict(profit=shown[10], perXp=shown[11], soc=shown[12], socPerXp=shown[13])))
assert len(golden) == len(rows), (len(golden), len(rows))
for g, r in zip(golden, rows): assert g['pot'] == r['pot'].get('txt', r['pot']['n']), (g['pot'], r['pot']['n'])
fx = dict(source=dict(page=TITLE, pageRevision=rev, guidePrices='Module:GEPrices/data.json', guidePricesRevision=prrev, guidePricesTimestamp=prts,
                      note='Wiki-rendered data-sort-values of every row (action=parse of the section at the guide-price revision above).'),
          guide={n: guide.get(n) for n in priced}, rows=golden)
(ROOT / 'data/calc/herblore-potions.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
(ROOT / 'tests/fixtures-herblore-potions-golden.json').write_text(json.dumps(fx, ensure_ascii=False, indent=1) + '\n')
print(f'{len(rows)} rows, {len(priced)} priced items; page rev {rev}, module rev {mrev}, GEPrices rev {prrev} ({prts})')
