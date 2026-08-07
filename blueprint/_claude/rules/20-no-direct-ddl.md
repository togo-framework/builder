---
description: "All DDL flows through the declared Atlas schema and generated migrations — never from a live console, never from service or plugin code at runtime."
globs: "*"
alwaysApply: true
---

# Rule 20: No Direct DDL — Schema Changes Only Through the Declared Schema

**Every `CREATE / ALTER / DROP` of a table, index, view, materialized view, function, type, enum, policy, or schema in `{{project_name}}` flows ONLY through `db/atlas/schema/` → `togo db migrate:diff` → `db/atlas/migrations/` → `togo migrate`. No console, no editor, no `psql -c`, and — the one this blueprint cares about most — no `CREATE TABLE IF NOT EXISTS` executed by a running binary.**

## The Rule

### Forbidden, no exceptions

| Path | Why it's blocked |
|---|---|
| `psql <remote-url> -c "CREATE\|ALTER\|DROP ..."` against any env in `{{env_matrix}}` | Bypasses migration history; live state diverges from `db/atlas/` |
| `kubectl exec <db-pod> -- psql -c "CREATE\|ALTER\|DROP ..."` | Direct DDL on the live volume, no audit trail |
| A hosted-Postgres web SQL editor → "Run"/"Save" | Looks safe; silently bypasses `db/atlas/migrations/` |
| pgAdmin / TablePlus / DataGrip SQL editor against a non-local DB | Same |
| An MCP `execute_sql` / `apply_migration` tool pointed at a live DB | Same — the tool is not the sanctioned runner |
| **Runtime `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` from Go plugin or service code** | **See "The togo-specific clause" below — this is the violation you will actually commit** |
| Hand-authored SQL files dropped into `db/atlas/migrations/` | Migrations are *generated* by `togo db migrate:diff`. See Rule 23. |
| `CREATE SCHEMA` for an app module | The app owns exactly one schema. Prefix table names instead. |

### Allowed

- **Read-only SQL** through any tool: `SELECT`, `\dt`, `\d+`, `EXPLAIN`, `\di`.
- **Local DDL against `$LOCAL_DATABASE_URL`** as a scratchpad — *provided* the same change is expressed in `db/atlas/schema/` and lands as a generated migration before the work merges. Local hacking is a notepad, never a deploy path.
- **`togo make:model` / `togo make:migration` / `togo make:resource`** — these author the `db/atlas/schema/*.hcl` for you. This is the front door.
- **`togo db migrate:diff`** — the only sanctioned way to produce a migration file.
- **`togo migrate`** — the only sanctioned way to apply one.

## The togo-specific clause: no runtime DDL from plugin code

**A plugin must never create its own tables at boot.**

togo plugins self-register with `init()` + `togo.RegisterProviderFunc(name, priority, fn)`. That makes it trivially easy — and superficially reasonable — for a plugin to run `CREATE TABLE IF NOT EXISTS` in its provider constructor so it "just works" when someone enables it. In a microkernel where every plugin can self-register, this is the single most likely violation of this rule, and it is already present upstream:

```
togo/auth/auth.go            → CREATE TABLE IF NOT EXISTS
togo/auth/pat.go             → CREATE TABLE IF NOT EXISTS
togo/auth/mfa.go             → CREATE TABLE IF NOT EXISTS
togo/auth/session_stores.go  → CREATE TABLE IF NOT EXISTS
togo/autopilot/autopilot.go  → CREATE TABLE IF NOT EXISTS
```

Those are upstream framework files, not yours; you inherit them, you do not copy them. **Do not treat them as precedent.** In `{{project_name}}`, a plugin that needs a table:

1. Ships the table in `db/atlas/schema/<plugin>_<table>.hcl`.
2. Ships its queries in `internal/db/queries/<plugin>.sql`.
3. On boot, **assumes the table exists** and fails loudly if it does not:

```go
// Right: the plugin verifies and refuses to start.
func newProvider(ctx context.Context, app *togo.App) (Provider, error) {
    if err := q.PingSchema(ctx); err != nil {
        return nil, fmt.Errorf("%s: schema not migrated — run `togo migrate`: %w", pluginName, err)
    }
    return &provider{q: q}, nil
}

// Wrong: the plugin silently mutates the database it was handed.
func newProvider(ctx context.Context, app *togo.App) (Provider, error) {
    _, _ = db.Exec(ctx, `CREATE TABLE IF NOT EXISTS widget_sessions (...)`) // Rule 20 violation
    return &provider{}, nil
}
```

Why the loud failure is better: a missing table is a five-second fix (`togo migrate`). A silently self-created table is a schema that exists in production but in no `.hcl` file, in no migration, and in nobody's review — until the next `togo db migrate:diff` proposes to `DROP` it because the declared schema has never heard of it.

## Why this rule exists — concrete cost

Inherited, with the incident, from the estate this blueprint was distilled from. Three years of accreted migrations across two services produced **1,014 migration files plus 2 inline DDL statements buried in application code**, telling three mutually inconsistent stories about what the schema actually was. Nobody could answer "what tables exist?" from the repository. Rebuilding from zero was cheaper than reconciling. The two inline DDL statements — each added as a "temporary" convenience so a service could start on a fresh database — were the hardest to find and the reason the reconciliation was impossible: they had no file, no date, and no author.

The togo variant of that cost is cheaper to incur and more expensive to unwind, because a plugin's `init()` runs on every environment automatically.

## Enforcement

### PreToolUse(Bash) hook
`.claude/hooks/guard-direct-ddl.sh` (registered in `settings.json`) inspects the proposed Bash command and blocks `psql`/`kubectl exec ... psql` invocations carrying `CREATE|ALTER|DROP` against any host that is not `$LOCAL_DATABASE_URL`. Read-only forms and the sanctioned runners (`togo migrate`, `togo db migrate:diff`, `atlas migrate ...`) pass through.

### CI gate
- `togo db migrate:status` — fails if applied migrations do not match `db/atlas/migrations/`.
- `atlas migrate validate` — every PR.
- `atlas migrate diff --dry-run` — fails if `db/atlas/schema/` is ahead of `db/atlas/migrations/` (someone edited the schema and did not regenerate).
- `atlas migrate lint` — flags destructive operations for human review.

### Code-review heuristic
Any PR touching a `.go` file that matches this pattern is blocked pending justification:

```regex
(?i)(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|TYPE|SCHEMA|POLICY)
```

The only tolerated match is in a `_test.go` file that builds and destroys an ephemeral container within the same test. Even there, prefer fixtures over inline DDL.

## Anti-patterns

- **"It's just a missing index, I'll add it via psql and write it up later"** — later never comes. Add it to the `.hcl`, regenerate, apply, verify with `\di`.
- **"My plugin auto-creates its tables so it works out of the box"** — it works out of the box on *your* machine and creates an undeclared table on everyone else's. Declare it.
- **"The editor showed me the SQL, I just hit Save"** — that Save button is the specific trap this rule exists to close.
- **"I need a schema for my new module"** — you need a table-name prefix.

## Related

- Rule 21 — the DML analog: no direct data writes either
- Rule 22 — never wipe a database (what undeclared schema costs you at restore time)
- Rule 23 — never hand-author a migration; change the schema and regenerate
- Rule 28 — verify before closing; a migration is not applied until you have queried it
