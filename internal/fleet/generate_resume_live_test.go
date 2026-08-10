package fleet

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/togo-framework/builder/internal/runner"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// These tests exist to prove issue #56's fix by breaking it, not by hoping:
// a run is killed partway and the completed personas must already be in the
// database; the re-run must not buy them again; and a third run must buy
// nothing at all. A happy-path test proves none of that.
//
// They run against their OWN database, `builder_fleet_test`, provisioned from
// db/migrations on first use. Sharing builder_test does not work here: the
// brain and orchestrator live fixtures open with blanket DELETEs on
// builder_agents, and under `go test ./...` those run in parallel with this
// package — a neighbour wiping the table mid-run is indistinguishable from
// the persistence bug these tests exist to catch.

const fleetTestDBName = "builder_fleet_test"

var (
	provisionOnce sync.Once
	provisionErr  error
)

// openFleetTestDB derives this package's DSN from TEST_DATABASE_URL and
// provisions the database once per test binary: drop, create, then every file
// in db/migrations in order — the same sequence scaffold runs. Dropping a
// database this suite itself creates is what keeps re-runs honest; the
// migration files are not uniformly re-runnable over an existing schema.
func openFleetTestDB(t *testing.T, fleetName, slugPrefix string) *sql.DB {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	// These fixtures DELETE and the provisioner DROPs its own database.
	// Refuse anything that is not clearly throwaway.
	if !strings.Contains(base, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: "+
			"the DSN must name a _test database", base)
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("TEST_DATABASE_URL is not a URL: %v", err)
	}
	provisionOnce.Do(func() { provisionErr = provisionFleetDB(base) })
	if provisionErr != nil {
		t.Fatalf("provision %s: %v", fleetTestDBName, provisionErr)
	}
	u.Path = "/" + fleetTestDBName
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	// Leftovers from a previous run of THIS test in the same binary (-count>1).
	// Agents first: brains, grants and members cascade from them; the fleet's
	// project brain and the fleet row itself do not.
	for _, d := range []struct{ q, arg string }{
		{`DELETE FROM builder_agents WHERE slug LIKE $1`, slugPrefix + "%"},
		{`DELETE FROM builder_brains WHERE namespace LIKE $1`, fleetName + ":%"},
		{`DELETE FROM builder_fleets WHERE name = $1`, fleetName},
		{`DELETE FROM builder_skills WHERE name LIKE $1`, slugPrefix + "%"},
	} {
		if _, err := db.Exec(d.q, d.arg); err != nil {
			t.Fatalf("%s: %v", d.q, err)
		}
	}
	return db
}

func provisionFleetDB(baseDSN string) error {
	admin, err := sql.Open("pgx", baseDSN)
	if err != nil {
		return err
	}
	defer func() { _ = admin.Close() }()
	// FORCE evicts connections a crashed previous run may have leaked;
	// without it the drop fails and every test after reports the same
	// unhelpful "database is being accessed by other users".
	if _, err := admin.Exec(`DROP DATABASE IF EXISTS ` + fleetTestDBName + ` WITH (FORCE)`); err != nil {
		return fmt.Errorf("drop: %w", err)
	}
	if _, err := admin.Exec(`CREATE DATABASE ` + fleetTestDBName); err != nil {
		return fmt.Errorf("create: %w", err)
	}
	u, err := url.Parse(baseDSN)
	if err != nil {
		return err
	}
	u.Path = "/" + fleetTestDBName
	files, err := filepath.Glob(filepath.Join("..", "..", "db", "migrations", "*.sql"))
	if err != nil || len(files) == 0 {
		return fmt.Errorf("no migration files found: %v", err)
	}
	sort.Strings(files)
	// psql, not db.Exec: the migration files are multi-statement with DO
	// blocks and function bodies, which the driver's extended protocol will
	// not run. This is exactly how scaffold applies them.
	for _, f := range files {
		cmd := exec.Command("psql", u.String(), "-q", "-v", "ON_ERROR_STOP=1", "-f", f)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("apply %s: %w\n%s", filepath.Base(f), err, out)
		}
	}
	return nil
}

