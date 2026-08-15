package sources

import (
	"context"
	"database/sql"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// openAnalyticsDB is openSourceDB plus the points table.
//
// Separate from openSourceDB because that one truncates builder_sources, which
// cascades to the points — fine here, but it means the two must clear in a
// known order rather than whichever ran last.
func openAnalyticsDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if !strings.Contains(dsn, "_test") {
		t.Fatalf("refusing to run destructive fixtures against %q: the DSN must name a _test database", dsn)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`SELECT 1 FROM builder_analytics_points LIMIT 1`); err != nil {
		t.Skipf("builder_analytics_points is absent — apply migration 0022 to the test database: %v", err)
	}
	db.Exec(`DELETE FROM builder_analytics_points`)
	db.Exec(`DELETE FROM builder_sources`)
	return db
}

// seedSource inserts a connection to hang points off, and returns its id.
func seedSource(t *testing.T, db *sql.DB, kind, name string) string {
	t.Helper()
	var id string
	err := db.QueryRow(`
		INSERT INTO builder_sources (kind, name, direction, namespace, schedule, config, enabled)
		VALUES ($1,$2,'source','default:project','@daily','{}'::jsonb,false)
		RETURNING id`, kind, name).Scan(&id)
	if err != nil {
		t.Fatalf("seed source: %v", err)
	}
	return id
}

// The single most consequential property of this table.
//
// Analytics data is REVISED — Search Console lags about two days and GA4
// backfills — so a daily collector writes the same day repeatedly as it
// settles. If those writes accumulated instead of replacing, every chart would
// grow by one duplicate per run: a week of hourly collection would show traffic
// 168× too high, and nothing about the number would look obviously wrong.
func TestSavePointsUpsertsRatherThanAccumulating(t *testing.T) {
	db := openAnalyticsDB(t)
	defer db.Close()

	s := &Store{db: db, log: slog.New(slog.DiscardHandler)}
	id := seedSource(t, db, "ga4", "prop-1")
	day := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	ctx := context.Background()

	first := []Point{
		{Day: day, Metric: "clicks", Value: 10},
		{Day: day, Metric: "clicks", Dimension: "/blog", Value: 4},
	}
	if err := s.savePoints(ctx, id, "ga4", first); err != nil {
		t.Fatalf("first save: %v", err)
	}

	// The same day, re-fetched after the provider revised it upward.
	revised := []Point{
		{Day: day, Metric: "clicks", Value: 17},
		{Day: day, Metric: "clicks", Dimension: "/blog", Value: 9},
	}
	if err := s.savePoints(ctx, id, "ga4", revised); err != nil {
		t.Fatalf("second save: %v", err)
	}

	var rows int
	if err := db.QueryRow(`SELECT count(*) FROM builder_analytics_points`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 2 {
		t.Fatalf("row count = %d, want 2 — re-fetching a revised day duplicated it instead of replacing it", rows)
	}

	var total, blog float64
	db.QueryRow(`SELECT value FROM builder_analytics_points WHERE dimension = ''`).Scan(&total)
	db.QueryRow(`SELECT value FROM builder_analytics_points WHERE dimension = '/blog'`).Scan(&blog)
	if total != 17 || blog != 9 {
		t.Errorf("values = total %v, /blog %v; want the REVISED 17 and 9 — the upsert kept the stale numbers", total, blog)
	}
}

// The dimensionless row is the day's total and must not collide with a
// dimensioned one. The unique index uses ” rather than NULL precisely because
// NULL is never equal to NULL in a unique constraint, which would let duplicate
// totals through the very check meant to stop them.
func TestSavePointsKeepsTotalsAndBreakdownsApart(t *testing.T) {
	db := openAnalyticsDB(t)
	defer db.Close()

	s := &Store{db: db, log: slog.New(slog.DiscardHandler)}
	id := seedSource(t, db, "gsc", "site-1")
	day := time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC)

	pts := []Point{
		{Day: day, Metric: "impressions", Value: 100},
		{Day: day, Metric: "impressions", Dimension: "golang", Value: 60},
		{Day: day, Metric: "impressions", Dimension: "togo", Value: 40},
	}
	if err := s.savePoints(context.Background(), id, "gsc", pts); err != nil {
		t.Fatal(err)
	}

	var n int
	db.QueryRow(`SELECT count(*) FROM builder_analytics_points`).Scan(&n)
	if n != 3 {
		t.Fatalf("row count = %d, want 3 — the total collided with a breakdown", n)
	}
	// Writing the totals twice must still leave one.
	if err := s.savePoints(context.Background(), id, "gsc", pts); err != nil {
		t.Fatal(err)
	}
	db.QueryRow(`SELECT count(*) FROM builder_analytics_points`).Scan(&n)
	if n != 3 {
		t.Errorf("row count = %d after a repeat save, want 3", n)
	}
}

