---
name: togo-generate
description: Run and debug the togo codegen pipeline — sqlc, then gqlgen, then the OpenAPI export — and keep *.gen.go honest. Use after changing a query file, a GraphQL schema, a controller, or a model; when a *.gen.go file looks wrong; when types don't compile after a schema change; or when an endpoint is missing from openapi.json.
---

# togo-generate — sqlc → gqlgen → OpenAPI

```bash
togo generate          # the whole pipeline (alias: togo gen)
togo generate --only sqlc
togo generate --skip gqlgen
```

## What actually runs, and why in this order

| Step | Tool | What it reads | What it writes |
|---|---|---|---|
| 0 | `go mod tidy` | `go.mod` | resolves imports the generators introduce |
| 1 | **sqlc** | `internal/db/schema/`, `internal/db/queries/*.sql` | typed Go query code (`*.gen.go`) |
| 2 | **gqlgen** | the GraphQL schema + resolvers | generated resolvers and models |
| 3 | **OpenAPI export** | *the compiled program* — `go run ./cmd/api openapi` | the OpenAPI document |

The order is dictated by data flow. sqlc produces the types gqlgen's resolvers return.
The OpenAPI export runs **last because it compiles the whole program** — it cannot run
until steps 1 and 2 have produced code that builds.

That last fact is the most useful debugging lever in the pipeline: **if the OpenAPI step
fails, your program does not compile.** The error you are reading is a real build error,
not a generator quirk.

## Every step is soft-fail — which is a trap

The pipeline warns and continues when a tool is missing or a step fails, so that
`togo generate && togo migrate && togo serve` never breaks on a partial setup.

That means **`togo generate` can exit 0 having generated nothing.** Read the output.

```
RUN  sqlc
WARN sqlc failed (continuing): exit status 1
RUN  gqlgen
```

That is a failed generate wearing a success exit code. Always check:

```bash
togo generate 2>&1 | tee /tmp/gen.log
grep -nE 'WARN|not found|failed' /tmp/gen.log
```

togo installs the toolchain it needs (Go, sqlc, Atlas) before running, so a
"sqlc not found" warning means the install itself failed — fix that first rather than
proceeding with a skipped step.

## The generated-file contract

**`*.gen.go` files are never hand-edited. Not once. Not "just this line".**

Every edit you make is erased the next time anyone runs `togo generate` — which is
every build, every CI run, every teammate. The bug then reappears with no trace of
the fix, and the person debugging it reads your (deleted) fix in the git history and
concludes the file is maintained by hand.

Instead:

| You want to change | Edit this |
|---|---|
| A query, its columns, its filters | `internal/db/queries/<name>.sql` |
| A returned type or nullability | the schema in `internal/db/schema/` + a migration |
| A GraphQL field | the GraphQL schema, then implement the resolver in the non-generated file |
| A REST route, its params, its docs | the controller in `internal/api/` |
| Anything at all in a `*.gen.go` | **the source above, then regenerate** |

Verify the contract holds:

```bash
togo generate
git status --porcelain -- '*.gen.go'    # must be empty on a clean tree
```

A dirty `*.gen.go` after generate means the committed generated code does not match
the committed source. Somebody hand-edited, or somebody committed source without
regenerating. Either way it is a broken build for the next person.

## Commit generated code

Commit `*.gen.go` **in the same commit as the source change that produced it**. A
commit that changes a query file without its regenerated output is a commit that does
not build on its own — which breaks bisect, breaks review, and breaks anyone who
checks out that SHA.

## When to run it

Always, after any of:

- Adding or editing a file in `internal/db/queries/`
- Any schema change (and therefore any migration)
- `togo make:model`, `make:controller`, `make:resource`, `make:query`, `make:api`,
  `make:graphql`
- Adding or changing a GraphQL schema fragment
- Adding, removing, or re-pathing a REST route
- Installing a plugin that contributes routes or models

## Debugging

**sqlc fails with "column does not exist"**
The query is checked against `internal/db/schema/`, not against your live database.
The schema file is behind the migration. Update the schema, then regenerate. This is a
feature: it is the drift detector telling you the declared schema and the queries have
diverged.

**sqlc fails with "relation does not exist"**
Same cause: the table is in a migration that the schema files do not describe.

**gqlgen fails with "unable to bind to field"**
The GraphQL type expects a field the Go struct does not have — usually because sqlc
named it differently, or because sqlc did not run (see the soft-fail trap above).
Fix step 1 first; do not patch the resolver.

**OpenAPI step fails**
Your program does not compile. Run `go build ./...` and read the real error.

**A new endpoint is missing from `openapi.json`**
The handler is not registered on the router. The tests you wrote are hitting something
else. Register the route, regenerate, and re-probe:

```bash
curl -s {{api_base}}/openapi.json | jq '.paths | keys'
```

**Everything regenerates with a huge diff and no source change**
A tool version moved. Check whether sqlc/gqlgen versions changed; pin them before
committing a diff nobody can review.

## Verification

```bash
togo generate
go build ./...
git status --porcelain -- '*.gen.go'                 # empty
curl -s {{api_base}}/openapi.json | jq '.paths | keys'
```

## Hard refusals

- Editing a `*.gen.go` file
- Committing a source change without its regenerated output
- Treating a soft-fail warning as success
- Adding a Go method to generated code instead of adding a query

## Related

- `togo-resource` — what produces the source the pipeline consumes
- `togo-migrate` — schema and query files must move together
- `verify` — the `*.gen.go` cleanliness check is part of the gate
