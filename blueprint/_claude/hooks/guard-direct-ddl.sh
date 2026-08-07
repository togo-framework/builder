#!/usr/bin/env bash
# guard-direct-ddl.sh — PreToolUse(Bash) hook enforcing Rule 20 (no direct DDL),
# with a second arm that scans Go source for RUNTIME DDL.
#
# ARM A (Bash) — the classic: CREATE/ALTER/DROP typed at a live database through
#                psql / mysql / kubectl exec / a cloud SQL CLI.
#
# ARM B (Go source) — THE ONE THAT MATTERS IN togo, and the reason this hook was
#                rewritten rather than ported. It blocks a Bash command that
#                would ADD runtime DDL to Go source (a heredoc, an `echo >`, a
#                `sed -i`); the Write/Edit path is covered by the same patterns
#                when this hook is also wired to Write|Edit.
#
#                In a plugin architecture where every plugin self-registers via
#                init() and could self-migrate on boot, `CREATE TABLE IF NOT
#                EXISTS` from service code is a one-line habit that silently
#                makes the migration history a lie. Atlas can no longer diff the
#                truth, `togo migrate:status` reports clean while the live schema
#                differs, and two replicas booting together race each other into
#                a half-applied schema.
#
#                togo's OWN auth and autopilot plugins do this today
#                (auth/auth.go, auth/pat.go, auth/mfa.go, auth/session_stores.go,
#                autopilot/autopilot.go). They are among the most-read examples in
#                the ecosystem, which makes this the violation an agent is most
#                likely to copy — and the cheapest one to catch, because it is a
#                string literal in a file being written right now.
#
# The patterns, scan globs and exemptions are hook-config
# `database.runtime_ddl.*` — including `AutoMigrate(` and `db.Exec("CREATE`,
# which no regex written from first principles would have thought to include.
#
# ALLOWED: read-only inspection; the sanctioned runners; anything under
# database.runtime_ddl.exempt_globs (db/migrations/**, *.gen.go, *_test.go,
# testdata/**); DDL naming an explicitly ephemeral target.
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
    from _lib import load_json, get, as_list, g2re, relpath, ere_to_py, first_match
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)
ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}

RUNTIME = as_list(get(cfg, "database.runtime_ddl.forbidden_source_patterns")) or [
    "CREATE[[:space:]]+TABLE[[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS",
    "AutoMigrate\\(",
]
SCAN = as_list(get(cfg, "database.runtime_ddl.scan_globs")) or ["**/*.go"]
EXEMPT = as_list(get(cfg, "database.runtime_ddl.exempt_globs")) or [
    "db/migrations/**", "**/*.gen.go", "**/*_test.go", "**/testdata/**",
]
RUNNERS = get(cfg, "database.migration_runner.allowed_patterns")
EPHEMERAL = get(cfg, "database.ephemeral_targets.url_patterns")
SCHEMA_FILE = str(get(cfg, "database.migration_runner.schema_file", "db/schema.sql"))
RUNNER_CMD = str(get(cfg, "database.migration_runner.command", "togo migrate"))


def scanned(p):
    n = relpath(p, root)
    if not n:
        return False
    if any(g2re(g).match(n) for g in EXEMPT):
        return False
    return any(g2re(g).match(n) for g in SCAN)


# ------------------------------------------------------------------- ARM B
# A write/edit whose target is a scanned source file and whose new text carries
# runtime DDL.
fp = str(ti.get("file_path") or ti.get("notebook_path") or "")
body = str(ti.get("content") or ti.get("new_string") or "")
eds = ti.get("edits")
if isinstance(eds, list):
    body = "\n".join([body] + [str(e.get("new_string") or "")
                               for e in eds if isinstance(e, dict)])

if fp and body and scanned(fp):
    pat, m = first_match(body, RUNTIME, re.I | re.S)
    if pat:
        print("GO\t%s\t%s\t%s" % (relpath(fp, root),
                                  (m.group(0)[:70] if m else pat),
                                  SCHEMA_FILE))
        sys.exit(0)

# A Bash command that writes runtime DDL into a source file (heredoc, echo >,
# sed -i). Same offence, different delivery.
cmd = str(ti.get("command") or "")
if cmd:
    targets = re.findall(r">>?\s*([^\s\"'|;&<>()]+)", cmd) + \
              re.findall(r"(?:sed|perl)\s+-i[^\s]*\s+[^\s]+\s+([^\s\"'|;&<>()]+)", cmd)
    if any(scanned(t) for t in targets):
        pat, m = first_match(cmd, RUNTIME, re.I | re.S)
        if pat:
            print("GO\t%s\t%s\t%s" % (", ".join(relpath(t, root) for t in targets[:2]),
                                      (m.group(0)[:70] if m else pat), SCHEMA_FILE))
            sys.exit(0)