// testRoster builds the JSON a phase-1 session would return: n agents and the
// given skills, shaped exactly like the prompt demands.
func testRoster(t *testing.T, slugPrefix string, n int, skillNames ...string) string {
	t.Helper()
	r := roster{Summary: "a team for the test project"}
	for i := 0; i < n; i++ {
		r.Agents = append(r.Agents, rosterAgent{
			AgentSpec: AgentSpec{
				Slug:        fmt.Sprintf("%sagent-%d", slugPrefix, i),
				DisplayName: fmt.Sprintf("Agent %d", i),
				Description: fmt.Sprintf("Use for area %d.", i),
				Role:        "advisor",
				Model:       "sonnet",
				Areas:       []string{fmt.Sprintf("area-%d", i)},
				Tools:       []string{"Read", "Grep"},
			},
			PersonaBrief: fmt.Sprintf("owns area %d and nothing else", i),
		})
	}
	for _, name := range skillNames {
		r.Skills = append(r.Skills, rosterSkill{
			Name: name, Description: "when to load " + name, Brief: "the " + name + " procedure",
		})
	}
	raw, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// validSkillBody passes checkSkillBody, so the fakes never trigger the thin-body
// retry — call counts stay one-per-item and the assertions stay exact.
var validSkillBody = strings.Repeat("word ", minSkillWords+50) +
	"\n## When to use this\nTriggers.\n## Steps\n```sh\ngo test ./...\n```"

var promptSlugRe = regexp.MustCompile(`- slug: (\S+)`)
var promptSkillRe = regexp.MustCompile(`- name: (\S+)`)

// sessionRecorder is the seam's fake: it answers like Claude would and keeps
// the ledger the assertions read — because "did not re-run" is a claim about
// sessions that never happened, and only a recorder can see an absence.
type sessionRecorder struct {
	mu       sync.Mutex
	roster   string // phase-1 answer
	rosters  int
	personas []string // slugs served, in completion order
	skills   []string
	// failSlugs: persona sessions that fail as if they hit their own 4-minute
	// cap — the run must survive them.
	failSlugs map[string]bool
	// cancelAfter: cancel the run's context once this many personas have been
	// served. Zero means never.
	cancelAfter int
	cancel      context.CancelFunc
}

func (rec *sessionRecorder) run(_ context.Context, s runner.Session) (runner.Result, error) {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	switch {
	case strings.Contains(s.Prompt, "Design the TEAM"):
		rec.rosters++
		return runner.Result{Text: rec.roster, SessionID: "sess-roster", CostUSD: 1.0}, nil
	case strings.Contains(s.Prompt, "Write the system prompt"):
		slug := promptSlugRe.FindStringSubmatch(s.Prompt)[1]
		if rec.failSlugs[slug] {
			return runner.Result{CostUSD: 0.01}, fmt.Errorf("session timed out after 4m")
		}
		if rec.cancelAfter > 0 && len(rec.personas) >= rec.cancelAfter {
			rec.cancel()
			return runner.Result{}, context.Canceled
		}
		rec.personas = append(rec.personas, slug)
		return runner.Result{Text: "persona for " + slug, CostUSD: 0.10}, nil
	default: // skill body
		name := promptSkillRe.FindStringSubmatch(s.Prompt)[1]
		rec.skills = append(rec.skills, name)
		return runner.Result{Text: validSkillBody, CostUSD: 0.05}, nil
	}
}

// TestGenerationPersistsEachPersonaAndResumes is the whole of issue #56 in one
// arc: kill the run partway (the DB must hold what was paid for), run again
// (only the missing work runs, and never the roster), run a third time (free),
// then change the plan (a new roster, personas re-decided).
func TestGenerationPersistsEachPersonaAndResumes(t *testing.T) {
	const fleetName, prefix = "rsm-fleet", "rsm-"
	db := openFleetTestDB(t, fleetName, prefix)
	root := t.TempDir()
	g := NewGenerator(db, slog.New(slog.NewTextHandler(io.Discard, nil)), root)
	// Serial, so "cancelled after 4 agents" is a fact the assertions can count
	// on rather than a race between five in-flight sessions.
	g.parallel = 1

	const plan = "Build a REST API with billing, auth and a reporting dashboard for the operations team."
	rosterJSON := testRoster(t, prefix, 7, prefix+"deploy-check", prefix+"review-gate")

	// ---- run 1: dies after four personas ----------------------------------
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rec1 := &sessionRecorder{roster: rosterJSON, cancelAfter: 4, cancel: cancel}
	g.runSession = rec1.run

	_, _, err := g.Generate(ctx, fleetName, plan, "", nil)
	if err == nil {
		t.Fatal("run 1 was cancelled mid-flight and must report an error")
	}

	// The four finished personas ARE in the database. Before the fix, the one
	// persist call at the end meant a death here discarded all of them.
	var got int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_agents WHERE slug LIKE $1 AND persona_md <> ''`,
		prefix+"%").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 4 {
		t.Fatalf("personas persisted after the crash = %d, want 4 — per-agent persistence is broken", got)
	}
	// And every roster slot exists, empty, waiting for a resume.
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_agents WHERE slug LIKE $1`, prefix+"%").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 7 {
		t.Fatalf("skeleton rows = %d, want 7 — the roster decision was not persisted", got)
	}
	var status string
	var rosterStored bool
	if err := db.QueryRow(
		`SELECT status, roster_json IS NOT NULL FROM builder_fleets WHERE name = $1`,
		fleetName).Scan(&status, &rosterStored); err != nil {
		t.Fatal(err)
	}
	if status != "generating" || !rosterStored {
		t.Fatalf("fleet after crash: status=%q rosterStored=%v, want generating/true", status, rosterStored)
	}
	paidFor := map[string]string{}
	rows, err := db.Query(
		`SELECT slug, persona_md FROM builder_agents WHERE slug LIKE $1 AND persona_md <> ''`, prefix+"%")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var s, p string
		if err := rows.Scan(&s, &p); err != nil {
			t.Fatal(err)
		}
		paidFor[s] = p
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	// ---- run 2: resumes — no roster session, no re-bought personas --------
	rec2 := &sessionRecorder{roster: rosterJSON}
	g.runSession = rec2.run

	m, _, err := g.Generate(context.Background(), fleetName, plan, "", nil)
	if err != nil {
		t.Fatalf("resume run failed: %v", err)
	}
	if rec2.rosters != 0 {
		t.Fatalf("resume ran the roster session %d times — the roster was already decided and "+
			"re-deciding it could produce a different team than the personas already written", rec2.rosters)
	}
	if len(rec2.personas) != 3 {
		t.Fatalf("resume ran %d persona sessions (%v), want exactly the 3 missing agents",
			len(rec2.personas), rec2.personas)
	}
	for _, slug := range rec2.personas {
		if _, dup := paidFor[slug]; dup {
			t.Fatalf("resume re-generated %s, which was already paid for", slug)
		}
	}
	if len(rec2.skills) != 2 {
		t.Fatalf("resume ran %d skill sessions, want 2", len(rec2.skills))
	}
	// The personas from run 1 are byte-identical — held, not rewritten.
	for slug, want := range paidFor {
		var now string
		if err := db.QueryRow(
			`SELECT persona_md FROM builder_agents WHERE slug = $1`, slug).Scan(&now); err != nil {
			t.Fatal(err)
		}
		if now != want {
			t.Fatalf("persona for %s changed across the resume", slug)
		}
	}
	if len(m.Agents) != 7 || len(m.Skills) != 2 {
		t.Fatalf("resumed manifest has %d agents / %d skills, want 7 / 2", len(m.Agents), len(m.Skills))
	}
	// Roster order survives the resume: agent files and fleet_members
	// sort_order are derived from manifest order.
	for i, a := range m.Agents {
		if a.Slug != fmt.Sprintf("%sagent-%d", prefix, i) {
			t.Fatalf("manifest order broken at %d: %s", i, a.Slug)
		}
	}
	if err := db.QueryRow(
		`SELECT status FROM builder_fleets WHERE name = $1`, fleetName).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "active" {
		t.Fatalf("fleet status after a completed resume = %q, want active", status)
	}
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_skills WHERE name LIKE $1 AND body_md <> ''`,
		prefix+"%").Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 2 {
		t.Fatalf("skill bodies catalogued = %d, want 2", got)
	}
	for i := 0; i < 7; i++ {
		p := filepath.Join(root, ".claude", "agents", fmt.Sprintf("%sagent-%d.md", prefix, i))
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("agent file missing after resume: %v", err)
		}
	}

	// ---- run 3: same plan again — completely free -------------------------
	rec3 := &sessionRecorder{roster: rosterJSON}
	g.runSession = rec3.run
	if _, _, err := g.Generate(context.Background(), fleetName, plan, "", nil); err != nil {
		t.Fatalf("idempotent re-run failed: %v", err)
	}
	if rec3.rosters+len(rec3.personas)+len(rec3.skills) != 0 {
		t.Fatalf("pressing Generate again bought sessions (roster=%d personas=%d skills=%d) — it must be free",
			rec3.rosters, len(rec3.personas), len(rec3.skills))
	}

	// ---- run 4: a CHANGED plan is a new generation, not a resume ----------
	rec4 := &sessionRecorder{roster: rosterJSON}
	g.runSession = rec4.run
	if _, _, err := g.Generate(context.Background(), fleetName, plan+" Now with exports.", "", nil); err != nil {
		t.Fatalf("regeneration after a plan change failed: %v", err)
	}
	if rec4.rosters != 1 {
		t.Fatalf("a changed plan must re-decide the roster; roster sessions = %d", rec4.rosters)
	}
	if len(rec4.personas) != 7 {
		t.Fatalf("a changed plan must rewrite every persona; persona sessions = %d", len(rec4.personas))
	}
	// Skills are deliberately NOT rewritten on a plan change: a non-empty
	// catalogue body is never overwritten (it may be hand-written), and the
	// explicit regenerate endpoint exists for refreshing one.
	if len(rec4.skills) != 0 {
		t.Fatalf("a plan change regenerated %d skills; existing bodies must be kept", len(rec4.skills))
	}
}

// TestConcurrentGenerationIsBoundedAndCountsCompletions runs phase 2 at the
// real concurrency and pins three things: the limit actually bounds in-flight
// sessions, one agent failing on its own cap fails that agent only, and the
// progress callback's `done` counts persisted items — never launched ones.
func TestConcurrentGenerationIsBoundedAndCountsCompletions(t *testing.T) {
	const fleetName, prefix = "bnd-fleet", "bnd-"
	db := openFleetTestDB(t, fleetName, prefix)
	root := t.TempDir()
	g := NewGenerator(db, slog.New(slog.NewTextHandler(io.Discard, nil)), root)

	const plan = "Build a warehouse management system with twelve distinct functional areas to staff."
	rosterJSON := testRoster(t, prefix, 12)

	rec := &sessionRecorder{
		roster:    rosterJSON,
		failSlugs: map[string]bool{prefix + "agent-3": true},
	}

	// Track the concurrency the seam actually sees.
	var mu sync.Mutex
	inFlight, peak := 0, 0
	pair := make(chan struct{})
	g.runSession = func(ctx context.Context, s runner.Session) (runner.Result, error) {
		mu.Lock()
		inFlight++
		if inFlight > peak {
			peak = inFlight
		}
		mu.Unlock()
		defer func() { mu.Lock(); inFlight--; mu.Unlock() }()
		if strings.Contains(s.Prompt, "Write the system prompt") {
			// Rendezvous: hold this session open until a sibling is also in
			// flight, so overlap becomes a fact the peak counter records
			// rather than a race the scheduler may or may not exhibit under
			// load (an instant fake can finish before the next worker even
			// starts, making concurrent code look serial). A genuinely serial
			// phase 2 has no sibling to pair with: every session times out
			// and the peak assertion below reports it.
			select {
			case pair <- struct{}{}:
			case <-pair:
			case <-time.After(2 * time.Second):
			}
		}
		return rec.run(ctx, s)
	}

	// The callback fires from concurrent workers, exactly as it does under the
	// wizard, so it takes the test's own lock. Deliveries can interleave out
	// of order, so the assertion is on the running max, not strict order.
	maxDone := 0
	m, _, err := g.Generate(context.Background(), fleetName, plan, "",
		func(stage string, done, total int, _ float64) {
			if stage != "persona" && stage != "skill" {
				return
			}
			mu.Lock()
			if done > maxDone {
				maxDone = done
			}
			mu.Unlock()
			// done counts completions: it can never exceed what is actually
			// persisted at the time of the report. Persisted rows only grow,
			// so this cannot false-positive on interleaving.
			var persisted int
			if err := db.QueryRow(
				`SELECT count(*) FROM builder_agents WHERE slug LIKE $1 AND persona_md <> ''`,
				prefix+"%").Scan(&persisted); err == nil {
				if done > persisted {
					t.Errorf("progress reported done=%d with only %d persisted — counting launches, not completions",
						done, persisted)
				}
			}
		})
	if err != nil {
		t.Fatalf("one agent hitting its own cap must not fail the run: %v", err)
	}
	if peak > maxParallelWrites {
		t.Fatalf("in-flight sessions peaked at %d, the bound is %d", peak, maxParallelWrites)
	}
	if peak < 2 {
		t.Fatalf("in-flight sessions peaked at %d — phase 2 is still serial", peak)
	}
	if maxDone != 12 {
		t.Fatalf("highest reported done = %d, want 12", maxDone)
	}

	// agent-3's session died on its own; the run must have fallen back to the
	// brief and persisted it, leaving all twelve agents complete.
	var persona string
	if err := db.QueryRow(
		`SELECT persona_md FROM builder_agents WHERE slug = $1`, prefix+"agent-3").Scan(&persona); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(persona, "owns area 3") {
		t.Fatalf("agent-3 did not get the brief fallback: %q", persona)
	}
	var full int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_agents WHERE slug LIKE $1 AND persona_md <> ''`,
		prefix+"%").Scan(&full); err != nil {
		t.Fatal(err)
	}
	if full != 12 {
		t.Fatalf("agents with personas = %d, want 12", full)
	}
	// Concurrency must not scramble the manifest: file order and fleet_members
	// sort_order come from it.
	for i, a := range m.Agents {
		if a.Slug != fmt.Sprintf("%sagent-%d", prefix, i) {
			t.Fatalf("manifest order broken at %d: %s", i, a.Slug)
		}
	}
}
