---
description: "Per-run, per-issue, and per-day ceilings are hard stops. Hitting one aborts and reports — it never downgrades the model, raises the cap, or splits the work."
globs: "*"
alwaysApply: true
---

# Rule 32: Cost Ceilings Abort — They Never Degrade

**Every run is bounded by a per-run ceiling, a per-issue attempt cap, and a
per-day fleet budget; hitting any ceiling aborts the run and reports, and it is
never answered by a cheaper model, a raised cap, or the same work split across
more runs.**

## The Rule

### The three ceilings

```yaml
# .claude/budget.yaml
version: 1
project: {{project_name}}
currency: USD

per_run:
  usd: 5.00
  tokens: 2000000
  wall_clock_minutes: 45
  tool_calls: 400

per_issue:
  max_attempts: 3          # runs that have touched this issue, ever
  usd: 12.00               # cumulative across all attempts

per_day:
  fleet_usd: 100.00        # every agent, every repo clone, one shared ledger
  fleet_runs: 50

on_ceiling: abort_and_report   # the ONLY legal value
```

Ceilings are floors on discipline, not targets. A run that finishes at 8% of its
budget is a good run.

### What "abort and report" means

When any counter crosses its ceiling, the run:

1. **Stops immediately.** No "one more tool call to wrap up." The next
   `PreToolUse` is blocked.
2. **Does not commit partial work to `{{trunk}}`.** Work in progress stays on
   its branch, or is discarded. A half-applied change is worse than none.
3. **Writes a report** to the issue (and the run journal) containing: which
   ceiling, the counters at abort, what was attempted, what was learned, and the
   single most likely reason the work did not converge.
4. **Applies the `needs-human` label** and unassigns itself.
5. **Exits non-zero.** A ceiling abort is not a success.

### What is categorically forbidden at a ceiling

| Forbidden reaction | Why it is wrong |
|---|---|
| Switch to a cheaper/smaller model to keep going | Trades correctness for budget on exactly the task that already proved hard. The cheap model will produce a diff nobody can trust, on a problem the strong model could not solve. |
| Raise the ceiling in `.claude/budget.yaml` | `claude-config-change` is `must_ask:` (Rule 30). An agent that can raise its own budget has no budget. |
| Start a fresh run on the same issue to reset the per-run counter | The per-issue cap exists precisely to make this fail. Attempt 4 is blocked whatever it costs. |
| Split the issue into sub-issues to get fresh budget each | Self-dealing (Rule 33). Sub-issues an agent files for itself do not carry new budget. |
| Disable telemetry / stop metering so the counter stops moving | Tampering with the meter is a `claude-config-change` and a review-blocking finding. |
| Drop tests, skip verification, or narrow scope silently to fit | Produces work that looks finished and is not. |

### Escalating spend is a specification signal

A run burning through its budget on one issue is telling you something, and it
is not "this needs more budget". It is one of:

- the issue is under-specified (no acceptance criteria, no reproduction);
- the issue is actually several issues;
- the change requires a decision only a human can make (product, security, cost);
- the codebase is missing an affordance the change needs (no test harness, no
  seam, no fixture) and building that affordance is the real work;
- the agent is looping — re-reading the same files, re-running the same failing
  command with cosmetic variations.

The abort report must name which of these it believes applies. **That diagnosis
is the run's deliverable.** A well-written "this issue cannot be done as
specified, here is why, here is what it needs" is more valuable than a fourth
attempt at a diff.

### Counting rules

- Cost is metered per run and appended to a **fleet ledger**
  (`.claude/run/ledger.jsonl`, or the shared store your fleet uses). Concurrent
  runs read the ledger before starting; a run that would push the fleet over
  `per_day.fleet_usd` does not start.
- Retries, subagent calls, and tool time all count against the spawning run.
- A run aborted by a ceiling still counts as an attempt against
  `per_issue.max_attempts`.
- Wall clock is measured from the autonomy banner (Rule 30), not from first
  token.
- Ledger entries are append-only. Rewriting or truncating the ledger is
  forbidden.

## Why this rule exists — concrete cost

_Empty by design._ The strongest rules earn their authority from named,
dated failures. These are prophylactic. When a run journal produces a real
incident, record it here — do not invent one.

## Enforcement

- **`.claude/hooks/budget-meter.sh`**
  - `SessionStart`: reads `.claude/budget.yaml` and the fleet ledger, refuses to
    start if the day's fleet budget or this issue's attempt cap is already
    exhausted, and prints the remaining headroom under the Rule 30 banner.
  - `PreToolUse(*)`: increments the run's tool-call and elapsed counters,
    accrues token/USD usage, and exits 2 with the abort report template when any
    ceiling is crossed.
  - `Stop`/`SessionEnd`: appends the final run record to the ledger — always,
    including on abort and on crash paths.
  - Blocks writes to `.claude/budget.yaml` and to the ledger from any agent run.
- **CI gate**: rejects a PR that edits `.claude/budget.yaml` without a named
  human approver, or that sets `on_ceiling` to anything other than
  `abort_and_report`.
- **Review heuristic**: a PR whose body shows a model downgrade mid-run, or three
  attempts on one issue with no diagnosis, is rejected regardless of the diff.

## Related Rules

- Rule 30: The Autonomy Grant Is a File — budget is referenced from the grant
- Rule 33: Human-Only Work — no self-filed sub-issues to farm budget
- Rule 35: Blast Radius — the size fence; a run near either cap should stop
- Rule 37: The Run Journal — where the abort report and counters are recorded
- Rule 38: No Self-Modification During a Feature Run — why a run cannot raise its own ceiling
- Rule 39: Idempotency and Stop Conditions — looping is the usual cause of a ceiling hit
