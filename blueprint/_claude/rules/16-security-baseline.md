---
description: "Every handler passes the security baseline before it ships: identity from the verified token, explicit per-handler authorization, no string-built SQL, generic error bodies, no secrets in the client bundle, and a CORS allowlist. Findings are logged in .security/findings.md."
globs: "**/*.go,web/**/*.ts,web/**/*.tsx,internal/db/queries/*.sql,internal/db/schema/*.sql"
alwaysApply: true
---

# Rule 16: Security Baseline

**No handler ships until it passes all seven baseline checks, and every violation found — fixed or not — is written to `.security/findings.md`.**

## The Rule

This is a checklist, not a philosophy. Each item is binary and each is checkable from the diff.

### 1. Identity comes from the verified token — never from the request

The authenticated subject is read from the validated token in context. It is never read from a
query parameter, a form field, a JSON body, a path segment, or a client-supplied header.

```go
// CORRECT
user := auth.FromContext(ctx)          // populated by the auth middleware after verification
posts, err := q.ListPostsByAuthor(ctx, user.ID)

// WRONG — IDOR. The caller names the victim and the server complies.
authorID := r.URL.Query().Get("user_id")
authorID := r.FormValue("owner_id")
authorID := chi.URLParam(r, "userID")   // fine as a *lookup target*, never as *identity*
```

A path segment identifying a resource is legitimate. Using it as the identity of the caller is
not. If a handler needs both, it must compare them: the token says who you are, the parameter
says what you asked for, and authorization decides whether those two go together.

### 2. Authorization is explicit, per handler

Authentication middleware proves *who*. It does not answer *may they*. Every handler makes an
explicit authorization decision — ownership, role, or permission — in its own body or in a
route-level guard that names the required permission.

**togo's `Can()` is an exact string match.** This has one consequence that has already bitten
this framework and will bite again:

```go
// permissions = ["*"]           → Can("posts.read") is FALSE. Denies everything.
// permissions = ["posts.*"]     → Can("posts.read") is FALSE. Denies everything.
// permissions = ["posts.read"]  → Can("posts.read") is TRUE.
```

There is no globbing, no wildcard expansion, no prefix matching. `"*"` is not a superuser
grant; it is a permission literally named `*` that nothing ever checks. Grant the exact strings
the handlers check, and enumerate them. Seed roles from the permission constants the handlers
use, so the two cannot drift.

The mirror-image failure is worse than the visible one: a wildcard that *silently denies* is
discovered immediately and fixed. A route group that was assumed to be guarded and is not fails
open, and is discovered by whoever finds it first.

### 3. No SQL built from strings — ever

Covered by Rule 13, restated here because it is the highest-severity item on the list.

```go
// CATASTROPHIC — injection
pool.Query(ctx, fmt.Sprintf("SELECT * FROM posts WHERE title = '%s'", term))
pool.Query(ctx, "SELECT * FROM posts WHERE id = " + id)

// CORRECT — sqlc-generated, parameterized at generate time
q.GetPost(ctx, id)

// CORRECT — togo ORM: columns/operators/ORDER BY allowlisted, values parameterized
models.Posts(app).Where("title", "ILIKE", "%"+term+"%").Get(ctx)
```

`fmt.Sprintf`, `+`, `strings.Join`, or any template anywhere near a query is an automatic
finding. This includes `ORDER BY` and column names taken from user input — the ORM's allowlist
exists precisely because those are the fields people forget cannot be parameterized.

### 4. Error bodies are generic; detail goes to the log

```go
// WRONG — hands the attacker the schema, the driver, and the file layout
http.Error(w, err.Error(), 500)

// CORRECT
slog.Error("list posts failed", "err", err, "request_id", rid)   // full detail, server-side
respond.Error(w, 500, "internal error", rid)                     // generic + correlation id
```

No stack traces, no SQL text, no driver messages, no internal paths, no host names in a
response body. Return a correlation id so support can find the real error in the log.

Authentication and lookup failures return the *same* generic response and the *same* status
for "user not found" and "wrong password" — a distinguishable pair is a user enumeration
oracle.

### 5. No secrets in the client bundle

Anything reachable from `web/` at build time is public. Bundlers inline client-exposed
variables (`VITE_*`, `NEXT_PUBLIC_*`, and any equivalent prefix) verbatim into shipped
JavaScript.

