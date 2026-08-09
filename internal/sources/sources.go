package sources

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Retainer is the brain, narrowed to the one call this package makes.
// *brain.Store satisfies it.
type Retainer interface {
	Retain(ctx context.Context, ns, content, sourceKind, sourceRef string, importance float64) (string, error)
}

// Store runs sources.
type Store struct {
	db    *sql.DB
	log   *slog.Logger
	brain Retainer
	vault Revealer

	// Refresh takes a lease so two app instances sharing one database do not
	// both run the same source. Sized well above the longest a refresh can
	// take (MaxTimeoutMS + connect) so a slow query never loses its own lease.
	leaseFor time.Duration
}

func New(db *sql.DB, log *slog.Logger, b Retainer, v Revealer) *Store {
	return &Store{db: db, log: log, brain: b, vault: v, leaseFor: 5 * time.Minute}
}

// MemoryRef is the source_ref every refresh writes under.
//
// It is stable per source, and that is the whole of requirement 4. The brain's
// unique index on (namespace, source_ref) turns Retain into an upsert, so the
// tenth refresh UPDATES the row the ninth wrote instead of adding to it. A
// source that appended would bury its own current answer under 200 stale copies
// within a fortnight, and recall would surface whichever one embedded best.
func MemoryRef(kind, name string) string {
	return "source:" + kind + ":" + name
}

type sourceRow struct {
	ID        string
	Kind      string
	Name      string
	Config    []byte
	Namespace string
	Schedule  string
}

// Run is the scheduler loop. It returns when ctx is cancelled.
func (s *Store) Run(ctx context.Context) {
	// The tick is the resolution of the schedule, not its period: a source due
	// hourly is picked up by whichever tick first sees next_run_at in the past.
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			s.RefreshDue(ctx)
		}
	}
}

// RefreshDue runs every enabled source whose next_run_at has passed.
func (s *Store) RefreshDue(ctx context.Context) {
	for {
		row, token, ok := s.claimNext(ctx)
		if !ok {
			return
		}
		if err := s.refresh(ctx, row, "schedule"); err != nil {
			// Already recorded against the source; the log line is for an
			// operator watching, and is scrubbed like everything else.
			s.log.Warn("source refresh failed", "source", row.Name, "kind", row.Kind, "err", Scrub(err.Error()))
		}
		s.release(ctx, row, token)
		if ctx.Err() != nil {
			return
		}
	}
}

// RefreshNow runs one source by name, ignoring its schedule but not its lease.
// `enabled` is also ignored: this is the "does my query work?" path, and being
// unable to test a source before turning it on is how a broken one gets turned
// on anyway.
func (s *Store) RefreshNow(ctx context.Context, kind, name string) error {
	var row sourceRow
	err := s.db.QueryRowContext(ctx,
		`SELECT id, kind, name, config, namespace, schedule
		   FROM builder_sources WHERE kind = $1 AND name = $2`, kind, name).
		Scan(&row.ID, &row.Kind, &row.Name, &row.Config, &row.Namespace, &row.Schedule)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("no source %s/%s", kind, name)
	}
	if err != nil {
		return err
	}
	return s.refresh(ctx, row, "manual")
}

// claimNext atomically takes the next due source.
//
// One UPDATE ... WHERE with a freshly minted token, exactly as the orchestrator
// claims an issue: selecting a due row and then marking it is two statements
// and therefore a race that hands the same source to both instances.
func (s *Store) claimNext(ctx context.Context) (sourceRow, string, bool) {
	var row sourceRow
	token := newToken()

	err := s.db.QueryRowContext(ctx,
		`UPDATE builder_sources SET
		     claim_token = $1,
		     lease_expires_at = now() + $2::interval,
		     last_status = 'running'
		  WHERE id = (
		     SELECT id FROM builder_sources
		      WHERE enabled
		        AND next_run_at <= now()
		        -- A crashed instance leaves a lease behind; it expires rather
		        -- than stranding the source forever.
		        AND (lease_expires_at IS NULL OR lease_expires_at < now())
		      ORDER BY next_run_at
		      FOR UPDATE SKIP LOCKED
		      LIMIT 1)
		  RETURNING id, kind, name, config, namespace, schedule`,
		token, fmt.Sprintf("%d seconds", int(s.leaseFor.Seconds()))).
		Scan(&row.ID, &row.Kind, &row.Name, &row.Config, &row.Namespace, &row.Schedule)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			s.log.Error("claim source", "err", Scrub(err.Error()))
		}
		return row, "", false
	}
	return row, token, true
}

