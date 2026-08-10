package customapps

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ScaffoldOptions drives `togo-builder app new`.
type ScaffoldOptions struct {
	// Slug is the app's identity. Everything else has a default derived from it.
	Slug string
	// Root is the apps directory. Defaults to "apps".
	Root string

	TitleEN string
	TitleAR string
	DescEN  string
	DescAR  string
	Icon    string
	Color   string
	Order   int

	// Go writes a compiled-app skeleton next to the drop-in files, for an app
	// that needs a database and real handlers. Its package still has to be
	// blank-imported by the host project — the generated file says where.
	Go bool
	// GoModule is the host project's module path, used to print the import line
	// the operator has to add. Read from go.mod when empty.
	GoModule string

	Force bool
}

// ScaffoldResult reports what was written.
type ScaffoldResult struct {
	Dir      string
	Files    []string
	Manifest Manifest
	// GoImport is the blank-import line to add to internal/plugins/local.go,
	// empty unless Go was requested.
	GoImport string
}

// Scaffold writes a working custom app.
//
// "Working" is the bar: the generated app boots, appears in the launcher, opens
// to a real screen, reads and writes its own state, and mirrors in Arabic —
// with no further wiring. A skeleton that needs three more edits before it
// renders anything teaches the wrong contract.
func Scaffold(o ScaffoldOptions) (ScaffoldResult, error) {
	var res ScaffoldResult

	o.Slug = strings.TrimSpace(strings.ToLower(o.Slug))
	if o.Root == "" {
		o.Root = "apps"
	}
	if o.TitleEN == "" {
		o.TitleEN = titleCase(o.Slug)
	}
	if o.TitleAR == "" {
		// Deliberately the English title rather than a machine translation: a
		// wrong Arabic string is harder to notice than an untranslated one, and
		// the SKILL.md tells the author to replace it.
		o.TitleAR = o.TitleEN
	}
	if o.DescEN == "" {
		o.DescEN = fmt.Sprintf("A custom builder app: %s.", o.TitleEN)
	}
	if o.DescAR == "" {
		o.DescAR = o.DescEN
	}
	if o.Icon == "" {
		o.Icon = "app"
	}
	if o.Color == "" {
		o.Color = pickColor(o.Slug)
	}
	if o.Order == 0 {
		o.Order = 100
	}

	m := Manifest{
		Slug:        o.Slug,
		Title:       Text{EN: o.TitleEN, AR: o.TitleAR},
		Description: Text{EN: o.DescEN, AR: o.DescAR},
		Icon:        o.Icon,
		Color:       o.Color,
		Order:       o.Order,
		UI:          "ui.js",
	}
	if err := validate(m); err != nil {
		return res, fmt.Errorf("invalid app: %w", err)
	}

	// Safe to join only because the slug passed validate() above: it matches
	// ^[a-z0-9][a-z0-9-]{1,63}$, which contains no separator, no dot and no
	// colon, so it cannot climb out of Root. The order is load-bearing —
	// validate BEFORE anything touches the filesystem.
	dir := filepath.Join(o.Root, o.Slug)
	if _, err := os.Stat(dir); err == nil && !o.Force {
		return res, fmt.Errorf("%s: %w", dir, ErrExists)
	} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return res, fmt.Errorf("stat %s: %w", dir, err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return res, fmt.Errorf("create %s: %w", dir, err)
	}

	manifestJSON, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return res, fmt.Errorf("encode manifest: %w", err)
	}
	files := map[string][]byte{
		manifestFile: append(manifestJSON, '\n'),
		"ui.js":      []byte(uiTemplate(m)),
		"README.md":  []byte(readmeTemplate(m, dir)),
	}
	if o.Go {
		module := o.GoModule
		if module == "" {
			module = readModule()
		}
		if module == "" {
			module = "example.com/yourproject"
		}
		files["backend.go"] = []byte(goTemplate(m, module))
		res.GoImport = fmt.Sprintf("_ %q", module+"/"+filepath.ToSlash(dir))
	}

	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, files[name], 0o644); err != nil {
			return res, fmt.Errorf("write %s: %w", p, err)
		}
		res.Files = append(res.Files, p)
	}

	res.Dir = dir
	res.Manifest = m
	return res, nil
}

