#!/usr/bin/env bash
# run-journal.sh — Stop hook enforcing Rule 37 (the run journal) and, through it,
# Rule 28 (verify before closing).
#
# When the agent tries to end its turn, this hook reads the last assistant
# message out of the transcript. If it CLAIMS completion — "done", "fixed",
# "deployed", "working now", "all set" — but the session shows no EVIDENCE, the
# stop is refused and the reason is handed back to the model.
#
# WHAT COUNTS AS EVIDENCE, in order of preference:
#   1. A run journal in autonomy.yaml evidence.run_journal_dir (.runs/) written
#      or updated during this session, containing an evidence section.
#   2. An evidence block in the final message: a fenced block holding real
#      command output — not a sentence describing output.
#   3. A verification command actually run in this session AFTER the last file
#      write: a build, a test, a codegen diff-check, a probe against the running
#      surface.
#
# "I updated the handler and it should now return 200" is a hypothesis. Rule 37
# exists because a hypothesis stated in the past tense is indistinguishable from
# a result in a chat log — and six months later the chat log is all there is.
# autonomy.yaml puts it as: a run with no journal entry is not done and its PR
# does not merge. This hook is what makes that mechanical rather than aspirational.
#
# LOOP SAFETY: if the payload carries stop_hook_active the hook exits 0
# immediately. A Stop hook that can block its own retry hangs the session
# forever, which is a worse failure than an unevidenced claim.
#
# Exit 0 = let the turn end. Exit 2 = refuse; stderr goes to the model.
# Always exits 0 on its own parse failure.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/journal.py" <<'PY'
import json, os, re, sys, time

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get, as_list
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if payload.get("stop_hook_active"):
    sys.exit(0)                                   # never fight our own retry

cfg = load_json(cfg_path)
aut_file = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
aut = load_yaml(aut_file if os.path.isabs(aut_file) else os.path.join(root, aut_file))

jdir_rel = str(get(aut, "evidence.run_journal_dir",
                   get(cfg, "session.run_journal_dir", ".runs")))
jdir = jdir_rel if os.path.isabs(jdir_rel) else os.path.join(root, jdir_rel)
layers = as_list(get(aut, "evidence.live_verification_layers"))

CLAIM = r"\b(done|complete[d]?|finished|shipped|deployed|all set|working now|fixed|resolved)\b"
MARKERS = ("## evidence", "### evidence", "evidence:")

transcript = str(payload.get("transcript_path") or "")
if not transcript or not os.path.exists(transcript):
    sys.exit(0)

try:
    size = os.path.getsize(transcript)
    with open(transcript, "r", errors="replace") as fh:
        if size > 2_000_000:
            fh.seek(size - 2_000_000)
            fh.readline()
        lines = fh.readlines()
except Exception:
    sys.exit(0)

records = []
for ln in lines:
    ln = ln.strip()
    if not ln.startswith("{"):
        continue
    try:
        records.append(json.loads(ln))
    except Exception:
        continue
if not records:
    sys.exit(0)


def text_of(rec):
    msg = rec.get("message")
    if not isinstance(msg, dict):
        return ""
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(str(p.get("text") or "") for p in c
                         if isinstance(p, dict) and p.get("type") == "text")
    return ""


def role_of(rec):
    msg = rec.get("message")
    return str((msg or {}).get("role") or rec.get("type") or "")


last = ""
for rec in reversed(records):
    if "assistant" in role_of(rec):
        t = text_of(rec)
        if t.strip():
            last = t
            break
if not last.strip():
    sys.exit(0)
if not re.search(CLAIM, last, re.I):
    sys.exit(0)                                   # no claim -> nothing to substantiate

# --- evidence 2: an evidence block in the message itself -------------------
low = last.lower()
if any(m in low for m in MARKERS):
    sys.exit(0)
