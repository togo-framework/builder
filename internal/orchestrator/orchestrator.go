package orchestrator

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// Config bounds what the loop is allowed to do. Every field has a ceiling
// because an unattended fleet's failure mode is spending money, not crashing.
type Config struct {
	TriageModel    string
	TriageTimeout  time.Duration
	ImplementModel string
	ImplementTO    time.Duration
	// DailyBudgetUSD across the whole fleet. Hitting it aborts and reports; it
	// never degrades to a cheaper model, because escalating spend on one issue
	// means the issue is mis-specified, not underfunded.
	DailyBudgetUSD float64
	PollInterval   time.Duration
	// LeaseTTL bounds how long a claim survives without a heartbeat, so a
	// crashed runner's issue returns to the queue instead of being stuck.
	LeaseTTL time.Duration

	// OpenPR pushes the agent's branch and opens a pull request when a run
	// succeeds. OFF unless the operator sets BUILDER_OPEN_PR=1.
	//
	// Default-off because a push is the one irreversible thing the loop does:
	// it reaches a remote, can start CI, can notify reviewers, and on a public
	// repository survives deletion. Everything else the agent produces lives in
	// a local worktree the operator can discard. Turning this on is the
	// operator's decision to make once, deliberately — never a default, and
	// never inferred from gh happening to be logged in.
	OpenPR bool
	// PRBase is the target branch. Empty means ask the remote (DefaultBase).
	PRBase string
	// PRRemote defaults to origin.
	PRRemote string
}

func DefaultConfig() Config {
	return Config{
		TriageModel:    "haiku",
		TriageTimeout:  90 * time.Second,
		ImplementModel: "sonnet",
		ImplementTO:    15 * time.Minute,
		DailyBudgetUSD: 25,
		PollInterval:   15 * time.Second,
		LeaseTTL:       20 * time.Minute,
		OpenPR:         false, // see Config.OpenPR — the operator opts in
		PRRemote:       "origin",
	}
}

// Notifier is the seam to the realtime push. An interface rather than a
// concrete type so the orchestrator does not depend on the notify package —
// and so a deployment without notifications still runs the loop.
type Notifier interface {
	NotifyDecision(ctx context.Context, userID, issueID string, issueNumber int64, agent, question string)
}

// Memory is one recalled fact. Mirrors brain.Memory's shape without importing
// it, so the orchestrator keeps no hard dependency on the brain package.
type Memory struct {
	Content    string
	SourceKind string
	SourceRef  string
	Score      float64
}

// Brain is the seam to per-agent memory.
//
// Without this the agents had brains that were never read from and never
// written to: builder_memories stayed empty run after run, so every agent
// rediscovered the same codebase facts and repeated the same dead ends at full
// model price. Recall feeds the prompt; Retain records what the run learned.
type Brain interface {
	Recall(ctx context.Context, agentSlug, query string, limit int) ([]Memory, error)
	// Writable returns the namespace this agent owns. An agent may read several
	// namespaces but writes to exactly one — its own.
	Writable(ctx context.Context, agentSlug string) (string, error)
	Retain(ctx context.Context, ns, content, sourceKind, sourceRef string, importance float64) (string, error)
}

type Orchestrator struct {
	db  *sql.DB
	log *slog.Logger
	cfg Config
	// nil when notifications are disabled; every call site checks.
	notifier Notifier
	// nil when the brain plugin is disabled; every call site checks.
	brain Brain
}

func (o *Orchestrator) SetNotifier(n Notifier) { o.notifier = n }
func (o *Orchestrator) SetBrain(b Brain)       { o.brain = b }

func New(db *sql.DB, log *slog.Logger, cfg Config) *Orchestrator {
	return &Orchestrator{db: db, log: log, cfg: cfg}
}

