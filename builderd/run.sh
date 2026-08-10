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
export BUILDER_TARGET="${BUILDER_TARGET:-http://localhost:3000}"

# BUILDER_WEB_DIR is deliberately NOT defaulted any more.
#
# It used to default to ../../builder-dev/web/dist — a SIBLING DEVELOPMENT
# PROJECT'S build output. That made the "standalone" daemon depend on a
# checkout it has no way to require: on any machine without builder-dev cloned
# and built, this script exported an empty value, the daemon started, reported
# itself healthy, and served no pages at all. On a server it could never have
# worked.
#
# The dashboard is now compiled into the binary and served at /builder/. Export
# BUILDER_WEB_DIR yourself only when you are developing the dashboard and want
# a web/dist from disk instead; anything already in the environment is passed
# straight through.

# Several apps in one shell, switchable from inside it, each reporting its own
# console/network and each filing issues that say which app they came from.
# name=url entries, separated by commas or newlines. Unset, the shell frames
# BUILDER_TARGET alone exactly as it always has.
#
#   BUILDER_TARGETS="app=https://app.co,auth=https://auth.app.co,dashboard=https://dashboard.app.co"
#
# Exported (not defaulted) so an operator who has not set it changes nothing.
export BUILDER_TARGETS="${BUILDER_TARGETS:-}"

# ---------------------------------------------------------------------------
# The two secrets, read from a file rather than typed at the prompt.
#
# The vault key is still not GENERATED here, for the original reason: a key
# minted at start time would be a different key on every restart, and every
# secret already stored would silently fail to decrypt. But requiring the
# operator to export it by hand meant the documented start command did not
# actually start anything, and the daemon's reputation for "not running" was
# really this script refusing to.
#
# So read it — and ONLY it, plus AUTH_SECRET — out of the product's env file.
# Sourcing that file wholesale is the trap: it carries the PRODUCT's ADDR
# (:8080) and DATABASE_URL (builder_dev), so the daemon would come up on the
# product's port, against the product's database. That is precisely the
# coupling this binary exists to undo, and it would look like a working start.
# An allowlist of two keys cannot do that.
# ---------------------------------------------------------------------------
BUILDER_ENV_FILE="${BUILDER_ENV_FILE:-$(cd ../../builder-dev 2>/dev/null && pwd)/.env}"

# Read one key from an env file. Last assignment wins, matching how a shell
# would source it; the value is taken verbatim after the FIRST '=' so base64
# padding ('=') survives, and surrounding quotes are stripped.
read_env_key() {
  local key="$1" file="$2"
  [ -r "$file" ] || return 1
  sed -n "s/^[[:space:]]*${key}=//p" "$file" | tail -n1 |
    sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

for key in BUILDER_VAULT_KEY AUTH_SECRET; do
  # Anything already in the environment wins: an operator overriding a secret
  # for one run must not be silently overwritten by the file.
  if [ -z "${!key:-}" ]; then
    printf -v "$key" '%s' "$(read_env_key "$key" "$BUILDER_ENV_FILE" || true)"
  fi
done
export BUILDER_VAULT_KEY AUTH_SECRET

if [ -z "${BUILDER_VAULT_KEY:-}" ]; then
  echo "BUILDER_VAULT_KEY is not set and was not found in $BUILDER_ENV_FILE" >&2
  echo "The vault will not start. Reuse the key from your app's .env — do not" >&2
  echo "mint a new one unless you accept that stored secrets stop decrypting." >&2
  exit 1
fi
if [ -z "${AUTH_SECRET:-}" ]; then
  echo "AUTH_SECRET is not set and was not found in $BUILDER_ENV_FILE" >&2
  echo "Sessions cannot be signed." >&2
  exit 1
fi

# Build before running.
#
# This script used to exec a binary that was committed beside it, so an edit to
# main.go or shell.go changed nothing until somebody remembered to rebuild by
# hand — the daemon would start, report itself healthy, and serve the old
# behaviour. Building here makes "run.sh" and "what the source says" the same
# thing. GOWORK is left alone: builderd's own go.work points at the sibling
# checkouts and is what makes this module build before any of them are tagged.
if command -v go >/dev/null 2>&1; then
  go build -o builderd .
elif [ ! -x ./builderd ]; then
  echo "no go toolchain on PATH and no prebuilt ./builderd to fall back to" >&2
  exit 1
fi

exec ./builderd
