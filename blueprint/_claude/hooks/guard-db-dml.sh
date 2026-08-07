#!/usr/bin/env bash
# guard-db-dml.sh — PreToolUse(Bash) hook enforcing Rule 21 (no direct DB writes).
#
# PORTED, NOT REDESIGNED. The only substantive change from its ancestor is the
# allowed-runner set, which now comes from hook-config
# `database.migration_runner.allowed_patterns` — in togo that is `togo migrate`,
# `togo generate`, `atlas migrate`, `sqlc generate|vet|diff`.
#
# Blocks manual data writes (INSERT/UPDATE/DELETE/COPY..FROM/UPSERT/MERGE)
# through a SQL client against anything that is not an explicitly ephemeral
# target. Direct DML is silently lost on the next redeploy, reseed or
# environment rebuild — and the loss is silent, so nobody notices until the
# behaviour it was propping up quietly disappears.
#
# Blocked:
#   psql/mysql/mongosh ... -c "... INSERT/UPDATE/DELETE ..."
#   kubectl exec <db-pod> -- psql ... INSERT/UPDATE/DELETE ...
#
# Allowed:
#   Read-only SELECT / \dt / count / EXPLAIN
#   The sanctioned runners from hook-config
#   DML that EXPLICITLY names a database.ephemeral_targets entry
#   (DDL is guard-direct-ddl.sh / Rule 20; wipes are guard-db-wipe.sh / Rule 22)
#
# Exit 0 = allow, exit 2 = block. `set -uo pipefail` deliberately WITHOUT -e.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

CMD="$(printf '%s' "${PAYLOAD}" | python3 -c '
import json,sys
try:
    print(str((json.load(sys.stdin).get("tool_input") or {}).get("command") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)"
[ -z "${CMD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"

NORM="$(printf '%s' "${CMD}" | tr '\n' ' ' | tr -s ' ')"
LOW="$(printf '%s' "${NORM}" | tr '[:upper:]' '[:lower:]')"

# Only police commands that actually drive a SQL client.
printf '%s' "${LOW}" | grep -qE '(^|[^a-z])(psql|mysql|mariadb|mongosh|sqlite3)([[:space:]]|$)' || exit 0

# Sanctioned runner, or an explicitly ephemeral target -> allow.
FACTS="$(printf '%s' "${CMD}" | python3 -c '
import re, sys
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get, as_list, ere_to_py
except Exception:
    sys.exit(0)
cmd = sys.stdin.read()
cfg = load_json(sys.argv[2])
def hit(pats):
    for p in as_list(pats):
        try:
            if re.search(ere_to_py(p), cmd, re.I):
                return True
        except Exception:
            continue
    return False
print("1" if hit(get(cfg, "database.migration_runner.allowed_patterns")) else "0")
print("1" if hit(get(cfg, "database.ephemeral_targets.url_patterns")) or
      any(c and c in cmd for c in as_list(get(cfg, "database.ephemeral_targets.container_names")))
      else "0")
print(str(get(cfg, "database.migration_runner.command", "togo migrate")))
print(str(get(cfg, "database.migration_runner.migrations_dir", "db/migrations")))
' "${HOOK_DIR}" "${CONFIG}" 2>/dev/null || true)"

IS_RUNNER="$(printf '%s\n' "${FACTS}" | sed -n 1p 2>/dev/null || echo 0)"
IS_LOCAL="$(printf '%s\n' "${FACTS}" | sed -n 2p 2>/dev/null || echo 0)"
RUNNER="$(printf '%s\n' "${FACTS}" | sed -n 3p 2>/dev/null || echo "togo migrate")"
MIGDIR="$(printf '%s\n' "${FACTS}" | sed -n 4p 2>/dev/null || echo "db/migrations")"
[ -z "${RUNNER}" ] && RUNNER="togo migrate"
[ -z "${MIGDIR}" ] && MIGDIR="db/migrations"

[ "${IS_RUNNER:-0}" = "1" ] && exit 0
[ "${IS_LOCAL:-0}" = "1" ] && exit 0

# Does the command carry a data-mutating verb?
if printf '%s' "${LOW}" | grep -qE '(^|[^a-z])(insert[[:space:]]+into|update[[:space:]]+[a-z_."]+[[:space:]]+set|delete[[:space:]]+from|copy[[:space:]]+[a-z_."]+.*[[:space:]]from|upsert|merge[[:space:]]+into|truncate)'; then
  {
    echo "BLOCKED by Rule 21 (no direct DB writes) — .claude/rules/21-no-direct-db-writes.md"
    echo "  Command: ${NORM}"
    echo ""
    echo "  A manual INSERT/UPDATE/DELETE against a real database is LOST on the next"
    echo "  redeploy, reseed or environment rebuild — and it is lost silently. The next"
    echo "  person to build this environment from source gets a different database from"
    echo "  the one you just changed, and nothing anywhere records the difference."
    echo ""
    echo "  The sanctioned alternative:"
    echo "    - Schema-shaped change?  db/schema.sql -> the Rule 23 workflow -> '${RUNNER}'"
    echo "    - Reference or seed data? Put it in the seed source and run 'togo seed'."
    echo "    - One-off cleanup?        That is a migration too: an idempotent"
    echo "                              DELETE ... WHERE <bad> in ${MIGDIR}/, committed and pushed."
    echo ""
    echo "  Read-only SELECT, the sanctioned runners, and an explicitly ephemeral target"
    echo "  all pass. Ephemeral targets are listed in .claude/hook-config.json"
    echo "  (database.ephemeral_targets) — a command must NAME one, because 'it was"
    echo "  pointed at local' is not something a guard can verify after the fact."
  } >&2
  exit 2
fi

exit 0
