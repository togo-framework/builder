# What HTTP endpoints exist?

Every builder route lives under `/api/builder`, except the SDK, the embedded
assets, and builderd's own two additions.

Mount points verified from `providers.go`; sub-paths verified from each
package's `Routes(r chi.Router)` function. Line numbers are given so you can
re-check.

## Mount points

| Prefix | Mounted at | Package |
|---|---|---|
| `/api/builder` | `providers.go:156` | `internal/issues` |
| `/api/builder/vault` | `providers.go:61` | `internal/vault` |
| `/api/builder/notify` | `providers.go:119` | `internal/notify` |
| `/api/builder/deploy` | `providers.go:154` | `internal/deploy` |
| `/api/builder/setup` | `providers.go:223` | `internal/setup` |
| `/api/builder/fleet` | `providers.go:228` | `internal/fleet` |
| `/api/builder/skills` | `providers.go:243` | `internal/skills` |
| `/api/builder/docs` | `providers.go:250` | `internal/docs` |
| `/api/builder/brain` | `providers.go:258` | `internal/brain` |
| `/api/builder/chat` | `providers.go:260` | `internal/chat` |
| `/api/builder/mcp` | `providers.go:278` | `internal/mcp` |
| `/api/builder/term` | `providers.go:305` | `internal/term` |
| `/api/builder/sources` | `providers.go:356` | `internal/sources` |
| `/api/builder/apps` | `providers.go:428` | `customapps` |
| `/builder-assets/*` | `providers.go:187` | embedded (`assets_embed.go`) |
| `/sdk/*` | `providers.go:162-163` | embedded (`sdk_embed.go`) |

Some mounts are conditional — `/api/builder/term` only with
`BUILDER_TERMINAL=1`, `/api/builder/docs` and `/api/builder/brain` only when the
brain provider booted, and any prefix disappears when its provider is named in
`BUILDER_DISABLE`.

## Issues, board and feedback

Mounted at the bare `/api/builder` prefix, so these paths are absolute as
written. Verified: `internal/issues/service.go`.

| Method | Path |
|---|---|
| POST | `/api/builder/feedback` |
| GET | `/api/builder/issues` |
| POST | `/api/builder/issues` |
| GET | `/api/builder/board` |
| GET | `/api/builder/issues/{number}` |
| PATCH | `/api/builder/issues/{number}` |
| DELETE | `/api/builder/issues/{number}` |
| POST | `/api/builder/issues/{number}/comments` |
| POST | `/api/builder/issues/bulk-delete` |
| GET | `/api/builder/attachments/{id}` |

`POST /feedback` is the SDK's intake. Cross-origin callers are gated by
`BUILDER_FEEDBACK_ORIGINS`.

## Fleet

Verified: `internal/fleet/agents_api.go`.

| Method | Path |
|---|---|
| GET | `/api/builder/fleet/agents` |
| POST | `/api/builder/fleet/agents` |
| GET | `/api/builder/fleet/agents/{slug}` |
| PATCH | `/api/builder/fleet/agents/{slug}` |
| POST | `/api/builder/fleet/agents/draft-persona` |
| GET | `/api/builder/fleet/agents/{slug}/brain` |
| GET | `/api/builder/fleet/agents/{slug}/brain/entities/{id}` |

`handleBrain` resolves with `WHERE b.agent_slug = $1` and therefore cannot serve
the project brain, whose `agent_slug` is NULL. See
[`brain-provenance.md`](brain-provenance.md).

## Vault

Verified: `internal/vault/api.go`.

| Method | Path |
|---|---|
| GET | `/api/builder/vault/secrets` |
| POST | `/api/builder/vault/secrets` |
| POST | `/api/builder/vault/secrets/{name}/reveal` |
| DELETE | `/api/builder/vault/secrets/{name}` |
| POST | `/api/builder/vault/secrets/{name}/grant` |
| GET | `/api/builder/vault/audit` |

Secrets are AES-256-GCM with AAD bound to the row identity, so a ciphertext
copied to another row fails to decrypt. `reveal` is granted per agent slug and
audited.

## Brain

Verified: `internal/brain/service.go`.

| Method | Path |
|---|---|
| GET | `/api/builder/brain` |
| GET | `/api/builder/brain/entities/{id}` |

## Chat

Verified: `internal/chat/chat.go`.

| Method | Path |
|---|---|
| GET | `/api/builder/chat/agents` |
| POST | `/api/builder/chat/ask` |
| GET | `/api/builder/chat/sessions` |
| GET | `/api/builder/chat/sessions/{id}` |
| DELETE | `/api/builder/chat/sessions/{id}` |

## Document library

Verified: `internal/docs/service.go:50-56`. This is the runtime document
library — upload a file, store it, ingest it into the brain. Not the `docs/`
folder.

| Method | Path |
|---|---|
| GET | `/api/builder/docs` |
| POST | `/api/builder/docs` |
| GET | `/api/builder/docs/{id}/content` |
| POST | `/api/builder/docs/{id}/reingest` |
| DELETE | `/api/builder/docs/{id}` |

## Custom apps

Verified: `customapps/service.go:276-299`.

| Method | Path |
|---|---|
| GET | `/api/builder/apps` |
| GET | `/api/builder/apps/_health` |
| GET | `/api/builder/apps/{slug}` |
| GET | `/api/builder/apps/{slug}/ui.js` |
| GET | `/api/builder/apps/{slug}/state` |
| * | `/api/builder/apps/{slug}/api/*` |

See [`custom-apps.md`](custom-apps.md).

## MCP

**Unstable — `internal/mcp/` is under active edit. Verify before relying on
this table.**

Verified at time of writing from `internal/mcp/routes.go`:

| Method | Path |
|---|---|
| — | `/api/builder/mcp/feedback` (mounted sub-router) |
| — | `/api/builder/mcp/agents` (mounted sub-router) |
| GET | `/api/builder/mcp/tokens` |
| POST | `/api/builder/mcp/tokens` |
| DELETE | `/api/builder/mcp/tokens/{id}` |

`providers.go:418` logs `builder.apps reachable over mcp` with surface
`/api/builder/mcp/agents`, so custom apps are exposed through the agents
surface.

## Diagnostics

| Method | Path | What | Source |
|---|---|---|---|
| GET | `/api/builder/_meta` | Which providers loaded — the effect of `BUILDER_DISABLE` without reading logs | `providers.go:507` |
| GET | `/api/builder/preflight` | Preflight probe results | `providers.go:496` |
| GET | `/api/builder/apps/_health` | Which custom apps were rejected, and why | `customapps/service.go:278` |

## builderd only

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","service":"builderd"}` — the **only** reliable way to tell the daemon from the product on 8099. `builderd/main.go:141` |
| GET | `/shell` | Your product(s) framed, with builder outside. `builderd/shell.go:146` |
| GET | `/sdk/builder-sdk.js` | The feedback widget |

In plugin mode `/api/health` belongs to the **product**, not builder. Do not use
it to test builder.

## Auth

Routes are behind the session middleware installed by the `auth` plugin, which
is why builder boots at priority 101 — after auth (95) and dashboard (100). chi
panics if a route is mounted before auth calls `Router.Use()`.

A compiled custom app's router is already behind that middleware, so its
handlers may call `auth.IdentityFrom(r.Context())`.
</content>
</invoke>
