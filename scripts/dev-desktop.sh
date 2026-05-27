#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT/apps/desktop"

cleanup() {
  bash "$ROOT/scripts/kill-opencode-serve.sh" || true
}

trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

cd "$DESKTOP_DIR"
electron .
