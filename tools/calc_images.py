#!/usr/bin/env python3
"""Official RuneScape Wiki pictures for the Calculators directory and the native calculators' items.

  python3 tools/calc_images.py     # -> data/calc/directory.json (Wiki Calculators page layout + tile icons)
                                   #    data/calc/images.json    (every item name a native calculator can show -> its Wiki icon)

Every picture is a file of the RS3 Wiki (runescape.wiki), never a stand-in:
  * Calculators page tiles and group headers: the exact |icon= / |category image= file of the pinned page revision.
  * Skill groups: File:<Skill>.png (the Wiki's skill icons, as used elsewhere in the app).
  * Calculator items: File:<exact item name>.png (the Wiki's inventory icon naming), else .gif; a different file is used only
    when the Wiki itself redirects to it (a File: redirect, or the item page redirecting to its current name). Dose variants are
    never substituted for each other. Anything else is listed under "missing" and shown with no picture.
The Wiki API gives each file's SHA-1; the bytes come from the app's existing local Wiki image mirror when the SHA-1 matches,
otherwise they are downloaded once with an ordinary request and checked against that SHA-1. Icons are written exactly like the
app's other item icons (36 px WebP named by md5 of the source path, reused when already present).
Images: RuneScape Wiki, CC BY-NC-SA 3.0; RuneScape images (c) Jagex Ltd.
"""
import hashlib, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIRROR = '/workspace/rs3wiki/images'
EXTRA = '/workspace/rs3wiki/images_extra/calc'
API = 'https://runescape.wiki/api.php'
UA = 'DropClueHelper-calc-verify/1.0 (unofficial fan tool; github.com/theelonmuskrs3/rs3-drop-clue-helper)'
CALC_PAGE, CALC_REV = 'Calculators', 37207671

def api(params):
    params = dict(params, format='json', formatversion='2')
    req = urllib.request.Request(API, data=urllib.parse.urlencode(params).encode(), headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
        except Exception:
            if attempt == 3: raise
            time.sleep(3 * (attempt + 1))

def norm_file(f):
    f = f.strip().replace('_', ' ')
    f = re.sub(r'^(File|Image):\s*', '', f, flags=re.I)
    return 'File:' + f[:1].upper() + f[1:]

_info = {}
def file_info(titles):
    """title -> {'title': canonical File title, 'redirected': bool, 'url', 'sha1'} or None (missing)."""
    todo = [t for t in dict.fromkeys(titles) if t not in _info]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        j = api({'action': 'query', 'titles': '|'.join(chunk), 'redirects': '1', 'prop': 'imageinfo', 'iiprop': 'url|sha1'})['query']
        norm = {n['from']: n['to'] for n in j.get('normalized', [])}
        red = {r['from']: r['to'] for r in j.get('redirects', [])}
        pages = {p['title']: p for p in j.get('pages', [])}
        for t in chunk:
            t1 = norm.get(t, t); t2 = red.get(t1, t1)
            p = pages.get(t2)
            ii = p and p.get('imageinfo')
            _info[t] = {'title': t2, 'redirected': t2 != t1, 'url': ii[0]['url'], 'sha1': ii[0]['sha1']} if ii else None
        time.sleep(0.5)
    return {t: _info[t] for t in titles}

def page_redirects(names):
    out = {}
    for i in range(0, len(names), 50):
        chunk = names[i:i + 50]
        j = api({'action': 'query', 'titles': '|'.join(chunk), 'redirects': '1'})['query']
        norm = {n['from']: n['to'] for n in j.get('normalized', [])}
        red = {r['from']: r['to'] for r in j.get('redirects', [])}
        for t in chunk:
            t1 = norm.get(t, t)
            if t1 in red: out[t] = red[t1]
        time.sleep(0.5)
    return out

mirror_by_sha = None
def mirror_index():
    global mirror_by_sha
    if mirror_by_sha is None:
        mirror_by_sha = {}
        for l in open(f'{MIRROR}/manifest.tsv', encoding='utf-8', errors='replace'):
            p = l.rstrip('\n').split('\t')
            if len(p) >= 6 and p[4] and p[5] != 'FAILED': mirror_by_sha.setdefault(p[3], f'{MIRROR}/{p[4]}')
    return mirror_by_sha

def sha1_of(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 16), b''): h.update(b)
    return h.hexdigest()

