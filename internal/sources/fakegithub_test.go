package sources

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeGitHub is enough of the GitHub REST API to drive this connector: a HEAD
// commit, a tree, file contents, a compare and an issue list.
//
// A fake rather than a recorded fixture because the interesting behaviour is
// what the connector does NOT request — the whole incremental claim is "a re-run
// does almost nothing", and only a server that counts its own requests can show
// that.
type fakeGitHub struct {
	mu sync.Mutex

	head   string
	branch string
	files  map[string]string // path -> content at HEAD
	sizes  map[string]int    // path -> reported size, when it differs from len
	// ghosts appear in the tree listing but 404 when read, which is what a file
	// deleted between the two requests looks like.
	ghosts  map[string]int
	commits []string // newest first
	compare map[string]compareResult
	issues  []map[string]any

	// requests records every path hit, so a test can assert on traffic.
	requests []string
	// authSeen records the Authorization header of every request.
	authSeen []string
}

type compareResult struct {
	files   []map[string]string // filename/status/previous_filename
	commits []string
	status  int // when non-zero, respond with this instead
}

func newFakeGitHub() *fakeGitHub {
	return &fakeGitHub{
		branch:  "main",
		head:    "aaa111",
		files:   map[string]string{},
		sizes:   map[string]int{},
		ghosts:  map[string]int{},
		compare: map[string]compareResult{},
	}
}

func (f *fakeGitHub) size(p string) int {
	if n, ok := f.sizes[p]; ok {
		return n
	}
	return len(f.files[p])
}

func (f *fakeGitHub) hits(substr string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, r := range f.requests {
		if strings.Contains(r, substr) {
			n++
		}
	}
	return n
}

func (f *fakeGitHub) start(t *testing.T) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(srv.Close)
	return srv.URL
}

func (f *fakeGitHub) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.requests = append(f.requests, r.URL.Path)
	f.authSeen = append(f.authSeen, r.Header.Get("Authorization"))
	f.mu.Unlock()

	p := r.URL.Path
	write := func(v any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(v)
	}

	switch {
	case p == "/repos/acme/widget":
		write(map[string]any{"default_branch": f.branch})

	case strings.HasPrefix(p, "/repos/acme/widget/branches/"):
		name := strings.TrimPrefix(p, "/repos/acme/widget/branches/")
		if name != f.branch {
			http.Error(w, "no branch", http.StatusNotFound)
			return
		}
		write(map[string]any{"commit": map[string]any{"sha": f.head}})

	case strings.HasPrefix(p, "/repos/acme/widget/git/trees/"):
		var tree []map[string]any
		for path := range f.files {
			tree = append(tree, map[string]any{
				"path": path, "type": "blob", "size": f.size(path),
			})
		}
		for path, size := range f.ghosts {
			tree = append(tree, map[string]any{"path": path, "type": "blob", "size": size})
		}
		write(map[string]any{"tree": tree, "truncated": false})

	case strings.HasPrefix(p, "/repos/acme/widget/contents/"):
		path := strings.TrimPrefix(p, "/repos/acme/widget/contents/")
		body, ok := f.files[path]
		if !ok {
			http.Error(w, "no file", http.StatusNotFound)
			return
		}
		write(map[string]any{
			"content":  base64.StdEncoding.EncodeToString([]byte(body)),
			"encoding": "base64",
			"size":     f.size(path),
		})

	case strings.HasPrefix(p, "/repos/acme/widget/compare/"):
		spec := strings.TrimPrefix(p, "/repos/acme/widget/compare/")
		res, ok := f.compare[spec]
		if !ok {
			http.Error(w, "no comparison", http.StatusNotFound)
			return
		}
		if res.status != 0 {
			http.Error(w, "boom", res.status)
			return
		}
		files := []map[string]any{}
		for _, x := range res.files {
			m := map[string]any{"filename": x["filename"], "status": x["status"]}
			if prev := x["previous_filename"]; prev != "" {
				m["previous_filename"] = prev
			}
			files = append(files, m)
		}
		commits := []map[string]any{}
		// The compare endpoint returns commits oldest first.
		for i := len(res.commits) - 1; i >= 0; i-- {
			commits = append(commits, map[string]any{
				"sha":    fmt.Sprintf("sha%d", i),
				"commit": map[string]any{"message": res.commits[i]},
			})
		}
		write(map[string]any{"status": "ahead", "files": files, "commits": commits})

	case p == "/repos/acme/widget/commits":
		out := []map[string]any{}
		for i, msg := range f.commits {
			out = append(out, map[string]any{
				"sha":    fmt.Sprintf("c%d", i),
				"commit": map[string]any{"message": msg},
			})
		}
		write(out)

	case p == "/repos/acme/widget/issues":
		if f.issues == nil {
			write([]any{})
			return
		}
		write(f.issues)

	default:
		http.Error(w, "unhandled "+p, http.StatusNotFound)
	}
}

// fakeVault hands back a token by name, and records what was asked for.
type fakeVault struct {
	values map[string]string
	asked  []string
	err    error
}

func (v *fakeVault) Reveal(_ context.Context, name string) (string, error) {
	v.asked = append(v.asked, name)
	if v.err != nil {
		return "", v.err
	}
	val, ok := v.values[name]
	if !ok {
		return "", fmt.Errorf("no such secret %q", name)
	}
	return val, nil
}

// fakeBrain records retains instead of writing to Postgres.
type fakeBrain struct {
	retained []retained
	err      error
}

type retained struct {
	ns, content, kind, ref string
	importance             float64
}

func (b *fakeBrain) Retain(_ context.Context, ns, content, kind, ref string, imp float64) (string, error) {
	if b.err != nil {
		return "", b.err
	}
	b.retained = append(b.retained, retained{ns, content, kind, ref, imp})
	return fmt.Sprintf("id-%d", len(b.retained)), nil
}

func (b *fakeBrain) byRef(suffix string) (retained, bool) {
	for _, r := range b.retained {
		if strings.HasSuffix(r.ref, suffix) {
			return r, true
		}
	}
	return retained{}, false
}

// newSource is the shorthand every test starts with.
func newSource(t *testing.T, cfg map[string]any, sec Secrets) Source {
	t.Helper()
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	src, err := Open(KindGitHub, raw, sec)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return src
}
