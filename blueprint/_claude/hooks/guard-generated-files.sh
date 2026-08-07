#!/usr/bin/env bash
# guard-generated-files.sh — PreToolUse(Write|Edit|MultiEdit|NotebookEdit) hook
# enforcing Rule 11 (generated code is not hand-edited).
#
# Blocks a write to anything in hook-config `generated_files.globs`:
#     **/*.gen.go        sqlc accessors, gqlgen output, OpenAPI handlers
#     **/gen/**          internal/db/gen/**
#     web/src/**/*.gen.ts, web/src/api/openapi.ts
#     **/*.pb.go
# ...plus anything carrying a generator's own DO-NOT-EDIT banner, whatever its path.
#
# Why a guard and not a convention: a hand-edit to generated code WORKS. The
# build is green, the tests pass, the review is clean — and it survives exactly
# until the next `togo generate`, which is usually someone else's machine, days
# later, with nothing in the history linking the regression to the edit. This is
# the cheapest togo violation to make and the cheapest to catch, because at the
# moment of the write we know both the path and the source of truth to redirect to.
#
# In togo the pipeline is:
#     db/queries/*.sql · graph/*.graphqls · togo.resources.yaml
#         --> togo generate (sqlc -> gqlgen -> OpenAPI) --> *.gen.go --> web/src/api/
# Change the left. Never the right.
#
# Exit 0 = allow, exit 2 = block. Always exits 0 on its own parse failure.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/guard.py" <<'PY'
import json, os, re, sys

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get, as_list, g2re, relpath
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)
GLOBS = as_list(get(cfg, "generated_files.globs")) or [
    "**/*.gen.go", "**/gen/**", "web/src/**/*.gen.ts", "**/*.pb.go",
]
REGEN = str(get(cfg, "generated_files.regenerate_command", "togo generate"))
SOURCES = get(cfg, "generated_files.sources_of_truth")
if not isinstance(SOURCES, dict):
    SOURCES = {}

ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}
fp = str(ti.get("file_path") or ti.get("notebook_path") or "")
if not fp:
    sys.exit(0)
n = relpath(fp, root)
if not n:
    sys.exit(0)

hit = ""
for pat in GLOBS:
    if g2re(pat).match(n):
        hit = pat
        break

banner = False
if not hit:
    # A generator's own claim on the file outranks any path list we maintain.
    try:
        with open(fp, "r", errors="replace") as fh:
            head = fh.read(400)
        banner = bool(re.search(r"(Code generated .*DO NOT EDIT|@generated|DO NOT EDIT)", head))
    except Exception:
        banner = False

if not hit and not banner:
    sys.exit(0)

# Which source of truth should they edit instead?
src = ""
for glob, s in SOURCES.items():
    if g2re(glob).match(n):
        src = str(s)
        break
if not src:
    src = " · ".join(str(v) for v in SOURCES.values()) or \
          "db/queries/*.sql (sqlc) · graph/*.graphqls (gqlgen) · togo.resources.yaml"

why = ("matches generated_files.globs -> %s" % hit) if hit else \
      "carries a generator DO-NOT-EDIT banner"
print("%s\t%s\t%s\t%s" % (n, why, REGEN, src))
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

FILE="$(printf '%s' "${VERDICT}" | cut -f1)"
WHY="$(printf '%s' "${VERDICT}" | cut -f2)"
REGEN="$(printf '%s' "${VERDICT}" | cut -f3)"
SRC="$(printf '%s' "${VERDICT}" | cut -f4)"

{
  echo "BLOCKED by Rule 11 (generated code is not hand-edited) — .claude/rules/11-service-boundaries.md"
  echo "  File: ${FILE}"
  echo "  It ${WHY}."
  echo ""
  echo "  A hand-edit here WORKS — build green, tests green, review clean — until the"
  echo "  next '${REGEN}' silently reverts it. That happens on someone else's machine,"
  echo "  days later, and the bug comes back with nothing in the history explaining it."
  echo ""
  echo "  The sanctioned alternative — edit the source of truth, then regenerate:"
  echo "    Source: ${SRC}"
  echo "      - Missing/wrong SQL accessor?  db/queries/*.sql"
  echo "      - Wrong table or column?       db/schema.sql, then the Rule 23 workflow"
  echo "      - Wrong GraphQL type?          graph/*.graphqls"
  echo "      - Wrong REST shape?            togo.resources.yaml"
  echo "    Then: ${REGEN}   and commit the regenerated output in the same commit."
  echo ""
  echo "  Need behaviour the generator cannot express? Put it in a NEW hand-written file"
  echo "  beside the generated one and call into it. Never inside it."
} >&2
exit 2
