#!/usr/bin/env bash
# capture-learning.sh — OPTIONAL, OFF BY DEFAULT.
#
# Enable by exporting TOGO_CAPTURE_LEARNING=1 and adding it to settings.json
# under PostToolUse(Bash). It is not wired by default, and it is an environment
# variable rather than a config key so that turning it on is a deliberate act
# that ends with the session.
#
# Appends one dated line to .runs/learnings.md every time something in the
# session failed informatively: a build error, a failing test, a guard that
# fired, a migration that would not apply. The point is not a diary. It is raw
# material for a future rule.
#
# WHY THAT MATTERS HERE: rules 00-28 in this estate earned their teeth from
# dated, named failures — a wipe on a specific afternoon, a deploy that set an
# env var, a claim of done that was not. Rules 30-42 ship prophylactic, with an
# explicitly empty "concrete cost" section, because they have not yet had a real
# run journal to point at. This hook is how that section eventually gets filled
# in with something true instead of something invented.
#
# It NEVER blocks (PostToolUse, always exit 0) and it never records output
# verbatim — only the command, and the first error line, and only after checking
# both against the secret shapes in hook-config. Verbatim capture is how a token
# ends up in a file that then gets committed.
#
# Off by default because an always-on writer to a tracked file adds noise to
# every diff, and noise is how a useful log becomes an ignored one.

set -uo pipefail

case "${TOGO_CAPTURE_LEARNING:-0}" in
  1|true|yes|on) ;;
  *) exit 0 ;;
esac

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/learn.py" <<'PY'
import json, os, re, sys, time

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get, as_list, first_match
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)
af = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
aut = load_yaml(af if os.path.isabs(af) else os.path.join(root, af))
jdir = str(get(aut, "evidence.run_journal_dir", get(cfg, "session.run_journal_dir", ".runs")))
log = os.path.join(root, jdir, "learnings.md")

ti = payload.get("tool_input") or {}
cmd = " ".join(str((ti or {}).get("command") or "").split())[:200]
if not cmd:
    sys.exit(0)

tr = payload.get("tool_response")
text = tr if isinstance(tr, str) else json.dumps(tr, default=str)
m = re.search(r"(?m)^(.*\b(error|FAIL|panic|cannot|undefined|no such|BLOCKED by)\b.*)$", text or "")
if not m:
    sys.exit(0)
first = " ".join(m.group(1).split())[:180]

# Never write anything secret-shaped into a tracked file.
shapes = as_list(get(cfg, "secrets.redaction_patterns"))
if first_match(first + "\n" + cmd, shapes)[0]:
    sys.exit(0)

try:
    os.makedirs(os.path.dirname(log), exist_ok=True)
    new = not os.path.exists(log)
    with open(log, "a") as fh:
        if new:
            fh.write("# Learnings\n\nRaw material for future rules: one line per informative failure.\n"
                     "When the same line appears three times, it has earned a rule.\n\n")
        fh.write("- %s  `%s`\n      -> %s\n" % (time.strftime("%Y-%m-%d", time.gmtime()), cmd, first))
except Exception:
    pass
PY

printf '%s' "${PAYLOAD}" | python3 "${TMPD}/learn.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true
exit 0
