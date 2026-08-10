---
name: custom-app
description: Build a custom builder app — a screen added to this builder without editing builder's source, from a terminal or from inside an agent run over MCP. Use when asked to "add an app", "add a page to the builder", "add a tile to the launcher", "scaffold a custom app", "why isn't my app showing up", when an issue needs a screen that does not exist yet, or when working with apps/<slug>/app.json, apps/<slug>/ui.js, create_app, or customapps.Register.
---

# custom-app — A screen you add without editing builder

The builder ships ten screens (agents, skills, issues, vault, sources, library,
brain, chat, mcp, terminal). A **custom app** is an eleventh, twelfth, fortieth —
added by dropping a directory in, discovered at boot.

**No file in builder names your app.** That is the contract. If installing an
app requires an edit to builder's source, the extension point has failed and the
edit is the bug.

## Two shapes

| | Drop-in | Compiled |
|---|---|---|
| What it is | `apps/<slug>/` with `app.json` + `ui.js` | the same, plus a Go package in that directory |
| Install | drop the directory in | drop it in, add one blank import |
| Rebuild | no | yes |
| Backend | the state store | your own handlers, `*sql.DB`, `*slog.Logger` |
| Use it when | the app reads existing APIs, or stores preferences | the app needs the database, or a real endpoint |

Start drop-in. Add the Go half only when the app actually needs it — a
compiled app costs a rebuild on every change to code that could have been
`ui.js`.

## Scaffold it

Two front doors onto **one** generator (`customapps.Scaffold`). A human at a
terminal uses the CLI; an agent inside a run uses MCP. They cannot drift,
because there is only one function that writes an app.

### From a terminal

```bash
togo-builder app new changelog \
  --title "Changelog" --title-ar "سجل التغييرات" \
  --desc "What shipped, newest first." --desc-ar "ما تم إصداره، الأحدث أولاً." \
  --icon docs --color "#6366f1"

togo-builder app new metrics --go     # with a backend skeleton
togo-builder app list                 # what would load, and what was rejected
```

### From inside a run — you, mid-issue

**You do not need a human to type that command.** If the issue you are working
needs a screen, make it yourself, over MCP, on the `/mcp/agents` server:

```
list_apps                    # ALWAYS first — extend the app that exists
create_app { slug, titleEn, titleAr, descriptionEn, descriptionAr,
             icon, color, order, go }
```

`create_app` scaffolds the directory and **rescans the live registry**, so the
tile and the route exist the moment the call returns — no restart, no redeploy,
no edit to builder's source. The result names every file it wrote and states
whether the app actually loaded.

What you get back, and what to do with it:

| The result says | What it means | Your next step |
|---|---|---|
| `It is live now` | the app is in the registry and the launcher | replace the counter in `ui.js` with the real screen |
| `BUT IT DID NOT LOAD` | files written, loader refused them | fix what it names; the tile does not exist yet — do not report success |
| `The compiled half is NOT active` | `go: true` wrote `backend.go` | report the blank import as an outstanding step for a human; the drop-in half still works |
| `already exists` | the slug is taken | pick another, or edit the existing app in place |

Then **replace the generated demo**. `create_app` gives you a working counter,
not your screen; edit `apps/<slug>/ui.js` with your normal file tools and reload.
An app still showing "Count one more" is an unfinished app.

Three things the tool will not do for you, by design:

- **It cannot overwrite.** A slug that is taken is refused. Retrying a step you
  think failed will never flatten the app your last attempt actually made.
- **It cannot choose where.** The directory is the running registry's own root.
  `slug` is one path segment; anything with a separator, a `..`, or a leading
  `/` is refused before a byte is written.
- **It cannot take the builder down.** A panic in the scaffolder is caught and
  returned to you as a sentence.

Rule 38 does not block this: an app lives in `apps/`, which is product code, not
the `.claude/**` machinery a feature run may not touch.

The token needs scope `agents` or `all`. A `feedback`-scoped token cannot see
these tools at all — it files issues and nothing else, because an app ships
executable code into an authenticated origin and filing a bug does not.

### Either way

The generated app **works immediately**: it appears in the launcher, opens to a
real screen, reads and writes its own state, and mirrors in Arabic. Delete the
counter and write your app around what is left.

## Where files go

```
apps/<slug>/
  app.json      the manifest — identity, tile, order
  ui.js         the UI, one ES module, no build step
  backend.go    optional, --go only
  state.json    written by the state store; do not hand-edit
  README.md     generated
```

