package integrations

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// A tmux that records rather than runs.
type fakeTmux struct {
	sessions []string
	sent     [][]string
	err      error
}

func (f *fakeTmux) Ensure(_ context.Context, name string) error {
	if f.err != nil {
		return f.err
	}
	f.sessions = append(f.sessions, name)
	return nil
}

func (f *fakeTmux) SendKeys(_ context.Context, _ string, argv ...string) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, argv)
	return nil
}

func srv(t *testing.T) (*chi.Mux, *fakeTmux) {
	t.Helper()
	f := &fakeTmux{}
	s := New(slog.New(slog.NewTextHandler(io.Discard, nil)), f, nil)
	r := chi.NewRouter()
	s.Routes(r)
	return r, f
}

func do(t *testing.T, r http.Handler, method, path string) (int, []byte) {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w.Code, w.Body.Bytes()
}

// THE property of the connect endpoint: nothing a caller sends reaches a shell.
// The only thing they choose is WHICH registered integration, and the command
// is a Go literal in terminal.go. Without this the endpoint is a remote shell
// wearing a friendly name.
func TestConnectOnlyEverRunsRegisteredCommands(t *testing.T) {
	r, f := srv(t)

	// Escaped, because the point is what the HANDLER does with a hostile slug —
	// an unescaped space makes httptest.NewRequest panic while building the
	// request line, which tests net/http rather than this endpoint.
	for _, evil := range []string{
		"gh; rm -rf /",
		"gh && curl evil.example",
		"../../etc/passwd",
		"$(whoami)",
		"gh`id`",
	} {
		code, _ := do(t, r, "POST", "/connect/"+url.PathEscape(evil))
		if code != http.StatusNotFound {
			t.Errorf("slug %q returned %d, want 404 — it is not in the registry", evil, code)
		}
	}
	if len(f.sent) != 0 {
		t.Fatalf("an unregistered slug caused a command to run: %v", f.sent)
	}

	// And a real one runs exactly what the registry declares — no more.
	code, body := do(t, r, "POST", "/connect/gh")
	if code != http.StatusOK {
		t.Fatalf("connect gh: %d %s", code, body)
	}
	if len(f.sent) != 1 {
		t.Fatalf("expected one command, got %v", f.sent)
	}
	got := strings.Join(f.sent[0], " ")
	if got != "gh auth login" {
		t.Fatalf("ran %q, want exactly the registry's login command", got)
	}
}

// A login session is stable per integration: restarting an abandoned login must
// land in the window the operator already has open rather than stacking new
// ones behind it.
func TestConnectReusesOneSessionPerIntegration(t *testing.T) {
	r, f := srv(t)
	for range 3 {
		if code, body := do(t, r, "POST", "/connect/gh"); code != http.StatusOK {
			t.Fatalf("%d: %s", code, body)
		}
	}
	for _, s := range f.sessions {
		if s != "connect-gh" {
			t.Fatalf("session name %q; they must be stable per integration", s)
		}
	}
}

// An integration that does not connect through a terminal must say so rather
// than opening an empty window.
func TestConnectRefusesNonTerminalIntegrations(t *testing.T) {
	r, f := srv(t)
	code, body := do(t, r, "POST", "/connect/slack")
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d %s", code, body)
	}
	if !strings.Contains(string(body), "does not connect through a terminal") {
		t.Fatalf("unhelpful message: %s", body)
	}
	if len(f.sent) != 0 {
		t.Fatal("a non-terminal integration started a session")
	}
}

// The catalogue endpoint has to carry everything the gallery renders, or the
// app needs a second source of truth.
func TestCatalogCarriesCategoriesAndIntegrations(t *testing.T) {
	r, _ := srv(t)
	code, body := do(t, r, "GET", "/catalog")
	if code != http.StatusOK {
		t.Fatalf("%d", code)
	}
	var out struct {
		Categories []struct {
			Key   string `json:"key"`
			Title Text   `json:"title"`
		} `json:"categories"`
		Integrations []Integration `json:"integrations"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Categories) != 5 {
		t.Fatalf("got %d categories, want 5", len(out.Categories))
	}
	if len(out.Integrations) < 12 {
		t.Fatalf("only %d integrations in the catalogue", len(out.Integrations))
	}
	// Every integration must land in a declared category, or the gallery drops
	// it silently into no section at all.
	declared := map[string]bool{}
	for _, c := range out.Categories {
		declared[c.Key] = true
		if c.Title.EN == "" || c.Title.AR == "" {
			t.Errorf("category %q is missing a localized title", c.Key)
		}
	}
	for _, i := range out.Integrations {
		if !declared[string(i.Category)] {
			t.Errorf("%s is in undeclared category %q", i.Slug, i.Category)
		}
	}
}

// Status must answer for every terminal integration, whatever is installed.
func TestStatusEndpointAnswersForAll(t *testing.T) {
	r, _ := srv(t)
	code, body := do(t, r, "GET", "/status")
	if code != http.StatusOK {
		t.Fatalf("%d", code)
	}
	var out struct {
		Statuses []Status `json:"statuses"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	want := 0
	for _, i := range All() {
		if i.Terminal != nil {
			want++
		}
	}
	if len(out.Statuses) != want {
		t.Fatalf("got %d statuses for %d terminal integrations", len(out.Statuses), want)
	}
}
