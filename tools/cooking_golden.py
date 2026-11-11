"""Wiki goldens for Calculator:Cooking (imported by tools/calc_cooking.py golden).

Each case is rendered by the live Wiki: {{Calculator:Skill calculators/Template|...}} -> Module:Skill calc. The run is refused
if any pinned page moved, and repeated if Module:GEPrices/data.json changed during it, so the stored prices are exactly the
ones the Wiki used. Form cases send what the app's port of MediaWiki:Gadget-calc-core.js submits; the hand-derived expected
submission must match it first.
"""
import json, os, subprocess, sys, time
from calc_cooking import ROOT, PIN, api, latest, content

def cell(td):
    return {'t': td.get_text(' ', strip=True), 's': td.get('data-sort-value'), 'c': td.get('class') or []}

def materials(td):
    # createList: " qty [img] Name<br />" lines; keep [qty, name] pairs in order
    out = []
    for a in td.find_all('a'):
        if a.find('img'): continue
        prev = a.find_previous(string=True)
        out.append(a.get_text())
    txt = td.get_text(' ', strip=True)
    return {'names': out, 'text': txt}

def parse(html):
    from bs4 import BeautifulSoup
    s = BeautifulSoup(html, 'html.parser')
    if 'scribunto-error' in html or s.find(class_='error'):
        err = s.find(class_='error') or s.find(class_='scribunto-error')
        return {'error': err.get_text(' ', strip=True) if err else 'error'}
    msg = s.find('div').get_text(' ', strip=True)
    t = s.find('table')
    trs = t.find_all('tr')
    head = [th.get_text(' ', strip=True) for th in trs[0].find_all('th')]
    rows = []
    for tr in trs[1:]:
        tds = tr.find_all('td', recursive=False)
        r = {'cls': tr.get('class') or [], 'cells': [cell(td) for td in tds]}
        if 'Materials' in head and len(tds) == len(head): r['mats'] = materials(tds[head.index('Materials')])
        r['ragged'] = len(tds) != len(head)
        r['link'] = (tds[1].find('a') or {}).get('title') if tds[1].find('a') else None
        rows.append(r)
    return {'message': msg, 'head': head, 'rows': rows}

def render(sub):
    text = '{{Calculator:Skill calculators/Template' + ''.join('|%s=%s' % (k, v) for k, v in sub) + '}}'
    j = api({'action': 'parse', 'prop': 'text', 'contentmodel': 'wikitext', 'disablelimitreport': '1', 'text': text}, post=True)
    return parse(j['parse']['text'])

def golden():
    cases = json.load(open(os.path.join(ROOT, 'tests', 'cooking-cases.json')))
    form = json.load(open(os.path.join(ROOT, 'tests', 'cooking-form-cases.json')))
    D = json.load(open(os.path.join(ROOT, 'data', 'calc', 'cooking.json')))
    for t, pin in PIN.items():
        lr = latest(t)[0]
        if lr != pin: sys.exit('%s is now at revision %s, pinned %s: re-read/port it first' % (t, lr, pin))
    subs = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'cooking_form.cjs')], capture_output=True, check=True).stdout)
    for c, s in zip(form['cases'], subs):
        got = [x for x in s['submission'] if x[0] != 'name']
        assert got == c['expected'] and not s['errors'], ('form emulation differs from the hand-derived gadget result', c['name'], got)
    for attempt in range(3):
        r1, ts1, prices_text = content('Module:GEPrices/data.json')
        out, fout = [], []
        for c in cases:
            res = render(list(c['args'].items())); res.update(name=c['name'], args=c['args']); out.append(res)
            print(c['name'], len(res.get('rows', [])), res.get('error', ''), file=sys.stderr); time.sleep(1)
        for c, s in zip(form['cases'], subs):
            res = render(s['submission']); res.update(name=c['name'], submission=s['submission']); fout.append(res)
            print('form', c['name'], len(res.get('rows', [])), file=sys.stderr); time.sleep(1)
        r2 = latest('Module:GEPrices/data.json')[0]
        if r1 == r2: break
        print('GEPrices changed during run (%s -> %s); retrying' % (r1, r2), file=sys.stderr)
    else: sys.exit('GEPrices kept changing')
    for t, pin in PIN.items(): assert latest(t)[0] == pin, t
    allp = json.loads(prices_text)
    names = set(D['ids'])
    prices = {n: allp[n] for n in sorted(names) if isinstance(allp.get(n), (int, float))}
    fx = {'generated': time.strftime('%Y-%m-%d %H:%M %Z'), 'gePricesRevision': r1, 'gePricesTimestamp': ts1, 'pins': PIN,
          'license': 'Rendered by the RuneScape Wiki (Calculator:Cooking, Module:Skill calc, Module:Skill calc/Cooking/data, Module:GEPrices/data.json); CC BY-NC-SA 3.0, https://runescape.wiki/w/RuneScape:Copyrights',
          'prices': prices, 'cases': out, 'formCases': fout}
    p = os.path.join(ROOT, 'tests', 'fixtures-cooking-golden.json')
    json.dump(fx, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('wrote', p, sum(len(c.get('rows', [])) for c in out + fout), 'rows in', len(out), '+', len(fout), 'form cases; GEPrices revision', r1)
