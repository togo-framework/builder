# What environment variable controls X?

Every `BUILDER_*` variable in the repository, plus the non-prefixed ones builder
depends on. Enumerated with:

```bash
grep -rhoE 'BUILDER_[A-Z0-9_]+' . \
  --include='*.go' --include='*.sh' --include='*.yaml' \
  --include='*.md' --include='*.tmpl' --include='*.js' \
  --include='*.ts' --include='*.tsx' | sort -u
```

Each row names the file that reads it, so you can check the exact semantics.

## Required

| Variable | Read at | Notes |
|---|---|---|
| `BUILDER_VAULT_KEY` | vault provider | 32 bytes, base64 or hex. `openssl rand -base64 32`. **A missing key is fatal at boot**, not at first secret read. Never regenerate — every stored secret was sealed with the old one |

## Database and serving

| Variable | Read at | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | togo kernel | builderd: `postgres://<user>@localhost:5432/builder` | Falls back to the SQLite dev DSN in plugin mode |
| `DB_DRIVER` | togo kernel | builderd forces `pgx` | togo defaults to sqlite; builder needs Postgres |
| `ADDR` | togo kernel | builderd forces `:8099` | **togo's key is `ADDR`, not `PORT`.** Setting `PORT` silently does nothing |
| `AUTH_SECRET` | auth plugin | — | Signs sessions. `builderd/run.sh` resolves it from the product `.env` |

## Admin seeding

| Variable | Read at | Notes |
|---|---|---|
| `BUILDER_ADMIN_EMAIL` | `internal/db/seeders` | The seeded administrator |
| `BUILDER_ADMIN_PASSWORD` | `internal/db/seeders` | Non-interactive seeding. There is deliberately no default and no generated-and-printed password. Prefer piping on stdin |

## Agent execution

| Variable | Read at | Default | Notes |
|---|---|---|---|
| `BUILDER_RUNNER` | `providers.go:441` | off | `=1` starts the agent loop. **Off by default because it spends money** |
| `BUILDER_EXEC` | boot guard | `local` in `.env.example` | `local` \| `coder`. `local` runs Claude Code in-process with full shell access and is **refused outside local development** |
| `BUILDER_CLAUDE_BIN` | runner | `claude` | Path to the `claude` binary |
| `BUILDER_PERMISSION_MODE` | `internal/runner/preflight.go:545` | — | e.g. `acceptEdits` |
| `BUILDER_WORKDIR` | many (26 sites) | builderd `run.sh`: the parent dir | The repository agents work in. Unset means "agents have no repository to work in" — builderd prints exactly that at boot |
| `BUILDER_WORKTREE_ROOT` | `internal/runner/workspace.go:67` | — | Where isolated agent worktrees are created |
| `BUILDER_ISSUE` / `BUILDER_AGENT` | run environment | — | Injected into the agent's session, not read from yours |

**Never pass `--bare` to Claude Code here.** It refuses OAuth entirely and
accepts only an API key, so it is incompatible with the subscription auth the
preflight verifies.

## Budgets

Two variables, two layers. This trips people up.

| Variable | Direction | Read/written at |
|---|---|---|
| `BUILDER_DAILY_BUDGET_USD` | **You set this.** | `providers.go:443` |
| `BUILDER_DAY_BUDGET_USD` | **builder exports this**, into the agent's own environment | `internal/orchestrator/implement.go:295` |
| `BUILDER_RUN_BUDGET_USD` | **builder exports this**, per run | `internal/orchestrator/implement.go:294` |

`blueprint/_claude/hooks/budget-meter.sh:134-136` reads
`BUILDER_RUN_BUDGET_USD` and `BUILDER_DAY_BUDGET_USD` — the two the orchestrator
injects. Setting `BUILDER_DAY_BUDGET_USD` yourself is not the operator knob;
`BUILDER_DAILY_BUDGET_USD` is.

## Models

| Variable | Read at |
|---|---|
| `BUILDER_TRIAGE_MODEL` | `providers.go:448` |
| `BUILDER_PREFLIGHT_MODEL` | `internal/runner/preflight.go:323` |

## Git and pull requests

