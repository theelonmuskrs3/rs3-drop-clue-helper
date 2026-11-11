#!/usr/bin/env python3
"""Build data/calc/cooking.json and the Wiki golden fixtures for the native Calculator:Cooking.

  python3 tools/calc_cooking.py build    # pinned sources -> data/calc/cooking.json
  python3 tools/calc_cooking.py golden   # render tests/cooking-cases.json and tests/cooking-form-cases.json with the live Wiki
                                         # (Calculator:Skill calculators/Template -> Module:Skill calc) and save
                                         # tests/fixtures-cooking-golden.json with the exact guide-price snapshot used

Calculator:Cooking is a generic RuneScape Wiki skill calculator: the form (Module:Form calculator / MediaWiki:Gadget-calc-core.js)
submits to Calculator:Skill calculators/Template = {{#invoke:Skill calc|noValue}}, whose engine (Module:Skill calc with
Module:Skill calc/bonusGenerator and /eltGenerator) runs on Module:Skill calc/Cooking/data. The app's engine is a port of that
shared module (RS3Calc.skillCalcRun). Sources are fetched by exact revision id (CC BY-NC-SA 3.0). The Wiki's Lua is never run
here unrestricted: only the data module is evaluated, inside tools/lua_data_sandbox.py (it returns a function of the
sub-category, so it is called there per sub-category, and the engine's own sortTable, copied verbatim from the pinned
Module:Skill calc, orders the rows inside the same sandbox). Goldens are refused if any pinned module moved on the Wiki or if
Module:GEPrices/data.json changed during the run.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://runescape.wiki/api.php'
UA = 'DropClueHelper-calc-verify/1.0 (unofficial fan tool; github.com/theelonmuskrs3/rs3-drop-clue-helper)'
LUA_PY = '/workspace/.venv-lua/bin/python'
PIN = {   # page -> revision id used for this build (engine pages are read and ported by hand; re-read on any change)
    'Calculator:Cooking': 37078013,
    'Calculator:Skill calculators/Template': 31389646,
    'Module:Skill calc': 37183472,
    'Module:Skill calc/bonusGenerator': 37061127,
    'Module:Skill calc/eltGenerator': 37078757,
    'Module:Skill calc/elts': 37076682,
    'Module:Skill calc/Cooking/data': 37177236,
    'Module:Experience': 35948183,
    'Module:Experience/data': 35392677,
    'Module:GEPHelper': 37167515,
    'Module:Exchange': 36854725,
    'Module:Yesno': 36922715,
    'Module:Number': 37167431,
    'Module:Arguments': 37167395,
    'Module:Form calculator': 37167622,
    'MediaWiki:Gadget-calc-core.js': 37082305,
}
ENGINE_PAGES = [k for k in PIN if k not in ('Module:Skill calc/Cooking/data',)]
CATS = ['Meat', 'Fish', 'Pie', 'Cheesecake', 'Pizza', 'Potatoes', 'Brewing', 'Churning', 'Gnome Drinks', 'Gnome Baking',
        'Primal Feast', 'Other', 'Dungeoneering', 'Urns', 'All']

def api(params, post=False):
    params = dict(params, format='json', formatversion='2')
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(API if post else API + '?' + data.decode(), data=data if post else None, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
        except Exception:
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
    if revid: assert p['title'] == title, (p['title'], title)
    return r['revid'], r['timestamp'], r['slots']['main']['content']

def sandbox(src_text, name, extra=()):
    path = '/tmp/' + re.sub(r'\W+', '_', name) + '.lua'
    open(path, 'w', encoding='utf-8').write(src_text)
    out = subprocess.run([LUA_PY, os.path.join(ROOT, 'tools', 'lua_data_sandbox.py'), path, *extra], capture_output=True, check=True)
    return json.loads(out.stdout)

def jcconfig(page_rev):
    """The config block the gadget reads: Module:Form calculator's rendering of the pinned page revision."""
    html = api({'action': 'parse', 'oldid': page_rev, 'prop': 'text', 'disablelimitreport': '1'})['parse']['text']
    m = re.search(r'<div class="[^"]*\bjcConfig\b[^"]*"[^>]*>(.*?)</div>', html, re.S)
    assert m, 'jcConfig not found'
    text = re.sub(r'<[^>]+>', '', m.group(1))
    import html as H
    return [H.unescape(l) for l in text.split('\n') if l.strip()]

