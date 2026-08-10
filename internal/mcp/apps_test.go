package mcp

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/togo-framework/builder/customapps"
)

// TestBeneathRefusesEscape is the containment claim, stated as a test because
// the caller here is autonomous: an agent composes the slug, and "it passed the
// regex in customapps" is a second layer, not this one's excuse.
func TestBeneathRefusesEscape(t *testing.T) {
	root := t.TempDir()

	for _, bad := range []string{
		"../outside", "..", "../../etc", "a/b", `a\b`, "/etc/passwd",
		"./x", "sub/../../../tmp",
	} {
		if err := beneath(root, bad); err == nil {
			t.Errorf("beneath(%q) allowed an escape", bad)
		}
	}
	for _, ok := range []string{"changelog", "my-app", "a1"} {
		if err := beneath(root, ok); err != nil {
			t.Errorf("beneath(%q) refused a plain slug: %v", ok, err)
		}
	}
}

// TestCreateAppIsLiveAndContained drives the tool handler itself: a created app
// must be in the live registry immediately, and a second create on the same slug
// must refuse rather than overwrite.
func TestCreateAppIsLiveAndContained(t *testing.T) {
	root := t.TempDir()
	reg := customapps.New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), root)
	reg.Scan(context.Background())

	s := &Service{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	s.SetApps(reg)

	ctx := context.Background()
	c := &caller{id: "t", name: "test-token", scope: "agents"}

	res, _, err := s.createApp(ctx, c, createAppArgs{
		Slug: "changelog", TitleEN: "Changelog", TitleAR: "سجل التغييرات",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !strings.Contains(textOf(res), "live now") {
		t.Errorf("create did not report the app as live:\n%s", textOf(res))
	}

	// In the LIVE registry, not merely on disk — that is the whole point of the
	// rescan, and the difference between a tile and a folder.
	var found bool
	for _, m := range reg.List() {
		if m.Slug == "changelog" {
			found = true
			if m.Title.AR != "سجل التغييرات" {
				t.Errorf("Arabic title lost: %q", m.Title.AR)
			}
		}
	}
	if !found {
		t.Fatalf("created app is not in the registry: %v", reg.Problems())
	}

	// The files a drop-in app needs.
	for _, f := range []string{"app.json", "ui.js"} {
		if _, err := os.Stat(filepath.Join(root, "changelog", f)); err != nil {
			t.Errorf("missing %s: %v", f, err)
		}
	}

	// A second create must refuse. An agent retrying a step it thinks failed
	// must not flatten the app the first attempt actually made.
	before, _ := os.ReadFile(filepath.Join(root, "changelog", "ui.js"))
	if _, _, err := s.createApp(ctx, c, createAppArgs{Slug: "changelog", TitleEN: "Other"}); err == nil {
		t.Error("a duplicate slug was accepted")
	}
	after, _ := os.ReadFile(filepath.Join(root, "changelog", "ui.js"))
	if string(before) != string(after) {
		t.Error("the duplicate create overwrote the existing app")
	}

	// A reserved slug is refused by customapps and must surface as an error the
	// agent can read, not a written directory.
	if _, _, err := s.createApp(ctx, c, createAppArgs{Slug: "issues", TitleEN: "Fake"}); err == nil {
		t.Error("a reserved slug was accepted")
	}
	if _, err := os.Stat(filepath.Join(root, "issues")); err == nil {
		t.Error("a refused slug still created a directory")
	}

	// Traversal, refused before anything is written — and proven by counting the
	// parent directory rather than by trusting the error, because the failure
	// this guards against is a write that succeeds and returns an error anyway.
	outside := filepath.Dir(root)
	before2, err := os.ReadDir(outside)
	if err != nil {
		t.Fatalf("read %s: %v", outside, err)
	}
	for _, bad := range []string{"../escape", "../../.env", "a/b", "/etc/passwd"} {
		if _, _, err := s.createApp(ctx, c, createAppArgs{Slug: bad, TitleEN: "Escape"}); err == nil {
			t.Errorf("a traversing slug %q was accepted", bad)
		}
	}
	after2, err := os.ReadDir(outside)
	if err != nil {
		t.Fatalf("read %s: %v", outside, err)
	}
	if len(after2) != len(before2) {
		t.Errorf("a traversing slug wrote outside the apps directory: %d entries became %d",
			len(before2), len(after2))
	}
}

// TestCreateAppWithoutRegistry is the boot-order case: an install where the
// apps provider never started must answer with a sentence, not a nil panic.
func TestCreateAppWithoutRegistry(t *testing.T) {
	s := &Service{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	_, _, err := s.createApp(context.Background(), &caller{name: "t"}, createAppArgs{
		Slug: "x", TitleEN: "X",
	})
	if err == nil || !strings.Contains(err.Error(), "not available") {
		t.Fatalf("want an explanatory error, got %v", err)
	}
}

// textOf flattens a tool result to the text an agent would actually read.
func textOf(r *mcp.CallToolResult) string {
	if r == nil {
		return ""
	}
	var b strings.Builder
	for _, c := range r.Content {
		if t, ok := c.(*mcp.TextContent); ok {
			b.WriteString(t.Text)
		}
	}
	return b.String()
}
