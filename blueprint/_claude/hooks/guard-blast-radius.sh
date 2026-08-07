#!/usr/bin/env bash
# guard-blast-radius.sh — PreToolUse(Write|Edit|MultiEdit|NotebookEdit) hook
# enforcing Rule 35 (blast radius) and Rule 38 (no self-modification).
#
# Three arms, all driven by .claude/autonomy.yaml — the operator's file, not the
# agent's:
#
#   ARM 1 — paths.deny (Rule 38). DENY WINS, unconditionally. `.claude/**` and
#           `.github/**` are on it because an agent that can edit its own guards
#           has no guards, and an agent that can edit a workflow can run
#           arbitrary code with the repository's credentials. `**/*.gen.go`,
#           `db/migrations/**`, `.env*` and `**/secrets/**` are there for the
#           reasons rules 11, 23 and 34 give.
#
#   ARM 2 — paths.allow (Rule 35). A write to a path matched by nothing in the
#           allowlist is blocked. This is the arm that keeps a run inside the
#           part of the repo the issue was about.
#
#   ARM 3 — blast_radius caps (Rule 35): max_files_changed, max_net_lines_changed,
#           max_new_files. Measured from the real working tree — `git diff HEAD
#           --numstat` for tracked files plus `git ls-files --others` for new
#           ones — not from a counter this hook maintains. Stateless, survives a
#           crashed session, cannot drift.
#
# Exceeding a cap is NOT a failure. It is the signal that the issue was
# mis-specified, and the block message says so and asks for a decomposition
# rather than a smaller edit.
#
# Escape hatch: TOGO_ALLOW_PROTECTED_WRITE=1 for one deliberate, operator-
# authorised edit. An environment variable rather than a config flag on purpose:
# it dies with the session and it appears in the transcript where a reviewer
# sees it.
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
    from _lib import load_json, load_yaml, get, as_list, g2re, relpath
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)
aut_file = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
aut_path = aut_file if os.path.isabs(aut_file) else os.path.join(root, aut_file)
aut = load_yaml(aut_path)

DENY = as_list(get(aut, "paths.deny")) or [
    ".claude/**", ".github/**", "**/*.gen.go", "**/gen/**",
    ".env*", "**/secrets/**", "db/migrations/**",
]
ALLOW = as_list(get(aut, "paths.allow"))
EXEMPT = os.environ.get("TOGO_ALLOW_PROTECTED_WRITE", "") not in ("", "0", "false", "no")

ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}
fp = str(ti.get("file_path") or ti.get("notebook_path") or "")
if not fp:
    sys.exit(0)
n = relpath(fp, root)
if not n:
    sys.exit(0)

# ARM 1 — deny wins.
for pat in DENY:
    if g2re(pat).match(n):
        print("DENY\t%s\t%s\t" % (n, pat) if not EXEMPT else "EXEMPT\t%s\t%s\t" % (n, pat))
        sys.exit(0)

# ARM 2 — allowlist. Empty allowlist means "not configured", not "deny all":
# a half-rendered autonomy.yaml must not make the repo read-only.
if ALLOW and not any(g2re(p).match(n) for p in ALLOW):
    print("OUTSIDE\t%s\t%s\t" % (n, ", ".join(ALLOW[:8])))
    sys.exit(0)

print("OK\t\t\t")
sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
WHAT="$(printf '%s' "${VERDICT}" | cut -f2)"
EXTRA="$(printf '%s' "${VERDICT}" | cut -f3)"

case "${KIND}" in
  DENY)
    {
      echo "BLOCKED by Rule 38 (no self-modification) — .claude/rules/38-no-self-modification.md"
      echo "  Path    : ${WHAT}"
      echo "  Matched : autonomy.yaml paths.deny -> ${EXTRA}"
      echo ""
      echo "  Deny wins unconditionally. This path is either the agent's own operating"
      echo "  system, the CI that runs with the repository's credentials, generated"
      echo "  output, a migration, or secret material — none of which a feature run"
      echo "  authors."
      echo ""
      echo "  The sanctioned alternative:"
      echo "    .claude/**            Propose the diff IN CHAT. The operator applies it."
      echo "    .github/**            Same — a human opens that PR."
      echo "    **/*.gen.go, gen/**   Edit the source of truth and run 'togo generate'."
      echo "    db/migrations/**      Never hand-authored: change db/schema.sql and let"
      echo "                          the generator write the migration (Rule 23)."
      echo "    .env*, secrets/**     Reference secrets by NAME only (Rule 34)."
      echo ""
      echo "    Genuinely authorised?  The operator exports TOGO_ALLOW_PROTECTED_WRITE=1"
      echo "                           for this one edit. It dies with the session and it"
      echo "                           is visible in the transcript."
    } >&2
    exit 2
    ;;
  EXEMPT)
    echo "NOTE: protected-path write to ${WHAT} (paths.deny -> ${EXTRA}) allowed because TOGO_ALLOW_PROTECTED_WRITE is set. Visible in the transcript." >&2
    ;;
  OUTSIDE)
    {
      echo "BLOCKED by Rule 35 (blast radius — write allowlist) — .claude/rules/35-blast-radius.md"
      echo "  Path : ${WHAT}"
      echo "  autonomy.yaml paths.allow: ${EXTRA}"
      echo ""
      echo "  A run writes inside the area its issue is about. A write outside the"
      echo "  allowlist usually means the issue has grown a second issue inside it."
      echo ""
      echo "  The sanctioned alternative: finish the part that is in scope, land it, and"
      echo "  file the rest as its own issue. If the allowlist is genuinely wrong for this"
      echo "  project, the OPERATOR widens paths.allow — .claude/** is denied to agents."
    } >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# ARM 3 — the caps, measured against the real working tree.
