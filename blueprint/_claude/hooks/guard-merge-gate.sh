#!/usr/bin/env bash
# guard-merge-gate.sh — PreToolUse(Bash) hook enforcing Rule 31 (never merge your
# own work) and Rule 37 (no merge without a run journal).
#
# ===========================================================================
# READ THIS BEFORE YOU TRUST IT
# ---------------------------------------------------------------------------
# A CLIENT-SIDE HOOK CONSTRAINS ONLY THIS SHELL.
#
# It stops `gh pr merge` typed by an agent in THIS session. It does not stop the
# same command typed in another terminal, run from CI, issued through the GitHub
# web UI or REST API, or executed by a session where hooks are disabled or the
# config is missing. It is a seatbelt, not a locked door.
#
# THE REAL CONTROL IS GITHUB BRANCH PROTECTION on the trunk and prod refs:
#     - Require a pull request before merging
#     - Require at least one approving review from someone OTHER than the author
#     - Dismiss stale approvals when new commits are pushed
#     - Require status checks to pass
#     - Include administrators
#     - Restrict who can push
#
# If those are not configured, this hook is theatre. Configure them first, and
# treat this file as the thing that catches the mistake early and explains why —
# never as the thing that makes the mistake impossible.
# ===========================================================================
#
# Blocks:
#   1. `gh pr merge` where the PR author is the current gh user — self-merge.
#      autonomy.yaml says review.self_merge: forbidden and adds "not configurable
#      to `allowed`. Ever." This hook honours that literally: there is no config
#      value that turns arm 1 off.
#   2. Any merge with no run journal for this branch, when
#      evidence.require_journal_to_merge is true.
#   3. A local `git merge` while standing on the trunk or prod ref, and a direct
#      `git push` at the prod ref — both route around the PR entirely.
#
# Every network call is capped and FAILS OPEN. An offline laptop must not become
# an un-mergeable one; a guard that fails closed on a flaky network is disabled
# within a day, and then arms 2 and 3 are gone too.
#
# Exit 0 = allow, exit 2 = block. Always exits 0 on its own parse failure.

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

NORM="$(printf '%s' "${CMD}" | tr '\n' ' ' | tr -s ' ')"
LOW="$(printf '%s' "${NORM}" | tr '[:upper:]' '[:lower:]')"
printf '%s' "${LOW}" | grep -qE '(gh[[:space:]]+pr[[:space:]]+merge|git[[:space:]]+merge|git[[:space:]]+push)' || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "${ROOT}" 2>/dev/null || exit 0

FACTS="$(python3 -c '
import os, sys
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get
except Exception:
    sys.exit(0)
cfg = load_json(sys.argv[2]); root = sys.argv[3]
af = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
a = load_yaml(af if os.path.isabs(af) else os.path.join(root, af))
print(str(get(cfg, "project.trunk", get(cfg, "git.trunk", "main"))))
print(str(get(cfg, "project.prod_ref", get(cfg, "deploy.prod_ref", ""))))
print(str(get(a, "evidence.run_journal_dir", get(cfg, "session.run_journal_dir", ".runs"))))
print("1" if str(get(a, "evidence.require_journal_to_merge", "true")).lower() not in ("false","no","0") else "0")
print(str(get(a, "level", "attended")))
' "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"

TRUNK="$(printf '%s\n' "${FACTS}" | sed -n 1p 2>/dev/null || echo main)";   [ -z "${TRUNK}" ] && TRUNK="main"
PROD="$(printf '%s\n' "${FACTS}" | sed -n 2p 2>/dev/null || true)"
JDIR="$(printf '%s\n' "${FACTS}" | sed -n 3p 2>/dev/null || echo .runs)";   [ -z "${JDIR}" ] && JDIR=".runs"
NEEDJ="$(printf '%s\n' "${FACTS}" | sed -n 4p 2>/dev/null || echo 1)";      [ -z "${NEEDJ}" ] && NEEDJ=1
LEVEL="$(printf '%s\n' "${FACTS}" | sed -n 5p 2>/dev/null || echo attended)"
case "${PROD}" in *"{{"*) PROD="" ;; esac

TB=""
command -v timeout  >/dev/null 2>&1 && TB="timeout"
command -v gtimeout >/dev/null 2>&1 && TB="gtimeout"
gh_q() { if [ -n "${TB}" ]; then ${TB} 2 gh "$@" 2>/dev/null || true; else gh "$@" 2>/dev/null || true; fi; }

BRANCH="$(git branch --show-current 2>/dev/null || echo "")"

block() {
  {
    echo "BLOCKED by $1 — .claude/rules/"
    echo "  $2"
    echo "  Command: ${NORM}"
    echo ""
    printf '%s\n' "$3"
    echo ""
    echo "  Reminder: this hook constrains only THIS shell. The real control is GitHub"
    echo "  branch protection on ${TRUNK}${PROD:+ and ${PROD}} — required PR, required"
    echo "  review from someone other than the author, required checks, administrators"
    echo "  included. If that is not configured, configure it; a hook is not a gate."
  } >&2
  exit 2
}

