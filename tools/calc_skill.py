#!/usr/bin/env python3
"""Build data/calc/<skill>.json for a native Wiki skill calculator on the shared Module:Skill calc engine, and its Wiki goldens.

  python3 tools/calc_skill.py Fletching build
  python3 tools/calc_skill.py Fletching golden

Same method as tools/calc_cooking.py (pinned revisions, sandboxed Lua data evaluation, the engine's own sortTable, the page's
jcConfig, MediaWiki:Gadget-calc-core.js form emulation) with the engine pages shared with Cooking (calc_cooking.PIN).
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc_cooking as CC
from calc_cooking import ROOT, api, latest, content, sandbox, jcconfig, parse_config

SKILLS = {
    'Fletching': {'page': ('Calculator:Fletching', 37236406), 'data': ('Module:Skill calc/Fletching/data', 37229972), 'slug': 'fletching'},
}
ENGINE = {k: v for k, v in CC.PIN.items() if k not in ('Calculator:Cooking', 'Module:Skill calc/Cooking/data')}
ELTS = lambda skill: [skill, skill + '-Dungeoneering', 'Dungeons-Materials', 'Urns']

def pins(skill):
    S = SKILLS[skill]; p = dict(ENGINE); p[S['page'][0]] = S['page'][1]; p[S['data'][0]] = S['data'][1]; return p

def build(skill):
    S = SKILLS[skill]; P = pins(skill); revs, srcs = {}, {}
    for t, pin in P.items():
        rid, ts, text = content(t, pin); revs[t] = {'revid': rid, 'ts': ts, 'latest': latest(t)[0]}; srcs[t] = text
    cfg = parse_config(jcconfig(S['page'][1]))
    assert cfg['template'] == 'Calculator:Skill calculators/Template', cfg
    disp = next(p for p in cfg['params'] if p['name'] == 'disp')
    cats = [c for c in re.split(r'\s*,\s*', disp['range']) if c]
    m = re.search(r'\nfunction sortTable\(a, b\)\n.*?\nend\n', srcs['Module:Skill calc'], re.S); assert m
    sort_path = '/tmp/skillcalc_sortTable.lua'
    open(sort_path, 'w', encoding='utf-8').write('local sortTable\n' + m.group(0).strip() + '\nreturn sortTable\n')
    calls = sandbox(srcs[S['data'][0]], skill.lower() + '_data', ['--call', json.dumps(cats), '--sort', sort_path])
    xp = sandbox(srcs['Module:Experience/data'], 'experience_data'); assert len(xp) == 120 and xp[98] == 13034431
    out_cats = {}
    for e in calls:
        assert isinstance(e['items'], list) and sorted(e['order']) == list(range(1, len(e['items']) + 1)), e['arg']
        out_cats[e['arg']] = {'items': e['items'], 'order': [i - 1 for i in e['order']]}
    gid_rev, gid_ts, gid_text = content('Module:GEIDs/data.json'); gid = json.loads(gid_text); revs['Module:GEIDs/data.json'] = {'revid': gid_rev, 'ts': gid_ts}
    names = set()
    for c in cats:
        for it in out_cats[c]['items']:
            names.add(it['name'])
            for v in it.get('material', []):
                if isinstance(v, str): names.add(v)
    elts = sandbox(srcs['Module:Skill calc/elts'], 'skillcalc_elts')
    out = {'path': '/w/' + S['page'][0].replace(' ', '_'), 'skill': skill, 'source': revs,
           'license': f"RuneScape Wiki, CC BY-NC-SA 3.0 (https://runescape.wiki/w/RuneScape:Copyrights). Form: {S['page'][0]} (Module:Form calculator, MediaWiki:Gadget-calc-core.js). Formulas: Module:Skill calc, Module:Skill calc/bonusGenerator, Module:Skill calc/eltGenerator. Data: {S['data'][0]}, Module:Experience/data.",
           'form': cfg, 'xp': xp, 'ids': {n: gid[n] for n in sorted(names) if isinstance(gid.get(n), int)}, 'cats': out_cats, 'catOrder': cats,
           'elts': {k: elts[k] for k in ELTS(skill) if k in elts}}
    p = os.path.join(ROOT, 'data', 'calc', S['slug'] + '.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    stale = {k: (v['revid'], v.get('latest')) for k, v in revs.items() if v.get('latest') not in (None, v['revid'])}
    print('wrote', p, os.path.getsize(p), 'bytes;', len(out['ids']), 'GE ids of', len(names), 'names;', {c: len(out_cats[c]['items']) for c in cats}, 'moved since pin:', stale or 'none')

def golden(skill):
    import cooking_golden as G
    S = SKILLS[skill]; P = pins(skill); slug = S['slug']
    cases = json.load(open(os.path.join(ROOT, 'tests', slug + '-cases.json')))
    D = json.load(open(os.path.join(ROOT, 'data', 'calc', slug + '.json')))
    for t, pin in P.items():
        lr = latest(t)[0]
        if lr != pin: sys.exit('%s is now at revision %s, pinned %s: re-read/port it first' % (t, lr, pin))
    fpath = os.path.join(ROOT, 'tests', slug + '-form-cases.json')
    form = json.load(open(fpath)) if os.path.exists(fpath) else {'cases': []}
    subs = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'skill_form.cjs'), slug], capture_output=True, check=True).stdout) if form['cases'] else []
    for c, s in zip(form['cases'], subs):
        got = [x for x in s['submission'] if x[0] != 'name']
        assert got == c['expected'] and not s['errors'], ('form emulation differs from the hand-derived gadget result', c['name'], got)
    for attempt in range(3):
        r1, ts1, prices_text = content('Module:GEPrices/data.json'); out, fout = [], []
        for c in cases:
            res = G.render(list(c['args'].items())); res.update(name=c['name'], args=c['args']); out.append(res)
            print(c['name'], len(res.get('rows', [])), res.get('error', ''), file=sys.stderr); time.sleep(1)
        for c, s in zip(form['cases'], subs):
            res = G.render(s['submission']); res.update(name=c['name'], submission=s['submission']); fout.append(res)
            print('form', c['name'], len(res.get('rows', [])), file=sys.stderr); time.sleep(1)
        if latest('Module:GEPrices/data.json')[0] == r1: break
    else: sys.exit('GEPrices kept changing')
    allp = json.loads(prices_text)
    fx = {'generated': time.strftime('%Y-%m-%d %H:%M %Z'), 'gePricesRevision': r1, 'gePricesTimestamp': ts1, 'pins': P,
          'license': f"Rendered by the RuneScape Wiki ({S['page'][0]}, Module:Skill calc, {S['data'][0]}, Module:GEPrices/data.json); CC BY-NC-SA 3.0",
          'prices': {n: allp[n] for n in sorted(D['ids']) if isinstance(allp.get(n), (int, float))}, 'cases': out, 'formCases': fout}
    p = os.path.join(ROOT, 'tests', 'fixtures-' + slug + '-golden.json')
    json.dump(fx, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('wrote', p, sum(len(c.get('rows', [])) for c in out), 'rows in', len(out), 'cases; GEPrices revision', r1)

if __name__ == '__main__':
    {'build': build, 'golden': golden}[sys.argv[2]](sys.argv[1])
