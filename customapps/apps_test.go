package customapps

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// writeApp drops a minimal drop-in app into root.
func writeApp(t *testing.T, root, slug, manifest, ui string) string {
	t.Helper()
	dir := filepath.Join(root, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, manifestFile), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
	if ui != "" {
		if err := os.WriteFile(filepath.Join(dir, "ui.js"), []byte(ui), 0o644); err != nil {
			t.Fatalf("write ui: %v", err)
		}
	}
	return dir
}

// TestScanIsolatesBrokenApps is the property the whole package exists for: a
// custom app is code nobody here reviewed, and no single bad one may cost more
// than itself.
func TestScanIsolatesBrokenApps(t *testing.T) {
	root := t.TempDir()
	writeApp(t, root, "good", `{"slug":"good","title":{"en":"Good","ar":"جيد"}}`, "export default function(){}")
	writeApp(t, root, "broken", `{ not json`, "export default function(){}")
	writeApp(t, root, "mismatch", `{"slug":"elsewhere","title":{"en":"M"}}`, "export default function(){}")
	writeApp(t, root, "issues", `{"slug":"issues","title":{"en":"Fake"}}`, "export default function(){}")
	writeApp(t, root, "noui", `{"slug":"noui","title":{"en":"No UI"}}`, "")
	writeApp(t, root, "escape", `{"slug":"escape","title":{"en":"E"},"ui":"../../secret"}`, "export default function(){}")

	svc := New(nil, quiet(), root)
	svc.Scan(context.Background())

	list := svc.List()
	if len(list) != 1 || list[0].Slug != "good" {
		t.Fatalf("expected only the good app to load, got %+v", list)
	}
	if got := len(svc.Problems()); got != 5 {
		t.Fatalf("expected 5 rejections, got %d: %v", got, svc.Problems())
	}
	// Every rejection has to name the app, or the operator cannot act on it.
	for _, p := range svc.Problems() {
		if !strings.Contains(p, ":") {
			t.Errorf("rejection %q does not name an app", p)
		}
	}
}

