#!/usr/bin/env python3
"""Record the Calculator:Herblore form (pinned revision) as data: field order, type, label text, resolved default,
options, help text and the group each field belongs to (as MediaWiki:Gadget-calc-core.js places it: last listed group).
tests/herblore.test.cjs checks the app's form against this, so the app keeps the Wiki's sections, order, labels and defaults.
  python3 tools/herblore_fields.py      # writes tests/herblore-form-fields.json"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from calc_herblore import content, PIN, ROOT
from herblore_form import Form

def text(w):   # wikitext label -> the words the Wiki shows
    w = re.sub(r'\{\{plinksized\|([^|}]*)(?:\|[^}]*?txt=([^|}]*))?[^}]*\}\}', lambda m: m.group(2) or m.group(1), w)
    w = re.sub(r'\{\{(?:plink|perk link)\|([^|}]*)[^}]*\}\}', r'\1', w)
    w = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', w)
    w = re.sub(r"'''?", '', w)
    return re.sub(r'\s+', ' ', re.sub(r'<\s*/?\s*br\s*/?\s*>', ' ', w)).strip()

rev, ts, page = content('Calculator:Herblore', PIN['Calculator:Herblore'])
assert rev == PIN['Calculator:Herblore'], rev
F = Form(page)
out = []
for f in F.fields:
    t = f['type']; o = {'param': f['param'], 'type': t, 'label': text(f.get('label', '')), 'default': F.value.get(f['param'])}
    if isinstance(o['default'], bool): o['default'] = 'true' if o['default'] else 'false'
    if t in ('buttonselect', 'select'): o['options'] = re.split(r'\s*,\s*', f['range'])
    if t == 'group': o['members'] = re.split(r'\s*,\s*', f['range'])
    if f.get('help'): o['help'] = text(f['help'])
    if f['param'] in F.group_of: o['group'] = F.group_of[f['param']]
    if f['toggles']: o['toggles'] = f['toggles']
    out.append(o)
json.dump({'source': f'Calculator:Herblore rev {rev} ({ts}) form fields, grouped as MediaWiki:Gadget-calc-core.js rev 37082305 does. RuneScape Wiki, CC BY-NC-SA 3.0.',
           'fields': out}, open(os.path.join(ROOT, 'tests', 'herblore-form-fields.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'fields')
