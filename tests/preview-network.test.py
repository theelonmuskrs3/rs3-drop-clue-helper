"""Verify exact local bytes, no caching, and no worker on isolated review server."""
import hashlib
import importlib.util
import json
from pathlib import Path
import threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview', root / 'tools/ge_preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
server = preview.ThreadingHTTPServer(('127.0.0.1', 0), preview.Preview)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'
try:
    html = (root / 'index.html').read_text()
    import re
    assets = re.findall(r'<script src="([^"]+)"', html) + ['index.html', 'style.css', 'neon.css']
    for file in assets:
        req = Request(url + file, headers={'If-Modified-Since': 'Wed, 31 Dec 2098 23:59:59 GMT'})
        with urlopen(req) as r:
            body = r.read()
            assert r.status == 200
            assert r.headers['Cache-Control'] == 'no-store, max-age=0'
            assert r.headers['X-DCH-Preview-Build'] == preview.BUILD
            assert body == (root / file).read_bytes(), file
            print(json.dumps({'asset': file, 'sha256': hashlib.sha256(body).hexdigest(), 'build': preview.BUILD}))
    try:
        urlopen(url + 'sw.js')
        raise AssertionError('Review server must not install a service worker')
    except HTTPError as e:
        assert e.code == 404
    print('PASS all HTML script assets, CSS, forced-current bytes and preview worker rejection')
finally:
    server.shutdown()
    server.server_close()
