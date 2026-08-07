---
description: "Every feature starts in togo.resources.yaml and flows through the generators. Declare → make → generate → migrate → hand-edit fragments → test. Never build out of order."
globs: "*"
alwaysApply: true
---

# Rule 10: Generator-First Sequence

**A feature in {{project_name}} is declared before it is written: `togo.resources.yaml` → `togo make:*` → `togo generate` → `togo migrate` → hand-edited fragments → tests. Work performed out of this order is discarded by the next generator run.**

## The Rule

togo is a code-generating framework. The declaration is the source of truth; the code is
a projection of it. Follow the sequence in order, every time:

```
1. DECLARE     togo.resources.yaml        Resource name, table, fields (go/gql/pg/null), controller?
2. SCAFFOLD    togo make:resource <Name>  → model + controller + view
               (or the long form: make:model → make:controller → make:view)
3. GENERATE    togo generate              sqlc → gqlgen → OpenAPI export   ← the compile gate
4. MIGRATE     togo migrate               Applies internal/db/schema to the database
5. EDIT        hand-written fragments only (see "What you may edit by hand")
6. TEST        togo make:test / make:e2e, then togo test
```

Step 1 is not optional paperwork. `togo.resources.yaml` is, in its own header, *"Managed by
togo. Source of truth for generated registries."* A resource that is not in that file does not
exist to the generators, no matter how much Go you wrote for it.

### Step 3 is the compile gate — treat a warning as a failure

`togo generate` runs three steps in a fixed order dictated by data flow:

| Step | What it does | Reads | Writes |
|---|---|---|---|
| `sqlc` | Compiles `internal/db/queries/*.sql` against `internal/db/schema/*.sql` | query + schema SQL | `internal/db/gen/` |
| `gqlgen` | Builds GraphQL resolvers from the schema fragments | `internal/graph/*.graphqls` | resolver stubs + models |
| `openapi` | Runs `go run ./cmd/api openapi` — **compiles the entire program** | everything | the OpenAPI document |

**Every step is soft-fail by design** so that `togo generate && togo migrate && togo serve`
never breaks on a missing tool. That convenience is a trap for an agent: a yellow warning
scrolls past and the run "succeeds" with no code generated and nothing compiled.

- Read the output of every `togo generate`. A `WARN` on `sqlc` means your queries were never
  compiled. A `WARN` on `openapi` means **nothing was type-checked at all**.
- The `openapi` step is last precisely because it compiles the whole program. It is the closest
  thing the pipeline has to a build gate. If it did not run clean, you have not built anything —
  run `go build ./...` before you claim otherwise.
- `togo generate` runs `go mod tidy` first, because `make:resource` introduces imports (orm,
  validation, faker). If tidy warns, resolve it before reading anything else.

Narrow a run with `--only sqlc` / `--skip gqlgen` while iterating, but the last run before you
call the work done must be a full, clean `togo generate`.

### Step 4: migrate applies the schema — Atlas diffing is the advanced path

`togo migrate` is driver-agnostic and applies the schema files directly. `togo migrate:diff`
and `togo migrate:status` shell out to Atlas and are **not** part of the default pipeline.
Do not reach for Atlas because a migration felt awkward; reach for it when the project has
explicitly adopted versioned migrations.

**Never write `CREATE TABLE IF NOT EXISTS` from service code.** Schema belongs in
`internal/db/schema/` and is applied by `togo migrate`, full stop. See Rule 11.

### What you may edit by hand

| Path | Hand-editable? |
|---|---|
| `togo.resources.yaml` | **Yes** — this is where you start |
| `internal/db/schema/*.sql` | **Yes** — the declared schema |
| `internal/db/queries/*.sql` | **Yes** — the only place SQL may be written (Rule 13) |
| `internal/graph/*.graphqls` | **Yes** — schema fragments |
| Controller/action bodies, resolver bodies | **Yes** — business logic goes here |
| `web/src/**` | **Yes** |
| `*.gen.go` (e.g. `internal/plugins/plugins.gen.go`, `internal/rest/registry.gen.go`, `internal/db/seeders/registry.gen.go`) | **NO — regenerated, your edit is deleted** |
| `internal/db/gen/**` | **NO — sqlc output** |

## Anti-Patterns

| Wrong | Right |
|---|---|
| Hand-write the model struct, then backfill `togo.resources.yaml` | Declare in `togo.resources.yaml`, then `togo make:resource` |
| Write the React page against a shape you imagine the API will have | `togo generate` first — the OpenAPI document *is* the contract |
| Add a column in the schema and a form field in the same commit, untested | Schema + `togo generate` + `togo migrate` land and pass, then the UI |
| `CREATE TABLE IF NOT EXISTS` inside a plugin's `init()` | `internal/db/schema/*.sql` + `togo migrate` |
| Fix a compile error by editing `internal/rest/registry.gen.go` | Fix the declaration or the fragment; re-run `togo generate` |
| Read "generate finished" and move on | Read the actual step lines; a soft-fail warning is a failure |
| Reach for `togo migrate:diff` on a whim | Use `togo migrate`; Atlas diffing is an explicit project decision |

## Exception: throwaway spikes

If the operator explicitly labels the work a spike or prototype, you may build UI-first against
a stub. Say so out loud, in the same message: *"This is a spike — it bypasses the generators
and must be re-declared in `togo.resources.yaml` before it ships."* An unlabelled spike is
just an out-of-order feature.

## Why this rule exists — concrete cost

The generators are the framework. Work done ahead of them is not merely unconventional, it is
**deleted**: `*.gen.go` files and everything under `internal/db/gen/` are overwritten wholesale
on the next `togo generate`, which is a command that runs on nearly every subsequent task. An
agent that hand-patches a registry to make a build go green has written code with a lifetime
measured in one command.

The soft-fail design compounds it. Because every step warns instead of aborting, a run with
`sqlc` missing prints a cheerful summary while generating nothing — and the `openapi` step,
the only stage that compiles the whole program, is the one most likely to be skipped in a
half-configured environment. The failure mode is not a red build. It is a green run, a
confident "done", and a program that has never once been compiled.

## Enforcement

- **Before writing any Go or TSX for a new resource**, confirm it is in `togo.resources.yaml`.
  If it is not, stop and declare it.
- **After every `togo generate`**, quote the per-step result in your progress note. "generate
  clean" is not evidence; `sqlc ok / gqlgen ok / openapi ok` is.
- If any step soft-failed, either install the missing tool and re-run, or state plainly that
  the code is unverified. Never both fail and claim done.
- **Never edit a `*.gen.go` file.** If you find yourself in one, you are solving the wrong
  problem. The `post-commit-check` hook flags staged changes to generated paths.
- **Never emit DDL from service code.** The `guard-direct-ddl` hook blocks `CREATE TABLE`,
  `ALTER TABLE`, and `DROP` outside `internal/db/schema/`.
- Definition of done for a resource: `togo generate` clean → `togo migrate` clean →
  `go build ./...` clean → at least one test per layer that was touched.
