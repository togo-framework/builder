# Security findings

The register of what this codebase gets wrong, and whether it is fixed. Every
finding gets a row, **including ones fixed in the same change** — silently
fixing teaches nobody, and the next person to touch the area needs the history.

Never delete a row. Close it.

| ID | Date | Severity | Area | Summary | Status | Fixed in |
|----|------|----------|------|---------|--------|----------|
| SF-001 | 2026-08-12 | High | vault / connections | Every credentialed source is denied its secret by a foreign-key impossibility. See below. | **OPEN — human-only** | — |

<!-- Status: OPEN | MITIGATED | FIXED | VERIFIED | ACCEPTED (needs operator sign-off) -->

---

## SF-001 — a source can never be granted the secret it needs

**Status:** OPEN. `security`-labelled, therefore human-only (Rule 33). Drafted by
an agent, **not** to be fixed by one.

**Severity:** High. Not a disclosure — an authorization path that cannot succeed.
The blast radius is "the feature has never worked", not "data leaked".

### What is broken

Two independently reasonable decisions that are incompatible.

`internal/sources/wiring.go:37-39` reveals a secret as the *source itself*:

```go
func (s sourceSecrets) Reveal(ctx context.Context, name string) (string, error) {
	return s.v.RevealFor(ctx, name, "source:"+s.kind+":"+s.name, s.runID)
}
```

The reasoning above it is sound — a scheduled refresh has no agent behind it, and
filing every source's secret reads under an empty slug would be exactly the audit
record you do not want.

`internal/vault/api.go:339-345` then checks that principal against the grants
table:

```go
if err := s.db.QueryRowContext(ctx,
	`SELECT can_reveal FROM builder_secret_grants
	  WHERE secret_id=$1 AND agent_slug=$2 AND (expires_at IS NULL OR expires_at > now())`,
	id, agentSlug).Scan(&canReveal); err != nil || !canReveal {
```

And `db/migrations/0001_builder_init.sql:567-579` constrains that column:

```sql
CREATE TABLE builder_secret_grants (
    secret_id  uuid NOT NULL REFERENCES builder_secrets(id) ON DELETE CASCADE,
    agent_slug text NOT NULL REFERENCES builder_agents(slug) ON DELETE CASCADE,
    ...
```

`agent_slug` is a **foreign key to `builder_agents(slug)`**. A grant for
`source:slack:C0123456789` requires an *agent* with that slug. Nothing creates
one, and nothing should — it is not an agent.

So the grant cannot be inserted, the lookup always fails, and `RevealFor` takes
the deny branch: it writes `outcome='denied'` to `builder_secret_reads` and
returns `agent %s may not reveal %q`.

### Consequence

**Every source that needs a credential has never once authenticated.** Slack,
WhatsApp, and private GitHub are all on this path. The failure is silent in the
shape that matters: it looks like a credential problem, so the natural response
is to re-enter a token that was always correct.

Note `internal/sources/sql.go:44-52` gets this right by contrast — it reveals as
`cfg.RunAs`, a real agent slug the operator picks, and its comment documents the
FK explicitly. The SQL source works. The `wiring.go` path does not.

### Reproduction

```sql
-- Against a builder database with at least one secret.
INSERT INTO builder_secret_grants (secret_id, agent_slug, can_reveal)
SELECT id, 'source:slack:C0123456789', true FROM builder_secrets LIMIT 1;
-- ERROR: insert or update on table "builder_secret_grants" violates
--        foreign key constraint ... Key (agent_slug)=(source:slack:C0123456789)
--        is not present in table "builder_agents".
```

Then, from the application side, any credentialed source refresh:

```sql
SELECT agent_slug, outcome, count(*) FROM builder_secret_reads
 GROUP BY 1,2 ORDER BY 3 DESC;
-- every `source:*` principal is 'denied', with no 'ok' rows at all.
```

### Candidate fixes — for a human to choose between

1. **Widen the principal.** Introduce `builder_principals` (agents ∪ sources ∪
   future connections) and repoint the FK at it. Keeps the audit trail honest —
   a source reads as itself — at the cost of a migration and a new table.
2. **Give each source a real agent row.** Materialise `source:<kind>:<name>` into
   `builder_agents` when a source is created. Cheaper, no schema change, but it
   pollutes the agent roster with things that are not agents and will confuse
   every screen that lists agents.
3. **Reveal as a configured `RunAs`,** exactly as `sql.go` already does. No
   schema change at all, and it makes the human grant explicit per source. Costs
   the "a source reads as itself" property that `wiring.go` was protecting, and
   requires a UI field.

Option 3 is the smallest and matches existing precedent in the same package;
option 1 is the one that stays right when connections land (see the FeedbackOS
plan — `Connector`/`Ingestor`/`Actor` multiplies the number of non-agent
principals). This is a design call with a migration attached, which is why it is
not an agent's to make.

### Blocks

The `Actor` half of connections — posting to Slack/Discord/Telegram/WhatsApp,
sending email — is downstream of this. `internal/sources/slack.go:158-165`
already declines to implement outbound for the adjacent reason: it needs "a
writer identity — whose name it sends as, and whose grant authorizes the post —
that this package does not have."
