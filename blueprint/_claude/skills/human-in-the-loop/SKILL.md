---
name: human-in-the-loop
description: "Triggered when a run needs an admin answer before proceeding."
---

# human-in-the-loop — how a run stops, asks, and gets its answer back

This is the procedure for the point in an issue run where the agent cannot safely continue without a human decision, and for what happens on both sides of that pause: how the stop is filed, how the admin sees and answers it, and how the issue comes back to life afterward.

## When to use this

Open this file when any of the following is true:

- You are running as the implementer inside `Orchestrator.Implement` (`internal/orchestrator/implement.go`) on a claimed issue, and you have hit something a human must decide — product intent, a destructive operation, ambiguous scope, a budget question — rather than something you can verify yourself.
- You are about to reply with your final verdict JSON and are unsure whether your situation is `needs_human` or something else (`cannot_reproduce`, `too_large`).
- You are debugging why a blocked issue never got a run after someone answered it, or why an agent that clearly needed a human instead opened a PR.
- You are changing anything in `internal/notify`, `internal/orchestrator/claim.go`'s `claimSQL`, or the `builder_decisions` / `builder_issues` schema, and need to know what currently depends on the shape of a decision.

## Steps

1. **Recognize you need a decision, not a workaround.** If the correct action depends on something only a human knows — which of two valid readings is intended, whether a destructive step is authorized, whether the budget should be raised — do not guess. Guessing here is exactly what Rule 02 in this codebase's clarify-unknowns rule forbids.

2. **End the run with the exact verdict shape.** The implementer prompt (`implementPrompt` in `implement.go`) requires the session's *entire* final reply to be one JSON object:

   ```json
   {
     "outcome": "needs_human",
     "summary": "one line for the commit subject",
     "reproduced": true,
     "what_changed": "what you changed and why",
     "verification": "the exact command you ran and what it printed",
     "question": "the decision you need"
   }
   ```

   `outcome` must be the literal string `needs_human` (or `too_large` for a change too big to make safely). Anything else — prose around the JSON, a missing field, a typo in the outcome string — fails `res.JSON(&v)` in `implement.go`, and `v.Outcome` silently becomes `"unknown"`. See "Getting it wrong" below for what that actually does.

3. **Trust the harness to do the filing.** Back in `Implement`, the case `v.Outcome == "needs_human" || v.Outcome == "too_large"` calls `o.askHuman(ctx, c, v)`, which:

   ```sql
   INSERT INTO builder_decisions (issue_id, run_id, agent_slug, kind, state, question_md, context_md, urgency)
   VALUES ($1,$2,$3,'question','pending',$4,$5,'normal')
   ON CONFLICT DO NOTHING
   RETURNING id;

   UPDATE builder_issues SET blocked_on_decision_id = $1 WHERE id = $2;
   ```

   The unique index `builder_decisions_one_pending ON builder_decisions (issue_id) WHERE state = 'pending'` is what the `ON CONFLICT DO NOTHING` guards against — one open question per issue, enforced by Postgres, not by convention.

4. **Do not try to reclaim or keep working on a blocked issue.** `claimSQL` in `internal/orchestrator/claim.go` excludes any issue with `blocked_on_decision_id IS NOT NULL` and any issue with a row in `builder_decisions` at `state = 'pending'` (belt and suspenders — both checks exist). This is structural: a blocked issue is not merely deprioritized, it is unclaimable. Do not try to work around this by editing `blocked_on_decision_id` directly — clearing it out from under a pending decision leaves the decision orphaned and unanswerable from the UI.

5. **Know how the human sees it.** `askHuman` posts a comment on the issue and, if a notifier is wired up, calls `s.NotifyDecision(ctx, "", issueID, number, agent, question)` in `internal/notify/notify.go`. This publishes a `decision_opened` event over SSE (`/events`) with `Sound: "alert-blocked"` and `Urgency: "critical"`, and writes a row to `builder_notifications`. The admin dashboard (`web/src/components/agent-alerts.tsx`, backed by `web/src/lib/alerts.ts`) polls `GET /decisions` every 30s as a fallback for a dropped SSE stream, and renders a fixed banner: "An agent is waiting on your decision."

