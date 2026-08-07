#!/usr/bin/env bash
# guard-secrets.sh — PreToolUse(Read|Write|Edit|MultiEdit|Bash) hook enforcing
# Rule 34 (secret handling).
#
# Blocks, from .claude/hook-config.json `secrets`:
#   - opening or writing any path in secrets.forbidden_path_globs
#     (.env*, **/secrets/**, *.pem/*.key/*.p12/*.keystore, id_rsa*, .netrc,
#      *service-account*.json, *credentials*.json, .mcp.builder.json)
#   - Bash commands that would put one of those files, or the whole process
#     environment, into the transcript (cat/head/base64/cp on a secret path;
#     `env`/`printenv`; `gcloud secrets versions access`; `kubectl get secret -o yaml`)
#   - writing a literal matching secrets.redaction_patterns into ANY file — the
#     one that catches a key pasted into a test fixture or a comment
#
# Also runs as `guard-secrets.sh --scan-output` on PostToolUse, where it warns
# that a secret shape is in the output the model just received.
#
# HONEST LIMITATION, stated because pretending otherwise is worse than the gap:
# a PostToolUse hook CANNOT redact output that has already been returned. By the
# time --scan-output runs, the bytes are in context. The only real control is the
# PreToolUse block — which is why the path list is deliberately broad and why
# settings.json ALSO denies these paths at the permission layer, before any hook
# runs. If a secret does reach the transcript the answer is to ROTATE it. That is
# a human action; hook-config says so: "rotation: human-only".
#
# Allowed: .env.example / .env.sample / .env.template / .env.dist — the shapes
# that exist precisely so nobody needs the real file.
#
# Exit 0 = allow, exit 2 = block. Always exits 0 on its own parse failure.

set -uo pipefail

case "${1:-pre}" in
  --scan-output|post|--post) MODE="post" ;;
  *)                         MODE="pre"  ;;
esac

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
    from _lib import load_json, get, as_list, g2re, relpath, first_match
except Exception:
    sys.exit(0)

cfg_path, root, mode = sys.argv[2], sys.argv[3], sys.argv[4]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)

DENY = as_list(get(cfg, "secrets.forbidden_path_globs")) or [
    ".env", ".env.*", "**/.env", "**/.env.*", "**/secrets/**",
    "**/*.pem", "**/*.key", "**/*.p12", "**/*.keystore",
    "**/id_rsa*", "**/id_ed25519*", "**/.netrc",
    "**/*service-account*.json", "**/*credentials*.json",
]
ALLOW = as_list(get(cfg, "secrets.allowed_path_globs")) or [
    "**/.env.example", "**/.env.sample", "**/.env.template", "**/.env.dist",
    ".env.example", ".env.sample", ".env.template", ".env.dist",
]
SHAPES = as_list(get(cfg, "secrets.redaction_patterns")) or [
    "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "sk-[A-Za-z0-9_-]{16,}", "ghp_[A-Za-z0-9]{20,}", "AKIA[0-9A-Z]{16}",
]

DENY_RE = [g2re(p) for p in DENY]
ALLOW_RE = [g2re(p) for p in ALLOW]


def secret_path(p):
    n = relpath(p, root)
    if not n:
        return False
    if any(r.match(n) for r in ALLOW_RE):
        return False
    return any(r.match(n) for r in DENY_RE)


ti = payload.get("tool_input") or {}
if not isinstance(ti, dict):
    ti = {}

# ------------------------------------------------------------------ post mode
if mode == "post":
    resp = payload.get("tool_response")
    text = resp if isinstance(resp, str) else json.dumps(resp, default=str)[:400000]
    pat, m = first_match(text, SHAPES, re.M)
    if pat:
        print("SHAPE\t%s\t" % pat[:48])
    sys.exit(0)

# ------------------------------------------------------------------- pre mode
fp = ti.get("file_path") or ti.get("notebook_path") or ti.get("path")
if fp and secret_path(fp):
    print("PATH\t%s\t" % relpath(fp, root))
    sys.exit(0)

# A secret VALUE being written into an otherwise innocent file — the fixture,
# the comment, the "temporary" default. This is the arm that catches the leak
# that never touches a .env at all.
body = str(ti.get("content") or ti.get("new_string") or "")
eds = ti.get("edits")
if isinstance(eds, list):
    body = "\n".join([body] + [str(e.get("new_string") or "")
                               for e in eds if isinstance(e, dict)])