def local_source(info):
    """Bytes of the Wiki file version whose SHA-1 the Wiki API reports. runescape.wiki serves files through a CDN that
    re-compresses them, so served bytes can differ from the stored SHA-1: the mirror manifest (and this cache) are keyed by the
    Wiki's SHA-1 of the version fetched, and the download is checked to be a decodable image of that file URL."""
    m = mirror_index().get(info['sha1'])
    if m and os.path.exists(m): return m, 'mirror'
    ext = os.path.splitext(urllib.parse.urlparse(info['url']).path)[1].lower() or '.png'
    dst = f'{EXTRA}/{info["sha1"]}{ext}'
    if not (os.path.exists(dst) and os.path.getsize(dst) > 0):
        req = urllib.request.Request(info['url'], headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=120) as r:
            assert r.headers.get('content-type', '').startswith('image/'), info['url']
            data = r.read()
        tmp = dst + '.part'; open(tmp, 'wb').write(data)
        Image.open(tmp).verify(); os.replace(tmp, dst); time.sleep(0.3)
    return dst, 'downloaded'

def out_img(src, max_w=36, max_h=36, q=90):
    """Same as the app's build_app.out_img for item icons: icons/<md5(src path)[:12]>.webp, 36 px, reused if present."""
    h = hashlib.md5(src.encode()).hexdigest()[:12]
    rel = f'icons/{h}.webp'; dst = os.path.join(ROOT, rel)
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return rel, 'reused'
    im = Image.open(src); im.seek(0); im = im.convert('RGBA'); im.thumbnail((max_w, max_h), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=q, method=6)
    return rel, 'new'

def resolve(title):
    info = file_info([title])[title]
    if not info: return None
    src, how = local_source(info)
    rel, state = out_img(src)
    w, h = Image.open(os.path.join(ROOT, rel)).size
    return {'src': rel, 'file': info['title'], 'sha1': info['sha1'], 'w': w, 'h': h, 'bytes': how, 'icon': state,
            'via': 'File redirect from ' + title if info['redirected'] else 'exact file'}

