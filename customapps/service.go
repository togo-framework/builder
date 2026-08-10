package customapps

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
)

const (
	manifestFile = "app.json"
	stateFile    = "state.json"

	// A drop-in app's state is a preferences blob, not a database. The cap is
	// low on purpose: an app that needs more than this needs a table, which
	// means it needs to be a compiled app with a migration.
	maxStateBytes = 1 << 20 // 1 MiB

	// A UI module larger than this is a bundled framework, and serving it from
	// a directory read on every request is the wrong shape for that.
	maxUIBytes = 8 << 20 // 8 MiB
)

// entry is one live app: its manifest plus wherever its files come from.
type entry struct {
	m Manifest
	// dir is the app's directory, "" for a compiled app with no disk presence.
	dir string
	// uiFS serves ui.js when dir is empty.
	uiFS fs.FS
	// routes is the compiled app's HTTP surface, nil for a discovered app.
	routes func(chi.Router)
}

// Service is the registry's runtime: the scan, the HTTP surface, and the
// per-app state store.
type Service struct {
	db   *sql.DB
	log  *slog.Logger
	root string

	mu      sync.RWMutex
	entries map[string]entry
	order   []string // slugs, in launcher order
	// problems records what the last scan refused, so /api/builder/apps/_health
	// answers "why is my app not showing up?" without a log dive.
	problems []string

	// stateMu serialises read-modify-write on state.json. One mutex for all
	// apps: writes are rare and a per-app map of mutexes is a leak waiting for
	// an app that is deleted while a request is in flight.
	stateMu sync.Mutex
}

// New builds the service. root is the directory scanned for drop-in apps; it
// does not have to exist.
func New(db *sql.DB, log *slog.Logger, root string) *Service {
	if strings.TrimSpace(root) == "" {
		root = "apps"
	}
	if log == nil {
		log = slog.Default()
	}
	return &Service{db: db, log: log, root: root, entries: map[string]entry{}}
}

// Root reports the directory drop-in apps are read from.
func (s *Service) Root() string { return s.root }

// Scan discovers drop-in apps and merges them with the compiled ones.
//
// It never returns an error for a broken app. A directory that will not parse
// is recorded in problems and skipped: one bad app.json must cost exactly one
// tile, not the boot.
func (s *Service) Scan(ctx context.Context) {
	loaded := map[string]entry{}

	// Disk first, and only READ — nothing is initialised yet.
	//
	// The order matters. A compiled app's Go package normally lives in the very
	// directory that holds its app.json and ui.js (that is what `app new --go`
	// produces), so its Init has to be told where its own files are. Running
	// the compiled half first meant handing it Dir:"" and discovering the
	// directory afterwards — the app was initialised with a lie.
	disk, problems := s.scanDir(ctx)

	// Compiled apps second, merged onto whatever the directory supplied.
	for _, a := range Registered() {
		slug := a.Manifest.Slug
		e := entry{m: a.Manifest, uiFS: a.UIFS, routes: a.Routes}
		if d, ok := disk[slug]; ok {
			// app.json wins for presentation: it is the file the author edits,
			// and a title that ignores its own manifest is indefensible. The Go
			// half keeps what only it can supply — Init, Routes, and the fact
			// that it was compiled in.
			e.m = d.m
			e.m.Source = "compiled"
			e.dir = d.dir
			delete(disk, slug)
			s.log.Info("builder.apps: compiled app took its UI from disk", "app", slug, "dir", d.dir)
		} else {
			e.m.Source = "compiled"
		}
		if a.Init != nil {
			if err := a.Init(Context{DB: s.db, Log: s.log.With("app", slug), Dir: e.dir}); err != nil {
				problems = append(problems, fmt.Sprintf("%s: init failed: %v", slug, err))
				s.log.Error("builder.apps: compiled app dropped", "app", slug, "err", err)
				continue
			}
		}
		loaded[slug] = e
	}
	problems = append(problems, RegistrationErrors()...)

	// Whatever is left on disk is a pure drop-in app.
	for slug, d := range disk {
		d.m.Source = "disk"
		loaded[slug] = entry{m: d.m, dir: d.dir}
	}

	slugs := make([]string, 0, len(loaded))
	for slug := range loaded {
		slugs = append(slugs, slug)
	}
	sort.Slice(slugs, func(i, j int) bool {
		a, b := loaded[slugs[i]].m, loaded[slugs[j]].m
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.Slug < b.Slug
	})

	s.mu.Lock()
	s.entries, s.order, s.problems = loaded, slugs, problems
	s.mu.Unlock()

	s.log.Info("builder.apps ready", "dir", s.root, "apps", len(loaded), "problems", len(problems))
	for _, p := range problems {
		s.log.Warn("builder.apps problem", "detail", p)
	}
}

