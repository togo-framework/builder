---
description: "Go code uses sqlc-generated methods and the togo ORM. Hand-written SQL outside internal/db/queries and internal/db/schema is banned. Explicit errors, no panic, %w wrapping, slog only, thin handlers and fat queries."
globs: "**/*.go"
alwaysApply: false
---

# Rule 13: Go Conventions

**Go code in {{project_name}} never contains a SQL string. Queries live in `internal/db/queries/*.sql` and reach Go through sqlc; everything dynamic goes through the togo ORM.**

## ⚠ This rule inverts its ancestor — read this first

This rule descends from an ancestor-estate rule that said the opposite: *"Raw SQL only via pgx.
No ORM — no GORM, no sqlx struct scanning magic, no query builders."* That rule was correct
**for that codebase**, which had a hand-rolled Go bridge, no code generation, and no schema
declaration. There, an ORM would have been an unaudited layer over a database nobody else
controlled, so the safest thing was raw, reviewable, parameterized SQL at every call site.

togo has the opposite shape. togo **is** sqlc + Atlas + an ORM. The schema is declared, sqlc
type-checks every query against it at generate time, and the ORM validates columns, operators,
and `ORDER BY` against an allowlist while always parameterizing values. Under togo, a
hand-written SQL string is the unaudited layer: it bypasses the type check, bypasses the
allowlist, and bypasses the schema.

**So the ancestor's ban is inverted, and its reason is preserved.** Both rules say the same
thing underneath: *use the layer that the schema can verify, and never the one it cannot.*

## SQL

### Where SQL may live — an exhaustive list

| Path | Contents |
|---|---|
| `internal/db/schema/*.sql` | DDL. Applied by `togo migrate`. Nothing else may contain DDL. |
| `internal/db/queries/*.sql` | Named queries with sqlc annotations. The only place statements are written. |
| `internal/graph/*.graphqls` | GraphQL schema fragments (not SQL, but the same "declared input" category). |

Anywhere else — handlers, actions, services, plugin bootstraps, tests, seeders — SQL strings
are banned.

```sql
-- internal/db/queries/post.sql  — CORRECT
-- name: ListPostsByAuthor :many
SELECT id, title, body, created_at
FROM posts
WHERE author_id = $1
ORDER BY created_at DESC
LIMIT $2;
```

```go
// CORRECT — sqlc-generated, type-checked against the schema at generate time
posts, err := q.ListPostsByAuthor(ctx, db.ListPostsByAuthorParams{
    AuthorID: authorID,
    Limit:    limit,
})
if err != nil {
    return nil, fmt.Errorf("list posts by author %s: %w", authorID, err)
}
```

```go
// CORRECT — dynamic filtering via the togo ORM.
// Columns, operators and ORDER BY are allowlist-validated; values are always parameterized.
posts, err := models.Posts(app).
    Where("title", "ILIKE", "%"+term+"%").
    Order("created_at DESC").
    Get(ctx)
```

