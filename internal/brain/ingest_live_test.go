package brain

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

// The issue's small win, end to end: upload a spec, ask a question it answers,
// get the answer with the document cited.
//
// Live because the parts that can actually be wrong here are SQL — the upsert
// that makes a re-upload replace rather than duplicate, and the prune that
// removes a shorter version's leftovers. Neither is observable in memory.
func TestIngestDocumentIntoTheProjectBrain(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	const ns = "proj:project" // the shared brain the fixture grants both agents

	v1 := []byte(`# Retention policy

The retention window for audit events is ninety days. After that the
orchestrator purges them on the nightly sweep.

Deploys are blue-green and a rollback is always manual. The gateway terminates
TLS before traffic reaches any service.

Budgets are enforced per run, per issue and per day. A run that exhausts its
budget aborts and reports rather than continuing on a cheaper model.
`)

	res, err := s.IngestDocument(ctx, ns, Document{
		Name: "retention.md", Mime: "text/markdown", Data: v1,
	}, ChunkOptions{MaxRunes: 200, OverlapRunes: 40})
	if err != nil {
		t.Fatalf("ingest: %v", err)
	}
	if res.Chunks < 2 {
		t.Fatalf("want the document split, got %d chunk(s)", res.Chunks)
	}
	if got := countChunks(t, db, ns, "retention.md"); got != res.Chunks {
		t.Fatalf("%d rows in the brain for %d chunks", got, res.Chunks)
	}

	// An agent asks a question the document answers, and can cite it.
	hits, err := s.Recall(ctx, "api-dev", "how long are audit events kept", 5)
	if err != nil {
		t.Fatal(err)
	}
	cited := ""
	for _, m := range hits {
		if strings.Contains(m.Content, "ninety days") {
			cited = DocumentName(m)
		}
	}
	if cited != "retention.md" {
		t.Fatalf("the answer was not recalled with its document cited; got %q from %d hits", cited, len(hits))
	}

	// Re-uploading the same name REPLACES its chunks rather than duplicating.
	// The revision is shorter, so it also has to take the tail with it: a spec
	// that loses a section must stop answering from the section it lost.
	v2 := []byte(`# Retention policy

The retention window for audit events is thirty days. After that the
orchestrator purges them on the nightly sweep.
`)
	res2, err := s.IngestDocument(ctx, ns, Document{
		Name: "retention.md", Mime: "text/markdown", Data: v2,
	}, ChunkOptions{MaxRunes: 200, OverlapRunes: 40})
	if err != nil {
		t.Fatalf("re-ingest: %v", err)
	}
	if got := countChunks(t, db, ns, "retention.md"); got != res2.Chunks {
		t.Fatalf("re-upload left %d rows for %d chunks — duplicated or orphaned", got, res2.Chunks)
	}
	if res2.Removed == 0 {
		t.Errorf("a shorter revision removed no stale chunks")
	}

	var stale int
	db.QueryRow(`SELECT count(*) FROM builder_memories
	              WHERE namespace = $1 AND content LIKE '%blue-green%'`, ns).Scan(&stale)
	if stale != 0 {
		t.Errorf("%d chunk(s) of the removed section are still answering questions", stale)
	}

	var content string
	if err := db.QueryRow(`SELECT content FROM builder_memories WHERE namespace=$1 AND source_ref=$2`,
		ns, DocSourceRef("retention.md", 0)).Scan(&content); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(content, "thirty days") {
		t.Errorf("chunk 0 was not updated in place: %q", content)
	}

	// Another document is untouched by either.
	if _, err := s.IngestDocument(ctx, ns, Document{
		Name: "limits.csv", Mime: "text/csv",
		Data: []byte("service,limit,window\napi,100,1m\nweb,500,1m\n"),
	}, ChunkOptions{}); err != nil {
		t.Fatalf("ingest csv: %v", err)
	}
	if got := countChunks(t, db, ns, "limits.csv"); got == 0 {
		t.Fatal("the CSV was not retained")
	}

	// Deleting the file deletes its chunks. Leaving them means the brain keeps
	// answering from a document that is no longer there to check.
	n, err := s.ForgetDocument(ctx, ns, "retention.md")
	if err != nil {
		t.Fatal(err)
	}
	if n != res2.Chunks {
		t.Errorf("forgot %d chunks, the document had %d", n, res2.Chunks)
	}
	if got := countChunks(t, db, ns, "retention.md"); got != 0 {
		t.Errorf("%d chunks survived ForgetDocument", got)
	}
	if got := countChunks(t, db, ns, "limits.csv"); got == 0 {
		t.Error("forgetting one document took another with it")
	}
}

// A '%' and a '_' in a name are LIKE wildcards. If the prune used LIKE, this
// document's prefix would match every other document in the brain and deleting
// it would empty the project brain.
func TestPruneIsNotFooledByWildcardsInAName(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	const ns = "proj:project"

	for _, name := range []string{"%_report.csv", "quarterly.md"} {
		if _, err := s.IngestDocument(ctx, ns, Document{
			Name: name, Mime: "text/markdown",
			Data: []byte("The gateway terminates TLS before traffic reaches any service."),
		}, ChunkOptions{}); err != nil {
			t.Fatalf("ingest %s: %v", name, err)
		}
	}
	if _, err := s.ForgetDocument(ctx, ns, "%_report.csv"); err != nil {
		t.Fatal(err)
	}
	if got := countChunks(t, db, ns, "quarterly.md"); got == 0 {
		t.Fatal("a wildcard in one document's name deleted another document")
	}
}

// countChunks counts the live rows belonging to one document. starts_with, not
// LIKE, for the same reason the prune uses it.
func countChunks(t *testing.T, db *sql.DB, ns, name string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_memories
		  WHERE namespace = $1 AND source_kind = $2 AND starts_with(source_ref, $3)`,
		ns, DocSourceKind, docRefPrefix(name)).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
