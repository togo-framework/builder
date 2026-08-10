# How do I run builder as its own daemon?

`builderd/` is builder running as its **own binary, own port, own database, own
session**. The product embeds one script tag — or nothing at all, if you use the
shell — and knows nothing else.

## Which mode do I want?

| | In-process plugin | Standalone daemon (`builderd`) |
|---|---|---|
| Process | The product's | Its own |
| Port | The product's (8080 in `builder-dev`) | **8099** |
| Database | The product's (`builder_dev`) | Its own (`builder_standalone` under `run.sh`) |
| Survives a product rebuild / deploy / panic | **No** | **Yes** |
| Product needs a script tag | Yes | No, if you use `/shell` |
| Product's language / stack | Must be togo (Go) | Anything |

Both modes run **the same code**. Every provider in this repository registers
itself the same way whether the kernel belongs to a product or to the daemon
(`builderd/main.go`, "WHAT IT SHARES WITH THE PLUGIN"). There is no daemon fork
to drift.

Pick standalone if you want the board available while the product is down.
That is what it is for.

## Start it

```bash
cd builderd && ./run.sh
```

Verified from `builderd/run.sh`. In order, the script:

1. `cd`s to its own directory.
2. Sets defaults it does not already have in the environment:
   - `DATABASE_URL` → `postgres://$USER@localhost:5432/builder_standalone?sslmode=disable`
   - `BUILDER_WORKDIR` → the parent directory (the `builder/` repo)
   - `BUILDER_TARGET` → `http://localhost:3000`

   `BUILDER_WEB_DIR` is deliberately **not** defaulted. It used to point at
   `../../builder-dev/web/dist` — a sibling development checkout — which meant
   the "standalone" daemon served no pages at all on any machine that did not
   have that project cloned and built. The dashboard now ships inside the
   binary; set `BUILDER_WEB_DIR` only to serve a `web/dist` from disk while
   developing the dashboard.
3. Resolves **exactly two secrets** — `BUILDER_VAULT_KEY` and `AUTH_SECRET` —
   out of `$BUILDER_ENV_FILE`, defaulting to `../../builder-dev/.env`.
   Anything already exported wins over the file.
4. Exits non-zero with an explanation if either is still empty.
5. Rebuilds: `go build -o builderd .` (falls back to a prebuilt `./builderd`
   only when there is no Go toolchain on PATH).
6. `exec ./builderd`.

### Why it reads exactly two keys and not the whole file

Sourcing `builder-dev/.env` wholesale is the trap. That file carries the
**product's** `ADDR` (`:8080`) and `DATABASE_URL` (`builder_dev`), so the daemon
would come up on the product's port against the product's database — precisely
the coupling this binary exists to undo — and it would look like a working
start. An allowlist of two keys cannot do that. The reasoning is in the script's
own comment block, lines 15-31.

### Why the vault key is read, not generated

A key minted at start time would be a different key on every restart, and every
secret already stored would silently fail to decrypt. Reuse the key from the
product's `.env`. Do not mint a new one unless you accept that stored secrets
stop decrypting.

## Defaults the binary sets for itself

From `builderd/main.go`, when `run.sh` has not already set them:

| Variable | Default | Why |
|---|---|---|
| `DATABASE_URL` | `postgres://<user>@localhost:5432/builder` | Never the product's DB |
| `DB_DRIVER` | `pgx` | togo defaults to sqlite; a builder silently running on a throwaway sqlite file while `DATABASE_URL` pointed at Postgres would look like it had lost every issue |
| `ADDR` | `:8099` | **`ADDR` is togo's key, not `PORT`.** Setting `PORT` looked right and did nothing — the daemon came up on the product's 8080 and the two fought over the port |

## Confirm it is actually the daemon answering

```bash
curl -s http://localhost:8099/api/health
```

```json
{"status":"ok","service":"builderd"}
```

Verified: `builderd/main.go:141-142`. The `service` field is the whole point —
it is what distinguishes builderd from the product, which registers its own
`/api/health` and answers 200 too. **Never treat a 200 on 8099 as proof the
daemon is up.** See [`troubleshooting.md`](troubleshooting.md#port-8099-is-not-reserved).

The endpoint exists at all because the dashboard is built from the product's
repository and polls `/api/health`; served from the daemon without this, it took
the 404 as "down" and drew a grey dot reading "API offline" while the daemon ran
perfectly.

## What it serves

| Path | Handler | What |
|---|---|---|
| `/api/health` | `main.go` `serveHealth` | The liveness probe above |
| `/api/builder/*` | the providers | The whole builder API — identical to plugin mode |
| `/` | `main.go` `serveWeb` | Redirects to `/builder/` |
| `/builder/*` | the `builder.web` provider (`web.go`) | The dashboard, from the bundle embedded in the binary (`web_embed.go`). `BUILDER_WEB_DIR` overrides it with a directory, for developing the dashboard |
| `/shell` | `shell.go:146` | Your product(s), framed, with builder outside |
| `/sdk/builder-sdk.js` | embedded (`sdk_embed.go`) | The feedback widget |

## The shell, and the inversion

The obvious way to embed a feedback widget is a script tag in the product. That
puts the widget inside the process it observes, and it dies with it.

`/shell` turns it inside out: you open **builder**, and builder renders your
product in an iframe. The widget lives in the outer page, on the daemon's own
origin, against the daemon's own database. Restart the product and the iframe
blinks; the panel, the board, the agents, the brain and the chat never move.

The product needs no script tag, no dependency, and no knowledge that any of
this exists — which is why this works against a product in any language on any
stack.

### One product or several

`BUILDER_TARGET` (singular) frames one origin, default `http://localhost:3000`.

`BUILDER_TARGETS` (plural) frames a list — `name=url` entries separated by
commas or newlines:

```bash
BUILDER_TARGETS="app=https://app.co,auth=https://auth.app.co,dashboard=https://dashboard.app.co"
```

All frames are mounted eagerly rather than created on first switch, so every
app's SDK is handshaken and its console ring buffer is filling from the start.
Verified: `builderd/targets.go:27-64`.

## Embedding the widget instead

If you prefer the script tag, the daemon prints this at boot:

```html
<script src="http://localhost:8099/sdk/builder-sdk.js"></script>
<script>BuilderIssues.mount({ apiBase: "http://localhost:8099" })</script>
```

Cross-origin intake is gated by `BUILDER_FEEDBACK_ORIGINS`
(`providers.go:135`).

## Building from a clone

The plugin module builds normally with `go build ./...`.

`builderd/` does **not** yet build from a bare clone. Its `go.mod` carries
`replace` directives pointing at sibling checkouts, because the togo plugins it
depends on — `auth`, `auth-dev`, `db-postgres`, `realtime` — are not published
yet. It builds inside a workspace that has those repositories side by side
(which is what `../togo/` is), and will build from a clone once they are tagged.

`run.sh` deliberately leaves `GOWORK` alone: builderd's own `go.work` points at
those sibling checkouts and is what makes the module build at all today.

## Two things that will bite you

1. **Port 8099 is not reserved.** If the product binds it first, builderd is
   silently not there while the port still answers 200.
2. **8099 serves a built bundle**, not the dev server. UI changes need
   `pnpm build` in `../builder-dev/web` before they appear.

Both are written up with the exact commands in
[`troubleshooting.md`](troubleshooting.md).
</content>
</invoke>
