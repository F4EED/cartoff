#!/usr/bin/env python3
"""Serveur statique avec support correct des requêtes HTTP Range (requis pour PMTiles)."""

import argparse
import os
import re
import socket
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

SERVER_ID = "Cartoff/1.0 (PMTiles+Range)"


class PMTilesFriendlyHandler(SimpleHTTPRequestHandler):
    range_length = None
    server_version = "Cartoff"
    sys_version = "PMTiles+Range"

    def version_string(self):
        return SERVER_ID

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".pmtiles"):
            return "application/octet-stream"
        return super().guess_type(path)

    def send_head(self):
        self.range_length = None
        path = self.translate_path(self.path.split("?", 1)[0])
        range_header = self.headers.get("Range")

        if not range_header or not os.path.isfile(path):
            return super().send_head()

        match = re.fullmatch(r"bytes=(\d+)-(\d*)", range_header.strip())
        if not match:
            return super().send_head()

        try:
            file_obj = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(file_obj.fileno()).st_size
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else size - 1
        end = min(end, size - 1)

        if start > end or start >= size:
            self.send_error(416, "Requested Range Not Satisfiable")
            file_obj.close()
            return None

        file_obj.seek(start)
        length = end - start + 1
        self.range_length = length
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        return file_obj

    def do_GET(self):
        f = self.send_head()
        if not f:
            return
        try:
            if self.range_length is not None:
                self._copy_bytes(f, self.range_length)
            else:
                self.copyfile(f, self.wfile)
        finally:
            f.close()
            self.range_length = None

    def _copy_bytes(self, source, length):
        remaining = length
        while remaining > 0:
            chunk = source.read(min(remaining, 64 * 1024))
            if not chunk:
                break
            self.wfile.write(chunk)
            remaining -= len(chunk)


def _port_in_use(port: int) -> bool:
    """True si un service ecoute deja sur ce port (connect test, fiable sous Windows)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def main():
    parser = argparse.ArgumentParser(
        description="Serveur Cartoff avec support HTTP Range (requis pour PMTiles)."
    )
    parser.add_argument("-p", "--port", type=int, default=8000)
    args = parser.parse_args()
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if _port_in_use(args.port):
        print(
            f"ERREUR : le port {args.port} est déjà utilisé.\n"
            f"  - Fermez les autres serveurs (python -m http.server, anciens serve.py...)\n"
            f"  - Sous Windows : double-cliquez start.bat (arrete le port puis relance)\n"
            f"  - Ou : netstat -ano | findstr :{args.port}",
            file=sys.stderr,
        )
        sys.exit(1)

    pmtiles_path = os.path.join("pmtiles", "loire.pmtiles")
    if not os.path.isfile(pmtiles_path):
        print(
            f"AVERTISSEMENT : {pmtiles_path} introuvable - fond de carte gris.\n"
            f"  - python scripts/unpack_large_file.py",
            file=sys.stderr,
        )

    server = HTTPServer(("", args.port), PMTilesFriendlyHandler)
    print(f"Cartoff: http://localhost:{args.port}/")
    print(f"  Server: {SERVER_ID}")
    print("  NE PAS utiliser python -m http.server (pas de HTTP Range -> carte grise)")
    server.serve_forever()


if __name__ == "__main__":
    main()
