#!/usr/bin/env bash
# guard-autonomy.sh — PreToolUse(Bash) hook enforcing Rules 15 and 30.
#
# .claude/autonomy.yaml is THE grant. This hook is the part of it that is not a
# promise. It reads the level, the may/must_ask lists, the dependency allowlist
# and the kill switch, and refuses anything the grant does not cover.
#
# THE LEVELS (from autonomy.yaml — this hook does not invent its own ladder)
#   attended     An agent proposes; a human executes anything that leaves the
#                working tree. No push, no PR, no merge, no deploy without an
#                explicit in-conversation "go". Rule 15 verbatim.
#   supervised   An agent may push a branch and open a PR by itself.
#                It may NEVER merge.
#   unattended   An agent may merge, but only when Rules 31/35/37 pass — which
#                guard-merge-gate.sh and run-journal.sh check, not this hook.
#
# MUST_ASK survives every level. At `unattended` these do not become automatic:
# unattended means "works the queue alone", not "unsupervised". This hook blocks
# them at all three levels and says which must_ask entry it matched.
#
# KILL SWITCH: `enabled: false` in autonomy.yaml stops every run dead. It is the
# first thing checked and the cheapest thing an operator can reach for.
#
# If autonomy.yaml is missing the hook is INERT (exit 0) — a blueprint must not
# brick a fresh checkout — but session-init.sh says so at the top of every
# session, which is when someone fixes it.
#
# Exit 0 = allow, exit 2 = block. Always exits 0 on its own parse failure or on
# a malformed autonomy.yaml: a broken grant file must not become a broken session.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/guard.py" <<'PY'
import os, re, sys, json

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get, as_list, ere_to_py
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
if not os.path.exists(aut_path):
    sys.exit(0)                                   # no grant file -> inert
aut = load_yaml(aut_path)
if not aut:
    sys.exit(0)                                   # unparseable -> inert, not hostile

LEVELS = ("attended", "supervised", "unattended")
level = str(get(aut, "level", "attended")).strip().lower()
if level not in LEVELS:
    level = "attended"                            # unknown level -> most cautious
enabled = str(get(aut, "enabled", "true")).strip().lower() not in ("false", "no", "0", "off")
must_ask = [m.lower() for m in as_list(get(aut, "must_ask"))]

ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}
cmd = " ".join(str(ti.get("command") or "").split())
if not cmd:
    sys.exit(0)                                   # this hook polices Bash only
low = cmd.lower()


def out(kind, need, what, detail=""):
    print("\t".join([kind, need, what, detail, level]))
    sys.exit(0)


def asks(name):
    """Is `name` on the must_ask list? Absent from the list means the operator
    deliberately removed it, so honour that rather than second-guessing."""
    return name in must_ask


# --------------------------------------------------------------------- 0. kill
if not enabled:
    out("KILL", "-", "the kill switch is off", "autonomy.yaml -> enabled: false")

# ------------------------------------------------------- 1. must_ask classes
# Deploy / promote (Rule 27). Commands come from hook-config deploy.commands.
# Match the WHOLE declared command, not its binary. `togo deploy dev` must not
# turn into a pattern that also catches `togo generate` and `togo migrate` —
# that would make every ordinary development command a must_ask, and a guard
# that blocks `togo generate` is a guard someone removes.
dc = get(cfg, "deploy.commands")
if isinstance(dc, dict):
    for env, spec in dc.items():
        if not isinstance(spec, dict) or not spec.get("command"):
            continue
        toks = str(spec["command"]).split()
        if not toks:
            continue
        pat = r"(^|[|;&]\s*)" + r"\s+".join(re.escape(t) for t in toks) + r"(\s|$)"
        try:
            if re.search(pat, cmd):
                out("MUSTASK", "deploy_or_promote",
                    "deploy or promote the '%s' environment" % env,
                    "hook-config deploy.commands.%s" % env)
        except Exception:
            pass
if re.search(r"(^|[|;&]\s*)togo\s+deploy\b", low) or re.search(r"gh\s+workflow\s+run", low):
    out("MUSTASK", "deploy_or_promote", "deploy or promote an environment", cmd[:80])

# Infrastructure (Rule 24). apply_commands are ERE in hook-config iac.
for p in as_list(get(cfg, "iac.apply_commands")):
    try:
        if re.search(ere_to_py(p), low):
            out("MUSTASK", "infrastructure_change", "change infrastructure",
                "matched hook-config iac.apply_commands")
    except Exception:
        pass
if re.search(r"(^|[|;&]\s*)(terraform|tofu|pulumi)\s+(apply|destroy|up)", low) \
   or re.search(r"(^|[|;&]\s*)kubectl\s+(apply|delete|scale|rollout|patch)", low):
    out("MUSTASK", "infrastructure_change", "change infrastructure", cmd[:80])

