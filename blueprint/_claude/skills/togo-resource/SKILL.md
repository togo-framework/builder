---
name: togo-resource
description: Scaffold a new resource in a togo app — model, migration, sqlc queries, REST/GraphQL controller, seeder, factory, and the web page — via togo make:*. Use when asked to "add a model", "create a resource", "scaffold CRUD for X", "add an entity", or when a plan calls for a new table plus its endpoints and UI.
---

# togo-resource — Scaffold a resource the togo way

togo's generators are the contract. Hand-writing what `togo make:*` generates produces
files the next `togo generate` disagrees with — and the disagreement shows up as a
compile error in a file you did not write.

## The flow

togo has a three-step core flow and an all-in-one shortcut.

```bash
# The all-in-one — model + controller + views
togo make:resource Order customer_id:uuid total:decimal status:string

# …or step by step, which is what you want when you need to think between steps
togo make:model Order customer_id:uuid total:decimal status:string
togo make:controller Order          # REST + GraphQL + docs + hooks
togo make:view Order                # Next.js page + hook + type
```

Each command tells you the next one. Follow it.

After **any** `make:*`, the pipeline is always:

```bash
togo generate     # sqlc → gqlgen → OpenAPI export
togo migrate      # apply the schema
togo serve        # or togo dev
```

`togo make:resource` prints exactly this as its "next" hint. It is not a suggestion.

## Field syntax

```
<name>:<type>
```

`id` and timestamps are added by default — do not declare them. Run
`togo make:model <Name>` with no fields to get the interactive field prompt.

Name models in **PascalCase singular** (`Order`, `LineItem`). togo derives the table
name (`orders`, `line_items`), the Go type, the query file, the route path, and the
page path from it. Fighting the derivation by naming a model `Orders` produces
`orders_s` somewhere and you will find it three days later.

## Single-artifact generators

When the model already exists and you need one more piece:

| Command | Produces |
|---|---|
| `togo make:query <Name>` | the sqlc query file |
| `togo make:migration <Name>` | the Atlas schema for the model |
| `togo make:graphql <Name>` | the GraphQL schema fragment |
| `togo make:api <Name>` | the REST handler |
| `togo make:seeder <Name>` | the seeder |
| `togo make:factory <Name>` | the faker factory |
| `togo make:page <Name>` | the Next.js page |
| `togo make:test <Name>` | a Go feature test |
| `togo make:e2e <Name>` | a Playwright e2e spec |

Each operates on an existing model. If the model is not registered, they fail with
"run `togo make:model <Name>` first" — which is the right answer, not an obstacle.

## Business logic goes in an Action

```bash
togo make:action ApproveOrder
```

Actions live in `internal/actions/` and are dispatched from controllers and events.
A controller that contains three hundred lines of business logic is a controller you
cannot call from a job, a CLI command, or another controller. Put the logic in an
Action; let the controller do HTTP.

## Where each layer's code belongs

| Layer | Location | Hand-editable? |
|---|---|---|
| Model / resource registry | `togo.yaml` (or the project manifest) | via `make:*` |
| Schema | `internal/db/schema/`, `db/migrations/*.sql` | yes — see `togo-migrate` |
| Queries | `internal/db/queries/*.sql` | **yes — this is where SQL lives** |
| Generated query code | `*.gen.go` | **never** |
| Handlers | `internal/api/` | yes |
| Business logic | `internal/actions/` | yes |
| Seeders / factories | `internal/db/seeders/`, factories | yes |
| Frontend | `web/` | yes |

## The SQL rule

**All SQL lives in query files.** togo *is* sqlc + Atlas + an ORM; it exists so that
your queries are type-checked against the real schema at generate time and your
handlers get typed structs instead of `interface{}`.

So:

- Write the query in `internal/db/queries/<resource>.sql` with the sqlc annotations
- Run `togo generate`
- Call the generated method from the handler

Do **not** hand-write SQL strings inside a handler, an action, or a job. A query string
in Go code is a query nothing type-checks, nothing regenerates, and no one finds when
the column is renamed. If you catch yourself writing `db.Query("SELECT …")`, the query
belongs in a query file.

Do **not** hand-edit the generated `*.gen.go` to add a method. Add the query, regenerate.

## Frontend

`web/` is the frontend and it **must never open a database connection**. It talks to
`{{api_base}}` over HTTP, and to nothing else. A `pg` import under `web/` is a bug
regardless of how convenient the server component made it look. See `data-fetching`.

## Checklist for a new resource

- [ ] `togo make:resource <Name> <fields>` (or the three-step flow)
- [ ] Review the generated migration — the generator's guess at types, nullability, and
      indexes is a starting point, not a decision. Fix it now, before it is applied.
- [ ] Add the real queries to `internal/db/queries/<name>.sql` (the generated CRUD is
      rarely the whole story)
- [ ] `togo generate`
- [ ] `togo migrate`
- [ ] Add authorization to the handler — the generated handler is not authorized by
      default. togo's `Can()` is an **exact string match**, so a permission value of
      `"*"` matches only the literal permission `"*"` and therefore denies everything.
      Grant the concrete permission strings.
- [ ] `togo make:seeder <Name>` / `togo make:factory <Name>` so tests and demos have data
- [ ] `togo make:test <Name>` and `togo make:e2e <Name>`
- [ ] `verify` — including the OpenAPI probe, which is how you confirm the routes
      actually registered

## Hard refusals

- Hand-editing `*.gen.go`
- SQL strings outside `internal/db/queries/`
- `CREATE TABLE` / any DDL executed from service code
- A database connection under `web/`
- Committing a `make:*` result without running `togo generate`

## Related

- `togo-generate` — the codegen pipeline in detail
- `togo-migrate` — schema changes and the DDL ban
- `data-fetching` — how `web/` consumes the endpoints you just generated
- `verify` — the gate
