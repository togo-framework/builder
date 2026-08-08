# vault-secrets — store it once, name it forever, never carry the value

This is the procedure for putting a credential into `internal/vault`, granting an
agent the right to reveal it, and reading it back out — in a system built so the
plaintext touches as few places as possible and every reveal leaves a row behind.

## When to use this

- You're wiring code that needs a credential (API key, DB password, webhook
  secret) and need to decide whether it belongs in `.env` or in the vault.
- An agent's task requires calling an external service and you need to grant it
  `can_reveal` on a specific secret name.
- You're about to write `os.Getenv(...)` for something that looks like a
  per-tenant or per-agent credential rather than boot-time app config.
- You're debugging "agent X can't reveal secret Y" — a 403 from
  `POST /api/builder/vault/secrets/{name}/reveal`, or a `denied` /
  `rate_limited` row in `builder_secret_reads`.
- You're about to log, print, commit, or otherwise move a secret value anywhere
  outside `internal/vault`. Stop and read this first — see Rule 34
  (`.claude/rules/34-secret-handling.md`), which this skill implements.
- Rotating a secret (storing a new version under the same `name`).

## Steps

1. **Decide scope: `project` or `agent`.** A `project` secret (empty
   `agent_slug`) is shared infra — a database URL, a webhook signing key. An
   `agent` secret is scoped to one `agent_slug` in `builder_agents` and only
   that identity's grant row matters. Don't default to `project` for something
   only one agent should ever touch — scope narrows the blast radius of a leak.

2. **Store the secret through the API, never through a migration or a raw
   INSERT.** `handleStore` in `internal/vault/api.go` computes the AAD, calls
   `Service.Seal`, and increments `version` for you — a hand-rolled INSERT will
   skip AAD binding and produce a ciphertext nothing can open correctly.

   ```bash
   curl -X POST "$API/api/builder/vault/secrets" \
     -H 'Content-Type: application/json' \
     -d '{"scope":"agent","agentSlug":"impl-bot","name":"GITHUB_TOKEN","kind":"token","value":"<value>"}'
   ```

   A correct result: HTTP 201 with `{"id":..., "version":1, "hint":"ghp_…7890"}`.
   The response never contains the value you sent — only its `Hint` (from
   `vault.Hint`, e.g. `sk-…a1b2`). If you see the raw value echoed back
   anywhere in a response, log, or PR description, that's a Rule 34 violation —
   stop and report it, don't try to scrub it yourself.

3. **Never type the plaintext into a prompt, a chat message, a commit, or a
   fixture to get it into the vault.** The value goes from the operator's
   terminal (or the vault UI at `web/src/routes/vault.tsx`) straight into the
   `POST /secrets` body. If a task requires you to *know* a secret's value to
   "test" something, that is the `must_ask:` moment in Rule 30 — ask a human to
   store it, don't invent a workaround.

4. **Grant reveal rights explicitly — storing a secret does not grant anyone
   the right to read it back.** `can_reveal` defaults to `false` in
   `builder_secret_grants`; list access (`can_list`) is separate and does not
   imply reveal. This is deliberate: cabrain's vault required WRITE to reveal,
   which let a read-only agent do nothing, or a write-capable one read
   everything. Grant only what's needed:

   ```bash
   curl -X POST "$API/api/builder/vault/secrets/GITHUB_TOKEN/grant" \
     -H 'Content-Type: application/json' \
     -d '{"agentSlug":"impl-bot","canReveal":true,"maxPerRun":3}'
   ```

   Correct result: `{"granted": true}`. `maxPerRun` defaults to 3 if you send 0
   or omit it — set it lower for a secret that should only be touched once per
   run (e.g. a one-shot deploy token).

5. **Reveal from Go code with `Store.RevealFor`, not the HTTP endpoint, when
   you're already in-process** (e.g. inside the runner or orchestrator):

   ```go
   value, err := store.RevealFor(ctx, "GITHUB_TOKEN", agentSlug, runID)
   ```

   This checks `can_reveal` and writes the `builder_secret_reads` audit row in
   the same call path as the decrypt — there is no code path that returns
   plaintext without a matching row. If you're calling over HTTP instead, hit
   `POST /secrets/{name}/reveal` with `{"agentSlug":..., "runId":..., "issueId":...}`
   — passing `runId` lets `max_reveals_per_run` actually rate-limit.