# ------------------------------------------------------------------- ARM A
if not cmd:
    sys.exit(0)
low = " ".join(cmd.split()).lower()

# Pure code search is not DDL.
if re.match(r"^\s*(grep|rg|ag|ack|fd|find|cat|less|head|tail|bat|wc)\b", low) and \
   not re.search(r"(psql|mysql|mongosh|kubectl|gcloud|aws|az)", low):
    sys.exit(0)

# Sanctioned runner, or explicitly ephemeral target -> allow.
p, _ = first_match(cmd, RUNNERS, re.I)
if p:
    sys.exit(0)
p, _ = first_match(cmd, EPHEMERAL, re.I)
if p:
    sys.exit(0)

DDL = (r"(create|alter|drop)\s+(if\s+not\s+exists\s+)?"
       r"(table|index|view|materialized\s+view|function|type|schema|policy|"
       r"extension|trigger|sequence|database|user|role)")
CLOUD = r"(gcloud\s+sql|aws\s+rds|az\s+postgres)\s+[a-z-]+\s+(create|delete|patch|update|reset|import|modify)"
KUBE = r"kubectl\s+exec\s+.*(psql|mysql|mongosh|pg_restore)"
CLIENT = r"(^|[^a-z])(psql|mysql|mariadb|mongosh)\s"

violation = ""
if re.search(CLOUD, low):
    violation = "cloud SQL resource mutation (create / delete / patch / update / reset / import)"
elif re.search(KUBE, low) and re.search(DDL, low):
    violation = "kubectl exec ... <sql client> with CREATE/ALTER/DROP"
elif re.search(CLIENT, low) and re.search(DDL, low):
    if re.search(r"(-h\s+|--host|postgres(ql)?://|mysql://|mongodb(\+srv)?://)", low):
        violation = "SQL client with CREATE/ALTER/DROP against a host that is not an declared ephemeral target"

if violation:
    print("BASH\t%s\t%s\t%s" % (violation, " ".join(cmd.split())[:160], RUNNER_CMD))
sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
A="$(printf '%s' "${VERDICT}" | cut -f2)"
B="$(printf '%s' "${VERDICT}" | cut -f3)"
C="$(printf '%s' "${VERDICT}" | cut -f4)"

if [ "${KIND}" = "GO" ]; then
  {
    echo "BLOCKED by Rule 20 (no runtime DDL) — .claude/rules/20-no-direct-ddl.md"
    echo "  File   : ${A}"
    echo "  Matched: ${B}"
    echo ""
    echo "  DDL in service code is a SECOND, undeclared schema authority. Atlas can no"
    echo "  longer diff the truth, 'togo migrate:status' reports clean while the live"
    echo "  schema differs, and two replicas booting at the same time race each other"
    echo "  into a half-applied schema. It works on your machine every single time."
    echo ""
    echo "  The sanctioned alternative:"
    echo "    1. Declare the table/column/index in ${C}"
    echo "    2. Generate the migration (Rule 23's workflow — the generator writes it,"
    echo "       you never hand-author a file in db/migrations/)"
    echo "    3. Apply it forward-only with '${C:+togo migrate}'"
    echo "    4. togo generate   — sqlc regenerates the typed accessors"
    echo ""
    echo "  NOTE: togo's own auth/ and autopilot/ plugins still create tables at runtime."
    echo "  That is known debt in the framework, not a pattern to copy into your project."
    echo "  Patterns: .claude/hook-config.json -> database.runtime_ddl"
  } >&2
  exit 2
fi

{
  echo "BLOCKED by Rule 20 (no direct DDL) — .claude/rules/20-no-direct-ddl.md"
  echo "  ${A}"
  echo "  Command: ${B}"
  echo ""
  echo "  DDL typed at a live database makes the migration history a fiction. The next"
  echo "  environment built from this repository will not match the one you just"
  echo "  changed, and there will be nothing in the tree that says why."
  echo ""
  echo "  The sanctioned alternative:"
  echo "    1. Edit db/schema.sql"
  echo "    2. Generate the migration (Rule 23), never hand-author one"
  echo "    3. ${C}"
  echo "    4. togo generate && commit the regenerated *.gen.go"
  echo ""
  echo "  Applying a migration to a shared environment is a must_ask in autonomy.yaml."
  echo "  False positive? Narrow the pattern in .claude/hooks/guard-direct-ddl.sh."
  echo "  Do not disable the hook."
} >&2
exit 2