# --- 3. Routing around the PR (no network, cheapest, first) ----------------
if printf '%s' "${LOW}" | grep -qE 'git[[:space:]]+merge' && [ -n "${BRANCH}" ]; then
  if [ "${BRANCH}" = "${TRUNK}" ] || { [ -n "${PROD}" ] && [ "${BRANCH}" = "${PROD}" ]; }; then
    block "Rule 31 (never merge your own work)" \
          "Local 'git merge' while standing on ${BRANCH}." \
          "  The sanctioned alternative:
    gh pr create --base ${TRUNK} --head <your-branch> --fill
    ...then a HUMAN (or an independent reviewer instance) merges it. A local merge
    produces no review, no required checks, and no record of who decided it was ready."
  fi
fi
if [ -n "${PROD}" ] && printf '%s' "${LOW}" | grep -qE "git[[:space:]]+push[^|;&]*[[:space:]]${PROD}([[:space:]]|$|:)"; then
  block "Rule 31 / Rule 27 (protected refs are PR-only)" \
        "Direct push to the production ref '${PROD}'." \
        "  The sanctioned alternative: promote ${TRUNK} -> ${PROD} through a PR, so the
    promotion carries an author, a reviewer, a diff and a timestamp. Promotion is
    also a must_ask in autonomy.yaml (deploy_or_promote)."
fi

# --- 2. Run journal (Rule 37) ----------------------------------------------
if [ "${NEEDJ}" = "1" ] && printf '%s' "${LOW}" | grep -qE '(gh[[:space:]]+pr[[:space:]]+merge|git[[:space:]]+merge)'; then
  FOUND=""
  if [ -d "${JDIR}" ]; then
    [ -n "${BRANCH}" ] && FOUND="$(grep -rl -F "${BRANCH}" "${JDIR}" 2>/dev/null | head -1 || true)"
    if [ -z "${FOUND}" ]; then
      TODAY="$(date -u +%Y-%m-%d)"
      TODAY_C="$(date -u +%Y%m%d)"
      FOUND="$(ls -1 "${JDIR}" 2>/dev/null | grep -E "${TODAY}|${TODAY_C}" | head -1 || true)"
    fi
  fi
  if [ -z "${FOUND}" ]; then
    block "Rule 37 (a merge needs a run journal)" \
          "No journal in ${JDIR}/ names branch '${BRANCH:-?}' or today's date." \
          "  autonomy.yaml: evidence.require_journal_to_merge: true. A run with no journal
    entry is not done, and its PR does not merge.

  Write it first:
    ${JDIR}/$(date -u +%Y%m%dT%H%M%SZ)-${BRANCH:-<branch>}.md
      issue:  <ref>       branch: ${BRANCH:-<branch>}
      status: done
      ## What changed
      ## Evidence           <- commands run and their REAL output
      ## What is NOT done   <- the honest list
      ## Rollback
    Six months from now this file is the only surviving explanation of why the
    merge happened. Writing it after the merge is writing fiction."
  fi
fi

# --- 1. Self-merge (Rule 31). Network-bound, capped, fails OPEN. -----------
if printf '%s' "${LOW}" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge'; then
  if [ "${LEVEL}" != "unattended" ]; then
    block "Rules 30/31 (merge is above this autonomy level)" \
          "autonomy.yaml level is '${LEVEL}'; only 'unattended' may merge at all." \
          "  The sanctioned alternative: open/prepare the PR, then STOP. Report the PR URL
    and what a reviewer should look at. A human merges."
  fi
  command -v gh >/dev/null 2>&1 || exit 0
  ME="$(gh_q api user --jq .login)"
  PRNUM="$(printf '%s' "${NORM}" | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' || true)"
  if [ -n "${PRNUM}" ]; then
    AUTHOR="$(gh_q pr view "${PRNUM}" --json author --jq .author.login)"
  else
    AUTHOR="$(gh_q pr view --json author --jq .author.login)"
  fi
  if [ -n "${ME}" ] && [ -n "${AUTHOR}" ] && [ "${ME}" = "${AUTHOR}" ]; then
    block "Rule 31 (never merge your own work)" \
          "PR ${PRNUM:+#${PRNUM} }author (${AUTHOR}) is the current gh user (${ME})." \
          "  autonomy.yaml: review.self_merge: forbidden — 'not configurable to allowed. Ever.'

  The sanctioned alternative:
    gh pr ready                        # take it out of draft
    gh pr edit --add-reviewer <human>  # ask a person, or an independent reviewer instance
    ...then STOP. Report the PR URL and wait. Approving your own work is not review;
    it only records that nobody looked."
  fi
fi

exit 0