// TestDefaultsAndBilingualFallback pins the manifest contract.
func TestDefaultsAndBilingualFallback(t *testing.T) {
	m, err := parseManifest([]byte(`{"slug":"notes","title":{"en":"Notes"}}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if m.UI != "ui.js" || m.Order != 100 || m.Icon == "" || m.Color == "" {
		t.Fatalf("defaults not applied: %+v", m)
	}
	if got := m.Title.Get("ar"); got != "Notes" {
		t.Errorf("AR must fall back to EN, got %q", got)
	}
	if got := (Text{EN: "Notes", AR: "ملاحظات"}).Get("ar-EG"); got != "ملاحظات" {
		t.Errorf("AR not selected for ar-EG, got %q", got)
	}
	// A manifest may not claim it was compiled in.
	if m.Source != "" {
		t.Errorf("app.json must not be able to set source, got %q", m.Source)
	}
}

// TestCompiledAppTakesUIFromDisk covers the hybrid `app new --go` produces: the
// Go package and the UI module share one directory.
func TestCompiledAppTakesUIFromDisk(t *testing.T) {
	root := t.TempDir()
	writeApp(t, root, "metrics", `{"slug":"metrics","title":{"en":"Metrics","ar":"المقاييس"},"order":7}`, "export default function(){}")

	var gotDir string
	restore := swapRegistry(t)
	defer restore()
	Register(App{
		Manifest: Manifest{Slug: "metrics", Title: Text{EN: "From Go"}},
		Init:     func(c Context) error { gotDir = c.Dir; return nil },
		Routes: func(r chi.Router) {
			r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("pong")) })
		},
	})

	svc := New(nil, quiet(), root)
	svc.Scan(context.Background())

	list := svc.List()
	if len(list) != 1 {
		t.Fatalf("expected one merged app, got %+v", list)
	}
	got := list[0]
	if got.Source != "compiled" || !got.HasAPI {
		t.Errorf("merged app lost its Go half: %+v", got)
	}
	// app.json wins for presentation.
	if got.Title.EN != "Metrics" || got.Order != 7 {
		t.Errorf("app.json should own presentation, got %+v", got)
	}
	// Init must be told where its own files are.
	if gotDir != filepath.Join(root, "metrics") {
		t.Errorf("Init received Dir=%q, want the app directory", gotDir)
	}

	// The app's own router is reachable.
	r := chi.NewRouter()
	r.Route("/api/builder/apps", svc.Routes)
	srv := httptest.NewServer(r)
	defer srv.Close()
	res, err := http.Get(srv.URL + "/api/builder/apps/metrics/api/ping")
	if err != nil {
		t.Fatalf("ping: %v", err)
	}
	defer func() { _ = res.Body.Close() }()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != "pong" {
		t.Errorf("app API: %d %q", res.StatusCode, body)
	}
}

// TestStateRoundTrip covers the drop-in app's only persistence.
func TestStateRoundTrip(t *testing.T) {
	root := t.TempDir()
	writeApp(t, root, "notes", `{"slug":"notes","title":{"en":"Notes"}}`, "export default function(){}")
	svc := New(nil, quiet(), root)
	svc.Scan(context.Background())

	r := chi.NewRouter()
	r.Route("/api/builder/apps", svc.Routes)
	srv := httptest.NewServer(r)
	defer srv.Close()
	base := srv.URL + "/api/builder/apps/notes/state"

	// Absent state reads as an empty object, not a 404 — an app should not have
	// to special-case its own first run.
	res, err := http.Get(base)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if strings.TrimSpace(string(body)) != "{}" {
		t.Fatalf("empty state = %q", body)
	}

	req, _ := http.NewRequest(http.MethodPut, base, strings.NewReader(`{"count":3}`))
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("put status %d", res.StatusCode)
	}

	res, err = http.Get(base)
	if err != nil {
		t.Fatalf("get2: %v", err)
	}
	body, _ = io.ReadAll(res.Body)
	_ = res.Body.Close()
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out["count"] != float64(3) {
		t.Errorf("state did not round-trip: %v", out)
	}

	// Non-JSON is refused rather than written, so a later read cannot fail on
	// something this endpoint accepted.
	req, _ = http.NewRequest(http.MethodPut, base, strings.NewReader(`not json`))
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("put3: %v", err)
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("non-JSON accepted with %d", res.StatusCode)
	}
}

// TestSafeJoinRefusesEscape is the containment check on a path that comes from
// a file the operator dropped in.
func TestSafeJoinRefusesEscape(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"../secret", "../../etc/passwd", "/etc/passwd"} {
		p, err := safeJoin(dir, name)
		if err == nil && !strings.HasPrefix(p, dir) {
			t.Errorf("safeJoin(%q) escaped to %q", name, p)
		}
	}
	if _, err := safeJoin(dir, "ui.js"); err != nil {
		t.Errorf("safeJoin refused a plain name: %v", err)
	}
}

// TestScaffoldProducesALoadableApp closes the loop: what the CLI writes is what
// the registry accepts. A generator whose output the loader rejects is the one
// bug this pairing must never have.
func TestScaffoldProducesALoadableApp(t *testing.T) {
	root := t.TempDir()
	res, err := Scaffold(ScaffoldOptions{Slug: "changelog", Root: root, TitleAR: "سجل"})
	if err != nil {
		t.Fatalf("scaffold: %v", err)
	}
	if len(res.Files) < 3 {
		t.Fatalf("expected manifest, ui and readme, got %v", res.Files)
	}

	svc := New(nil, quiet(), root)
	svc.Scan(context.Background())
	if p := svc.Problems(); len(p) != 0 {
		t.Fatalf("the scaffold produced an app the loader rejects: %v", p)
	}
	list := svc.List()
	if len(list) != 1 || list[0].Slug != "changelog" || list[0].Title.AR != "سجل" {
		t.Fatalf("scaffolded app did not load as written: %+v", list)
	}

	// Re-scaffolding without --force must refuse rather than overwrite work.
	if _, err := Scaffold(ScaffoldOptions{Slug: "changelog", Root: root}); err == nil {
		t.Error("re-scaffold overwrote an existing app without --force")
	}
}

// swapRegistry isolates a test from the process-global registry that init()
// functions write into.
func swapRegistry(t *testing.T) func() {
	t.Helper()
	registry.mu.Lock()
	prev, prevInvalid := registry.apps, invalid
	registry.apps, invalid = map[string]App{}, nil
	registry.mu.Unlock()
	return func() {
		registry.mu.Lock()
		registry.apps, invalid = prev, prevInvalid
		registry.mu.Unlock()
	}
}
