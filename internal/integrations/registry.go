// Package integrations is the catalogue behind the Connections app.
//
// A connection used to be one shape — a thing polled on a schedule — and the UI
// was a list of them. That was wrong in a way that showed up the moment a second
// shape appeared: "connect Claude Code" and "connect a Postgres database" have
// almost nothing in common except the word connect. One is an interactive login
// in a terminal that stores no credential of ours at all; the other is a DSN we
// hold in a vault.
//
// So an integration DECLARES what it is, and the app renders from that:
//
//	Category    where it appears in the gallery
//	Auth        what the Connect button does — the single biggest difference
//	Collects    can it read into the brain
//	Acts        can it send outward
//	Inputs      a JSON schema; one schema, rendered as a form and validated
//
// The point of making "cannot act" a DECLARED property rather than an absence
// is that a reader like RSS should be visibly read-only in the UI, not merely
// missing an actions list — an operator asking "can this post to my site?"
// deserves an answer rather than an empty section.

package integrations

import (
	"encoding/json"
	"sort"
	"sync"
)

// Text is a localized label.
type Text struct {
	EN string `json:"en"`
	AR string `json:"ar"`
}

// Category groups integrations in the gallery.
type Category string

const (
	// CatTerminal — connect by running the vendor's own login in a terminal.
	CatTerminal Category = "terminal"
	// CatAPI — token or OAuth; can usually both receive and send.
	CatAPI Category = "api"
	// CatDatabase — a DSN we connect with directly.
	CatDatabase Category = "database"
	// CatReader — read-only collectors. No actions, by nature not by omission.
	CatReader Category = "reader"
	// CatAnalytics — measurement properties and submission endpoints.
	CatAnalytics Category = "analytics"
)

// Auth is HOW an operator connects, and it decides what the Connect button does.
type Auth string

const (
	// AuthTerminal opens an interactive session and runs the vendor's login.
	//
	// The important property: we never see or store the credential. `gh auth
	// login` writes gh's own config file; `claude login` writes Claude Code's.
	// That is why these integrations are not blocked by SF-001 — there is no
	// secret of ours to grant.
	AuthTerminal Auth = "terminal"
	// AuthToken stores a named secret in the vault (SF-001 applies).
	AuthToken Auth = "token"
	// AuthDSN stores a connection string in the vault (SF-001 applies).
	AuthDSN Auth = "dsn"
	// AuthOAuth is a redirect dance. Not implemented yet; declared so the
	// gallery can show "coming soon" honestly rather than offering a button
	// that fails.
	AuthOAuth Auth = "oauth"
	// AuthNone needs no credential at all — a public RSS feed, a self-hosted
	// SearXNG with anonymous access.
	AuthNone Auth = "none"
)

// Terminal describes how a CatTerminal integration logs in and reports status.
type Terminal struct {
	// Bin is the executable, checked for presence before anything else. A
	// missing binary is the most common reason a connect does nothing, and it
	// deserves "gh is not installed" rather than a blank terminal.
	Bin string `json:"bin"`
	// Install is what to tell the operator when Bin is absent.
	Install Text `json:"install"`
	// Login is the interactive command. It runs in a tmux session the operator
	// attaches to, because these prompts ask questions — a device code to
	// paste, a browser to approve, a project to pick — and answering them is
	// the whole point.
	Login []string `json:"login"`
	// Status is a NON-interactive command whose exit code answers "is this
	// connected?". It must never block waiting for input; a status check that
	// hangs looks identical to one that failed.
	Status []string `json:"status"`
	// Version reports the installed version for display.
	Version []string `json:"version"`
	// Logout undoes it, so an operator can disconnect from the same screen.
	Logout []string `json:"logout"`
}

