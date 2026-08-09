package sources

import (
	"context"
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

// Cursor and SetCursor persist where a source got to, in the row the scheduler
// already owns. builder_sources.cursor exists for exactly this; an in-memory
// cursor would re-read every document on every restart.
//
// Scoped by kind and name rather than by id because that is the CursorStore
// contract, and the pair is unique per source.
func (s *Store) Cursor(ctx context.Context, kind, name string) (string, error) {
	var cur string
	err := s.db.QueryRowContext(ctx,
		`SELECT cursor FROM builder_sources WHERE kind = $1 AND name = $2`, kind, name).Scan(&cur)
	if err != nil {
		return "", fmt.Errorf("read cursor for %s/%s: %w", kind, name, err)
	}
	return cur, nil
}

func (s *Store) SetCursor(ctx context.Context, kind, name, cursor string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE builder_sources SET cursor = $3, updated_at = now()
		  WHERE kind = $1 AND name = $2`, kind, name, cursor)
	if err != nil {
		return fmt.Errorf("save cursor for %s/%s: %w", kind, name, err)
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
	return Refresh(ctx, src, s, s.brain, ns)
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