# Documentation and fixtures legitimately contain SHAPED-but-fake values, and a
# guard that blocks writing `AKIAEXAMPLE...` into a README is a guard people
# switch off. Exempt the places where an example belongs — nowhere else.
VALUE_EXEMPT = [g2re(p) for p in (
    "**/*.md", "**/*.mdx", "**/*.example", "**/*.sample", "**/*.template",
    "**/testdata/**", "**/*_test.go", "**/fixtures/**",
)]
if body and not any(r.match(relpath(fp or "", root)) for r in VALUE_EXEMPT):
    pat, m = first_match(body, SHAPES, re.M)
    if pat:
        print("VALUE\t%s\t%s" % (pat[:48], relpath(fp or "", root)))
        sys.exit(0)

cmd = str(ti.get("command") or "")
if cmd:
    low = " ".join(cmd.split()).lower()

    if re.search(r"\b(cat|bat|less|more|head|tail|xxd|od|strings|base64|cp|scp|rsync|curl\s+-T)\b", low):
        for tok in re.findall(r"[^\s\"'|;&<>()]+", cmd):
            if secret_path(tok):
                print("CMD\treads or copies %s\t" % relpath(tok, root))
                sys.exit(0)

    if re.search(r"(^|[;&|]\s*)(env|printenv|set)\s*($|[|>])", low) or "export -p" in low:
        print("CMD\tdumps the entire process environment\t")
        sys.exit(0)

    if re.search(r"(gcloud\s+secrets\s+versions\s+access|aws\s+secretsmanager\s+get-secret-value|"
                 r"az\s+keyvault\s+secret\s+show|vault\s+kv\s+get|op\s+read|doppler\s+secrets\s+get)", low):
        print("CMD\tprints a secret-manager value in cleartext\t")
        sys.exit(0)

    if re.search(r"kubectl\s+(get|describe)\s+secret", low) and re.search(r"-o\s*(yaml|json)|describe", low):
        print("CMD\tprints a Kubernetes Secret (base64 is not encryption)\t")
        sys.exit(0)

sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/guard.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" "${MODE}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
DETAIL="$(printf '%s' "${VERDICT}" | cut -f2)"
EXTRA="$(printf '%s' "${VERDICT}" | cut -f3)"

if [ "${MODE}" = "post" ]; then
  {
    echo "SECRET SHAPE IN TOOL OUTPUT (Rule 34) — .claude/rules/34-secret-handling.md"
    echo "  A value matching '${DETAIL}' is in the output you just received."
    echo ""
    echo "  Do NOT echo it, quote it, summarise it, write it to a file, or commit it."
    echo "  Refer to it by NAME only (e.g. DATABASE_URL), never by value."
    echo "  If this value is real it is now compromised: tell the operator to ROTATE it."
    echo "  Rotation is human-only. A hook cannot un-read output."
  } >&2
  exit 0
fi

{
  echo "BLOCKED by Rule 34 (secret handling) — .claude/rules/34-secret-handling.md"
  case "${KIND}" in
    PATH)  echo "  Secret-shaped path: ${DETAIL}" ;;
    VALUE) echo "  This write contains a literal matching a known secret shape: ${DETAIL}"
           [ -n "${EXTRA}" ] && echo "  Target file: ${EXTRA}" ;;
    CMD)   echo "  Command ${DETAIL}" ;;
    *)     echo "  ${DETAIL}" ;;
  esac
  echo ""
  echo "  The sanctioned alternative:"
  echo "    - Need to know a variable EXISTS?  Read .env.example, or count without"
  echo "                                       printing: grep -c '^NAME=' .env"
  echo "    - Need to ADD a variable?          Add the KEY to .env.example with a"
  echo "                                       placeholder and ask the operator to fill it."
  echo "    - Need the value at runtime?       Read it from the environment in code."
  echo "                                       Never inline it in source, tests or fixtures."
  echo "    - A secret already leaked?         Say so plainly and tell the operator to"
  echo "                                       ROTATE it. Never 'clean it up' yourself —"
  echo "                                       rewriting history does not un-publish a key."
  echo ""
  echo "  Allowed: .env.example / .env.sample / .env.template / .env.dist"
  echo "  Path list: .claude/hook-config.json -> secrets.forbidden_path_globs"
} >&2
exit 2
