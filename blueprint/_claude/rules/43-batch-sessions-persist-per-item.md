---
description: "A batch of model sessions persists each item as its session returns and skips what already exists on a re-run. Timeouts scale with the item count. Concurrency comes only after durability. Never persist once at the end — a failure at item N must cost 1, not N."
globs: "*"
alwaysApply: true
---

# Rule 43: A Batch of Sessions Persists Per Item — Failure Costs One, Not N

**Any operation that runs more than one Claude Code SDK session for a single operator action
persists each item's result as that item's session returns, skips already-persisted items on a
re-run, and derives its timeout from the number of items. Never a single persist after the loop,
never a hardcoded wall clock around the whole batch, never parallelism before per-item durability.**

## The Rule

### The arithmetic

A batch of N paid sessions that persists once at the end has a failure cost of N. Fail at the last
item and you pay for all of it again — and because the retry runs the same batch against the same
wall that killed the first attempt, the second attempt usually dies at the same place for the same
price. That is not a slow operation; it is an operation that charges for work it throws away.

| Batch shape | A failure at item N costs | What the retry does |
|---|---|---|
| Accumulate in memory, persist after the loop | **every item, 1 through N** | re-pays all of them, into the same wall, and usually dies at the same item |
| Persist each item as its session returns, skip what exists | **item N only** | pays nothing for 1 through N−1 and resumes at N |

Per-item persistence also makes the operation idempotent for free: a nervous operator pressing the
button twice re-runs the skip checks, not the sessions. With persist-at-end, the second press is a
full duplicate bill.

### The five obligations

1. **Persist as the session returns.** The write — the upsert, the file, the row — happens inside
   the loop, immediately after each session's result is validated. The unit of durability is the
   unit of spend: one session's output reaches storage before the next session starts (or, when
   items run concurrently, as each one returns). "The manifest isn't complete yet" is not a reason
   to hold N sessions of paid output in a struct that dies with the process — persist the item,
   and if the batch as a whole later proves unusable, delete or mark, which costs a statement, not
   a re-run.

2. **A re-run skips what already exists.** Before paying for a session, check whether its output is
   already persisted, and write with `ON CONFLICT DO UPDATE` / `DO NOTHING` so replays are
   harmless. This is what turns "the batch failed at 20 of 27" from an incident into a resume: the
   next run pays for items 21–27 and nothing else.

3. **Concurrency comes AFTER durability.** Parallelising a batch that persists at the end does not
   fix it — it means failing faster and losing the same work. Worse, it widens the loss window:
   more paid sessions are in flight when the wall arrives. Make each item durable first; only then
   is a worker pool an optimisation rather than an accelerant.

4. **Timeouts derive from the size of the work.** A batch deadline is
   `per-item budget × item count + fixed overhead`, computed from the actual N, not a number that
   felt generous when the batch was small. A hardcoded wall clock is wrong for every batch size
   except the one it was tested at — and it fails silently, as a context cancellation deep inside
   whichever item the clock ran out on. Per-item timeouts (a bounded session is a real thing —
   `runner.Session.Timeout`) are correct precisely because they scale with N by construction.

5. **The UI reports what is LEFT, not merely that something failed.** Per-item state is what makes
   honest progress possible: "20 of 27 persisted, $3.40 spent, resuming at 21" instead of a spinner
   that becomes an error. An operator who can see what survived does not press the button in fear;
   an operator staring at "failed" after ten minutes re-runs everything, because the system has
   given them no cheaper option.

### The reference implementation is already in this codebase

The orchestrator does this correctly, and it is the shape to copy:

