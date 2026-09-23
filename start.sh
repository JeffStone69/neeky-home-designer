#!/bin/sh
"exec" "python3" "$0" "$@"
# Run with:  python3 start.sh
# Also works as ./start.sh — the shell line above hands the file to Python.
import os
import socketserver
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
PORT = int(os.environ.get("PORT", "8080"))

print(f"Neeky Home Designer → http://127.0.0.1:{PORT}/")
print("Leave this window open. Stop with Ctrl+C.")
handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
socketserver.TCPServer.allow_reuse_address = True
try:
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nStopped.")
