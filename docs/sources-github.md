# Sources: a GitHub repository

A **source** is knowledge an agent should have but cannot read for itself. This
one reads a GitHub repository's README, docs, ADRs and recent commit subjects
into the brain, so that an agent can answer "what does this service do?" without
anyone pasting the README into a prompt.

It lives in `internal/sources`. `sources.go` is the registry every source kind
plugs into; `github.go` is the first kind.

## Configuring one

```json
{
  "owner": "acme",
  "repo": "widget",
  "branch": "",
  "include": ["README*", "docs/**", "**/adr/**"],
  "exclude": ["docs/generated/**"],
  "readIssues": false,
  "tokenRef": "github-token",
  "maxFileBytes": 131072,
  "maxCommits": 50,
  "apiBase": "https://api.github.com"
}
```

Every field except `owner` and `repo` is optional.

- **`branch`** empty resolves the repository's default branch. Defaulting to
  `main` instead would be wrong for every repository older than 2020.
- **`include`** defaults to `README*`, `docs/**`, `**/adr/**`, `**/decisions/**`,
  `ARCHITECTURE*`, `CONTRIBUTING*`. Globs are gitignore-style: `**` crosses path
  separators, a pattern with no `/` matches the basename, and matching is
  case-insensitive because repositories contain `README.md`, `readme.md` and
  `Readme.md` in roughly equal measure. An **empty** include list matches
  nothing rather than everything — the other way round, one typo pulls an entire
  monorepo into the brain.
- **`readIssues`** also reads pull requests, which the GitHub issues endpoint
  returns alongside issues. Off by default.
- **`maxFileBytes`** defaults to 128KB and is capped at 1MB, which is where the
  contents API stops returning a file inline anyway.

## The token is never in the config

There is no `token` field, and there will not be one. `tokenRef` holds the
**name** of a vault secret; the value is revealed at fetch time, held in a local
for the length of one `Fetch`, and reaches exactly one destination — an
`Authorization` header. It is never logged, never returned, and never retained.

A config that carries a credential anyway is **rejected at parse time**:

- a field named `token`, `password`, `secret`, `apiKey`, `accessToken`, `pat`,
  `auth` or `authorization` with a non-empty value, even though the struct would
  otherwise discard it silently;
- a `tokenRef` that looks like a value rather than a name — a vendor-prefixed
  key, a JWT, or anything long and high-entropy in a slot meant for a handle an
  operator typed.

Rejecting at configuration time is deliberate. The version that quietly works is
the one that ends up committed to a repository.

The other direction is covered too: text is passed through `Redact` before it is
retained, so a key checked into someone's README does not become a memory an
agent can quote back into a chat reply.

`tokenRef` may be empty, which means unauthenticated. That works for a public
repository at a much lower rate limit.

## Incremental by commit SHA

The cursor is a small JSON object, and the commit SHA in it does all the work:

```json
{"sha": "9dd2350…", "issuesSince": "2026-01-03T03:04:05Z"}
```

- **Unchanged HEAD** — one request to the branch endpoint, then stop. No tree
  listing, no file reads, no writes.
- **Moved HEAD** — `compare/{base}...{head}` gives exactly the files that
  changed, and only those are read.
- **First run** — one recursive tree listing, filtered by the include globs.
- **Unreachable base** (a force-push or rewritten history) — falls back to a full
  read rather than 404ing forever. The full read upserts over what is already
  there, so it costs requests, not duplicates.

`issuesSince` exists because an issue moves without a commit. Its watermark comes
from the newest `updated_at` in the response rather than from the clock, so
nothing is skipped in the gap between the request and the response, and the two
machines never have to agree about the time.

The cursor advances **only after every document has been retained**. Saving
first would turn a transient network error into a permanent hole in the brain.

## Skips

Reported, never silent: "the README never appeared" and "the README was 4MB and
was skipped" are different failures and only one of them is a bug.

- Over `maxFileBytes`. On a first run the size comes from the tree listing, so an
  oversized file is never downloaded at all.
- Binary: an extension check first, because it costs nothing and catches the
  common cases before the download; then a NUL-byte and UTF-8 check on the
  content, because a `.md` file can hold anything and an embedder fed a PNG
  produces a vector that poisons recall for everything near it.
- One unreadable file is skipped rather than failing the refresh — it should not
  cost the other forty.

Deleted and renamed files are reported in `Batch.Removed` rather than acted on.
Invalidating a memory needs a writer identity this package does not have.

## Memory shape

One document, one `source_ref`, stable across refreshes:

```
source:github:acme/widget:README.md
source:github:acme/widget:commits
source:github:acme/widget:issue:7
```

The brain's unique index on `(namespace, source_ref)` turns the second refresh of
the same ref into an `UPDATE`. That is why the commit subjects are **one**
document rather than one per commit: "what has been happening in this repo" stays
a single current answer instead of ten thousand rows that drown out the README in
every recall.

The README is retained at importance 0.9, other documents at 0.6, commits at 0.4,
issues at 0.3.

## What is not wired up yet, and why

`Refresh` takes its `CursorStore`, its `Retainer` and its target namespace from
the caller. Two of those are decisions this package must not make:

1. **Where source rows live.** Config and cursor want a `builder_sources` table.
   That is a new table and therefore a `schema_change`, which is `must_ask` in
   `blueprint/_claude/autonomy.yaml` — and there are already three unmerged
   branches each claiming migration `0010`. So the cursor is an interface with an
   in-memory implementation, and the connector is finished and tested today
   rather than waiting on a migration. A Postgres `CursorStore` is one small
   adapter once the table exists.
2. **Which principal reveals the token.** `vault.Store.RevealFor` takes an agent
   slug, and `builder_secret_grants.agent_slug` has a foreign key to
   `builder_agents(slug)`. An unattended ingester is not an agent, so either it
   becomes a real row with a reveal grant, or the audit trail learns to record a
   non-agent principal. Granting an unattended runner reveal access to a live
   credential widens who can read what, which is an operator's call. The adapter
   shape is spelled out in `internal/sources/wiring_test.go`.

Everything else — the connector, the registry, the globs, the caps, the
redaction — is complete and covered.
