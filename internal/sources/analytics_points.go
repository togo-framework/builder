package sources

// Writing analytics numbers for charts.
//
// The GA4 and Search Console collectors already return prose through the normal
// Batch path, which is what recall needs. This is the second destination for the
// SAME fetch: the numbers, as rows a chart can select.
//
// # Why this is not a Batch
//
// A Batch becomes memories, and a memory is prose with an embedding. Pushing
// 90 days × 25 pages of page-view counts through that path would produce 2,250
// embeddings of text like "/blog/foo — 12 views", which is expensive, useless
// to recall, and drowns the summary document that IS useful. Numbers go in a
// numbers table.
//
// # Why the collector does not write them itself
//
// A Source is constructed from config alone and has no database handle — that
// is what keeps the connector layer testable without a Postgres. So the
// collector RETURNS its points and the store writes them, the same division the
// Batch already follows.

import (
	"context"
	"fmt"
	"time"
)

// Point is one measurement.
type Point struct {
	// Day is what this measures, not when it was fetched.
	Day time.Time
	// Metric is the provider's own name for it — 'clicks', 'activeUsers'.
	// Not normalised across providers on purpose: "impressions" means
	// something different in Search Console than in an ad platform, and a
	// shared vocabulary would imply they are comparable.
	Metric string
	// Dimension is what the number is broken down by — a page path, a search
	// query — or empty for the day's total.
	Dimension string
	Value     float64
}

// PointSource is a Source that also produces numbers.
//
// Optional, and checked with a type assertion at the call site: every existing
// connector keeps working untouched, and a new one opts in by adding a method.
type PointSource interface {
	// Points returns the measurements from the LAST Fetch.
	//
	// Reading state left by Fetch rather than fetching again: the alternative
	// is a second round trip to the provider for data the first one already
	// returned, doubling both the latency and the quota cost.
	Points() []Point
}

// savePoints upserts a batch of measurements for one connection.
//
// Upsert, not insert. Analytics data is REVISED: Search Console lags about two
// days and GA4 backfills, so the same day is written many times as it settles.
// Inserting would accumulate a row per run and silently double every chart.
func (s *Store) savePoints(ctx context.Context, sourceID, provider string, pts []Point) error {
	if len(pts) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO builder_analytics_points (source_id, provider, day, metric, dimension, value)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (source_id, day, metric, dimension)
		DO UPDATE SET value = EXCLUDED.value, updated_at = now()`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range pts {
		if _, err := stmt.ExecContext(ctx, sourceID, provider,
			p.Day.UTC().Format("2006-01-02"), p.Metric, p.Dimension, p.Value); err != nil {
			return fmt.Errorf("save analytics point %s/%s: %w", p.Metric, p.Dimension, err)
		}
	}
	return tx.Commit()
}