// diskApp is one directory that parsed.
type diskApp struct {
	dir string
	m   Manifest
}

// scanDir reads the apps directory. It reports what it found and what it
// refused, and returns an error for nothing: one unreadable directory must cost
// one app, never the scan.
func (s *Service) scanDir(ctx context.Context) (map[string]diskApp, []string) {
	found := map[string]diskApp{}
	var problems []string

	ents, err := os.ReadDir(s.root)
	if err != nil {
		// A missing directory is the normal state of a project with no custom
		// apps. Anything else is worth a line.
		if !errors.Is(err, fs.ErrNotExist) {
			problems = append(problems, fmt.Sprintf("read %s: %v", s.root, err))
			s.log.Warn("builder.apps: cannot read the apps directory", "dir", s.root, "err", err)
		}
		return found, problems
	}

	for _, de := range ents {
		if ctx.Err() != nil {
			break
		}
		if !de.IsDir() || strings.HasPrefix(de.Name(), ".") || strings.HasPrefix(de.Name(), "_") {
			continue
		}
		dir := filepath.Join(s.root, de.Name())
		m, err := s.loadManifest(dir)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", de.Name(), err))
			s.log.Warn("builder.apps: skipped", "dir", dir, "err", err)
			continue
		}
		// The slug is the URL segment and the directory is where an operator
		// looks for it; letting them differ means a broken tile cannot be
		// traced back to a folder.
		if m.Slug != de.Name() {
			problems = append(problems, fmt.Sprintf("%s: slug %q does not match the directory name", de.Name(), m.Slug))
			s.log.Warn("builder.apps: skipped, slug/directory mismatch", "dir", dir, "slug", m.Slug)
			continue
		}
		// A tile that navigates to a blank screen is worse than no tile.
		if _, err := os.Stat(filepath.Join(dir, m.UI)); err != nil {
			problems = append(problems, fmt.Sprintf("%s: %s is missing", m.Slug, m.UI))
			s.log.Warn("builder.apps: skipped, no UI module", "slug", m.Slug, "ui", m.UI)
			continue
		}
		m.Path = dir
		found[m.Slug] = diskApp{dir: dir, m: m}
	}
	return found, problems
}

func (s *Service) loadManifest(dir string) (Manifest, error) {
	raw, err := os.ReadFile(filepath.Join(dir, manifestFile))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Manifest{}, fmt.Errorf("no %s", manifestFile)
		}
		return Manifest{}, fmt.Errorf("read %s: %w", manifestFile, err)
	}
	m, err := parseManifest(raw)
	if err != nil {
		return Manifest{}, err
	}
	return m, nil
}

// List returns the live manifests in launcher order.
func (s *Service) List() []Manifest {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Manifest, 0, len(s.order))
	for _, slug := range s.order {
		e := s.entries[slug]
		m := e.m
		m.HasAPI = e.routes != nil
		out = append(out, m)
	}
	return out
}