6. **Know how the answer comes back.** The admin submits through `POST /decisions/{id}/answer`, handled by `handleAnswer` in `notify.go`. In one transaction it: sets the decision to `answered`/`approved`/`rejected`, clears `blocked_on_decision_id` on the issue and flips its status from `blocked` back to `ready` (only if it was `blocked` — it does not force a status change from any other state), sets `human_only = false`, and inserts the answer as a `human`-authored issue comment. Only after that commit is the issue claimable again.

7. **Verify a fix to this mechanism against both wake-up paths, not just one.** There are *two* ways a blocked issue returns to `ready`, and they are not the same code path:
   - `handleAnswer` above, for a real pending decision.
   - Plain commenting on a blocked issue, in `internal/issues/board.go` (~line 547): if `status = 'blocked' AND human_only = false AND blocked_on_decision_id IS NULL`, any human comment resets `attempt_count` to 0 and flips status back to `ready`. This exists so a clarifying reply on an issue that stalled *without* a formal decision still wakes it — but it deliberately does nothing if `blocked_on_decision_id` is set, because that case has its own answer flow. If you're testing "does answering unblock the issue," test the path that actually matches how it got blocked.

## Getting it wrong

- **The single most damaging failure is not asking wrong — it's failing to ask at all.** If the session's final reply isn't parseable as the exact verdict JSON, `v.Outcome` defaults to `"unknown"`. Walk the switch in `Implement`: `"unknown"` matches none of the `needs_human`/`too_large`, `cannot_reproduce`, or `!diff.HasChanges` cases. Execution falls straight through the switch to the success path — the diff gets committed a *second* time (on top of the WIP commit already made for having changes with `v.Outcome != "fixed"`), a PR may get opened, and the issue is closed out and reported as `**Implemented**`. A run that genuinely needed a human decision can silently present itself as finished work. This is why step 2 above is not a formatting nicety — it is the entire mechanism.
- **Calling `askHuman` twice for the same issue.** The `ON CONFLICT DO NOTHING` means the second insert returns no row, `Scan` returns `sql.ErrNoRows`, and the function logs an error and returns *before* posting a comment or calling `NotifyDecision` — the second question is dropped with no trace in the issue thread.
- **Assuming `NotifyDecision`'s urgency reflects the row's `urgency` column.** It doesn't — `askHuman` always inserts `urgency = 'normal'` and always `kind = 'question'`, but `NotifyDecision` always pushes `Severity: "action_required"` / `Urgency: "critical"` / `Sound: "alert-blocked"` regardless. The other decision kinds the schema defines (`approval`, `destructive_db`, `plan_review`, `budget_raise`) and the `low`/`critical` urgency values exist in the type but nothing in the implement loop ever produces them.
- **Assuming a decision targets a specific admin.** `target_user_id`, `answered_by_user_id`, and `timeout_at` are columns in `builder_decisions`, but no Go code populates or reads them — `Publish` in `notify.go` broadcasts every event to every connected SSE subscriber, ignoring `sub.userID` entirely, and nothing ever expires a decision past its 48-hour `timeout_at` default. A "who does this go to" or "escalate after N hours" feature does not exist yet even though the schema looks like it does.
- **Editing `blocked_on_decision_id` by hand instead of through `handleAnswer`.** This desyncs the issue from the decision row: the decision stays `pending` forever (visible on `/decisions`, unactionable), while the issue becomes reclaimable and a new run can start working an issue whose original question is still open.

## Related

- `internal/orchestrator/claim.go` — `claimSQL`, the structural exclusion that makes a blocked issue unclaimable
- `internal/orchestrator/implement.go` — `implementPrompt`, `implementVerdict`, `askHuman`, the outcome switch
- `internal/notify/notify.go` — SSE push, `/decisions`, `/decisions/{id}/answer`
- `internal/issues/board.go` — the comment-driven wake-up path for issues blocked without a formal decision
- `db/migrations/0001_builder_init.sql` — `builder_decisions`, `builder_issues.blocked_on_decision_id`, the two supporting indexes
- `web/src/lib/alerts.ts`, `web/src/components/agent-alerts.tsx` — the admin-facing side
- agent-run-lifecycle — the run this decision pauses and resumes
