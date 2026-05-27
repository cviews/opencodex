#!/usr/bin/env bash
# Kill local opencode-team serve processes (orphans after dev Ctrl+C).
set -uo pipefail

kill_pids() {
  local signal=$1
  shift
  local pid
  for pid in "$@"; do
    [[ -z "$pid" ]] && continue
    kill "-$signal" "$pid" 2>/dev/null || kill "-$signal" "-$pid" 2>/dev/null || kill "-$signal" "$pid" 2>/dev/null || true
  done
}

if [[ "$(uname -s)" == "MINGW"* || "$(uname -s)" == "MSYS"* || "$(uname -s)" == "CYGWIN"* ]]; then
  taskkill /IM opencode-team.exe /F >/dev/null 2>&1 || true
  exit 0
fi

pids=$(pgrep -f 'opencode-team serve' 2>/dev/null || true)
if [[ -z "$pids" ]]; then
  exit 0
fi

count=$(echo "$pids" | wc -l | tr -d ' ')
echo "[zmn-codex] Stopping ${count} opencode-team serve process(es)"
# shellcheck disable=SC2086
kill_pids TERM $pids
sleep 0.4
remaining=$(pgrep -f 'opencode-team serve' 2>/dev/null || true)
if [[ -n "$remaining" ]]; then
  # shellcheck disable=SC2086
  kill_pids KILL $remaining
fi

# Fallback when pgrep/kill miss detached children.
pkill -f 'opencode-team serve' 2>/dev/null || true
