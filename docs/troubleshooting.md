# It looks like it is running, but it is not

Each entry below cost real debugging time. Symptom first, because that is what
you have.

---

## Port 8099 is not reserved

**Symptom.** `curl http://localhost:8099/...` answers 200. The dashboard loads.
But builderd is not running, and nothing you do to builderd changes anything.

**Cause.** Nothing reserves 8099. If the product (or any other process) binds it
first, builderd fails to bind and the port keeps answering — from the wrong
process.

**Diagnose.** Two commands, both required. The first alone is not enough,
because it tells you *something* is listening, not *what*.

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
curl -s http://localhost:8099/api/health
```

The health body must be exactly:

```json
{"status":"ok","service":"builderd"}
```

If `service` says `builder-dev` — or the field is absent — you are talking to
the **product**, not the daemon. Verified: `builderd/main.go:141-142` is the
only place that writes `"service":"builderd"`.

**Fix.** Kill whatever holds the port, then `cd builderd && ./run.sh`.

**Never** conclude "the daemon is up" from an HTTP 200 on 8099. Check the
`service` field every time.

---

## UI changes appear on 3000 but not on 8099

**Symptom.** You edit a component. The Vite dev server on port 3000 hot-reloads
and shows it. Port 8099 keeps showing the old UI, through restarts.

**Cause.** They serve different things. 3000 is the Vite dev server compiling
from source. **8099 serves the bundle compiled into the binary** — from
`builder/web/dist`, embedded by `web_embed.go`. Editing a route under
`blueprint/_project/web/src/` changes neither until you rebuild both.

**Fix.** Rebuild the embedded bundle, then rebuild Go:

```bash
cd /Users/fadymondy/Sites/togo/builder/web && pnpm build   # → web/dist
cd ../builderd && go build -o builderd .                    # re-embeds it
```

`build` is `tsc --noEmit && vite build`, so a type error fails the build and
leaves the old `dist/` in place — which looks exactly like "the build did
nothing". Read the output.

While iterating on the dashboard you can skip the Go rebuild by pointing
`BUILDER_WEB_DIR` at `builder/web/dist`; the daemon then reads it from disk.

The `web/` workspace is pnpm-locked (`pnpm-lock.yaml` is the only lockfile).

builderd does not need restarting after a rebuild — it serves the directory. It
**does** need restarting after a Go change, but `run.sh` rebuilds the binary
every start, so `Ctrl-C` and re-run is the whole procedure.

---

## `tmux new-session -A` fails on the second call

**Symptom.** Creating a terminal session works once. The second request for the
same session name fails with:

```
open terminal failed: not a terminal
```

**Cause.** `-A` means "attach if the session exists". Attaching requires a
controlling terminal, and an HTTP handler is not a TTY. The first call takes the
create path (no attach, no terminal needed) and succeeds; the second takes the
attach path and dies. Neither `-d` nor `-D` avoids it.

**Fix — already in place.** Check-then-create. `has-session` touches no client,
so the exists path never needs a terminal.

```go
exists := exec.CommandContext(r.Context(), bin, "has-session", "-t", "="+name)
// on failure only:
//   exec.CommandContext(..., "new-session", "-d", "-s", name, "-c", s.workdir)
```

Verified at `internal/term/attach.go:49-65`. If you add another tmux call site,
copy this shape — do not reach for `-A`.

---

## Arabic renders LTR — `<html dir>` stays `ltr`

**Symptom.** Switching to Arabic mirrors most of the interface but
`document.documentElement.dir` remains `"ltr"`.

**Cause.** An app-shell bug: nothing sets `dir` on `<html>` when the language
changes.

**Current state.** RTL works via an **inner wrapper** carrying `dir="rtl"`, and
the stylesheet keys off `[dir="rtl"]` (verified: `builder-dev/web/src/app.css:236`
and `:337`). So the interface mirrors, but anything that reads
`document.documentElement.dir`, and any CSS anchored at the `<html>` element,
sees LTR.

**Implication for new code.** Do not branch on `document.documentElement.dir`.
Read direction from the language context or the nearest `[dir]` ancestor.

**Unverified**: that the root cause is solely a missing assignment in the app
shell. Reported, not traced during this pass.

---

## Everything renders in the system font

**Symptom.** No error in the console, no failed request that looks fatal, but
the entire app is in the default system font stack.

**Cause.** A `@font-face` `src:` URL that does not resolve to a real file. In a
SPA, an unknown path hits the index fallback, which returns **`index.html` with
HTTP 200**. The browser receives HTML where it expected a WOFF2, silently fails
to parse the font, and falls through the stack. There is no 404 to notice.

**Diagnose.** Fetch the font URL and look at the content type, not the status:

```bash
curl -sI http://localhost:8099/fonts/sora/sora.woff2 | head -3
```

`content-type: text/html` means the file is not there. A real font answers
`font/woff2` or `application/octet-stream`.

**The files that actually exist.** From
`builder-dev/web/public/fonts/`, verified by `find`:

```
fonts/ibm-plex-sans/ibm-plex-sans.woff2
fonts/jetbrains-mono/jetbrains-mono.woff2
fonts/lusail/Lusail-Bold.woff2
fonts/lusail/Lusail-Light.woff2
fonts/lusail/Lusail-Medium.woff2
fonts/lusail/Lusail-Regular.woff2
fonts/sora/sora.woff2
```

The Lusail filenames are **capitalised**; the others are not. A path is
case-sensitive on Linux and in the built bundle. Match these exactly.

One font is served from the Go side instead of `public/`:
`{API}/builder-assets/fonts/symbols-nerd-font-mono.woff2`, embedded via
`assets_embed.go` and mounted at `providers.go:187`. It is used by the terminal
route (`builder-dev/web/src/routes/terminal.tsx:534`) and is not in `public/`.

---

## A custom app does not appear

```bash
curl -s http://localhost:8099/api/builder/apps/_health
```

The response names the app and the reason it was rejected. A broken custom app
never takes builder down — it is dropped by name and boot continues with one
fewer tile. See [`custom-apps.md`](custom-apps.md#why-my-app-did-not-load).

---

## Agents never start

The agent loop is off by default because it spends money.

```bash
BUILDER_RUNNER=1
```

Verified: `providers.go:441`. builderd prints
`agents    idle (set BUILDER_RUNNER=1 to start the loop)` at boot when it is
unset.

Separately, nothing opens pull requests unless `BUILDER_OPEN_PR=1`; without it
work lands on local branches (`providers.go:455`, `:485`).

---

## builderd will not start: missing key

```
BUILDER_VAULT_KEY is not set and was not found in <path>/.env
```

`run.sh` reads `BUILDER_VAULT_KEY` and `AUTH_SECRET` out of
`$BUILDER_ENV_FILE`, default `../../builder-dev/.env`. Either put them there or
export them before running — an exported value wins over the file.

Do **not** mint a fresh vault key to get past this. Every secret already stored
was sealed with the old one and will stop decrypting.

---

## `go build` in `builderd/` fails from a clean clone

Expected today. `builderd/go.mod` carries `replace` directives pointing at
sibling checkouts, because `auth`, `auth-dev`, `db-postgres` and `realtime` are
not published yet. It builds inside a workspace that has those repositories side
by side. The in-process plugin build (`go build ./...` at the repo root) has no
such dependency.

Also note: `internal/mcp/` is under active edit. A build failure originating
there is somebody else's in-flight work, not a fault in your change.
</content>
</invoke>
