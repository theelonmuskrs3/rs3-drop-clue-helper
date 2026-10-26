"""Item requirements from the RS3 wiki item pages: the lead paragraph's own requirement sentences (e.g. "requires level 60 Mining to use"),
parsed to skill levels and quest links. Nothing invented: the wiki sentence is kept as text and shown with its link."""
import re, sys, html
from build_training import res, expand, Ctx, SKILLS, SKL, no_comments

SKN = '|'.join(sorted(set(SKILLS) | {'Hitpoints', 'Combat', 'Quest points'}, key=len, reverse=True))
R_REQ = re.compile(r'\b(?:requires?|requiring|required|requirements?|needs?|needed)\b', re.I)
P1 = re.compile(r'\b(?:level\s+)?(\d{1,3})\s+(%s)\b(?:\s+level)?' % SKN, re.I)
P2 = re.compile(r'\b(%s)\s+(?:level\s+(?:of\s+)?|of\s+|at\s+level\s+)(\d{1,3})\b' % SKN, re.I)
R_SENT = re.compile(r'(?<=[.!?])\s+(?=[A-Z\[\'"])')

def lead_of(raw):
    raw = no_comments(raw)
    raw = re.sub(r'<ref[^>/]*>.*?</ref>|<ref[^>]*/>', '', raw, flags=re.S | re.I)
    i = 0; out = []
    # drop leading templates (infobox, hatnotes) at top level
    n = len(raw); res_ = []; d = 0; j = 0
    buf = []
    while j < n:
        if raw.startswith('{{', j): d += 1; j += 2; continue
        if raw.startswith('}}', j) and d: d -= 1; j += 2; continue
        if d == 0: buf.append(raw[j])
        j += 1
    t = ''.join(buf)
    m = re.search(r'^\s*==', t, re.M)
    if m: t = t[:m.start()]
    return t

def clean(s):
    s = re.sub(r'\[\[(?:File|Image|Category):[^\]]*\]\]', '', s, flags=re.I)
    s = re.sub(r'\[\[([^\]|]+)\|([^\]]*)\]\]', r'\2', s)
    s = re.sub(r'\[\[([^\]]+)\]\]', lambda m: m.group(1).split('#')[-1] if m.group(1).startswith('#') else m.group(1), s)
    s = re.sub(r"'''+|''", '', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()

def item_reqs(page, quests):
    t, raw = res.get(page)
    if not raw: return None
    lead = lead_of(raw)
    if not R_REQ.search(lead): return None
    lead = re.sub(r"\[\[File:[^\]]*\]\]", '', lead)
    sents = [s.strip() for s in R_SENT.split(lead.replace('\n', ' ')) if R_REQ.search(s)]
    sk, qs, txt = {}, [], []
    for s in sents[:3]:
        links = [m.group(1).split('|')[0].strip().replace('_', ' ') for m in re.finditer(r'\[\[([^\]]+)\]\]', s)]
        q = [l for l in links if l in quests]
        c = clean(s)
        found = {}
        for m in P1.finditer(c):
            n, k = int(m.group(1)), SKL.get(m.group(2).lower(), m.group(2).title())
            if 1 <= n <= 150 and k in SKILLS: found[k] = max(found.get(k, 0), n)
        for m in P2.finditer(c):
            k, n = SKL.get(m.group(1).lower(), m.group(1).title()), int(m.group(2))
            if 1 <= n <= 150 and k in SKILLS: found[k] = max(found.get(k, 0), n)
        if not found and not q: continue
        for k, v in found.items(): sk[k] = max(sk.get(k, 0), v)
        for x in q:
            if x not in qs: qs.append(x)
        if len(c) <= 320: txt.append(c)
        else: txt.append(c[:317].rsplit(' ', 1)[0] + '…')
    if not txt: return None
    r = {'t': ' '.join(txt)[:420]}
    if sk: r['s'] = sk
    if qs: r['q'] = qs
    return r