func (s *Store) release(ctx context.Context, row sourceRow, token string) {
	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_sources SET claim_token = NULL, lease_expires_at = NULL
		  WHERE id = $1 AND claim_token = $2`, row.ID, token)
}

// refresh runs one source and records what happened, whatever happened.
func (s *Store) refresh(ctx context.Context, row sourceRow, trigger string) error {
	var runID string
	_ = s.db.QueryRowContext(ctx,
		`INSERT INTO builder_source_runs (source_id, trigger) VALUES ($1,$2) RETURNING id`,
		row.ID, trigger).Scan(&runID)

	res, err := s.execute(ctx, row)
	if err != nil {
		s.finishRun(ctx, runID, "error", 0, false, ScrubErr(err))
		s.markFailed(ctx, row, err)
		return err
	}

	ns := strings.TrimSpace(row.Namespace)
	if ns == "" {
		err := errors.New("the source has no target namespace")
		s.finishRun(ctx, runID, "error", res.RowsRead, res.Truncated, err.Error())
		s.markFailed(ctx, row, err)
		return err
	}

	// The upsert that makes the result replace rather than accumulate.
	if _, err := s.brain.Retain(ctx, ns, res.Text, "source", MemoryRef(row.Kind, row.Name), 0.6); err != nil {
		s.finishRun(ctx, runID, "error", res.RowsRead, res.Truncated, ScrubErr(err))
		s.markFailed(ctx, row, err)
		return fmt.Errorf("retain: %w", err)
	}

	s.finishRun(ctx, runID, "ok", res.RowsRead, res.Truncated, "")
	s.markOK(ctx, row, res)
	return nil
}

// execute dispatches on kind. Adding a source kind means adding a case here and
// a config type beside SQLConfig — the scheduler, the lease and the retain are
// already shared.
func (s *Store) execute(ctx context.Context, row sourceRow) (Result, error) {
	switch row.Kind {
	case "sql":
		cfg, err := parseSQLConfig(row.Config)
		if err != nil {
			return Result{}, err
		}
		return runSQL(ctx, cfg, row.Name, s.vault)
	default:
		return Result{}, fmt.Errorf("no runner for source kind %q", row.Kind)
	}
}

func (s *Store) finishRun(ctx context.Context, runID, status string, rows int, truncated bool, errText string) {
	if runID == "" {
		return
	}
	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_source_runs
		    SET status=$2, rows_read=$3, truncated=$4, error=$5, ended_at=now()
		  WHERE id=$1`, runID, status, rows, truncated, errText)
}

func (s *Store) markOK(ctx context.Context, row sourceRow, res Result) {
	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_sources SET
		    last_run_at = now(), last_status = 'ok', last_error = '',
		    consecutive_failures = 0, total_runs = total_runs + 1,
		    next_run_at = now() + $2::interval, updated_at = now()
		  WHERE id = $1`, row.ID, intervalFor(row.Schedule, 0))
	s.log.Info("source refreshed", "source", row.Name, "kind", row.Kind,
		"rows", res.RowsRead, "truncated", res.Truncated)
}

func (s *Store) markFailed(ctx context.Context, row sourceRow, cause error) {
	// Back off on repeated failure. A source pointed at a database that is down
	// would otherwise retry every tick and fill the audit log with denied
	// reveals, which is indistinguishable from someone probing the vault.
	var failures int
	_ = s.db.QueryRowContext(ctx,
		`UPDATE builder_sources SET
		    last_run_at = now(), last_status = 'error', last_error = $2,
		    consecutive_failures = consecutive_failures + 1,
		    total_runs = total_runs + 1, updated_at = now()
		  WHERE id = $1
		  RETURNING consecutive_failures`, row.ID, ScrubErr(cause)).Scan(&failures)

	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_sources SET next_run_at = now() + $2::interval WHERE id = $1`,
		row.ID, intervalFor(row.Schedule, failures))
}

// intervalFor is the schedule, with exponential backoff after failures.
func intervalFor(schedule string, failures int) string {
	d := parseSchedule(schedule)
	for i := 0; i < failures && i < 6; i++ {
		d *= 2
	}
	if d > 24*time.Hour {
		d = 24 * time.Hour
	}
	return fmt.Sprintf("%d seconds", int(d.Seconds()))
}

// parseSchedule accepts '@hourly', '@daily', or a Go duration.
//
// Not cron. A cron parser is a dependency, and the schedules a source actually
// wants are "every N" rather than "at 03:15 on weekdays" — the answer is a
// current number, not a report that has to land before a meeting.
func parseSchedule(s string) time.Duration {
	const min = time.Minute
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "@hourly":
		return time.Hour
	case "@daily", "@midnight":
		return 24 * time.Hour
	case "@weekly":
		return 7 * 24 * time.Hour
	case "@every15m", "@quarter-hourly":
		return 15 * time.Minute
	}
	if d, err := time.ParseDuration(strings.TrimSpace(s)); err == nil && d >= min {
		return d
	}
	// An unparseable schedule falls back to hourly rather than to zero, which
	// would be a source that runs every tick forever.
	return time.Hour
}

func newToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("t%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}