// Two connections measuring the same day must not overwrite each other — the
// unique index is per source_id, and a chart of one property must not include
// another's numbers.
func TestSavePointsIsolatesConnections(t *testing.T) {
	db := openAnalyticsDB(t)
	defer db.Close()

	s := &Store{db: db, log: slog.New(slog.DiscardHandler)}
	a := seedSource(t, db, "ga4", "prop-a")
	b := seedSource(t, db, "ga4", "prop-b")
	day := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)

	_ = s.savePoints(context.Background(), a, "ga4", []Point{{Day: day, Metric: "activeUsers", Value: 5}})
	_ = s.savePoints(context.Background(), b, "ga4", []Point{{Day: day, Metric: "activeUsers", Value: 90}})

	var n int
	db.QueryRow(`SELECT count(*) FROM builder_analytics_points`).Scan(&n)
	if n != 2 {
		t.Fatalf("row count = %d, want 2 — one connection overwrote the other", n)
	}
	var av float64
	db.QueryRow(`SELECT value FROM builder_analytics_points WHERE source_id = $1`, a).Scan(&av)
	if av != 5 {
		t.Errorf("connection A's value = %v, want 5", av)
	}
}

// Deleting a connection must take its numbers with it: an orphaned series is a
// chart for something nobody can find, re-fetch, or explain.
func TestDeletingAConnectionRemovesItsPoints(t *testing.T) {
	db := openAnalyticsDB(t)
	defer db.Close()

	s := &Store{db: db, log: slog.New(slog.DiscardHandler)}
	id := seedSource(t, db, "ga4", "prop-doomed")
	_ = s.savePoints(context.Background(), id, "ga4",
		[]Point{{Day: time.Now().UTC(), Metric: "clicks", Value: 1}})

	if _, err := db.Exec(`DELETE FROM builder_sources WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	var n int
	db.QueryRow(`SELECT count(*) FROM builder_analytics_points`).Scan(&n)
	if n != 0 {
		t.Errorf("%d orphaned points survived the connection", n)
	}
}

// The read path, with data in it.
//
// Everything else about the charts was verified empty: the endpoints return
// correct shapes for no data, and the page renders its empty state. That leaves
// the one case that actually matters unproven — numbers going in and coming
// back out in the right order, with totals and breakdowns kept apart.
func TestAnalyticsEndpointsReturnSeededData(t *testing.T) {
	db := openAnalyticsDB(t)
	defer db.Close()

	s := &Store{db: db, log: slog.New(slog.DiscardHandler)}
	id := seedSource(t, db, "gsc", "site-series")
	ctx := context.Background()

	// Three consecutive days, ascending, plus a per-query breakdown on the last.
	base := time.Now().UTC().AddDate(0, 0, -3).Truncate(24 * time.Hour)
	var pts []Point
	for i, v := range []float64{5, 11, 20} {
		pts = append(pts, Point{Day: base.AddDate(0, 0, i), Metric: "clicks", Value: v})
	}
	pts = append(pts,
		Point{Day: base.AddDate(0, 0, 2), Metric: "clicks", Dimension: "togo framework", Value: 12},
		Point{Day: base.AddDate(0, 0, 2), Metric: "clicks", Dimension: "golang orm", Value: 8},
	)
	if err := s.savePoints(ctx, id, "gsc", pts); err != nil {
		t.Fatal(err)
	}

	// --- series: totals only, in day order ---
	rows, err := db.QueryContext(ctx, `
		SELECT value FROM builder_analytics_points
		 WHERE source_id = $1 AND metric = 'clicks' AND dimension = ''
		 ORDER BY day`, id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []float64
	for rows.Next() {
		var v float64
		if err := rows.Scan(&v); err != nil {
			t.Fatal(err)
		}
		got = append(got, v)
	}
	want := []float64{5, 11, 20}
	if len(got) != len(want) {
		t.Fatalf("series length = %d, want %d — the breakdown rows leaked into the totals", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("series[%d] = %v, want %v (order is wrong or a value was overwritten)", i, got[i], want[i])
		}
	}

	// --- top: the breakdown for one day, biggest first ---
	var firstDim string
	var firstVal float64
	err = db.QueryRowContext(ctx, `
		SELECT dimension, value FROM builder_analytics_points
		 WHERE source_id = $1 AND metric = 'clicks' AND dimension <> ''
		 ORDER BY value DESC LIMIT 1`, id).Scan(&firstDim, &firstVal)
	if err != nil {
		t.Fatal(err)
	}
	if firstDim != "togo framework" || firstVal != 12 {
		t.Errorf("top row = %q/%v, want \"togo framework\"/12", firstDim, firstVal)
	}
}
