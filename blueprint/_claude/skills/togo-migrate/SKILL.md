---
name: togo-migrate
description: Change the database schema in a togo app — write the migration, apply it with togo migrate, keep the schema files and queries in sync, and never run DDL from service code. Use when adding or altering a table, column, index, enum, or constraint; when a query fails with "column does not exist"; or when asked to "add a field", "change the schema", or "write a migration".
---

# togo-migrate — Schema changes, and the DDL ban

## The one rule that matters

**Never `CREATE TABLE IF NOT EXISTS` — or any other DDL — from service code.**

Not from an `init()`. Not from a provider's boot function. Not from a "self-healing"
first-request path. Not guarded by `IF NOT EXISTS`, which is what makes it feel safe.

This is the most likely violation in a togo codebase because togo's own auth and
autopilot plugins do it today. Their doing it is not permission; it is the reason the
rule is written down.

**Why it is a real problem, not a style preference:**

- The schema stops being knowable from the repo. `db/migrations/` no longer describes
  the database, so the next engineer reads the wrong thing and writes a migration that
  conflicts with a table service code already made.
- `IF NOT EXISTS` silently no-ops against a table with a *different* shape. The service
  boots green against a schema it does not match, and fails at the first query.
- The app needs DDL privileges at runtime forever. A compromised request path can drop
  tables.
- Two instances booting concurrently race on the same DDL.
- Nothing versions it. There is no ordering, no down-path, no record of when it changed.

If you find boot-time DDL: extract it into `db/migrations/`, delete it from the boot
path, and note the extraction in the plan. If you cannot delete it (a third-party
plugin does it), document it and file an issue — do not add another one alongside it.

## The commands

```bash
togo migrate            # apply the schema to the database (driver-agnostic)
togo seed               # seed the database

togo migrate:diff       # generate an Atlas migration (advanced)
togo migrate:status     # Atlas migration status (advanced)

togo db:up              # start the project's database stack (docker compose up -d)
togo db:down            # stop it
```

`togo migrate` is the default path: it applies the schema files directly, driver-agnostic,
with no Atlas dev-url needed. `migrate:diff` and `migrate:status` shell out to Atlas and
are the advanced path — reach for them when you need an ordered, versioned diff, not for
every column.

`togo db:up` is a no-op with a friendly warning when the project has no
`docker-compose.yml` — that means the project is on SQLite and there is no stack to
manage.

## The workflow

```bash
# 1. Write or generate the schema change
togo make:migration <Model>          # for a model-backed change
#    …or edit internal/db/schema/ and db/migrations/ by hand for anything else

# 2. Apply it
togo migrate

# 3. Regenerate — queries are type-checked against the schema files
togo generate

# 4. Build and verify
go build ./... && togo test
```

Steps 2 and 3 are not interchangeable and neither is optional. sqlc checks queries
against the **schema files**, not against the live database — so a migration applied
without updating the schema files leaves `togo generate` generating against the old
shape, and a schema file edited without applying leaves the live database behind.
Keeping the two in step is the whole job.

## Writing a migration

- **One logical change per migration file.** A file that adds a table *and* backfills
  *and* drops a column is three things that can fail independently.
- **Additive first.** Add the column nullable, backfill, then add the constraint. A
  single `ADD COLUMN … NOT NULL` against a populated table fails or locks.
- **Name constraints and indexes explicitly.** Generated names differ between engines
  and make the next diff unreadable.
- **Include the down-path** or state in a comment why there isn't one. "Drop column" is
  a data-loss down-path; say so.
- **Comment the non-obvious.** A `CHECK` that encodes a business rule needs a sentence.
  A partial unique index needs the reason it is partial.
- **Never edit an applied migration.** Once it has run anywhere but your laptop, it is
  history. Write a new one.

## Destructive operations

`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, and any `UPDATE`/`DELETE` without a `WHERE`
are destructive. Against anything that is not your local scratch database:

1. Stop.
2. Ask the operator explicitly, naming the table and the estimated row count.
3. Get an answer in this session, in writing.
4. Confirm a backup exists and say when it was taken.

An agent does not get to decide that data is disposable. If the project has guard hooks
installed, they will block this — the hook is the backstop, not the policy. Do not try
to route around it.

## Data changes are not migrations

A migration changes **shape**. Backfills, corrections, and one-off data fixes are
separate, reviewable, and idempotent. Put them in a seeder or a one-shot command
(`togo seed`, or a `cmd/` entrypoint), not in the schema migration — so that re-running
the schema does not re-run the data change, and so the data change can be re-run without
touching the schema.

## Debugging

| Symptom | Cause | Fix |
|---|---|---|
| sqlc: `column "x" does not exist` | schema files behind the migration | update `internal/db/schema/`, regenerate |
| `relation "x" does not exist` at runtime | migration not applied to this database | `togo migrate` |
| `togo migrate` succeeds, queries still fail | pointed at a different database | check `DATABASE_URL` |
| Table exists but the migration says it created it | boot-time DDL created it first | find and remove the DDL from service code |
| `togo db:up` warns "no docker-compose.yml" | SQLite project | expected — no stack |
| Atlas diff is enormous | live schema drifted from the declared schema | reconcile before generating another diff |

## Verification

```bash
togo migrate:status                                   # advanced path, when in use
psql "$DATABASE_URL" -c '\d <table>'                  # the shape you expect
togo generate && git status --porcelain -- '*.gen.go' # empty
togo test
```

Then a behavioural probe — write a row through the API and read it back. A migration
that applied cleanly and left an endpoint broken is not done. See `verify`.

## Hard refusals

- DDL from service code, boot paths, `init()`, or request handlers — including
  `CREATE TABLE IF NOT EXISTS`
- Editing an already-applied migration
- Destructive DDL or unqualified DML against a non-local database without explicit,
  in-session operator approval
- Applying a migration without updating the schema files and regenerating
- SQL outside query files and migration files

## Related

- `togo-generate` — why schema and queries must move together
- `togo-resource` — `togo make:migration` and the rest of the generators
- `verify` — the post-migration evidence bundle
