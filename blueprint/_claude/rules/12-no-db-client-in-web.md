---
description: "No database client, driver, or ORM may be imported anywhere under web/. The forbidden-import list is machine-readable and enforced; the frontend reaches data over HTTP only."
globs: "web/**/*.ts,web/**/*.tsx,web/**/*.js,web/**/*.jsx,web/**/*.go"
alwaysApply: true
---

# Rule 12: No Database Client in `web/`

**Nothing under `web/` may import a database driver, a database client SDK, or an ORM. The authoritative list lives in `.claude/forbidden-imports.json` and is enforced mechanically.**

## The Rule

Rule 11 states the boundary; this rule is the executable form of it. `web/` is the frontend
surface ({{surfaces}}). It renders, routes, and calls `{{api_base}}` over HTTP. It has no
database identity, no connection string, and no credentials — so it must have no client
capable of using them.

### The list is data, not prose

The blocked set is not maintained in this file. It is maintained in:

```
.claude/forbidden-imports.json
```

```json
{
  "$comment": "Imports that may never appear under the given roots. Enforced by hooks and review.",
  "rules": [
    {
      "id": "no-db-in-web",
      "roots": ["web/"],
      "reason": "web/ has no database identity. Reach data over HTTP at {{api_base}}. See Rule 11, Rule 12.",
      "deny": {
        "js": [
          "pg", "pg-promise", "postgres", "mysql", "mysql2", "sqlite3", "better-sqlite3",
          "mongodb", "mongoose", "ioredis", "redis",
          "knex", "kysely", "drizzle-orm", "typeorm", "sequelize", "@prisma/client",
          "@supabase/supabase-js", "@planetscale/database", "@neondatabase/serverless",
          "@vercel/postgres", "firebase-admin"
        ],
        "go": [
          "database/sql",
          "github.com/jackc/pgx/v5",
          "github.com/lib/pq",
          "github.com/go-sql-driver/mysql"
        ],
        "patterns": [
          "**/internal/db/**",
          "**/internal/db/gen/**"
        ]
      }
    }
  ]
}
```

Extending the list is a normal change; **shrinking it is a rule change** and needs the operator's
explicit agreement. If a new driver appears in the ecosystem, add it — do not wait to be
attacked by it.

### Blocked call patterns

Package names are the coarse filter. These call shapes are blocked regardless of how the
symbol was obtained (dynamic `import()`, re-export, aliased helper):

```typescript
new Pool({ connectionString: ... })     // any pooled connection from the browser
sql`SELECT ...`                          // tagged-template SQL in frontend code
prisma.user.findMany()                   // ORM query from the frontend
supabase.from('...')                     // client SDK reading tables directly
db.query(...) / db.execute(...)          // anything named like a database handle
```

Also blocked, because they are the same violation wearing a disguise:

- A connection string, DSN, or database password in any `web/` file, `.env` consumed by the
  frontend build, or any variable with a client-exposed prefix (`VITE_*`, `NEXT_PUBLIC_*`).
  Bundler-exposed variables are shipped to the browser verbatim — see Rule 16.
- A server-side route inside `web/` that opens its own pool to "avoid a round trip". If a
  server surface needs data, it calls `{{api_base}}` like every other caller.
- A Go file anywhere under `web/`. `web/` is not a Go tree; a `.go` file there is either a
  boundary violation or a misplaced file.

## Correct pattern

```typescript
// web/src/lib/api.ts — one client, typed off the generated OpenAPI contract
const posts = await api.get<Post[]>('/posts')
const created = await api.post<Post>('/posts', { title, body })
```

Need a field the API does not return? The path is fixed and runs through the generators
(Rule 10): `internal/db/schema/*.sql` → `internal/db/queries/*.sql` → `togo generate` →
handler → `togo generate` again → consume the new contract in `web/`. It is four steps and it
is never worth skipping.

## Why this rule exists — concrete cost

A database client in `web/` is not a style problem, it is a credential-distribution problem.
Frontend bundlers inline anything reachable at build time; a driver in the import graph means
the connection string is in the import graph, and a connection string in a browser bundle is
public. It cannot be revoked quietly — rotating it takes the application down until every
surface is redeployed.

It also duplicates the data layer. Once `web/` can query, some queries live in
`internal/db/queries/*.sql` where sqlc type-checks them against the schema, and others live in
TSX where nothing does. A column rename then breaks the untyped half silently, at runtime, in
front of a user — which is precisely the failure mode the generator pipeline exists to make
impossible.

This blueprint has not yet suffered that failure; the rule is inherited from an estate that
did, and it ships pre-armed rather than waiting to earn its teeth here.

## Enforcement

- `.claude/forbidden-imports.json` is the source of truth. Read it before adding any dependency
  to `web/package.json`.
- Before approving a frontend change, grep the diff for the `deny` entries. A hit is a review
  blocker, not a discussion.
- A new `web/` dependency whose description mentions a database, a driver, or an ORM requires
  the operator's explicit approval, and an entry in the JSON either way (allowed with a reason,
  or denied).
- Any `.go` file under `web/` is an automatic reject.
- Any connection string, DSN, or password in a `web/`-reachable file is a Rule 16 security
  finding as well as a Rule 12 violation — log it in `.security/findings.md`.
