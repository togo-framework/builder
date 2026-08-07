package orchestrator

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/togo-framework/builder/internal/runner"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func open(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	// These fixtures DELETE. Refuse anything that is not a throwaway database.
	if !strings.Contains(dsn, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: "+
			"the DSN must name a _test database", dsn)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Enough connections that the racers are genuinely concurrent rather than
	// serialised by the pool — which would make this test pass for the wrong reason.
	db.SetMaxOpenConns(20)
	for _, q := range []string{
		`DELETE FROM builder_issue_activity`, `DELETE FROM builder_decisions`,
		`DELETE FROM builder_runs`, `DELETE FROM builder_issues`,
		// Agents first: brains cascade from them. The other order nulls
		// brain_id on an enabled builder and trips the needs-a-brain CHECK.
		`DELETE FROM builder_brain_grants`, `DELETE FROM builder_agents`,
		`DELETE FROM builder_brains`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	return db
}

func newOrch(db *sql.DB) *Orchestrator {
	cfg := DefaultConfig()
	cfg.LeaseTTL = 5 * time.Minute
	return New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), cfg)
}

// seedAgent creates an enabled builder AND its brain.
//
// The brain is not optional: builder_agents carries a CHECK that an enabled
// builder must have one, on the grounds that a code-writing agent without
// memory relearns the codebase every run. The constraint caught this fixture
// before the fixture caught anything else — which is the constraint working.
func seedAgent(t *testing.T, db *sql.DB, slug string) {
	t.Helper()
	if _, err := db.Exec(
		`INSERT INTO builder_agents (slug, display_name, description, role, spec_path, persona_md, enabled)
		 VALUES ($1,$1,'d','builder','.claude/agents/'||$1||'.md','p',false)`, slug); err != nil {
		t.Fatal(err)
	}
	var brainID string
	if err := db.QueryRow(
		`INSERT INTO builder_brains (agent_slug, namespace, embedding_dim)
		 VALUES ($1,'test:'||$1,1024) RETURNING id`, slug).Scan(&brainID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(
		`UPDATE builder_agents SET brain_id=$1, enabled=true WHERE slug=$2`, brainID, slug); err != nil {
		t.Fatal(err)
	}
}

func seedIssue(t *testing.T, db *sql.DB, num int, status string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(
		`INSERT INTO builder_issues (number, title, board_rank, status, reporter_kind)
		 VALUES ($1::int, 'issue '||$1::text, 'm'||$1::text, $2::builder_issue_status, 'human')
		 RETURNING id`,
		num, status).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// The property the entire loop rests on: N runners racing for ONE issue, and
// exactly one wins. Tested serially before this, which proves nothing about
// concurrency — a CAS that is merely "usually right" corrupts the queue.
func TestClaimIsAtomicUnderRealConcurrency(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	const racers = 12
	for i := 0; i < racers; i++ {
		seedAgent(t, db, "racer-"+string(rune('a'+i)))
	}
	seedIssue(t, db, 1, "ready") // exactly ONE claimable issue

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		wins    []*Claim
		noWork  int
		errored int
		start   = make(chan struct{})
	)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start // release them all at once
			c, err := o.ClaimFor(ctx, "racer-"+string(rune('a'+i)), "sonnet", nil)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == ErrNoWork:
				noWork++
			case err != nil:
				errored++
				t.Logf("claim error: %v", err)
			default:
				wins = append(wins, c)
			}
		}(i)
	}
	close(start)
	wg.Wait()

	if len(wins) != 1 {
		t.Fatalf("EXACTLY ONE runner must win; got %d winners (%d no-work, %d errors)",
			len(wins), noWork, errored)
	}
	if noWork != racers-1 {
		t.Fatalf("the %d losers should all report ErrNoWork; got %d (errors: %d)",
			racers-1, noWork, errored)
	}

	// The winner's state must be coherent.
	var status, token string
	var attempt int
	if err := db.QueryRow(
		`SELECT status::text, claim_token::text, attempt_count FROM builder_issues WHERE number=1`,
	).Scan(&status, &token, &attempt); err != nil {
		t.Fatal(err)
	}
	if status != "in_progress" {
		t.Fatalf("status = %q, want in_progress", status)
	}
	if token != wins[0].Token {
		t.Fatalf("the stored fencing token is not the winner's")
	}
	// Incremented ONCE — a losing racer must not have bumped it.
	if attempt != 1 {
		t.Fatalf("attempt_count = %d, want 1 (a loser incremented it)", attempt)
	}

	var runs int
	db.QueryRow(`SELECT count(*) FROM builder_runs`).Scan(&runs)
	if runs != 1 {
		t.Fatalf("run rows = %d, want 1", runs)
	}
}

