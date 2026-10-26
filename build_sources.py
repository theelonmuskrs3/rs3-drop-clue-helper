"""Assemble the 'Where to get it' data for every item: data/src/<fnv1a % NSH>.json shards, data/src/sum.json, data/src/thal.json.
Inputs: plugin sources.json (extract_sources.py), data/map/index.json, items_index drops, quests.json. RS3 wiki data only."""
import os, re, json, sqlite3, unicodedata, collections
NSH = 256

def fnv(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xffffffff
    return h

def norm(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', s or '')).strip().lower()

def num(v):
    if v is None: return None
    s = re.sub(r'[,\s]', '', str(v))
    m = re.match(r'^-?\d+(\.\d+)?', s)
    return (int(float(m.group())) if m else None)

def rar_ok(r):
    r = (r or '').strip()
    return '' if (len(r) > 28 or any(c in r for c in '|{}=')) else r

def rar_rank(r):
    r = (r or '').lower()
    m = re.match(r'(\d+(?:\.\d+)?)\s*/\s*([\d,\.]+)', r)
    if m:
        try: return float(m.group(1)) / float(m.group(2).replace(',', ''))
        except Exception: return 0
    return {'always': 2, 'common': .5, 'uncommon': .1, 'rare': .02, 'very rare': .005}.get(r, 0)

import datetime
def dkey(s):
    for f in ('%d %B %Y', '%B %d, %Y', '%B %Y', '%Y'):
        try: return datetime.datetime.strptime((s or '').strip(), f).toordinal()
        except Exception: pass
    return 0

def build(APP, SRC, BASE, iall, items, quests, is_osrs, mon_titles):
    S = json.load(open(f'{SRC}/sources.json', encoding='utf-8'))
    midx = json.load(open(f'{APP}/data/map/index.json', encoding='utf-8'))['rows']
    mid = {}
    for r in midx:
        nm, tp, i = r[0], r[1], r[4]
        k = norm(nm); cur = mid.get(k)
        pri = {'shop': 0, 'npc': 1}.get(tp, 2)
        if cur is None or pri < cur[0]: mid[k] = (pri, i)
    def mapid(t, want=None):
        if not t: return None
        v = mid.get(norm(t)) or mid.get(norm(re.sub(r'#.*$', '', t)))
        return v[1] if v else None
    names = {}; pages = {}
    for r in iall:
        P = r[4] if len(r) > 4 else r[0]
        names[r[0]] = P; pages.setdefault(P, r[0])
    for P in pages: names.setdefault(P, P)
    low = {}
    for n, P in names.items(): low.setdefault(norm(n), P)
    db = sqlite3.connect(f'{BASE}/search.db')
    redir = {}
    for t, rd in db.execute('select title, redirect from docs where ns=0 and redirect is not null'):
        redir[t] = rd
    unmatched = collections.Counter()
    cache = {}
    def canon(k):
        if k in cache: return cache[k]
        r = None
        if k in names: r = names[k]
        else:
            t = re.sub(r'#.*$', '', k or '')
            if t in names: r = names[t]
            elif redir.get(t) and re.sub(r'#.*$', '', redir[t]) in names: r = names[re.sub(r'#.*$', '', redir[t])]
            elif low.get(norm(t)): r = low[norm(t)]
        cache[k] = r
        if r is None: unmatched[k] += 1
        return r

    R = collections.defaultdict(lambda: {'s': [], 'p': [], 'r': [], 'w': {}, 'q': [], 'h': []})
    st = collections.Counter()
    # ---- shops
    def cur(c): return '' if not c or norm(c) in ('coins', 'coin', 'gp') else c
    for title, sh in S['shops'].items():
        info = sh.get('info') or {}
        sid = mapid(title); oid = mapid((info.get('owner_links') or [info.get('owner')])[0] if (info.get('owner_links') or info.get('owner')) else None)
        pin = info.get('map')
        for row in sh['rows']:
            for it in row['items']:
                c = canon(it)
                if not c: continue
                mem = row.get('members'); mem = info.get('members') if mem is None else mem
                rec = [title, info.get('owner') or '', info.get('location') or '', row.get('stock') or '', num(row.get('sell')), num(row.get('buy')),
                       cur(row.get('currency')), 1 if mem is True else 0 if mem is False else -1, 1 if (sh.get('hist') or row.get('hist') or re.search(r'\bbeta\b', title, re.I)) else 0, sid, oid, pin]
                R[c]['s'].append(rec)
    ts = S['thalmund_shop']; th = S['thalmund']
    tsid, toid = mapid(ts['name']), mapid(ts['owner'])
    thal_items = set()
    for si, sl in enumerate(th):
        for it in sl['items']:
            c = canon(it['item'])
            if c:
                thal_items.add(c)
                R[c]['s'].append([ts['name'], ts['owner'], ts['location'], str(it['qty']), it['price'], 0, '', 1, 0, tsid, toid, ts['map'], 'T'])
    # ---- spawns
    for it, rows in S['spawn'].items():
        c = canon(it)
        if not c: continue
        for r in rows:
            R[c]['p'].append([r.get('loc') or '', 1 if r.get('mem') else 0, r.get('req') or '', r.get('map'), r.get('plane'), r.get('xy') or [], r.get('text') or '', r.get('page') or ''])
    # ---- recipes
    for it, rows in S['recipe'].items():
        c = canon(it)
        if not c: continue
        for r in rows:
            mats = []
            for n, q in r['mat']:
                cn = canon(n); mats.append([cn or n, q, 1 if cn else 0])
            R[c]['r'].append([r.get('m') or '', 1 if r.get('mem') else 0, r['sk'], mats, r.get('fac') or '', r.get('tool') or '', r.get('q') or '', r.get('page') or '', r.get('ticks') or '', [[o[0], o[1]] for o in r.get('out', [])]])
    # ---- thieving: source pages (level / type / xp / wiki locations) + per-item rows
    TV = collections.defaultdict(dict); thv_src = {}
    def pick(info, ver):
        vs = info.get('vers') or []
        nv = norm(ver)
        stem = lambda x: re.sub(r'(ing|s)$', '', norm(x))
        hit = [v for v in vs if nv and (norm(v['v']) == nv or norm(v['dv']) == nv)] or [v for v in vs if nv and v['v'] and stem(v['v']) and stem(v['v']) == stem(ver)]
        if hit: return hit[0], None
        lvs = sorted({v['lv'] for v in vs if v['lv'] is not None})
        if len(lvs) <= 1:
            blank = [v for v in vs if not v['v']]
            return (blank or vs or [None])[0], None
        return None, [lvs[0], lvs[-1]]
    def thv_row(r):
        info = S.get('thieving', {}).get(r['src'])
        v, lr = pick(info, r.get('ver')) if info else (None, None)
        if info and r['src'] not in thv_src:
            thv_src[r['src']] = {'t': info.get('ty') or '', 'l': [[l['loc'], 1 if l.get('mem') is True else 0 if l.get('mem') is False else -1, l.get('req') or '', l['map'], l['plane'], l['xy'], l.get('dv') or ''] for l in info['locs']]}
        ty = (v or {}).get('ty') or (info or {}).get('ty') or ''
        return [r['src'], r.get('ver') or '', (v or {}).get('lv'), lr, ty, r['qty'], rar_ok(r['rar']), r.get('note') or '', (v or {}).get('xp') or '', (v or {}).get('tool') or '']
    # ---- reward-type DropsLines (+ plain DropsLine on non-monster pages)
    for it, rows in S['dl'].items():
        c = canon(it)
        if not c: continue
        for r in rows:
            if is_osrs(r['src']): continue
            if r['k'] == 'Thieving':
                tv = thv_row(r)
                TV[c].setdefault((tv[0], tv[1], tv[5], tv[6], tv[7]), tv)
                continue
            key = (r['src'], r['k'])
            rar = rar_ok(r['rar']); cand = [r['src'], r['k'], r.get('sect') or '', r['qty'], rar, r.get('gem') and 1 or 0, mapid(r['src'])]
            old = R[c]['w'].get(key)
            if old is None or rar_rank(rar) > rar_rank(old[4]): R[c]['w'][key] = cand
    # ---- availability history (RecurringTableLine on the item's own page)
    for t, rows in S.get('recurring', {}).items():
        c = canon(t)
        if c:
            for r in rows:
                if r not in R[c]['h']: R[c]['h'].append(r)
    # ---- the wiki's own how-to-obtain sentence (ob.json 'lead' text, built earlier in build_app) for items with nothing structured
    obx = {}
    try:
        ob = json.load(open(f'{APP}/data/ob.json', encoding='utf-8'))
        for r_ in ob['rows']:
            if r_[2] and r_[0] < len(iall):
                ir = iall[r_[0]]; obx.setdefault(ir[4] if len(ir) > 4 else ir[0], r_[2])
    except Exception: pass
    # ---- 'Used in' (reverse of the creation recipes) + prose sections / related item pages / navboxes from the item pages
    UI = collections.defaultdict(dict)
    for it, rows in S['recipe'].items():
        pc = canon(it)
        if not pc: continue
        for r in rows:
            sk = r['sk'][0] if r.get('sk') else None
            for n_, q_ in r['mat']:
                cm = canon(n_)
                if cm and cm != pc and pc not in UI[cm]: UI[cm][pc] = [pc, sk[0] if sk else '', sk[1] if sk else None, 1 if r.get('mem') else 0]
    IT = {}
    try: IT = json.load(open(f'{SRC}/itemtext.json', encoding='utf-8'))
    except Exception as e: print('itemtext.json missing', e)
    # ---- quest rewards
    for qn, q in (quests.get('quests') or {}).items():
        seen = set()
        for rw in q.get('rewards', []):
            if rw.get('d', 9) > 2 or len(rw.get('t', '')) > 80: continue
            for l in rw.get('l', []):
                lt = re.sub(r'#.*$', '', l or '')
                c = names.get(l) or names.get(lt) or low.get(norm(lt)) or (names.get(re.sub(r'#.*$', '', redir.get(lt, ''))) if redir.get(lt) else None)
                if c and c not in seen:
                    seen.add(c); R[c]['q'].append([qn, rw['t']])
    # ---- monster drops: map ids for the top sources (drops themselves stay in items.json)
    out = {}; sums = {}; cnt = collections.Counter()
    def money(v, c): return f"{v:,} {c or 'gp'}"
    nsrc_items = 0
    for n, k0 in pages.items():
        rec = R.get(n)
        dr = items.get(n) or items.get(k0) or []
        if not rec and not dr and n not in obx and n not in TV and n not in IT and n not in UI: continue
        shops = rec['s'] if rec else []
        # dedupe shops
        seen = set(); sl = []
        for s in shops:
            k = (s[0], s[3], s[4], s[5], s[8])
            if k in seen: continue
            seen.add(k); sl.append(s)
        sl.sort(key=lambda s: (s[8], s[4] if s[4] is not None else 1e18))
        spl = rec['p'] if rec else []
        rcl = list(rec['r']) if rec else []
        rcl.sort(key=lambda r: (0 if r[7] == n else 1))
        wl = sorted(rec['w'].values(), key=lambda w: (-rar_rank(w[4]), w[0])) if rec else []
        ql = rec['q'] if rec else []
        tvl = sorted(TV[n].values(), key=lambda v: (v[2] is None and v[3] is None, v[2] if v[2] is not None else (v[3][0] if v[3] else 0), -rar_rank(v[6]), v[0])) if n in TV else []
        hl = sorted(rec['h'], key=lambda r: dkey(r[0]), reverse=True) if rec else []
        # drop monsters ids
        dm = {}
        for d in dr[:12]:
            i = mapid(d[0]);
            if i is not None: dm[d[0]] = i
        o = {}
        if sl: o['s'] = sl; o['sn'] = len(sl)
        if spl: o['p'] = spl; o['pn'] = len(spl)
        if rcl: o['r'] = rcl; o['rn'] = len(rcl)
        if wl: o['w'] = wl; o['wn'] = len(wl)
        if tvl: o['v'] = tvl; o['vn'] = len(tvl)
        if ql: o['q'] = ql; o['qn'] = len(ql)
        if hl: o['h'] = hl; o['hn'] = len(hl)
        ui = sorted(UI[n].values(), key=lambda u: (u[2] is None, u[2] or 0, u[0])) if n in UI else []
        if ui: o['u'] = ui; cnt['used_in_items'] += 1; cnt['used_in_rows'] += len(ui)
        itx = IT.get(n) or {}
        tx = itx.get('t') or []
        if tx: o['tx'] = tx; cnt['prose_pages'] += 1
        if any(t_[3] == 'o' for t_ in tx): cnt['prose_source_pages'] += 1
        if any(t_[3] == 'u' for t_ in tx): cnt['prose_uses_pages'] += 1
        rl = [canon(x) for x in itx.get('rel', [])]; rl = list(dict.fromkeys(x for x in rl if x and x != n))
        if rl: o['rel'] = rl; cnt['related_item_pages'] += 1
        if itx.get('nb'): o['nb'] = itx['nb']; cnt['navbox_pages'] += 1
        hs_ = bool(dr) or any(k in o for k in ('s', 'p', 'r', 'w', 'v', 'q', 'h'))
        sc_ = [x for x in itx.get('sn', []) if not (not hs_ and n in obx and x in obx[n][:360]) and not any(x in t_[1] for t_ in tx)]
        sc_ = sc_[:2] if hs_ else sc_
        if sc_: o['sc'] = sc_; cnt['article_sentence_pages'] += 1; cnt['article_sentence_pages_without_structured'] += (0 if hs_ else 1)
        if dm: o['dm'] = dm
        if n in thal_items: o['t'] = 1
        # coverage
        if sl:
            cnt['shop_any'] += 1
            if any(not s[8] for s in sl): cnt['shop_current'] += 1
            if any(s[8] for s in sl): cnt['shop_historical'] += 1
            if any(s[11] for s in sl): cnt['shop_with_wiki_map_pin'] += 1
            if any(len(s) > 12 for s in sl): cnt['thalmund_rotation'] += 1
        if dr: cnt['drop'] += 1
        if rcl: cnt['recipe'] += 1
        if spl: cnt['spawn'] += 1
        if spl and any(p[5] for p in spl): cnt['spawn_with_pin'] += 1
        if tvl:
            cnt['thieving_items'] += 1
            lc = {(v[0]) for v in tvl}
            if any(any(l[5] for l in thv_src.get(sn, {}).get('l', [])) for sn in lc): cnt['thieving_items_with_map_pin'] += 1
        if wl: cnt['reward_or_other_dropsline'] += 1
        for k_ in {w[1] for w in wl}: cnt['reward_kind:' + k_] += 1
        for r_ in rcl[:1]:
            if r_[6]: cnt['recipe_needs_quest'] += 1
        if o.get('t'): cnt['thalmund_dates_table'] += 1
        if ql: cnt['quest_reward'] += 1
        if hl: cnt['availability_history'] += 1
        # summary
        s = None
        cs = [x for x in sl if not x[8] and x[4] is not None and str(x[3]).strip() != '0']
        c0 = [x for x in sl if not x[8] and x[4] is not None and str(x[3]).strip() == '0']
        if cs:
            a = cs[0]; more = len({x[0] for x in cs}) - 1
            s = f"Buy: {a[0]}" + (f" ({a[2]})" if a[2] else '') + f" for {money(a[4], a[6])}" + (f" +{more} more shops" if more > 0 else '')
        elif dr:
            d = dr[0]; mons = len(dr)
            s = f"Drop: {d[0]}" + (f" ({d[2]})" if d[2] else '') + (f" +{mons-1} more" if mons > 1 else '')
        elif tvl:
            t0 = tvl[0]; srcs_ = list(dict.fromkeys(v[0] for v in tvl))
            s = f"Thieve: {t0[0]}" + (f" (level {t0[2]})" if t0[2] is not None else f" (level {t0[3][0]}–{t0[3][1]})" if t0[3] else '') + (f" +{len(srcs_)-1} more" if len(srcs_) > 1 else '')
        elif wl:
            w = wl[0]; s = f"{w[1]}: {w[0]}" + (f" +{len(wl)-1} more" if len(wl) > 1 else '')
        elif rcl:
            r = rcl[0]; sk = r[2][0] if r[2] else None
            s = "Make: " + (f"{sk[0]} {sk[1]}" if sk else (r[0] or 'creation recipe')) + (f" +{len(rcl)-1} more" if len(rcl) > 1 else '')
        elif spl:
            s = f"Ground spawn: {spl[0][0] or 'see item page'}" + (f" +{len(spl)-1} more" if len(spl) > 1 else '')
        elif ql:
            s = f"Quest reward: {ql[0][0]}"
        elif c0:
            a = c0[0]; s = f"Shop (not normally stocked): {a[0]}" + (f" ({a[2]})" if a[2] else '') + f" buys/sells at {money(a[4], a[6])}"
        elif hl:
            h = hl[0]; s = "Was available" + (f": {h[3]}" if h[3] and h[3].lower() != 'no' else '') + (f" ({h[0]}" + (f" – {h[1]}" if h[1] else '') + ")" if h[0] else '')
        elif sl:
            a = sl[0]; s = f"Was sold: {a[0]} (discontinued)"
        if s is None: s = ''
        if not any(k in o for k in ('s', 'p', 'r', 'w', 'v', 'q', 'h')) and n in obx and not dr:
            o['x'] = obx[n][:360]; cnt['wiki_text_only'] += 1
            if not s: s = 'Wiki note: ' + obx[n][:80].rstrip(' ,.;:') + ('…' if len(obx[n]) > 80 else '')
        if not s and not dr and not any(k in o for k in ('s', 'p', 'r', 'w', 'v', 'q', 'h')):
            o_ = [t_ for t_ in o.get('tx', []) if t_[3] == 'o']
            if not o_ and o.get('sc'):
                s = 'Wiki note: ' + o['sc'][0][:90].rstrip(' ,.;:') + ('…' if len(o['sc'][0]) > 90 else '')
            elif o_: s = 'Wiki note: ' + o_[0][1].split('\n')[0][:80].rstrip(' ,.;:') + ('…' if len(o_[0][1].split('\n')[0]) > 80 else '')
            elif o.get('rel'): s = 'See also: ' + o['rel'][0]
        if o: out[n] = o
        sums[n] = s
        if o or dr: cnt['any_structured_source'] += 1
    # items with only plain drops (no rec) handled above through dr; all others have no source
        cnt['rows'] = len(iall); cnt['distinct_pages'] = len(pages)
    # ---- write
    sd = f'{APP}/data/src'
    if os.path.isdir(sd):
        for f in os.listdir(sd): os.remove(f'{sd}/{f}')
    os.makedirs(sd, exist_ok=True)
    sh = collections.defaultdict(dict)
    for n, o in out.items(): sh[fnv(n) % NSH][n] = o
    for i, d in sh.items(): json.dump(d, open(f'{sd}/{i}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    smap = {}
    for r in iall:
        P = r[4] if len(r) > 4 else r[0]
        smap[r[0]] = sums.get(P) or ''
        if P != r[0] and sums.get(P): smap[P] = sums[P]
    smap.update({n: v for n, v in sums.items() if v and n not in smap})
    json.dump(smap, open(f'{sd}/sum.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'start': [2024, 2, 14], 'slots': [{'t': sl['title'], 'o': sl.get('offset') or 0, 'q': sl.get('seq'), 'i': [[canon(x['item']) or x['item'], x['key']] for x in sl['items']]} for sl in th]},
              open(f'{sd}/thal.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(thv_src, open(f'{sd}/thv.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    cnt['thieving_sources_in_app'] = len(thv_src)
    cnt['thieving_locations_with_pin'] = sum(1 for v in thv_src.values() for l in v['l'] if l[5])
    cnt['thieving_pin_markers'] = sum(len(l[5]) for v in thv_src.values() for l in v['l'])
    cnt['thieving_source_rows'] = sum(len(v) for v in TV.values())
    cnt['unmatched_source_keys'] = len(unmatched)
    cnt['unmatched_source_rows'] = sum(unmatched.values())
    cnt['unmatched_examples'] = [k for k, _ in unmatched.most_common(15)]
    cnt['shards'] = len(sh)
    cnt['summary_lines'] = sum(1 for s in sums.values() if s); cnt['sum_json_keys'] = len(smap)
    # rows (not distinct names) with data: rows whose name has data
    pg = lambda r: r[4] if len(r) > 4 else r[0]
    STRUCT = ('s', 'p', 'r', 'w', 'v', 'q', 'h')
    hasd = lambda r: bool(items.get(pg(r)) or items.get(r[0]))
    hs = lambda r: pg(r) in out and any(k in out[pg(r)] for k in STRUCT)
    hp = lambda r: pg(r) in out and (any(t_[3] == 'o' for t_ in out[pg(r)].get('tx', [])) or 'x' in out[pg(r)] or 'rel' in out[pg(r)] or 'sc' in out[pg(r)])
    cnt['rows_with_structured_source'] = sum(1 for r in iall if hs(r) or hasd(r))
    cnt['rows_wiki_text_only'] = sum(1 for r in iall if not (hs(r) or hasd(r)) and hp(r))
    cnt['rows_without_any_source'] = len(iall) - cnt['rows_with_structured_source'] - cnt['rows_wiki_text_only']
    cnt['rows_without_source_but_used_in_or_related'] = sum(1 for r in iall if not (hs(r) or hasd(r) or hp(r)) and pg(r) in out)
    json.dump(dict(cnt), open(f'{BASE}/neon_shots/sources_stats.json', 'w'), indent=1)
    return dict(cnt)
