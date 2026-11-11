"""Real-browser regression check (Playwright Chromium) for the calculators directory and native calculator images.
At 320, 390, 800 and 1280 px:
  * every skill tile label wraps only between words: each word of .calc-tile-name lies on ONE line box (no split such as
    "Minin g" / "Dunge oneering") and the label does not overflow its tile;
  * no horizontal page overflow (documentElement.scrollWidth <= clientWidth) on #calculators (all groups expanded),
    #calculators/herblore and #calculators/flask-decanting;
  * every image in those views decodes (complete && naturalWidth > 0; lazy images forced eager) and every image request
    succeeded; .calc-ico / .calc-gico boxes are 32x32.
Usage: /workspace/pwenv/bin/python tests/calc-layout-check.py [app_dir]   (serves app_dir on a random local port). Exit 1 on failure."""
import sys, os, threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright
APP = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=APP)); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
WORDS = """()=>{const bad=[],n=[];for(const el of document.querySelectorAll('.calc-tile-name')){const t=el.firstChild;if(!t||t.nodeType!==3)continue;
 const s=t.textContent;let i=0;for(const w of s.split(/(\\s+)/)){if(w.trim()){const r=document.createRange();r.setStart(t,i);r.setEnd(t,i+w.length);
  const tops=new Set([...r.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top)));if(tops.size>1)bad.push(w+' in "'+s+'" ('+Math.round(el.closest('.calc-tile').getBoundingClientRect().width)+'px tile)');}i+=w.length;}
 const tile=el.closest('.calc-tile');if(el.scrollWidth>el.clientWidth+1||el.getBoundingClientRect().right>tile.getBoundingClientRect().right+1)bad.push('overflow: '+s);n.push(s)}
 return {bad,n:n.length,minTile:Math.min(...[...document.querySelectorAll('.calc-tile')].map(b=>b.getBoundingClientRect().width))}}"""
IMGS = """async()=>{for(const i of document.querySelectorAll('img'))i.loading='eager';
 await Promise.all([...document.querySelectorAll('img')].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,8000)})));
 const imgs=[...document.querySelectorAll('#view img')];const broken=imgs.filter(i=>!(i.complete&&i.naturalWidth>0)).map(i=>i.getAttribute('src'));
 const box=[...document.querySelectorAll('.calc-ico,.calc-gico')].filter(i=>{const r=i.getBoundingClientRect();return r.width&&!(Math.abs(r.width-32)<.6&&Math.abs(r.height-32)<.6)}).map(i=>i.getAttribute('src'));
 const d=document.documentElement;return {n:imgs.length,broken,box,sw:d.scrollWidth,cw:d.clientWidth}}"""
fails = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
    for vw in (320, 390, 800, 1280):
        ctx = b.new_context(viewport={'width': vw, 'height': 900}, service_workers='block'); pg = ctx.new_page()
        badreq = []
        pg.on('response', lambda r: badreq.append(f'{r.status} {r.url}') if r.request.resource_type == 'image' and r.status >= 400 else None)
        pg.on('requestfailed', lambda r: badreq.append(f'failed {r.url}') if r.resource_type == 'image' else None)
        for route in ('calculators', 'calculators/herblore', 'calculators/flask-decanting'):
            pg.goto(f'http://127.0.0.1:{port}/index.html#{route}'); pg.wait_for_timeout(2500)
            if route == 'calculators':
                pg.wait_for_selector('.calc-tile', timeout=20000)
                w = pg.evaluate(WORDS)
                print(f'{vw}px tiles: {w["n"]} labels, narrowest tile {w["minTile"]:.0f}px, split words/overflow: {w["bad"] or "none"}')
                if w['bad'] or not w['n']: fails.append(f'{vw} tiles {w["bad"][:5]}')
                pg.evaluate("()=>{const u=document.querySelector('#calc-upcoming');if(u)u.open=true;document.querySelectorAll('.calc-group').forEach(g=>g.open=true)}"); pg.wait_for_timeout(500)
            else:
                pg.wait_for_selector('table', timeout=30000); pg.wait_for_timeout(1500)
            r = pg.evaluate(IMGS)
            ok = not r['broken'] and not r['box'] and r['sw'] <= r['cw']
            print(f'{vw}px #{route}: {r["n"]} images, broken {len(r["broken"])}, non-32px icon boxes {len(r["box"])}, scrollWidth {r["sw"]}/{r["cw"]}' + ('' if ok else f' FAIL {r["broken"][:3]} {r["box"][:3]}'))
            if not ok: fails.append(f'{vw} {route}')
        if badreq: print(f'{vw}px failed image requests: {badreq[:5]} (+{len(badreq)})'); fails.append(f'{vw} requests')
        ctx.close()
    b.close()
print('FAIL ' + '; '.join(fails) if fails else 'PASS calc layout: tile labels never split inside a word, no horizontal overflow, every image decoded, 32px icon boxes at 320/390/800/1280')
sys.exit(1 if fails else 0)
