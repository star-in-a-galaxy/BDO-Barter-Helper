import http.server
import json
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
        elif path == "/api/catalog":
            self.serve_catalog()
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
            self.send_error(404)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/plan":
            self.handle_plan()
        elif path == "/api/scan":
            self.handle_scan()
        else:
            self.send_error(404)

    def serve_catalog(self):
        from catalog import get_catalog
        data = get_catalog()
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_plan(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        from planner import plan_route
        result = plan_route(payload)
        resp = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def handle_scan(self):
        # Body: JSON { "images": [ { "name": "...", "data": "<base64 png>" }, ... ] }
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        import base64
        import tempfile

        from scanner import scan

        images = payload.get("images") or []
        t4t5_paths = []
        t5t6_path = None
        t6t7_path = None
        temp_files = []
        for img in images:
            data = base64.b64decode(img.get("data", ""))
            name = img.get("name", "")
            itype = img.get("type", "")
            fd, path = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            with open(path, "wb") as f:
                f.write(data)
            temp_files.append(path)
            if itype == "t6t7" or "t6_t7" in name.lower():
                t6t7_path = path
            elif itype == "t5t6" or "t5_t6" in name.lower():
                t5t6_path = path
            else:
                t4t5_paths.append(path)

        try:
            if not t4t5_paths or not t5t6_path:
                result = {"error": "Need at least one T4→T5 screenshot and one T5→T6 screenshot"}
            else:
                result = scan(t4t5_paths, t5t6_path, t6t7_path)
        finally:
            for p in temp_files:
                try:
                    os.remove(p)
                except OSError:
                    pass

        resp = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

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
