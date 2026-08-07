---
description: "Never hand-author a migration: change the declared schema, regenerate, review the SQL, apply, verify."
globs: "*"
alwaysApply: true
---

# Rule 23: Schema Change Workflow — Declare, Regenerate, Review, Apply, Verify

**You never write a migration file. You change `db/atlas/schema/`, run `togo db migrate:diff` to generate the migration, *read the SQL it produced*, apply it with `togo migrate`, and verify against the live database. A migration file that a human typed is a defect, not a change.**

## Why the inversion

togo is sqlc + Atlas + an ORM. The declared schema in `db/atlas/schema/` is the source of truth; `db/atlas/migrations/` is a **derived artifact** — an ordered, immutable ledger of how the database got from empty to declared. Atlas computes the diff. When you hand-author the ledger, you are asserting a delta Atlas did not compute, and from that moment the declared schema and the applied schema tell different stories with no mechanism to reconcile them.

This is also why hand-written SQL outside `internal/db/queries/*.sql` is banned project-wide: sqlc generates the query layer, Atlas generates the schema layer, and anything you type by hand between them is invisible to both generators.

## The Workflow — five steps, in order

### 1. Declare
Change the schema, not the migration.

```bash
togo make:model Widget name:string status:string owner_id:uuid   # writes db/atlas/schema/widget.hcl
# or edit db/atlas/schema/<resource>.hcl directly for an alter
```

One `.hcl` file per resource. Atlas concatenates the whole directory into the desired state.

### 2. Regenerate
```bash
togo db migrate:diff add_widget_status      # → db/atlas/migrations/<ts>_add_widget_status.sql
togo generate                                # sqlc → gqlgen → OpenAPI; refreshes *.gen.go
```

`togo generate` is not optional. The sqlc models in `internal/db/gen/*.gen.go` are derived from the schema too; skipping it leaves the Go types describing the old shape while the database has the new one, and the failure surfaces as a confusing scan error three layers away.

### 3. Review the generated SQL — do not skip this
Open the generated file and read every statement before applying it. Atlas is correct about the diff, not about your intent. Specifically look for:

- **`DROP COLUMN` / `DROP TABLE`** — did you rename something? Atlas sees a rename as drop-plus-add and **your data is in the dropped one**. Split it: add the new column, ship a data migration copying the values, drop the old one in a later change.
- **Unqualified `ALTER COLUMN ... TYPE`** — may rewrite the whole table and hold a lock.
- **`NOT NULL` added without a default** — fails on any non-empty table.
- **A new index without `CONCURRENTLY`** — blocks writes for the duration on a large table.
- **Anything you did not ask for** — that means the declared schema had already drifted from what is applied. Stop and reconcile before proceeding.

If the generated SQL is wrong, **fix the `.hcl` and regenerate.** Do not edit the generated migration. The one exception: adding a `-- atlas:txmode none` directive or splitting a file for lock reasons — mechanical concerns, never semantic ones, and called out in the PR description.

### 4. Apply
```bash
togo migrate
```

`togo migrate` is the only sanctioned runner. Applying by hand (`psql -f`) records nothing in the migration ledger and is a Rule 20 violation.

Order of operations matters when the change is not backward-compatible: apply the migration **before** deploying code that requires it (expand), and deploy code that stops using a column **before** the migration that drops it (contract). Never ship both halves in one step.

### 5. Verify
```bash
togo db migrate:status                                  # the ledger agrees
psql "$DATABASE_URL" -c '\d+ widget'                    # the shape is real
psql "$DATABASE_URL" -c 'SELECT count(*) FROM widget WHERE status IS NOT NULL'
curl -s {{api_base}}/openapi.json | jq '.components.schemas.Widget'   # the API surface moved too
```

A green `togo migrate` is not verification. See Rule 28.

## Migrations Are Immutable Once Applied

An already-applied migration **does not re-run when you edit it**. The runner tracks applied versions; it has no idea the file changed. Editing an applied migration produces a file that says one thing and a database that says another, in every environment, silently.

| You want to | Do this |
|---|---|
| Fix a bug in an applied migration | Change `db/atlas/schema/`, regenerate a **new** forward migration |
| Rename an applied migration file | Don't. The filename is the recorded version. |
| Delete an applied migration | Don't. Write a forward migration that reverses its effect. |
| Fix a migration applied **only** on your local scratch DB | Free — reset your local container and regenerate. Nowhere else. |

## Anti-patterns

- **"I'll just write the ALTER by hand, it's one line"** — one line that Atlas does not know about, so the next `migrate:diff` proposes to undo it.
- **"I edited the migration file, the next deploy will pick it up"** — it will not. Already-applied migrations never re-apply. The next deploy applies only *new* files.
- **"I regenerated but skipped `togo generate`"** — the schema moved and the Go types did not. You will find out at runtime.
- **"I renamed the column in the `.hcl` and applied"** — Atlas dropped it and added an empty one. Check the generated SQL *before* applying, always.
- **"I'll write the migration and add it to the schema later"** — the schema is the input, not the summary. Later never comes and the ledger becomes the only truth, which is exactly the state Rule 20 exists to prevent.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint was distilled from, where the equivalent rule read "the migration file must mirror the live database" and permitted edit-then-apply in either direction. That symmetry was the flaw: over three years it produced 1,014 migration files across two services with no authoritative declared schema anywhere, so the question "what should the schema be?" could only be answered by replaying the entire ledger and hoping nobody had edited an applied file. Several people had. The rebuild was cheaper than the reconciliation.

togo removes the ambiguity by construction — there *is* a declared schema, and the ledger is generated from it. This rule exists to stop anyone from re-introducing the symmetry by hand.

## Related

- Rule 20 — no direct DDL; the generated migration is the only path to the database
- Rule 21 — data changes are artifacts too
- Rule 22 — never wipe; forward migrations only, never a reset to "start over"
- Rule 28 — verify before closing; the OpenAPI assertion above is part of the evidence bundle
