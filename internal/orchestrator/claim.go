package orchestrator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Claim is a won lease on an issue.
type Claim struct {
	IssueID  string
	Number   int64
	Title    string
	Body     string
	Area     string
	Type     string
	Priority string
	Attempt  int
	RunID    string
	Token    string // the fencing token
	Agent    string
	Model    string
	// MaxBudgetUSD and MaxTurns come from the agent's settings and are handed to
	// the in-session guards, so the settings UI is the single source of truth.
	MaxBudgetUSD float64
	MaxTurns     int
}

// ErrNoWork means the queue is empty or everything is taken.
var ErrNoWork = errors.New("no claimable work")

// claimSQL is the entire concurrency control. No queue, no broker, no advisory
// lock — one statement.
//
// Two layers, deliberately:
//   - the inner SELECT ... FOR UPDATE SKIP LOCKED removes the wasted round trip
//     when several runners poll at once;
//   - the outer `AND i.status = 'ready'` is the compare-and-swap, and it is the
//     actual correctness guarantee. RowsAffected() != 1 means we lost the race.
//
// Three exclusions are enforced here rather than by convention, so no code path
// can forget them: human-only issues, attempt-exhausted issues, and any issue
// with a pending human decision. The last is what makes the human-in-the-loop
// gate structural — a blocked issue is not merely skipped, it is unclaimable.
const claimSQL = `
UPDATE builder_issues i
   SET status            = 'in_progress',
       claim_token       = $1,
       lease_expires_at  = now() + ($2 * interval '1 second'),
       attempt_count     = i.attempt_count + 1,
       assignee_agent_id = COALESCE(i.assignee_agent_id, $3),
       status_entered_at = now(),
       updated_at        = now()
 WHERE i.id = (
   SELECT c.id FROM builder_issues c
    WHERE c.status = 'ready'
      AND c.human_only = false
      AND c.attempt_count < c.max_attempts
      AND c.blocked_on_decision_id IS NULL
      -- Routing, in priority order.
      --
      -- An EXPLICIT ASSIGNMENT WINS. The operator naming an agent is a stronger
      -- instruction than any area rule, so the area is not consulted at all in
      -- that case. Requiring both meant an issue you assigned by hand could
      -- never be claimed if its area was empty or did not match — the board
      -- showed an owner, the agent showed idle, and "Needs an owner" was posted
      -- on an issue that already had one.
      --
      -- Otherwise: an agent with no declared areas is a generalist and takes
      -- anything; an agent WITH areas takes only its own; and UNASSIGNED work
      -- with no area is deliberately left alone, because it used to be grabbed
      -- by whichever agent polled first — twice that was the feedback-SDK agent
      -- picking up host-dashboard work and spending a full run to refuse it.
      AND (
        c.assignee_agent_id = $3
        OR (
          c.assignee_agent_id IS NULL
          AND ($4::text[] = '{}' OR (c.area <> '' AND c.area = ANY($4::text[])))
        )
      )
      AND NOT EXISTS (SELECT 1 FROM builder_decisions d
                       WHERE d.issue_id = c.id AND d.state = 'pending')
    ORDER BY CASE c.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                             WHEN 'normal' THEN 2 ELSE 3 END,
             c.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
 )
   AND i.status = 'ready'
RETURNING i.id, i.number, i.title, i.body_md, i.area, i.type::text,
          i.priority::text, i.attempt_count`

