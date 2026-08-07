---
description: "Prove the bug still reproduces before fixing it. Hard-stop the queue after N consecutive failures. Never retry a destructive operation. A run that cannot produce evidence parks — it never closes optimistically."
globs: "*"
alwaysApply: true
---

# Rule 39: Reproduce First, Stop Early, Never Retry Destructive, Park Don't Close

**Prove the failure still reproduces before you change anything. Stop the whole queue after N
consecutive failures instead of burning through it. Never automatically retry an operation that
destroys or mutates state. And when a run cannot produce evidence, it parks — it never closes
optimistically.**

## The Rule

Four clauses, one root: an autonomous loop's characteristic failure is **confident motion in the
absence of feedback**. Each clause below removes one way that happens.

### 1. Reproduce before you fix

Before the first edit, produce the failure yourself. Command, input, actual output — pasted into
the run journal's "What reproduced" section (Rule 37).

| Situation | Required first action |
|---|---|
| Bug report | run the reproduction; observe the wrong behaviour |
| Regression | confirm it is a regression — `git stash` / check out `{{trunk}}` and show the same failure |
| Feature | demonstrate the absence — the 404, the missing column, the handler that is not registered |
| Flake | run it enough times to characterize the rate; a flake fixed on one green run is not fixed |

**If it does not reproduce, you do not fix it.** You park (§4) and report exactly what you ran and
what you saw. An unreproducible issue is a data problem, an environment problem, or a
misunderstanding — and every one of those is made worse by a speculative code change.

The reproduction is also the acceptance test. When the run finishes, the same command runs again
and the output is different in the specific way the issue described. That pairing — before and
after, same command — is the strongest evidence in Rule 37's table, and it is only available to
runs that reproduced first.

### 2. Stop conditions — the queue halts, it does not grind

An autonomous loop working an issue queue must halt on all of these:

| Condition | Default | Action |
|---|---|---|
| Consecutive run failures across the queue | **3** | **HARD STOP the queue.** Do not start run 4. |
| Consecutive failures within one run (same step, no new information) | 3 | abandon the approach; do not try a fourth variation |
| A cost ceiling from Rule 32 is reached | `.claude/autonomy.yaml` | park the run — never downgrade the model or raise the cap |
| A blast-radius cap from Rule 35 is projected to be crossed | `.claude/autonomy.yaml` | stop and hand over a plan |
| Two runs in a row park for the same reason | — | hard stop; the blocker is systemic, not per-issue |
| Any guard hook fires twice on the same run | — | hard stop; see Rule 38 — you are being told something |
| A stop condition itself is unclear | — | stop. Ambiguity resolves toward stopping. |

Three consecutive failures is a signal about the **environment**, not about the three issues.
Credentials expired, the schema drifted, `togo generate` is producing a diff nobody expected, the
database is unreachable. Working issues 4 through 20 against a broken environment produces twenty
bad runs, twenty bad journals, and a queue that has to be audited by hand.

On a hard stop: write the journal, set `outcome: parked`, state the shared symptom across the
failures, and surface it to the human. Do not "try one more, it might be different."

### 3. Never automatically retry a destructive or mutating operation

Retry is safe **only** for operations that are read-only or genuinely idempotent. Everything else
fails once and reports.

| Operation class | Auto-retry |
|---|---|
| `GET`, `SELECT`, status/health checks, `togo migrate status` | yes — bounded, with backoff |
| `go build`, `go test`, `togo generate`, typecheck | yes — they are pure with respect to state |
| `togo migrate` (applying migrations) | **no** — a partial apply retried is a schema in an unknown state |
| `INSERT` / `UPDATE` / `DELETE`, any write path | **no** unless the write is provably idempotent (keyed upsert with `ON CONFLICT`) |
| `POST` without an idempotency key | **no** — you cannot know whether the first call landed |
| `git push`, PR creation, issue close/comment | **no** — duplicates are visible to humans |
| Anything that drops, truncates, resets, or re-initializes | **no** — and see the safety band; these are not retryable because they are not runnable |
| Deploy / promote to `{{prod_ref}}` | **no** — a human decides whether to try again |

