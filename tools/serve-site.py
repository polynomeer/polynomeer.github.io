#!/usr/bin/env python3
"""Serve a built site locally without letting the browser cache the assets.

Why this exists instead of `python3 -m http.server`:

Jekyll writes unversioned asset names - `assets/js/dist/post.min.js`,
`assets/css/jekyll-theme-chirpy.css`. `http.server` sends `Last-Modified` and
no `Cache-Control`, so a browser is free to apply heuristic caching and reuse
whatever it already has under that URL without asking. Rebuild the site and
the page keeps running the previous bundle: a stale 51KB `post.min.js` with
no series pager in it, while the file on disk is 57KB and has one. The symptom
is a feature that works on the deployed site and not locally, with no console
error to point at - the browser is simply running older code.

GitHub Pages does not have this problem because it revalidates with ETags,
and `jekyll serve` does not because it sends no-store itself. This closes the
gap for the static preview.

    python3 tools/serve-site.py --port 4001 --directory _site
"""

import argparse
import functools
import http.server
import socketserver


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 기본 로그는 요청마다 한 줄씩 쌓여 터미널을 덮습니다. 오류만 남깁니다.
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4001)
    parser.add_argument('--directory', default='_site')
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()

    handler = functools.partial(NoCacheHandler, directory=args.directory)
    with Server((args.bind, args.port), handler) as httpd:
        print(f'serving {args.directory} at http://{args.bind}:{args.port} (no-store)', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
