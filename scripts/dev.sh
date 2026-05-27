#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  bash "$ROOT/scripts/kill-opencode-serve.sh" || true
}

# Do NOT use exec — it replaces this shell and drops the trap handlers.
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

cd "$ROOT"

if command -v pnpm >/dev/null 2>&1; then
  pnpm exec turbo run dev
elif command -v npx >/dev/null 2>&1; then
  npx turbo run dev
else
  "$ROOT/node_modules/.bin/turbo" run dev
fi