// ErrExists is returned when a slug is already taken.
//
// A sentinel rather than a formatted string, because two callers act on it
// differently: the CLI tells a human to pass --force, and the MCP tool tells an
// agent to pick another slug. It is also the backstop for a race — the MCP tool
// checks the live registry first, but Scaffold's stat-then-create has a gap, and
// the loser of that race has to be told the same thing the pre-check would have
// said rather than something opaque.
var ErrExists = errors.New("an app with this slug already exists")

// Problems returns what the last scan refused, one sentence per rejected app.
// The CLI prints it; /_health serves it.
func (s *Service) Problems() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string(nil), s.problems...)
}

func (s *Service) get(slug string) (entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.entries[slug]
	return e, ok
}

// ── HTTP ────────────────────────────────────────────────────────────────────

// Routes mounts the surface. The caller is expected to have wrapped it in the
// session middleware already — nothing here authenticates.
//
// Compiled apps' own routers are mounted here, at Routes time, because chi
// cannot mount a subtree behind a path parameter. Their slugs are static
// segments, and chi's trie matches a static segment ahead of {slug} regardless
// of registration order, so this cannot shadow the generic handlers.
func (s *Service) Routes(r chi.Router) {
	r.Get("/", s.handleList)
	r.Get("/_health", s.handleHealth)
	r.Post("/_reload", s.handleReload)

	s.mu.RLock()
	mounted := make([]string, 0, len(s.order))
	for _, slug := range s.order {
		e := s.entries[slug]
		if e.routes == nil {
			continue
		}
		fn := e.routes
		r.Route("/"+slug+"/api", func(sub chi.Router) { fn(sub) })
		mounted = append(mounted, slug)
	}
	s.mu.RUnlock()
	if len(mounted) > 0 {
		s.log.Info("builder.apps mounted app APIs", "apps", strings.Join(mounted, ", "))
	}

	r.Get("/{slug}", s.handleGet)
	r.Get("/{slug}/ui.js", s.handleUI)
	r.Get("/{slug}/state", s.handleGetState)
	r.Put("/{slug}/state", s.handlePutState)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"apps": s.List()})
}

// handleHealth answers "why is my app not showing up?" without a log dive.
func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	problems := append([]string(nil), s.problems...)
	n := len(s.entries)
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"dir": s.root, "apps": n, "problems": problems,
	})
}

// handleReload rescans without a restart, which is what makes editing a
// drop-in app tolerable. It cannot mount a newly-compiled app's routes — chi
// seals a mux once it has served — so a new API surface still needs a restart,
// and the response says so.
func (s *Service) handleReload(w http.ResponseWriter, r *http.Request) {
	s.Scan(r.Context())
	s.mu.RLock()
	problems := append([]string(nil), s.problems...)
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"apps":     s.List(),
		"problems": problems,
		"note":     "manifests and ui.js are live; a compiled app's /api routes need a restart",
	})
}

func (s *Service) handleGet(w http.ResponseWriter, r *http.Request) {
	e, ok := s.get(chi.URLParam(r, "slug"))
	if !ok {
		writeErr(w, http.StatusNotFound, "no such app")
		return
	}
	m := e.m
	m.HasAPI = e.routes != nil
	writeJSON(w, http.StatusOK, m)
}

// handleUI serves the app's ES module.
//
// Read and written by hand rather than handed to http.FileServer: the path is
// the app's own manifest value, so containment is checked here, and a directory
// listing or a byte-range dance on a JS module buys nothing.
func (s *Service) handleUI(w http.ResponseWriter, r *http.Request) {
	e, ok := s.get(chi.URLParam(r, "slug"))
	if !ok {
		writeErr(w, http.StatusNotFound, "no such app")
		return
	}

	var (
		rc  io.ReadCloser
		err error
	)
	switch {
	case e.dir != "":
		var p string
		p, err = safeJoin(e.dir, e.m.UI)
		if err == nil {
			rc, err = openLimited(p)
		}
	case e.uiFS != nil:
		rc, err = e.uiFS.Open(e.m.UI)
	default:
		err = errors.New("this app ships no UI module")
	}
	if err != nil {
		s.log.Warn("builder.apps: UI module unavailable", "app", e.m.Slug, "err", err)
		writeErr(w, http.StatusNotFound, "the app's UI module could not be read")
		return
	}
	defer func() { _ = rc.Close() }()

	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	// Never cached. A drop-in app is edited in place and reloaded; a cached
	// module would mean every edit looks like it did nothing.
	w.Header().Set("Cache-Control", "no-store")
	if _, err := io.Copy(w, io.LimitReader(rc, maxUIBytes)); err != nil {
		s.log.Warn("builder.apps: UI module truncated", "app", e.m.Slug, "err", err)
	}
}

