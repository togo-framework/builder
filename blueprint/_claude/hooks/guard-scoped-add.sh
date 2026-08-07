#!/usr/bin/env bash
# guard-scoped-add.sh — PreToolUse(Bash) hook enforcing Rule 42
# (provenance and scoped commits).
#
# Fully data-driven: the blocked forms are hook-config `git.forbidden_commands`,
# a list of POSIX ERE patterns. Nothing is hardcoded here, so adding a form is a
# data edit. The shipped list is:
#     git add -A / --all / .          bulk staging
#     git commit -a / --all           implicit staging of every tracked change
#     git push --force / -f           rewriting a published branch
#     git reset --hard                discarding work that was never committed
#     git clean -f                    deleting untracked work irreversibly
#
# The failure this prevents is not "a messy commit". It is: an agent working in
# a tree that also holds the operator's half-finished work, a stray .env, a
# 40MB profiling dump, or a file it was never allowed to read — and `git add -A`
# commits all of it in one motion, under the agent's name. Explicit paths are the
# only staging operation whose result you can predict without first reading every
# line of `git status`.
#
# The ancestor estate recorded "never git add -A" as a bare NEVER with no
# enforcement. It was violated regularly. This is that rule with teeth.
#
# Also checks hook-config `git.required_commit_trailers`: a `git commit -m` with
# no trailers is warned about (not blocked) so a run stays attributable.
#
# Exit 0 = allow, exit 2 = block. Always exits 0 on its own parse failure.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/guard.py" <<'PY'
import json, re, sys

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get, as_list, ere_to_py
except Exception:
    sys.exit(0)

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(sys.argv[2])
PATTERNS = as_list(get(cfg, "git.forbidden_commands")) or [
    r"git[[:space:]]+add[[:space:]]+(-A|--all|\.)([[:space:]]|$)",
    r"git[[:space:]]+commit[[:space:]]+.*(-a|--all)([[:space:]]|$)",
    r"git[[:space:]]+push[[:space:]]+.*(--force|-f)([[:space:]]|$)",
    r"git[[:space:]]+reset[[:space:]]+--hard",
    r"git[[:space:]]+clean[[:space:]]+-[a-z]*f",
]
TRAILERS = as_list(get(cfg, "git.required_commit_trailers"))

# THE FLOOR — patterns that hold even if hook-config is edited or missing.
# COMBINED SHORT FLAGS are the gap: hook-config ships
#   git[[:space:]]+commit[[:space:]]+.*(-a|--all)([[:space:]]|$)
# which does NOT match `git commit -am "wip"` — in `-am`, the `-a` is followed
# by `m`, not by a space or end-of-string. `-am` is also the single most common
# way the rule is actually broken. Same for `git add -Av`, `git stash -u`.
FLOOR = [
    r"(^|[|;&]\s*)git\s+commit\s+(-[a-zA-Z]*a[a-zA-Z]*)(\s|$)",
    r"(^|[|;&]\s*)git\s+add\s+(-[a-zA-Z]*A[a-zA-Z]*)(\s|$)",
    r"(^|[|;&]\s*)git\s+add\s+(-u|--update)(\s|$)",
    r"(^|[|;&]\s*)git\s+stash(\s+(push|save))?\s+(-[a-zA-Z]*[ua][a-zA-Z]*|--include-untracked|--all)(\s|$)",
]

ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}
cmd = " ".join(str(ti.get("command") or "").split())
if not cmd or "git" not in cmd:
    sys.exit(0)

for pat in PATTERNS + FLOOR:
    try:
        if re.search(ere_to_py(pat), cmd):
            print("BLOCK\t%s\t" % pat)
            sys.exit(0)
    except Exception:
        continue

# Advisory: a commit with no provenance trailers (Rule 42's other half).
if TRAILERS and re.search(r"(^|[|;&]\s*)git\s+commit\b", cmd) and "--amend" not in cmd:
    missing = [t for t in TRAILERS if (t + ":") not in cmd]
    if len(missing) == len(TRAILERS):
        print("WARN\t%s\t" % ", ".join(TRAILERS))
sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
DETAIL="$(printf '%s' "${VERDICT}" | cut -f2)"
NORM="$(printf '%s' "${PAYLOAD}" | python3 -c '
import json,sys
try:
    print(" ".join(str((json.load(sys.stdin).get("tool_input") or {}).get("command") or "").split()))
except Exception:
    pass' 2>/dev/null || true)"

if [ "${KIND}" = "WARN" ]; then
  {
    echo "NOTE (Rule 42 — provenance): this commit carries none of the required trailers."
    echo "  Required: ${DETAIL}"
    echo "  Add them so the commit says who made it and why it exists, e.g."
    echo "    git commit -m \"<subject>\" -m \"Agent: <name>\" -m \"Model: <model>\" -m \"Run-Id: <id>\" -m \"Issue: <ref>\""
    echo "  Not blocking."
  } >&2
  exit 0
fi

{
  echo "BLOCKED by Rule 42 (scoped commits) — .claude/rules/42-provenance-and-scoped-commits.md"
  echo "  Command: ${NORM}"
  echo "  Matched: hook-config git.forbidden_commands -> ${DETAIL}"
  echo ""
  echo "  Bulk and destructive git verbs take work you did not look at. A bulk add"
  echo "  commits whatever else is in the tree — the operator's half-finished edit, a"
  echo "  stray .env, a build artefact. --force, --hard and clean -f delete work that"
  echo "  was never anywhere else."
  echo ""
  echo "  The sanctioned alternative:"
  echo "    git status --porcelain                   # see exactly what is there"
  echo "    git add path/to/file.go path/to/q.sql    # name every file"
  echo "    git diff --cached --stat                 # confirm the index"
  echo "    git commit -m '<subject>' -m 'Agent: ...' -m 'Run-Id: ...'"
  echo ""
  echo "    Need to undo?      git restore <path>   (not reset --hard)"
  echo "    Need to rewrite?   Ask the operator. A force-push to a shared branch is"
  echo "                       theirs to make, never yours."
  echo "    'git add -p' is fine — it is explicit by construction."
} >&2
exit 2