// ClaimFor attempts to claim work for one agent.
func (o *Orchestrator) ClaimFor(ctx context.Context, agentSlug, model string, areas []string) (*Claim, error) {
	runID := newUUID()
	token := newUUID()

	c := &Claim{RunID: runID, Token: token, Agent: agentSlug, Model: model}
	// Best-effort: a missing row must not block the claim, it just falls back to
	// the harness defaults.
	_ = o.db.QueryRowContext(ctx,
		`SELECT max_budget_usd, max_turns FROM builder_agents WHERE slug = $1`,
		agentSlug).Scan(&c.MaxBudgetUSD, &c.MaxTurns)
	err := o.db.QueryRowContext(ctx, claimSQL,
		token, int(o.cfg.LeaseTTL.Seconds()), agentSlug, pgArray(areas),
	).Scan(&c.IssueID, &c.Number, &c.Title, &c.Body, &c.Area, &c.Type, &c.Priority, &c.Attempt)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoWork
	}
	if err != nil {
		return nil, fmt.Errorf("claim: %w", err)
	}

	// The run row exists before the process does, so a crash between claim and
	// spawn still leaves something to reconcile.
	if _, err := o.db.ExecContext(ctx,
		`INSERT INTO builder_runs (id, issue_id, agent_slug, kind, status, attempt, claim_token, claimed_by, started_at)
		 VALUES ($1,$2,$3,'implement','running',$4,$5,$6,now())`,
		runID, c.IssueID, agentSlug, c.Attempt, token, hostTag()); err != nil {
		// Release rather than strand the issue in in_progress with no run.
		o.release(ctx, c, "could not record the run")
		return nil, fmt.Errorf("record run: %w", err)
	}

	// Now the run exists, point the issue at it. Guarded by the fencing token so
	// a runner that lost its lease between the two statements cannot write.
	if _, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues SET claimed_by_run_id = $1
		  WHERE id = $2 AND claim_token = $3`,
		runID, c.IssueID, token); err != nil {
		o.release(ctx, c, "could not link the run to the issue")
		return nil, fmt.Errorf("link run: %w", err)
	}

	_, _ = o.db.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, actor_agent_id, run_id, detail)
		 VALUES ($1,'claimed','agent',$2,$3,$4::jsonb)`,
		c.IssueID, agentSlug, runID, fmt.Sprintf(`{"attempt":%d}`, c.Attempt))

	o.log.Info("claimed", "issue", c.Number, "agent", agentSlug, "attempt", c.Attempt, "run", runID)
	return c, nil
}