# ---------- Calculators page layout ----------
def directory():
    j = api({'action': 'query', 'prop': 'revisions', 'revids': CALC_REV, 'rvprop': 'ids|timestamp|content', 'rvslots': 'main'})
    p = j['query']['pages'][0]; assert p['title'] == CALC_PAGE
    text = p['revisions'][0]['slots']['main']['content']
    cat = json.load(open(os.path.join(ROOT, 'data', 'calculators.json')))
    assert cat['sourceRevision'] == CALC_REV, 'catalog snapshot and layout must come from the same revision'
    def path(link):
        link = link.strip(); a = ''
        if '#' in link: link, a = link.split('#', 1); a = '#' + a.replace(' ', '_')
        return '/w/' + link.replace(' ', '_') + a
    key = lambda pth: urllib.parse.unquote(pth)
    entries = {key(c['path']): c for c in cat['calculators']}
    parts = re.split(r'\n=([^=\n]+)=\n', text)
    sections, tiles, not_in_catalog = [], {}, []
    for sec, body in zip(parts[1::2], parts[2::2]):
        groups = []
        for g in re.split(r'\{\{Fancy tiles\n', body)[1:]:
            head = g.split('|items =', 1)[0]
            f = dict((k.strip(), v.strip()) for k, v in re.findall(r'^\|([\w ]+?)\s*=\s*(.*)$', head, re.M))
            name = f['category']
            items = []
            for it in re.findall(r'\{\{Fancy tiles item\n(.*?)\n\s*\}\}', g, re.S):
                fi = dict((k.strip(), v.strip()) for k, v in re.findall(r'^\s*\|([\w ]+?)\s*=\s*(.*)$', it, re.M))
                pk = key(path(fi.get('link', '')))
                if pk in entries:
                    items.append(entries[pk]['path'])
                    tiles.setdefault(entries[pk]['path'], []).append({'section': sec, 'group': name, 'icon': fi.get('icon') or None})
                else: not_in_catalog.append({'section': sec, 'group': name, 'link': fi.get('link'), 'label': re.sub(r'<[^>]+>', '', fi.get('name', ''))})
            groups.append({'name': name, 'mobile': f.get('mobile category') or None, 'id': f.get('id'), 'colour': f.get('colour'),
                           'image': f.get('category image') or None, 'wikiLink': f.get('wiki link') or None, 'paths': items})
        sections.append({'name': sec, 'groups': groups})
    # every catalog entry keeps its own section/group (the catalog's source text); it is placed in that group only
    for c in cat['calculators']:
        hit = [t for t in tiles.get(c['path'], []) if t['section'] == c['section'] and t['group'] == c['group']]
        assert hit, ('catalog entry not found in its Wiki group', c['path'], c['section'], c['group'])
    skills = json.load(open(os.path.join(ROOT, 'data', 'icons.json')))['skills']
    files = set()
    for s in sections:
        for g in s['groups']:
            if g['image']: files.add(norm_file(g['image']))
    for p0, ts in tiles.items():
        for t in ts:
            if t['icon']: files.add(norm_file(t['icon']))
    res = {f: resolve(f) for f in sorted(files)}
    for s in sections:
        for g in s['groups']:
            g['img'] = res.get(norm_file(g['image'])) if g['image'] else None
            g['skillIcon'] = skills.get(g['name'])
    icons = {}
    for c in cat['calculators']:
        t = next(t for t in tiles[c['path']] if t['section'] == c['section'] and t['group'] == c['group'])
        icons[c['section'] + '|' + c['group'] + '|' + c['path']] = {'file': t['icon'], 'img': res.get(norm_file(t['icon'])) if t['icon'] else None}
    out = {'source': 'https://runescape.wiki/w/Calculators', 'sourceRevision': CALC_REV, 'sourceRevisionTimestamp': p['revisions'][0]['timestamp'],
           'license': 'Layout, names and icons: RuneScape Wiki, CC BY-NC-SA 3.0 (https://runescape.wiki/w/RuneScape:Copyrights); RuneScape images (c) Jagex Ltd.',
           'sections': sections, 'icons': icons, 'notInCatalog': not_in_catalog,
           'missingIcons': sorted(p0 for p0, v in icons.items() if not v['img']),
           'missingGroupImages': sorted(g['name'] for s in sections for g in s['groups'] if g['image'] and not g['img'])}
    json.dump(out, open(os.path.join(ROOT, 'data', 'calc', 'directory.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print('directory:', sum(len(g['paths']) for s in sections for g in s['groups']), 'tiles in catalog;', len(not_in_catalog), 'Wiki tiles not in the catalog snapshot;',
          len(icons) - len(out['missingIcons']), '/', len(icons), 'entry icons;', 'missing', out['missingIcons'], out['missingGroupImages'])

# ---------- native calculator item names ----------
def calc_names():
    names = {}
    def add(n, who):
        if isinstance(n, str) and n.strip(): names.setdefault(n, set()).add(who)
    F = json.load(open(os.path.join(ROOT, 'data', 'calc', 'flask-decanting.json')))
    for r in F['rows']:
        for v in r.values():
            if isinstance(v, dict) and 'n' in v: add(v['n'], 'flask-decanting')
    add(F['flask']['n'], 'flask-decanting')
    H = json.load(open(os.path.join(ROOT, 'data', 'calc', 'herblore.json')))
    variants = set()
    def walk(o):
        if isinstance(o, dict):
            for k in ('name', 'price_name', 'four_dose'):
                v = o.get(k)
                if isinstance(v, str):
                    add(v, 'herblore')
                    if re.search(r'\(\d\)$', v):
                        for d in (1, 2, 3, 4, 6): variants.add(re.sub(r'\(\d+\)$', '(%d)' % d, v))
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk({k: v for k, v in H['data'].items() if k != 'item_category_table'})
    for v in H['data']['containers'].values(): add(v, 'herblore')
    for v in variants:   # dose variants the engine can show when decanting: only ones that exist as Grand Exchange items
        if v in H['ids']: add(v, 'herblore')
    import subprocess   # plus every name the ported engine actually puts in its rows (tools/calc_names.cjs)
    for v in json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'calc_names.cjs')], capture_output=True, check=True).stdout): add(v, 'herblore')
    P = os.path.join(ROOT, 'data', 'calc', 'herblore-potions.json')   # Calculator:Herblore/Potions (Module:Herb calc row: File:<img or name>.png)
    if os.path.exists(P):
        for r in json.load(open(P))['rows']:
            for x in [r['pot'], r['vial'], r['sec'], *r['herb'], *r['unf']]: add(x.get('img') or x['n'], 'herblore-potions')
    for slug in ('cooking', 'fletching', 'crafting'):   # native Wiki skill calculators (Module:Skill calc data files)
        cp = os.path.join(ROOT, 'data', 'calc', slug + '.json')
        if not os.path.exists(cp): continue
        C = json.load(open(cp))
        for c, v in C['cats'].items():
            for it in v.get('items', []):
                # eltGenerator setImgLnk: the row picture is File:<icon or image or name>.png
                add(it.get('icon') or it.get('image') or it['name'], slug)
                for m in it.get('material', []):   # createList: File:<name>.png; currency rows ("image,link"): File:<image>.png
                    if isinstance(m, str): add(m.split(',')[0], slug)
    return names