// Fencing: a runner whose lease was reaped and re-claimed must not be able to
// write. Without this a zombie silently overwrites the new holder's work.
func TestFencingTokenStopsAZombieRunner(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "agent-a")
	seedAgent(t, db, "agent-b")
	seedIssue(t, db, 1, "ready")

	zombie, err := o.ClaimFor(ctx, "agent-a", "sonnet", nil)
	if err != nil {
		t.Fatal(err)
	}

	// Drive the REAL reaper rather than hand-rolling its effect: expire the
	// lease, then let reapExpiredLeases do whatever it actually does.
	if _, err := db.Exec(
		`UPDATE builder_issues SET lease_expires_at = now() - interval '1 minute'
		  WHERE id=$1`, zombie.IssueID); err != nil {
		t.Fatal(err)
	}
	o.reapExpiredLeases(ctx)

	// The reaper must un-pin the issue. Leaving it assigned to the agent that
	// just died means a crashed agent holds the work until attempts exhaust.
	var assignee sql.NullString
	db.QueryRow(`SELECT assignee_agent_id FROM builder_issues WHERE id=$1`,
		zombie.IssueID).Scan(&assignee)
	if assignee.Valid && assignee.String != "" {
		t.Fatalf("the reaper left the issue pinned to %q — another agent can never take it",
			assignee.String)
	}
	fresh, err := o.ClaimFor(ctx, "agent-b", "sonnet", nil)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.Token == zombie.Token {
		t.Fatal("a re-claim reused the old fencing token")
	}

	// The zombie's heartbeat must fail — that is how it learns it has lost.
	if err := o.Heartbeat(ctx, zombie); err == nil {
		t.Fatal("the zombie's heartbeat succeeded; fencing did not work")
	}
	// And the new holder's must still work.
	if err := o.Heartbeat(ctx, fresh); err != nil {
		t.Fatalf("the legitimate holder's heartbeat failed: %v", err)
	}

	// The zombie finishing must be a no-op, not a clobber.
	o.finish(ctx, zombie, "in_review", "completed", finishDetail{
		RunStatus: "succeeded", Branch: "zombie/branch",
	})
	var status, branch string
	db.QueryRow(`SELECT status::text, branch FROM builder_issues WHERE number=1`).Scan(&status, &branch)
	if status != "in_progress" {
		t.Fatalf("the zombie moved the issue to %q", status)
	}
	if branch == "zombie/branch" {
		t.Fatal("the zombie wrote its branch over the live holder's")
	}
}

// The three exclusions must hold, and they are enforced by the claim SQL rather
// than by any caller remembering to check.
func TestClaimExclusions(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()
	seedAgent(t, db, "agent-a")

	humanOnly := seedIssue(t, db, 10, "ready")
	db.Exec(`UPDATE builder_issues SET human_only=true WHERE id=$1`, humanOnly)

	exhausted := seedIssue(t, db, 11, "ready")
	db.Exec(`UPDATE builder_issues SET attempt_count=3, max_attempts=3 WHERE id=$1`, exhausted)

	blocked := seedIssue(t, db, 12, "ready")
	var did string
	db.QueryRow(`INSERT INTO builder_decisions (issue_id, kind, state, question_md)
	             VALUES ($1,'question','pending','?') RETURNING id`, blocked).Scan(&did)
	db.Exec(`UPDATE builder_issues SET blocked_on_decision_id=$1 WHERE id=$2`, did, blocked)

	if _, err := o.ClaimFor(ctx, "agent-a", "sonnet", nil); err != ErrNoWork {
		t.Fatalf("claimed an excluded issue; want ErrNoWork, got %v", err)
	}

	// Answering the decision must make the blocked one claimable again.
	db.Exec(`UPDATE builder_decisions SET state='answered' WHERE id=$1`, did)
	db.Exec(`UPDATE builder_issues SET blocked_on_decision_id=NULL WHERE id=$1`, blocked)
	c, err := o.ClaimFor(ctx, "agent-a", "sonnet", nil)
	if err != nil {
		t.Fatalf("the unblocked issue was still not claimable: %v", err)
	}
	if c.Number != 12 {
		t.Fatalf("claimed #%d, want #12", c.Number)
	}
}