| Variable | Read at | Default | Notes |
|---|---|---|---|
| `BUILDER_OPEN_PR` | `providers.go:455` | off | `=1` opens pull requests. Without it, work lands on local branches — builder logs exactly that (`providers.go:485`) |
| `BUILDER_PR_BASE` | `providers.go:456` | — | Base branch |
| `BUILDER_PR_REMOTE` | `providers.go:459` | — | Remote name |
| `BUILDER_VERIFY_CMD` | `internal/deploy/deploy.go:271-277` | — | The project's own gate, run before publishing |

## tmux

| Variable | Read at | Default | Notes |
|---|---|---|---|
| `BUILDER_TMUX` | `internal/runner/tmux.go:100-108` | on | `=0` disables tmux; runs spawn directly and are not attachable |
| `BUILDER_TMUX_LINGER` | `internal/runner/tmux.go:116-126` | `0` | Seconds to keep a finished session for post-mortem reading. Capped at 3600 |
| `BUILDER_TERMINAL` | `providers.go:280`, `internal/term/term.go:12` | off | `=1` enables the browser terminal. **Never in production** — with it on, anyone who can reach the UI has a shell |

See [`agent-runs-tmux.md`](agent-runs-tmux.md).

## Brain / embeddings

| Variable | Read at | Default |
|---|---|---|
| `BUILDER_EMBED_URL` | `internal/brain/embed_http.go:57` | unset — the switch. Unset keeps the hashed-bag-of-words embedder |
| `BUILDER_EMBED_MODEL` | same | `nomic-embed-text` |
| `BUILDER_EMBED_KEY` | same | unset |
| `BUILDER_EMBED_DIM` | same | the package `Dim` |

Read [`brain.md`](brain.md) before assuming recall is semantic. It is not, by
default.

## Directories

| Variable | Read at | Default | Notes |
|---|---|---|---|
| `BUILDER_APPS_DIR` | apps provider | `./apps` | **The running app's own directory, not `BUILDER_WORKDIR`.** Most common cause of an invisible custom app |
| `BUILDER_SKILLS_DIR` | `providers.go:239` | — | Skill files on disk |
| `BUILDER_UPLOAD_DIR` | `internal/issues/attachments.go:44` | — | Issue attachments |
| `BUILDER_WEB_DIR` | `web.go:70` | embedded | **Optional.** The dashboard is compiled into the binary and served at `/builder/`. Set this to serve a `web/dist` from disk instead, while developing the dashboard. A path with no `index.html` is ignored and the embedded bundle is used. See [`troubleshooting.md`](troubleshooting.md#ui-changes-appear-on-3000-but-not-on-8099) |
| `BUILDER_SDK_DIR` | `providers.go:163` | embedded | Overrides the embedded SDK, for developing the widget itself |
| `BUILDER_SKILLS_FIXTURE` | tests | — | Test fixture path |

## builderd only

| Variable | Read at | Default |
|---|---|---|
| `BUILDER_TARGET` | `builderd/targets.go` | `http://localhost:3000` — the single product framed at `/shell` |
| `BUILDER_TARGETS` | `builderd/targets.go:27-64` | unset | Several products: `name=url` entries, comma- or newline-separated. Wins over `BUILDER_TARGET` |
| `BUILDER_ENV_FILE` | `builderd/run.sh:32` | `../../builder-dev/.env` | Where `run.sh` looks for `BUILDER_VAULT_KEY` and `AUTH_SECRET`. **Only those two keys are read** — sourcing the file wholesale would import the product's `ADDR` and `DATABASE_URL` |

## Providers and intake

| Variable | Read at | Notes |
|---|---|---|
| `BUILDER_DISABLE` | `plugin.go:94-99` | Comma-separated short names: `vault,brain,notify,issues,fleet,orchestrator,sources,apps`. Verify the effect at `GET /api/builder/_meta` |
| `BUILDER_FEEDBACK_ORIGINS` | `providers.go:135` | Allowed origins for cross-origin feedback intake |

## Frontend (`builder-dev/web`)

| Variable | Read at | Default |
|---|---|---|
| `PORT` | `web/vite.config.ts:5` | `3000` |
| `VITE_API_PROXY` | `web/vite.config.ts:8` | `http://localhost:8080` |

## Starting point

`.env.example` at the repository root carries the minimum set with comments.
Copy it to `.env`; never commit the result.
</content>
</invoke>
