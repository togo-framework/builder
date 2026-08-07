package orchestrator

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
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
	}
}

type Orchestrator struct {
	db  *sql.DB
	log *slog.Logger
	cfg Config
}

func New(db *sql.DB, log *slog.Logger, cfg Config) *Orchestrator {
	return &Orchestrator{db: db, log: log, cfg: cfg}
}

// Run polls until the context is cancelled.
//
// Opt-in only: nothing starts this unless BUILDER_RUNNER=1. A blueprint that
// began spending on model calls the moment someone ran `togo serve` would be
// indefensible.
func (o *Orchestrator) Run(ctx context.Context) {
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
			o.reapExpiredLeases(ctx)
		}
	}
}

func (o *Orchestrator) overBudget(ctx context.Context) (bool, float64, error) {
	var spent float64
	err := o.db.QueryRowContext(ctx,
		`SELECT coalesce(sum(cost_usd),0) FROM builder_spend
		  WHERE day = current_date AND scope = 'fleet'`).Scan(&spent)
	if err != nil {
		return false, 0, err
	}
	return spent >= o.cfg.DailyBudgetUSD, spent, nil
}

func (o *Orchestrator) recordSpend(ctx context.Context, kind string, usd float64, in, out int64) {
	if _, err := o.db.ExecContext(ctx,
		`INSERT INTO builder_spend (day, scope, scope_ref, cost_usd, input_tokens, output_tokens, run_count)
		 VALUES (current_date, 'fleet', '', $1, $2, $3, 1)
		 ON CONFLICT (day, scope, scope_ref) DO UPDATE SET
		   cost_usd = builder_spend.cost_usd + EXCLUDED.cost_usd,
		   input_tokens = builder_spend.input_tokens + EXCLUDED.input_tokens,
		   output_tokens = builder_spend.output_tokens + EXCLUDED.output_tokens,
		   run_count = builder_spend.run_count + 1`,
		usd, in, out); err != nil {
		o.log.Error("record spend", "kind", kind, "err", err)
	}
}

// reapExpiredLeases returns work whose runner died. Without this a crashed
// process holds an issue in `in_progress` forever.
func (o *Orchestrator) reapExpiredLeases(ctx context.Context) {
	res, err := o.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET status = 'ready', claim_token = NULL, claimed_by_run_id = NULL,
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

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])
}
