#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TILE_SCRIPT="$ROOT/MapServer/OpenTopoFlaskServer.py"
GPS_ARGS=("$@")

is_listening() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$1" | grep -q ":$1"
  else
    netstat -ltn 2>/dev/null | grep -q ":$1 "
  fi
}

open_terminal() {
  local title="$1"
  shift
  local cmd="$*"
  if command -v lxterminal >/dev/null 2>&1; then
    lxterminal --title="$title" --command bash -lc "$cmd; exec bash" >/dev/null 2>&1 &
    return 0
  fi
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -lc "$cmd; exec bash" >/dev/null 2>&1 &
    return 0
  fi
  if command -v xterm >/dev/null 2>&1; then
    xterm -T "$title" -e bash -lc "$cmd; exec bash" >/dev/null 2>&1 &
    return 0
  fi
  return 1
}

join_args() {
  local out=""
  for arg in "$@"; do
    out+=$(printf " %q" "$arg")
  done
  echo "${out# }"
}

if ! is_listening 5000; then
  if ! open_terminal "NavScope Tiles" "python \"$TILE_SCRIPT\""; then
    python "$TILE_SCRIPT" >/tmp/navscope_tile.log 2>&1 &
  fi
fi

if ! is_listening 8000; then
  if [ "${#GPS_ARGS[@]}" -gt 0 ]; then
    GNSS_CMD="python -m GNSserver.web_main $(join_args "${GPS_ARGS[@]}")"
    if ! open_terminal "NavScope GNSS" "$GNSS_CMD"; then
      python -m GNSserver.web_main "${GPS_ARGS[@]}" >/tmp/navscope_web.log 2>&1 &
    fi
  else
    if ! open_terminal "NavScope GNSS" "python -m GNSserver.web_main --dummy"; then
      python -m GNSserver.web_main --dummy >/tmp/navscope_web.log 2>&1 &
    fi
  fi
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://127.0.0.1:8000 >/dev/null 2>&1 &
else
  echo "Open http://127.0.0.1:8000 in your browser."
fi
