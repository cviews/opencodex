#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT/apps/desktop"
VITE_DEV_URL="${VITE_DEV_URL:-http://localhost:5173}"

cleanup() {
  bash "$ROOT/scripts/kill-opencode-serve.sh" || true
}

trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

echo "[zmn-opencodex] Waiting for Vite dev server at ${VITE_DEV_URL}..."
for _ in $(seq 1 120); do
  if curl -sf "${VITE_DEV_URL}" >/dev/null 2>&1; then
    echo "[zmn-opencodex] Vite dev server is ready"
    break
  fi
  sleep 0.5
done

if ! curl -sf "${VITE_DEV_URL}" >/dev/null 2>&1; then
  echo "[zmn-opencodex] ERROR: Vite dev server not reachable at ${VITE_DEV_URL}" >&2
  echo "[zmn-opencodex] Run 'pnpm dev' from repo root (starts app + desktop), not desktop alone." >&2
  exit 1
fi

cd "$DESKTOP_DIR"
electron .
