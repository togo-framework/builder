#!/usr/bin/env bash
# post-commit-check.sh — PostToolUse(Bash) hook. ADVISORY ONLY: it warns, it
# never blocks. By the time this runs the commit exists; failing here would leave
# the operator holding a commit they cannot talk about. CI is the gate — this is
# the cheap early warning, and .claude/forbidden-imports.json says so explicitly.
#
# Two checks against what the commit actually introduced:
#
#   1. IMPORT BOUNDARIES (Rules 11/12/13), driven entirely by
#      .claude/forbidden-imports.json `boundaries[]`. Each entry is
#      {glob, deny[], why, instead, rule, severity, exempt_globs?}. A `deny`
#      entry wrapped in ** is a substring match; otherwise it must appear as an
#      imported path. Nothing is hardcoded here — the ancestor estate kept the
#      list in a rule body AND in a grep inside the hook, and the two drifted.
#
#   2. GENERATED-FILE DRIFT, from `generated_file_checks.pairs`. A commit that
#      changes a source of truth without its regenerated output — or the
#      reverse — is drift, and drift is how `togo generate` starts failing in CI
#      for reasons nobody can reproduce locally.
#
# THE DIFF-RANGE BUG THIS FIXES
# -----------------------------
# The hook this descends from used `git diff --name-only HEAD~1 HEAD`, wrong twice:
#   - On the FIRST commit in a repository HEAD~1 does not resolve. git errors,
#     `|| true` swallows it, the file list is empty, and the check silently
#     passes. The commit most likely to import something forbidden — the initial
#     import — was the one commit never scanned.
#   - On a MERGE commit HEAD~1 is only the first parent, so the range either
#     reports the whole other branch as "this commit's changes" or, with plain
#     diff-tree, reports nothing at all.
# Fixed below by counting parents: --root for the root commit, plain diff-tree
# for a normal commit, and a first-parent diff for a merge — which is the honest
# answer to "what did this merge land on this branch".

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

read -r TOOL IS_COMMIT <<< "$(printf '%s' "${PAYLOAD}" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
cmd=str((d.get("tool_input") or {}).get("command") or "")
print(str(d.get("tool_name") or "-"), "yes" if "git commit" in cmd else "no")
' 2>/dev/null || true)"

[ "${TOOL:-}" = "Bash" ] || exit 0
[ "${IS_COMMIT:-no}" = "yes" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "${ROOT}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
git rev-parse --verify -q HEAD >/dev/null 2>&1 || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "${ROOT}/.claude/hooks")"
RULES_FILE="${TOGO_FORBIDDEN_IMPORTS:-${HOOK_DIR}/../forbidden-imports.json}"
[ -f "${RULES_FILE}" ] || exit 0

# --- the fixed diff range --------------------------------------------------
# `git rev-list --parents -n 1 HEAD` prints: <sha> [<parent> ...]
NPARENTS="$(( $(git rev-list --parents -n 1 HEAD 2>/dev/null | wc -w | tr -d ' ') - 1 ))"
if [ "${NPARENTS}" -le 0 ] 2>/dev/null; then
  FILES="$(git diff-tree --root --no-commit-id --name-only -r HEAD 2>/dev/null || true)"
elif [ "${NPARENTS}" -eq 1 ]; then
  FILES="$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null || true)"
else
  FILES="$(git diff --name-only HEAD^1 HEAD 2>/dev/null || true)"
fi
[ -z "${FILES}" ] && exit 0

FILELIST="$(mktemp 2>/dev/null)" || exit 0
trap 'rm -f "${FILELIST}" 2>/dev/null || true' EXIT
printf '%s\n' "${FILES}" > "${FILELIST}" 2>/dev/null || true

REPORT="$(python3 -c '
import os, re, sys
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get, as_list, g2re
except Exception:
    sys.exit(0)

cfg = load_json(sys.argv[2])
try:
    files = [l.strip() for l in open(sys.argv[3]) if l.strip()]
except Exception:
    sys.exit(0)

IMPORT_RE = re.compile(
    r"""(?:^\s*import\s+.*?["\x27]([^"\x27]+)["\x27]      # go/ts import "x"
        |^\s*(?:from|require)\s*\(?\s*["\x27]([^"\x27]+)["\x27]
        |^\s*["\x27]([^"\x27]+)["\x27]\s*$)              # inside a go import block
    """, re.M | re.X)

