package mcp

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/togo-framework/builder/customapps"
)

// Custom apps, created from inside a run.
//
// `togo-builder app new` already scaffolds one, and until now that was the only
// way in: a human at a shell. An agent that decides mid-issue the product needs
// a screen had nowhere to put it — it could file an issue asking someone to
// type the command, which is the situation the issue plane's MCP surface exists
// to remove for bugs.
//
// This tool is the same command reachable over MCP. It calls
// customapps.Scaffold — the function the CLI calls, not a copy of it — because
// two generators for one on-disk format drift, and the day they disagree is the
// day an app the loader rejects gets written by the path nobody tested.
//
// The threat model is different from the CLI's, though, and the differences are
// all restrictions:
//
//   - The caller cannot choose WHERE. The CLI takes --dir; this takes the
//     running registry's own root and nothing else, so "create an app" cannot
//     become "write a file into the repository".
//   - The caller cannot overwrite. The CLI takes --force; this refuses a slug
//     that is already taken, on disk or compiled in. An agent retrying a failed
//     step must not silently flatten the app the previous attempt wrote.
//   - Nothing here may take the builder down. A refusal is an error sentence, a
//     panic is caught and turned into one, and a scaffold that produces an app
//     the loader rejects is REPORTED as such rather than left for the operator
//     to find as a missing tile.

// createAppArgs mirrors the CLI's flags, minus the two an autonomous caller must
// not have: --dir and --force.
type createAppArgs struct {
	Slug    string `json:"slug" jsonschema:"the app's identity: lower-case letters, digits and hyphens, 2-64 chars. It is the directory name, the URL segment at /apps/<slug>, and the launcher key, all at once."`
	TitleEN string `json:"titleEn,omitempty" jsonschema:"English title. Defaults to the slug, title-cased."`
	TitleAR string `json:"titleAr,omitempty" jsonschema:"Arabic title. Supply it — the default is the English string, which ships a visibly untranslated tile."`
	DescEN  string `json:"descriptionEn,omitempty" jsonschema:"one line saying what the app is for"`
	DescAR  string `json:"descriptionAr,omitempty" jsonschema:"the same line in Arabic"`
	Icon    string `json:"icon,omitempty" jsonschema:"a lucide glyph name, e.g. docs. Unknown names draw a generic tile rather than failing."`
	Color   string `json:"color,omitempty" jsonschema:"the launcher tile fill as #rrggbb. Defaults to a colour derived from the slug."`
	Order   int    `json:"order,omitempty" jsonschema:"launcher position. Built-ins occupy 0..99; custom apps default to 100."`
	Go      bool   `json:"go,omitempty" jsonschema:"also write a compiled-app backend skeleton. It is NOT active until a human adds the blank import this tool returns and rebuilds — say so when you report back."`
}

// SetApps hands the MCP surface the live custom-app registry.
//
// Injected rather than constructed here because there is exactly one registry
// per process and it is the one serving /api/builder/apps: a second Service
// pointed at the same directory would scaffold into the right place and then
// rescan the wrong instance, so the app would be on disk and absent from the
// launcher until a restart. The apps provider boots after this service is
// built, which is why this is a setter and not a constructor argument.
func (s *Service) SetApps(a *customapps.Service) {
	s.appsMu.Lock()
	defer s.appsMu.Unlock()
	s.apps = a
}

func (s *Service) appsRegistry() *customapps.Service {
	s.appsMu.RLock()
	defer s.appsMu.RUnlock()
	return s.apps
}