- Client-exposed variables may hold: the API base (`{{api_base}}`), public feature flags,
  public analytics ids. Nothing else.
- API keys, signing secrets, service-account JSON, database URLs, and admin tokens live in the
  server environment, are read only by the Go process, and are never referenced from `web/`.
- No `.env` containing real secrets is committed, for any environment in {{env_matrix}}.
- A secret that reaches a bundle is compromised and must be rotated — not deleted from the next
  build.

Related: `web/` may not import a database client at all (Rule 12).

### 6. CORS is an allowlist

```
Allowed Origins: exactly the origins in {{env_matrix}} for this environment
Allowed Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed Headers: Authorization, Content-Type, X-Request-ID
Credentials:     only when the allowlist is explicit
```

**Never `Access-Control-Allow-Origin: *`.** Never reflect the incoming `Origin` header back
unchecked — that is a wildcard wearing a disguise, and it is worse than a wildcard because it
works with credentials. Localhost origins belong to development configuration only and must
not appear in a production allowlist.

### 7. Every table has an owner and an access decision

Every table added to `internal/db/schema/` must have a documented answer to: *who may read this,
who may write it, and which handler enforces that?* If the database enforces it (row-level
policies), the policy ships in the same schema change. If the application enforces it, the
authorizing handler ships in the same change. "Enforced later" is enforced never.

## Findings registry

`.security/findings.md` ships **seeded empty** with this blueprint:

```markdown
# Security Findings — {{project_name}}

No findings recorded yet. This file is the registry, not a report.

| ID | Date | Severity | Area | Summary | Status | Fixed in |
|----|------|----------|------|---------|--------|----------|

<!-- Status: OPEN | MITIGATED | FIXED | VERIFIED | ACCEPTED (needs operator sign-off) -->
```

Rules for the registry:

- Every baseline violation found gets a row, **including ones you fix in the same change**. The
  registry is the memory of what this codebase gets wrong; silently fixing teaches nobody.
- A finding moves to `VERIFIED` only after the fix is confirmed against a running system, not
  after the code merges.
- `ACCEPTED` requires the operator's explicit agreement, recorded in the row.
- Never delete a row. Close it.

## Why this rule exists — concrete cost

The permission item has already cost this framework real time. Because togo's `Can()` is an
exact string comparison, the intuitive `permissions: ["*"]` — written by everyone who has used
any other authorization library — produces an account that can do *nothing*. The visible cost is
an afternoon of debugging a login that authenticates cleanly and then 403s on every route. The
invisible cost is the fix people reach for next: rather than enumerate the permissions, they
remove the check. A wildcard that fails closed converts, under deadline pressure, into a route
group with no authorization at all.

The remaining items have costs that are well-established rather than locally dated, and are
stated as mechanics, not anecdotes: an identity read from a query parameter is an IDOR by
construction — the request *is* the exploit, and no amount of authentication fixes it. A
`fmt.Sprintf` in a query is not a risk of injection, it is the injection; it merely has not
been sent the right input yet. A verbose error body hands over the schema and the driver
version for free, in a response an attacker is already reading. A secret in a client bundle
cannot be revoked quietly — rotation is an outage. And `Access-Control-Allow-Origin: *` makes
every authenticated user's browser a proxy into the API for any page they visit.

## Enforcement

- **Every new or modified handler** is reviewed against items 1–4 and 7 explicitly. State in
  the progress note which check applies and how it is satisfied — not "auth is handled".
- **Grep the diff** for: `fmt.Sprintf` near a query, `Query().Get("user_id"|"owner_id"|"account_id")`,
  `FormValue(` for identity fields, `err.Error()` written to a response, `Allow-Origin` with
  `*` or a reflected origin, `permissions` containing `"*"`.
- **Grep `web/`** for anything key-shaped: `SECRET`, `TOKEN`, `PASSWORD`, `_KEY`, `postgres://`,
  `mysql://`, a JWT-shaped literal.
- Confirm every new route appears under an authorizing guard, and that the permission strings
  it requires are exactly the strings granted to the roles that need it.
- **Log every finding** in `.security/findings.md` before closing the task, fixed or not.
- If a check cannot be satisfied in this change, say so plainly, open the finding, and do not
  call the task done.