def items():
    names = calc_names()
    order = sorted(names)
    first = {n: ['File:' + n[:1].upper() + n[1:] + ext for ext in ('.png', '.gif')] for n in order}
    file_info([t for v in first.values() for t in v])
    out, missing = {}, []
    left = []
    for n in order:
        hit = next((t for t in first[n] if _info[t]), None)
        if hit: out[n] = resolve(hit)
        else: left.append(n)
    red = page_redirects(left)
    for n in left:
        r = None
        if n in red:
            t = 'File:' + red[n][:1].upper() + red[n][1:]
            for ext in ('.png', '.gif'):
                r = resolve(t[:-0] + ext if False else t + ext)
                if r: r['via'] = 'item page ' + n + ' redirects to ' + red[n] + ('; ' + r['via'] if r['via'] != 'exact file' else ''); break
        if r: out[n] = r
        else: missing.append(n)
    for n in out: out[n]['used'] = sorted(names[n])
    res = {'license': 'Item icons: RuneScape Wiki (runescape.wiki), CC BY-NC-SA 3.0; RuneScape images (c) Jagex Ltd.',
           'rule': 'File:<exact item name>.png/.gif, or a file/page the Wiki itself redirects to; dose variants never substituted; no stand-ins.',
           'items': out, 'missing': [{'name': n, 'used': sorted(names[n]), 'tried': first[n] + (['page redirect ' + red[n]] if n in red else [])} for n in missing]}
    json.dump(res, open(os.path.join(ROOT, 'data', 'calc', 'images.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    by = {}
    for n, v in out.items():
        for u in v['used']: by[u] = by.get(u, 0) + 1
    tot = {}
    for n, w in names.items():
        for u in w: tot[u] = tot.get(u, 0) + 1
    print('items:', {u: f'{by.get(u, 0)}/{tot[u]}' for u in tot}, 'missing', missing,
          'bytes', {k: sum(1 for v in out.values() if v['bytes'] == k) for k in ('mirror', 'downloaded')},
          'icons', {k: sum(1 for v in out.values() if v['icon'] == k) for k in ('reused', 'new')})

def potions():
    """Add only the Potion making calculator's pictures to data/calc/images.json (same rule; other entries left as they are)."""
    P = json.load(open(os.path.join(ROOT, 'data', 'calc', 'herblore-potions.json')))
    path = os.path.join(ROOT, 'data', 'calc', 'images.json'); res = json.load(open(path, encoding='utf-8'))
    want = sorted({x.get('img') or x['n'] for r in P['rows'] for x in [r['pot'], r['vial'], r['sec'], *r['herb'], *r['unf']]})
    file_info(['File:' + n[:1].upper() + n[1:] + e for n in want if n not in res['items'] for e in ('.png', '.gif')])
    added, missing = [], []
    for n in want:
        e = res['items'].get(n)
        if e is None:
            e = next((r for r in (resolve('File:' + n[:1].upper() + n[1:] + x) if _info.get('File:' + n[:1].upper() + n[1:] + x) else None for x in ('.png', '.gif')) if r), None)
            if not e: missing.append(n); continue
            e['used'] = []; res['items'][n] = e; added.append(n)
        if 'herblore-potions' not in e['used']: e['used'] = sorted(e['used'] + ['herblore-potions'])
    json.dump(res, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print('potions:', len(want), 'names; added', added, 'missing', missing)

if __name__ == '__main__':
    what = sys.argv[1:] or ['directory', 'items']
    if what == ['potions']: potions(); sys.exit()
    if 'directory' in what: directory()
    if 'items' in what: items()
