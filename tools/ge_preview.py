#!/usr/bin/env python3
"""Loopback-only, no-cache review server. No production manifests/storage touched.
Use a NEW port/origin, not the installed app's origin. See the browser checklist.
"""
import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('index.html', 'app.js', 'live-prices.js', 'neon.css', 'neon.js', 'map.js', 'fx.js')
BUILD = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in ASSETS)).hexdigest()[:16]

class Preview(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('X-DCH-Preview-Build', BUILD)
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/sw.js':
            self.send_error(404, 'Service worker disabled on isolated preview')
        else:
            super().do_GET()

    def do_HEAD(self):
        if self.path.split('?')[0] == '/sw.js':
            self.send_error(404, 'Service worker disabled on isolated preview')
        else:
            super().do_HEAD()

    def send_head(self):
        # Ignore conditional browser requests too: test exactly the current bytes.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        return super().send_head()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8777)
    args = parser.parse_args()
    print(f'Build {BUILD}: http://127.0.0.1:{args.port}/index.html?preview=ge-live&rev={BUILD}#items/Chronotes', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Preview).serve_forever()
