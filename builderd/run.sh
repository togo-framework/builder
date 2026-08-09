#!/usr/bin/env bash
# Start the builder as its own process.
#
# Its own database and port, so it keeps running while the product it watches
# is being built, deployed or restarted. That is the whole point: the board is
# what you reach for when the product is broken.
set -euo pipefail
cd "$(dirname "$0")"

export DATABASE_URL="${DATABASE_URL:-postgres://$USER@localhost:5432/builder_standalone?sslmode=disable}"
export BUILDER_WORKDIR="${BUILDER_WORKDIR:-$(cd .. && pwd)}"
export BUILDER_WEB_DIR="${BUILDER_WEB_DIR:-$(cd ../../builder-dev/web/dist 2>/dev/null && pwd)}"
export BUILDER_TARGET="${BUILDER_TARGET:-http://localhost:3000}"

# The vault key is not generated here on purpose. A key minted at start time
# would be a different key on every restart, and every secret already stored
# would silently fail to decrypt.
if [ -z "${BUILDER_VAULT_KEY:-}" ]; then
  echo "BUILDER_VAULT_KEY is not set — the vault will not start." >&2
  echo "Reuse the key from your app's .env, or mint one and keep it." >&2
  exit 1
fi
: "${AUTH_SECRET:?AUTH_SECRET is not set — sessions cannot be signed}"

exec ./builderd