// handleGetState returns the app's state blob, or {} when it has none.
func (s *Service) handleGetState(w http.ResponseWriter, r *http.Request) {
	e, ok := s.get(chi.URLParam(r, "slug"))
	if !ok {
		writeErr(w, http.StatusNotFound, "no such app")
		return
	}
	if e.dir == "" {
		writeErr(w, http.StatusNotFound, "this app has no state store; it owns its own storage")
		return
	}
	p, err := safeJoin(e.dir, stateFile)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "state path")
		return
	}
	raw, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{}"))
		return
	}
	if err != nil {
		s.log.Warn("builder.apps: state unreadable", "app", e.m.Slug, "err", err)
		writeErr(w, http.StatusInternalServerError, "state could not be read")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}

// handlePutState replaces the blob. Whole-document, not a patch: a drop-in app
// holds preferences here, and merge semantics on an untyped blob are a source
// of surprises nobody can debug from the outside.
func (s *Service) handlePutState(w http.ResponseWriter, r *http.Request) {
	e, ok := s.get(chi.URLParam(r, "slug"))
	if !ok {
		writeErr(w, http.StatusNotFound, "no such app")
		return
	}
	if e.dir == "" {
		writeErr(w, http.StatusNotFound, "this app has no state store; it owns its own storage")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxStateBytes+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "body could not be read")
		return
	}
	if len(raw) > maxStateBytes {
		writeErr(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("state is capped at %d bytes; an app that needs more needs a table", maxStateBytes))
		return
	}
	if !json.Valid(raw) {
		writeErr(w, http.StatusBadRequest, "state must be JSON")
		return
	}

	p, err := safeJoin(e.dir, stateFile)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "state path")
		return
	}

	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	// Write-then-rename: a crash mid-write leaves the previous state intact
	// rather than a half-written file that no longer parses.
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		s.log.Warn("builder.apps: state write failed", "app", e.m.Slug, "err", err)
		writeErr(w, http.StatusInternalServerError, "state could not be written")
		return
	}
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		s.log.Warn("builder.apps: state rename failed", "app", e.m.Slug, "err", err)
		writeErr(w, http.StatusInternalServerError, "state could not be written")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "bytes": len(raw)})
}

// safeJoin resolves name beneath dir and refuses anything that escapes it.
// The name comes from the app's own manifest, which is a file the operator
// dropped in — trusted enough to run, not trusted enough to read /etc/shadow
// through.
func safeJoin(dir, name string) (string, error) {
	base, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolve app dir: %w", err)
	}
	p, err := filepath.Abs(filepath.Join(base, filepath.Clean("/"+name)))
	if err != nil {
		return "", fmt.Errorf("resolve %q: %w", name, err)
	}
	if p != base && !strings.HasPrefix(p, base+string(os.PathSeparator)) {
		return "", fmt.Errorf("%q escapes the app directory", name)
	}
	return p, nil
}

func openLimited(p string) (io.ReadCloser, error) {
	st, err := os.Stat(p)
	if err != nil {
		return nil, fmt.Errorf("stat: %w", err)
	}
	if st.IsDir() {
		return nil, errors.New("is a directory")
	}
	if st.Size() > maxUIBytes {
		return nil, fmt.Errorf("%d bytes exceeds the %d-byte cap", st.Size(), maxUIBytes)
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	return f, nil
}
