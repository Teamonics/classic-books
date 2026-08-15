#!/usr/bin/env python3
"""Serve a directory the way GitHub Pages does, for verifying a deploy locally.

Pages differs from an ordinary static server in the ways that matter to a
single-page app:

  * an unknown path is answered with that site's 404.html (status 404), which
    is how a deep link like /classic-books/plato/republic/7 reaches the app
  * files and directories beginning with an underscore are served normally
    only because .nojekyll is present; without it Pages would have deleted
    _app during the build, so this server refuses to start if it is missing

Usage: serve-like-pages.py <root> [port] [--site SUBDIR]
"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class PagesHandler(SimpleHTTPRequestHandler):
    site = ""  # subdirectory acting as the published site, e.g. "classic-books"

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html",):
                candidate = os.path.join(path, index)
                if os.path.exists(candidate):
                    return super().send_head()
        if not os.path.exists(path):
            fallback = os.path.join(self.directory, self.site, "404.html")
            if os.path.exists(fallback):
                body = open(fallback, "rb").read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                return __import__("io").BytesIO(body)
        return super().send_head()

    def log_message(self, *args):
        pass  # quiet


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else "."
    port = int(args[1]) if len(args) > 1 else 4180
    site = ""
    for a in sys.argv[1:]:
        if a.startswith("--site="):
            site = a.split("=", 1)[1]

    published = os.path.join(root, site)
    if not os.path.exists(os.path.join(published, ".nojekyll")):
        print(f"refusing to serve: {published}/.nojekyll is missing — GitHub Pages "
              f"would run Jekyll and delete _app/", file=sys.stderr)
        return 1

    PagesHandler.site = site
    handler = partial(PagesHandler, directory=root)
    print(f"serving {published} like GitHub Pages on http://localhost:{port}/{site}/")
    ThreadingHTTPServer(("", port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
