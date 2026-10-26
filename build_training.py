"""Build data/train.json + data/t/*.json + timg/*.webp for the Training tab.
Source: RS3 wiki skill training guides only (offline copy), rendered to a small, safe HTML subset.
Nothing is invented: templates the wiki uses are expanded here; those that need the wiki's live Lua modules are dropped and the section is flagged."""
import os, re, sys, json, math, html, hashlib
sys.path.insert(0, '/workspace/rs3wiki/plugin/drop_clue_helper')
from wtlib import Resolver, read, no_comments, split_params, fname, subst_params, BASE

WIKI_URL = 'https://runescape.wiki/w/'
def wurl(t, anchor=''):
    return WIKI_URL + re.sub(r"[^A-Za-z0-9_\-.~:/()',!*]", lambda m: ''.join('%%%02X' % b for b in m.group(0).encode()), t.replace(' ', '_')) + (('#' + re.sub(r"[^A-Za-z0-9_\-.:()',!*]", lambda m: '.' + '.'.join('%02X' % b for b in m.group(0).encode()), anchor.replace(' ', '_'))) if anchor else '')

SKILLS = ['Attack', 'Strength', 'Defence', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing',
          'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecrafting', 'Hunter', 'Construction', 'Summoning', 'Dungeoneering', 'Divination', 'Invention',
          'Archaeology', 'Necromancy']
CAP = {s: 99 for s in SKILLS}
CAP.update({s: 120 for s in ('Herblore', 'Slayer', 'Farming', 'Dungeoneering', 'Invention', 'Archaeology', 'Necromancy')})
ELITE = {'Invention'}
MELEE = [('Pay-to-play melee training', 'p2p'), ('Free-to-play melee training', 'f2p')]
GUIDES = {
    'Attack': MELEE, 'Strength': MELEE,
    'Defence': [('Defence training', 'both')] + MELEE,
    'Constitution': [('Pay-to-play Constitution training', 'p2p'), ('Free-to-play Constitution training', 'f2p')] + MELEE,
    'Necromancy': [('Necromancy training', 'p2p')], 'Slayer': [('Slayer training', 'p2p')], 'Summoning': [('Summoning training', 'p2p'), ('Summoning training/Obtaining charms', 'p2p')],
    'Hunter': [('Hunter training', 'p2p')], 'Thieving': [('Thieving training', 'p2p')], 'Agility': [('Agility training', 'p2p')], 'Archaeology': [('Archaeology training', 'p2p')],
    'Construction': [('Construction training', 'p2p')], 'Divination': [('Divination training', 'p2p')], 'Farming': [('Farming training', 'p2p')],
    'Herblore': [('Herblore training', 'p2p')], 'Invention': [('Invention training', 'p2p')],
}
for s in ('Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Runecrafting', 'Dungeoneering'):
    GUIDES[s] = [(f'Pay-to-play {s} training', 'p2p'), (f'Free-to-play {s} training', 'f2p')]
assert set(GUIDES) == set(SKILLS), set(SKILLS) ^ set(GUIDES)
SKIP_H2 = re.compile(r'^(see also|references?|notes?|trivia|gallery|navigation|external links)$', re.I)

res = Resolver()
_tpl_cache = {}
def tpl_text(name, depth=0):
    n = name.strip().replace('_', ' ')
    if n in _tpl_cache: return _tpl_cache[n]
    v = None
    for cand in (n, n[:1].upper() + n[1:]):
        p = os.path.join(BASE, 'ns/Template', fname('Template:' + cand))
        if os.path.exists(p):
            t = read(p)
            m = re.match(r'\s*#redirect\s*\[\[\s*Template:([^\]|#]+)', t, re.I)
            if m and depth < 4: v = tpl_text(m.group(1), depth + 1)
            else:
                t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
                m = re.search(r'<onlyinclude>(.*?)</onlyinclude>', t, re.S)
                if m: t = m.group(1)
                t = re.sub(r'<noinclude>.*?</noinclude>', '', t, flags=re.S)
                t = re.sub(r'</?includeonly>', '', t)
                v = t
            break
    _tpl_cache[n] = v
    return v

