---
description: "Never manually INSERT, UPDATE, or DELETE against a hosted database — every data change is a committed, generated, replayable artifact."
globs: "*"
alwaysApply: true
---

# Rule 21: No Direct DB Writes — All Data Changes Through Committed Artifacts

**Operators and agents must NEVER manually `INSERT`, `UPDATE`, or `DELETE` data in any hosted database of `{{project_name}}` — any env in `{{env_matrix}}`, including the one you think is disposable. EVERY data change — seed, fix, backfill, config row, cleanup — MUST be expressed as a committed artifact (a data migration or a seeder fixture), applied by the sanctioned runner, and pushed. Direct DML is ephemeral: it is gone the moment the database is reset, restored, redeployed, or re-seeded. Committed artifacts are the durable, reproducible source of truth.**

This is Rule 20 (DDL) extended to DML. Schema **and** data both flow only through committed, reviewable artifacts.

## The Rule

| Operation against a hosted DB in `{{env_matrix}}` | Allowed? |
|---|---|
| `psql <remote-url> -c "INSERT/UPDATE/DELETE ..."` | **NO** |
| `kubectl exec <db-pod> -- psql -c "INSERT/UPDATE/DELETE ..."` | **NO** |
| A hosted-Postgres web SQL editor → write / Save | **NO** |
| An MCP `execute_sql` tool with write intent | **NO** |
| `COPY <table> FROM ...` / bulk import by hand | **NO** |
| A data migration under `db/atlas/migrations/` (committed + pushed) applied via `togo migrate` | **YES** — the primary path |
| A seeder fixture under `db/seed/` (committed) run by the sanctioned seed command | **YES** |
| Read-only `SELECT` / `\dt` / `count(*)` via any tool | **YES** |
| **The application's own runtime writes** — the `{{project_name}}` binary writing data as designed, through sqlc-generated queries | **YES** — that is the app, not an operator change |
| DML against `$LOCAL_DATABASE_URL` *provided* it becomes a committed artifact before the work merges | **YES** (scratchpad only) |

## Why direct DML is forbidden

- **It is lost on reset.** A restore, a volume re-init, a redeploy, or a re-seed erases anything that was not an artifact. See Rule 22 for what that looks like at scale.
- **It is not reproducible.** A fresh deploy of `{{project_name}}` to a new environment must reproduce the exact working state from the repository alone. A manual `UPDATE` on one cluster is invisible to the next deploy — the reproducible-deploy contract silently breaks, and you find out on the environment that matters.
- **It is not auditable.** Every data change should be a reviewable, attributable artifact in git with a diff and an author — not a shell command in somebody's scrollback.
- **It hides in `web/`.** `web/` never opens a database connection (that is a hard boundary), so a frontend engineer chasing "why is this row wrong" has exactly one place to look: the artifacts. Direct DML makes that lookup return nothing.

## What to do instead

For ANY data change you are tempted to make with a manual `INSERT`/`UPDATE`/`DELETE`:

1. **Write it as an artifact.**
   - Config / lookup / reference rows → a data migration in `db/atlas/migrations/`, written idempotently: `ON CONFLICT DO NOTHING`, `ON CONFLICT DO UPDATE`, `WHERE` guards, `IF EXISTS`.
   - Anything a fresh environment needs → a seeder fixture under `db/seed/`, so a brand-new deploy has it without anyone remembering.
2. **Apply it with the sanctioned runner** (`togo migrate`, or the seed command) — never by hand-running the SQL.
3. **Commit and push it.** (Push requires the operator's explicit OK.)
4. **Verify it landed** (Rule 28): query the row back out of the live database and paste the result.

A one-off cleanup is *still* an artifact. Deleting malformed rows is written as `DELETE ... WHERE <bad-condition>` in a migration, so the same cleanup re-applies on every environment and is recorded forever.

## Why this rule exists — concrete cost

Inherited, with the incident, from the estate this blueprint was distilled from. When a platform-wide wipe destroyed every database (see Rule 22), it also destroyed every manual fix operators and agents had applied directly over the preceding months: scope configuration, admin rows, integration-key registrations, dozens of small cleanups. Because those changes existed only as direct DML and never as artifacts, **they could not be replayed**. Every one had to be reconstructed by hand from memory and screenshots. The schema came back in minutes — the data that had never been written down took days, and some of it was simply never recovered because nobody remembered it had been set.

## Enforcement

- **PreToolUse(Bash) hook** `.claude/hooks/guard-db-dml.sh` (registered in `settings.json`) blocks Bash commands that run `INSERT` / `UPDATE` / `DELETE` / `COPY ... FROM` via `psql` or `kubectl exec ... psql` against a non-local host. Read-only `SELECT`, the sanctioned runners (`togo migrate`, `atlas migrate`), and `$LOCAL_DATABASE_URL` pass through.
- **CI gate**: a PR that describes a data change with no corresponding migration or fixture is rejected.
- **Code review**: any data fix must point at a committed file path. "I ran it" is not a code review answer.

## Anti-patterns

- **"It's just a quick UPDATE to fix one row"** — write the migration; it survives the next reset. The "quick" fix is precisely the one you lose.
- **"I'll psql the fix now and write the migration later"** — later never comes, and a reset eats the fix first. Artifact first, always.
- **"It's only the dev environment"** — dev parity poisons the production redeploy. Artifact.
- **"The agent applied it directly and verified it works"** — it works *now*; it is gone on the next reseed. An autonomous agent will produce exactly this sentence, in good faith, having genuinely confirmed the row is correct. **A verified direct write is still a Rule 21 violation.** Verification proves the state is right; only a committed artifact proves it will still be right tomorrow. If you are the agent: the fact that you checked does not upgrade the write.

## Related

- Rule 20 — no direct DDL (this rule is the DML analog)
- Rule 22 — never wipe a database (why losing un-committed changes is catastrophic)
- Rule 23 — schema change workflow
- Rule 28 — verify before closing
