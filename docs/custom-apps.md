# How do I add a screen to builder without editing builder?

A **custom app** is an extra screen — a tile in the SDK launcher and a route of
its own — added by dropping a directory into the apps directory. No file in
builder names it, and installing one requires no edit to builder's source.

Package: `customapps/` (top level, not under `internal/`).
Full contract: `blueprint/_claude/skills/custom-app/SKILL.md`.

## Two kinds, one shape downstream

| | Discovered app | Compiled app |
|---|---|---|
| How it is found | Directory under `BUILDER_APPS_DIR`, read at boot | `customapps.Register` from its own `init()`, blank-imported by the host |
| Needs a rebuild | No | Yes |
| Backend routes | No | Yes, at `/api/builder/apps/<slug>/api/*` |
| Gets a `*sql.DB` | No | Yes |
| UI | `ui.js` on disk | `ui.js` on disk, or an `fs.FS` it hands over |

Everything downstream — the launcher, the API, the health report — treats them
identically.

## Scaffold one

```bash
togo-builder app new changelog --title "Changelog" --title-ar "سجل التغييرات"
togo-builder app new metrics --go --module github.com/acme/product
togo-builder app list
```

Flags, verified in `cmd/togo-builder/app.go:15-104`:

| Flag | Meaning |
|---|---|
| `--dir D` | Where to write it |
| `--title T` | English title (default: the slug, title-cased) |
| `--title-ar T` | Arabic title (default: the English one — **replace it**) |
| `--desc T` / `--desc-ar T` | Description, both languages |
| `--icon N` | A lucide glyph name |
| `--color #rrggbb` | Launcher tile fill |
| `--order N` | Launcher sort position |
| `--go` | Also write a compiled-app backend skeleton |
| `--module M` | The host module path, for the `--go` import line |
| `--force` | Overwrite |

`app list` prints what would load **and what was rejected**.

## Scaffold one from inside an agent run

The CLI needs a human at a terminal. A fleet agent working an issue does not
have one, and an agent that must file an issue asking someone to type
`app new` cannot finish the job it was given. The same capability is a tool on
the **agents** MCP server (`/api/builder/mcp/agents`):

| Tool | What it does |
|---|---|
| `list_apps` | What is installed, and what the last scan rejected. Call it first. |
| `create_app` | Scaffolds the app and **rescans the live registry** — the tile and the route exist when the call returns. |

`create_app` calls `customapps.Scaffold`, the same function the CLI calls, so
there is one generator and one on-disk format. The differences from the CLI are
all restrictions, because the caller is autonomous:

| CLI | MCP |
|---|---|
| `--dir` chooses the directory | fixed to the running registry's root |
| `--force` overwrites | refused; a taken slug is an error with a next step |
| a human reads the output | the result states whether the app actually **loaded**, not just that files were written |

Containment is checked before a byte is written (`internal/mcp/apps.go`,
`beneath`): a slug is one path segment, so a separator, a `..` or a leading `/`
is refused. Creation is serialised by an in-process lock, because Scaffold's
stat-then-create has a gap two agents can race through. A panic in the
scaffolder is recovered and returned as a sentence — one bad app costs one tile,
never the process.

On the agents server and **not** the feedback one: an app ships an ES module the
dashboard imports and executes in an authenticated origin, which is a different
blast radius from filing a bug. A `feedback`-scoped token — the one documented
as safe to wire into a shared editor — cannot see these tools. `agents` and
`all` can.

`create_app` produces the working demo, not the finished screen. The agent then
replaces `apps/<slug>/ui.js` with its own tools; the module is served
`no-store`, so a reload picks it up.

## Where apps are discovered

`BUILDER_APPS_DIR`, defaulting to `./apps` — **the running application's own
directory, not `BUILDER_WORKDIR`**. That distinction is the most common reason a
scaffolded app is invisible.

## `app.json`

`Manifest` in `customapps/apps.go:76-114` is both the disk format and exactly
what `GET /api/builder/apps` returns — one shape to learn, not two that drift.

```json
{
  "slug": "changelog",
  "title":       { "en": "Changelog", "ar": "سجل التغييرات" },
  "description": { "en": "What shipped", "ar": "ما تم إصداره" },
  "icon": "scroll-text",
  "color": "#6C8CFF",
  "order": 100,
  "ui": "ui.js"
}
```

| Field | Notes |
|---|---|
| `slug` | Required. `^[a-z0-9][a-z0-9-]{1,63}$`. It is a URL segment, a directory name and a DOM id at once |
| `title` | Required (`title.en` at minimum) |
| `icon` | A lucide glyph name. The SDK launcher carries a small inlined set and falls back to a generic tile; the web route resolves the full `lucide-react` set |
| `color` | `#rrggbb`. Fixed per app, not derived — a hash-derived palette reshuffles the whole grid the day one app is renamed |
| `order` | Built-ins occupy 0..99; custom apps default to **100** so they land after them |
| `ui` | ES module path relative to the app directory. Defaults to `ui.js` |
| `source`, `hasApi`, `path` | **Set by the registry, never by you.** `source` is `"disk"` or `"compiled"` |

