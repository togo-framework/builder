---
name: issue-fix
description: The autonomous issue-queue loop — claim one issue, reproduce it, fix it, run the gates, write a journal entry, open a PR. Use when asked to "work the queue", "take the next issue", "fix issue N", "run the loop", or when dispatched as an agent against a specific issue.
---

# issue-fix — Claim → repro → fix → gate → journal → PR

One issue, start to finish, with no step skipped and no step reordered. The loop is
sequential on purpose: every stage produces the evidence the next stage needs, and the
journal is what makes the run auditable after the session is gone.

**One issue per run.** If you finish early, exit and let the loop start again. An agent
that "helpfully" fixes a second issue in the same run produces a PR nobody can review
and a journal that describes two things at once.

---

## 0. Preconditions

Refuse to start if any of these is false. Say which one.

- [ ] Working tree is clean (`git status --porcelain` empty)
- [ ] On `{{trunk}}`, up to date with the remote
- [ ] The project builds *before* you change anything — `go build ./...` and
      `cd web && npm run typecheck`. If it is already broken, that is the issue;
      report it and stop.
- [ ] Database reachable if the issue touches data

Fixing on top of a broken baseline means you cannot tell your breakage from the
inherited breakage.

---

## 1. Claim

Claiming must be atomic. Two workers racing for the same issue must not both win.

The claim is a compare-and-swap: the update carries the expected current state in its
`WHERE` clause, and **an affected-row count that is not exactly 1 means you lost the
race** — not that something went wrong. Back off and take the next issue.

A well-formed claim excludes, in the database rather than by convention:

- issues marked human-only
- issues whose attempt count has reached their maximum (a failing issue must stop
  burning budget)
- issues with a **pending decision** — an issue waiting on a human answer is
  structurally unclaimable, not merely discouraged

Record on claim: who claimed it, when the lease expires, and the attempt number.
A lease with no expiry is a deadlock waiting for a crashed worker.

If claiming through the issue tracker instead:

```bash
gh issue view <N> --json state,assignees,labels
gh issue edit <N> --add-assignee @me --add-label "status:in_progress"
```

Then re-read it and confirm you are the assignee. If someone else is, you lost.

---

## 2. Reproduce — before reading any implementation code

**Do not start fixing until you have seen the failure with your own eyes.** The single
largest source of wasted agent runs is fixing the thing the issue *describes* rather
than the thing that is *wrong*.

1. Read the issue body, every comment, and every attachment.
2. If the issue carries a **pin anchor** (a UI element the reporter pointed at), resolve
   it first — see `find-pinned-component`. If the pin resolves with low confidence,
   **stop and ask**; do not fix a component you are not sure is the one.
3. Reproduce:
   - API bug → `curl` the endpoint with the reported input; capture the response
   - UI bug → load the route, perform the interaction, capture console + network
   - Data bug → run the query the handler runs; compare to what the handler returns
4. **Write the failing test now**, before the fix. A red test is proof you reproduced
   it; a green test after a fix with no prior red proves nothing.

If you cannot reproduce it: comment on the issue with exactly what you tried and what
you observed, move it back to triage, and end the run. A "could not reproduce" with a
transcript is a useful outcome. A speculative fix is not.

---

## 3. Fix

- **Smallest change that makes the red test green.** Do not refactor the surrounding
  code, do not rename things, do not "clean up while I'm here". Every extra line is a
  line the reviewer must attribute to the bug.
- **Fix the cause, not the symptom.** A `?? []` that silences a crash leaves the empty
  data. Trace back to where the data went missing.
- If the fix requires a schema change: write the migration, run `togo migrate`, run
  `togo generate`. Never `CREATE TABLE` from service code — see `togo-migrate`.
- If the fix requires a query change: edit the query file, run `togo generate`, and
  commit the regenerated `*.gen.go`. Never hand-edit generated files.