// Heartbeat extends the lease. Fenced: a zombie runner whose lease was reaped
// and re-claimed by someone else updates zero rows and learns it has lost.
func (o *Orchestrator) Heartbeat(ctx context.Context, c *Claim) error {
	res, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET lease_expires_at = now() + ($1 * interval '1 second'), updated_at = now()
		  WHERE id = $2 AND claim_token = $3 AND status = 'in_progress'`,
		int(o.cfg.LeaseTTL.Seconds()), c.IssueID, c.Token)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("lease lost")
	}
	_, _ = o.db.ExecContext(ctx,
		`UPDATE builder_runs SET heartbeat_at = now() WHERE id = $1`, c.RunID)
	return nil
}

// release returns an issue to the queue. Every write carries the fencing token,
// so a run that already lost its lease cannot clobber the new holder's state.
func (o *Orchestrator) release(ctx context.Context, c *Claim, why string) {
	_, _ = o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET status = 'ready', claim_token = NULL, claimed_by_run_id = NULL,
		        lease_expires_at = NULL, status_entered_at = now(), updated_at = now()
		  WHERE id = $1 AND claim_token = $2`, c.IssueID, c.Token)

	// CLOSE THE RUN. This was missing, and it throttled the fleet.
	//
	// release() returned the issue to the queue and left builder_runs saying
	// `running` forever. dispatch() counts in-flight work as rows with status
	// 'running' and a heartbeat inside thirty minutes, so every released run
	// occupied one of the three concurrency slots for half an hour after it had
	// already finished. Three failures in quick succession — which is exactly
	// what a batch of hard issues produces — and the whole fleet stops claiming
	// anything at all.
	//
	// dispatch.go already carries a comment about this class of bug ("counting
	// frozen rows meant three crashed runs permanently deadlocked the fleet");
	// that fix bounded it by staleness, which hid this leak rather than closing
	// it. The run row is now closed where the issue is.
	// terminal_reason 'error', not 'released'. The column is CHECK-constrained to
	// ''|completed|budget_exhausted|max_turns|blocked|lease_lost|error, and this
	// statement discards its error — so an invalid value would fail silently and
	// leave exactly the leak it is here to close. Found by running the same
	// UPDATE by hand against the live table before trusting it.
	if _, err := o.db.ExecContext(ctx,
		// tmux_session is cleared on every terminal write, here and in finish().
		// The column means "the session an operator can attach to RIGHT NOW", so
		// a value that outlived its session would send them to a name tmux has
		// already reaped — a worse answer than none.
		`UPDATE builder_runs
		    SET status = 'failed', terminal_reason = 'error', error = $2,
		        tmux_session = '', ended_at = now()
		  WHERE id = $1 AND status = 'running'`,
		c.RunID, truncateText("released: "+why, 2000)); err != nil {
		// Logged, not discarded. A run row that stays open occupies a
		// concurrency slot, and silence is how that went unnoticed for a day.
		o.log.Error("could not close the run row on release",
			"issue", c.Number, "run", c.RunID, "err", err)
	}

	_, _ = o.db.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, actor_agent_id, run_id, detail)
		 VALUES ($1,'released','agent',$2,$3,$4::jsonb)`,
		c.IssueID, c.Agent, c.RunID, fmt.Sprintf(`{"why":%q}`, why))
	o.log.Warn("released", "issue", c.Number, "why", why)
}

// finish moves the issue on and closes the run out.
func (o *Orchestrator) finish(ctx context.Context, c *Claim, status, terminal string, d finishDetail) {
	res, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET status = $1::builder_issue_status,
		        claim_token = NULL, lease_expires_at = NULL,
		        branch = $2, head_sha = $3, last_verdict = $4::jsonb,
		        status_entered_at = now(), updated_at = now()
		  WHERE id = $5 AND claim_token = $6`,
		status, d.Branch, d.HeadSHA, d.VerdictJSON, c.IssueID, c.Token)
	if err != nil {
		o.log.Error("finish issue", "issue", c.Number, "err", err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Fencing did its job: this run no longer owns the issue.
		o.log.Warn("finish ignored — lease was lost", "issue", c.Number, "run", c.RunID)
		return
	}

	_, _ = o.db.ExecContext(ctx,
		`UPDATE builder_runs
		    SET status = $1::builder_run_status, terminal_reason = $2, ended_at = now(),
		        branch = $3, head_sha = $4, files_changed = $5,
		        lines_added = $6, lines_removed = $7, cost_usd = $8,
		        num_turns = $9, verdict = $10::jsonb, error = $11,
		        pushed = $13, pr_url = $14, tmux_session = ''
		  WHERE id = $12 AND status = 'running'`,
		d.RunStatus, terminal, d.Branch, d.HeadSHA, d.FilesChanged,
		d.Added, d.Removed, d.CostUSD, d.Turns, d.VerdictJSON, d.Err, c.RunID,
		d.Pushed, d.PRURL)

	// The status guard above matters: a run the reconciler already expired must
	// not be silently resurrected to a terminal state by its own goroutine
	// finishing late.
	o.log.Info("run finished", "issue", c.Number, "status", status,
		"terminal", terminal, "files", d.FilesChanged, "cost", d.CostUSD)
}

type finishDetail struct {
	RunStatus    string
	Branch       string
	HeadSHA      string
	VerdictJSON  string
	FilesChanged int
	Added        int
	Removed      int
	CostUSD      float64
	Turns        int
	Err          string
	// Publish outcome. Pushed can be true with an empty PRURL — the branch
	// reached the remote but the PR could not be opened.
	PRURL  string
	Pushed bool
}

func hostTag() string {
	h, _ := osHostname()
	return fmt.Sprintf("%s:%d:%s", h, osGetpid(), newUUID()[:8])
}

func pgArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	out := "{"
	for i, x := range xs {
		if i > 0 {
			out += ","
		}
		out += `"` + x + `"`
	}
	return out + "}"
}