// Run polls until the context is cancelled.
//
// Opt-in only: nothing starts this unless BUILDER_RUNNER=1. A blueprint that
// began spending on model calls the moment someone ran `togo serve` would be
// indefensible.
func (o *Orchestrator) Run(ctx context.Context) {
	// Before the first tick: close out anything this host left behind. Doing it
	// here rather than lazily means a deadlocked fleet recovers on restart
	// instead of staying wedged until someone notices.
	o.reconcileOwnRuns(ctx)

	o.log.Info("orchestrator started",
		"poll", o.cfg.PollInterval, "daily_budget_usd", o.cfg.DailyBudgetUSD)
	t := time.NewTicker(o.cfg.PollInterval)
	defer t.Stop()

	for {
		select {
		case <-ctx.Done():
			o.log.Info("orchestrator stopped")
			return
		case <-t.C:
			over, spent, err := o.overBudget(ctx)
			if err != nil {
				o.log.Error("budget check", "err", err)
				continue
			}
			if over {
				o.log.Warn("daily budget reached — parking the queue",
					"spent_usd", spent, "ceiling_usd", o.cfg.DailyBudgetUSD)
				continue
			}
			// Triage first: an untriaged issue cannot be claimed, so draining
			// that queue is what makes work available at all.
			for i := 0; i < 5; i++ {
				did, err := o.TriageOne(ctx)
				if err != nil {
					o.log.Error("triage", "err", err)
					break
				}
				if !did {
					break
				}
			}
			// Then routing: triage classifies, but the area it picks is a string
			// and nobody's declared areas may match it. Work in that state used
			// to sit in `ready` forever under a comment telling the operator to
			// route it by hand. The lead reads the whole roster and assigns.
			//
			// Bounded lower than triage — routing is the exception, and a burst
			// of them usually means the fleet has a real coverage gap that more
			// routing passes will not close.
			for i := 0; i < 3; i++ {
				did, err := o.RouteOne(ctx)
				if err != nil {
					o.log.Error("route", "err", err)
					break
				}
				if !did {
					break
				}
			}
			o.reapExpiredLeases(ctx)
			// Runs from other hosts that stopped heartbeating. Same tick as the
			// lease reaper so run rows and issue rows stay consistent.
			o.sweepStaleRuns(ctx)
			o.dispatch(ctx)
		}
	}
}

func (o *Orchestrator) overBudget(ctx context.Context) (bool, float64, error) {
	var spent float64
	err := o.db.QueryRowContext(ctx,
		// The 'fleet' scope is the roll-up dimension — every run lands here
		// exactly once, broken out by kind in scope_ref. Summing ALL scopes
		// would double-count once per-agent or per-issue rows are also written
		// (both are permitted by the schema's scope CHECK).
		`SELECT coalesce(sum(cost_usd),0) FROM builder_spend
		  WHERE day = current_date AND scope = 'fleet'`).Scan(&spent)
	if err != nil {
		return false, 0, err
	}
	return spent >= o.cfg.DailyBudgetUSD, spent, nil
}

func (o *Orchestrator) recordSpend(ctx context.Context, kind string, usd float64, in, out int64) {
	// scope is the DIMENSION ('fleet' | 'agent' | 'issue' — there is a CHECK);
	// the kind goes in scope_ref, which together with the primary key
	// (day, scope, scope_ref) gives one row per kind per day.
	//
	// kind was previously accepted and used only in the error log, so triage,
	// implement and generation all merged into a single untitled bucket. Putting
	// it in `scope` instead looked tidier and violated the CHECK — and because
	// this function only logs its error, that would have silently dropped EVERY
	// spend row, leaving the ceiling reading zero and the queue never parking.
	if kind == "" {
		kind = "other"
	}
	if _, err := o.db.ExecContext(ctx,
		`INSERT INTO builder_spend (day, scope, scope_ref, cost_usd, input_tokens, output_tokens, run_count)
		 VALUES (current_date, 'fleet', $4, $1, $2, $3, 1)
		 ON CONFLICT (day, scope, scope_ref) DO UPDATE SET
		   cost_usd = builder_spend.cost_usd + EXCLUDED.cost_usd,
		   input_tokens = builder_spend.input_tokens + EXCLUDED.input_tokens,
		   output_tokens = builder_spend.output_tokens + EXCLUDED.output_tokens,
		   run_count = builder_spend.run_count + 1`,
		usd, in, out, kind); err != nil {
		o.log.Error("record spend", "kind", kind, "err", err)
	}
}

// reapExpiredLeases returns work whose runner died. Without this a crashed
// process holds an issue in `in_progress` forever.
//
// assignee_agent_id is cleared too. A lease expiring means that agent could not
// finish — leaving the issue pinned to it means a crashed or since-disabled
// agent holds the work hostage until attempt_count exhausts. Routing runs again
// from scratch, which is the whole point of having a fleet.
func (o *Orchestrator) reapExpiredLeases(ctx context.Context) {
	res, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET status = 'ready', claim_token = NULL, claimed_by_run_id = NULL,
		        assignee_agent_id = NULL,
		        lease_expires_at = NULL, status_entered_at = now(), updated_at = now()
		  WHERE status = 'in_progress'
		    AND lease_expires_at IS NOT NULL
		    AND lease_expires_at < now()`)
	if err != nil {
		o.log.Error("reap leases", "err", err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		o.log.Warn("reclaimed expired leases", "count", n)
	}
}

func osHostname() (string, error) { return os.Hostname() }
func osGetpid() int               { return os.Getpid() }

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])
}
