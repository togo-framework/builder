package sources

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestOpenAnUnknownKindNamesTheKnownOnes(t *testing.T) {
	_, err := Open("gitlab", json.RawMessage(`{}`), nil)
	if err == nil {
		t.Fatal("an unknown kind was accepted")
	}
	if !strings.Contains(err.Error(), KindGitHub) {
		t.Errorf("the error should list what IS known: %v", err)
	}
}

func TestKindsIncludesGitHub(t *testing.T) {
	found := false
	for _, k := range Kinds() {
		if k == KindGitHub {
			found = true
		}
	}
	if !found {
		t.Errorf("Kinds() = %v, want it to include %q", Kinds(), KindGitHub)
	}
}

func TestMemoryRefIsScopedByKindAndSource(t *testing.T) {
	a := MemoryRef(KindGitHub, "acme/widget", "README.md")
	b := MemoryRef(KindGitHub, "acme/gadget", "README.md")
	if a == b {
		t.Fatal("two repositories share a source_ref, so one README would overwrite the other")
	}
	if !strings.HasPrefix(a, "source:github:") {
		t.Errorf("a source_ref should say where it came from: %q", a)
	}
}

// A refresh with nowhere to write is a configuration error, not a silent no-op.
func TestRefreshRefusesAnEmptyNamespace(t *testing.T) {
	if _, err := Refresh(context.Background(), stubSource{}, NewMemCursors(), &fakeBrain{}, ""); !errors.Is(err, ErrNoNamespace) {
		t.Fatalf("err = %v, want ErrNoNamespace", err)
	}
}

type stubSource struct {
	batch Batch
	err   error
}

func (s stubSource) Kind() string { return "stub" }
func (s stubSource) Name() string { return "stub" }
func (s stubSource) Fetch(context.Context, string) (Batch, error) {
	return s.batch, s.err
}

// An empty doc is dropped rather than retained: a memory whose content is a
// blank line matches nothing and dilutes everything.
func TestEmptyDocsAreNotRetained(t *testing.T) {
	src := stubSource{batch: Batch{Docs: []Doc{
		{Ref: "a", Text: "   \n  "},
		{Ref: "b", Text: "real content"},
	}, Cursor: "x"}}
	brain := &fakeBrain{}
	rep, err := Refresh(context.Background(), src, NewMemCursors(), brain, "default:project")
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if rep.Retained != 1 || len(brain.retained) != 1 {
		t.Fatalf("retained %d, want only the non-empty doc", len(brain.retained))
	}
	if brain.retained[0].ref != "source:stub:stub:b" {
		t.Errorf("wrong doc survived: %q", brain.retained[0].ref)
	}
}

// A fetch error is scrubbed on its way out: a connector can quote the request it
// failed on, and this string is headed for a log.
func TestAFetchErrorIsScrubbed(t *testing.T) {
	src := stubSource{err: errors.New("dial https://x:ghp_" + strings.Repeat("q", 36) + "@api.github.com failed")}
	_, err := Refresh(context.Background(), src, NewMemCursors(), &fakeBrain{}, "default:project")
	if err == nil {
		t.Fatal("expected an error")
	}
	if strings.Contains(err.Error(), strings.Repeat("q", 36)) {
		t.Fatalf("a credential survived into an error: %v", err)
	}
}

// Importance has a floor, because the brain treats 0 as "use the default" and a
// source that means 0.9 should not be rounded into the same bucket by accident.
func TestImportanceDefaults(t *testing.T) {
	src := stubSource{batch: Batch{Docs: []Doc{{Ref: "a", Text: "x"}}}}
	brain := &fakeBrain{}
	if _, err := Refresh(context.Background(), src, NewMemCursors(), brain, "default:project"); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	if brain.retained[0].importance != 0.5 {
		t.Errorf("importance = %v, want the 0.5 default", brain.retained[0].importance)
	}
}
