#!/usr/bin/env python3
"""Record, from the MediaWiki API, the Wiki redirect behind every non-exact calculator picture in data/calc/images.json into
tests/calc-image-redirects.json (adds missing names, keeps existing records). tests/calc-images.test.cjs then proves that every
alias is the Wiki's own redirect, never one of ours.   python3 tools/calc_image_redirects.py"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from calc_cooking import api, ROOT
P = os.path.join(ROOT, 'tests', 'calc-image-redirects.json')
R = json.load(open(P)); I = json.load(open(os.path.join(ROOT, 'data', 'calc', 'images.json')))['items']
todo = [n for n, v in I.items() if v.get('via') != 'exact file' and n not in R['items']]
for i in range(0, len(todo), 40):
    chunk = todo[i:i + 40]
    j = api({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'sha1', 'redirects': '1', 'titles': '|'.join('File:' + n[:1].upper() + n[1:] + '.png' for n in chunk)})
    q = j['query']; red = {r['from']: r['to'] for r in q.get('redirects', [])}; norm = {x['from']: x['to'] for x in q.get('normalized', [])}
    pages = {p['title']: p for p in q['pages']}
    for n in chunk:
        t = 'File:' + n[:1].upper() + n[1:] + '.png'; t = norm.get(t, t); chain, cur = [], t
        while cur in red: chain.append({'from': cur, 'to': red[cur]}); cur = red[cur]
        pg = pages.get(cur, {}); ii = (pg.get('imageinfo') or [{}])[0]
        rec = {'via': I[n]['via'], 'appFile': I[n]['file'], 'appSha1': I[n]['sha1'], 'fileRedirects': chain, 'resolvedTitle': cur,
               'resolvedSha1': ii.get('sha1'), 'missing': bool(pg.get('missing')) and not ii}
        if not chain:   # page redirect (item page -> other item page); recorded the same way
            pj = api({'action': 'query', 'redirects': '1', 'titles': n})['query']
            rec['pageRedirects'] = [{'from': r['from'], 'to': r['to']} for r in pj.get('redirects', [])]
        R['items'][n] = rec
    time.sleep(1)
R['checked'] = time.strftime('%Y-%m-%d %H:%M %Z')
json.dump(R, open(P, 'w'), indent=1, ensure_ascii=False, sort_keys=True)
print('recorded', len(todo), 'new aliases; total', len(R['items']))