```go
// WRONG — hand-written SQL in Go. sqlc never saw it, the schema never verified it.
rows, err := pool.Query(ctx, `SELECT id, title FROM posts WHERE author_id = $1`, authorID)

// CATASTROPHICALLY WRONG — interpolation. See Rule 16.
rows, err := pool.Query(ctx, fmt.Sprintf("SELECT * FROM posts WHERE title = '%s'", term))

// WRONG — DDL from service code. This is what togo's own auth and autopilot
// plugins do; do not follow them. Schema belongs in internal/db/schema/.
_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS sessions (...)`)
```

### The one narrow exception

A genuinely un-generatable statement — a database-specific maintenance command, an extension
setup step — may be executed from Go **only** with an inline comment naming why sqlc and the
ORM cannot express it, and only from a clearly-scoped admin or migration path. It is never a
request-path query. If you are writing this comment more than once a quarter, the schema is
wrong.

## Error handling

Unchanged from the ancestor, and non-negotiable:

- **Handle every error explicitly.** No `_` on an error return, ever.
- **No `panic()`.** Return errors up the call stack. A panic in a request handler takes down
  the goroutine and tells the caller nothing.
- **Wrap with context using `%w`:** `fmt.Errorf("list posts: %w", err)`. `%v` destroys the
  chain and breaks `errors.Is` / `errors.As` for every caller above you.
- Compare with `errors.Is` / `errors.As`, never by string matching on the message.
- Errors returned to a client are generic; the detail goes to the log (Rule 16).

## Logging

- **`slog` only** — not `log`, not `fmt.Println`, not `logrus`, not `zap`.
- Structured key/value attributes, never formatted prose: `slog.Error("list posts failed",
  "author_id", id, "err", err)`.
- JSON output in production, text in development.
- Attach request context once: `slog.With("method", r.Method, "path", r.URL.Path,
  "request_id", rid)`.
- **Never log secrets, tokens, full auth headers, or password fields** — not even at debug.

## Structure

- **Thin handlers** — parse the request, authorize, call the query or action, write the
  response. A handler with branching business logic belongs in `togo make:action`.
- **Fat queries** — all SQL in `internal/db/queries/`, organized by domain, one file per
  resource (`post.sql`, `user.sql`).
- **Actions hold business logic** — reusable, callable from REST handlers and GraphQL
  resolvers alike, so the two surfaces cannot drift.
- **Middleware chain** — CORS → request logging → auth → handler. Authorization is per-handler
  (Rule 16), not assumed from the chain.
- **Plugins self-register** — `init()` + `togo.RegisterProviderFunc(name, priority, fn)`.
  Never wire a plugin in by hand; the registry is generated (Rule 11).
- **Graceful shutdown** — `context.WithCancel` propagates to every goroutine; in-flight
  requests drain before exit.
- **Context first** — `ctx context.Context` is the first parameter of every function that
  performs I/O, and it is the caller's context, never `context.Background()` in a request path.
- **Never edit `*.gen.go`** (Rule 11).

## Why this rule exists — concrete cost

The cost is the loss of the only check that exists. sqlc compiles `internal/db/queries/*.sql`
against `internal/db/schema/*.sql` during `togo generate`: a typo'd column, a dropped table, or
a type mismatch fails at generate time, on your machine, in seconds. A SQL string in a `.go`
file is invisible to that check — it is just bytes to the compiler — and the same typo fails
at runtime, on a user's request, in production. Every hand-written query is a query that opted
out of the one gate the framework provides.

The dynamic case is worse. The togo ORM validates column names, operators, and `ORDER BY`
inputs against an allowlist and parameterizes all values, because those are exactly the inputs
an attacker reaches for. Hand-assembled dynamic SQL re-implements that defense from scratch at
every call site, and it only has to be forgotten once. `fmt.Sprintf` into a query is not a
style violation; it is the injection.

The `%w` and `panic()` rules earn themselves the first time an incident is debugged from logs:
an error wrapped with `%v` arrives at the top of the stack as a string with no type and no
cause, so the handler cannot distinguish "not found" from "database down", and neither can you
at 3am.

## Enforcement

- **Grep the diff for SQL keywords in `.go` files**: `SELECT `, `INSERT INTO`, `UPDATE `,
  `DELETE FROM`, `CREATE TABLE`, `ALTER TABLE`, `DROP `. Any hit outside a comment is a review
  blocker unless it carries the documented exception comment.
- **Grep for `fmt.Sprintf` within five lines of a query call.** Zero tolerance — this is a
  security finding, log it in `.security/findings.md` (Rule 16).
- The `guard-direct-ddl` hook blocks DDL outside `internal/db/schema/`.
- `go vet ./...` and the project linter must pass before done. `errcheck`-class findings are
  not advisory.
- A new query means: edit `internal/db/queries/*.sql` → `togo generate` → confirm the `sqlc`
  step reported success (Rule 10 — a soft-fail warning means it never ran).
