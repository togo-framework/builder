#!/usr/bin/env bash
# session-init.sh — SessionStart hook. The operator's first four seconds.
#
# What it prints is declared in hook-config `session.show`, in that order:
#     autonomy_level_and_grant     branch_and_last_commit
#     todays_spend_vs_ceiling      environment_matrix
#     open_run_journal             active_rule_overlays
#     highest_consequence_rules
#
# THE AUTONOMY LINE IS THE POINT. The single most useful thing an operator can
# see at session start is what this session may do on its own: the level, whether
# the kill switch is on, and what stays a must_ask regardless. It is the
# difference between "the agent went and deployed" and "the agent asked, because
# it knew it could not".
#
# EVERYTHING here is config-driven. The hook this descends from hardcoded cloud
# project ids and customer domains in the shell source — which violated the very
# rule the file existed to teach and made it unshippable to a second project. If
# you find yourself typing a project id, a hostname, or a customer name into this
# file: stop, and put it in .claude/hook-config.json.
#
# Never blocks, never fails a session: every arm is best-effort, always exits 0.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "${ROOT}" 2>/dev/null || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "${ROOT}/.claude/hooks")"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"

# One python pass over hook-config.json + autonomy.yaml. Tab-separated key/value
# lines; repeated keys are allowed and read back with cfg_all.
CFG="$(python3 -c '
import os, sys
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get, as_list
except Exception:
    sys.exit(0)
cfg = load_json(sys.argv[2]); root = sys.argv[3]
def line(k, v):
    print(k + "\t" + str("" if v is None else v).replace("\t", " "))

line("name", get(cfg, "project.name", "") or os.path.basename(root))
line("trunk", get(cfg, "project.trunk", "main"))
line("prod", get(cfg, "project.prod_ref", ""))
line("api", get(cfg, "project.api_base", ""))
line("promotion", get(cfg, "deploy.promotion_mode", ""))
line("branch_prefix", get(cfg, "git.branch_prefix", ""))

af = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
line("autonomy_file", af)
line("ledger", get(cfg, "budget.ledger", get(cfg, "session.spend_ledger", ".runs/.spend.json")))
for s in as_list(get(cfg, "session.show")):
    line("show", s)

dc = get(cfg, "deploy.commands")
if isinstance(dc, dict):
    for env, spec in dc.items():
        if isinstance(spec, dict):
            line("env", "  ".join([str(env), str(spec.get("ref") or ""),
                                   str(spec.get("url") or ""),
                                   ("requires: " + ", ".join(as_list(spec.get("requires")))) if spec.get("requires") else ""]))

a = load_yaml(af if os.path.isabs(af) else os.path.join(root, af))
line("level", get(a, "level", ""))
line("enabled", get(a, "enabled", "true"))
line("jdir", get(a, "evidence.run_journal_dir", get(cfg, "session.run_journal_dir", ".runs")))
line("per_run", get(a, "budget.per_run_usd", get(cfg, "budget.per_run_usd", "")))
line("per_day", get(a, "budget.per_day_usd", get(cfg, "budget.per_day_usd", "")))
line("caps", "%s files · %s net lines · %s new files" % (
    get(a, "blast_radius.max_files_changed", "?"),
    get(a, "blast_radius.max_net_lines_changed", "?"),
    get(a, "blast_radius.max_new_files", "?")))
line("self_merge", get(a, "review.self_merge", ""))
ma = as_list(get(a, "must_ask"))
line("must_ask_n", len(ma))
line("must_ask", ", ".join(ma[:6]) + (" ..." if len(ma) > 6 else ""))
line("allow", ", ".join(as_list(get(a, "paths.allow"))[:8]))
' "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"

TAB=$'\t'
cfg()     { printf '%s\n' "${CFG}" | grep -m1 -E "^$1${TAB}" 2>/dev/null | cut -f2- || true; }
cfg_all() { printf '%s\n' "${CFG}" | grep     -E "^$1${TAB}" 2>/dev/null | cut -f2- || true; }
shows()   { printf '%s\n' "${CFG}" | grep -qE "^show${TAB}$1$" 2>/dev/null; }
# If session.show is absent or unparseable, show everything rather than nothing.
SHOWLIST="$(cfg_all show)"
want() { [ -z "${SHOWLIST}" ] && return 0; shows "$1"; }

NAME="$(cfg name)";  [ -z "${NAME}" ] && NAME="$(basename "${ROOT}")"
TRUNK="$(cfg trunk)"; [ -z "${TRUNK}" ] && TRUNK="main"
PROD="$(cfg prod)"
API="$(cfg api)"
PROMOTION="$(cfg promotion)"
AUT_FILE="$(cfg autonomy_file)"; [ -z "${AUT_FILE}" ] && AUT_FILE=".claude/autonomy.yaml"
LEDGER="$(cfg ledger)";          [ -z "${LEDGER}" ] && LEDGER=".runs/.spend.json"
JDIR="$(cfg jdir)";              [ -z "${JDIR}" ] && JDIR=".runs"

echo "=== ${NAME} ==="
echo ""

