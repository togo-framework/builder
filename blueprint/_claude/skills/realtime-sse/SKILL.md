---
name: realtime-sse
description: "Triggered when changing the event stream or client alert handling."
---

All confirmed. Here's the skill file body:

# realtime-sse — push events to the browser without losing one

Extend or modify the agent-event stream (`internal/notify/notify.go`) and its client (`alerts.ts`, `agent-alerts.tsx`) without breaking the guarantees that make a dropped decision impossible to miss: DB-first writes, non-blocking fan-out, and a client that treats SSE as a fast path, not the source of truth.

## When to use this

- Adding a new `Event.Kind` (today only `decision_opened` is ever published; `run_finished`, `issue_moved`, `mention`, `message` are subscribed client-side in `alerts.ts:164` but have no server-side `Publish` call — wiring one of these up is exactly this task).
- Changing `handleStream` in `internal/notify/notify.go` (headers, ping interval, event framing).
- Adding a new call site for `Publish` or `NotifyDecision` from orchestrator code.
- Changing how `alerts.ts` opens, parses, or reconnects the `EventSource`.
- Changing toast/decision-banner behavior in `agent-alerts.tsx`, or the sound/notification logic in `alerts.ts`.
- Adding a field to `builder_notifications` or `Event`/`AgentEvent`.
- Debugging a report that the "Realtime connected" badge is wrong, or that an alert didn't show up.

## Steps

1. **Read the two files end to end before touching either.** `internal/notify/notify.go` (342 lines) and `blueprint/_project/web/src/lib/alerts.ts` (222 lines) are both small and every function matters — `handleStream`, `Publish`, `connectAlerts`, and `onAgentEvent` are the contract between them. Do not guess the wire format; it's `event: <kind>\nid: <id>\ndata: <json>\n\n`, set at `notify.go:112`.

2. **If adding a new event kind, publish it through `Publish`, not by writing to the channel directly.**
   ```go
   s.Publish(ctx, userID, notify.Event{
       Kind:     "run_finished",
       Severity: "info",
       Title:    fmt.Sprintf("#%d finished", issueNumber),
       Preview:  truncate(summary, 160),
       Link:     fmt.Sprintf("/issues/%d", issueNumber),
       Sound:    "", // most events are silent by design — see notify.go:32-34
       Urgency:  "normal",
       IssueID:  issueID,
   })
   ```
   `Publish` (`notify.go:122-149`) inserts into `builder_notifications` *before* fanning out to subscriber channels — this ordering is load-bearing: a browser that's closed at the moment of the event still finds it via `GET /notifications` on reopen. Never fan out without the DB write first.

3. **Respect the sound budget.** `builder_notifications.sound` has a Postgres `CHECK` constraint limited to `''`, `'alert-blocked'`, `'alert-mention'`, `'chime'` (`db/migrations/0001_builder_init.sql:~599-619` and the duplicate under `blueprint/_project/db/migrations/`). If you add a new sound value, migrate the constraint in both copies of that migration file or the insert in `Publish` will fail with a constraint violation at runtime, not at compile time. Client-side, `chime()` in `alerts.ts:74-97` only branches on `"alert-blocked"` vs. everything else — a new sound name needs a matching case there too, or it silently plays the generic tone.

4. **Never let a slow subscriber block a publish.** The fan-out loop in `Publish` (`notify.go:140-148`) uses a non-blocking `select` with `default:` — a full channel (16-buffered, `notify.go:79`) drops the event and logs a warning rather than blocking the agent run that's publishing it. If you touch this loop, keep it non-blocking. An agent's run must never stall because an admin's browser tab is stuck.

5. **On the client, register new kinds in the same loop that already lists them**, `alerts.ts:164`:
   ```ts
   for (const kind of ["decision_opened", "run_finished", "issue_moved", "mention", "message"]) {
     source.addEventListener(kind, handle as EventListener);
   }
   ```
   If your new kind isn't in this array, `source.addEventListener(kind, ...)` never fires and the event is silently swallowed by the browser even though the server sent it — check this list first when "the event never showed up" and the server logs confirm `Publish` ran.

6. **Don't touch the ping/keepalive without checking downstream buffering.** The 25s ticker at `notify.go:97` and the explicit `X-Accel-Buffering: no` header (`notify.go:77`) exist together to stop an intermediate proxy from buffering the whole stream — the code comment there states this outright. If you change the interval, keep it well under whatever idle-connection timeout sits in front of this service (proxy, load balancer) or connections will be silently reaped and reconnect will thrash.