### Bilingual is a contract, not a renderer concern

`Text` is `{ en, ar }` (`apps.go:57-72`). `Get(lang)` returns AR for a language
tag starting `ar` when AR is non-empty, else EN. An app that ships only English
is a permanent English island inside an app that mirrors, and there is no later
pass that fixes it. AR falling back to EN keeps that visible without blocking a
first commit.

### Reserved slugs

These resolve to builder's own screens and are rejected (`apps.go:48-54`):

```
agents skills issues vault sources docs library brain chat mcp terminal
dashboard setup profile admin login register reset apps api
```

## `ui.js`

An ES module whose **default export is `mount(host, ctx)`**.

```js
export default function mount(host, ctx) {
  host.innerHTML = `<h1>Changelog</h1>`;
  return () => { /* optional teardown */ };
}
```

Served at `GET /api/builder/apps/<slug>/ui.js` (`customapps/service.go:298`).
It is read from disk on request, so **editing `ui.js` needs no restart**.

`ctx` carries `{ slug, manifest, lang, dir, t(en, ar), api(path, init),
state: { get, put }, navigate(to) }` — built by `makeAppContext` in
`web/src/lib/apps.ts`, which is the definition. The return value, when it is a
function, runs on unmount; the host element is emptied either way, so a
forgotten teardown leaks nothing.

## Compiled apps

Register from `init()` and get blank-imported by the host project, exactly the
way a togo provider does.

```go
package metricsapp

import (
    "github.com/go-chi/chi/v5"
    "github.com/togo-framework/builder/customapps"
)

func init() {
    customapps.Register(customapps.App{
        Manifest: customapps.Manifest{
            Slug:  "metrics",
            Title: customapps.Text{EN: "Metrics", AR: "المقاييس"},
        },
        Init: func(ctx customapps.Context) error {
            // ctx.DB may be nil — check it.
            return nil
        },
        Routes: func(r chi.Router) {
            r.Get("/summary", handleSummary) // → /api/builder/apps/metrics/api/summary
        },
    })
}
```

`App` fields, verified `apps.go:134-153`:

| Field | Required | Notes |
|---|---|---|
| `Manifest` | Yes | Slug, `Title.EN`, and a valid slug shape are checked |
| `Init` | No | Runs once at boot, after the registry has a DB and logger. An error is logged and the app is **dropped**, never fatal |
| `Routes` | No | Mounted at `/api/builder/apps/<slug>/api/*`. The router is already behind session middleware, so handlers may call `auth.IdentityFrom(r.Context())` |
| `UIFS` | No | Serves `ui.js` when there is no directory. A disk directory wins when both are present |

`Context` (`apps.go:116-132`) carries `DB *sql.DB` (**may be nil — check it**),
`Log *slog.Logger` already scoped with the slug, and `Dir string` (empty for a
compiled app with no directory).

**Do not `CREATE TABLE` from a custom app.** Ship migrations and let the host
apply them, exactly as a togo plugin does.

`Register` never panics and never returns an error — it runs during package
initialisation, where there is nobody to hand a failure to. An invalid or
duplicate app is dropped, recorded, and reported at boot by `Validate`.

## Why my app did not load

```bash
curl -s http://localhost:8080/api/builder/apps/_health
```

Verified: `customapps/service.go:278`. It reports which app was rejected and
why. `togo-builder app list` prints the same information
(`service.go:253` — "The CLI prints it; `/_health` serves it").

Checklist:

1. Is it under `BUILDER_APPS_DIR` — which defaults to the **running app's**
   `./apps`, not `BUILDER_WORKDIR`?
2. Does the slug match `^[a-z0-9][a-z0-9-]{1,63}$` and avoid the reserved list?
3. Is `title.en` non-empty?
4. Is `app.json` valid JSON?
5. Does `ui.js` exist at the path `ui` names (default `ui.js`)?
6. For a compiled app: is it blank-imported by the host, and did you rebuild?

**A broken app costs exactly one tile.** A malformed manifest, a missing module
or an `Init` that errors is recorded and skipped; boot continues. An extension
point that could take builder down would break the one promise the SDK makes —
that the board is up when the product is not.

## Restart semantics

`/api/builder/apps` reports it directly (`service.go:340`):

> manifests and `ui.js` are live; a compiled app's `/api` routes need a restart

So: edit `app.json` or `ui.js` freely. Adding or changing Go routes means a
rebuild and restart.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/builder/apps` | List (the `Manifest` shape above) |
| GET | `/api/builder/apps/_health` | What was rejected, and why |
| GET | `/api/builder/apps/{slug}` | One manifest |
| GET | `/api/builder/apps/{slug}/ui.js` | The ES module |
| GET | `/api/builder/apps/{slug}/state` | App state |
| * | `/api/builder/apps/{slug}/api/*` | A compiled app's own routes |

Verified: `customapps/service.go:276-299`.
</content>
</invoke>
