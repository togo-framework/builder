package brain

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// brainTestDBName is this package's OWN database.
//
// These fixtures open with blanket DELETEs on builder_memories, builder_brains
// and builder_agents. Under `go test ./...` the package binaries run in
// PARALLEL, and the root package's brain-wiring test plus the orchestrator's
// fixtures delete the same tables — so on a shared database a neighbour wipes
// the rows mid-run and the failure reads as a recall bug. Measured before this
// change: 4 of 8 whole-repo runs failed on exactly that, with the two suites
// blaming each other.
//
// internal/fleet already solved this the same way, for the same reason. The
// difference here is that this provisioner NEVER DROPS: it creates the database
// only when it does not exist, and the per-test DELETEs handle reuse. A test
// harness that drops a database is one typo in a DSN away from dropping the
// wrong one.
const brainTestDBName = "builder_brain_test"

var (
	provisionOnce sync.Once
	provisionErr  error
)

func open(t *testing.T) *sql.DB {
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	// These fixtures DELETE FROM every table they touch. Refuse to run against
	// anything that is not obviously a throwaway database — an earlier version
	// of this suite wiped builder_dev's agents.
	if !strings.Contains(base, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: "+
			"the DSN must name a _test database", base)
	}
	provisionOnce.Do(func() { provisionErr = provisionBrainDB(base) })
	if provisionErr != nil {
		t.Fatalf("provision %s: %v", brainTestDBName, provisionErr)
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("TEST_DATABASE_URL is not a URL: %v", err)
	}
	u.Path = "/" + brainTestDBName

	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	// Checked, not ignored. A fixture INSERT that silently fails leaves the
	// agent with no brain row, Recall resolves no readable namespace and
	// returns nothing — which reads on screen as "the answer was not recalled",
	// i.e. exactly like the recall bug these tests exist to catch. Hours were
	// spent on that diagnosis once.
	for _, q := range []string{
		`DELETE FROM builder_memories`,
		`DELETE FROM builder_memory_gaps`,
		`DELETE FROM builder_brain_grants`,
		`DELETE FROM builder_brains`,
		`DELETE FROM builder_agents`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("fixture %s: %v", q, err)
		}
	}
	// Two agents, private brains, plus a shared project brain both can read.
	for _, a := range []string{"api-dev", "ui-dev"} {
		if _, err := db.Exec(`INSERT INTO builder_agents (slug, display_name, description, role, spec_path, persona_md)
		         VALUES ($1,$1,'d','advisor','.claude/agents/'||$1||'.md','p')`, a); err != nil {
			t.Fatalf("fixture agent %s: %v", a, err)
		}
		if _, err := db.Exec(`INSERT INTO builder_brains (agent_slug, namespace, embedding_dim) VALUES ($1,'proj:'||$1,1024)`, a); err != nil {
			t.Fatalf("fixture brain %s: %v", a, err)
		}
		if _, err := db.Exec(`INSERT INTO builder_brain_grants (namespace, agent_slug, can_read, can_write)
		         VALUES ('proj:project',$1,true,false)`, a); err != nil {
			t.Fatalf("fixture grant %s: %v", a, err)
		}
	}
	return db
}

// provisionBrainDB creates this package's database if it is not already there
// and applies every migration in order — the same sequence scaffold runs.
//
// Create-if-absent, never drop. An existing database is reused as-is; the
// per-test DELETEs above are what make a re-run clean. That means a schema
// change needs the database removed by hand once, which is a deliberate trade:
// a harness that DROPs on every run is one wrong DSN away from taking a real
// database with it, and the migrations are not uniformly re-runnable anyway.
func provisionBrainDB(baseDSN string) error {
	admin, err := sql.Open("pgx", baseDSN)
	if err != nil {
		return err
	}
	defer func() { _ = admin.Close() }()

	var exists bool
	if err := admin.QueryRow(
		`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`,
		brainTestDBName).Scan(&exists); err != nil {
		return fmt.Errorf("look for %s: %w", brainTestDBName, err)
	}

	u, err := url.Parse(baseDSN)
	if err != nil {
		return err
	}
	u.Path = "/" + brainTestDBName

	if exists {
		// Already provisioned. Confirm the newest migration landed, so a stale
		// database reports what is wrong instead of failing later as a missing
		// column somewhere unrelated.
		db, err := sql.Open("pgx", u.String())
		if err != nil {
			return err
		}
		defer func() { _ = db.Close() }()
		var ok bool
		if err := db.QueryRow(`SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			 WHERE table_name = 'builder_memories' AND column_name = 'embedding_model')`).Scan(&ok); err != nil {
			return fmt.Errorf("inspect %s: %w", brainTestDBName, err)
		}
		if !ok {
			return fmt.Errorf("%s predates migration 0018; drop it by hand and re-run: dropdb %s",
				brainTestDBName, brainTestDBName)
		}
		return nil
	}

	if _, err := admin.Exec(`CREATE DATABASE ` + brainTestDBName); err != nil {
		return fmt.Errorf("create %s: %w", brainTestDBName, err)
	}
	files, err := filepath.Glob(filepath.Join("..", "..", "db", "migrations", "*.sql"))
	if err != nil || len(files) == 0 {
		return fmt.Errorf("no migration files found: %v", err)
	}
	sort.Strings(files)
	// psql, not db.Exec: the migration files are multi-statement with DO blocks
	// and function bodies, which the driver's extended protocol will not run.
	for _, f := range files {
		cmd := exec.Command("psql", u.String(), "-q", "-v", "ON_ERROR_STOP=1", "-f", f)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("apply %s: %w\n%s", filepath.Base(f), err, out)
		}
	}
	return nil
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