# ---------------------------------------------------------------------------
cd "${ROOT}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

CAPS="$(python3 -c '
import sys, os
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get
except Exception:
    sys.exit(0)
cfg = load_json(sys.argv[2])
af = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
ap = af if os.path.isabs(af) else os.path.join(sys.argv[3], af)
a = load_yaml(ap)
def n(k, d):
    try:
        return int(float(get(a, k, d)))
    except Exception:
        return d
print("%d\t%d\t%d" % (n("blast_radius.max_files_changed", 0),
                      n("blast_radius.max_net_lines_changed", 0),
                      n("blast_radius.max_new_files", 0)))
' "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"

MAX_FILES="$(printf '%s' "${CAPS}" | cut -f1)"; [ -z "${MAX_FILES:-}" ] && MAX_FILES=0
MAX_LOC="$(printf '%s'   "${CAPS}" | cut -f2)"; [ -z "${MAX_LOC:-}" ] && MAX_LOC=0
MAX_NEW="$(printf '%s'   "${CAPS}" | cut -f3)"; [ -z "${MAX_NEW:-}" ] && MAX_NEW=0
{ [ "${MAX_FILES}" -eq 0 ] && [ "${MAX_LOC}" -eq 0 ] && [ "${MAX_NEW}" -eq 0 ]; } 2>/dev/null && exit 0

# Tracked delta plus untracked new files. Untracked matters most: creating 30
# new files is the commonest way a run blows past a cap, and `git diff HEAD`
# cannot see a single one of them.
TRACKED="$(git diff HEAD --numstat 2>/dev/null | python3 -c '
import sys
f=a=r=0
for ln in sys.stdin:
    p=ln.split("\t")
    if len(p)<3: continue
    f+=1
    try: a+=int(p[0]); r+=int(p[1])
    except ValueError: pass          # binary: a file, not lines
print("%d\t%d\t%d"%(f,a,r))' 2>/dev/null || true)"
NEWFILES="$(git ls-files --others --exclude-standard 2>/dev/null | head -500 | wc -l | tr -d ' ')"
NEWLINES="$(git ls-files --others --exclude-standard 2>/dev/null | head -500 \
            | while IFS= read -r u; do [ -f "${u}" ] && wc -l < "${u}" 2>/dev/null; done \
            | python3 -c 'import sys;print(sum(int(x) for x in sys.stdin.read().split() or [0]))' 2>/dev/null || echo 0)"

TF="$(printf '%s' "${TRACKED}" | cut -f1)"; [ -z "${TF:-}" ] && TF=0
TA="$(printf '%s' "${TRACKED}" | cut -f2)"; [ -z "${TA:-}" ] && TA=0
TR="$(printf '%s' "${TRACKED}" | cut -f3)"; [ -z "${TR:-}" ] && TR=0
[ -z "${NEWFILES:-}" ] && NEWFILES=0
[ -z "${NEWLINES:-}" ] && NEWLINES=0

FILES=$(( TF + NEWFILES ))
NET=$(( TA + NEWLINES - TR )); [ "${NET}" -lt 0 ] && NET=$(( -NET ))

OVER=""
{ [ "${MAX_FILES}" -gt 0 ] && [ "${FILES}" -gt "${MAX_FILES}" ]; } 2>/dev/null \
  && OVER="${FILES} files changed (cap ${MAX_FILES})"
{ [ "${MAX_LOC}" -gt 0 ] && [ "${NET}" -gt "${MAX_LOC}" ]; } 2>/dev/null \
  && OVER="${OVER:+${OVER}; }${NET} net lines changed (cap ${MAX_LOC})"
{ [ "${MAX_NEW}" -gt 0 ] && [ "${NEWFILES}" -gt "${MAX_NEW}" ]; } 2>/dev/null \
  && OVER="${OVER:+${OVER}; }${NEWFILES} new files (cap ${MAX_NEW})"

if [ -n "${OVER}" ]; then
  {
    echo "BLOCKED by Rule 35 (blast radius) — .claude/rules/35-blast-radius.md"
    echo "  ${OVER}"
    echo "  (tracked: ${TF} files +${TA}/-${TR} · untracked: ${NEWFILES} files +${NEWLINES})"
    echo ""
    echo "  Exceeding a cap is NOT a failure — it is the signal that the issue was"
    echo "  mis-specified. A change this size cannot be reviewed as one unit, cannot be"
    echo "  bisected, and cannot be reverted without taking unrelated work with it."
    echo ""
    echo "  The sanctioned alternative — decompose, do not shrink the edit:"
    echo "    1. Verify and land the slice that is already finished:"
    echo "         git add <explicit paths>   # Rule 42: never -A, never ."
    echo "         git commit -m '<the finished slice>'"
    echo "    2. Write the decomposition into the run journal: what this issue really"
    echo "       contains, and what the follow-up issues should be."
    echo "    3. Hand that plan to a human. Do not raise the cap — .claude/ is theirs."
    echo ""
    echo "  Caps live in .claude/autonomy.yaml (blast_radius)."
  } >&2
  exit 2
fi

exit 0
