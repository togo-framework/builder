# How do I run builder inside my product?

This is **in-process plugin mode**: builder's providers register into the
product's own togo kernel, so builder's routes are served by the product's
binary on the product's port.

The reference host in this workspace is the sibling checkout
`../builder-dev/` (module `github.com/togo-framework/builder-dev`).

## Ports

| Surface | Port | Set by |
|---|---|---|
| Vite dev server (the dashboard UI) | **3000** | `../builder-dev/web/vite.config.ts:5` — `Number(process.env.PORT) \|\| 3000` |
| Go API (the product, serving `/api/builder/*`) | **8080** | Vite proxies to it: `process.env.VITE_API_PROXY \|\| "http://localhost:8080"` (`vite.config.ts:8`) |

Both verified by reading `../builder-dev/web/vite.config.ts`.

## Install into an existing togo app

```bash
togo install togo-framework/builder
```

`togo.plugin.yaml` declares `backend.package: github.com/togo-framework/builder`
and `frontend.dir: web`, and merges `blueprint/_claude` into the host project's
`.claude/`.

Known gap, stated in `togo.plugin.yaml` itself: `togo install` does **not**
currently parse the `migrations:` key — `cli/cmd/plugin.go`'s `pluginManifest`
struct unmarshals only `name`, `backend.package`, `frontend.dir`, `claude` and
`env`. Until the installer honours it, the scaffolder copies
`db/migrations/*.sql` into the app's `internal/db/schema/`. builder never runs
`CREATE TABLE` from service code.

## Or scaffold a whole project

```bash
npx create-togo-builder@latest acme   # no Go, no togo installed
togo builder new acme                 # via togo's external command dispatch
togo-builder new acme                 # standalone binary
```

`togo builder <verb>` works with zero changes to `togo-framework/cli` because
the binary is built as `togo-builder` and dropped on PATH; `cmd/root.go`'s
`Execute() -> tryExternalPlugin` resolves `togo-<name>`.

## Run the reference host

Two processes. From `../builder-dev/`:

```bash
# 1. API on :8080
togo serve            # or: make dev

# 2. Dashboard UI on :3000, proxying /api to :8080
cd web && pnpm dev
```

`web/` is **pnpm-locked** — `pnpm-lock.yaml` is the only lockfile present
(verified by `ls`). Scripts, from `web/package.json`:

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` / `start` | `vite preview` |

## Minimum environment

```bash
DATABASE_URL=postgres://localhost:5432/builder_dev?sslmode=disable
BUILDER_VAULT_KEY=$(openssl rand -base64 32)
BUILDER_ADMIN_EMAIL=you@example.com
BUILDER_EXEC=local
```

`BUILDER_VAULT_KEY` is **required** — a missing key is fatal at boot rather than
at first secret read. Copy `.env.example` to `.env` as a starting point.

The agent loop does **not** start unless `BUILDER_RUNNER=1`
(`providers.go:441`), because it spends money.

Full table: [`environment.md`](environment.md).

## Preflight

```bash
togo-builder doctor          # 20 preflight probes
togo-builder doctor --json   # the same report the setup wizard consumes
```

`gh auth`, `claude auth` and a live `claude -p` execution probe are
non-skippable.

## Why you might not want this mode

builder is what you reach for when the product is broken — and in this mode it
is *inside* the process that broke. A `go build` restart, a deploy, a panic in
the product, or an agent editing the product's own code all take the issue board
down with the product.

That is the entire reason [`run-standalone.md`](run-standalone.md) exists.
</content>
</invoke>