# ---------------------------------------------------------------- tiny safe arithmetic for #expr
_TOK = re.compile(r'\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[()+\-*/^]|mod|round|ceil|floor|trunc|abs|min|max|sqrt|ln|exp|and|or|not|<=|>=|<>|!=|=|<|>|,)', re.I)
def expr_eval(s):
    s = (s or '').strip()
    if not s: return ''
    toks, pos = [], 0
    while pos < len(s):
        m = _TOK.match(s, pos)
        if not m:
            if s[pos:].strip() == '': break
            raise ValueError('tok')
        toks.append(m.group(1).lower()); pos = m.end()
    i = [0]
    def peek(): return toks[i[0]] if i[0] < len(toks) else None
    def nxt(): i[0] += 1; return toks[i[0] - 1]
    def prim():
        t = nxt()
        if t == '(':
            v = orx(); assert nxt() == ')'; return v
        if t == '-': return -prim()
        if t == '+': return prim()
        if t == 'not': return 0.0 if prim() else 1.0
        if t in ('ceil', 'floor', 'trunc', 'abs', 'sqrt', 'ln', 'exp'):
            v = prim(); return {'ceil': math.ceil, 'floor': math.floor, 'trunc': math.trunc, 'abs': abs, 'sqrt': math.sqrt, 'ln': math.log, 'exp': math.exp}[t](v)
        if t == 'round':
            # wiki writes "x round 0"
            return prim()
        return float(t)
    def pw():
        v = prim()
        while peek() == '^': nxt(); v = v ** prim()
        return v
    def mul():
        v = pw()
        while peek() in ('*', '/', 'mod'):
            o = nxt(); r = pw()
            v = v * r if o == '*' else (v / r if o == '/' else math.fmod(v, r))
        return v
    def add():
        v = mul()
        while peek() in ('+', '-'):
            o = nxt(); r = mul(); v = v + r if o == '+' else v - r
        # postfix: round N
        while peek() == 'round':
            nxt(); d = int(add_simple()); v = round_half_up(v, d)
        return v
    def add_simple():
        return mul()
    def cmp_():
        v = add()
        while peek() in ('<=', '>=', '<>', '!=', '=', '<', '>'):
            o = nxt(); r = add()
            v = float({'<=': v <= r, '>=': v >= r, '<>': v != r, '!=': v != r, '=': v == r, '<': v < r, '>': v > r}[o])
        return v
    def andx():
        v = cmp_()
        while peek() == 'and': nxt(); r = cmp_(); v = float(bool(v) and bool(r))
        return v
    def orx():
        v = andx()
        while peek() == 'or': nxt(); r = andx(); v = float(bool(v) or bool(r))
        return v
    v = orx()
    if i[0] != len(toks): raise ValueError('trail')
    return v
def round_half_up(v, d):
    q = 10 ** d
    return math.floor(v * q + 0.5) / q if v >= 0 else -math.floor(-v * q + 0.5) / q
def numfmt(v):
    if isinstance(v, str): return v
    if v != v or v in (float('inf'), float('-inf')): return ''
    if abs(v - round(v)) < 1e-9: return str(int(round(v)))
    return ('%.10g' % v)

def fmt_int(s):
    try:
        f = float(str(s).replace(',', '').strip())
        return f'{int(round(f)):,}' if abs(f - round(f)) < 1e-9 else f'{f:,.2f}'.rstrip('0').rstrip('.')
    except Exception: return str(s)

class Ctx:
    def __init__(self, ge, skills):
        self.ge = ge; self.skills = skills
        self.vars = {}; self.unres = set(); self.reqs = []; self.maps = []; self.ge_used = 0; self.ge_miss = set(); self.depth = 0
SKL = {s.lower(): s for s in SKILLS + ['Dungeoneering', 'Constitution', 'Hitpoints', 'Summoning']}

