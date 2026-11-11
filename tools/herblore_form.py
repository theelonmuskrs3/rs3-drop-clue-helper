#!/usr/bin/env python3
"""Emulate what the RuneScape Wiki calculator gadget submits for Calculator:Herblore.

Port of the parts of MediaWiki:Gadget-calc-core.js (rev 37082305) that decide which fields reach the template:
setupCalc (group membership: a field goes into the group listing it that was defined most recently before the field,
as groupkeys is filled while the fields are laid out in order (so Factory outfit pieces sits in Outfit pieces, not in
Cost saving which lists it later); a group toggles only the widgets placed in it; initial toggles in field order),
helper.parseToggles, helper.toggle (groups enable/disable all their member widgets; other fields toggle themselves),
the buttonselect default (first option when the default is not in the range) and submitForm (a field is sent only if it
is type hidden, or not a group and not disabled; fixed/hidden send their default; checks/switches send true/false).
The field list is parsed from the pinned page wikitext ({{Form calculator/field}} blocks). Only data is read; no code runs.
"""
import re

def parse_fields(page_text):
    fields = []
    for block in re.findall(r'\{\{Form calculator/field\n(.*?)\n\}\}', page_text, re.S):
        f = {}
        for line in block.split('\n'):
            m = re.match(r'^\|\s*(\w+)\s*=\s?(.*)$', line)
            if m: f[m.group(1)] = m.group(2).strip()
        f.setdefault('default', ''); f.setdefault('toggles', ''); f.setdefault('range', '')
        fields.append(f)
    return fields

def parse_toggles(raw, defkey):
    toggles, allkeys, allvals = {}, [], []
    tmptogs = re.split(r'\s*;\s*', raw)
    if tmptogs and tmptogs[0]:
        for tog in tmptogs:
            tmp = re.split(r'\s*=\s*', tog)
            if len(tmp) < 2: keys, val = [defkey], re.split(r'\s*,\s*', tmp[0])
            else: keys, val = re.split(r'\s*,\s*', tmp[0]), re.split(r'\s*,\s*', tmp[1])
            for k in keys:
                toggles[k] = {'on': val}
                if k not in allkeys: allkeys.append(k)
            allvals += val
        for k in allkeys: toggles[k]['off'] = [v for v in allvals if v not in toggles[k]['on']]
        toggles['__all__'] = {'off': allvals}
    return toggles

class Form:
    def __init__(self, page_text):
        self.fields = parse_fields(page_text)
        self.by = {f['param']: f for f in self.fields}
        self.group_of = {}
        groupkeys = {}
        for f in self.fields:   # setupCalc: a field goes into the group that lists it and was defined most recently BEFORE it
            if f['type'] == 'group':
                for c in re.split(r'\s*,\s*', f['range']): groupkeys[c] = f['param']
            elif f['param'] in groupkeys: self.group_of[f['param']] = groupkeys[f['param']]
        self.disabled = {f['param']: False for f in self.fields}
        self.shown = {f['param']: True for f in self.fields}   # layout visibility (a group's toggle shows/hides the group, not its children)
        self.value = {}
        for f in self.fields:
            t, d = f['type'], f['default']
            if t == 'buttonselect':
                opts = re.split(r'\s*,\s*', f['range']); self.value[f['param']] = d if d and d in opts else opts[0]
                f['_tog'] = parse_toggles(f['toggles'], self.value[f['param']])
            elif t in ('check', 'toggleswitch', 'togglebutton'):
                self.value[f['param']] = d == 'true'; f['_tog'] = parse_toggles(f['toggles'], 'true')
            elif t == 'select':
                self.value[f['param']] = d; f['_tog'] = parse_toggles(f['toggles'], d)
            else:
                self.value[f['param']] = d; f['_tog'] = parse_toggles(f['toggles'], d) if f['toggles'] else {}
        for f in self.fields:   # setupCalc: run every field's toggle once, in field order
            if f.get('_tog'): self._toggle(self._val(f), f['_tog'])

    def _val(self, f):
        v = self.value[f['param']]
        return ('true' if v else 'false') if isinstance(v, bool) else v

    def _togitem(self, name, show):
        f = self.by[name]
        self.shown[name] = show
        if f['type'] == 'group':
            for c, g in self.group_of.items():
                if g == name: self.disabled[c] = not show
        else: self.disabled[name] = not show

    def _toggle(self, item, toggles):
        if item in toggles:
            for w in toggles[item]['on']: self._togitem(w, True)
            for w in toggles[item]['off']: self._togitem(w, False)
        elif '__all__' in toggles:
            for w in toggles['__all__']['off']: self._togitem(w, False)

    def set(self, name, value):
        """A user changing one visible control (and its toggles firing, as on 'choose'/'change')."""
        f = self.by[name]
        if self.disabled[name]: raise ValueError('control is disabled on the Wiki form: ' + name)
        if not self.visible(name): raise ValueError('control is not visible on the Wiki form: ' + name)
        if f['type'] in ('check', 'toggleswitch', 'togglebutton'): value = value in (True, 'true')
        self.value[name] = value
        if f.get('_tog'): self._toggle(self._val(f), f['_tog'])

    def visible(self, name):
        """Can a user see (and so click) this control: its own layout and its group are shown."""
        g = self.group_of.get(name)
        return self.shown[name] and (g is None or self.shown[g])

    def submission(self):
        out = []
        for f in self.fields:
            t, n = f['type'], f['param']
            if t == 'hidden' or (t != 'group' and not self.disabled[n]):
                v = f['default'] if t in ('fixed', 'hidden') else self._val(f)
                if t == 'int': v = v.replace(',', '')
                out.append((n, v))
        return out
