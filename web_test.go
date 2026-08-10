package builder

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// A stand-in for a built bundle: the shell, one hashed asset, one public file.
func testBundle() fs.FS {
	return fstest.MapFS{
		"index.html":                {Data: []byte("<!doctype html><title>builder</title>")},
		"assets/index-abc123.js":    {Data: []byte("console.log(1)")},
		"assets/index-abc123.css":   {Data: []byte("body{}")},
		"fonts/lusail/Lusail.woff2": {Data: []byte("woff2")},
	}
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// The bug this test exists for.
//
// The first implementation rewrote the request path to "/index.html" and handed
// it to http.FileServer. net/http redirects any request whose path ends in
// "/index.html" to "./" before it looks at anything else, so /builder/ answered
// "301 Location: ./" — a redirect to itself. The daemon reported a served
// dashboard and the browser looped.
func TestWebHandlerServesShellWithoutRedirecting(t *testing.T) {
	h := webHandler(testBundle())

	for _, path := range []string{
		WebMount + "/",
		WebMount + "/index.html",
		WebMount + "/issues",             // a client route
		WebMount + "/issues/39",          // a nested client route
		WebMount + "/agents/backend-dev", // ditto
	} {
		rec := get(t, h, path)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200 (a redirect here is the loop bug)", path, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "<!doctype html>") {
			t.Errorf("%s: body is not the app shell: %q", path, rec.Body.String())
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control = %q, want no-store — a cached shell outlives its chunks", path, got)
		}
	}
}

func TestWebHandlerServesRealFiles(t *testing.T) {
	h := webHandler(testBundle())

	js := get(t, h, WebMount+"/assets/index-abc123.js")
	if js.Code != http.StatusOK || js.Body.String() != "console.log(1)" {
		t.Fatalf("asset: status %d body %q", js.Code, js.Body.String())
	}
	// Content-hashed names change with their contents, so a long cache is
	// correct — and is what keeps a 2 MB bundle off every navigation.
	if got := js.Header().Get("Cache-Control"); !strings.Contains(got, "immutable") {
		t.Errorf("asset Cache-Control = %q, want immutable", got)
	}

	font := get(t, h, WebMount+"/fonts/lusail/Lusail.woff2")
	if font.Code != http.StatusOK || font.Body.String() != "woff2" {
		t.Fatalf("font: status %d body %q", font.Code, font.Body.String())
	}
}

// A path that climbs out of the bundle must not reach the filesystem. It is
// answered with the shell — it is, as far as the app is concerned, just another
// unknown client route — but never with a file from outside.
func TestWebHandlerRejectsTraversal(t *testing.T) {
	h := webHandler(testBundle())
	for _, path := range []string{
		WebMount + "/../../etc/passwd",
		WebMount + "/assets/../../../etc/passwd",
	} {
		rec := get(t, h, path)
		if strings.Contains(rec.Body.String(), "root:") {
			t.Fatalf("%s leaked a file outside the bundle", path)
		}
	}
}

// The embedded bundle must actually contain a built app. A go:embed of an empty
// or missing dist compiles fine and fails only in a browser.
func TestEmbeddedBundleHasAnApp(t *testing.T) {
	files, err := WebFiles()
	if err != nil {
		t.Fatalf("WebFiles: %v", err)
	}
	index, err := fs.ReadFile(files, "index.html")
	if err != nil {
		t.Fatalf("the embedded bundle has no index.html: %v", err)
	}
	// vite stamps the mount point into the asset URLs. If this drifts from
	// WebMount the pages load and every chunk 404s.
	want := WebMount + "/assets/"
	if !strings.Contains(string(index), want) {
		t.Errorf("embedded index.html does not reference %q — was web/ built with base %q?", want, WebMount+"/")
	}
}