def split_top(body):
    parts, dt, dl, cur, i, n = [], 0, 0, [], 0, len(body)
    while i < n:
        c2 = body[i:i+2]
        if c2 == '{{': dt += 1; cur.append(c2); i += 2; continue
        if c2 == '}}' and dt: dt -= 1; cur.append(c2); i += 2; continue
        if c2 == '[[': dl += 1; cur.append(c2); i += 2; continue
        if c2 == ']]' and dl: dl -= 1; cur.append(c2); i += 2; continue
        if body[i] == '|' and dt == 0 and dl == 0: parts.append(''.join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    parts.append(''.join(cur)); return parts

def match_close(text, i):
    """index just after the }} matching the {{ at i, or -1"""
    d, n, j = 0, len(text), i
    while j < n - 1:
        c2 = text[j:j+2]
        if c2 == '{{': d += 1; j += 2; continue
        if c2 == '}}':
            d -= 1; j += 2
            if d == 0: return j
            continue
        j += 1
    return -1

def parse_args(parts, expand_fn):
    pos, named = [], {}
    for p in parts:
        m = re.match(r'\s*([^=\n{}\[\]|]{1,40}?)\s*=(.*)$', p, re.S)
        if m: named[m.group(1).strip().lower()] = expand_fn(m.group(2)).strip()
        else: pos.append(expand_fn(p).strip())
    return pos, named

def expand(text, C, depth=0):
    if depth > 7 or '{{' not in text: return text
    out, i, n = [], 0, len(text)
    while i < n:
        j = text.find('{{', i)
        if j < 0: out.append(text[i:]); break
        out.append(text[i:j])
        if text.startswith('{{{', j):
            k = text.find('}}}', j)
            out.append(''); i = k + 3 if k > 0 else n; continue
        e = match_close(text, j)
        if e < 0: out.append(text[j:]); break
        out.append(eval_tpl(text[j+2:e-2], C, depth)); i = e
    return ''.join(out)

def truthy(s): return bool(s.strip())
def eval_tpl(body, C, depth):
    parts = split_top(body)
    head = re.sub(r'^(?:safesubst|subst):', '', parts[0].strip(), flags=re.I)
    parts[0] = head
    if re.match(r'(?:fullurl|ns|localurl|urlencode|anchorencode|canonicalurl):|(?:NAMESPACE|PAGENAME|FULLPAGENAME|SITENAME)$', head, re.I): return ''
    ex = lambda s: expand(s, C, depth + 1)
    if head.startswith('#') or (':' in head and head.split(':', 1)[0].strip().lower() in ('formatnum', 'lc', 'uc', 'ucfirst', 'lcfirst', 'urlencode', 'padleft', 'plural', 'anchorencode')):
        fn, _, a0 = head.partition(':'); fn = fn.strip().lower()
        rest = [a0] + parts[1:]
        if fn == '#expr' or fn == '#ifexpr':
            v = None
            try: v = expr_eval(ex(a0))
            except Exception: v = None
            if fn == '#expr':
                if v is None: C.unres.add('#expr'); return ''
                # "round" suffix handled by parser; format plain
                return numfmt(v)
            if v is None: v = 0
            return ex(rest[1]) if v else (ex(rest[2]) if len(rest) > 2 else '')
        if fn == '#if': return ex(rest[1]) if truthy(ex(a0)) and len(rest) > 1 else (ex(rest[2]) if len(rest) > 2 and not truthy(ex(a0)) else '')
        if fn == '#ifeq':
            a, b = ex(a0).strip(), ex(rest[1]).strip() if len(rest) > 1 else ''
            try: eq = float(a.replace(',', '')) == float(b.replace(',', ''))
            except Exception: eq = a == b
            return ex(rest[2]) if eq and len(rest) > 2 else (ex(rest[3]) if not eq and len(rest) > 3 else '')
        if fn == '#ifexist': return ex(rest[2]) if len(rest) > 2 else ''
        if fn == '#switch':
            v = ex(a0).strip(); default = None; hit = False
            for p in rest[1:]:
                if '=' in p and not p.lstrip().startswith(('{{', '[[')) or re.match(r'[^{}\[\]]*=', p):
                    k, _, val = p.partition('=')
                    k = ex(k).strip()
                    if hit or k == v: return ex(val)
                    if k == '#default': default = val
                else:
                    k = ex(p).strip()
                    if k == v: hit = True
                    if k == '#default': default = p
            return ex(default) if default is not None else ''
        if fn in ('#var', '#vardefine', '#vardefineecho'):
            name = ex(a0).strip()
            if fn == '#var': return C.vars.get(name, ex(rest[1]) if len(rest) > 1 else '')
            val = ex(rest[1]).strip() if len(rest) > 1 else ''
            C.vars[name] = val
            return val if fn == '#vardefineecho' else ''
        if fn in ('#invoke', '#dpl', '#lst', '#lsth', '#tag', '#time', '#timel', '#ask', '#cargo_query', '#bucket'):
            C.unres.add(a0.strip() or fn); return ''
        if fn == 'formatnum': return fmt_int(ex(a0))
        if fn in ('lc', 'uc'): return ex(a0).lower() if fn == 'lc' else ex(a0).upper()
        if fn == 'ucfirst': s = ex(a0); return s[:1].upper() + s[1:]
        if fn == 'lcfirst': s = ex(a0); return s[:1].lower() + s[1:]
        return ''
    nm = head.lower().replace('_', ' ')
    if nm in ('!',): return '|'
    if nm == '=': return '='
    if nm == '!!': return '!!'
    if nm == 'pipe' or nm == '!-': return '|-'
    if nm == 'nbsp': return '\u00a0'
    pos, named = parse_args(parts[1:], ex)
    P = lambda k, d='': pos[k] if len(pos) > k else d
    if nm in ('geprice', 'gep', 'geitem'):
        name = P(0)
        pr = C.ge(name)
        if pr is None: C.ge_miss.add(name); C.unres.add('GE price ' + name); return ''
        C.ge_used += 1
        return str(int(pr))
    if nm in ('coins', 'nocoins', 'coins short', 'cs'):
        v = P(0).replace(',', '').strip()
        if not v: return ''
        try:
            f = float(v)
            if nm == 'coins short':
                return (f'{f/1e9:.2f}b' if f >= 1e9 else f'{f/1e6:.2f}m' if f >= 1e6 else f'{f/1e3:.1f}k' if f >= 1e4 else f'{int(f):,}').replace('.00', '').replace('.0b', 'b') + ' gp'
            return fmt_int(f) + ' gp'
        except Exception: return P(0) + ' gp'
    if nm in ('sc', 'scm', 'scp', 'scl', 'skill clickpic', 'skillreq', 'skill icon', 'skill', 'sci'):
        s = P(0)
        sk = SKL.get(s.lower().strip(), s.strip())
        lvl = P(1)
        if nm in ('scm', 'skillreq', 'scp') and lvl.strip().isdigit():
            C.reqs.append((sk, int(lvl))); return f'{lvl.strip()} {sk}'
        if nm in ('scp', 'scl') and lvl.strip().isdigit(): return f'{lvl.strip()} {sk}'
        return sk
    if nm in ('plink', 'plinkt', 'plinkp', 'ilink', 'ilinkt', 'ilinkp', 'pic link', 'pic link plain', 'pic link table', 'linkt', 'link', 'slink', 'ul', 'npclink', 'questlink', 'qlink'):
        t = P(0); txt = named.get('txt') or named.get('text') or (P(1) if nm in ('ilinkt',) else '') or t
        if nm in ('plinkt', 'pic link table') and (named.get('txt') is None): txt = t
        return f'[[{t}|{txt}]]' if t else ''
    if nm in ('nowrap', 'nw', 'small', 'sic', 'abbr', 'tooltip', 'colour', 'color', 'sup', 'sub'):
        return P(1) if nm in ('colour', 'color') else P(0)
    if nm == 'replace': return P(0).replace(P(1), P(2))
    if nm == 'maplink' or nm == 'map':
        x = named.get('x'); y = named.get('y')
        if x is None or y is None:
            for q in pos:
                m = re.match(r'\s*(?:x\s*[:=]\s*)?(-?\d+)\s*,\s*(?:y\s*[:=]\s*)?(-?\d+)', q)
                if m: x, y = m.group(1), m.group(2); break
        try: xi, yi = int(float(x)), int(float(y))
        except Exception: return named.get('text') or ''
        mid = named.get('mapid') or '28'
        mid = int(mid) if re.fullmatch(r'-?\d+', mid.strip()) else 28
        pl = named.get('plane') or '0'
        C.maps.append({'map': mid, 'plane': int(pl) if pl.strip().isdigit() else 0, 'x': xi, 'y': yi, 'l': named.get('text') or named.get('caption') or ''})
        return '\x01%d\x02' % (len(C.maps) - 1)
    if nm in ('affiliated discord', 'hascalc', 'clear', 'clr', 'toc', 'reflist', 'external', 'otheruses', 'see also', 'main', 'training guides', 'disambig', 'hatnote', 'cite', 'ref', 'refn', 'incomplete', 'anchor',
              'for', 'about', 'quest icon', 'questicon', 'checklist', 'members', 'f2p', 'p2p', 'edit', 'update', 'recent', 'stub', 'cn', 'citation needed', 'sectionstub', 'unreleased', 'navbox', 'hasquickguide', 'has quick guide'):
        if nm == 'members': return ''
        return ''
    if nm in ('yes', 'no', 'na', 'n/a'): return {'yes': 'Yes', 'no': 'No', 'na': 'N/A', 'n/a': 'N/A'}[nm]
    # the wiki's own template page
    src = tpl_text(head)
    if src is None: C.unres.add(head); return ''
    if depth > 5: return ''
    args = {k: v for k, v in named.items()}
    for k, v in enumerate(pos): args[str(k + 1)] = v
    C.depth += 1
    try:
        s2 = subst_params(src, args)
        return expand(s2, C, depth + 1)
    finally: C.depth -= 1

# ---------------------------------------------------------------- wikitext -> small safe HTML
E = html.escape
OK_HOSTS = ('runescape.wiki', 'www.runescape.com', 'runescape.com', 'secure.runescape.com', 'support.runescape.com', 'www.jagex.com')

class R:
    """renders one section"""
    def __init__(self, env, C):
        self.env, self.C = env, C
        self.items, self.quests, self.wl = [], [], []
        self.n_img = 0
    # ---- links
    def link(self, target, text):
        env = self.env
        t = target.strip().replace('_', ' ')
        anchor = ''
        if '#' in t: t, anchor = t.split('#', 1)
        if not t:
            return E(text)
        tl = t.lstrip(':')
        if re.match(r'(file|image|media|category):', tl, re.I): return ''
        shown = E(text or t)
        key = tl[:1].upper() + tl[1:]
        sk = SKL.get(key.lower())
        if sk in env['skills'] and not anchor:
            return f'<a class="tl" href="#train/{E(sk)}">{shown}</a>'
        if key in env['quests']:
            if key not in self.quests: self.quests.append(key)
            return f'<a class="ql" href="#quests/{E(requote(key))}">{shown}</a>'
        it = env['item_of'](key)
        if it:
            if it not in self.items: self.items.append(it)
            return f'<a class="ti" data-i="{E(it)}" href="#items/{E(requote(it))}">{shown}</a>'
        if key not in self.wl: self.wl.append(key)
        return f'<a class="wl" href="{E(wurl(tl, anchor))}" target="_blank" rel="noopener noreferrer">{shown}</a>'
    def img(self, spec, in_cell=False):
        parts = [p.strip() for p in spec.split('|')]
        fn = re.sub(r'^(file|image):', '', parts[0], flags=re.I).strip()
        size = 0
        for p in parts[1:]:
            m = re.match(r'(?:(\d+)x)?(\d+)\s*px$', p) or re.match(r'width\s*=\s*(\d+)', p)
            if m: size = int(m.groups()[-1]); break
        f = self.env['find_file'](fn)
        if not f or not self.env['decodes'](f): return ''
        o = self.env['out_img'](f, 'timg', 220, 220, 82)
        if not o: return ''
        self.env['used'].add(o); self.n_img += 1
        cls = 'tic' if (in_cell or (size and size <= 44)) else 'tpic'
        return f'<img class="{cls}" loading="lazy" src="{E(o)}" alt="">'
    # ---- inline
    def inline(self, s, in_cell=False):
        C = self.C
        s = re.sub(r'<ref[^>]*?/>|<ref[^>]*>.*?</ref>', '', s, flags=re.S | re.I)
        s = re.sub(r'<nowiki\s*/?>|</nowiki>', '', s, flags=re.I)
        s = re.sub(r'<br\s*/?>', '\x03', s, flags=re.I)
        for t in ('sup', 'sub', 'small', 'b', 'i', 'u', 'code', 'strong', 'em'):
            s = re.sub(rf'<{t}(?:\s[^>]*)?>', f'\x04{t}\x05', s, flags=re.I); s = re.sub(rf'</{t}>', f'\x04/{t}\x05', s, flags=re.I)
        s = re.sub(r'<[^>]+>', '', s)
        out = []
        # [[...]] first
        def lk(m):
            inner = m.group(1)
            if re.match(r'\s*:?(file|image):', inner, re.I):
                return '\x06' + self.img(inner.split('|', 1)[0] if False else inner, in_cell) + '\x07'
            if re.match(r'\s*:?category:', inner, re.I): return ''
            tg, _, tx = inner.partition('|')
            if '|' in tx: tx = tx.split('|')[-1]
            return '\x06' + self.link(tg, tx or tg.split('#')[0]) + '\x07'
        # nested [[File:x|caption [[link]]]] rare: handle simple
        s = re.sub(r'\[\[((?:[^\[\]]|\[\[[^\]]*\]\])*)\]\]', lk, s)
        def ext(m):
            u, tx = m.group(1), m.group(2) or ''
            host = re.match(r'https?://([^/\s]+)', u)
            if host and host.group(1).lower() in OK_HOSTS: return '\x06' + f'<a class="wl" href="{E(u)}" target="_blank" rel="noopener noreferrer">{E(tx or u)}</a>' + '\x07'
            return E(tx)
        s = re.sub(r'\[(https?://[^\s\]]+)(?:\s+([^\]]*))?\]', lambda m: ext(m), s)
        s = re.sub(r'(?<![\x06\w])https?://\S+', '', s)
        # split protected html chunks (\x06..\x07) from text
        res_, i = [], 0
        for m in re.finditer(r'\x06(.*?)\x07', s, re.S):
            res_.append(self._text(s[i:m.start()])); res_.append(m.group(1)); i = m.end()
        res_.append(self._text(s[i:]))
        h = ''.join(res_)
        return h
    def _text(self, t):
        t = E(t, quote=False)
        t = re.sub(r"'''''(.+?)'''''", r'<b><i>\1</i></b>', t)
        t = re.sub(r"'''(.+?)'''", r'<b>\1</b>', t)
        t = re.sub(r"''(.+?)''", r'<i>\1</i>', t)
        t = t.replace("'''", '').replace("''", '')
        t = t.replace('\x03', '<br>')
        t = re.sub(r'\x04(/?)(\w+)\x05', lambda m: f'<{m.group(1)}{m.group(2)}>', t)
        t = re.sub(r'\x01(\d+)\x02', lambda m: self.mapbtn(int(m.group(1))), t)
        return t
    def mapbtn(self, k):
        m = self.C.maps[k]
        o = {'map': m['map'], 'plane': m['plane'], 'x': m['x'], 'y': m['y'], 'pins': [[m['x'], m['y']]], 'label': m['l'] or self.env['title']}
        self.env['maps'].append(o)
        return f'<button type="button" class="btn mini tmap" data-mm="{E(json.dumps(o, separators=(",", ":")))}" data-t="Find on map">Find on map</button>'
    # ---- blocks
    def render(self, text):
        text = text.replace('\r', '')
        text = re.sub(r'<ref[^>/]*>.*?</ref>', '', text, flags=re.S | re.I)
        text = re.sub(r'<gallery[^>]*>(.*?)</gallery>', lambda m: '\n'.join('[[' + l.split('|')[0].strip() + ']]' for l in m.group(1).split('\n') if l.strip()) + '\n', text, flags=re.S | re.I)
        lines = text.split('\n')
        out, i, n = [], 0, len(lines)
        para = []
        def flush():
            if para:
                h = self.inline(' '.join(para).strip())
                if re.sub(r'<[^>]+>|\s|\u00a0', '', h): out.append(f'<p>{h}</p>')
                para.clear()
        while i < n:
            ln = lines[i]; st = ln.strip()
            if st.startswith('{|'):
                flush()
                depth, j = 0, i
                while j < n:
                    s2 = lines[j].strip()
                    if s2.startswith('{|'): depth += 1
                    if s2.startswith('|}'):
                        depth -= 1
                        if depth == 0: break
                    j += 1
                out.append(self.table(lines[i:j + 1])); i = j + 1; continue
            m = re.match(r'^([*#:;]+)\s*(.*)$', ln)
            if m:
                flush()
                items = []
                while i < n and re.match(r'^[*#:;]+', lines[i]):
                    mm = re.match(r'^([*#:;]+)\s*(.*)$', lines[i]); items.append((mm.group(1), mm.group(2))); i += 1
                out.append(self.lst(items)); continue
            if not st:
                flush(); i += 1; continue
            mh = re.match(r'^(=+)\s*(.*?)\s*\1$', st)
            if mh:
                flush(); hh = self.inline(mh.group(2))
                if re.sub(r'<[^>]+>|\s', '', hh): out.append(f'<h5>{hh}</h5>')
                i += 1; continue
            if re.fullmatch(r'-{4,}', st): flush(); i += 1; continue
            if re.fullmatch(r'\[\[(?:File|Image):[^\]]*\]\]', st, re.I):
                flush(); h = self.img(st[2:-2]); 
                if h: out.append(h)
                i += 1; continue
            para.append(st); i += 1
        flush()
        return ''.join(out)
    def lst(self, items):
        out, stack = [], []
        for pre, tx in items:
            c = pre[-1]; kind = 'ol' if c == '#' else 'ul'
            depth = min(len(pre), 3)
            if c in ':;': 
                out.append(f'<div class="ind">{self.inline(tx)}</div>') if not stack else None
                if stack: out.append(f'<li class="nb">{self.inline(tx)}</li>')
                continue
            while len(stack) > depth: out.append(f'</li></{stack.pop()}>')
            if len(stack) == depth: out.append('</li>')
            while len(stack) < depth:
                stack.append(kind); out.append(f'<{kind}>')
            out.append(f'<li>{self.inline(tx)}')
        while stack: out.append(f'</li></{stack.pop()}>')
        return ''.join(out)
    def table(self, lines):
        rows, cur, hdr_row = [], None, False
        cap = ''
        def cells_from(line, kind):
            res_ = []
            line = line[1:]
            sep = '!!' if kind == 'th' else '||'
            segs = re.split(r'\|\||!!' if kind == 'th' else r'\|\|', line)
            for seg in segs:
                attrs = ''
                m = re.match(r'^([^|\[\{]*?)\|(?!\|)(.*)$', seg, re.S)
                if m and re.search(r'(colspan|rowspan|style|class|width|align|scope|data-)\s*=', m.group(1)): attrs, seg = m.group(1), m.group(2)
                cs = re.search(r'colspan\s*=\s*"?(\d+)', attrs); rs = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
                res_.append({'k': kind, 't': seg.strip(), 'cs': int(cs.group(1)) if cs else 1, 'rs': int(rs.group(1)) if rs else 1})
            return res_
        for ln in lines[1:-1]:
            s = ln.strip()
            if s.startswith('|-'):
                cur = None; continue
            if s.startswith('|+'): cap = s[2:].split('|')[-1].strip(); continue
            if s.startswith('!'):
                if cur is None: cur = []; rows.append(cur)
                cur.extend(cells_from(s, 'th')); continue
            if s.startswith('|'):
                if cur is None: cur = []; rows.append(cur)
                cur.extend(cells_from(s, 'td')); continue
            if cur and cur: cur[-1]['t'] += '\n' + ln
        rows = [r for r in rows if r]
        if not rows: return ''
        h = ['<div class="tscroll"><table class="tt">']
        if cap: h.append(f'<caption>{self.inline(cap)}</caption>')
        for r in rows:
            h.append('<tr>')
            for c in r:
                sub = self.cell(c['t'])
                a = (f' colspan="{min(c["cs"], 12)}"' if c['cs'] > 1 else '') + (f' rowspan="{min(c["rs"], 12)}"' if c['rs'] > 1 else '')
                h.append(f'<{c["k"]}{a}>{sub}</{c["k"]}>')
            h.append('</tr>')
        h.append('</table></div>')
        return ''.join(h)
    def cell(self, t):
        t = t.strip()
        if '\n' in t and re.search(r'^[*#]', t, re.M):
            ls = [l for l in t.split('\n')]
            pre, items, k = [], [], 0
            body = []
            for l in ls:
                if re.match(r'^[*#]+', l): items.append(l)
                else:
                    if items: body.append(self.lst([(re.match(r'^[*#:;]+', x).group(0), re.sub(r'^[*#:;]+\s*', '', x)) for x in items])); items = []
                    if l.strip(): body.append(self.inline(l, True))
            if items: body.append(self.lst([(re.match(r'^[*#:;]+', x).group(0), re.sub(r'^[*#:;]+\s*', '', x)) for x in items]))
            return ''.join(body)
        return self.inline(t.replace('\n', ' '), True)

def requote(s):
    from urllib.parse import quote
    return quote(s, safe="!'()*-._~")

# ---------------------------------------------------------------- guide -> sections
R_HEAD = re.compile(r'^(={2,6})\s*(.*?)\s*\1\s*$', re.M)
def plain(h): return html.unescape(re.sub(r'<[^>]+>', '', h or '')).replace('\u00a0', ' ').strip()
def lv_range(title, cap):
    t = title
    m = re.search(r'(?:levels?|lvls?)\s*(\d{1,3})\s*(?:[–—\-]|to)\s*(\d{1,3})(\+?)', t, re.I) or re.search(r'\(?\b(\d{1,3})\s*[–—\-]\s*(\d{1,3})(\+?)\)?', t)
    if m and int(m.group(1)) <= int(m.group(2)) <= 150: return int(m.group(1)), int(m.group(2))
    m = re.search(r'(?:levels?|lvls?)\s*(\d{1,3})\s*\+', t, re.I) or re.search(r'\((\d{1,3})\+\)', t) or re.search(r'\b(\d{1,3})\+', t)
    if m and int(m.group(1)) <= 150: return int(m.group(1)), max(cap, int(m.group(1)))
    m = re.search(r'(?:levels?|lvls?)\s*(\d{1,3})\b', t, re.I)
    if m and int(m.group(1)) <= 150: return int(m.group(1)), None
    return None
R_AFK = re.compile(r'\bAFK\b|low[- ]attention|minimal attention|little (?:to no )?attention|less (?:effort|attention)|semi-AFK|very relaxing|requires little', re.I)
R_PROFIT = re.compile(r'\bprofit(?:able|s)?\b|money[- ]making|\bmake[s]? (?:a )?(?:gp|money|coins|profit)', re.I)
R_CHEAP = re.compile(r'\b(?:cheap(?:est)?|inexpensive|low[- ]cost|no cost|costs? nothing|free of charge|at no cost|budget)\b', re.I)
R_NUM = r'(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?'
def numv(a, u):
    v = float(a.replace(',', ''))
    return v * (1000 if u in ('k', 'K') else 1e6 if u in ('m', 'M') else 1)
R_XPH = re.compile(R_NUM + r'(?:\s*(?:[–—\-]|to)\s*' + R_NUM + r')?\s*(?:\+\s*)?(?:base\s+|bonus\s+|total\s+)?(?:[A-Za-z]+\s+)?(?:experience|exp|xp)\s*(?:per hour|/\s*h(?:ou)?r|an hour|each hour|/h)', re.I)
R_XPH2 = re.compile(r'(?:experience|exp|xp)\s*(?:rates?\s*)?(?:of|is|are)?\s*(?:up to\s*|around\s*|about\s*)?' + R_NUM + r'(?:\s*(?:[–—\-]|to)\s*' + R_NUM + r')?\s*(?:per hour|/\s*h(?:ou)?r|an hour|/h)', re.I)
def xph_of(text):
    lo = hi = None
    for m in list(R_XPH.finditer(text)) + list(R_XPH2.finditer(text)):
        g = m.groups()
        try:
            a = numv(g[0], g[1]); b = numv(g[2], g[3]) if g[2] else a
        except Exception: continue
        if a < 500 or b > 20_000_000: continue
        lo = a if lo is None else min(lo, a); hi = b if hi is None else max(hi, b)
    return [int(lo), int(hi)] if lo is not None else None
R_COST = re.compile(r'[^.!?\n]*(?:\bgp\b|coins|\bcosts?\b|profit|loss)[^.!?\n]*', re.I)
def cost_notes(text):
    out = []
    for m in R_COST.finditer(text):
        s = m.group(0).strip()
        if not re.search(r'\d', s) or len(s) < 12: continue
        if not re.search(r'\bcosts?\b|gp/xp|per xp|profit|loss|\bper hour\b|each\b|total', s, re.I): continue
        if len(s) > 190: s = s[:187].rsplit(' ', 1)[0] + '…'
        out.append(s)
        if len(out) == 2: break
    return out
R_LV = re.compile(r'\b(?:level\s+)?(\d{1,3})\s+(' + '|'.join(SKILLS + ['Hitpoints']) + r')\b|\b(' + '|'.join(SKILLS) + r')\s+level\s+(\d{1,3})\b|\blevel\s+(\d{1,3})\s+(' + '|'.join(SKILLS) + r')\b', re.I)

def make_card(env, g, title, anchor, level, raw, C, rend, cap, inherit):
    C.reqs, C.maps, C.unres = [], [], set(); C.ge_used = 0
    rend.items, rend.quests, rend.wl = [], [], []
    rend.n_img = 0
    env['maps'] = []
    body = expand(raw, C)
    body = body.replace('\r', '')
    h = rend.render(body)
    if not plain(h) and 'class="tpic"' not in h and '<table' not in h: return None
    txt = plain(re.sub(r'</?(?:p|li|tr|br|h5|div|caption)[^>]*>', '. ', h).replace('</td>', ' ').replace('</th>', ' '))
    txt = re.sub(r'\s+', ' ', txt)
    own = lv_range(title, cap)
    rng = own or inherit
    card = {'t': title, 'g': g, 'h': h, 'a': anchor}
    if rng: card['lo'] = rng[0]; card['hi'] = rng[1] if rng[1] is not None else rng[0]
    is_m = bool(own) or bool(re.search(r'method|train|money|profit|activit', g, re.I) and not re.search(r'summary|overview|^about', title, re.I))
    if is_m: card['m'] = 1
    if len(h) < 300 and C.unres and not own: return None
    tl = re.sub(r'\bfree[- ]to[- ]play\b|\bf2p\b', '', txt, flags=re.I)
    tags = []
    if R_AFK.search(txt): tags.append('afk')
    if R_CHEAP.search(tl): tags.append('cheap')
    if R_PROFIT.search(tl): tags.append('profit')
    if tags and is_m: card['tg'] = tags
    x = xph_of(txt)
    if x and is_m: card['xph'] = x
    cn = cost_notes(txt)
    if cn and is_m: card['cn'] = cn
    lv = {}
    for sk, l in C.reqs: lv[sk] = max(lv.get(sk, 0), l)
    for m in R_LV.finditer(txt):
        a = m.groups()
        if a[0]: n, s = a[0], a[1]
        elif a[2]: s, n = a[2], a[3]
        else: n, s = a[4], a[5]
        s = SKL.get(s.lower(), s)
        if int(n) <= 150 and s in SKILLS: lv.setdefault(s, int(n))
    if lv and is_m: card['rq'] = [[s, l] for s, l in sorted(lv.items(), key=lambda kv: -kv[1])][:8]
    if rend.quests and is_m: card['q'] = rend.quests[:12]
    if rend.items: card['it'] = [[n, env['ge'](n), env['ico'](n)] for n in rend.items[:14]]
    m = re.search(r'<img class="tpic"[^>]*src="([^"]+)"', h)
    if m: card['p'] = m.group(1)
    if C.unres: card['pt'] = 1
    env['stats']['unres'].update(C.unres)
    if env['maps']: card['mp'] = len(env['maps'])
    return card

def build_guide(env, title, kind, cap):
    t, raw = res.get(title)
    if not raw: raise SystemExit('missing guide page ' + title)
    raw = no_comments(raw)
    raw = re.sub(r'<noinclude>.*?</noinclude>', '', raw, flags=re.S)
    C = Ctx(env['ge'], env['skills']); env['C'] = C
    rend = R(env, C); env['title'] = t or title
    heads = [(len(m.group(1)), m.group(2), m.start(), m.end()) for m in R_HEAD.finditer(raw)]
    # skip ranges that sit inside {| |} tables/templates is rare; ignore
    cards = []
    def hclean(h): 
        h2 = rend.inline(expand(h, C)); return plain(h2)
    lead_end = heads[0][2] if heads else len(raw)
    segs = [(2, 'Overview', 'Overview', raw[:lead_end])]
    # group H2; H3 = a card; H4+ stay inside the card as h5
    i = 0; cur_g = 'Overview'; cur_rng = None
    k = 0
    pend = []
    while k < len(heads):
        lv, h, s, e = heads[k]
        end = heads[k + 1][2] if k + 1 < len(heads) else len(raw)
        pend.append((lv, h, raw[e:end], end)); k += 1
    cards_raw = []
    g = 'Overview'; inh = None
    cards_raw.append(('Overview', 'Overview', 'Overview', raw[:lead_end], None))
    j = 0
    while j < len(pend):
        lv, h, body, _ = pend[j]
        hc = hclean(h)
        if lv == 2:
            g = hc; inh = lv_range(hc, cap)
            kids = []
            j += 1
            while j < len(pend) and pend[j][0] > 2:
                l3, h3, b3, _ = pend[j]
                if l3 == 3: kids.append([hclean(h3), h3, b3]); 
                else:
                    if kids: kids[-1][2] += f'\n{"=" * l3}{h3}{"=" * l3}\n' + b3
                    else: body += f'\n{"=" * l3}{h3}{"=" * l3}\n' + b3
                j += 1
            if SKIP_H2.match(g): continue
            cards_raw.append((g, g + ' — overview' if kids else g, hc, body, inh) if body.strip() else None)
            for kt, kh, kb in kids: cards_raw.append((g, kt, kt, kb, inh))
        else:
            j += 1
    cards = []
    for cr in cards_raw:
        if not cr: continue
        g, title_, anchor, body, inh = cr
        c = make_card(env, g, title_, anchor if anchor != 'Overview' else '', 2, body, C, rend, cap, inh)
        if c:
            c['a'] = (cr[2] if cr[1] != cr[0] + ' — overview' else cr[0]) if cr[2] != 'Overview' else ''
            cards.append(c)
    return t or title, cards

def xp_table(modname):
    p = [f for f in os.listdir(f'{BASE}/ns/Module') if f.startswith(modname + '~')]
    t = read(f'{BASE}/ns/Module/{p[0]}')
    t = t[t.rindex('return'):]
    d = {}
    if re.search(r'\[\s*\d+\s*\]\s*=', t):
        for m in re.finditer(r'\[\s*(\d+)\s*\]\s*=\s*(\d+)', t): d[int(m.group(1))] = int(m.group(2))
        return [d[k] for k in sorted(d)]
    return [int(x) for x in re.findall(r'^\s*(\d+)\s*,?\s*$', t, re.M)]

def build(APP, find_file, out_img, decodes, used_files, iall, row_of, only=None, quest_names=None):
    os.makedirs(f'{APP}/timg', exist_ok=True); os.makedirs(f'{APP}/data/t', exist_ok=True)
    low = {}
    for n in row_of: low.setdefault(n.lower(), n)
    def item_of(k):
        if k in row_of: return k
        l = low.get(k.lower())
        return l
    def ge(n):
        n = item_of(n) or item_of(n.replace(' + ', ' +')) or n
        i = row_of.get(n)
        if i is None: return None
        v = iall[i][2]
        return v if isinstance(v, (int, float)) and v > 0 else None
    def ico(n):
        i = row_of.get(n)
        return (iall[i][1] + '.webp') if i is not None and iall[i][1] else None
    quests = set(quest_names) if quest_names else {q[0] for q in json.load(open(f'{APP}/data/quests.json', encoding='utf-8'))}
    stats = {'unres': set(), 'skills': 0, 'cards': 0, 'cost': 0, 'maps': 0, 'pics': 0, 'xph': 0, 'req': 0, 'items': 0, 'guides': 0, 'by_skill': {}}
    env = {'find_file': find_file, 'out_img': out_img, 'decodes': decodes, 'used': used_files, 'item_of': item_of, 'ge': ge, 'ico': ico, 'quests': quests, 'skills': set(SKILLS), 'maps': [], 'stats': stats, 'title': ''}
    xp = {'n': xp_table('Module_Experience_data'), 'e': xp_table('Module_Experience_elitedata')}
    assert xp['n'][1] == 83 and xp['n'][98] == 13034431 and len(xp['n']) >= 120 and xp['e'][1] == 830, (xp['n'][:3], len(xp['n']), len(xp['e']))
    skills = []; srcs = []
    for s in SKILLS:
        if only and s not in only: continue
        gl = []
        for title, kind in GUIDES[s]:
            t, cards = build_guide(env, title, kind, CAP[s])
            gl.append({'k': kind, 't': t, 'u': wurl(t), 'c': cards}); srcs.append([t, wurl(t)])
        stats['guides'] += len(gl)
        n = sum(len(g['c']) for g in gl)
        stats['by_skill'][s] = n
        for g in gl:
            for c in g['c']:
                stats['cards'] += 1
                if c.get('cn') or any(r[1] for r in c.get('it', [])): stats['cost'] += 1
                if c.get('mp'): stats['maps'] += 1
                if c.get('p'): stats['pics'] += 1
                if c.get('xph'): stats['xph'] += 1
                if c.get('rq') or c.get('q'): stats['req'] += 1
                if c.get('it'): stats['items'] += 1
        json.dump({'g': gl}, open(f'{APP}/data/t/{s}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        skills.append({'n': s, 'cap': CAP[s], 'el': 1 if s in ELITE else 0, 'm': n, 'g': [[g['k'], g['t'], g['u'], len(g['c'])] for g in gl]})
        stats['skills'] += 1
    seen = set(); su = []
    for a in srcs:
        if a[0] not in seen: seen.add(a[0]); su.append(a)
    json.dump({'skills': skills, 'xp': xp, 'src': su}, open(f'{APP}/data/train.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    stats['unres'] = sorted(stats['unres'])
    return stats
