# Memory provenance, and the source registry that already exists

Status: **blocked, pending one schema decision.** Written from issue #47.

This note exists because four issues (#35, #43, #44, #47) are all assigned to
`brain-vault-engineer`, all touch the same two tables, and three of them were
running concurrently. The operator answered three cross-cutting questions in
#47's thread; those answers lived only in that comment, so the next run would
have re-asked them. They are recorded here.

## The three answers (operator, #47)

**1. Staleness is a missed cadence, not silence.** A source declares
`expected_every` (an interval, nullable). It is stale when
`now() - last_success_at > expected_every * 2`. The doubling is deliberate: one
missed cycle is noise, two is a pattern, and an indicator that cries wolf gets
ignored. When `expected_every` is NULL the source is **never** stale — the
honest answer for a webhook nobody promised a cadence for.

**2. Deleting a source must not delete what was learned from it.** The
provenance link goes, the knowledge stays. A memory whose source is gone reads
as "we no longer know where this came from", which is true.

**3. The project namespace is `<fleet>:project` — here, `default:project`.**
Not `project:<name>`. Every agent brain already reads `<fleet>:<slug>`, so the
project brain is that shape with `project` in the slug position.
`builder_brains.agent_slug` becomes nullable with
`CHECK (agent_slug IS NOT NULL OR namespace LIKE '%:project')`. This answer
settles the same question left open on #35 and #44.

## What is actually in the database

The operator approved a new `builder_memory_sources` table plus a
`builder_memories.source_id` column. That approval was given without knowledge
of the following, which this issue found:

`builder_dev` already contains `builder_sources`, `builder_source_items` and
`builder_source_runs`. `builder_sources` is a full source-config registry
(`kind`, `name`, `namespace`, `schedule`, `enabled`, `cursor`, `last_run_at`,
`last_status`, lease columns). `builder_source_items` already carries the
provenance edge this issue was asked to add:

```
builder_source_items (source_id -> builder_sources(id) ON DELETE CASCADE,
                      content_hash, item_ref, memory_id, seen_count, ...)
```

So a source -> memory link exists, and its delete behaviour already matches
answer (2): dropping a source drops the item rows and leaves the memories.

**These three tables appear nowhere in the repository.** Not in
`db/migrations/` (which stops at `0009_mcp_tokens.sql`), not in any `.go` or
`.sql` file. They were applied directly to the shared dev database and never
committed, so a fresh install does not have them and `builder_dev` has drifted
from the migration set. Verified with `grep -rl builder_source_items .` (no
matches) against `\dt builder_*source*` (three tables).

## The open question

Given that a source registry and a provenance edge already exist, a new
`builder_memory_sources` table plus a `builder_memories.source_id` column would
be a third representation of one relationship. The decision needed is whether
provenance is read through the existing `builder_source_items` join — in which
case #47 adds only `expected_every` and `last_success_at` to `builder_sources`
for answer (1) — or whether the approved new table stands and the existing one
is retired. This is a `schema_change`, so it is not the agent's call.

`last_success_at` is genuinely missing either way: `last_run_at` plus
`last_status` records how the most recent run ended, which cannot distinguish
"succeeded an hour ago, failed since" from "has never succeeded".

## Sequencing

`#35` owns the `builder_brains` migration and the `default:project` row. It has
not landed: three attempts (two failed, one expired) left work stranded on
`builder/issue-35` including `db/migrations/0010_project_brain.sql`,
`internal/brain/project.go` and `brain.ProjectNamespace`. Migration number
`0010` is therefore already claimed by an unmerged branch.

`#47`'s two read handlers cannot be built before that lands.
`internal/fleet/agents_api.go:handleBrain` resolves a brain with
`WHERE b.agent_slug = $1`, which structurally cannot serve a project brain whose
`agent_slug` is NULL. The operator's instruction on #47 was to hand off rather
than write the brains migration twice.