6. **Once revealed, use the value immediately and let it go out of scope —
   never assign it to a struct field, log field, or anything that outlives the
   call.** `web/src/lib/vault.ts` states this explicitly: nothing caches a
   revealed value, because a cached plaintext makes the audit log a lie ("read
   once" while it actually lived in memory for the session). Follow the same
   rule in Go: don't stash the returned string on a long-lived struct.

7. **To check who read what, query the audit trail, not application logs:**

   ```sql
   SELECT s.name, x.agent_slug, x.outcome, x.created_at
     FROM builder_secret_reads x JOIN builder_secrets s ON s.id = x.secret_id
    ORDER BY x.created_at DESC LIMIT 200;
   ```

   or `GET /api/builder/vault/audit`. Every reveal attempt — `ok`, `denied`,
   `rate_limited` — has a row, because `handleReveal` writes the audit insert
   in the same transaction as the decrypt and refuses the reveal if the insert
   fails (`s.log.Error("audit write failed — refusing the reveal", ...)`).

8. **To rotate, `POST /secrets` again with the same `scope`/`agentSlug`/`name`.**
   The store marks the old row `current=false` and inserts a new one with
   `version+1` inside a transaction — old ciphertext stays queryable for audit
   ("what was live when this ran?") but `builder_secrets_current` (the unique
   partial index on `current`) guarantees only one row per identity serves
   reveals. Per Rule 34, rotation is human-only when it's a *response to a
   leak* — an agent may rotate as routine maintenance but must not rotate to
   cover up an incident it just caused; report the incident instead.

9. **If you need a brand-new *config* value that is boot-time app
   configuration rather than a per-agent/per-tenant credential** (e.g. a
   feature flag, a public URL), it does not belong in the vault at all — add
   it to `.env.example` with a placeholder per Rule 34, not as a `project`
   secret. The vault is for things that need a `can_reveal` grant and an audit
   trail; `.env` is for things every deploy needs to see the name of anyway.

## Getting it wrong

- **Bypassing the API to INSERT into `builder_secrets` directly.** This skips
  `Service.Seal`, so you'd need to hand-compute the `v1.<iv>.<tag>.<ct>` format
  and the exact AAD string (`scope:agentSlug:name` — see `vault.AAD`). Get the
  AAD one character off and `Open` fails with the same generic "decrypt
  failed" error as tampering or a wrong key — `Open` deliberately doesn't tell
  you which one, so debugging a hand-rolled insert this way is miserable.
  Always go through `handleStore`.

- **Assuming `can_list` implies `can_reveal`.** It doesn't, and the schema
  comment in the migration spells out why: this is the opposite of cabrain's
  model on purpose. An agent that can see a secret exists (`GET /secrets`,
  which never returns ciphertext or plaintext — only `hint`) still needs an
  explicit `can_reveal` grant to get the value.

- **Forgetting `runId` on reveal calls that need rate-limiting.** Without a
  `RunID` in the reveal request, `handleReveal`'s `used` count query (`WHERE
  secret_id=$1 AND run_id=$2`) never matches anything, so `max_reveals_per_run`
  is silently never enforced for that call. If a secret should only be touched
  N times per run, the caller must pass the run's ID.

- **Treating a `denied` or `rate_limited` outcome as a bug to route around by
  storing a duplicate secret under a new name and granting the new one.** That
  defeats the grant model entirely and leaves two audit trails for one
  credential. Fix the grant (`POST /grant`) instead.

- **Letting a revealed value flow into a log line, a PR body, an issue
  comment, or a test fixture.** This is exactly what Rule 34's redaction
  patterns and `guard-secrets.sh` exist to catch — `sk-[A-Za-z0-9_-]{16,}`,
  `ghp_[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, PEM blocks, connection strings
  with inline credentials, and any `(?i)(secret|token|password|...)`-named
  assignment with a non-placeholder literal ≥ 12 chars. If a hook fires
  "SECRET SHAPE IN TOOL OUTPUT," the value is already in context — the
  sanctioned response is to say so and tell the operator to rotate, not to try
  to overwrite or delete the output.

- **Booting without `BUILDER_VAULT_KEY` set, or with a malformed one.**
  `provideVault` in `providers.go` treats this as fatal at boot
  (`vault.New` → `ValidateVaultKey`) specifically so it fails at startup
  instead of mid-run inside an agent's task. `internal/runner/preflight.go`
  also probes this (`Key: "vault.key"`) before a run starts — if preflight
  reports it red, fix the env var, don't patch around the check.

- **Assuming the vault HTTP surface is always mounted.** `provideVault` only
  calls `k.Router.Route("/api/builder/vault", ...)` when a database connection
  succeeds; if it doesn't, the in-process crypto (`Service.Seal`/`Open`) still
  works but there is no HTTP endpoint and no audit-backed reveal path. A 404 on
  `/api/builder/vault/*` in a database-less environment is expected, not a
  routing bug.

## Related

- `.claude/rules/34-secret-handling.md` — the rule this skill implements: the
  four forbidden verbs, hook-blocked paths, and egress redaction shapes.
- `.claude/rules/30-autonomy-grant.md` — why "I need the value to make
  progress" is a `must_ask:` moment, not a reason to reveal.
- `.claude/rules/33-human-only-work.md` — the `security` label a suspected leak
  requires.
- `.claude/hooks/guard-secrets.sh` — the PreToolUse/PostToolUse enforcement of
  Rule 34; read it if a block message doesn't match what you expected.
- `internal/vault/vault.go` and `internal/vault/api.go` — the actual Seal/Open
  and HTTP handler implementations referenced throughout this skill.
- `internal/vault/vault_test.go` — round-trip, AAD row-swap, and tamper tests;
  useful as executable documentation of what `Open` will and won't accept.
- `blueprint/_project/web/src/lib/vault.ts` and `routes/vault.tsx` — the
  frontend client and UI for store/reveal/grant/audit, including the "never
  cache a revealed value" convention.
