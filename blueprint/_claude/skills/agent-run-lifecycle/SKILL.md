---
name: agent-run-lifecycle
description: "Triggered when starting, resuming, cancelling or debugging an agent run."
---

# agent-run-lifecycle — claim it, watch it, know why it stopped (and why "cancel" doesn't exist yet)

A run is one row in `builder_runs`: an agent claiming a `builder_issues` row via `FOR UPDATE SKIP LOCKED`, working inside an isolated git worktree, and driving one `claude -p` subprocess to a terminal outcome. This procedure covers finding a run, reading what state it's actually in, retrying it, and the honest limits of "resuming" or "cancelling" one — several of the obvious operator moves here are schema columns or permissions with no code behind them, and treating them as real is the most common way to waste time debugging this system.

## When to use this
- About to set `BUILDER_RUNNER=1` (or investigate why the loop never started) — `internal/orchestrator` only runs when this env var is `"1"`, checked once at boot in `providers.go`'s `provideOrchestrator`.
- An issue looks stuck at `in_progress` and you need to know if it's still alive or just orphaned.
- Someone asks you to "cancel a run" — there is no cancel endpoint; you need the real options.
- An issue needs another attempt after a failure or a `needs_input` block — deciding between "answer the pending decision" and "retry."
- A run ended and you need to know *why* — timeout, lease loss, blast-radius rejection, empty diff, panic.
- You're about to touch `internal/orchestrator/*.go` or `internal/runner/session.go` and need the actual state machine, not a guess.
- You're tuning a `runner.Session.Timeout` or `MaxTurns` value (see `internal/skills/regenerate.go`'s own comment: this exact skill topic — claim, lease, heartbeat, session, worktree, terminal states, budget guard — was the single hardest one to regenerate, blowing a 5-minute budget and a 30-turn cap before both were raised).

## Steps

1. **Confirm the loop is actually on.** The orchestrator is gated entirely by an env var read once at process boot — there's no live toggle.
   ```bash
   echo $BUILDER_RUNNER   # must be "1" or the loop never starts
   ```
   Grep the host app's logs for one of these two lines, written once at boot in `providers.go`:
   ```
   builder.orchestrator running          # started; poll, daily_budget_usd, open_pr in fields
   builder.orchestrator idle — set BUILDER_RUNNER=1 to start the agent loop
   ```
   If you need PR-pushing too, that's a second, independent opt-in: `BUILDER_OPEN_PR=1`. Without it: `"builder.orchestrator will NOT push — work lands on local branches"`.

2. **Find the run.** Query `builder_runs` directly — this is always more trustworthy than anything the agent claimed about itself:
   ```sql
   SELECT id, issue_id, agent_slug, status, terminal_reason, error,
          started_at, heartbeat_at, ended_at, num_turns, cost_usd
     FROM builder_runs
    WHERE issue_id = $1
    ORDER BY created_at DESC;
   ```
   `status` is `builder_run_status`: `queued`, `running`, `needs_input`, `succeeded`, `failed`, `expired` — **and `cancelled`, which is defined in the enum but never written by any Go code.** If you see `cancelled` in a row, it was set manually, not by the system.

3. **Decide if a `running` row is actually alive.** Every in-flight implement run heartbeats every `LeaseTTL/3` (`LeaseTTL` defaults to 20 minutes, so ~6.6 min) by extending `builder_issues.lease_expires_at`. Compare:
   ```sql
   SELECT number, status, lease_expires_at, now() - lease_expires_at AS overdue
     FROM builder_issues WHERE claimed_by_run_id = $1;
   ```
   If `lease_expires_at` is already in the past, the run is functionally dead but not yet marked so — it will be caught on the next 15-second tick by `reapExpiredLeases` (returns the issue to `ready`) and, for cross-host cases, by `sweepStaleRuns` (marks the run `expired`, `terminal_reason='lease_lost'`). On this host's own restart, `reconcileOwnRuns` does the same at boot by checking the owning pid is actually dead, and also removes the orphaned worktree directory.

