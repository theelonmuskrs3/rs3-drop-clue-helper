#!/usr/bin/env python3
"""Frozen review server: serves the files of ONE git commit straight from the object store (no checkout, no copied files,
so later edits in any worktree cannot change what is served and no disk inodes are used). Same rules as tools/ge_preview.py:
loopback only, Cache-Control no-store, sw.js 404 (no service worker on the preview origin), X-DCH-Preview-Build header.
  python3 tools/git_preview.py --commit <sha> --port <new port>
"""
import argparse, hashlib, mimetypes, subprocess, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

class Git:
    def __init__(self, commit):
        self.commit = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--verify', commit + '^{commit}'], capture_output=True, text=True, check=True).stdout.strip()
        self.p = subprocess.Popen(['git', '-C', str(ROOT), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.lock = threading.Lock()
    def read(self, path):
        if '\n' in path or path.startswith('/') or '..' in path.split('/'): return None
        with self.lock:
            self.p.stdin.write(f'{self.commit}:{path}\n'.encode()); self.p.stdin.flush()
            head = self.p.stdout.readline().split()
            if len(head) < 2 or head[1] == b'missing': return None
            n = int(head[2]); data = self.p.stdout.read(n); self.p.stdout.read(1)
            return data if head[1] == b'blob' else None

def assets(g):
    src = g.read('tools/ge_preview.py').decode()
    tup = src[src.index('ASSETS = ('):]; tup = tup[:tup.index(')') + 1]
    names = eval(tup.split('=', 1)[1], {})
    return hashlib.sha256(b''.join(g.read(p) or b'' for p in names)).hexdigest()[:16]

def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--commit', required=True); ap.add_argument('--port', type=int, required=True)
    a = ap.parse_args(); g = Git(a.commit); build = assets(g)
    class H(BaseHTTPRequestHandler):
        def log_message(self, *x): pass
        def _send(self, body):
            path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip('/') or 'index.html'
            if path == 'sw.js': self.send_error(404, 'Service worker disabled on isolated preview'); return
            data = g.read(path)
            if data is None: self.send_error(404); return
            self.send_response(200); self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(data))); self.send_header('Cache-Control', 'no-store, max-age=0')
            self.send_header('X-DCH-Preview-Build', build); self.send_header('X-DCH-Preview-Commit', g.commit); self.end_headers()
            if body: self.wfile.write(data)
        def do_GET(self): self._send(True)
        def do_HEAD(self): self._send(False)
    print(f'Build {build} commit {g.commit[:9]}: http://127.0.0.1:{a.port}/index.html?rev={build}#calculators', flush=True)
    ThreadingHTTPServer(('127.0.0.1', a.port), H).serve_forever()

if __name__ == '__main__': main()
