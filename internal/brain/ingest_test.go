package brain

import (
	"context"
	"strings"
	"testing"
)

// These guards all return before the store touches the database, which is the
// point: a bad namespace or a forged name must never reach a DELETE.
func guardStore() *Store { return &Store{log: testLogger()} }

// A document is project knowledge. Routing one into an agent's private brain
// would put unvetted content where no other agent can see it and no operator
// thinks to look — the same reasoning that keeps an inbound webhook payload out
// of a private namespace.
func TestIngestRefusesAnAgentsPrivateBrain(t *testing.T) {
	doc := Document{Name: "spec.md", Mime: "text/markdown",
		Data: []byte("The scheduler leases an issue before an agent claims it.")}

	_, err := guardStore().IngestDocument(context.Background(), "default:api-dev", doc, ChunkOptions{})
	if err == nil {
		t.Fatal("a document was accepted into an agent's private brain")
	}
	if !strings.Contains(err.Error(), "project brain") {
		t.Fatalf("unhelpful error: %v", err)
	}

	// The project brain of any fleet is fine — the constant is this install's,
	// not the only legal value.
	for _, ns := range []string{ProjectNamespace, "proj:project", "acme:project"} {
		if _, err := guardStore().IngestDocument(context.Background(), ns, doc, ChunkOptions{}); err != nil &&
			strings.Contains(err.Error(), "project brain") {
			t.Errorf("%s was refused as a project namespace", ns)
		}
	}
}

// '#' separates the name from the chunk index in a source_ref. A name carrying
// one could forge another document's refs — and the prune step DELETEs by that
// prefix, so a forged name is a way to delete somebody else's document.
func TestIngestRejectsNamesThatCouldForgeARef(t *testing.T) {
	for _, name := range []string{"", "   ", "spec#0001", "spec\nmd", "spec\x00"} {
		_, err := guardStore().IngestDocument(context.Background(), ProjectNamespace,
			Document{Name: name, Mime: "text/markdown", Data: []byte("hello there friend")},
			ChunkOptions{})
		if err == nil {
			t.Errorf("name %q was accepted", name)
		}
	}
}

// Fixed width, because the prune that removes a shorter document's leftovers
// compares refs as strings.
func TestDocSourceRefIsOrderedAndFixedWidth(t *testing.T) {
	a, b := DocSourceRef("spec.pdf", 2), DocSourceRef("spec.pdf", 10)
	if len(a) != len(b) {
		t.Fatalf("ragged widths: %q vs %q", a, b)
	}
	if !(a < b) {
		t.Fatalf("%q does not sort before %q", a, b)
	}
	if !strings.HasPrefix(a, docRefPrefix("spec.pdf")) {
		t.Fatalf("%q is not under the document's prefix", a)
	}
	// One document's prefix must not match another's refs, or the prune deletes
	// the wrong document.
	if strings.HasPrefix(DocSourceRef("spec.pdf.old", 0), docRefPrefix("spec.pdf")) {
		t.Fatal("one document's prefix matches another's refs")
	}
}

// A citation has to name the document, not the chunk id.
func TestDocumentNameRoundTrip(t *testing.T) {
	tests := []struct {
		m    Memory
		want string
	}{
		{Memory{SourceKind: DocSourceKind, SourceRef: DocSourceRef("api spec v2.pdf", 7)}, "api spec v2.pdf"},
		{Memory{SourceKind: DocSourceKind, SourceRef: DocSourceRef("a.md", 0)}, "a.md"},
		{Memory{SourceKind: "note", SourceRef: "internal/auth.go"}, ""},
		{Memory{SourceKind: DocSourceKind, SourceRef: "doc:no-index"}, ""},
	}
	for _, tc := range tests {
		if got := DocumentName(tc.m); got != tc.want {
			t.Errorf("DocumentName(%q) = %q, want %q", tc.m.SourceRef, got, tc.want)
		}
	}
}