7. **If you add UI reacting to a new event kind in `agent-alerts.tsx`, extend the `onAgentEvent` callback (lines 27-33), not a new listener.** Every event already becomes a toast via `setToasts` regardless of kind; only `decision_opened` gets the extra `load()` refetch. If your new kind needs its own UI (e.g. a banner, not a toast), branch on `e.kind` inside that existing callback rather than opening a second `EventSource` or a second `onAgentEvent` subscription — see step 8.

8. **Never open a second `EventSource`.** `alerts.ts:114` keeps a module-level `source` singleton and `connectAlerts` (`alerts.ts:143-144`) is a no-op if one already exists. `app-layout.tsx:50-53` documents the bug this guards against: the layout used to open its own `EventSource` at the wrong URL (`${API}/events` instead of `/api/builder/notify/events`) just to drive the "Realtime connected" badge, which then permanently showed "Offline". The fix was `onLiveChange` (`alerts.ts:130-134`) — a plain pub/sub over the *existing* connection's state. Any new UI that needs to know "are we live" subscribes to `onLiveChange`, full stop.

9. **Run the actual stream, don't just read the code.** There is no automated test for any of this (see below), so verify by hand:
   ```bash
   curl -N -H "Accept: text/event-stream" http://localhost:PORT/api/builder/notify/events
   ```
   Confirm you see `event: ready` immediately, then `: ping` every 25s, then your new `event: <kind>` frame when you trigger the publish path. In the browser, open the app, trigger the event, and confirm the toast (or your new UI) appears and the "Realtime connected" badge in `app-layout.tsx` stays green throughout.

10. **If you touch `builder_decisions` or `timeout_at`, know it's currently inert.** The schema has a `timeout_at` column and an expiry index (`builder_decisions_expiry`), but nothing in `internal/` reads it — decisions never auto-expire today. Don't assume a decision will time out; if that's the feature you're building, you're adding it from scratch, not fixing a bug.

## Getting it wrong

- **Publishing without the DB write, or reordering `Publish` so the fan-out happens first.** This breaks the one guarantee the whole design exists for: a closed browser reopening later must still see the notification via `GET /notifications`. The doc comment above `Publish` (`notify.go:118-121`) says this outright — read it before reordering anything in that function.
- **Adding a new `Event.Kind` server-side but forgetting the client's subscription array at `alerts.ts:164`.** The server will publish fine, `notify.go` logs will look correct, and the event will just vanish client-side with no error anywhere — `source.addEventListener` silently ignores event types nobody registered for.
- **The reverse**: adding a kind to the client array without ever calling `Publish` with that kind server-side. This is the exact state `run_finished`, `issue_moved`, `mention`, and `message` are in right now — dead listeners waiting for events that don't exist. Don't assume a kind being handled client-side means it's live.
- **Making the fan-out loop blocking** (e.g. `sub.ch <- ev` without the `select`/`default`) to "make sure the event isn't dropped." This is backwards — it turns one slow admin tab into a stall for every agent publishing an event, which is worse than the admin missing one toast (they still get it from the DB on next load).
- **Opening a second `EventSource`** to drive some new piece of connection-status UI. This is the exact bug documented and fixed in `app-layout.tsx:50-53` and `alerts.ts:116-124` — read those comments before writing anything that calls `new EventSource(...)` outside of `connectAlerts`.
- **Assuming there's a test that will catch a regression here.** There is no Pest/PHPUnit/Playwright/JS test covering `internal/notify/`, `alerts.ts`, or `agent-alerts.tsx`. Verify manually per step 9 — nothing else will tell you it broke.
- **Forgetting the migration lives in two places.** `db/migrations/0001_builder_init.sql` and `blueprint/_project/db/migrations/0001_builder_init.sql` both define `builder_notifications`. A schema change (new sound value, new column) applied to only one leaves the builder's own database and the scaffolded template out of sync.
- **Truncating preview text with `s[:n]`.** `notify.go:317-331` has a `truncate` helper specifically because a naive byte slice can cut a multi-byte UTF-8 character (emoji, Arabic) in half, producing a string Postgres rejects on insert. Use it, don't reinvent it.

## Related

- `internal/orchestrator/implement.go:464` — the only current call site of `NotifyDecision`; the pattern to copy for a new publish site.
- `internal/orchestrator/orchestrator.go` — defines the `Notifier` interface the orchestrator depends on, decoupling it from `internal/notify`.
- `providers.go:85-98` — `provideNotify`, where the service is constructed and routed at `/api/builder/notify`.
- `db/migrations/0001_builder_init.sql` (`builder_notifications`, `builder_decisions`) — schema contract for `Event` and `decisionRow`.
- `blueprint/_project/web/src/routes/app-layout.tsx:39-53` — the only consumer of `onLiveChange`.
