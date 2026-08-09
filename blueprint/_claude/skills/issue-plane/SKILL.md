---
name: issue-plane
description: "Triggered when adding or changing an issue field, status, board rank or attachment."
---

# issue-plane — change the issue schema and transition rules without breaking the two places that duplicate them

This procedure is for adding or changing a field on `builder_issues` (or a child table), changing what counts as a legal status transition, changing how board cards are ranked/ordered, or changing how attachments are validated and stored. It exists because this plane has no single source of truth: the status enum lives in Postgres, the transition table is hand-copied into two languages, board rank is written once and never rebalanced, and attachments are validated by content-sniffing rather than by trusting the client.

## When to use this

- You're about to add a column to `builder_issues` or one of its child tables (`builder_issue_comments`, `builder_issue_attachments`, `builder_issue_pins`, `builder_issue_activity`, `builder_issue_links`, `builder_issue_votes`).
- You're about to add a new value to `builder_issue_status`, or change which transitions are legal.
- You're about to touch `board_rank`, drag-and-drop reordering, or anything that sorts the kanban board.
- You're about to add or change attachment upload/validation/storage, or add an "attach to existing issue" path.
- You're editing `internal/issues/service.go`, `internal/issues/board.go`, or `internal/issues/attachments.go` and aren't sure what already enforces validity.
- You're about to run `make migrate` or follow the README's local-setup recipe to bootstrap a dev DB for this work.

## Steps

1. **Read the current shape before touching it.** There is no single `Issue` struct — `internal/issues/service.go` has `issueRow` (list view) and `newIssue` (create payload), `internal/issues/board.go` has `boardCard`, `issueDetail`, and `patchIssue` (PATCH body, all pointer fields for partial update). The DB table `builder_issues` (`db/migrations/0001_builder_init.sql:180-230`) is the actual authority. Before adding a field, check whether it needs to appear in more than one of these — a column that only `boardCard` reads but `issueRow` doesn't will silently not show up in the sidebar.

2. **Write the migration as a new numbered file, never edit an applied one.**
   ```
   ls db/migrations/
   ```
   Find the highest number, add one, zero-padded to 4 digits: `db/migrations/0009_<short_description>.sql`. Use `IF NOT EXISTS`/`IF EXISTS` guards and name constraints explicitly, following `0004_agent_workdir.sql`:
   ```sql
   -- <2-4 sentences: WHY this field exists, what failure mode it fixes>
   ALTER TABLE builder_issues
     ADD COLUMN IF NOT EXISTS <col> <type> NOT NULL DEFAULT <default>;

   ALTER TABLE builder_issues
     DROP CONSTRAINT IF EXISTS builder_issues_<col>_check;
   ALTER TABLE builder_issues
     ADD CONSTRAINT builder_issues_<col>_check
     CHECK (<condition>);
   ```
   If the field needs to be queried by the board or filtered on, add or extend an index the same way (`CREATE INDEX IF NOT EXISTS ...`) — the existing board query relies on `builder_issues_board ON builder_issues (status, board_rank)`.

3. **Apply migrations the way CI does, not the way the Makefile or README do.** `Makefile`'s `migrate` target and the README's local-setup recipe both only run `0001_builder_init.sql` — they are stale and will leave your new column missing from a "freshly bootstrapped" dev DB, producing confusing `column does not exist` errors that look unrelated to your change. Apply the full sequence instead, the way `.github/workflows/ci.yml` does:
   ```sh
   for f in db/migrations/*.sql; do psql "$TEST_DATABASE_URL" -f "$f"; done
   ```

4. **If adding a new status value**, add it to the Postgres enum in your new migration:
   ```sql
   ALTER TYPE builder_issue_status ADD VALUE IF NOT EXISTS '<new_status>';
   ```
   Then update **both** copies of the transition table — they are not shared code:
   - `internal/issues/board.go:301`, the `transitions` map, consumed by `canTransition` inside `handlePatch`.
   - `blueprint/_project/web/src/lib/issues.ts:87`, the `TRANSITIONS` const — a comment there says it "mirrors the server's transition table." If you only update the Go side, the UI will offer moves the server then rejects with a 409, which looks like a frontend bug but is a stale-copy bug.
   Also check the two transition paths that bypass `canTransition` entirely: `internal/orchestrator/claim.go` (claim CAS, `WHERE status = 'ready'`) and `internal/orchestrator/reconcile.go` (lease-expiry reconciliation). If your new status should be reachable from or should feed into either of those flows, they need their own updates — `canTransition` will not protect them.

5. **If touching board rank/ordering**, know that no reorder-within-column feature exists yet. `board_rank` (`db/migrations/0001_builder_init.sql:192`, base-26 LexoRank-flavored `text`) is written exactly once, in `rankFor()` at `internal/issues/service.go:411`, and is never updated anywhere in `internal/`. `rankFor`'s current format (`m%08dz`, monotonic by creation sequence) has no lexical room between adjacent ranks (`m00000005z` vs `m00000006z`) — you cannot splice a value between two existing ranks with this scheme. If the task is drag-to-reorder-within-a-column, you are building new surface: a real midpoint-generating rank function, a new PATCH field or endpoint (today `patchIssue` in `board.go:323` has no rank field), and a decision on rebalancing when ranks run out of room. Don't assume there's an existing rebalancer to extend — there isn't. The frontend's drag handler (`blueprint/_project/web/src/routes/issues.tsx`, `onDrop` → `move()`) currently only ever changes `status`, never rank, so the client-side drop logic needs new plumbing too.