def parse_config(lines):
    """MediaWiki:Gadget-calc-core.js parseConfig: split on '=', re-join the rest; param args split on /\\s*\\|\\s*/."""
    cfg, params = {}, []
    for line in lines:
        temp = line.split('=')
        if len(temp) < 2: continue
        key, args = temp[0].strip().lower(), '='.join(temp[1:]).strip()
        if key != 'param': cfg[key] = args; continue
        a = re.split(r'\s*\|\s*', args)
        a += [''] * (7 - len(a))
        params.append({'name': a[0], 'label': a[1] or a[0], 'def': a[2], 'type': a[3], 'range': a[4], 'rawtogs': a[5]})
    cfg['params'] = params
    return cfg

def build():
    revs, srcs = {}, {}
    for t, pin in PIN.items():
        rid, ts, text = content(t, pin)
        revs[t] = {'revid': rid, 'ts': ts, 'latest': latest(t)[0]}; srcs[t] = text
    engine = srcs['Module:Skill calc']
    m = re.search(r'\nfunction sortTable\(a, b\)\n.*?\nend\n', engine, re.S)
    assert m, 'sortTable not found in Module:Skill calc'
    sort_path = '/tmp/skillcalc_sortTable.lua'
    open(sort_path, 'w', encoding='utf-8').write('local sortTable\n' + m.group(0).strip() + '\nreturn sortTable\n')
    calls = sandbox(srcs['Module:Skill calc/Cooking/data'], 'cooking_data', ['--call', json.dumps(CATS), '--sort', sort_path])
    xp = sandbox(srcs['Module:Experience/data'], 'experience_data')
    assert isinstance(xp, list) and len(xp) == 120 and xp[0] == 0 and xp[98] == 13034431
    cats = {}
    for e in calls:
        assert isinstance(e['items'], list) and sorted(e['order']) == list(range(1, len(e['items']) + 1)), e['arg']
        cats[e['arg']] = {'items': e['items'], 'order': [i - 1 for i in e['order']]}
    # "All": the data module concatenates every sub-category in pairs() order; store it as references into the sub-categories.
    pool = {}
    for c in CATS[:-1]:
        for i, it in enumerate(cats[c]['items']): pool.setdefault(json.dumps(it, sort_keys=True), []).append([c, i])
    refs = []
    for it in cats['All']['items']:
        k = json.dumps(it, sort_keys=True); assert pool.get(k), it
        refs.append(pool[k].pop(0))
    assert not any(pool.values())
    cats['All'] = {'refs': refs, 'order': cats['All']['order']}
    cfg = parse_config(jcconfig(PIN['Calculator:Cooking']))
    assert cfg['template'] == 'Calculator:Skill calculators/Template', cfg
    gid_rev, gid_ts, gid_text = content('Module:GEIDs/data.json')
    gid = json.loads(gid_text); revs['Module:GEIDs/data.json'] = {'revid': gid_rev, 'ts': gid_ts}
    names = set()
    for c in CATS[:-1]:
        for it in cats[c]['items']:
            names.add(it['name'])
            for v in it.get('material', []):
                if isinstance(v, str): names.add(v)
    ids = {n: gid[n] for n in sorted(names) if isinstance(gid.get(n), int)}
    elts = sandbox(srcs["Module:Skill calc/elts"], "skillcalc_elts")
    out = {
        'path': '/w/Calculator:Cooking',
        'source': revs,
        'license': 'RuneScape Wiki, CC BY-NC-SA 3.0 (https://runescape.wiki/w/RuneScape:Copyrights). Form: Calculator:Cooking (Module:Form calculator, MediaWiki:Gadget-calc-core.js). Formulas: Module:Skill calc, Module:Skill calc/bonusGenerator, Module:Skill calc/eltGenerator. Data: Module:Skill calc/Cooking/data, Module:Experience/data.',
        'form': cfg, 'xp': xp, 'ids': ids, 'cats': cats, 'catOrder': CATS,
        'elts': {k: elts[k] for k in ('Cooking', 'Cooking-Dungeoneering', 'Urns')},
    }
    p = os.path.join(ROOT, 'data', 'calc', 'cooking.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    stale = {k: (v['revid'], v.get('latest')) for k, v in revs.items() if v.get('latest') not in (None, v['revid'])}
    print('wrote', p, os.path.getsize(p), 'bytes;', len(ids), 'GE ids of', len(names), 'names;', {c: len(cats[c].get('items', cats[c].get('refs'))) for c in CATS}, 'moved since pin:', stale or 'none')

if __name__ == '__main__':
    {'build': build, 'golden': lambda: __import__('cooking_golden').golden()}[sys.argv[1]]()
