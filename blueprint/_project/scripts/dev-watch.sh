#!/usr/bin/env bash
# dev-watch.sh — rebuild and restart the API when Go source changes.
#
# Vite already hot-reloads web/src, so the frontend needs nothing from this. Go
# does: a change to a handler is invisible until the binary is rebuilt, which is
# why a merged agent change appeared to do nothing until someone restarted by
# hand.
#
# THE IMPORTANT PART IS WHAT IT REFUSES TO DO.
#
# Restarting kills every in-flight agent run: the goroutine dies, its worktree is
# left on disk, and the run row freezes at status='running'. That cost eight runs
# in one afternoon. So this watcher WAITS for the fleet to go idle before
# restarting, and says so while it waits. A watcher that restarts eagerly is
# worse than no watcher at all.
#
#   usage:  ./scripts/dev-watch.sh
#   env:    DATABASE_URL     to check for in-flight runs (optional but advised)
#           WATCH_DEBOUNCE   seconds to coalesce a burst of saves (default 1)
#           WATCH_MAX_WAIT   seconds to wait for runs before giving up (default 900)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BIN="./bin/api"
CMD="./cmd/api"
DEBOUNCE="${WATCH_DEBOUNCE:-1}"
MAX_WAIT="${WATCH_MAX_WAIT:-900}"
PIDFILE=".dev-watch.pid"

# shellcheck disable=SC1091
[ -f .env ] && { set -a; . ./.env; set +a; }

log() { printf '\033[36m[watch]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[watch]\033[0m %s\n' "$*"; }
err() { printf '\033[31m[watch]\033[0m %s\n' "$*"; }

# ── how many agent runs are in flight ───────────────────────────────────────
# Only LIVE runs count. A frozen row from an earlier crash must not block the
# watcher forever, so staleness is bounded the same way the orchestrator bounds
# it.
running_count() {
  [ -z "${DATABASE_URL:-}" ] && { echo 0; return; }
  psql "$DATABASE_URL" -tAc "
    SELECT count(*) FROM builder_runs
     WHERE status = 'running'
       AND coalesce(heartbeat_at, started_at) > now() - interval '30 minutes'
  " 2>/dev/null || echo 0
}

wait_for_idle() {
  local waited=0 n
  n="$(running_count)"
  [ "${n:-0}" -eq 0 ] && return 0

  warn "$n agent run(s) in flight — holding the restart so their work is not lost"
  while [ "${n:-0}" -gt 0 ] && [ "$waited" -lt "$MAX_WAIT" ]; do
    sleep 5
    waited=$((waited + 5))
    n="$(running_count)"
    [ $((waited % 60)) -eq 0 ] && warn "still waiting (${waited}s, $n run(s) active)"
  done
  if [ "${n:-0}" -gt 0 ]; then
    err "gave up after ${MAX_WAIT}s with $n run(s) still active — NOT restarting."
    err "the binary is stale; re-save to try again, or stop the runs first."
    return 1
  fi
  log "fleet is idle — restarting"
  return 0
}

stop_api() {
  if [ -f "$PIDFILE" ]; then
    local pid; pid="$(cat "$PIDFILE")"
    kill "$pid" 2>/dev/null && sleep 0.5
    rm -f "$PIDFILE"
  fi
}

start_api() {
  ( set -a; [ -f .env ] && . ./.env; set +a; "$BIN" ) &
  echo $! > "$PIDFILE"
  log "api started (pid $(cat "$PIDFILE"))"
}

rebuild() {
  log "building…"
  if ! out="$(go build -o "$BIN" "$CMD" 2>&1)"; then
    err "build failed — the running binary is left alone:"
    printf '%s\n' "$out" | sed 's/^/       /'
    return 1
  fi
  wait_for_idle || return 1
  stop_api
  start_api
}

trap 'stop_api; exit 0' INT TERM

log "watching Go sources under $ROOT"
log "vite handles web/src — this only rebuilds the API"
rebuild || warn "initial build failed; fix it and save again"

# ── the watch loop ──────────────────────────────────────────────────────────
# fswatch on macOS, inotifywait on Linux, and a polling fallback so the blueprint
# works on a machine with neither.
if command -v fswatch >/dev/null 2>&1; then
  fswatch -o -r -e '\.git' -e 'node_modules' -e '^\./bin' -e '\.gen\.go$' \
          --event Updated --event Created --event Removed \
          ./cmd ./internal ./db 2>/dev/null | while read -r _; do
    sleep "$DEBOUNCE"
    rebuild
  done
elif command -v inotifywait >/dev/null 2>&1; then
  while inotifywait -qq -r -e modify,create,delete \
        --exclude '(\.git|node_modules|/bin/|\.gen\.go)' \
        ./cmd ./internal ./db 2>/dev/null; do
    sleep "$DEBOUNCE"
    rebuild
  done
else
  warn "neither fswatch nor inotifywait found — polling every 2s"
  warn "  macOS: brew install fswatch    linux: apt install inotify-tools"
  last=""
  while true; do
    now="$(find ./cmd ./internal ./db -name '*.go' -newer "$BIN" 2>/dev/null | head -20)"
    if [ -n "$now" ] && [ "$now" != "$last" ]; then
      last="$now"
      rebuild
    fi
    sleep 2
  done
fi