// Priority must beat age: a critical issue filed last is claimed first.
func TestClaimOrdersByPriorityThenAge(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()
	seedAgent(t, db, "agent-a")

	seedIssue(t, db, 1, "ready") // oldest, normal
	seedIssue(t, db, 2, "ready")
	late := seedIssue(t, db, 3, "ready")
	db.Exec(`UPDATE builder_issues SET priority='critical' WHERE id=$1`, late)

	c, err := o.ClaimFor(ctx, "agent-a", "sonnet", nil)
	if err != nil {
		t.Fatal(err)
	}
	if c.Number != 3 {
		t.Fatalf("claimed #%d; the critical issue (#3) must win despite being newest", c.Number)
	}
}

// Unowned work must NOT be handed to whoever polls first.
//
// It used to be: `c.area = ”` made an unrouted issue claimable by every agent.
// In practice the feedback-SDK agent picked up host-dashboard work twice and
// spent a full run each time correctly refusing it. Unowned work is an operator
// decision, so it waits to be routed rather than racing.
func TestUnownedWorkIsNotClaimedBySpecialists(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "specialist")
	if _, err := db.Exec(
		`UPDATE builder_agents SET areas = '{sdk,widget}' WHERE slug = 'specialist'`); err != nil {
		t.Fatal(err)
	}
	seedIssue(t, db, 1, "ready") // area defaults to ''

	if _, err := o.ClaimFor(ctx, "specialist", "sonnet", []string{"sdk", "widget"}); err != ErrNoWork {
		t.Fatalf("a specialist claimed unowned work; want ErrNoWork, got %v", err)
	}

	// Routing it into the agent's area makes it claimable.
	if _, err := db.Exec(`UPDATE builder_issues SET area='sdk' WHERE number=1`); err != nil {
		t.Fatal(err)
	}
	if _, err := o.ClaimFor(ctx, "specialist", "sonnet", []string{"sdk", "widget"}); err != nil {
		t.Fatalf("the routed issue was still not claimable: %v", err)
	}
}

// A generalist — an agent declaring NO areas — still takes anything, including
// unowned work. Without this the queue would stall for every fleet that has not
// bothered to declare areas.
func TestGeneralistStillTakesUnownedWork(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "generalist") // no areas
	seedIssue(t, db, 1, "ready")

	c, err := o.ClaimFor(ctx, "generalist", "sonnet", nil)
	if err != nil {
		t.Fatalf("a generalist could not claim unowned work: %v", err)
	}
	if c.Number != 1 {
		t.Fatalf("claimed #%d, want #1", c.Number)
	}
}

