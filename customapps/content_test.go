package customapps

import (
	"encoding/json"
	"strings"
	"testing"
)

// The `UI` shorthand must keep working untouched. Every app that exists today
// wrote `"ui": "ui.js"` (or nothing), and this change is worthless if it costs
// them a migration.
func TestUIShorthandStillResolves(t *testing.T) {
	for _, tc := range []struct {
		name, raw, wantEntry string
	}{
		{"explicit ui", `{"slug":"demo","title":{"en":"A"},"ui":"main.js"}`, "main.js"},
		{"omitted ui defaults", `{"slug":"demo","title":{"en":"A"}}`, "ui.js"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m, err := parseManifest([]byte(tc.raw))
			if err != nil {
				t.Fatal(err)
			}
			c := m.ResolveContent()
			if c.Kind != ContentModule || c.Entry != tc.wantEntry {
				t.Fatalf("got {%s %s}, want {module %s}", c.Kind, c.Entry, tc.wantEntry)
			}
		})
	}
}

// An explicit Content wins over the shorthand.
func TestContentOverridesUI(t *testing.T) {
	m, err := parseManifest([]byte(
		`{"slug":"demo","title":{"en":"A"},"ui":"ignored.js",
		  "content":{"kind":"route","entry":"/connections"}}`))
	if err != nil {
		t.Fatal(err)
	}
	c := m.ResolveContent()
	if c.Kind != ContentRoute || c.Entry != "/connections" {
		t.Fatalf("got {%s %s}, want {route /connections}", c.Kind, c.Entry)
	}
}

// A manifest must round-trip unchanged. An app.json that said `"ui": "ui.js"`
// has to say exactly that when read back — silently acquiring a Content block
// it never wrote would make every app.json on disk drift from what its author
// committed.
func TestManifestRoundTripsWithoutGrowingAContentBlock(t *testing.T) {
	m, err := parseManifest([]byte(`{"slug":"demo","title":{"en":"A"},"ui":"main.js"}`))
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), `"content"`) {
		t.Fatalf("marshalling grew a content block: %s", out)
	}
}

func TestContentValidation(t *testing.T) {
	base := `{"slug":"demo","title":{"en":"A"},"content":`
	for _, tc := range []struct {
		name, content string
		wantErr       string
	}{
		{"module path escapes the app dir", `{"kind":"module","entry":"../../etc/passwd"}`, "not a path"},
		{"module bare filename is fine", `{"kind":"module","entry":"main.js"}`, ""},
		{"iframe must be absolute https", `{"kind":"iframe","entry":"/relative"}`, "absolute https"},
		{"iframe http is refused", `{"kind":"iframe","entry":"http://x.test"}`, "absolute https"},
		{"iframe https is fine", `{"kind":"iframe","entry":"https://x.test/app"}`, ""},
		{"route must start with slash", `{"kind":"route","entry":"connections"}`, "beginning with /"},
		{"builtin must be a bare name", `{"kind":"builtin","entry":"a/b"}`, "bare builtin name"},
		{"entry is required", `{"kind":"module","entry":""}`, "content.entry is required"},
		// The forward-compatibility promise: one unknown app must not take the
		// registry down with it.
		{"unknown kind is tolerated", `{"kind":"hologram","entry":"whatever"}`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseManifest([]byte(base + tc.content + "}"))
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("got %v, want an error containing %q", err, tc.wantErr)
			}
		})
	}
}

func TestWindowValidation(t *testing.T) {
	base := `{"slug":"demo","title":{"en":"A"},"window":`
	for _, tc := range []struct {
		name, window, wantErr string
	}{
		{"sane", `{"width":720,"height":520,"minWidth":480,"minHeight":380}`, ""},
		{"min exceeds width", `{"width":400,"minWidth":900}`, "minWidth"},
		{"min exceeds height", `{"height":300,"minHeight":900}`, "minHeight"},
		{"negative", `{"width":-1}`, "must not be negative"},
		// A min with no max is legal: the app knows its floor, the shell picks
		// the rest.
		{"min alone is fine", `{"minWidth":480}`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseManifest([]byte(base + tc.window + "}"))
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("got %v, want an error containing %q", err, tc.wantErr)
			}
		})
	}
}
