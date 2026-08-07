---
description: "A task is done only when togo generate is diff-clean, go tests pass, lint and format are clean, and the web build succeeds."
globs: "*"
alwaysApply: true
---

# Rule 05: Definition of Done

**Four gates. All four green, in one run, on the final state of the change. Anything less is not done.**

## The Rule

### Gate 1 — Codegen is diff-clean

```bash
togo generate
git diff --exit-code
```

`togo generate` runs sqlc → gqlgen → OpenAPI. After running it, the working tree must show **no diff**. A dirty tree means the committed `*.gen.go` files do not match the sources they are generated from, and the next person to run `generate` will get an unexplained diff on top of their own work.

- Never hand-edit a `*.gen.go` file or anything under `internal/db/gen/`. Change the source (`togo.resources.yaml`, a query file, the schema, the GraphQL schema) and regenerate.
- **`togo generate` is soft-fail.** Its steps warn and continue so the pipeline never blocks. A `WARN` is a failure for this gate's purposes — read the output, do not trust the exit code (Rule 10).
- If `generate` fails, that is the finding. Do not work around it by editing generated output.

### Gate 2 — Go tests pass

```bash
go test ./...
```

All packages, not just the one you touched. A change to a plugin's registration order or a regenerated sqlc signature breaks packages you did not open.

### Gate 3 — Lint and format are clean

```bash
togo lint && togo format
```

Run `format` and then confirm it produced no changes — a formatting diff discovered in review is a gate that was skipped.

### Gate 4 — The web build succeeds

```bash
pnpm -C web typecheck && pnpm -C web build
```

**Build, not just typecheck.** `typecheck` alone passes on code that fails to bundle: unresolved runtime imports, missing assets, route-collection errors, and env-var access that only the bundler evaluates. If `web/` was touched at all, the build gate is mandatory. If `web/` was not touched, typecheck it anyway — a changed API contract can break it without the frontend files changing.

### Gate 5 — Migrations applied, if the change is schema-shaped

*Conditional: applies when the change adds or alters `togo.resources.yaml`, `internal/db/schema/`, or `internal/db/queries/`.*

```bash
togo migrate
```

The schema change must flow through the declared schema and the generators. Service or plugin code that creates its own tables at runtime — `CREATE TABLE IF NOT EXISTS` in an `init()` or a provider — is a violation of the no-direct-DDL rule, not a shortcut, and it does not satisfy this gate.

## The Done Report

When reporting done, paste evidence, not adjectives:

```
| Gate | Result |
|------|--------|
| `togo generate` + `git diff --exit-code` | clean |
| `go test ./...` | ok — N packages |
| `togo lint && togo format` | clean |
| `pnpm -C web typecheck && pnpm -C web build` | built in Ns |
| `togo migrate` (schema change) | applied — <migration name> |
```

"All checks pass" without the commands and their output is not a report (Rule 07).

## Done ≠ working

These gates prove the change **compiles, generates, and builds**. They do not prove it *works*. A client-visible change is not closed until it has been verified against a running instance — see **Rule 28: Verify Live Before Closing**. Green gates plus a successful deploy is still not proof; the rendered behavior is.

## Why this rule exists — concrete cost

Inherited from the estate this blueprint derives from, where "done" routinely meant "the file I edited compiles". The two failures that recurred: committed generated code drifting from its sources until nobody could tell whose diff was whose, and frontend changes that typechecked and then failed to bundle in CI — discovered after the branch had been declared finished and the author had moved on. Both are caught by running the full gate list once, on the final state.

## Enforcement

- Gates run on the **final** state of the change, after the last edit. Gates run mid-change and remembered as green do not count.
- Partial green is red. Four of five gates passing is a failing report, stated as such.
- Do not silence a gate to make it pass — no `//nolint` to clear lint, no skipped test, no `as any` to clear typecheck. If a gate is wrong, say so and get agreement to change it.
