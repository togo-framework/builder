package builder

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/togo-framework/builder/internal/brain"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// The full chain through the REAL adapter and the REAL store: retain a fact,
// then recall it by meaning rather than by exact words, against actual pgvector.
//
// The fake-brain tests prove the orchestrator asks and tells; this proves the
// thing it is talking to genuinely stores and finds. Both halves are needed —
// the bug being fixed here was that the store was never constructed at all.
func TestBrainAdapterRoundTripsThroughPgvector(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if !strings.Contains(dsn, "_test") {
		t.Fatalf("refusing destructive fixtures against %q", dsn)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, q := range []string{
		`DELETE FROM builder_memories`, `DELETE FROM builder_brain_grants`,
		`DELETE FROM builder_agents`, `DELETE FROM builder_brains`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}

	// Agent first: builder_brains.agent_slug is a foreign key to it. The agent
	// starts disabled because an ENABLED builder must already have a brain —
	// the two constraints point at each other, so the row is filled in stages.
	const slug = "wiring-probe"
	if _, err := db.Exec(
		`INSERT INTO builder_agents (slug, display_name, description, role, spec_path, persona_md, enabled)
		 VALUES ($1,$1,'d','builder','.claude/agents/'||$1||'.md','p',false)`, slug); err != nil {
		t.Fatal(err)
	}
	var brainID string
	if err := db.QueryRow(
		`INSERT INTO builder_brains (agent_slug, namespace, embedding_dim)
		 VALUES ($1, 'agent:'||$1, 1024) RETURNING id`, slug).Scan(&brainID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`UPDATE builder_agents SET brain_id=$1, enabled=true WHERE slug=$2`, brainID, slug); err != nil {
		t.Fatal(err)
	}

	store, err := brain.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), brain.HashEmbedder{})
	if err != nil {
		t.Fatal(err)
	}
	a := brainAdapter{store}
	ctx := context.Background()

	ns, err := a.Writable(ctx, slug)
	if err != nil || ns == "" {
		t.Fatalf("Writable = %q, %v", ns, err)
	}

	const fact = "the feedback widget mounts from index.html, not from a React component"
	if _, err := a.Retain(ctx, ns, fact, "issue", "#3", 0.8); err != nil {
		t.Fatalf("Retain: %v", err)
	}

	// It must actually be in the table, WITH an embedding — a row with a NULL
	// vector is invisible to recall and would make this pass for the wrong reason.
	var rows, embedded int
	if err := db.QueryRow(
		`SELECT count(*), count(embedding) FROM builder_memories`).Scan(&rows, &embedded); err != nil {
		t.Fatal(err)
	}
	if rows != 1 || embedded != 1 {
		t.Fatalf("rows=%d embedded=%d, want 1/1 — the memory was not vectorised", rows, embedded)
	}

	// Recall with DIFFERENT words than were stored.
	got, err := a.Recall(ctx, slug, "why does the feedback button not appear", 5)
	if err != nil {
		t.Fatalf("Recall: %v", err)
	}
	if len(got) == 0 {
		t.Fatal("recalled nothing for a closely related query")
	}
	if !strings.Contains(got[0].Content, "index.html") {
		t.Fatalf("top hit is not the stored fact: %q", got[0].Content)
	}
	if got[0].SourceRef != "#3" {
		t.Errorf("provenance lost: SourceRef = %q, want #3", got[0].SourceRef)
	}

	// And an unrelated agent must NOT see it — namespaces are the isolation.
	if _, err := db.Exec(
		`INSERT INTO builder_agents (slug, display_name, description, role, spec_path, persona_md, enabled)
		 VALUES ('other','other','d','advisor','.claude/agents/other.md','p',true)`); err != nil {
		t.Fatal(err)
	}
	leaked, _ := a.Recall(ctx, "other", "feedback widget index.html", 5)
	for _, m := range leaked {
		if strings.Contains(m.Content, "index.html") {
			t.Fatal("another agent recalled a memory from a namespace it does not own")
		}
	}
}
