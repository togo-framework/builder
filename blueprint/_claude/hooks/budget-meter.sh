#!/usr/bin/env bash
# budget-meter.sh — PostToolUse(Bash) hook enforcing Rule 32 (cost ceilings).
#
# Meters what this run has cost, warns approaching the ceiling, and refuses to
# let the run continue past it.
#
# THE ONE THING THIS HOOK MUST NEVER DO IS DOWNGRADE THE MODEL.
# autonomy.yaml says it plainly: "a run that ran out of money on a well-specified
# issue is telling you the issue is not well-specified, and a quieter, dumber
# retry destroys that signal." Silently switching to a cheaper model converts a
# visible, decidable cost problem into an invisible quality problem — the work
# keeps flowing, it is just quietly worse, and nobody can tell afterwards which
# half was produced under duress. At the ceiling this hook STOPS and makes a
# human decide: raise it, narrow the issue, or come back tomorrow.
# `budget_raise` is on autonomy.yaml's must_ask list; it is never self-served.
#
# CEILINGS come from autonomy.yaml `budget` (authoritative) with hook-config
# `budget` as the mirror the wizard keeps in sync:
#     per_run_usd    this session
#     per_day_usd    the whole fleet, rolling day
#     on_exhaustion  abort_and_report | open_budget_raise_decision
#
# COST SOURCE, in order:
#   1. $TOGO_SPEND_USD                — an outer harness already knows
#   2. budget.cost_command            — a CLI that prints a bare number
#   3. transcript estimate (default)  — sum the usage records in the session
#                                       transcript and price them
#
# The estimate is an ESTIMATE, priced from a table that will drift from real
# pricing. It is good enough to catch a runaway loop — which is the actual
# failure mode — and it is not an invoice. Do not quote it to anyone as one.
#
# PERFORMANCE: the transcript is parsed INCREMENTALLY from a stored byte offset
# and re-parsed at most once every recompute_every_seconds. This hook runs after
# every Bash call; it must cost microseconds most of the time or it becomes the
# most expensive thing in the session.
#
# Exit 0 = quiet or warn. Exit 2 = stop, with the reason returned to the model.
# Always exits 0 on its own parse failure.

set -uo pipefail

PAYLOAD="$(cat 2>/dev/null || true)"
[ -z "${PAYLOAD}" ] && exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)"
CONFIG="${TOGO_HOOK_CONFIG:-${HOOK_DIR}/../hook-config.json}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

EXT_COST="${TOGO_SPEND_USD:-}"
if [ -z "${EXT_COST}" ]; then
  COST_CMD="$(python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, get
    print(str(get(load_json(sys.argv[2]), "budget.cost_command", "")))
except Exception:
    pass' "${HOOK_DIR}" "${CONFIG}" 2>/dev/null || true)"
  if [ -n "${COST_CMD}" ]; then
    TB=""
    command -v timeout  >/dev/null 2>&1 && TB="timeout"
    command -v gtimeout >/dev/null 2>&1 && TB="gtimeout"
    if [ -n "${TB}" ]; then
      EXT_COST="$(${TB} 2 bash -c "${COST_CMD}" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1 || true)"
    else
      EXT_COST="$(bash -c "${COST_CMD}" 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)?' | head -1 || true)"
    fi
  fi
fi

TMPD="$(mktemp -d 2>/dev/null)" || exit 0
trap 'rm -rf "${TMPD}" 2>/dev/null || true' EXIT

cat > "${TMPD}/meter.py" <<'PY'
import json, os, sys, time

sys.path.insert(0, sys.argv[1])
try:
    from _lib import load_json, load_yaml, get
except Exception:
    sys.exit(0)

cfg_path, root = sys.argv[2], sys.argv[3]
ext_cost = sys.argv[4] if len(sys.argv) > 4 else ""

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cfg = load_json(cfg_path)
aut_file = get(cfg, "session.autonomy_file", ".claude/autonomy.yaml")
aut = load_yaml(aut_file if os.path.isabs(aut_file) else os.path.join(root, aut_file))


def num(*candidates):
    for src, key, default in candidates:
        v = get(src, key, None)
        if v is None:
            continue
        try:
            return float(v)
        except Exception:
            continue
    return candidates[-1][2]


# autonomy.yaml is authoritative; hook-config is the mirror.
run_ceiling = num((aut, "budget.per_run_usd", 0.0), (cfg, "budget.per_run_usd", 0.0))
day_ceiling = num((aut, "budget.per_day_usd", 0.0), (cfg, "budget.per_day_usd", 0.0))
warn_pct = num((cfg, "budget.warn_at_pct", 75.0))
every = num((cfg, "budget.recompute_every_seconds", 60.0))
on_exhaustion = str(get(aut, "budget.on_exhaustion",
                        get(cfg, "budget.on_exhaustion", "abort_and_report")))
currency = str(get(cfg, "budget.currency", "USD"))
prices = get(cfg, "budget.model_prices_per_mtok")
if not isinstance(prices, dict):
    prices = {}

if run_ceiling <= 0 and day_ceiling <= 0:
    sys.exit(0)                                   # no ceiling -> inert

ledger_rel = str(get(cfg, "budget.ledger", get(cfg, "session.spend_ledger", ".runs/.spend.json")))
ledger = ledger_rel if os.path.isabs(ledger_rel) else os.path.join(root, ledger_rel)

session = str(payload.get("session_id") or "default")[:64].replace("/", "_")
transcript = str(payload.get("transcript_path") or "")
today = time.strftime("%Y-%m-%d", time.gmtime())

try:
    os.makedirs(os.path.dirname(ledger) or ".", exist_ok=True)
except Exception:
    sys.exit(0)