# --- 1. AUTONOMY -----------------------------------------------------------
if want autonomy_level_and_grant; then
  LEVEL="$(cfg level)"
  ENABLED="$(cfg enabled)"
  if [ ! -f "${AUT_FILE}" ]; then
    echo "AUTONOMY: NOT DECLARED — ${AUT_FILE} is missing."
    echo "  guard-autonomy.sh is INERT until it exists. Rule 30 expects an explicit"
    echo "  level before an agent does anything that leaves the working tree."
  elif [ "${ENABLED}" = "false" ]; then
    echo "AUTONOMY: *** KILL SWITCH IS OFF (enabled: false) — every run refuses to start ***"
  else
    echo "AUTONOMY: ${LEVEL:-unknown}"
    case "${LEVEL}" in
      attended)   echo "  An agent proposes; a HUMAN executes anything that leaves the working tree." ;;
      supervised) echo "  An agent may push a branch and open a PR. It may NEVER merge." ;;
      unattended) echo "  An agent may merge — only when Rules 31, 35 and 37 all pass." ;;
    esac
    SM="$(cfg self_merge)"
    [ -n "${SM}" ] && echo "  self-merge : ${SM} (Rule 31 — not configurable to allowed)"
    echo "  must_ask   : $(cfg must_ask_n) entries — $(cfg must_ask)"
    CAPS="$(cfg caps)"; [ -n "${CAPS}" ] && echo "  blast caps : ${CAPS}"
    ALLOWP="$(cfg allow)"; [ -n "${ALLOWP}" ] && echo "  may write  : ${ALLOWP}"
    echo "  source     : ${AUT_FILE}"
  fi
  echo ""
fi

# --- 2. Repo state ---------------------------------------------------------
if want branch_and_last_commit; then
  if git rev-parse --git-dir >/dev/null 2>&1; then
    BRANCH="$(git branch --show-current 2>/dev/null || echo "(detached)")"
    LAST="$(git log -1 --format='%h %s  (%an, %ar)' 2>/dev/null || echo "no commits yet")"
    DIRTY="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    echo "Branch : ${BRANCH}   (trunk: ${TRUNK}${PROD:+ · prod: ${PROD}})"
    echo "Commit : ${LAST}"
    echo "Dirty  : ${DIRTY} uncommitted file(s)"
    if [ "${BRANCH}" != "${TRUNK}" ] && git rev-parse --verify -q "${TRUNK}" >/dev/null 2>&1; then
      AB="$(git rev-list --left-right --count "${TRUNK}...HEAD" 2>/dev/null || true)"
      [ -n "${AB}" ] && echo "vs ${TRUNK}: $(printf '%s' "${AB}" | cut -f1) behind, $(printf '%s' "${AB}" | cut -f2) ahead"
    fi
  else
    echo "Branch : (not a git repository)"
  fi
  echo ""
fi

# --- 3. Spend --------------------------------------------------------------
if want todays_spend_vs_ceiling; then
  PER_RUN="$(cfg per_run)"
  PER_DAY="$(cfg per_day)"
  SPENT="$(python3 -c '
import json, sys, time
try:
    s = json.load(open(sys.argv[1]))
    if s.get("day") != time.strftime("%Y-%m-%d", time.gmtime()):
        print("0.00"); raise SystemExit
    print("%.2f" % float(s.get("total_usd") or 0.0))
except Exception:
    print("0.00")
' "${LEDGER}" 2>/dev/null || echo "0.00")"
  echo "Spend today: ${SPENT}${PER_DAY:+ / ${PER_DAY}} USD   (per run: ${PER_RUN:-n/a})"
  echo "  Hitting a ceiling ABORTS AND REPORTS. It never downgrades the model."
  echo ""
fi

# --- 4. Environments -------------------------------------------------------
if want environment_matrix; then
  ENVS="$(cfg_all env)"
  if [ -n "${ENVS}" ]; then
    echo "Environments (env · ref · url):"
    while IFS= read -r e; do [ -n "${e}" ] && echo "  ${e}"; done <<< "${ENVS}"
  fi
  [ -n "${API}" ]       && echo "API base  : ${API}"
  [ -n "${PROMOTION}" ] && echo "Promotion : ${PROMOTION}"
  echo ""
fi

# --- 5. Open run journal ---------------------------------------------------
if want open_run_journal; then
  if [ -d "${JDIR}" ]; then
    OPEN="$(grep -rlE '^[[:space:]]*status[[:space:]]*:[[:space:]]*(open|in[- ]progress|blocked)' "${JDIR}" 2>/dev/null | head -3 || true)"
    if [ -n "${OPEN}" ]; then
      echo "OPEN RUN JOURNAL(S) — a previous run did not close out:"
      while IFS= read -r j; do [ -n "${j}" ] && echo "  ${j}"; done <<< "${OPEN}"
    else
      LATEST="$(ls -1t "${JDIR}"/*.md 2>/dev/null | head -1 || true)"
      [ -n "${LATEST}" ] && echo "Last run journal: ${LATEST}"
    fi
    echo ""
  fi
fi

# --- 6/7. Rules ------------------------------------------------------------
if want highest_consequence_rules; then
  echo "Highest-consequence rules in force:"
  echo "  22 never wipe a database   ·  21 no direct DB writes  ·  20 no direct/runtime DDL"
  echo "  30 the autonomy grant      ·  31 never merge your own work"
  echo "  32 cost ceilings           ·  34 secret handling      ·  35 blast radius"
  echo "  37 run journal (evidence)  ·  38 no self-modification ·  42 scoped commits"
fi
if want active_rule_overlays; then
  N="$(ls -1 "${ROOT}/.claude/rules"/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ')"
  echo "Rules: ${ROOT#${HOME}/}/.claude/rules (${N:-0} files)  ·  Guards: .claude/hooks/  ·  Config: .claude/hook-config.json"
fi

exit 0