4. **To force an issue back into the queue immediately** (don't wait for the sweep), the safe move is the one the system itself exposes — not a raw `UPDATE`:
   ```
   PATCH /api/builder/issues/{number}
   { "retry": true }
   ```
   This sets `attempt_count = 0` and `status = 'ready'` (`internal/issues/board.go`). Be clear with anyone using this: it is **not** a resume. `builder_runs.resumed_from` exists in the schema but no code reads or writes it — the next claim spins up a brand-new worktree from `HEAD`, deletes and recreates the deterministic branch `builder/issue-<N>`, and starts a fresh `claude -p` session with a freshly built prompt. Any WIP commit from a prior attempt (posted as a comment: *"Work so far is preserved on `<branch>`... as a WIP commit"*) is there for a human to read, not for the next agent to build on.

5. **If the issue is blocked on a human decision instead of dead**, retry won't help — the claim SQL excludes any issue with a `pending` row in `builder_decisions`:
   ```sql
   SELECT * FROM builder_decisions WHERE issue_id = $1 AND state = 'pending';
   ```
   Answering the decision clears `builder_issues.blocked_on_decision_id`, which is what actually re-opens it to claiming — not a retry flag.

6. **If asked to cancel a run outright, say so plainly: there is no working cancel path today.** `runs.cancel` is declared in `internal/authz/authz.go` for both admin and maintainer roles, but no HTTP route consumes it — `DELETE /api/builder/issues/{number}` and the reassignment `PATCH` both refuse to act while a lease is live, and both error messages literally say "cancel the run before..." pointing at a feature that doesn't exist. The real options, in order of preference:
   - Wait it out: implement sessions time out at 15 minutes (`o.cfg.ImplementTO`), leases expire at 20 minutes.
   - Restart/redeploy the host process — `reconcileOwnRuns` cleans up on the next boot (marks the run `expired`, `terminal_reason='lease_lost'`, removes the worktree).
   - As a last resort, mirror what `release()` does by hand:
     ```sql
     UPDATE builder_issues
        SET status = 'ready', claim_token = NULL, lease_expires_at = NULL
      WHERE claimed_by_run_id = $1;
     ```
     This does not kill the `claude` subprocess if it's still executing — it only stops the orchestrator from caring about its outcome once it returns.

7. **Debug a failed or errored run** by reading, in order: `builder_runs.error` and `terminal_reason` (values: `completed`, `budget_exhausted`, `max_turns`, `blocked`, `lease_lost`, `error`), then grep logs for the matching line — `"claimed"`, `"released"` (field `why`), `"run finished"`, `"implement panicked"`, `"verdict unparsable"`, `"push failed"`. A run that timed out shows up as `sess.Run` returning `"claude failed: %w: %s"`; one whose model reply couldn't be parsed shows `"unparsable response: %w"` or, if truncated, an explicit `"response truncated at %d bytes with %d unclosed brace(s)"`.

8. **If you suspect an environment problem rather than a specific run problem**, run preflight before digging further:
   ```bash
   togo-builder doctor --json
   ```
   This runs the same 20 ordered checks as `GET /api/builder/preflight` (git, `gh` auth/scopes, Claude Code binary/version/auth, and critically `checkClaudeExec`, which actually executes `claude -p "Reply with the single word: ready" --max-turns 1` with a 120s timeout to prove execution works end-to-end, not just that the binary exists).

## Getting it wrong

- **Treating `status = 'cancelled'` as something the system will produce.** It won't. If you write monitoring or a UI against this enum, don't wait for that value — it never gets set by `claim.go`, `implement.go`, or `reconcile.go`.
- **Believing `retry: true` "resumes" a stopped run.** It resets `attempt_count` and returns the issue to `ready`; the next claim is a wholly new run with a new worktree cut from `HEAD`. The WIP commit some runs leave behind is for a human to read on the branch, not something the next attempt continues from.
- **Sending a cancel request that doesn't exist and assuming it worked.** `runs.cancel` is a declared permission with zero routes. If a caller expects an API to stop a run and gets a 404/no-op, that's expected — say so, don't assume a bug in *your* code.
- **Cancelling the orchestrator's tick context (`ctx`) and expecting in-flight implement runs to stop.** `dispatch()` deliberately spawns each implement goroutine with `context.Background()`, not the tick's `ctx` — only the process dying (or the session's own `Timeout`) actually kills the `claude` subprocess.
- **Confusing "lease lost" with "process killed."** When a heartbeat write affects zero rows, the goroutine just stops writing further bookkeeping (`close(lost)`) — the underlying `claude` subprocess keeps running to its own completion or timeout regardless. Don't assume a lease-lost log line means the work stopped immediately.
- **Trusting the agent's own claimed outcome over the diff.** `implement.go` always re-derives `files_changed`/`lines_added`/`lines_removed` from `ws.Diff(ctx)`; a `!diff.HasChanges` result overrides any "fixed it" claim in the model's JSON verdict and routes the issue back to `ready` with `error='no changes produced'`.
- **Manually deleting a worktree directory instead of going through `ws.Remove`/`removeOrphanedWorktree`.** Both of those guard against removing anything outside a path containing `"builder-worktrees"` — bypassing them with a raw `rm -rf` on `BUILDER_WORKTREE_ROOT` risks taking out more than intended if the path was misconfigured.
- **Under-sizing a `Timeout`/`MaxTurns` for anything touching this same surface area.** The `internal/skills/regenerate.go` history is direct evidence: this exact topic hit a hard 5-minute wall and a 30-turn wall before both were raised (to 10 minutes / 50 turns) specifically because it spans the claim, lease, heartbeat, session, and worktree layers in one pass.

## Related
- `internal/orchestrator/orchestrator.go`, `claim.go`, `dispatch.go`, `implement.go`, `triage.go`, `reconcile.go` — the full state machine described above.
- `internal/runner/session.go`, `workspace.go`, `preflight.go` — the subprocess/worktree/doctor primitives every run is built on.
- `internal/issues/board.go` — the issue-status transition graph and the `retry`/reassign/delete HTTP handlers.
- `internal/skills/regenerate.go` — a smaller, read-only run type using the same `runner.Session` primitive; useful precedent for timeout/turn-cap tuning.
- `db/migrations/0001_builder_init.sql` — authoritative schema for `builder_runs`, `builder_issues`, `builder_decisions`, `builder_issue_activity`, `builder_spend`.
- A `human-in-the-loop` skill, if one exists, for the `builder_decisions` gate this procedure only touches in step 5.
