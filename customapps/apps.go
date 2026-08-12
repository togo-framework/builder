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
	//
	// Retained as the shorthand for the overwhelmingly common case. `Content`
	// below is the general form; when Content is unset, an app with a UI is
	// exactly equivalent to Content{Kind: "module", Entry: m.UI}.
	UI string `json:"ui,omitempty"`

	// Content is what the shell puts INSIDE the window.
	//
	// `UI` already answers this for a disk app that ships an ES module, which
	// is why FeedbackOS builds on customapps rather than on os.AppMeta —
	// os.AppMeta carries slug/name/icon/color/category/window and nothing that
	// says what to render, which is why no third-party OS app has ever shown a
	// window.
	//
	// The discriminator exists because "an ES module from this app's directory"
	// is not the only honest answer. A compiled app has no directory. A
	// dashboard screen that already exists is a route, not a module. An app
	// that wraps something external is an iframe, and must be treated as
	// untrusted rather than loaded into the shell's own realm.
	//
	// Open on purpose: an unknown Kind renders a "this app needs a newer
	// builder" tile rather than failing the whole registry, so an older shell
	// meeting a newer app degrades to one broken tile.
	Content *Content `json:"content,omitempty"`

	// Window is the geometry the shell opens this app at. Zero values mean
	// "shell decides" — an app should not have to care, and most should not.
	Window *WindowSpec `json:"window,omitempty"`

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

// ContentKind names how a window gets filled. Compared as a string and never
// exhaustively switched without a default — see Manifest.Content.
type ContentKind string

const (
	// ContentModule is an ES module the shell imports and calls mount(host) on.
	// The default, and the only kind that runs in the shell's own realm.
	ContentModule ContentKind = "module"

	// ContentIframe is a URL rendered in a nested frame. Used for anything we
	// do not trust with our DOM — third-party tools, external dashboards. The
	// shell still draws the window chrome, so an iframe app is not visually a
	// second-class citizen; it simply cannot reach us.
	ContentIframe ContentKind = "iframe"

	// ContentBuiltin is a screen compiled into the shell bundle, addressed by
	// name (the issue composer, connections, the board). No network fetch.
	ContentBuiltin ContentKind = "builtin"

	// ContentRoute is an existing dashboard route rendered inside a window
	// rather than as a page. This is how the twenty-odd screens that already
	// exist become apps without being rewritten.
	ContentRoute ContentKind = "route"
)

// Content says what to render in the window.
type Content struct {
	Kind ContentKind `json:"kind"`

	// Entry is interpreted per Kind: a module file name, an absolute URL for
	// an iframe, a builtin's name, or a dashboard path for a route.
	Entry string `json:"entry"`

	// Permissions the app declares it needs. The scoped token minted for
	// cross-origin content is restricted to the intersection of these and the
	// CALLER's own abilities — an app cannot request its way to more than the
	// person using it already has.
	Permissions []string `json:"permissions,omitempty"`

	// Sandbox overrides the iframe sandbox attribute for ContentIframe. Empty
	// means the default, which deliberately withholds same-origin.
	Sandbox string `json:"sandbox,omitempty"`
}

// WindowSpec is the geometry an app opens at. Mirrors os.WindowSpec, plus the
// minimums — a composer that collapses below its two-column layout is not
// usable, and only the app knows where that line is.
type WindowSpec struct {
	Width     int  `json:"width,omitempty"`
	Height    int  `json:"height,omitempty"`
	MinWidth  int  `json:"minWidth,omitempty"`
	MinHeight int  `json:"minHeight,omitempty"`
	Resizable bool `json:"resizable,omitempty"`
}

// ResolveContent returns the effective content for a manifest, applying the
// `UI` shorthand.
//
// Kept as a function rather than folded into parseManifest so that a manifest
// round-trips unchanged through JSON: an app.json that said `"ui": "ui.js"`
// still says exactly that when read back, instead of silently acquiring a
// Content block it never wrote.
func (m Manifest) ResolveContent() Content {
	if m.Content != nil && m.Content.Kind != "" {
		return *m.Content
	}
	entry := m.UI
	if entry == "" {
		entry = "ui.js"
	}
	return Content{Kind: ContentModule, Entry: entry}
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
	if c := m.Content; c != nil && c.Kind != "" {
		if strings.TrimSpace(c.Entry) == "" {
			return fmt.Errorf("content.entry is required when content.kind is set")
		}
		switch c.Kind {
		case ContentModule:
			// Same constraint as UI, and for the same reason: the entry is
			// joined against the app's own directory, so a path escapes it.
			if strings.ContainsAny(c.Entry, `/\`) {
				return fmt.Errorf("content.entry %q must be a file name in the app directory, not a path", c.Entry)
			}
		case ContentIframe:
			// Absolute https only. A relative URL would resolve against the
			// SHELL's origin, which is the one origin an untrusted app must not
			// be able to address — that is the whole reason it is in a frame.
			if !strings.HasPrefix(c.Entry, "https://") {
				return fmt.Errorf("content.entry %q must be an absolute https:// URL for an iframe app", c.Entry)
			}
		case ContentBuiltin:
			if strings.ContainsAny(c.Entry, `/\ `) {
				return fmt.Errorf("content.entry %q must be a bare builtin name", c.Entry)
			}
		case ContentRoute:
			if !strings.HasPrefix(c.Entry, "/") {
				return fmt.Errorf("content.entry %q must be a dashboard path beginning with /", c.Entry)
			}
		default:
			// Deliberately NOT an error. An unknown kind is an app built for a
			// newer builder; it renders one "needs an upgrade" tile instead of
			// failing the registry and taking every other app down with it.
		}
	}
	if w := m.Window; w != nil {
		if w.Width < 0 || w.Height < 0 || w.MinWidth < 0 || w.MinHeight < 0 {
			return fmt.Errorf("window dimensions must not be negative")
		}
		if w.Width > 0 && w.MinWidth > w.Width {
			return fmt.Errorf("window.minWidth (%d) exceeds window.width (%d)", w.MinWidth, w.Width)
		}
		if w.Height > 0 && w.MinHeight > w.Height {
			return fmt.Errorf("window.minHeight (%d) exceeds window.height (%d)", w.MinHeight, w.Height)
		}
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
