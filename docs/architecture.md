# What is builder, and what are its moving parts?

builder is a togo plugin that gives a project an **autonomous agent fleet**.

The loop it exists to close:

1. A bug or request enters as an **issue** — either from the feedback SDK
   embedded in the product, or filed by hand.
2. A triage agent classifies it; an orchestrator **claims** it under a database
   lease and routes it to a **specialist agent** from a fleet you generated.
3. That agent runs as a real Claude Code session in an isolated workspace on a
   **real git branch**, and writes a verdict.
4. The **runner** — never the agent — derives the facts, runs the gates and
   optionally opens the PR.

Around that loop sit a project brain, ingestion sources, a secrets vault, chat,
an MCP server and a terminal.

## The eight providers

builder ships as one Go module but registers eight independent togo kernel
providers. Verified in `plugin.go:26-79`.

| Constant | Name | Short name for `BUILDER_DISABLE` | What it owns |
|---|---|---|---|
| `ProviderVault` | `builder.vault` | `vault` | Secrets other providers read |
| `ProviderBrain` | `builder.brain` | `brain` | Memories + entity graph |
| `ProviderNotify` | `builder.notify` | `notify` | Realtime, push, sound |
| `ProviderIssues` | `builder.issues` | `issues` | The issue plane + HTTP surface |
| `ProviderFleet` | `builder.fleet` | `fleet` | Agent registry, `.claude/` sync |
| `ProviderOrchestrator` | `builder.orchestrator` | `orchestrator` | Claim / lease / route / triage |
| `ProviderSources` | `builder.sources` | `sources` | Scheduled ingestion into the brain |
| `ProviderApps` | `builder.apps` | `apps` | User-supplied screens, discovered at boot |

Disable by short name, comma-separated:

```bash
BUILDER_DISABLE=vault,brain togo serve
```

Verified: `plugin.go:82-99` — `register()` skips a provider whose short name
appears in `BUILDER_DISABLE`. `GET /api/builder/_meta` reports the effect
without reading logs (`providers.go:507-529`).

The plugin boots at **priority 101**, after auth (95) and dashboard (100),
because chi panics if a route is mounted before auth calls `Router.Use()`.
Verified in `togo.plugin.yaml`.

## Package map

Everything below is under `internal/` unless stated.

| Package | Question it answers |
|---|---|
| `authz/` | May this identity do this? Wildcard-aware, because togo's `Can()` is an exact match and `permissions=["*"]` would otherwise deny everything |
| `brain/` | What does the project know? See [`brain.md`](brain.md) |
| `chat/` | Talking to an agent; mounted at `/api/builder/chat` |
| `db/` | Migrations and seeders, including the idempotent admin seeder |
| `deploy/` | Deploy gate; reads `BUILDER_VERIFY_CMD` (`deploy.go:271-277`) |
| `docs/` | **Runtime** document library — upload, store, ingest into the brain. Not this folder |
| `fleet/` | The agent registry and per-agent brains |
| `issues/` | Issues, board, feedback intake, attachments |
| `mcp/` | The MCP server surface. **Being actively edited — treat as unstable** |
| `notify/` | Realtime and push |
| `orchestrator/` | Claim, lease, triage, implement |
| `runner/` | Executes agent sessions. Preflight probes, tmux, workspace, publish |
| `scaffold/` | `togo-builder new` |
| `setup/` | The setup wizard, mounted at `/api/builder/setup` |
| `skills/` | Skill files on disk, mounted at `/api/builder/skills` |
| `sources/` | Scheduled ingestion. See [`sources.md`](sources.md) |
| `term/` | The tmux-backed browser terminal, off unless `BUILDER_TERMINAL=1` |
| `vault/` | AES-256-GCM secrets with AAD bound to the row identity |
| `../customapps/` | The custom-app extension point. See [`custom-apps.md`](custom-apps.md) |
| `../builderd/` | The standalone daemon. See [`run-standalone.md`](run-standalone.md) |

`builderd/` is a **nested Go module** with its own `go.mod` and `go.work`.

## The claim mechanism

Concurrency control is one SQL statement — no queue, no broker, no advisory
lock. Two runners racing for the same issue cannot both win: the outer
`AND status='ready'` is a compare-and-swap, and `RowsAffected() != 1` means you
lost.

Three exclusions are enforced by the database rather than by convention:

- `human_only = true` — agents never claim it.
- `attempt_count >= max_attempts` — a failing issue stops burning budget.
- A **pending decision** on the issue — the human-in-the-loop gate is a
  `NOT EXISTS` join, so an agent waiting on an answer is *structurally*
  unclaimable.

`builder_decisions` additionally carries
`CREATE UNIQUE INDEX … WHERE state = 'pending'`, so an issue can never
accumulate two open questions.

Unverified: this section is reproduced from the repository README; the SQL was
not re-read during this pass.

## Two things to know before extending

**Never pass `--bare` to Claude Code here.** It refuses OAuth entirely and
accepts only an API key, so it is incompatible with the subscription auth the
preflight verifies.

**A client-side hook is not a merge gate.** `guard-merge-gate.sh` constrains the
agent's own shell, not the GitHub API. The real control is branch protection
with required review and required status checks; the hook is defence in depth.

## Where to go next

- Running it: [`run-in-process.md`](run-in-process.md),
  [`run-standalone.md`](run-standalone.md)
- Watching an agent: [`agent-runs-tmux.md`](agent-runs-tmux.md)
- Every env var: [`environment.md`](environment.md)
</content>
</invoke>
