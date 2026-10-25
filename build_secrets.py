"""Build data/secrets.json (+ secimg/*.webp) for the Secrets tab from the curated, wiki-sourced secrets_data.py.
Pictures are existing RS3 wiki files only. Item rewards use the same icons / GE prices as the items list."""
import json, os
import secrets_data as SD

FL_TRADE, FL_UNTR = 1, 2
KINDS = [('item', 'Item'), ('title', 'Title'), ('pet', 'Pet'), ('cosmetic', 'Cosmetic'), ('emote', 'Emote'), ('none', 'Just for fun')]
# wiki picture standing in for a reward type that has no item of its own
TYPE_PIC = {'title': 'Titles icon.png', 'emote': 'Emotes icon.png'}

def build(APP, find_file, out_img, decodes, used_files, iall, row_of):
    os.makedirs(f'{APP}/secimg', exist_ok=True)
    def pic(cands, w, h, q):
        for c in cands:
            f = find_file(c)
            if f and decodes(f):
                o = out_img(f, 'secimg', w, h, q)
                if o: used_files.add(o); return o[len('secimg/'):-5]
        return None
    st = {'entries': 0, 'past': 0, 'with_pic': 0, 'with_reward': 0, 'with_map': 0, 'pins': 0, 'item_rewards': 0, 'kinds': {k: 0 for k, _ in KINDS}, 'no_pic': [], 'map_free': []}
    out, item_names = [], {}
    for grp, lst in ((0, SD.SECRETS), (1, SD.PAST)):
        for e in lst:
            p = pic(e.get('pic', []), 96, 96, 82)
            rws = []
            for r in e.get('rw', []):
                n = r['n']; k = r['k']; rec = {'k': k, 'n': n}
                if k == 'item':
                    i = row_of.get(r.get('item') or n)
                    if i is not None:
                        row = iall[i]; rec['i'] = r.get('item') or n
                        if row[1]: rec['ic'] = row[1] + '.webp'
                        if row[2] is not None: rec['ge'] = row[2]
                        rec['tr'] = 1 if row[3] & FL_TRADE else 2 if row[3] & FL_UNTR else 0
                        if not grp: item_names.setdefault(rec['i'], []).append(e)
                        st['item_rewards'] += 0 if grp else 1
                if 'ic' not in rec:
                    ip = pic([r['pic']] if r.get('pic') else [TYPE_PIC.get(k, ''), n + ' detail.png', n + '.png'], 40, 40, 85)
                    if ip: rec['ip'] = f'secimg/{ip}.webp'
                rws.append(rec)
            kinds = sorted({r['k'] for r in rws}, key=[k for k, _ in KINDS].index) or ['none']
            o = {'id': e['id'], 't': e['t'], 'w': e['wiki'], 'd': e['d'], 'rq': e.get('req', []), 'rw': rws, 'k': kinds, 's': e['steps']}
            if p: o['p'] = p
            if e.get('list'): o['l'] = e['list']
            if e.get('tip'): o['tip'] = e['tip']
            if e.get('maps'): o['m'] = [{'l': m['l'], 'map': m['map'], 'plane': m['plane'], 'pins': m['pins']} for m in e['maps']]
            quick = e.get('q', False) if 'q' in e else False
            if quick: o['q'] = 1
            if grp: o['x'] = 1
            out.append(o)
            if grp: st['past'] += 1; continue
            st['entries'] += 1; st['with_pic'] += 1 if p else 0
            if not p: st['no_pic'].append(e['id'])
            if e.get('rw'): st['with_reward'] += 1
            if e.get('maps'): st['with_map'] += 1; st['pins'] += sum(len(m['pins']) for m in e['maps'])
            for kk in kinds: st['kinds'][kk] += 1
    json.dump({'kinds': KINDS, 'snap': '21 October 2026', 'rows': out}, open(f'{APP}/data/secrets.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    st['item_names'] = sorted(item_names)
    return st, item_names
