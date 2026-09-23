#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "Neeky Home Designer → http://127.0.0.1:${PORT}/"
echo "Leave this window open. Stop with Ctrl+C."
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
fi
if command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
fi
if command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
fi
echo "Install Python 3, then run this script again." >&2
exit 1
