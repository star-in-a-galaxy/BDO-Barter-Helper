import http.server
import mimetypes
import os
import socketserver

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
TILES_DIR = os.path.join(ROOT, "tiles")
INDEX = os.path.join(ROOT, "index.html")
STATIC_DIR = os.path.join(ROOT, "static")

CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/" or path == "/index.html":
            self.serve_file(INDEX, "text/html; charset=utf-8")
        elif path.startswith("/tiles/"):
            self.serve_tile(path)
        elif path.startswith("/static/"):
            rel = path[len("/static/"):]
            self.serve_file(os.path.join(STATIC_DIR, rel), mimetypes.guess_type(rel)[0] or "application/octet-stream")
        elif path.startswith("/assets/") or path.startswith("/js/"):
            # Serve assets and js files from root
            full_path = os.path.join(ROOT, path[1:])  # Remove leading /
            content_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
            self.serve_file(full_path, content_type)
        else:
            # Generic fallback: serve any file under the project root
            # (Instructions.md, verify/ screenshots, etc.)
            full_path = os.path.join(ROOT, path.lstrip("/"))
            if os.path.isfile(full_path):
                content_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
                self.serve_file(full_path, content_type)
            else:
                self.send_error(404)

    def serve_tile(self, path):
        # Request: /tiles/{z}/{x}_{y}.webp
        # Actual file: tiles/{z}/{x}_{y}.webp
        rel_path = path[len("/tiles/"):]  # Remove "/tiles/" prefix
        tile = os.path.join(TILES_DIR, rel_path)
        if not os.path.isfile(tile):
            # Back-compat: try the old .jpg name too
            alt = os.path.join(TILES_DIR, os.path.splitext(rel_path)[0] + ".jpg")
            if os.path.isfile(alt):
                tile = alt
                self.serve_file(tile, "image/jpeg", cache=True)
                return
        content_type = "image/webp" if tile.lower().endswith(".webp") else "image/jpeg"
        self.serve_file(tile, content_type, cache=True)

    def serve_file(self, full_path, content_type, cache=False):
        if not os.path.isfile(full_path):
            self.send_error(404)
            return
        # Text content is UTF-8; without an explicit charset some clients
        # mis-detect it (e.g. Instructions.md with arrows/accents).
        if content_type and (content_type.startswith("text/") or content_type in
                             ("application/json", "application/javascript", "image/svg+xml")):
            content_type += "; charset=utf-8"
        size = os.path.getsize(full_path)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        if cache:
            for k, v in CACHE_HEADERS.items():
                self.send_header(k, v)
        else:
            # Ensure HTML/JS/assets always reflect the latest code
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        with open(full_path, "rb") as f:
            while True:
                chunk = f.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"BDO map viewer running at http://localhost:{PORT}")
        httpd.serve_forever()