for f in re.findall(r"```[a-zA-Z]*\n(.*?)```", last, re.S):
    if len(f.strip().splitlines()) >= 2 and re.search(
            r"(\bok\b|PASS|FAIL|HTTP/|coverage:|\d{3}\s|error|Running|exit status|\bno changes\b)",
            f, re.I):
        sys.exit(0)

# --- evidence 1: a run journal touched during this session ------------------
cutoff = time.time() - 12 * 3600
if os.path.isdir(jdir):
    for name in os.listdir(jdir):
        p = os.path.join(jdir, name)
        try:
            if os.path.isfile(p) and os.path.getmtime(p) > cutoff:
                body = open(p, errors="replace").read().lower()
                if any(m in body for m in MARKERS):
                    sys.exit(0)
        except Exception:
            continue

# --- evidence 3: a verification command run after the last file write -------
VERIFY = re.compile(
    r"(go\s+(test|build|vet)|togo\s+(test|generate|doctor|lint)|"
    r"(npm|pnpm|yarn|bun)\s+(test|run\s+(build|typecheck))|pytest|"
    r"curl\s|kubectl\s+get|gh\s+run\s+watch|make\s+test|git\s+diff\s+--exit-code)", re.I)

last_write = -1
last_verify = -1
for i, rec in enumerate(records):
    msg = rec.get("message")
    content = (msg or {}).get("content") if isinstance(msg, dict) else None
    if not isinstance(content, list):
        continue
    for part in content:
        if not isinstance(part, dict) or part.get("type") != "tool_use":
            continue
        name = str(part.get("name") or "")
        inp = part.get("input") if isinstance(part.get("input"), dict) else {}
        if name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
            last_write = i
        elif name == "Bash" and VERIFY.search(str(inp.get("command") or "")):
            last_verify = i

if last_verify > last_write:
    sys.exit(0)

print("%s\t%s\t%s" % (" ".join(last.split())[:150], jdir_rel, " · ".join(layers[:6])))
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/journal.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

CLAIM="$(printf '%s' "${VERDICT}" | cut -f1)"
JDIR="$(printf '%s' "${VERDICT}" | cut -f2)"
LAYERS="$(printf '%s' "${VERDICT}" | cut -f3)"

BRANCH="$(cd "${ROOT}" 2>/dev/null && git branch --show-current 2>/dev/null || echo "run")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

{
  echo "STOP REFUSED by Rule 37 (a claim of done needs evidence) — .claude/rules/37-run-journal.md"
  echo ""
  echo "  You claimed completion:"
  echo "    \"${CLAIM}...\""
  echo ""
  echo "  This session shows no evidence for it: no verification command ran after the"
  echo "  last file write, the final message contains no output block, and no run"
  echo "  journal was written. A claim of done with nothing behind it is a hypothesis"
  echo "  in the past tense — and in six months the transcript is all anyone has."
  echo ""
  echo "  Do ONE of these, then stop again:"
  echo ""
  echo "  A. RUN THE VERIFICATION and paste the REAL output:"
  echo "       go build ./... && go test ./...          # it compiles, it passes"
  echo "       togo generate && git diff --exit-code    # generated code is in sync"
  echo "       curl -sS -o /dev/null -w '%{http_code}\\n' <endpoint>   # it actually serves"
  [ -n "${LAYERS}" ] && echo "     Rule 28 layers required here: ${LAYERS}"
  echo ""
  echo "  B. WRITE THE RUN JOURNAL:"
  echo "       ${JDIR}/${STAMP}-${BRANCH}.md"
  echo "         issue:  <ref>          branch: ${BRANCH}"
  echo "         status: done | blocked"
  echo "         ## What changed"
  echo "         ## Evidence            <- the commands you ran and their REAL output"
  echo "         ## What is NOT done    <- the honest list. This is the valuable section."
  echo "         ## Rollback"
  echo ""
  echo "  C. If you cannot verify it, SAY SO PLAINLY. Replace the claim with"
  echo "     \"implemented but unverified — here is exactly what to check and how.\""
  echo "     That is an acceptable ending. A false 'done' is not."
} >&2
exit 2