// The daily ceiling must cover EVERY kind of spend.
//
// recordSpend files every run under the 'fleet' roll-up, broken out by kind in
// scope_ref, and overBudget sums that roll-up. The first attempt at attribution
// put the kind in `scope`, which violates the schema's CHECK — and since
// recordSpend only LOGS its error, every spend row would have been dropped and
// the ceiling would have read zero forever. This test fails on that.
func TestCeilingCountsEveryScope(t *testing.T) {
	db := open(t)
	defer db.Close()
	if _, err := db.Exec(`DELETE FROM builder_spend WHERE day = current_date`); err != nil {
		t.Fatal(err)
	}
	o := newOrch(db)
	o.cfg.DailyBudgetUSD = 1.00
	ctx := context.Background()

	// Spend under three different scopes, none of them 'fleet'.
	o.recordSpend(ctx, "triage", 0.40, 10, 10)
	o.recordSpend(ctx, "implement", 0.40, 10, 10)
	o.recordSpend(ctx, "brain", 0.30, 10, 10)

	over, spent, err := o.overBudget(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if spent < 1.09 || spent > 1.11 {
		t.Fatalf("ceiling saw %.4f of the 1.10 actually spent — a scope is invisible to it", spent)
	}
	if !over {
		t.Fatal("spent 1.10 against a 1.00 ceiling and the queue was not parked")
	}

	// And the breakdown the operator reads must be per kind, not one bucket.
	var kinds int
	if err := db.QueryRow(
		`SELECT count(DISTINCT scope_ref) FROM builder_spend WHERE day = current_date`).Scan(&kinds); err != nil {
		t.Fatal(err)
	}
	if kinds != 3 {
		t.Fatalf("spend collapsed into %d kind(s); want 3 — attribution is lost", kinds)
	}
}

// The default must be: nothing leaves the machine.
//
// This is the single most important default in the plugin. A regression that
// flipped it would push agent-written branches to a real remote — and unlike
// every other artefact of a run, that cannot be undone.
func TestPublishPushesNothingByDefault(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	if o.cfg.OpenPR {
		t.Fatal("DefaultConfig has OpenPR=true — the loop would push without being asked")
	}

	seedAgent(t, db, "agent-a")
	id := seedIssue(t, db, 1, "ready")
	c := &Claim{IssueID: id, Number: 1, Agent: "agent-a", RunID: newUUID()}

	// ws is nil on purpose: with publishing off, nothing may touch the
	// workspace or the network. A nil dereference here IS the test failing.
	got := o.publish(context.Background(), c, nil, "builder/issue-1",
		implementVerdict{Summary: "s", WhatChanged: "w"},
		runner.Diff{}, "_stats_", "_verified_")

	if got.Pushed {
		t.Fatal("reported a push with OpenPR=false")
	}
	if got.URL != "" {
		t.Fatalf("reported a PR URL %q with OpenPR=false", got.URL)
	}
	if !strings.Contains(got.Note, "Nothing was pushed") {
		t.Fatalf("the operator is not told the work stayed local; note was:\n%s", got.Note)
	}
	if !strings.Contains(got.Note, "BUILDER_OPEN_PR=1") {
		t.Fatal("the note does not say how to turn publishing on")
	}
	// And nothing was recorded against the issue.
	var prURL string
	db.QueryRow(`SELECT pr_url FROM builder_issues WHERE id=$1`, id).Scan(&prURL)
	if prURL != "" {
		t.Fatalf("pr_url was written as %q with OpenPR=false", prURL)
	}
}

// fakeBrain records what the loop asks of it, so the wiring can be asserted
// without depending on embedding quality.
type fakeBrain struct {
	recalled  []string
	retained  []string
	namespace string
	give      []Memory
}

func (f *fakeBrain) Recall(_ context.Context, agent, query string, _ int) ([]Memory, error) {
	f.recalled = append(f.recalled, agent+"|"+query)
	return f.give, nil
}
func (f *fakeBrain) Writable(_ context.Context, agent string) (string, error) {
	return f.namespace, nil
}
func (f *fakeBrain) Retain(_ context.Context, ns, content, kind, ref string, imp float64) (string, error) {
	f.retained = append(f.retained, ns+"|"+content+"|"+kind+"|"+ref)
	return "id", nil
}

// The loop must ASK the brain before working, and TELL it afterwards.
//
// Both halves were missing entirely: the brain provider was a stub and the
// orchestrator never referenced it, so builder_memories stayed empty run after
// run while the code looked complete.
func TestLoopRecallsBeforeAndRetainsAfter(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	fb := &fakeBrain{
		namespace: "agent:agent-a",
		give: []Memory{{
			Content:    "the widget mounts from index.html, not from React",
			SourceKind: "issue", SourceRef: "#3",
		}},
	}
	o.SetBrain(fb)

	seedAgent(t, db, "agent-a")
	id := seedIssue(t, db, 1, "ready")
	c := &Claim{IssueID: id, Number: 1, Agent: "agent-a", Title: "Widget will not mount",
		Body: "clicking feedback does nothing", Area: "sdk", Type: "bug", RunID: newUUID()}

	// Recall — the memory must reach the prompt text verbatim.
	section := o.recallFor(ctx, c)
	if len(fb.recalled) != 1 {
		t.Fatalf("the loop did not ask the brain (calls=%d)", len(fb.recalled))
	}
	if !strings.Contains(fb.recalled[0], "Widget will not mount") {
		t.Fatalf("recall query lacks the issue's subject: %q", fb.recalled[0])
	}
	if !strings.Contains(section, "mounts from index.html") {
		t.Fatalf("the recalled memory never reached the prompt; got:\n%s", section)
	}
	if !strings.Contains(section, "#3") {
		t.Error("provenance (which issue taught this) was dropped")
	}

	// Retain — a needs_human outcome is the one most worth remembering.
	o.remember(ctx, c, implementVerdict{
		Outcome: "needs_human", Question: "which dashboard did you mean?",
	}, runner.Diff{})
	if len(fb.retained) != 1 {
		t.Fatalf("the loop learned nothing (retain calls=%d)", len(fb.retained))
	}
	got := fb.retained[0]
	for _, want := range []string{"agent:agent-a", "which dashboard did you mean?", "issue", "#1"} {
		if !strings.Contains(got, want) {
			t.Errorf("retained note is missing %q; got %q", want, got)
		}
	}
}

// A run that changed nothing must not pollute memory with a non-event.
func TestNothingIsRetainedForAnEmptyFix(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	fb := &fakeBrain{namespace: "agent:agent-a"}
	o.SetBrain(fb)
	seedAgent(t, db, "agent-a")
	c := &Claim{IssueID: seedIssue(t, db, 1, "ready"), Number: 1, Agent: "agent-a"}

	o.remember(context.Background(), c, implementVerdict{Outcome: "fixed"}, runner.Diff{HasChanges: false})
	if len(fb.retained) != 0 {
		t.Fatalf("stored a memory for a run that changed nothing: %v", fb.retained)
	}
}

// With no brain configured the loop must still work — memory is an
// optimisation, never a dependency.
func TestLoopRunsWithoutABrain(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db) // no SetBrain
	seedAgent(t, db, "agent-a")
	c := &Claim{IssueID: seedIssue(t, db, 1, "ready"), Number: 1, Agent: "agent-a"}

	if s := o.recallFor(context.Background(), c); s != "" {
		t.Fatalf("recall returned %q with no brain configured", s)
	}
	o.remember(context.Background(), c, implementVerdict{Outcome: "needs_human"}, runner.Diff{})
}