6. **If touching attachments**, work inside `internal/issues/attachments.go`'s existing guarantees rather than re-deriving them: type is decided by sniffing the first 512 bytes with `http.DetectContentType` (`saveOne`, attachments.go:110), never by the client's declared `Content-Type` or filename — a prior incident shipped a `.exe` declared as `image/png`. Size caps are per-kind (`maxImageBytes`, `maxVideoBytes`, `maxFileBytes`, attachments.go:29-31) plus a per-submission cap `maxAttach=10` (service.go:33). Storage key is generated server-side (`YYYY/MM/<issueID[:8]>-<random8hex><ext>`), never from the uploaded filename. `handleAttachment` serves everything with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` unconditionally — do not add an inline-rendering path without understanding this is deliberate stored-XSS defense. There is currently no endpoint to attach a file to an *existing* issue — only at creation time inside `create()` (service.go:240), inside the same DB transaction as the issue insert. The `comment_id` FK on `builder_issue_attachments` (migration comment at line 281) anticipates a future "attach to comment" flow but nothing populates it — if you're building that, it's new surface, not a gap-fill.

7. **Confirm build and schema together:**
   ```sh
   go build ./... && go vet ./...
   go test ./internal/issues/...
   ```
   For anything touching the live DB (claim CAS, reconciliation, a new status reachable through them), also run the `_live_test.go` suite gated on `TEST_DATABASE_URL`, e.g. `internal/orchestrator/claim_live_test.go`, as your pattern for a real-DB test.

8. **Add tests — there is no existing suite covering transitions or rank.** `internal/issues/attachments_test.go` has strong regression coverage for upload validation (`TestDeclaredTypeCannotOverrideSniffing`, `TestStorageKeyIgnoresTheUserFilename`, `TestOversizeIsRefused` — extend this file for attachment changes). Nothing exercises `canTransition`, `handlePatch`, `handleBoard`, or `rankFor` — if you change any of them, you are writing the first test, not extending one.

## Getting it wrong

- **Editing `transitions` in `board.go` but not `TRANSITIONS` in `blueprint/_project/web/src/lib/issues.ts`.** The UI will let a user drag a card into a column the server then bounces with 409. This is the single most likely mistake here because nothing enforces the two stay in sync — no shared codegen, no test diffs them.
- **Running `make migrate` or following the README recipe and concluding your migration "didn't apply."** Both only run `0001_builder_init.sql`. Use the `for f in db/migrations/*.sql` loop from `ci.yml` instead.
- **Treating a status change as atomic with its activity log entry.** `handlePatch` writes the `builder_issues` UPDATE and the `builder_issue_activity` "moved" row as two separate `ExecContext` calls, not inside one `tx`. Don't assume a crash-consistency guarantee that isn't there, and don't add new side effects assuming the activity row is guaranteed to exist for a given status change.
- **Missing the comment-handler status side effect.** Posting a comment on a `blocked` issue with no pending decision and `human_only=false` flips it back to `ready` and resets `attempt_count` — this lives in `service.go`'s comment handler, not in `handlePatch`. If you're auditing "everywhere status can change," grep for `status =` across `internal/issues/` and `internal/orchestrator/`, not just `board.go`.
- **Assuming `board_rank` supports reordering today.** It doesn't — see step 5. Building "insert between two cards" by string-splicing the existing `m%08dz` format will produce collisions, not gaps.
- **Trusting `Content-Type` or the filename on an uploaded attachment.** Both are attacker-controlled and this repo has already been bitten by exactly that; sniff the bytes, generate the storage key server-side, keep `nosniff` + `attachment` disposition on serve.
- **Assuming a status transition publishes a notification/webhook.** `internal/notify/notify.go` documents `issue_moved` as an event kind, but nothing calls `notify.Publish` for it — only `NotifyDecision` is wired up. Don't build a feature that depends on this firing without adding the publish call yourself.
- **Copying the Atlas/sqlc migration workflow from `blueprint/_claude/skills/togo-migrate/SKILL.md`.** That skill documents the workflow shipped to *end-user projects scaffolded from this framework*. This repo's own schema (`db/migrations/*.sql`) is hand-authored SQL with no Atlas, no `.hcl`, no codegen step — don't run `togo db migrate:diff` or look for `db/atlas/schema` here.

## Related

- `internal/issues/service.go`, `internal/issues/board.go`, `internal/issues/attachments.go` — the actual implementation.
- `db/migrations/0001_builder_init.sql`, `0004_agent_workdir.sql` — schema and migration-comment style to imitate.
- `internal/issues/attachments_test.go` — extend for any attachment-validation change.
- `internal/orchestrator/claim.go`, `internal/orchestrator/reconcile.go`, `internal/orchestrator/claim_live_test.go` — the second, server-internal status-transition path and its test pattern.
- `blueprint/_project/web/src/lib/issues.ts`, `blueprint/_project/web/src/routes/issues.tsx` — the frontend copy of the transition table and the board drag handler.
- `.github/workflows/ci.yml` — the correct migration-apply sequence and full verification gate.