The directory name **must equal** the slug. They are the same identity: the URL
segment, the folder an operator opens, the key the launcher draws.

Override the location with `BUILDER_APPS_DIR`. The default is `./apps` relative
to the running app — **not** `BUILDER_WORKDIR`, which is the repository agents
branch from and a different thing entirely.

## The manifest

```json
{
  "slug": "changelog",
  "title":       { "en": "Changelog", "ar": "سجل التغييرات" },
  "description": { "en": "What shipped, newest first.", "ar": "ما تم إصداره، الأحدث أولاً." },
  "icon": "docs",
  "color": "#6366f1",
  "order": 100,
  "ui": "ui.js"
}
```

| Field | Rule |
|---|---|
| `slug` | `^[a-z0-9][a-z0-9-]{1,63}$`, equal to the directory name, not a reserved built-in name |
| `title.en` | required |
| `title.ar` | expected. Empty falls back to English — visibly untranslated, which is the point |
| `icon` | a lucide glyph name. Unknown names draw the generic tile rather than throwing |
| `color` | `#rrggbb` |
| `order` | built-ins occupy 0..99; custom apps default to 100 |
| `ui` | a file name in the app directory. A path is refused |
| `source`, `hasApi`, `path` | set by the registry. An app.json that sets them is ignored |

## The UI contract

`ui.js` default-exports one function:

```js
export default function mount(host, ctx) {
  // …render into host…
  return () => { /* optional cleanup */ };
}
```

| | |
|---|---|
| `host` | an empty `HTMLElement`. Yours. `dir` is already set |
| `ctx.slug` | your slug |
| `ctx.manifest` | the parsed manifest |
| `ctx.lang` | `"en"` \| `"ar"` |
| `ctx.dir` | `"ltr"` \| `"rtl"` |
| `ctx.t(en, ar)` | picks the string for the current language |
| `ctx.api(path, init)` | `fetch`, scoped to `/api/builder/apps/<slug>/api` |
| `ctx.state.get()` / `.put(obj)` | your JSON blob |
| `ctx.navigate(to)` | router navigation, e.g. `navigate("/issues")` |

The return value, when it is a function, runs on unmount. The host is emptied
either way — a forgotten cleanup leaks nothing.

**No React.** The module is fetched at run time and imported by URL, which is
what makes "drop it in and reload" true; a bundled component would have to exist
at build time, which is the coupling this whole thing removes. You get plain
DOM, Tailwind classes, and the app's design tokens.

Do not render the title or the description — the route already draws the page
header from your manifest, and repeating it prints the same heading twice.

### Rules that apply here exactly as everywhere else

- **Logical CSS only.** `ms-` `me-` `ps-` `pe-` `text-start` `text-end`.
  Never `ml-` `mr-` `pl-` `pr-` `text-left` `text-right`.
- **Every string bilingual**, through `ctx.t`. A hardcoded English string is an
  English island nobody comes back to fix.
- **No `console.log`.** Surface a failure where the operator can see it.
- **No inline `style=`** except for a value that is genuinely dynamic.
- Use the design tokens: `bg-card`, `text-muted-foreground`, `border-border`.
  Never a hex colour.

## The Go contract

```go
package changelog

import (
	"github.com/go-chi/chi/v5"
	"github.com/togo-framework/builder/customapps"
)

func init() {
	customapps.Register(customapps.App{
		Manifest: customapps.Manifest{
			Slug:  "changelog",
			Title: customapps.Text{EN: "Changelog", AR: "سجل التغييرات"},
		},
		Init: func(ctx customapps.Context) error {
			// ctx.DB  *sql.DB     — may be nil. Check it.
			// ctx.Log *slog.Logger — already scoped with your slug.
			// ctx.Dir string      — your directory, when you have one.
			return nil
		},
		Routes: func(r chi.Router) {
			r.Get("/entries", handleEntries) // → /api/builder/apps/changelog/api/entries
		},
	})
}
```

Activate it with **one line** in `internal/plugins/local.go`:

```go
import _ "github.com/<module>/apps/changelog"
```

That is the same mechanism every togo provider uses: `init()` registers, a blank
import pulls it in. See the `togo-plugin` skill.

When the Go package sits in the same directory as `app.json` and `ui.js` — which
is what `--go` produces — the two halves **merge**. `app.json` owns presentation
(it is the file you edit); the Go half owns `Init`, `Routes` and the state
store's absence.

