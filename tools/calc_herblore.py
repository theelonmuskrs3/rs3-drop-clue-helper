#!/usr/bin/env python3
"""Build data/calc/herblore.json and the Wiki golden fixtures for the native Calculator:Herblore.

  python3 tools/calc_herblore.py build    # pinned sources -> data/calc/herblore.json (Lua data converted in tools/lua_data_sandbox.py)
  python3 tools/calc_herblore.py golden   # render each case in tests/herblore-cases.json with the live Wiki module and save
                                          # tests/fixtures-herblore-golden.json together with the exact guide-price snapshot used

Sources are fetched by exact revision id from the RuneScape Wiki API (CC BY-NC-SA 3.0). The Wiki's Lua is never run
here; only the data module is evaluated, inside the sandbox. Golden renders are refused if the engine/data module
revision on the Wiki differs from the pinned one, or if Module:GEPrices/data.json changed during the run.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://runescape.wiki/api.php'
UA = 'DropClueHelper-calc-verify/1.0 (unofficial fan tool; github.com/theelonmuskrs3/rs3-drop-clue-helper)'
LUA_PY = '/workspace/.venv-lua/bin/python'
PIN = {   # page -> revision id used for this build
    'Calculator:Herblore': 37008978,
    'Calculator:Herblore/Template': None,
    'Module:Skill calc/Herblore': 36813069,
    'Module:Skill calc/Herblore/data': 37201040,
    'Module:Experience': 35948183,
    'Module:Experience/data': 35392677,
    'Module:Exchange': None,
    'Module:GEIDs/data.json': None,
}

def api(params, post=False):
    params = dict(params, format='json', formatversion='2')
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(API if post else API + '?' + data.decode(), data=data if post else None, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
        except Exception as e:
            if attempt == 3: raise
            time.sleep(3 * (attempt + 1))

def latest(title):
    p = api({'action': 'query', 'prop': 'revisions', 'titles': title, 'rvprop': 'ids|timestamp'})['query']['pages'][0]
    return p['revisions'][0]['revid'], p['revisions'][0]['timestamp']

def content(title, revid=None):
    q = {'action': 'query', 'prop': 'revisions', 'rvprop': 'ids|timestamp|content', 'rvslots': 'main'}
    if revid: q['revids'] = revid
    else: q['titles'] = title
    p = api(q)['query']['pages'][0]
    r = p['revisions'][0]
    return r['revid'], r['timestamp'], r['slots']['main']['content']

def sandbox_convert(src_text, name):
    path = '/tmp/' + re.sub(r'\W+', '_', name) + '.lua'
    open(path, 'w', encoding='utf-8').write(src_text)
    out = subprocess.run([LUA_PY, os.path.join(ROOT, 'tools', 'lua_data_sandbox.py'), path], capture_output=True, check=True)
    return json.loads(out.stdout)

def build():
    revs, srcs = {}, {}
    for t in ('Calculator:Herblore', 'Module:Skill calc/Herblore', 'Module:Skill calc/Herblore/data', 'Module:Experience/data', 'Module:Experience'):
        rid, ts, text = content(t, PIN[t])
        revs[t] = {'revid': rid, 'ts': ts, 'latest': latest(t)[0]}; srcs[t] = text
    data = sandbox_convert(srcs['Module:Skill calc/Herblore/data'], 'herblore_data')
    xp = sandbox_convert(srcs['Module:Experience/data'], 'experience_data')
    assert isinstance(xp, list) and len(xp) == 120 and xp[0] == 0 and xp[98] == 13034431
    gid_rev, gid_ts, gid_text = content('Module:GEIDs/data.json')
    gid = json.loads(gid_text); revs['Module:GEIDs/data.json'] = {'revid': gid_rev, 'ts': gid_ts}
    # Every name the engine can price at the Grand Exchange: materials, products, dose variants, flasks, containers, consumables.
    names = set()
    def walk(o):
        if isinstance(o, dict):
            for k in ('name', 'price_name', 'four_dose'):
                v = o.get(k)
                if isinstance(v, str) and o.get('price') in (None, 'gemw'):
                    names.add(v)
                    if re.search(r'\(\d\)$', v):
                        for d in (1, 2, 3, 4): names.add(re.sub(r'\(\d+\)$', '(%d)' % d, v))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk({k: v for k, v in data.items() if k not in ('item_category_table',)})
    for v in data['containers'].values(): names.add(v)
    ids = {n: gid[n] for n in sorted(names) if isinstance(gid.get(n), int)}
    out = {
        'path': '/w/Calculator:Herblore',
        'source': {k: v for k, v in revs.items()},
        'license': 'RuneScape Wiki, CC BY-NC-SA 3.0 (https://runescape.wiki/w/RuneScape:Copyrights). Formulas and data: Module:Skill calc/Herblore and Module:Skill calc/Herblore/data.',
        'xp': xp, 'ids': ids, 'data': data,
    }
    p = os.path.join(ROOT, 'data', 'calc', 'herblore.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print('wrote', p, os.path.getsize(p), 'bytes;', len(ids), 'GE ids;', {k: (v['revid'], v.get('latest')) for k, v in revs.items()})

# ---------- golden ----------
DEFAULTS = json.load(open(os.path.join(ROOT, 'tests', 'herblore-defaults.json'))) if os.path.exists(os.path.join(ROOT, 'tests', 'herblore-defaults.json')) else None
RENDER = {'show_item_image': 'false', 'show_currency_image': 'false', 'show_production_time': 'true', 'show_cost': 'true', 'show_profit': 'true', 'step_mode': 'Quantity', 'mat_mode': 'Price', 'product_mode': 'Price'}

def num(s):
    s = s.strip().replace(',', '').replace('\u2212', '-')
    if s in ('-', ''): return None
    return float(s)

def parse_table(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    msg = soup.find('p').get_text()
    tbl = soup.find('table', class_='wikitable')
    head = [th.get_text() for th in tbl.find('tr').find_all('th', recursive=False)]
    trs = tbl.find('tbody').find_all('tr', recursive=False) if tbl.find('tbody') else tbl.find_all('tr', recursive=False)
    rows = []
    for tr in trs[2:]:
        tds = tr.find_all('td', recursive=False); i = 0
        def nxt():
            nonlocal i; t = tds[i]; i += 1; return t
        def group(ncols):
            t = tds[i]
            if t.find('table'):
                nxt(); items = []
                for itr in t.find('table').find_all('tr'):
                    c = itr.find_all('td'); items.append([x.get_text() for x in c[:ncols]])
                return items
            if t.has_attr('colspan'):
                nxt(); return []
            return [[nxt().get_text() for _ in range(ncols)]]
        r = {}
        lv = nxt(); r['level'] = int(lv.get_text()); r['colour'] = [c for c in lv.get('class', []) if c.startswith('table-bg')]
        rc = nxt(); r['sort'] = rc.get('data-sort-value'); r['recipe'] = rc.get_text('|')
        x = nxt(); r['xp'] = float(x['data-sort-value']); r['xpText'] = x.get_text()
        n = nxt(); r['number'] = int(n.get('data-sort-value') or 0)
        tm = nxt(); r['ticks'] = int(tm.get('data-sort-value') or 0); r['timeText'] = tm.get_text()
        if 'Steps' in head: r['steps'] = [[a, num(b)] for a, b in group(2)]
        r['mats'] = [[a, num(b), num(c)] for a, b, c in group(3)]
        r['matTotal'] = num(nxt().get_text()); r['costPerXp'] = num(nxt().get_text())
        if 'Products' in head: r['products'] = [[a, num(b), num(c)] for a, b, c in group(3)]
        if 'Total value' in head:
            r['prodTotal'] = num(nxt().get_text()); r['profit'] = num(nxt().get_text()); r['profitPerXp'] = num(nxt().get_text())
        assert i == len(tds), (r, i, len(tds))
        rows.append(r)
    return msg, head, rows

def render(args):
    text = '{{Calculator:Herblore/Template|' + '|'.join('%s=%s' % (k, v) for k, v in args.items()) + '}}'
    j = api({'action': 'parse', 'prop': 'text', 'contentmodel': 'wikitext', 'disablelimitreport': '1', 'text': text}, post=True)
    return j['parse']['text']

def golden():
    defaults = json.load(open(os.path.join(ROOT, 'tests', 'herblore-defaults.json')))
    cases = json.load(open(os.path.join(ROOT, 'tests', 'herblore-cases.json')))
    D = json.load(open(os.path.join(ROOT, 'data', 'calc', 'herblore.json')))
    for t in ('Module:Skill calc/Herblore', 'Module:Skill calc/Herblore/data'):
        lr = latest(t)[0]
        if lr != D['source'][t]['revid']: sys.exit('Wiki %s is at revision %s, app data pinned %s: rebuild first' % (t, lr, D['source'][t]['revid']))
    for attempt in range(3):
        r1, ts1, prices_text = content('Module:GEPrices/data.json')
        out = []
        for c in cases:
            args = dict(defaults); args.update(c['args']); args.update(RENDER)
            html = render(args)
            msg, head, rows = parse_table(html)
            out.append({'name': c['name'], 'args': c['args'], 'message': msg, 'head': head, 'rows': rows})
            print(c['name'], len(rows), 'rows', file=sys.stderr)
            time.sleep(1)
        r2 = latest('Module:GEPrices/data.json')[0]
        if r1 == r2: break
        print('GEPrices changed during run (%s -> %s); retrying' % (r1, r2), file=sys.stderr)
    else: sys.exit('GEPrices kept changing')
    for t in ('Module:Skill calc/Herblore', 'Module:Skill calc/Herblore/data'):
        assert latest(t)[0] == D['source'][t]['revid']
    allp = json.loads(prices_text)
    want = set(D['ids'])
    for c in out:
        for r in c['rows']:
            for k in ('mats', 'products'):
                for l in r.get(k, []): want.add(l[0])
    prices = {n: allp[n] for n in sorted(want) if isinstance(allp.get(n), (int, float))}
    fx = {'generated': time.strftime('%Y-%m-%d %H:%M %Z'), 'gePricesRevision': r1, 'gePricesTimestamp': ts1,
          'engineRevision': D['source']['Module:Skill calc/Herblore']['revid'], 'dataRevision': D['source']['Module:Skill calc/Herblore/data']['revid'],
          'render': RENDER, 'prices': prices, 'cases': out}
    p = os.path.join(ROOT, 'tests', 'fixtures-herblore-golden.json')
    json.dump(fx, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('wrote', p, sum(len(c['rows']) for c in out), 'rows in', len(out), 'cases; GEPrices revision', r1)

if __name__ == '__main__':
    {'build': build, 'golden': golden}[sys.argv[1]]()