# Applying a migration to a shared environment (Rules 20/21/23).
runner = str(get(cfg, "database.migration_runner.command", "togo migrate"))
if re.search(r"(^|[|;&]\s*)" + re.escape(runner.split()[0]) + r"\s+migrate\b", low):
    ephemeral = False
    for p in as_list(get(cfg, "database.ephemeral_targets.url_patterns")):
        try:
            if re.search(ere_to_py(p), cmd):
                ephemeral = True
                break
        except Exception:
            pass
    named_env = re.search(r"--env[= ]\s*([a-z0-9_-]+)", low)
    if not ephemeral and named_env and named_env.group(1) != "local":
        out("MUSTASK", "migration_apply_to_shared_env",
            "apply a migration to the '%s' environment" % named_env.group(1), cmd[:80])

# Dependency addition, checked against autonomy.yaml deps.allow.
m = re.search(r"(^|[|;&]\s*)(go\s+get|npm\s+(i|install|add)|pnpm\s+add|yarn\s+add|"
              r"bun\s+add|pip\s+install|cargo\s+add)\s+([^\s|;&]+)", cmd, re.I)
if m:
    pkg = m.group(4)
    if not pkg.startswith("-") and pkg not in (".", "./"):
        allowed = as_list(get(aut, "deps.allow"))
        if not any(pkg.startswith(a) for a in allowed):
            out("MUSTASK", "dependency_addition", "add the dependency %s" % pkg,
                "autonomy.yaml deps.allow: " + (", ".join(allowed) or "(empty)"))

# ------------------------------------------------------------- 2. level gate
is_merge = bool(re.search(r"gh\s+pr\s+merge", low)) or bool(
    re.search(r"(^|[|;&]\s*)git\s+merge\b", low))
is_publish = bool(re.search(r"(^|[|;&]\s*)git\s+push\b", low)) or bool(
    re.search(r"gh\s+pr\s+(create|ready)", low))

if is_merge:
    if level != "unattended":
        out("LEVEL", "unattended", "merge to trunk",
            "merge_to_trunk is a must_ask below `unattended`"
            if asks("merge_to_trunk") else "")
elif is_publish:
    if level == "attended":
        out("LEVEL", "supervised", "push a branch or open a PR",
            "at `attended` a human executes anything that leaves the working tree (Rule 15)")

sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
NEED="$(printf '%s' "${VERDICT}" | cut -f2)"
WHAT="$(printf '%s' "${VERDICT}" | cut -f3)"
DETAIL="$(printf '%s' "${VERDICT}" | cut -f4)"
LEVEL="$(printf '%s' "${VERDICT}" | cut -f5)"

case "${KIND}" in
  KILL)
    {
      echo "BLOCKED by Rule 30 — THE KILL SWITCH IS OFF"
      echo "  .claude/autonomy.yaml has 'enabled: false'. Every agent run refuses to start."
      echo ""
      echo "  Nothing to fix in the code. The operator flipped this deliberately."
      echo "  STOP, and say so. Do not work around it, and do not edit autonomy.yaml —"
      echo "  .claude/** is denied to agents (Rule 38)."
    } >&2
    ;;
  MUSTASK)
    {
      echo "BLOCKED by Rule 30 (must_ask) — .claude/rules/30-autonomy-grant.md"
      echo "  Action: ${WHAT}"
      echo "  This is on autonomy.yaml's must_ask list as '${NEED}', which holds at EVERY"
      echo "  level — including 'unattended'. Unattended means the fleet works the queue"
      echo "  alone, not that it operates unsupervised."
      [ -n "${DETAIL}" ] && echo "  Detail: ${DETAIL}"
      echo ""
      echo "  The sanctioned alternative:"
      echo "    1. Do everything up to this point and stop cleanly."
      echo "    2. State exactly what you would run, against what, and what it changes."
      echo "    3. Open the decision to a human and WAIT. An explicit in-conversation"
      echo "       'go' is the only thing that unblocks a must_ask — never a config edit."
    } >&2
    ;;
  LEVEL)
    {
      echo "BLOCKED by Rules 15/30 (autonomy level) — .claude/rules/30-autonomy-grant.md"
      echo "  Action: ${WHAT}"
      echo "  Granted level : ${LEVEL}"
      echo "  Needs level   : ${NEED}"
      [ -n "${DETAIL}" ] && echo "  Why: ${DETAIL}"
      echo ""
      echo "  The sanctioned alternative:"
      case "${NEED}" in
        supervised)
          echo "    Commit locally, then STOP and hand the operator the exact command:"
          echo "      git push -u origin <branch> && gh pr create --fill"
          echo "    They run it, or they raise 'level' in .claude/autonomy.yaml. You do not."
          ;;
        unattended)
          echo "    Open/prepare the PR and STOP. Report the PR URL and what a reviewer"
          echo "    should look at. A merge needs an independent reviewer (Rule 31) — the"
          echo "    author never merges, at any level."
          ;;
        *)
          echo "    Stop and ask the operator."
          ;;
      esac
      echo ""
      echo "  An agent never raises its own level. .claude/** is denied to agents (Rule 38)."
    } >&2
    ;;
  *)
    exit 0
    ;;
esac
exit 2