### Inside a handler

- The router is already behind the session middleware. Read the caller with
  `auth.IdentityFrom(r.Context())`. Do not trust a user id from the query string.
- **No DDL.** Not in `Init`, not in a handler, not `CREATE TABLE IF NOT EXISTS`
  on startup. Ship a migration and let the host apply it with `togo migrate`.
- Wrap errors: `fmt.Errorf("list entries: %w", err)`. Never `panic`.
- Namespace your tables `<slug>_…`. You share a database with everything else.

## The HTTP surface

Everything is behind the session middleware. Unauthenticated is `401`, always.

| | |
|---|---|
| `GET /api/builder/apps` | every installed app's manifest |
| `GET /api/builder/apps/{slug}` | one manifest |
| `GET /api/builder/apps/{slug}/ui.js` | the UI module, `Cache-Control: no-store` |
| `GET /api/builder/apps/{slug}/state` | your blob, `{}` when unset |
| `PUT /api/builder/apps/{slug}/state` | replace it — whole document, JSON, ≤ 1 MiB |
| `GET /api/builder/apps/_health` | what the last scan rejected, and why |
| `POST /api/builder/apps/_reload` | rescan without a restart |
| `/api/builder/apps/{slug}/api/*` | a compiled app's own routes |

The route in the web app is `/apps/<slug>`. There is exactly one such route and
it is generic — adding an app never touches `router.tsx`.

## Testing it

```bash
# the loader agrees with what you wrote
togo-builder app list

# the registry, live
curl -s -b <session> localhost:8080/api/builder/apps | jq

# the app's own backend
curl -s -b <session> localhost:8080/api/builder/apps/<slug>/api/ping

# the package's own tests, and the MCP tool's
go test ./customapps/ ./internal/mcp/
```

If you created the app over MCP, `list_apps` is the same check: it reads the
live registry, so an app that is on disk and not in that output did not load.

Then open `/apps/<slug>` **in both languages**. An app verified only in English
is an app whose Arabic has never rendered.

## When it does not appear

`GET /api/builder/apps/_health` — or `togo-builder app list`, which prints the
same rejections — names your app and says what was wrong with it. Every failure
is one sentence, and every sentence starts with the slug.

| `problems` says | Cause |
|---|---|
| `no app.json` | the directory has no manifest |
| `parse app.json: …` | the manifest is not JSON |
| `slug "x" does not match the directory name` | rename one to match the other |
| `slug "issues" is reserved by a built-in screen` | pick another name |
| `ui.js is missing` | the file named by `ui` does not exist |
| `ui "../x" must be a file name…` | `ui` is a name, not a path |
| `init failed: …` | your `Init` returned an error; the app was dropped |
| `already registered` | two `Register` calls share a slug |
| nothing at all, and no tile | wrong directory — check `dir` in `_health` |

Edited `ui.js` and nothing changed? It is served `no-store`, so reload. Edited
`app.json`? `POST /_reload`. Added a compiled app's `Routes`? Restart — chi
seals a mux once it serves, so a new subtree cannot be mounted live.

## Failure isolation — the property to preserve

A custom app is code nobody on the builder's side reviewed. **One broken app
costs exactly one tile.** A malformed manifest, a missing module, an `Init` that
errors, a `ui.js` that throws on import — each is logged, recorded in
`problems`, and skipped. The provider returns `nil` in every path.

If you touch `customapps`, keep it that way. The SDK's promise is that it stays
up when the product it watches is broken; an extension point that can take the
builder down with it breaks that promise at the worst possible moment.

## Hard refusals

- Editing builder's source to install an app
- Adding a route to `router.tsx` for a custom app
- Enumerating app slugs anywhere — the registry is the list
- DDL from `Init` or a handler
- A physical CSS property (`ml-`, `text-left`) in `ui.js`
- An English-only string
- A `panic` anywhere in an app's Go half
- Filing an issue asking a human to run `app new` — you have `create_app`
- Reporting an app as done while it still renders the generated counter
- Registering `create_app` on the feedback MCP server

## Related

- `togo-plugin` — the `init()` + blank-import mechanism this is built on
- `feedback-sdk` — the launcher your tile appears in
- `web-best-practices` — the UI rules, in full
- `togo-migrate` — shipping a compiled app's schema correctly