// One agent with nothing to do must not block the whole fleet.
//
// dispatch used to `return` on the first ErrNoWork, with the comment "queue is
// empty — no point asking the next agent". That is false once claims are
// area-scoped: ErrNoWork means THIS agent owns nothing claimable. Combined with
// `ORDER BY last_run_at NULLS FIRST LIMIT 4`, the four never-run agents were
// asked first, none owned the queued areas, and the fleet went idle with a full
// queue.
func TestOneIdleAgentDoesNotStarveTheFleet(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	// Sorted first by last_run_at NULLS FIRST, and owns nothing on the board.
	seedAgent(t, db, "never-ran")
	if _, err := db.Exec(
		`UPDATE builder_agents SET areas='{nothing-matches}', last_run_at=NULL
		  WHERE slug='never-ran'`); err != nil {
		t.Fatal(err)
	}
	// Owns the work, but has run before, so it sorts last.
	seedAgent(t, db, "owns-the-work")
	if _, err := db.Exec(
		`UPDATE builder_agents SET areas='{board}', last_run_at=now()
		  WHERE slug='owns-the-work'`); err != nil {
		t.Fatal(err)
	}

	id := seedIssue(t, db, 1, "ready")
	if _, err := db.Exec(`UPDATE builder_issues SET area='board' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}

	// The idle agent legitimately finds nothing...
	if _, err := o.ClaimFor(ctx, "never-ran", "sonnet", []string{"nothing-matches"}); err != ErrNoWork {
		t.Fatalf("the non-owning agent should find no work; got %v", err)
	}
	// ...and the owning agent must still be able to claim it.
	c, err := o.ClaimFor(ctx, "owns-the-work", "sonnet", []string{"board"})
	if err != nil {
		t.Fatalf("the owning agent could not claim its own area's work: %v", err)
	}
	if c.Number != 1 {
		t.Fatalf("claimed #%d, want #1", c.Number)
	}

	// And dispatch must reach it: every enabled agent is listed, not a prefix.
	var listed int
	if err := db.QueryRow(
		`SELECT count(*) FROM builder_agents
		  WHERE enabled = true AND role = 'builder' AND persona_md <> ''`).Scan(&listed); err != nil {
		t.Fatal(err)
	}
	if listed < 2 {
		t.Fatalf("only %d agents are dispatchable; the fixture is wrong", listed)
	}
}

// An explicit assignment must outrank area routing.
//
// The claim required BOTH the assignee to match AND the area to match, so an
// issue the operator assigned by hand could never be claimed when its area was
// empty or belonged to someone else. The board showed an owner, the agent sat
// idle, and the harness posted "Needs an owner" on an issue that already had
// one — which is what the operator kept reporting.
func TestExplicitAssignmentBeatsAreaRouting(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "specialist")
	if _, err := db.Exec(
		`UPDATE builder_agents SET areas='{sdk}' WHERE slug='specialist'`); err != nil {
		t.Fatal(err)
	}

	// Assigned to the specialist, but with an area it does NOT own.
	id := seedIssue(t, db, 1, "ready")
	if _, err := db.Exec(
		`UPDATE builder_issues SET assignee_agent_id='specialist', area='dashboard' WHERE id=$1`,
		id); err != nil {
		t.Fatal(err)
	}
	c, err := o.ClaimFor(ctx, "specialist", "sonnet", []string{"sdk"})
	if err != nil {
		t.Fatalf("an explicitly assigned issue was not claimable: %v", err)
	}
	if c.Number != 1 {
		t.Fatalf("claimed #%d, want #1", c.Number)
	}

	// And with NO area at all — the case the operator hit repeatedly.
	id2 := seedIssue(t, db, 2, "ready")
	if _, err := db.Exec(
		`UPDATE builder_issues SET assignee_agent_id='specialist', area='' WHERE id=$1`,
		id2); err != nil {
		t.Fatal(err)
	}
	if _, err := o.ClaimFor(ctx, "specialist", "sonnet", []string{"sdk"}); err != nil {
		t.Fatalf("an assigned issue with no area was not claimable: %v", err)
	}
}

// The assignment must still be exclusive: naming one agent must not open the
// issue to everyone else.
func TestAssignmentStillExcludesOtherAgents(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "mine")
	seedAgent(t, db, "theirs")
	id := seedIssue(t, db, 1, "ready")
	if _, err := db.Exec(
		`UPDATE builder_issues SET assignee_agent_id='mine', area='' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	// A generalist (no areas) must NOT be able to take somebody else's issue.
	if _, err := o.ClaimFor(ctx, "theirs", "sonnet", nil); err != ErrNoWork {
		t.Fatalf("another agent claimed an assigned issue; want ErrNoWork, got %v", err)
	}
	if _, err := o.ClaimFor(ctx, "mine", "sonnet", nil); err != nil {
		t.Fatalf("the assignee could not claim its own issue: %v", err)
	}
}

// An agent must say what it is doing BEFORE it does it.
//
// A run that works silently and only speaks at the end is indistinguishable
// from one that is stuck — and if it dies mid-run the issue moves with no
// record of who touched it. The operator reported exactly this: "moved to
// blocked without comments".
func TestAgentAnnouncesBeforeItStarts(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	ctx := context.Background()

	seedAgent(t, db, "agent-a")
	id := seedIssue(t, db, 1, "ready")
	c := &Claim{
		IssueID: id, Number: 1, Agent: "agent-a", Model: "sonnet",
		RunID: newUUID(), Attempt: 1, MaxBudgetUSD: 4,
	}

	o.announce(ctx, c, "builder/issue-1", []string{"sdk", "widget"}, "/tmp/repo")

	var body string
	var kind, agent string
	if err := db.QueryRow(
		`SELECT body_md, author_kind::text, coalesce(author_agent_id,'')
		   FROM builder_issue_comments WHERE issue_id = $1`, id).Scan(&body, &kind, &agent); err != nil {
		t.Fatalf("no opening comment was posted: %v", err)
	}
	if kind != "agent" || agent != "agent-a" {
		t.Fatalf("attributed to %s/%s, want agent/agent-a", kind, agent)
	}
	// It must say what it will do and under what limits — a bare "started" tells
	// the operator nothing they could act on.
	for _, want := range []string{"Starting work", "agent-a", "builder/issue-1", "sdk", "sonnet", "$4.00"} {
		if !strings.Contains(body, want) {
			t.Errorf("the opening comment does not mention %q:\n%s", want, body)
		}
	}

	var n int
	db.QueryRow(`SELECT comment_count FROM builder_issues WHERE id=$1`, id).Scan(&n)
	if n != 1 {
		t.Fatalf("comment_count = %d, want 1 — the board would show no comment", n)
	}
}

// A retry must say so, because it means an earlier run did not finish.
func TestAnnouncementFlagsARetry(t *testing.T) {
	db := open(t)
	defer db.Close()
	o := newOrch(db)
	seedAgent(t, db, "agent-a")
	id := seedIssue(t, db, 1, "ready")
	c := &Claim{IssueID: id, Number: 1, Agent: "agent-a", Model: "sonnet",
		RunID: newUUID(), Attempt: 3}

	o.announce(context.Background(), c, "b", nil, "/tmp/repo")
	var body string
	db.QueryRow(`SELECT body_md FROM builder_issue_comments WHERE issue_id=$1`, id).Scan(&body)
	if !strings.Contains(body, "attempt 3") {
		t.Fatalf("a retry is not flagged:\n%s", body)
	}
}