- If the correct fix is materially bigger than the issue implies, **stop**. Write a
  `plan`, comment on the issue with the finding, and hand back. Scope creep discovered
  mid-fix is information, not a mandate.
- If you hit an unanswerable question (product intent, destructive data operation,
  budget), raise a **decision** and block. Do not guess and do not proceed. An issue
  with a pending decision is unclaimable until answered — that is the mechanism, use it.

---

## 4. Gate

Run the `verify` skill in full. All four artefacts:

```bash
togo lint
go build ./...
togo test
cd web && npm run typecheck
togo generate && git status --porcelain -- '*.gen.go'   # must be empty
```

Then live render, behavioural assertion, and the OpenAPI probe against
`{{api_base}}`. Paste the output.

**The gate is run by the loop, not narrated by the agent.** An agent's verdict that a
change is good is an opinion; the gate's exit codes are the fact. If the two disagree,
the gate wins.

A failed gate is not a reason to weaken the gate. Never edit a test to make it pass,
never add a skip, never lower a lint rule to green a run. If a gate is genuinely wrong,
that is its own issue with its own review.

---

## 5. Journal

Write the run journal **before** opening the PR — while the details are still in
context. It is the durable record of *why*, which the diff cannot carry.

```
.journal/YYYY-MM-DD-issue-<N>.md
```

```markdown
# Issue #<N> — <title>

**Run:** <run id>   **Attempt:** <n>   **Agent:** <name>   **Duration:** <mins>

## Reported
<what the reporter said, and what the pin anchor pointed at if any>

## Reproduced
<the exact command/interaction and the exact observed failure>

## Root cause
<the actual mechanism — not "a bug in X" but why X behaved that way>

## Fix
<what changed and why this is the right layer to change it>

## Evidence
<the verify bundle output>

## Rejected alternatives
<what you considered and did not do, and why>

## Follow-ups
<anything you noticed and deliberately did not fix, with a filed issue number>
```

The **root cause** and **rejected alternatives** sections are the whole point. In six
months the diff will still be readable; the reasoning will not be recoverable from it.

---

## 6. PR

Branch name: `fix/<N>-<kebab-slug>` (or `feat/` for a feature issue).

Stage explicitly — never `git add -A` (Rule 42). See `push` for the staging discipline.

```bash
gh pr create --base {{trunk}} --title "fix(<area>): <subject> (#<N>)" --body "$(cat <<'EOF'
## Issue
Closes #<N>

## Root cause
<one paragraph>

## Change
<bullets — what changed, at which layer>

## Evidence
<the verify bundle, trimmed>

## Risk
<what could break, and what you checked to rule it out>
EOF
)"
```

Then move the issue to review state and release the lease. Do not self-merge unless
the project's `{{promotion_mode}}` and its review policy permit it.

---

## Ending a run without a fix

These are all legitimate terminal states. Each ends the run cleanly:

| Outcome | Action |
|---|---|
| Could not reproduce | Comment with the transcript, return to triage, release lease |
| Blocked on a decision | Raise the decision, leave the issue blocked, release lease |
| Scope is much larger than filed | Write a plan, comment, return to triage |
| Gate fails for reasons outside this change | File the real issue, return this one to the queue |
| Attempt budget exhausted | Do not retry; mark for human attention |

Always release the lease and always increment the attempt count. A worker that dies
holding a lease is why leases expire; a worker that exits without releasing one is
just rude.

## Hard refusals

- Fixing an issue you did not reproduce
- Fixing a component a low-confidence pin match pointed at
- Editing, skipping, or weakening a test to pass the gate
- Hand-editing `*.gen.go`
- `CREATE TABLE` (or any DDL) from service code
- `git add -A`
- Opening a PR without a journal entry
- Claiming a second issue in the same run

## Related

- `find-pinned-component` — resolving the issue's UI anchor
- `verify` — the gate
- `push` — the staging discipline
- `plan` — when the fix turns out to be a project
- `decompose` — when the issue turns out to be a tracker
