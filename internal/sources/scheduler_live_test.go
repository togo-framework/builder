package sources

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func openSourceDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if !strings.Contains(dsn, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: the DSN must name a _test database", dsn)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec(`DELETE FROM builder_source_runs`)
	db.Exec(`DELETE FROM builder_source_items`)
	db.Exec(`DELETE FROM builder_sources`)
	return db
}

// recorder stands in for the brain and remembers what was retained.
type recorder struct{ refs, text []string }

func (r *recorder) Retain(_ context.Context, _, content, _, ref string, _ float64) (string, error) {
	r.refs = append(r.refs, ref)
	r.text = append(r.text, content)
	return "id", nil
}

type noVault struct{}

func (noVault) RevealFor(context.Context, string, string, string) (string, error) {
	return "", nil
}

// The seam between the two halves of this package: the scheduler owns the row,
// the lease and the backoff; the registry owns what a source IS. They arrived
// from separate issues and nothing connected them, so a registered kind could
// be constructed by nothing and run by nobody.
//
// Live because every part that can be wrong here is SQL: the fenced claim, the
// cursor round-trip through builder_sources, and the run ledger.
func TestTheSchedulerDrivesARegisteredPlugin(t *testing.T) {
	db := openSourceDB(t)
	ctx := context.Background()
	brain := &recorder{}
	s := New(db, slog.New(slog.NewTextHandler(os.Stderr, nil)), brain, noVault{})

	// A kind that exists only for this test, so the assertion is about the
	// wiring rather than about GitHub's API.
	const kind = "test-plugin"
	shared := &fakeSource{kind: "test-plugin", name: "demo"}
	Register(kind, func(cfg json.RawMessage, _ Secrets) (Source, error) {
		return shared, nil
	})

	if _, err := db.ExecContext(ctx,
		`INSERT INTO builder_sources (kind, name, config, namespace, schedule, enabled, next_run_at)
		 VALUES ($1,'demo','{}','acme:project','@hourly',true, now() - interval '1 minute')`,
		kind); err != nil {
		t.Fatal(err)
	}

	s.RefreshDue(ctx)

	if len(brain.refs) != 2 {
		t.Fatalf("retained %d documents, want 2 — the scheduler did not drive the plugin: %v",
			len(brain.refs), brain.refs)
	}
	// Per-document refs, not one whole-result ref: two files are two answers.
	for _, want := range []string{"source:" + kind + ":demo:a.md", "source:" + kind + ":demo:b.md"} {
		found := false
		for _, got := range brain.refs {
			if got == want {
				found = true
			}
		}
		if !found {
			t.Errorf("missing ref %q, got %v", want, brain.refs)
		}
	}

	// The cursor must survive in the row the scheduler owns, or every restart
	// re-reads every document.
	var cursor, status string
	if err := db.QueryRowContext(ctx,
		`SELECT cursor, last_status FROM builder_sources WHERE kind=$1`, kind).Scan(&cursor, &status); err != nil {
		t.Fatal(err)
	}
	if cursor != "cursor-2" {
		t.Errorf("cursor = %q, want cursor-2 — SetCursor did not persist", cursor)
	}
	if status != "ok" {
		t.Errorf("last_status = %q, want ok", status)
	}

	// And the run is recorded, so an operator can see it happened.
	var runs int
	db.QueryRowContext(ctx, `SELECT count(*) FROM builder_source_runs WHERE status='ok'`).Scan(&runs)
	if runs != 1 {
		t.Errorf("ok runs = %d, want 1", runs)
	}
}

type fakeSource struct {
	kind, name string
	fetches    int
}

func (f *fakeSource) Kind() string { return f.kind }
func (f *fakeSource) Name() string { return f.name }
func (f *fakeSource) Fetch(_ context.Context, cursor string) (Batch, error) {
	f.fetches++
	if f.fetches > 3 {
		panic("Fetch called " + itoa(f.fetches) + " times — something is looping (last cursor: " + cursor + ")")
	}
	return Batch{
		Docs: []Doc{
			{Ref: "a.md", Title: "A", Text: "The scheduler leases a source before it runs."},
			{Ref: "b.md", Title: "B", Text: "The cursor advances only after every document lands."},
		},
		Cursor: "cursor-2",
	}, nil
}

func itoa(i int) string { return strconv.Itoa(i) }
