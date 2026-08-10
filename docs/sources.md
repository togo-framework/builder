# How do I feed external knowledge in on a schedule?

A **source** is knowledge an agent should have but cannot read for itself: a
repository's docs, a feed, a Slack channel, a website, a query against a
database. Sources run on a schedule and write into the brain.

Package: `internal/sources/`. Provider: `builder.sources`
(disable with `BUILDER_DISABLE=sources`).

## The kinds

| Kind | File | Registered how |
|---|---|---|
| `github` | `github.go:21-23` | `Register(KindGitHub, newGitHub)` from `init()` |
| `rss` | `rss.go:46-48` | `Register(KindRSS, newRSS)` from `init()` |
| `slack` | `slack.go:18-20` | `Register(KindSlack, newSlack)` from `init()` |
| `crawl` | `crawl.go:21-23` | `Register(KindCrawl, newCrawl)` from `init()` |
| `whatsapp` | `whatsapp.go:17-19` | `Register(KindWhatsApp, newWhatsApp)` from `init()` |
| `sql` | `sql.go` | **Not registered.** Special-cased — see below |

Verified by `grep -n "const Kind\|Register(Kind" internal/sources/*.go`.

### `sql` is not a plugin kind

`sql.go` defines no `KindSQL` constant and calls no `Register`. It is handled
inline: `sources.go:237` switches on the literal `"sql"`, `service.go:173`
accepts it as a valid kind alongside the registered plugins
(`!isPlugin(in.Kind) && in.Kind != "sql"`), and `service.go:72` appends it to
the advertised kind list.

The boot log reflects the same split:

```go
k.Log.Info("builder.sources running", "kinds", strings.Join(append(sources.Kinds(), "sql"), ", "))
```

`providers.go:360`. So `sources.Kinds()` returns the five registered kinds and
`sql` is appended by hand. **If you enumerate kinds programmatically, do not use
`sources.Kinds()` alone — you will miss `sql`.**

## Credentials are never in the config

No source config carries a secret value. It carries the **name** of a vault
secret — `tokenRef` for GitHub, `DSNSecret` for SQL — and the value is revealed
at fetch time, held in a local for the length of one call, and reaches exactly
one destination. It is never logged, never returned, never retained.

A config that carries a credential anyway is **rejected at parse time**: a field
named `token`, `password`, `secret`, `apiKey`, `accessToken`, `pat`, `auth` or
`authorization` with a non-empty value, or a `tokenRef` that looks like a value
rather than a handle (a vendor-prefixed key, a JWT, anything long and
high-entropy).

Rejecting at configuration time is deliberate: the version that quietly works is
the one that ends up committed to a repository.

The other direction is covered by `Scrub` (`scrub.go`) and the brain's `Redact`,
so a key checked into someone's README does not become a memory an agent can
quote back into a chat reply.

## The `sql` kind and its guard

A `sql` source runs a query against a database and renders the result into one
memory. It is guarded hard (`guard.go`):

- **`SELECT` only.** Anything else is rejected by name:
  `only SELECT is allowed; this query starts with %q`.
- **One statement.** `only a single statement is allowed; found more than one`.
- Empty queries, queries over 20 000 characters, unterminated `/*` comments,
  unterminated string literals and `E''` escape strings are all rejected.

Caps (`sql.go:20-29`):

| Constant | Value | Why |
|---|---|---|
| `DefaultMaxRows` | 200 | |
| `MaxMaxRows` | 5000 | |
| `DefaultTimeoutMS` | 10 000 | |
| `MaxTimeoutMS` | 60 000 | |
| `MaxRenderedBytes` | 8192 | The rendered text is one memory an agent pastes into context on every recall. Past a few KB it stops being a fact and starts being a document that crowds out everything else |

A source exists to answer a question in one paragraph. A query that wants more
than this wants a dashboard, not a memory.

`DSNSecret` holds the **name** of a vault secret containing the connection
string — never the connection string. A source row is ordinary table data: it is
in every backup and readable by anything with `SELECT` on the table.

## Per-kind configuration

Only GitHub has a full write-up so far: [`sources-github.md`](sources-github.md)
— config fields, glob semantics, incremental-by-commit-SHA cursor behaviour,
skip reporting, and memory shape.

The general patterns it documents apply to the other kinds:

- The cursor advances **only after every document has been retained**. Saving
  first turns a transient network error into a permanent hole in the brain.
- Skips are reported, never silent. "The README never appeared" and "the README
  was 4MB and was skipped" are different failures and only one of them is a bug.
- One `source_ref` per logical document, stable across refreshes, so the second
  refresh is an `UPDATE` rather than a duplicate row.

`registry.go:155` builds the ref: `"source:" + kind + ":" + name + ":" + ref`.

## HTTP

Mounted at `/api/builder/sources` (`providers.go:356`).

## Scheduling and wiring status

`scheduler_live_test.go` and `wiring.go` carry the scheduler. Note that
[`brain-provenance.md`](brain-provenance.md) records an important discrepancy:
`builder_sources`, `builder_source_items` and `builder_source_runs` exist in the
`builder_dev` database but **appear nowhere in the repository's migrations**.
They were applied directly and never committed, so a fresh install does not have
them. Read that file before assuming the source tables exist on a new database.
</content>
</invoke>
