package sources

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// Wiring the plugin registry to the scheduler.
//
// Two designs landed in this package from two issues, and they are halves of
// one thing rather than rivals. The scheduler (sources.go) owns the row, the
// fenced lease, the backoff and the run ledger. The registry (registry.go)
// owns what a source IS: a Source interface, a factory per kind, a cursor, and
// a Refresh that retains each document it finds.
//
// Without this file the scheduler dispatches on a hardcoded switch and a
// registered kind is unreachable — the GitHub source could be constructed by
// nothing and run by nobody.

// sourceSecrets lets a plugin source read the vault without handing it the
// whole vault API.
//
// RevealFor takes a reader identity because every reveal is audited; a plugin
// refresh has no agent behind it, so the source itself is the reader. Passing
// an empty slug would file every source's secret reads under nobody, which is
// exactly the record you want when a credential turns up somewhere it should
// not have.
type sourceSecrets struct {
	v     Revealer
	kind  string
	name  string
	runID string
}

func (s sourceSecrets) Reveal(ctx context.Context, name string) (string, error) {
	return s.v.RevealFor(ctx, name, "source:"+s.kind+":"+s.name, s.runID)
}

// rowCursor persists where a source got to, in the row the scheduler owns.
//
// Bound to the row ID, and it has to be. CursorStore is keyed by (kind, name)
// as the source REPORTS them, and a connector names itself after what it
// connects to, not after the row that configured it: a GitHub source in a row
// called "togo-docs" reports its name as "golang/example". Looking the row up
// by that pair found nothing, and every refresh failed on "sql: no rows in
// result set" before it fetched a byte.
//
// Binding to the id also makes two rows pointing at the same repository keep
// separate cursors, which is what an operator who created two of them meant.
type rowCursor struct {
	db *sql.DB
	id string
}

func (c rowCursor) Cursor(ctx context.Context, _, _ string) (string, error) {
	var cur string
	if err := c.db.QueryRowContext(ctx,
		`SELECT cursor FROM builder_sources WHERE id = $1`, c.id).Scan(&cur); err != nil {
		return "", fmt.Errorf("read cursor: %w", err)
	}
	return cur, nil
}

func (c rowCursor) SetCursor(ctx context.Context, _, _, cursor string) error {
	if _, err := c.db.ExecContext(ctx,
		`UPDATE builder_sources SET cursor = $2, updated_at = now() WHERE id = $1`,
		c.id, cursor); err != nil {
		return fmt.Errorf("save cursor: %w", err)
	}
	return nil
}

// runPlugin drives a registered source through Refresh.
//
// Refresh retains per document, so unlike the whole-result path there is no
// single Retain afterwards: a repository's README and its CONTRIBUTING are two
// answers, not two versions of one.
func (s *Store) runPlugin(ctx context.Context, row sourceRow, ns, runID string) (Report, error) {
	src, err := Open(row.Kind, row.Config, sourceSecrets{
		v: s.vault, kind: row.Kind, name: row.Name, runID: runID,
	})
	if err != nil {
		return Report{}, err
	}
	rep, err := Refresh(ctx, src, rowCursor{db: s.db, id: row.ID}, s.brain, ns)
	if err != nil {
		return rep, err
	}

	// The second destination, for connectors that produce numbers.
	//
	// After Refresh, not inside it: Refresh is the pure connector→brain path and
	// takes no database handle, which is what lets it be tested without a
	// Postgres. A type assertion rather than a new interface method keeps every
	// existing connector untouched — a kind that has no numbers simply is not a
	// PointSource.
	//
	// A failure here is LOGGED, not returned. The memories are already written
	// and the fetch already cost its quota; failing the whole run because a
	// chart table did not accept a row would throw away the part that worked and
	// re-spend the quota on the next attempt.
	if ps, ok := src.(PointSource); ok {
		if pts := ps.Points(); len(pts) > 0 {
			if err := s.savePoints(ctx, row.ID, row.Kind, pts); err != nil {
				s.log.Warn("analytics points not saved; the summary was",
					"kind", row.Kind, "name", row.Name, "points", len(pts), "err", ScrubErr(err))
			} else {
				s.log.Info("analytics points saved",
					"kind", row.Kind, "name", row.Name, "points", len(pts))
			}
		}
	}
	return rep, nil
}

// isPlugin reports whether a kind is served by the registry rather than by the
// whole-result switch in execute().
func isPlugin(kind string) bool {
	for _, k := range Kinds() {
		if k == strings.TrimSpace(kind) {
			return true
		}
	}
	return false
}
