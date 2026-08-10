// Package customapps is builder's custom-app extension point: a way to add a screen
// to the builder — a tile in the SDK launcher and a route of its own — without
// editing builder's source.
//
// There are two kinds of custom app, and they are the same app to everything
// downstream:
//
//   - A DISCOVERED app is a directory under BUILDER_APPS_DIR holding an
//     app.json manifest and a ui.js ES module. Nothing is compiled and nothing
//     is imported: it is found at boot by reading the directory. This is the
//     drop-in case, and it is the one the CLI scaffolds.
//
//   - A COMPILED app calls Register from its own init() and is blank-imported
//     by the host project, exactly the way a togo plugin registers a provider.
//     It gets a *sql.DB, a *slog.Logger and a chi router of its own, so it can
//     do real backend work. Its UI is still a ui.js module, served either from
//     disk or from an fs.FS the app hands over.
//
// Nothing here may take the builder down. The SDK's promise is that it stays up
// when the product it watches is broken, and a custom app is by definition code
// nobody on this side reviewed: a malformed manifest, an unreadable directory,
// an app whose Init returns an error — each is logged and skipped, and the boot
// continues with one fewer app.
package customapps

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
)

// A slug is a URL path segment, a directory name and a DOM id all at once, so
// it is a slug and nothing else. Identical to the rule internal/skills applies
// to a skill name, for the same reason.
var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,63}$`)

// reserved names would resolve to one of the builder's own screens. Custom apps
// live under /apps/<slug> so there is no route collision today, but the launcher
// keys them by slug and a second "issues" tile would be indistinguishable from
// the real one.
var reserved = map[string]bool{
	"agents": true, "skills": true, "issues": true, "vault": true,
	"sources": true, "docs": true, "library": true, "brain": true,
	"chat": true, "mcp": true, "terminal": true, "dashboard": true,
	"setup": true, "profile": true, "admin": true, "login": true,
	"register": true, "reset": true, "apps": true, "api": true,
}

// Text is one user-facing string in both languages.
//
// Bilingual at the contract level rather than at the renderer's: an app that
// ships only English is a permanent English island inside an app that mirrors,
// and there is no later pass that fixes it. AR falls back to EN when empty, so
// the requirement is visible without being a barrier to a first commit.
type Text struct {
	EN string `json:"en"`
	AR string `json:"ar"`
}

// Get returns the string for a language tag, falling back to English.
func (t Text) Get(lang string) string {
	if strings.HasPrefix(strings.ToLower(lang), "ar") && t.AR != "" {
		return t.AR
	}
	return t.EN
}

// Manifest is app.json. It is also exactly what GET /api/builder/apps returns,
// so there is one shape to learn rather than a disk format and a wire format
// that drift apart.
type Manifest struct {
	Slug        string `json:"slug"`
	Title       Text   `json:"title"`
	Description Text   `json:"description,omitempty"`

	// Icon is a lucide glyph name. The SDK launcher carries a small inlined set
	// and falls back to a generic tile for anything it does not have; the web
	// route resolves the full lucide-react set.
	Icon string `json:"icon,omitempty"`

	// Color is the launcher tile fill, #rrggbb. Fixed per app rather than
	// derived, for the reason the built-in ten are fixed: a hash-derived palette
	// reshuffles the whole grid the day one app is renamed.
	Color string `json:"color,omitempty"`

	// Order sorts the launcher. Built-ins occupy 0..99; custom apps default to
	// 100 so they land after them.
	Order int `json:"order,omitempty"`

	// UI is the ES module served at /api/builder/apps/<slug>/ui.js, relative to
	// the app directory. Defaults to "ui.js".
	UI string `json:"ui,omitempty"`

	// Source is set by the registry, never by app.json: "disk" for a discovered
	// app, "compiled" for one registered from Go. Read-only to the app.
	Source string `json:"source,omitempty"`

	// HasAPI reports whether the app mounted backend routes under
	// /api/builder/apps/<slug>/api. Set by the registry.
	HasAPI bool `json:"hasApi,omitempty"`

	// Path is the app's directory, reported so an operator can find the files
	// that produced a broken tile. Empty for a compiled app with no directory.
	Path string `json:"path,omitempty"`
}

// Context is what a compiled app receives at boot.
//
// A struct rather than four arguments so a later addition does not break every
// app that already exists — the same reason togo hands providers a *Kernel.
type Context struct {
	// DB is the application's database. Nil when the app booted without one:
	// check it. A custom app must not CREATE TABLE here — ship migrations and
	// let the host apply them, exactly as a togo plugin does.
	DB *sql.DB

	// Log is already scoped with the app's slug.
	Log *slog.Logger

	// Dir is the app's directory on disk, or "" for a compiled app that carries
	// its UI in an embedded FS instead.
	Dir string
}

// App is what Register takes.
type App struct {
	// Manifest is required. Slug, Title.EN and a valid slug shape are checked.
	Manifest Manifest

	// Init runs once at boot, after the registry has a database and a logger.
	// Optional. An error is logged and the app is dropped — it never fails the
	// boot, because a third-party app must not be able to stop the builder.
	Init func(ctx Context) error

	// Routes mounts the app's own HTTP surface at
	// /api/builder/apps/<slug>/api/*. Optional. The router it receives is
	// already behind the session middleware, so handlers may read the caller
	// with auth.IdentityFrom(r.Context()).
	Routes func(r chi.Router)

	// UIFS serves the app's ui.js when it has no directory on disk. Optional;
	// a disk directory wins when both are present.
	UIFS fs.FS
}

// registry holds the compiled apps. Package-global because Register is called
// from init(), which is the whole point: the app wires itself in, and no file
// in builder names it.
var registry = struct {
	mu   sync.RWMutex
	apps map[string]App
}{apps: map[string]App{}}

// Register wires a compiled custom app. Call it from init().
//
// It never panics and never returns an error, because it runs during package
// initialisation where there is nobody to hand a failure to. An invalid or
// duplicate app is dropped and reported later by Validate, which the provider
// logs at boot — a silent no-op would be the worst of both worlds.
func Register(a App) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if err := validate(a.Manifest); err != nil {
		invalid = append(invalid, fmt.Sprintf("%s: %v", a.Manifest.Slug, err))
		return
	}
	if _, dup := registry.apps[a.Manifest.Slug]; dup {
		invalid = append(invalid, fmt.Sprintf("%s: already registered", a.Manifest.Slug))
		return
	}
	a.Manifest.Source = "compiled"
	a.Manifest.HasAPI = a.Routes != nil
	registry.apps[a.Manifest.Slug] = a
}

// invalid collects what Register threw away, so provideApps can say so at boot
// instead of an operator wondering why their app never appeared.
var invalid []string

// Registered returns the compiled apps, sorted by order then slug.
func Registered() []App {
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	out := make([]App, 0, len(registry.apps))
	for _, a := range registry.apps {
		out = append(out, a)
	}
	sortApps(out)
	return out
}

// RegistrationErrors returns what Register rejected.
func RegistrationErrors() []string {
	registry.mu.RLock()
	defer registry.mu.RUnlock()
	return append([]string(nil), invalid...)
}

func sortApps(a []App) {
	sort.Slice(a, func(i, j int) bool {
		if a[i].Manifest.Order != a[j].Manifest.Order {
			return a[i].Manifest.Order < a[j].Manifest.Order
		}
		return a[i].Manifest.Slug < a[j].Manifest.Slug
	})
}

// validate checks a manifest hard enough that a bad one is a sentence rather
// than a 500 three screens later.
func validate(m Manifest) error {
	if !slugRe.MatchString(m.Slug) {
		return fmt.Errorf("slug %q must match %s", m.Slug, slugRe)
	}
	if reserved[m.Slug] {
		return fmt.Errorf("slug %q is reserved by a built-in screen", m.Slug)
	}
	if strings.TrimSpace(m.Title.EN) == "" {
		return fmt.Errorf("title.en is required")
	}
	if m.Color != "" && !colorRe.MatchString(m.Color) {
		return fmt.Errorf("color %q must be #rrggbb", m.Color)
	}
	if strings.ContainsAny(m.UI, `/\`) {
		return fmt.Errorf("ui %q must be a file name in the app directory, not a path", m.UI)
	}
	return nil
}

var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// parseManifest reads app.json. Defaults are applied here so every consumer —
// the HTTP surface, the launcher, the CLI — sees the same completed manifest.
func parseManifest(raw []byte) (Manifest, error) {
	var m Manifest
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	if err := dec.Decode(&m); err != nil {
		return Manifest{}, fmt.Errorf("parse app.json: %w", err)
	}
	m.Slug = strings.TrimSpace(strings.ToLower(m.Slug))
	if m.UI == "" {
		m.UI = "ui.js"
	}
	if m.Order == 0 {
		m.Order = 100
	}
	if m.Color == "" {
		m.Color = "#64748b"
	}
	if m.Icon == "" {
		m.Icon = "app"
	}
	// Source is the registry's to set. An app.json claiming "compiled" would
	// otherwise mislabel itself in the operator's own listing.
	m.Source = ""
	m.HasAPI = false
	if err := validate(m); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