When a mutating operation fails, the correct move is: **determine whether it partially applied**,
record that finding, and stop. "It errored so it probably didn't happen" is an assumption, and
assumptions are what this rule exists to prevent. `togo migrate status` exists precisely so you
can answer that question with a command instead of a guess.

### 4. Park, never close optimistically

A run has exactly three outcomes, declared in the journal frontmatter:

| `outcome:` | Meaning | Issue state | PR |
|---|---|---|---|
| `done` | evidence produced; the reproduction now passes | may close | may merge |
| `parked` | work is real but unproven — blocked, unreproducible, out of budget | **stays open**, labelled `needs-human`, journal linked | draft, or none |
| `abandoned` | approach was wrong; nothing worth keeping | stays open, findings recorded | closed unmerged |

Parking is a **successful outcome**. It costs one comment. Closing without evidence costs a
reopening, the human's trust, and every subsequent report's credibility.

Never write "should be fixed", "this likely resolves it", "closing optimistically — reopen if it
recurs". If you would need the word *should*, *likely*, or *probably* to describe your confidence,
the outcome is `parked`.

## Why this rule exists — concrete cost

This rule is a direct descendant of a real, documented incident — recorded in the ancestor estate as
Rule 18 ("Verify Live Before Closing"). In a single session, **14 issues were filed, all 14 were
closed, and 11 had to be reopened within the same hour** when the client noticed the changes were
not actually visible. Every one of those closes cited a real commit SHA and a green build. Source
compiled; software did not work.

Two things were missing, and this rule installs both. The runs never proved the failures
reproduced before "fixing" them, so they had no before/after pair to check against. And no stop
condition fired — the loop closed the 2nd, the 5th, the 11th on exactly the same unfounded
confidence as the 1st, because nothing in the loop was watching the failure rate. A hard stop after
three would have caught it at three instead of fourteen; a required reproduction would have caught
most of them at one.

The cost was hours of agent runtime, the entire client review cycle, and the credibility of every
"done" the fleet reported afterwards. That last one is the expensive part. It does not come back
with a hotfix.

## Enforcement

- **Rule 37's Stop hook** carries most of the weight: a done claim with no evidence block is
  refused, which makes `parked` the path of least resistance for an unproven run.
- **Journal schema** — `outcome:` is a required frontmatter field with exactly three legal values.
  `outcome: done` with an empty "What reproduced" section fails CI.
- **Queue driver** — the loop harness tracks consecutive failures and consecutive parks and halts
  at the thresholds above without asking the agent's opinion. Thresholds live in
  `.claude/autonomy.yaml`; the agent cannot raise its own (that is a `.claude/**` edit — Rules 35
  and 38). A hard stop applies `needs-human` to the remaining queue rather than draining it.
- **Retry policy** — retry wrappers are allowlist-based: an operation is retryable only if it
  appears in the read-only/pure list. Default is no retry.
- **Review** — a PR whose journal shows `outcome: done` but whose "What reproduced" section says
  the issue could not be reproduced is sent back automatically.

## Related Rules

- Rule 07 — client-first / evidence-first.
- Rule 31 — never merge your own work. `parked` and `abandoned` never reach the reviewer as `done`.
- Rule 32 — cost ceilings. Same posture applied to spend: hitting a limit aborts and reports, it
  never adjusts the limit.
- Rule 33 — human-only work. A parked run applies `needs-human`; that label is then honoured.
- Rule 37 — the run journal, where reproduction and outcome are recorded.
- Rule 38 — no self-modification. An agent that keeps hitting a stop condition must not raise it.
- The safety band (20–27) — destructive operations are not merely un-retryable; most are forbidden
  outright.