// listApps is the read half: what exists, and what the loader refused.
//
// Read-only and therefore unguarded by the create lock. An agent is told to
// call this first for the same reason list_issues says so — the cheapest way to
// get two tiles that do one job is to not look.
func (s *Service) listApps(_ context.Context) (*mcp.CallToolResult, any, error) {
	reg := s.appsRegistry()
	if reg == nil {
		return nil, nil, fmt.Errorf("custom apps are not available on this install: the builder.apps provider did not start")
	}

	var b strings.Builder
	list := reg.List()
	if len(list) == 0 {
		fmt.Fprintf(&b, "No custom apps installed. They are read from %s.\n", reg.Root())
	}
	for _, m := range list {
		api := ""
		if m.HasAPI {
			api = "  api=/api/builder/apps/" + m.Slug + "/api"
		}
		fmt.Fprintf(&b, "%s — %s / %s  [%s, order %d]  route=/apps/%s%s\n",
			m.Slug, m.Title.EN, orText(m.Title.AR, "(no Arabic)"),
			orText(m.Source, "disk"), m.Order, m.Slug, api)
	}
	// The rejections matter more than the successes here: an operator asking
	// "where is my app" is asking this question, and the answer is in this list.
	if problems := reg.Problems(); len(problems) > 0 {
		b.WriteString("\nRejected by the last scan:\n")
		for _, p := range problems {
			fmt.Fprintf(&b, "  %s\n", p)
		}
	}
	return textResult(b.String()), nil, nil
}

// createLock serialises scaffolding within this process.
//
// Scaffold decides whether a directory exists and then creates it, which is two
// syscalls with a gap in between. One human at a terminal cannot lose that race;
// two agents working the same board can, and the loser would overwrite the
// winner's files under a check that had already passed.
var createLock sync.Mutex