// readModule reads the module path from ./go.mod, best effort.
func readModule() string {
	raw, err := os.ReadFile("go.mod")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(raw), "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(line), "module "); ok {
			return strings.TrimSpace(rest)
		}
	}
	return ""
}

func titleCase(slug string) string {
	parts := strings.Split(slug, "-")
	for i, p := range parts {
		if p == "" {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, " ")
}

// pickColor is deterministic per slug so re-scaffolding gives the same tile,
// and drawn from a fixed set so custom tiles look like they belong beside the
// built-in ten rather than beside each other.
func pickColor(slug string) string {
	palette := []string{"#6366f1", "#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#a855f7", "#0891b2", "#eab308"}
	var sum int
	for _, r := range slug {
		sum += int(r)
	}
	return palette[sum%len(palette)]
}

func uiTemplate(m Manifest) string {
	return `// ` + m.Title.EN + ` — a builder custom app.
//
// This file is an ES module served at /api/builder/apps/` + m.Slug + `/ui.js and
// imported by the builder's /apps/` + m.Slug + ` route. There is no build step: what you
// write here is what runs.
//
// The contract is one exported function.
//
//   export default function mount(host, ctx) { ...; return () => cleanup }
//
//   host  an empty HTMLElement to render into. It is yours.
//   ctx   { slug, manifest, lang, dir, t, api, state, navigate }
//           lang     "en" | "ar"
//           dir      "ltr" | "rtl"
//           t(en,ar) picks the string for the current language
//           api      fetch wrapper scoped to /api/builder/apps/` + m.Slug + `/api
//           state    { get(), put(obj) } — a JSON blob stored beside this file
//           navigate(to) — router navigation, e.g. navigate("/issues")
//
//   The return value, if a function, is called on unmount.
//
// Rules that apply here exactly as they do in the rest of the app:
//   - logical CSS only: ms-/me-/ps-/pe-/text-start/text-end. Never ml-/mr-/text-left.
//   - every string bilingual, through t().
//   - no console.log.

export default function mount(host, ctx) {
  const { t, state } = ctx;

  // No title and no description here. The route already draws the page header
  // from this app's manifest — rendering them again produced the same heading
  // twice, in both languages, which is what this comment exists to prevent.
  host.className = "w-full min-w-0";

  // A counter, persisted through the app's own state store. It is here to
  // prove the round trip works before you delete it.
  const card = document.createElement("div");
  card.className = "rounded-lg border border-border bg-card p-4";

  const count = document.createElement("p");
  count.className = "text-sm text-card-foreground";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm " +
    "font-medium text-primary-foreground transition-colors hover:opacity-90 " +
    "disabled:opacity-50";
  button.textContent = t("Count one more", "زد واحدًا");

  let n = 0;
  const render = () => {
    count.textContent = t("Counted " + n + " times.", "تم العد " + n + " مرة.");
  };

  const fail = (message) => {
    count.textContent = t("Could not reach the state store.", "تعذّر الوصول إلى مخزن الحالة.");
    // Surfaced in the UI rather than the console: a message only the developer
    // tools can see is a message the operator never gets.
    card.dataset.error = message;
  };

  state
    .get()
    .then((s) => {
      n = Number(s && s.count) || 0;
      render();
    })
    .catch((e) => fail(String(e)));

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      n += 1;
      await state.put({ count: n });
      render();
    } catch (e) {
      fail(String(e));
    } finally {
      button.disabled = false;
    }
  });

  card.append(count, button);
  host.append(card);

  return () => host.replaceChildren();
}
`
}

func goTemplate(m Manifest, module string) string {
	pkg := strings.ReplaceAll(m.Slug, "-", "")
	return `// Package ` + pkg + ` is the backend half of the "` + m.Slug + `" custom app.
//
// A compiled app registers itself the way every togo provider does: init()
// calls customapps.Register, and the host project blank-imports this package.
// Nothing in builder names this app.
//
// To activate it, add this line to internal/plugins/local.go:
//
//	_ "` + module + `/apps/` + m.Slug + `"
//
// Then restart. Routes registered below are mounted at
// /api/builder/apps/` + m.Slug + `/api/* behind the session middleware, so a handler
// may read the caller with auth.IdentityFrom(r.Context()).
package ` + pkg + `

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/builder/customapps"
)

type service struct {
	db  *sql.DB
	log *slog.Logger
}

var svc service

func init() {
	customapps.Register(customapps.App{
		Manifest: customapps.Manifest{
			Slug:        ` + goString(m.Slug) + `,
			Title:       customapps.Text{EN: ` + goString(m.Title.EN) + `, AR: ` + goString(m.Title.AR) + `},
			Description: customapps.Text{EN: ` + goString(m.Description.EN) + `, AR: ` + goString(m.Description.AR) + `},
			Icon:        ` + goString(m.Icon) + `,
			Color:       ` + goString(m.Color) + `,
			Order:       ` + fmt.Sprint(m.Order) + `,
		},
		Init: func(ctx customapps.Context) error {
			// Return an error only for something that makes the app
			// structurally unusable. It is logged and the app is dropped; the
			// builder still boots.
			svc = service{db: ctx.DB, log: ctx.Log}
			return nil
		},
		Routes: func(r chi.Router) {
			r.Get("/ping", svc.handlePing)
		},
	})
}

func (s service) handlePing(w http.ResponseWriter, r *http.Request) {
	// No DDL here, and none at boot. Ship a migration and let the host apply it
	// with ` + "`togo migrate`" + ` — a provider that creates its own tables is the
	// failure the migration rule exists to prevent.
	if s.db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "this app booted without a database",
		})
		return
	}
	var one int
	if err := s.db.QueryRowContext(r.Context(), "SELECT 1").Scan(&one); err != nil {
		s.log.Warn("` + m.Slug + `: ping failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "database unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "app": ` + goString(m.Slug) + `})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_ = fmt.Errorf("encode response: %w", err)
	}
}
`
}

func readmeTemplate(m Manifest, dir string) string {
	return "# " + m.Title.EN + "\n\n" +
		m.Description.EN + "\n\n" +
		"A builder custom app. It was discovered at boot by reading `" + dir + "` —\n" +
		"no file in builder names it, and installing it required no edit to builder's source.\n\n" +
		"| | |\n|---|---|\n" +
		"| Route | `/apps/" + m.Slug + "` |\n" +
		"| Manifest | `" + manifestFile + "` |\n" +
		"| UI module | `" + m.UI + "` — one default export, `mount(host, ctx)` |\n" +
		"| State | `state.json`, read and written through `ctx.state` |\n" +
		"| Launcher | the tile is drawn from `title`, `icon` and `color` |\n\n" +
		"## Editing\n\n" +
		"`" + m.UI + "` is served with `Cache-Control: no-store`, so a reload picks up an edit.\n" +
		"Changing `" + manifestFile + "` needs a rescan:\n\n" +
		"```bash\ncurl -X POST -b <session> localhost:8080/api/builder/apps/_reload\n```\n\n" +
		"## When it does not appear\n\n" +
		"```bash\ncurl -s -b <session> localhost:8080/api/builder/apps/_health | jq\n```\n\n" +
		"`problems` names the app and says what was wrong with it.\n\n" +
		"## Rules\n\n" +
		"- Logical CSS only — `ms-`/`me-`/`ps-`/`pe-`, never `ml-`/`mr-`/`text-left`.\n" +
		"- Every string bilingual, through `ctx.t(en, ar)`.\n" +
		"- No `console.log`; surface failures in the UI.\n" +
		"- No DDL from the app. Ship a migration.\n"
}

// jsString and goString quote a value for embedding in generated source. Both
// go through encoding/json, whose escaping is valid in both languages for the
// strings involved here — and which cannot be tricked by a title containing a
// quote, which naive concatenation would turn into a syntax error.
func jsString(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return `""`
	}
	return string(b)
}

func goString(s string) string { return jsString(s) }
