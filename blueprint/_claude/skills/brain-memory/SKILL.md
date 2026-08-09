---
name: brain-memory
description: "Triggered when an agent retains or recalls memory."
---

# brain-memory — write to a memory, and it must be read back correctly by exactly the right agent

This is the procedure for touching anything in the retain/recall path: adding a new call site, changing what gets stored, extending the entity graph, or debugging why an agent's memory came back empty or leaked across agents. `internal/brain/brain.go` and `internal/brain/graph.go` are the store; `internal/orchestrator/implement.go` is the only place that calls it today.

## When to use this

- You are adding or changing a call to `o.brain.Retain(...)` or `o.brain.Recall(...)` — currently only `recallFor` and `remember` in `internal/orchestrator/implement.go` do this.
- You are changing what text goes into a memory's `content`, or its `importance` value.
- You are adding a new entity kind, changing `extractEntities` in `internal/brain/graph.go`, or touching `builder_entity_edges` / `builder_memory_entities`.
- You are swapping `HashEmbedder` for a real embedding model, or changing `Dim` / `MaxDistance` in `internal/brain/brain.go`.
- An agent reports it "forgot" something it should know, recalled another agent's memory, or a recall produced garbage — before touching code, reproduce with `TestBrainIsolationAndRecall` in `internal/brain/brain_live_test.go`.
- You are writing a migration that adds a column to `builder_memories`, `builder_brains`, or `builder_entities`.

## Steps

1. **Read the two existing call sites before adding a new one.** `recallFor` (implement.go:573) builds the query from `c.Title + " " + c.Area + " " + firstWords(c.Body, 40)` — about the issue, not by its number, because the goal is resemblance, not lookup. `remember` (implement.go:607) only writes on `fixed` (with actual diff changes), `needs_human`, or `cannot_reproduce` — never on a no-op. Match this shape: memory content must be a durable, transferable fact ("the feedback widget mounts from index.html, not React"), never a restatement of the issue number.

2. **Never let a brain call fail the caller.** Every existing site guards with `if o.brain == nil { return }` and treats a query error as a warning, not a returned error:
   ```go
   mems, err := o.brain.Recall(ctx, c.Agent, query, 6)
   if err != nil {
       o.log.Warn("recall failed", "agent", c.Agent, "err", err)
       return ""
   }
   ```
   Copy this pattern exactly. Memory is an optimization; a disabled, empty, or erroring brain must never block a run.

3. **Resolve the write namespace with `Writable`, never construct it.** `ns, err := o.brain.Writable(ctx, c.Agent)` returns the agent's own `<fleet>:<slug>` namespace (set at generation time in `internal/fleet/generate.go:499`). A read grant on `<fleet>:project` does not imply write — don't try to retain there from agent code.

4. **Pick `importance` from the outcome, not a flat default.** The existing scale: `fixed` → 0.6, `cannot_reproduce` → 0.7, `needs_human` → 0.8 (the highest — it cost a full run to discover). `Retain` itself defaults bare/zero importance to 0.5, so an explicit value only matters when you want to rank above or below that.

5. **Set `source_ref` when the memory is about one durable thing** (a file, an issue number) so re-retaining updates in place instead of duplicating:
   ```go
   o.brain.Retain(ctx, ns, content, "issue", fmt.Sprintf("#%d", c.Number), importance)
   ```
   `source_ref` is identity — `ON CONFLICT (namespace, source_ref) WHERE source_ref <> ''` in `brain.go:117` is what makes this work. Leave it `""` only for one-off notes with no natural key.

6. **If extending the entity graph**, add the new kind to both `reSymbol`/`reFile`/`stopEntities` in `graph.go` AND the `CHECK (kind IN (...))` constraint in `db/migrations/0005_brain_graph.sql` — the two must stay in sync or every insert with the new kind fails at the DB, not in Go.

7. **If touching the embedder or `Dim`/`MaxDistance`**, re-measure `MaxDistance` — it is explicitly called out in `brain.go:34` as embedder-dependent (0.85 was measured against `HashEmbedder`'s distance distribution: 0.000 identical, 0.705 related, 1.000 unrelated). A new embedder without re-measuring silently changes what counts as "no match" and what gets recorded as a gap.

8. **Test against a real database, not a mock.** Run:
   ```bash
   TEST_DATABASE_URL='postgres://.../builder_test' go test ./internal/brain/... ./...
   ```
   The DSN must contain `_test` — `open(t)` in `brain_live_test.go:21` refuses to run otherwise, because the fixtures `DELETE FROM` every brain table. `TestBrainIsolationAndRecall` is the one to run after any change: it asserts an agent never reads another agent's private namespace, that a read grant doesn't confer write, that `source_ref` dedupes, that a miss records a gap, and that `Forget` invalidates rather than deletes.

## Getting it wrong

- **Retaining without `source_ref` for something that will be re-learned every run.** Each retain becomes a new row; recall then returns five slightly-different versions of the same fact instead of one updated one. This is exactly what `source_ref`-as-identity exists to prevent — use it whenever the memory is about a stable thing.
- **Recording a gap against the wrong namespace.** `Recall`'s `namespaces` list comes from a `UNION` with no `ORDER BY` (brain.go:223-226), so `namespaces[0]` is arbitrary — often the shared project brain. The code deliberately re-resolves `s.Writable(ctx, agentSlug)` before calling `recordGap`. If you refactor this, keep doing that lookup; do not reuse whatever namespace happened to rank first.
- **Blocking a run on a brain error.** A `t.Fatal`-style panic or a returned error from `recallFor`/`remember` would take down an otherwise-successful issue fix over a memory subsystem hiccup. Every failure path here is `log.Warn` + early return.
- **Storing "Fixed issue #7" as the memory content.** Useless to any other issue. The three real examples in `remember` all describe *what was true about the codebase*, not what happened to the ticket.
- **Assuming `Forget` deletes the row.** It sets `invalid_at`, and the isolation test explicitly checks the row still exists with `count(*) WHERE id=$1` returning 1. Code that expects the row gone (e.g. re-inserting with the same `source_ref` expecting a fresh conflict-free insert) will break.
- **Adding an entity kind to the regex but not the migration's CHECK constraint** (or vice versa) — the insert in `linkEntities` fails with a constraint violation that looks unrelated to the actual change.
- **Running the live tests against a non-test database.** `open(t)` guards on `_test` appearing in the DSN precisely because an earlier version of this suite wiped `builder_dev`'s agents — don't work around that guard by pointing `TEST_DATABASE_URL` at a dev database with `_test` stripped out of the name.

## Related

- `internal/brain/brain.go` and `internal/brain/graph.go` — the store and the entity graph, read in full before changing either.
- `internal/orchestrator/implement.go` (`recallFor`, `remember`) — the only production call sites; treat as the reference implementation for any new one.
- `internal/fleet/generate.go` (around line 496) — how an agent's namespace and shared-brain read grant are provisioned; read this before assuming a namespace shape.
- `internal/fleet/entity_api.go` — how a single entity's memories and neighbours are surfaced read-only; relevant if you're exposing more of the graph.
- `db/migrations/0002_brain_vectors.sql` and `0005_brain_graph.sql` — the schema and the comments explaining each index's purpose.
- `internal/brain/brain_live_test.go` and `brain_wiring_live_test.go` — the tests to run after any change, and the pattern to extend for a new one.