func (s *Service) createApp(ctx context.Context, c *caller, a createAppArgs) (res *mcp.CallToolResult, _ any, err error) {
	// A custom app is third-party code and this is the seam that writes it. The
	// package's whole promise is that one bad app costs one tile — a panic here
	// would cost the process, which is the failure the SDK exists to survive.
	defer func() {
		if r := recover(); r != nil {
			s.log.Error("builder.apps: create_app panicked", "slug", a.Slug, "panic", r)
			res, err = nil, fmt.Errorf("create the app: the scaffolder failed unexpectedly (%v); nothing was left half-written that a rescan will load", r)
		}
	}()

	reg := s.appsRegistry()
	if reg == nil {
		return nil, nil, fmt.Errorf("custom apps are not available on this install: the builder.apps provider did not start, so there is no directory to write into and nothing would load what was written")
	}
	root := reg.Root()

	slug := strings.TrimSpace(strings.ToLower(a.Slug))
	if slug == "" {
		return nil, nil, fmt.Errorf("an app needs a slug")
	}
	// Containment, checked before anything is written and stated independently
	// of the slug FORMAT rule, which lives in customapps and stays there. This
	// says only "one path segment, beneath the apps directory" — the thing an
	// untrusted caller must not be able to talk its way out of.
	if err := beneath(root, slug); err != nil {
		return nil, nil, fmt.Errorf("refusing slug %q: %w", a.Slug, err)
	}

	createLock.Lock()
	defer createLock.Unlock()

	// Conflict, checked against the LIVE registry as well as the disk. Scaffold
	// stats the directory, which catches a drop-in app; a compiled app can hold
	// a slug with no directory at all, and scaffolding over it would produce two
	// apps that are one tile.
	for _, m := range reg.List() {
		if m.Slug == slug {
			return nil, nil, fmt.Errorf(
				"an app called %q already exists (source %s%s). Pick another slug, or edit it in place — overwriting is deliberately not reachable from here; it needs `togo-builder app new %s --force` from a human",
				slug, m.Source, pathSuffix(m.Path), slug)
		}
	}

	out, err := customapps.Scaffold(customapps.ScaffoldOptions{
		Slug:    slug,
		Root:    root, // the running registry's directory. Never the caller's.
		TitleEN: strings.TrimSpace(a.TitleEN),
		TitleAR: strings.TrimSpace(a.TitleAR),
		DescEN:  strings.TrimSpace(a.DescEN),
		DescAR:  strings.TrimSpace(a.DescAR),
		Icon:    strings.TrimSpace(a.Icon),
		Color:   strings.TrimSpace(a.Color),
		Order:   a.Order,
		Go:      a.Go,
		// Force is never set. See the note above.
	})
	if err != nil {
		return nil, nil, fmt.Errorf("scaffold %q: %w", slug, err)
	}

	// Rescan, so the app is live now rather than after the next restart. This is
	// the same Scan the boot runs and POST /api/builder/apps/_reload calls; it
	// cannot mount a compiled app's routes (chi seals a mux once it serves),
	// which is why the Go half is reported as needing a restart below.
	reg.Scan(ctx)

	live := false
	for _, m := range reg.List() {
		if m.Slug == slug {
			live = true
			break
		}
	}
	// Anything the scan refused that names this app. A generator whose output
	// the loader rejects is the one bug this pairing must never have, so it is
	// reported here rather than discovered as a missing tile.
	var refused []string
	for _, p := range reg.Problems() {
		if strings.HasPrefix(p, slug+":") || strings.HasPrefix(p, filepath.Base(out.Dir)+":") {
			refused = append(refused, p)
		}
	}

	s.log.Info("custom app created over mcp",
		"app", slug, "dir", out.Dir, "go", a.Go, "live", live, "token", tokenName(c))

	var b strings.Builder
	fmt.Fprintf(&b, "Created %s — %s\n\n", slug, out.Manifest.Title.EN)
	for _, f := range out.Files {
		fmt.Fprintf(&b, "  %s\n", f)
	}
	b.WriteString("\nIt is installed. No file in builder names it and no source was edited.\n\n")

	switch {
	case len(refused) > 0:
		// The files are on disk and the loader will not have them. Say so first
		// and plainly: an agent that reports "created" here is reporting a tile
		// that does not exist.
		b.WriteString("BUT IT DID NOT LOAD:\n")
		for _, p := range refused {
			fmt.Fprintf(&b, "  %s\n", p)
		}
		b.WriteString("\nFix the file it names, then call this tool again with a different slug, " +
			"or ask a human to POST /api/builder/apps/_reload after editing.\n")
	case live:
		fmt.Fprintf(&b, "It is live now — the registry was rescanned. Open /apps/%s; the tile is in the launcher.\n", slug)
	default:
		fmt.Fprintf(&b, "The files were written but %s is not in the registry after a rescan. "+
			"GET /api/builder/apps/_health names every app the scan refused and why.\n", slug)
	}

	if out.GoImport != "" {
		fmt.Fprintf(&b, "\nThe compiled half is NOT active yet. It needs one line in internal/plugins/local.go:\n\n  %s\n\n"+
			"and a rebuild + restart — chi seals a mux once it has served, so a new /api subtree cannot be mounted live. "+
			"Report that as an outstanding step; do not describe the backend as working.\n", out.GoImport)
	}

	b.WriteString("\nBefore you call this done: replace the counter in ui.js with the real screen, " +
		"and replace the Arabic title if you let it default to the English one. " +
		"Logical CSS only (ms-/me-/ps-/pe-), every string through ctx.t(en, ar), no console.log.\n")

	return textResult(b.String()), nil, nil
}

// beneath reports whether name is a single path segment that resolves inside
// root. filepath.Join cleans "../" away, so the check is on the resolved
// absolute path rather than on the string that was handed in.
func beneath(root, name string) error {
	if name != filepath.Base(name) || strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return fmt.Errorf("a slug is one directory name, not a path")
	}
	base, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve the apps directory: %w", err)
	}
	p, err := filepath.Abs(filepath.Join(base, name))
	if err != nil {
		return fmt.Errorf("resolve %q: %w", name, err)
	}
	if filepath.Dir(p) != base {
		return fmt.Errorf("%q would be written outside %s", name, base)
	}
	return nil
}

func pathSuffix(p string) string {
	if p == "" {
		return ""
	}
	return ", at " + p
}

// tokenName names the credential for the audit line. The caller is always set by
// requireToken on a live request; a nil one means a harness, and losing the log
// line must not lose the app.
func tokenName(c *caller) string {
	if c == nil {
		return "unknown"
	}
	return c.name
}