- `internal/orchestrator/claim.go` — `ClaimFor` claims **one** issue and writes the run row
  **before the session process exists** ("the run row exists before the process does, so a crash
  between claim and spawn still leaves something to reconcile"). A crash costs exactly one run,
  and the row says which one.
- `internal/orchestrator/implement.go` — one claim, one session, one `finish()`. Partial work is
  committed as a WIP branch **before any early return**, because "the operator answered a question
  about changes that no longer existed" was a real failure that cost full-price re-runs.
- `internal/orchestrator/triage.go` / `route.go` — `TriageOne` and `RouteOne` take one item, run
  one session, and apply the verdict in one transaction. The batch is the *loop of calls*, not a
  loop inside one call — and the activity-log guard ("never triage the same issue twice") is
  obligation 2 in action.

The generator was the outlier, not the norm. When you write a new batch, you are choosing between
these two shapes that already exist side by side in this binary. Choose the orchestrator's.

### Anti-patterns

| Anti-pattern | Why it is wrong |
|---|---|
| "I'll collect everything in a struct and persist it in one clean transaction at the end" | The clean transaction is the N-cost failure mode. Persist per item with upserts; use a status column if the batch needs an atomic "complete" flip. |
| "25 minutes is plenty" (any hardcoded whole-batch deadline) | It is plenty for the batch size you tested. The first larger fleet hits it mid-item, and the timeout reports as a failure of whichever item was unlucky. |
| "The loop is slow — run the items in parallel" (before per-item persist) | Same loss, sooner, with more sessions in flight when it lands. Durability first, then workers. |
| Substituting a fallback for a failed item and continuing | Once a batch-wide context is dead, *every* remaining session fails instantly and the fallback fills the batch with stubs that look like results. A fallback is for one item that genuinely failed, not a way for a dead batch to impersonate a finished one. |
| "Just re-run the whole thing" as the recovery procedure | Without skip-existing, the re-run is a duplicate bill aimed at the same wall. Recovery must resume, not restart. |

## Why this rule exists — concrete cost

Found the hard way, in this repository's own fleet generator.

`internal/fleet/generate.go` runs one roster session plus one session per persona and per skill —
27 write sessions for a single click of the wizard's Generate button. Every result was accumulated
in an in-memory `Manifest`; `m.Write()` and `persist()` ran exactly once, after the last session.
Around the whole thing, `internal/setup/wizard.go` set a **hardcoded 25-minute timeout** —
`context.WithTimeout(context.Background(), 25*time.Minute)` — derived from nothing about the
batch, wrapping sessions individually budgeted at up to 4 minutes each plus a 15-minute roster
ceiling.

A 27-agent fleet blew through the deadline at agent 20. The context expired, the remaining
sessions failed instantly, `persist()` could not even open its transaction against the cancelled
context, and **all 20 paid persona sessions were thrown away**. The retry re-paid the roster and
personas 1 through 19 to get back to where it died — into the same 25-minute wall, because the
wall was hardcoded and the fleet had not gotten smaller.

The same binary already contained the correct shape: the orchestrator's claim-one/run-one/record-one
loop, where a crash at any point costs exactly one run. The generator lost 20 items to a design
the file next door had already solved.

A fix for the generator (per-item persist, skip-existing, size-derived timeout) is in flight —
check for it before filing or fixing this again.

## Enforcement

- **Review blocker**: any loop over `runner.Session` (or any SDK session) whose persistence — DB
  write, file write — sits *after* the loop. The diff must show the write inside the loop, an
  upsert or existence check per item, and a deadline computed from the item count.
- **The audit procedure**: `grep -rn "runner.Session" --include="*.go" .` and read each call site.
  One session per operator action with an immediate persist is compliant; a loop of sessions
  feeding a single persist is not. The audit that shipped with this rule found exactly one
  violator (the fleet generator, fix in flight) and eight compliant sites — keep it at zero.
- **No hook.** This is a structural property of Go code, visible in review and in the grep above,
  not a Bash pattern a `PreToolUse` guard can match. The recurring check is the audit, re-run
  whenever a new `runner.Session` call site lands.

## Related Rules

- Rule 04 — small wins. This is small wins applied to runtime: each item is a delivered,
  persisted increment, not a promise pending the batch.
- Rule 07 — client-first / evidence-first. "20 of 27 persisted, resuming at 21" is honest
  reporting; "failed" after ten silent minutes is not.
- Rule 32 — cost ceilings. The spend ledger is only honest if spent money maps to persisted
  output; a batch that discards paid sessions defeats the metering it was billed under.
- Rule 39 — idempotency and stop conditions. 39 governs when a loop must stop; 43 governs what
  survives when it does. Its never-retry-destructive table is why per-item writes must be
  keyed upserts — that is what makes the replay legal.
