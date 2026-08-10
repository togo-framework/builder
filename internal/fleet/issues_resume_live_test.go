package fleet

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/togo-framework/builder/internal/runner"
)

// These tests prove the plan→issues pass is resumable the same way the
// generator tests prove issue #56's fix: kill the run partway and the bodies
// already paid for must be in the database; the re-run must buy only what is
// missing; a third run must buy nothing. A happy-path test proves none of
// that — this feature exists precisely so a timeout costs one issue, not N.
//
// They also pin the two routing consequences the wizard promises: an issue
// whose area nobody owns lands in `triage` unassigned (never handed to
// whoever looks nearest), and the cap is enforced AND reported.

// issueTestRoster builds a roster whose areas carry the test's own prefix, so
// OwnerForArea cannot accidentally match the agents another test file left in
// the shared builder_fleet_test database (testRoster's plain "area-N" names
// collide across suites).
func issueTestRoster(t *testing.T, slugPrefix string, n int) string {
	t.Helper()
	r := roster{Summary: "a team for the issues test"}
	for i := 0; i < n; i++ {
		r.Agents = append(r.Agents, rosterAgent{
			AgentSpec: AgentSpec{
				Slug:        fmt.Sprintf("%sagent-%d", slugPrefix, i),
				DisplayName: fmt.Sprintf("Agent %d", i),
				Description: fmt.Sprintf("Use for surface %d.", i),
				Role:        "advisor",
				Model:       "sonnet",
				Areas:       []string{fmt.Sprintf("%sarea-%d", slugPrefix, i)},
				Tools:       []string{"Read", "Grep"},
			},
			PersonaBrief: fmt.Sprintf("owns surface %d and nothing else", i),
		})
	}
	raw, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func issueListJSON(t *testing.T, items []planIssue) string {
	t.Helper()
	raw, err := json.Marshal(issuePlan{Issues: items})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

var promptIssueTitleRe = regexp.MustCompile(`- title: (.+)`)

// issueRecorder fakes the two session shapes GenerateIssues buys and keeps
// the ledger the assertions read — "did not re-buy" is a claim about sessions
// that never happened, and only a recorder can see an absence.
type issueRecorder struct {
	mu     sync.Mutex
	list   string
	lists  int
	bodies []string // titles served, in completion order
	// cancelAfter: cancel the run's context once this many bodies have been
	// served. Zero means never.
	cancelAfter int
	cancel      context.CancelFunc
}

func (rec *issueRecorder) run(_ context.Context, s runner.Session) (runner.Result, error) {
	rec.mu.Lock()
	defer rec.mu.Unlock()
	switch {
	case strings.Contains(s.Prompt, "Break the operator's plan"):
		rec.lists++
		return runner.Result{Text: rec.list, CostUSD: 0.40}, nil
	case strings.Contains(s.Prompt, "Write the body for one issue"):
		title := promptIssueTitleRe.FindStringSubmatch(s.Prompt)[1]
		if rec.cancelAfter > 0 && len(rec.bodies) >= rec.cancelAfter {
			rec.cancel()
			return runner.Result{}, context.Canceled
		}
		rec.bodies = append(rec.bodies, title)
		return runner.Result{Text: "Done looks like: " + title, CostUSD: 0.05}, nil
	default:
		return runner.Result{}, fmt.Errorf("unexpected prompt: %.80s", s.Prompt)
	}
}

// TestPlanIssuesPersistEachAndResume is the durability contract in one arc:
// kill the run after two bodies (the six skeletons and both bodies must be in
// the database), run again (only the four missing bodies are bought, never
// the list), run a third time (free).
func TestPlanIssuesPersistEachAndResume(t *testing.T) {
	const fleetName, prefix = "iss-fleet", "iss-"
	db := openFleetTestDB(t, fleetName, prefix)
	// Leftovers from a previous run of this binary (-count>1): imported issues
	// are not in openFleetTestDB's per-prefix cleanup list.
	if _, err := db.Exec(`DELETE FROM builder_issues WHERE source = 'import'`); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	g := NewGenerator(db, slog.New(slog.NewTextHandler(io.Discard, nil)), root)
	// Serial, so "cancelled after 2 bodies" is a fact the assertions can count
	// on rather than a race between five in-flight sessions.
	g.parallel = 1

	const plan = "Build an invoicing product with billing, auth, exports and a reporting dashboard."

	// The fleet first — issues are assigned to the fleet the wizard just
	// generated, so the test takes the same path the wizard does.
	fleetRec := &sessionRecorder{roster: issueTestRoster(t, prefix, 4)}
	g.runSession = fleetRec.run
	if _, _, err := g.Generate(context.Background(), fleetName, plan, "", nil); err != nil {
		t.Fatalf("fleet build failed: %v", err)
	}

	items := []planIssue{
		{Title: "Wire the billing export pipeline", Type: "feature", Area: prefix + "area-0", Brief: "invoices export as CSV"},
		{Title: "Fix the login redirect loop", Type: "bug", Area: prefix + "area-1", Brief: "login lands on the dashboard"},
		{Title: "Chart monthly revenue", Type: "feature", Area: prefix + "area-2", Brief: "the dashboard shows revenue by month"},
		{Title: "Rate-limit the auth endpoints", Type: "enhancement", Area: prefix + "area-1", Brief: "brute force is throttled"},
		// No agent owns this surface: must land in triage, unassigned.
		{Title: "Document the tax rules", Type: "chore", Area: "dark-matter", Brief: "the tax doc exists"},
		// Invalid type and shouty area: normalized to 'feature' and matched to
		// agent-3 case-insensitively.
		{Title: "Ship the exports v2 epic", Type: "epic", Area: strings.ToUpper(prefix + "area-3"), Brief: "v2 exports are live"},
	}

	// ---- run 1: dies after two bodies -------------------------------------
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rec1 := &issueRecorder{list: issueListJSON(t, items), cancelAfter: 2, cancel: cancel}
	g.runSession = rec1.run

	if _, _, _, err := g.GenerateIssues(ctx, fleetName, plan, nil); err == nil {
		t.Fatal("run 1 was cancelled mid-flight and must report an error")
	}

	// Every skeleton is on file even though only two bodies finished — the
	// decided list survived the death, so resume cannot re-decide it.
	var got int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues WHERE source = 'import'`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 6 {
		t.Fatalf("skeletons after the crash = %d, want 6 — the list decision was not persisted", got)
	}
	// The two paid-for bodies ARE in the database. This is the whole feature:
	// with a single persist at the end, a death here would discard both.
	paidFor := map[string]string{}
	rows, err := db.Query(
		`SELECT title, body_md FROM builder_issues
		  WHERE source = 'import' AND NOT ($1 = ANY(labels))`, planDraftLabel)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var title, body string
		if err := rows.Scan(&title, &body); err != nil {
			t.Fatal(err)
		}
		if body != "Done looks like: "+title {
			t.Fatalf("issue %q persisted the wrong body: %q", title, body)
		}
		paidFor[title] = body
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(paidFor) != 2 {
		t.Fatalf("bodies persisted after the crash = %d, want 2 — per-issue persistence is broken", len(paidFor))
	}
	// Every imported issue is held for a person, whatever its routing.
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues WHERE source = 'import' AND human_only`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 6 {
		t.Fatalf("human_only issues = %d, want all 6 — plan-derived work must be read before agents spend on it", got)
	}

	// The unroutable issue sits in triage with no assignee — never quietly
	// handed to whoever looks nearest.
	var status string
	var assignee *string
	if err := db.QueryRow(
		`SELECT status::text, assignee_agent_id FROM builder_issues WHERE title = $1`,
		"Document the tax rules").Scan(&status, &assignee); err != nil {
		t.Fatal(err)
	}
	if status != "triage" || assignee != nil {
		t.Fatalf("unroutable issue: status=%q assignee=%v, want triage/unassigned", status, assignee)
	}

	// Routable issues are ready and assigned by area through the
	// orchestrator's router — including the case-folded area and both
	// same-area issues landing on the same owner.
	for title, wantAgent := range map[string]string{
		"Wire the billing export pipeline": prefix + "agent-0",
		"Fix the login redirect loop":      prefix + "agent-1",
		"Rate-limit the auth endpoints":    prefix + "agent-1",
		"Ship the exports v2 epic":         prefix + "agent-3",
	} {
		var st, ag string
		if err := db.QueryRow(
			`SELECT status::text, coalesce(assignee_agent_id,'') FROM builder_issues WHERE title = $1`,
			title).Scan(&st, &ag); err != nil {
			t.Fatalf("%s: %v", title, err)
		}
		if st != "ready" || ag != wantAgent {
			t.Fatalf("%q: status=%q assignee=%q, want ready/%s", title, st, ag, wantAgent)
		}
	}
	// The invented type was normalized, not allowed to abort the transaction.
	var typ string
	if err := db.QueryRow(
		`SELECT type::text FROM builder_issues WHERE title = $1`,
		"Ship the exports v2 epic").Scan(&typ); err != nil {
		t.Fatal(err)
	}
	if typ != "feature" {
		t.Fatalf("invalid type normalized to %q, want feature", typ)
	}

	// ---- run 2: resumes — no list session, no re-bought bodies ------------
	rec2 := &issueRecorder{list: issueListJSON(t, items)}
	g.runSession = rec2.run

	created, dropped, _, err := g.GenerateIssues(context.Background(), fleetName, plan, nil)
	if err != nil {
		t.Fatalf("resume run failed: %v", err)
	}
	if created != 6 || dropped != 0 {
		t.Fatalf("resume reported created=%d dropped=%d, want 6/0", created, dropped)
	}
	if rec2.lists != 0 {
		t.Fatalf("resume ran the list session %d times — the list was already decided, and "+
			"re-deciding it would file duplicate issues under new titles", rec2.lists)
	}
	if len(rec2.bodies) != 4 {
		t.Fatalf("resume ran %d body sessions (%v), want exactly the 4 missing", len(rec2.bodies), rec2.bodies)
	}
	for _, title := range rec2.bodies {
		if _, dup := paidFor[title]; dup {
			t.Fatalf("resume re-generated %q, which was already paid for", title)
		}
	}
	// The run-1 bodies are byte-identical — held, not rewritten.
	for title, want := range paidFor {
		var now string
		if err := db.QueryRow(
			`SELECT body_md FROM builder_issues WHERE title = $1`, title).Scan(&now); err != nil {
			t.Fatal(err)
		}
		if now != want {
			t.Fatalf("body for %q changed across the resume", title)
		}
	}
	// No drafts remain, and no duplicates were filed.
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues WHERE $1 = ANY(labels)`, planDraftLabel).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 0 {
		t.Fatalf("draft labels remaining after a completed resume = %d, want 0", got)
	}
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues WHERE source = 'import'`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != 6 {
		t.Fatalf("issues after the resume = %d, want 6 — the resume filed duplicates", got)
	}

	// ---- run 3: same plan again — completely free -------------------------
	rec3 := &issueRecorder{list: issueListJSON(t, items)}
	g.runSession = rec3.run
	if _, _, _, err := g.GenerateIssues(context.Background(), fleetName, plan, nil); err != nil {
		t.Fatalf("idempotent re-run failed: %v", err)
	}
	if rec3.lists+len(rec3.bodies) != 0 {
		t.Fatalf("pressing the button again bought sessions (lists=%d bodies=%d) — it must be free",
			rec3.lists, len(rec3.bodies))
	}
}

// TestPlanIssuesCapIsEnforcedAndReported pins the bound: a plan that
// decomposes into more issues than the cap files exactly the cap, REPORTS the
// overflow in the return rather than truncating silently, and buys exactly
// one body session per filed issue. With no fleet at all, every issue must
// land in triage, unassigned.
func TestPlanIssuesCapIsEnforcedAndReported(t *testing.T) {
	const fleetName, prefix = "cap-fleet", "cap-"
	db := openFleetTestDB(t, fleetName, prefix)
	if _, err := db.Exec(`DELETE FROM builder_issues WHERE source = 'import'`); err != nil {
		t.Fatal(err)
	}
	g := NewGenerator(db, slog.New(slog.NewTextHandler(io.Discard, nil)), t.TempDir())
	g.parallel = 1

	const plan = "A sprawling plan that decomposes into far more work than anyone agreed to pay for."
	overflow := 4
	items := make([]planIssue, 0, MaxPlanIssues+overflow)
	for i := 0; i < MaxPlanIssues+overflow; i++ {
		items = append(items, planIssue{
			Title: fmt.Sprintf("Cap item %02d", i), Type: "chore",
			Area: "surface-nobody-owns", Brief: "it exists",
		})
	}
	rec := &issueRecorder{list: issueListJSON(t, items)}
	g.runSession = rec.run

	created, dropped, _, err := g.GenerateIssues(context.Background(), fleetName, plan, nil)
	if err != nil {
		t.Fatalf("capped run failed: %v", err)
	}
	if created != MaxPlanIssues {
		t.Fatalf("created = %d, want the cap (%d)", created, MaxPlanIssues)
	}
	if dropped != overflow {
		t.Fatalf("dropped = %d, want %d — the cap must be reported, not silent", dropped, overflow)
	}
	if len(rec.bodies) != MaxPlanIssues {
		t.Fatalf("body sessions = %d, want %d — one model call per FILED issue, none for dropped ones",
			len(rec.bodies), MaxPlanIssues)
	}
	var got int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues WHERE source = 'import'`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != MaxPlanIssues {
		t.Fatalf("issues on the board = %d, want %d", got, MaxPlanIssues)
	}
	// Nobody owns the area and no fleet exists: everything is in triage,
	// unassigned, held for a person.
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_issues
		  WHERE source = 'import' AND status = 'triage'
		    AND assignee_agent_id IS NULL AND human_only`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != MaxPlanIssues {
		t.Fatalf("triage/unassigned/human_only issues = %d, want all %d", got, MaxPlanIssues)
	}
}
