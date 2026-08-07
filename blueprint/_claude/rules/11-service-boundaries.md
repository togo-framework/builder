---
description: "web/ never opens a database connection, and nobody hand-edits *.gen.go. The Go API is the only thing that touches the database; the generators are the only thing that writes generated code."
globs: "*"
alwaysApply: true
---

# Rule 11: Service Boundaries — the API Owns the Database, the Generators Own Generated Code

**Two boundaries, no exceptions: `web/` never opens a database connection, and no human or agent edits a `*.gen.go` file.**

## The Rule

{{project_name}} is a togo monolith, not a distributed system, so there is no network hop to
police. The boundaries are therefore *ownership* boundaries, and they are easier to violate
precisely because nothing physically stops you.

### Boundary 1 — the database is reachable only from the Go API

| Concern | Owner | Never |
|---|---|---|
| SQL queries | `internal/db/queries/*.sql` (compiled by sqlc) | Anywhere else |
| Schema / DDL | `internal/db/schema/*.sql`, applied by `togo migrate` | Service code, plugin `init()`, handlers |
| Query execution | Go: sqlc-generated methods and the togo ORM | `web/` |
| Connection pool / credentials | The Go process, from the server environment | The browser bundle |
| HTTP/GraphQL request handling | `internal/rest`, `internal/graph` | `web/` |
| Rendering, routing, client state | `web/src` | The Go API |

`web/` reaches the data exactly one way: HTTP to `{{api_base}}`, against the contract that
`togo generate`'s OpenAPI export produced. If the frontend needs a field, the path is
schema → query → handler → regenerate → consume. It is never "just query it directly".

**Corollary — no DDL from service code.** togo's own `auth` and `autopilot` plugins currently
create their tables with `CREATE TABLE IF NOT EXISTS` at startup. That is the single most-copied
mistake in this ecosystem, and it is wrong: it puts schema outside `togo migrate`, makes the
declared schema a lie, and produces a database whose shape depends on which plugins happened
to boot. Copy the plugin's registration pattern; do not copy its bootstrap DDL.

### Boundary 2 — generated code is written by generators only

Generated artifacts in a togo project include:

- `internal/plugins/plugins.gen.go`
- `internal/rest/registry.gen.go`
- `internal/db/seeders/registry.gen.go`
- everything under `internal/db/gen/` (sqlc)
- gqlgen's generated models and resolver scaffolding

Any file matching `*.gen.go`, and anything sqlc or gqlgen emits, is **output**. Editing it is
writing into a build artifact. The change survives until the next `togo generate` — which,
given the workflow in Rule 10, is usually the next task.

To change generated code, change its *input*: `togo.resources.yaml`, a schema file, a query
file, a `.graphqls` fragment — then re-run `togo generate`.

### Plugins register themselves; nothing wires them by hand

Plugins self-register. The pattern is fixed:

```go
func init() {
    togo.RegisterProviderFunc("myplugin", priority, newMyPlugin)
}
```

`init()` + `togo.RegisterProviderFunc(name, priority, fn)` — that is the whole contract. The
registry that collects these is `internal/plugins/plugins.gen.go`, which is generated. If a
plugin is not loading, the fix is its `init()` or its import, never a manual entry in the
registry.

## Red Flags (review blockers)

**Any Go database import under `web/`** — there should be no Go under `web/` at all, but the
import list is the tell:

```go
// NEVER anywhere under web/
import "database/sql"
import "github.com/jackc/pgx/v5"
import ".../internal/db/gen"        // sqlc output
import ".../internal/db/queries"
```

**Any JS/TS database driver in the frontend bundle** — same boundary, other language:

```typescript
// NEVER in web/src/ or web/app/
import { Pool } from 'pg'
import postgres from 'postgres'
import mysql from 'mysql2'
import { PrismaClient } from '@prisma/client'
import knex from 'knex'
```

**Any edit to a generated file:**

```
web/…                       ← a *.gen.go file has no business existing here
internal/rest/registry.gen.go   ← modified by hand
internal/db/gen/…               ← modified by hand
```

**Any DDL outside `internal/db/schema/`:**

```go
// NEVER — this is what togo's auth and autopilot plugins do; do not follow them
db.Exec(`CREATE TABLE IF NOT EXISTS sessions (...)`)
```

## Correct patterns

```typescript
// web/src — talk to the API, typed off the generated OpenAPI contract
const posts = await api.get<Post[]>('/posts')
```

```go
// internal/rest — thin handler, query already compiled by sqlc
posts, err := h.q.ListPosts(ctx, arg)
if err != nil {
    return fmt.Errorf("list posts: %w", err)
}
```

## Why this rule exists — concrete cost

Both halves of this rule have a cost that is already visible in the ecosystem.

**The generated-code half** is deterministic loss: `togo generate` overwrites `*.gen.go` and
`internal/db/gen/` wholesale. A hand-patched registry that makes the build green today is gone
after the next `make:resource`, and the failure surfaces as a mysterious regression in someone
else's task — the code that "used to work" was never in a file that persists.

**The DDL half** is demonstrated by togo itself. The `auth` and `autopilot` plugins both create
tables with `CREATE TABLE IF NOT EXISTS` during startup. The consequences are structural, not
hypothetical: the declared schema in `internal/db/schema/` no longer describes the database, so
`togo migrate` and Atlas diffing both reason about a fiction; the live shape depends on plugin
load order and on which plugins are enabled in that environment; and `IF NOT EXISTS` silently
skips when the table exists with the *wrong* columns, so a schema change lands in one
environment and not another with no error anywhere. Every project scaffolded from this
blueprint inherits those plugins as a template — which is exactly why the rule is stated
before anyone reads their source.

**The `web/`-to-database half** has not yet bitten this blueprint, and its cost here is
prospective: database credentials in a bundle that ships to browsers, and a data layer with two
entrances of which only one is authorized.

## Enforcement

- Grep `web/` for `database/sql`, `pgx`, `internal/db`, and the JS drivers above before
  approving any frontend change. Rule 12 mechanizes this via `.claude/forbidden-imports.json`.
- Treat a `*.gen.go` path in a diff as an automatic review blocker. Ask what input produced it.
- The `guard-direct-ddl` hook blocks `CREATE TABLE` / `ALTER TABLE` / `DROP` in any Go or TS
  file. If it fires on plugin bootstrap code, the plugin is wrong — move the DDL to
  `internal/db/schema/`.
- When adding a plugin, verify registration is `init()` + `togo.RegisterProviderFunc(...)` and
  that no file was edited to "hook it up".
