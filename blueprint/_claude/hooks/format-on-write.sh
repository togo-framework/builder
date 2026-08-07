#!/usr/bin/env bash
# format-on-write.sh — OPTIONAL, OFF BY DEFAULT.
#
# Enable by exporting TOGO_FORMAT_ON_WRITE=1 and adding it to settings.json under
# PostToolUse(Write|Edit|MultiEdit). Runs the project formatter on the file just
# written, so the agent's output matches the repo's style without a review
# round-trip about whitespace.
#
# OFF BY DEFAULT, for two honest reasons:
#   1. It rewrites a file the model believes it just wrote. The model's memory of
#      the contents is now stale, and its next Edit can fail on an exact-string
#      match the formatter moved. That is a real, recurring cost paid on every
#      multi-edit sequence.
#   2. Formatting belongs in CI and in a pre-commit hook, where it applies to
#      every author equally rather than only to the agent.
# Turn it on when the repo has no pre-commit formatter and the review noise is
# genuinely worse than the stale-read risk.
#
# Never blocks (PostToolUse, always exit 0). Never touches generated files:
# guard-generated-files.sh already forbids editing them, and reformatting one
# here would create a diff the next `togo generate` silently reverts.

set -uo pipefail

case "${TOGO_FORMAT_ON_WRITE:-0}" in
  1|true|yes|on) ;;
  *) exit 0 ;;
esac

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

FPATH="$(printf '%s' "${PAYLOAD}" | python3 -c '
import json,sys
try:
    fp=str((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")
except Exception:
    sys.exit(0)
if fp and " " not in fp:
    print(fp)
' 2>/dev/null || true)"

[ -n "${FPATH}" ] || exit 0
[ -f "${FPATH}" ] || exit 0

# Never reformat generated output.
case "${FPATH}" in
  *.gen.go|*/gen/*|*/generated/*|*.gen.ts|*.pb.go) exit 0 ;;
esac

TB=""
command -v timeout  >/dev/null 2>&1 && TB="timeout"
command -v gtimeout >/dev/null 2>&1 && TB="gtimeout"
run() {
  command -v "${1%% *}" >/dev/null 2>&1 || return 0
  if [ -n "${TB}" ]; then
    ${TB} 5 bash -c "$1 \"${FPATH}\"" >/dev/null 2>&1 || true
  else
    bash -c "$1 \"${FPATH}\"" >/dev/null 2>&1 || true
  fi
}

case "${FPATH}" in
  *.go)                       run "${TOGO_FMT_GO:-gofmt -w}" ;;
  *.ts|*.tsx|*.js|*.jsx|*.css|*.json|*.md)
                              [ -n "${TOGO_FMT_WEB:-}" ] && run "${TOGO_FMT_WEB}" ;;
  *.sql)                      [ -n "${TOGO_FMT_SQL:-}" ] && run "${TOGO_FMT_SQL}" ;;
esac

exit 0
