package brain

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func open(t *testing.T) *sql.DB {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	// These fixtures DELETE FROM every table they touch. Refuse to run against
	// anything that is not obviously a throwaway database — an earlier version
	// of this suite wiped builder_dev's agents.
	if !strings.Contains(dsn, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: "+
			"the DSN must name a _test database", dsn)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`DELETE FROM builder_memories`)
	db.Exec(`DELETE FROM builder_memory_gaps`)
	db.Exec(`DELETE FROM builder_brain_grants`)
	db.Exec(`DELETE FROM builder_brains`)
	db.Exec(`DELETE FROM builder_agents`)
	// Two agents, private brains, plus a shared project brain both can read.
	for _, a := range []string{"api-dev", "ui-dev"} {
		db.Exec(`INSERT INTO builder_agents (slug, display_name, description, role, spec_path, persona_md)
		         VALUES ($1,$1,'d','advisor','.claude/agents/'||$1||'.md','p')`, a)
		db.Exec(`INSERT INTO builder_brains (agent_slug, namespace, embedding_dim) VALUES ($1,'proj:'||$1,1024)`, a)
		db.Exec(`INSERT INTO builder_brain_grants (namespace, agent_slug, can_read, can_write)
		         VALUES ('proj:project',$1,true,false)`, a)
	}
	return db
}

func TestBrainIsolationAndRecall(t *testing.T) {
	db := open(t)
	ctx := context.Background()
	s, err := New(db, testLogger(), HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}

	// Each agent retains into its OWN namespace.
	if _, err := s.Retain(ctx, "proj:api-dev", "The auth handler validates the bearer token in middleware.go", "note", "", 0.7); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Retain(ctx, "proj:ui-dev", "The dashboard sidebar is built from the resources meta endpoint", "note", "", 0.7); err != nil {
		t.Fatal(err)
	}
	// A shared fact both can read.
	if _, err := s.Retain(ctx, "proj:project", "This project uses sqlc for all database queries", "note", "", 0.9); err != nil {
		t.Fatal(err)
	}

	// api-dev finds its own + shared, NOT ui-dev's.
	got, err := s.Recall(ctx, "api-dev", "bearer token middleware", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 {
		t.Fatal("api-dev recalled nothing")
	}
	for _, m := range got {
		if m.Namespace == "proj:ui-dev" {
			t.Fatalf("ISOLATION BREACH: api-dev read ui-dev's memory: %q", m.Content)
		}
	}
	if got[0].Namespace != "proj:api-dev" {
		t.Fatalf("want its own memory ranked first, got %s: %q", got[0].Namespace, got[0].Content)
	}

	// The shared brain IS reachable.
	shared, _ := s.Recall(ctx, "ui-dev", "sqlc database queries", 10)
	found := false
	for _, m := range shared {
		if m.Namespace == "proj:project" {
			found = true
		}
	}
	if !found {
		t.Fatal("ui-dev could not read the shared project brain")
	}

	// A read grant must NOT confer write.
	ns, err := s.Writable(ctx, "ui-dev")
	if err != nil {
		t.Fatal(err)
	}
	if ns != "proj:ui-dev" {
		t.Fatalf("writable namespace = %q, want proj:ui-dev", ns)
	}

	// source_ref is identity: re-retaining updates in place, never duplicates.
	id1, _ := s.Retain(ctx, "proj:api-dev", "v1", "file", "internal/auth.go", 0.5)
	id2, _ := s.Retain(ctx, "proj:api-dev", "v2 revised", "file", "internal/auth.go", 0.5)
	if id1 != id2 {
		t.Fatalf("re-retaining the same source_ref made a duplicate: %s vs %s", id1, id2)
	}
	var n int
	db.QueryRow(`SELECT count(*) FROM builder_memories WHERE source_ref='internal/auth.go'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 row for the source_ref, got %d", n)
	}
	var content string
	db.QueryRow(`SELECT content FROM builder_memories WHERE id=$1`, id1).Scan(&content)
	if content != "v2 revised" {
		t.Fatalf("update did not take: %q", content)
	}

	// A miss is recorded as a gap.
	if _, err := s.Recall(ctx, "api-dev", "zzzz nonexistent kubernetes helm chart", 5); err != nil {
		t.Fatal(err)
	}
	var gaps int
	db.QueryRow(`SELECT count(*) FROM builder_memory_gaps WHERE namespace='proj:api-dev'`).Scan(&gaps)
	if gaps == 0 {
		t.Fatal("a recall miss did not record a gap")
	}

	// Embeddings are actually stored and the vector index is usable.
	var withVec int
	db.QueryRow(`SELECT count(*) FROM builder_memories WHERE embedding IS NOT NULL`).Scan(&withVec)
	if withVec == 0 {
		t.Fatal("no embeddings were stored")
	}

	// Forget invalidates rather than deletes.
	if err := s.Forget(ctx, id1, "api-dev"); err != nil {
		t.Fatal(err)
	}
	var invalid sql.NullString
	db.QueryRow(`SELECT invalid_at::text FROM builder_memories WHERE id=$1`, id1).Scan(&invalid)
	if !invalid.Valid {
		t.Fatal("Forget did not set invalid_at")
	}
	db.QueryRow(`SELECT count(*) FROM builder_memories WHERE id=$1`, id1).Scan(&n)
	if n != 1 {
		t.Fatal("Forget deleted the row instead of invalidating it")
	}

	// An agent must not forget another agent's memory.
	id3, _ := s.Retain(ctx, "proj:ui-dev", "ui only", "note", "", 0.5)
	if err := s.Forget(ctx, id3, "api-dev"); err == nil {
		t.Fatal("api-dev was allowed to forget ui-dev's memory")
	}
}

func TestEmbedderDimensionMismatchFailsAtBoot(t *testing.T) {
	if _, err := New(nil, testLogger(), wrongDim{}); err == nil {
		t.Fatal("a wrong-dimension embedder was accepted at boot")
	}
}

type wrongDim struct{}

func (wrongDim) Name() string                                         { return "wrong" }
func (wrongDim) Dimensions() int                                      { return 768 }
func (wrongDim) Embed(context.Context, []string) ([][]float32, error) { return nil, nil }