// Integration is one entry in the catalogue.
type Integration struct {
	Slug     string   `json:"slug"`
	Title    Text     `json:"title"`
	Summary  Text     `json:"summary"`
	Category Category `json:"category"`
	Auth     Auth     `json:"auth"`

	// Icon is a glyph name from the shell's inlined set.
	Icon  string `json:"icon"`
	Color string `json:"color"`

	// Collects: can pull content into the brain.
	Collects bool `json:"collects"`
	// Acts: can send outward. False here is a STATEMENT — see the package doc.
	Acts bool `json:"acts"`

	// ActorKind links to internal/actors when Acts is true. Empty otherwise.
	ActorKind string `json:"actorKind,omitempty"`
	// SourceKind links to internal/sources when Collects is true.
	SourceKind string `json:"sourceKind,omitempty"`

	// Inputs is a JSON Schema for this integration's own configuration. One
	// schema, two consumers: the form the operator fills, and server-side
	// validation. Two copies is how a field ends up optional in one and
	// required in the other.
	Inputs json.RawMessage `json:"inputs"`

	// Terminal is set when Auth is AuthTerminal.
	Terminal *Terminal `json:"terminal,omitempty"`

	// DocsURL is the vendor's own setup page.
	DocsURL string `json:"docsUrl,omitempty"`

	// Beta marks an integration that is declared but not finished. The gallery
	// shows it as unavailable rather than hiding it, so "is X supported?" has a
	// visible answer.
	Beta bool `json:"beta,omitempty"`
}

var (
	mu      sync.RWMutex
	catalog = map[string]Integration{}
)

// Register adds an integration. Called from init() in the per-category files.
func Register(i Integration) {
	mu.Lock()
	defer mu.Unlock()
	if _, dup := catalog[i.Slug]; dup {
		panic("integrations: duplicate slug " + i.Slug)
	}
	if i.Inputs == nil {
		i.Inputs = json.RawMessage(`{"type":"object","properties":{}}`)
	}
	catalog[i.Slug] = i
}

// Get returns one integration.
func Get(slug string) (Integration, bool) {
	mu.RLock()
	defer mu.RUnlock()
	i, ok := catalog[slug]
	return i, ok
}

// All returns the catalogue, ordered for display: by category in the order the
// gallery shows them, then alphabetically within a category.
func All() []Integration {
	mu.RLock()
	defer mu.RUnlock()

	order := map[Category]int{
		CatTerminal: 0, CatAPI: 1, CatDatabase: 2, CatReader: 3, CatAnalytics: 4,
	}
	out := make([]Integration, 0, len(catalog))
	for _, i := range catalog {
		out = append(out, i)
	}
	sort.Slice(out, func(a, b int) bool {
		if order[out[a].Category] != order[out[b].Category] {
			return order[out[a].Category] < order[out[b].Category]
		}
		return out[a].Slug < out[b].Slug
	})
	return out
}

// ByCategory groups the catalogue for the gallery.
func ByCategory() map[Category][]Integration {
	out := map[Category][]Integration{}
	for _, i := range All() {
		out[i.Category] = append(out[i.Category], i)
	}
	return out
}

// Categories in display order, with their labels.
func Categories() []struct {
	Key   Category `json:"key"`
	Title Text     `json:"title"`
	Help  Text     `json:"help"`
} {
	return []struct {
		Key   Category `json:"key"`
		Title Text     `json:"title"`
		Help  Text     `json:"help"`
	}{
		{CatTerminal, Text{EN: "Developer tools", AR: "أدوات المطوّر"},
			Text{EN: "Connected by signing in through their own command line. Nothing is stored here — the tool keeps its own credential.",
				AR: "يتم الاتصال عبر تسجيل الدخول من سطر الأوامر الخاص بها. لا نخزّن شيئًا — الأداة تحتفظ ببيانات اعتمادها."}},
		{CatAPI, Text{EN: "Messaging & APIs", AR: "المراسلة وواجهات البرمجة"},
			Text{EN: "Two-way: they can send you events and you can send messages back.",
				AR: "ثنائية الاتجاه: ترسل إليك الأحداث ويمكنك إرسال الرسائل."}},
		{CatDatabase, Text{EN: "Databases", AR: "قواعد البيانات"},
			Text{EN: "Read rows on a schedule and keep them in the brain. Read-only.",
				AR: "قراءة الصفوف دوريًا وحفظها في الذاكرة. للقراءة فقط."}},
		{CatReader, Text{EN: "Readers", AR: "القارئات"},
			Text{EN: "Collect content from the web. These cannot send anything anywhere.",
				AR: "تجمع المحتوى من الويب. لا يمكنها إرسال أي شيء."}},
		{CatAnalytics, Text{EN: "Analytics & indexing", AR: "التحليلات والفهرسة"},
			Text{EN: "Measurement properties and search-engine submission.",
				AR: "خصائص القياس وإرسال البيانات لمحركات البحث."}},
	}
}