out = []
for b in (cfg.get("boundaries") or []):
    if not isinstance(b, dict) or b.get("_template"):
        continue
    glob = str(b.get("glob") or "")
    if not glob or "{{" in glob:
        continue
    gre = g2re(glob)
    exempt = [g2re(g) for g in as_list(b.get("exempt_globs"))]
    deny = as_list(b.get("deny"))
    check = str(b.get("check") or "")
    sev = str(b.get("severity") or "error")

    for f in files:
        if not gre.match(f) or any(r.match(f) for r in exempt):
            continue

        if check == "no-hand-edit":
            out.append((sev, f, 0, b, "hand-edited a generated file"))
            continue
        if not deny or not os.path.isfile(f):
            continue
        try:
            txt = open(f, errors="replace").read()
        except Exception:
            continue

        imports = set()
        for m in IMPORT_RE.finditer(txt):
            imports.add(m.group(1) or m.group(2) or m.group(3) or "")

        hit = ""
        for d in deny:
            core = d.strip("*")
            if d.startswith("**") or d.endswith("**"):
                if any(core in i for i in imports) or (core and core in txt):
                    hit = d
                    break
            else:
                if any(i == d or i.startswith(d + "/") or i.endswith("/" + d) for i in imports):
                    hit = d
                    break
                if "." in d and re.search(r"\b" + re.escape(d) + r"\b", txt):
                    hit = d          # fmt.Println-style: not an import, a call
                    break
        if hit:
            out.append((sev, f, 0, b, hit))

for sev, f, _ln, b, hit in out[:15]:
    print("BOUNDARY\t%s\t%s\t%s\t%s\t%s\t%s" % (
        sev.upper(), f, b.get("rule") or "?", hit,
        " ".join(str(b.get("why") or "").split())[:220],
        " ".join(str(b.get("instead") or "").split())[:200]))

# ---- generated-file drift -------------------------------------------------
gfc = get(cfg, "generated_file_checks.pairs")
if isinstance(gfc, list):
    for pair in gfc:
        if not isinstance(pair, dict):
            continue
        s = g2re(str(pair.get("source") or ""))
        g = g2re(str(pair.get("generated") or ""))
        src_hits = [f for f in files if s.match(f)]
        gen_hits = [f for f in files if g.match(f)]
        if src_hits and not gen_hits:
            print("DRIFT\tSOURCE_ONLY\t%s\t%s\t%s\t\t" % (
                ", ".join(src_hits[:4]), pair.get("generated"),
                pair.get("regenerate") or "togo generate"))
        elif gen_hits and not src_hits:
            print("DRIFT\tGEN_ONLY\t%s\t%s\t%s\t\t" % (
                ", ".join(gen_hits[:4]), pair.get("source"),
                pair.get("regenerate") or "togo generate"))
' "${HOOK_DIR}" "${RULES_FILE}" "${FILELIST}" 2>/dev/null || true)"

[ -z "${REPORT}" ] && exit 0

{
  echo "post-commit check (advisory — CI is the gate):"
  while IFS=$'\t' read -r kind a b c d e f; do
    [ -z "${kind}" ] && continue
    if [ "${kind}" = "BOUNDARY" ]; then
      echo ""
      echo "  [${a}] ${b}  — Rule ${c}"
      [ -n "${d}" ] && echo "     denied : ${d}"
      [ -n "${e}" ] && echo "     why    : ${e}"
      [ -n "${f}" ] && echo "     instead: ${f}"
    elif [ "${kind}" = "DRIFT" ]; then
      echo ""
      if [ "${a}" = "SOURCE_ONLY" ]; then
        echo "  [DRIFT] a generator source changed with no regenerated output:"
        echo "     changed : ${b}"
        echo "     expected: ${c}"
        echo "     fix     : run '${d}' and amend this commit. CI regenerates and diffs; it will fail."
      else
        echo "  [DRIFT] generated output changed with no source change:"
        echo "     changed : ${b}"
        echo "     source  : ${c}"
        echo "     fix     : that is the signature of a hand-edit. The next '${d}' erases it."
        echo "               Change the source and regenerate instead."
      fi
    fi
  done <<< "${REPORT}"
  echo ""
  echo "  Boundary table: .claude/forbidden-imports.json — add project rules THERE, not in bash."
} >&2

exit 0