try:
    state = json.load(open(ledger))
    if not isinstance(state, dict):
        state = {}
except Exception:
    state = {}
if state.get("day") != today:
    state = {"day": today, "runs": {}}
runs = state.setdefault("runs", {})
me = runs.setdefault(session, {"usd": 0.0, "offset": 0, "last": 0.0})

now = time.time()
stale = (now - float(me.get("last") or 0)) >= every


def price_for(model):
    m = (model or "").lower()
    for key, val in prices.items():
        if key != "default" and isinstance(val, dict) and key.lower() in m:
            return val
    d = prices.get("default")
    return d if isinstance(d, dict) else {"input": 3.0, "output": 15.0,
                                          "cache_write": 3.75, "cache_read": 0.30}


def scan(path, offset):
    added = 0.0
    try:
        size = os.path.getsize(path)
    except Exception:
        return 0.0, offset
    if size < offset:
        offset = 0                                # transcript rotated/truncated
    try:
        fh = open(path, "r", errors="replace")
    except Exception:
        return 0.0, offset
    with fh:
        fh.seek(offset)
        for line in fh:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            msg = rec.get("message") if isinstance(rec.get("message"), dict) else rec
            usage = msg.get("usage") if isinstance(msg, dict) else None
            if not isinstance(usage, dict):
                continue
            p = price_for(str(msg.get("model") or rec.get("model") or ""))
            added += (
                float(usage.get("input_tokens") or 0) * float(p.get("input", 0))
                + float(usage.get("output_tokens") or 0) * float(p.get("output", 0))
                + float(usage.get("cache_creation_input_tokens") or 0) * float(p.get("cache_write", 0))
                + float(usage.get("cache_read_input_tokens") or 0) * float(p.get("cache_read", 0))
            ) / 1_000_000.0
        offset = fh.tell()
    return added, offset


run_usd = float(me.get("usd") or 0.0)
if ext_cost:
    try:
        run_usd = float(ext_cost)
    except Exception:
        pass
elif stale and transcript and os.path.exists(transcript):
    delta, me["offset"] = scan(transcript, int(me.get("offset") or 0))
    run_usd += delta

if stale:
    me["usd"] = round(run_usd, 4)
    me["last"] = now
    state["total_usd"] = round(sum(float(r.get("usd") or 0.0) for r in runs.values()), 4)
    state["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        tmp = ledger + ".tmp"
        json.dump(state, open(tmp, "w"), indent=1)
        os.replace(tmp, ledger)
    except Exception:
        pass

day_usd = sum(float(r.get("usd") or 0.0) for r in runs.values())

over = ""
if run_ceiling > 0 and run_usd >= run_ceiling:
    over = "this run %.2f / %.2f %s" % (run_usd, run_ceiling, currency)
if day_ceiling > 0 and day_usd >= day_ceiling:
    over = (over + "; " if over else "") + "today %.2f / %.2f %s" % (day_usd, day_ceiling, currency)

if over:
    print("BLOCK\t%s\t%s" % (over, on_exhaustion))
    sys.exit(0)

if stale:
    for total, ceiling, label in ((run_usd, run_ceiling, "this run"),
                                  (day_usd, day_ceiling, "today")):
        if ceiling > 0 and total >= ceiling * warn_pct / 100.0:
            print("WARN\t%s %.2f / %.2f %s (%.0f%%)\t" %
                  (label, total, ceiling, currency, total / ceiling * 100))
            break
sys.exit(0)
PY

VERDICT="$(printf '%s' "${PAYLOAD}" | python3 "${TMPD}/meter.py" "${HOOK_DIR}" "${CONFIG}" "${ROOT}" "${EXT_COST}" 2>/dev/null || true)"
[ -z "${VERDICT}" ] && exit 0

KIND="$(printf '%s' "${VERDICT}" | cut -f1)"
DETAIL="$(printf '%s' "${VERDICT}" | cut -f2)"
MODE="$(printf '%s' "${VERDICT}" | cut -f3)"

if [ "${KIND}" = "WARN" ]; then
  {
    echo "BUDGET WARNING (Rule 32): ${DETAIL}"
    echo "  Finish and land the slice you are on. Do not start a new one."
    echo "  Do NOT switch to a cheaper model to stretch the budget — report what is left."
  } >&2
  exit 0
fi

{
  echo "STOP — Rule 32 (cost ceiling reached) — .claude/rules/32-cost-ceilings.md"
  echo "  ${DETAIL}"
  echo "  autonomy.yaml budget.on_exhaustion = ${MODE}"
  echo ""
  echo "  DO NOT continue this issue by cheaper means. In particular: DO NOT switch to"
  echo "  a smaller/faster model. A run that ran out of money on a well-specified issue"
  echo "  is telling you the issue is not well-specified, and a quieter, dumber retry"
  echo "  destroys exactly that signal."
  echo ""
  echo "  What to do instead:"
  echo "    1. Commit whatever is finished AND verified. Nothing half-done."
  echo "    2. Write the run journal: what is done, what is not, what you would do next,"
  echo "       and — most useful of all — why this cost what it did."
  echo "    3. Report and STOP."
  if [ "${MODE}" = "open_budget_raise_decision" ]; then
    echo "    4. Open a budget-raise decision for a human. Do not answer it yourself:"
    echo "       budget_raise is on autonomy.yaml's must_ask list."
  else
    echo "    4. The OPERATOR decides: raise budget in .claude/autonomy.yaml, narrow the"
    echo "       issue, or resume tomorrow. budget_raise is a must_ask — never self-served."
  fi
  echo ""
  echo "  (This figure is an ESTIMATE priced from budget.model_prices_per_mtok. Good"
  echo "   enough to catch a runaway loop; not an invoice.)"
} >&2
exit 2
