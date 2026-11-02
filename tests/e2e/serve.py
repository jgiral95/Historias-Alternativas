"""Servidor de prueba: sirve frontend/ y reenvía /api/ a uvicorn (como lo haría nginx)."""
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'frontend'
API = 'http://127.0.0.1:8099'
TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2'}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _proxy(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else None
        req = urllib.request.Request(API + self.path, data=body, method=self.command)
        for k in ('Cookie', 'Content-Type', 'X-Requested-With'):
            if self.headers.get(k):
                req.add_header(k, self.headers[k])
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        try:
            r = urllib.request.build_opener(NoRedirect).open(req)
        except urllib.error.HTTPError as e:
            r = e
        data = r.read()
        self.send_response(r.status)
        for k, v in r.headers.items():
            if k.lower() in ('content-type', 'set-cookie', 'cache-control', 'location'):
                self.send_header(k, v)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/api/'):
            return self._proxy()
        p = ROOT / (self.path.lstrip('/').split('?')[0] or 'index.html')
        if not p.is_file() and (p.parent / (p.name + '.html')).is_file():
            p = p.parent / (p.name + '.html')
        if not p.is_file():
            p = ROOT / 'index.html' if self.path in ('/', '') else p
        if not p.is_file():
            self.send_response(404); self.end_headers(); return
        data = p.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(p.suffix, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_POST = do_PUT = do_PATCH = do_DELETE = lambda self: self._proxy()


ThreadingHTTPServer(('127.0.0.1', 8100), H).serve_forever()
