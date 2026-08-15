package sources

// The chart endpoints.
//
//	GET /analytics/series?metric=clicks&days=30[&sourceId=…]
//	GET /analytics/top?metric=clicks&day=YYYY-MM-DD[&limit=10]
//
// Two shapes, because charts ask two questions and they need different SQL:
// "how did this metric move over time" (one row per day, no dimension) and
// "what were the biggest contributors" (one day, ordered by value).
//
// Everything is scoped to a connection. Summing two GA4 properties into one
// line would be a chart of a number nobody measures.

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// AnalyticsRoutes mounts the chart surface.
func (s *Store) AnalyticsRoutes(r chi.Router) {
	r.Get("/analytics/series", s.handleSeries)
	r.Get("/analytics/top", s.handleTop)
	r.Get("/analytics/connections", s.handleAnalyticsConnections)
}

// metricAllowed gates the metric name.
//
// It is concatenated into no SQL — it is a bound parameter — so this is not an
// injection defence. It is a typo defence: an unknown metric returns an empty
// series that looks exactly like "no data yet", and an operator cannot tell
// those apart from a chart.
var metricAllowed = map[string]bool{
	"screenPageViews": true,
	"activeUsers":     true,
	"clicks":          true,
	"impressions":     true,
	"position":        true,
}

type seriesPoint struct {
	Day   string  `json:"day"`
	Value float64 `json:"value"`
}

func (s *Store) handleSeries(w http.ResponseWriter, r *http.Request) {
	metric := strings.TrimSpace(r.URL.Query().Get("metric"))
	if !metricAllowed[metric] {
		httpErr(w, http.StatusUnprocessableEntity,
			"unknown metric — one of: screenPageViews, activeUsers, clicks, impressions, position")
		return
	}
	days := clampInt(atoiOr(r.URL.Query().Get("days"), 30), 30, 1, 365)
	sourceID := strings.TrimSpace(r.URL.Query().Get("sourceId"))

	// dimension = '' is the day's TOTAL. Without that filter the query would sum
	// every page's views on top of the total that already includes them, and
	// every chart would read exactly double.
	q := `SELECT to_char(day,'YYYY-MM-DD'), value
	        FROM builder_analytics_points
	       WHERE metric = $1 AND dimension = ''
	         AND day >= current_date - $2::int`
	args := []any{metric, days}
	if sourceID != "" {
		q += ` AND source_id = $3`
		args = append(args, sourceID)
	}
	q += ` ORDER BY day`

	rows, err := s.db.QueryContext(r.Context(), q, args...)
	if err != nil {
		s.log.Error("analytics series", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not read the series")
		return
	}
	defer rows.Close()

	// Non-nil so an empty result encodes as [] rather than null — a chart
	// library given null renders an error, given [] renders an empty chart,
	// and "no data yet" is an empty chart.
	out := []seriesPoint{}
	for rows.Next() {
		var p seriesPoint
		if err := rows.Scan(&p.Day, &p.Value); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the series")
			return
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"metric": metric, "points": out})
}

type topRow struct {
	Dimension string  `json:"dimension"`
	Value     float64 `json:"value"`
}

func (s *Store) handleTop(w http.ResponseWriter, r *http.Request) {
	metric := strings.TrimSpace(r.URL.Query().Get("metric"))
	if !metricAllowed[metric] {
		httpErr(w, http.StatusUnprocessableEntity, "unknown metric")
		return
	}
	limit := clampInt(atoiOr(r.URL.Query().Get("limit"), 10), 10, 1, 100)
	sourceID := strings.TrimSpace(r.URL.Query().Get("sourceId"))

	day := strings.TrimSpace(r.URL.Query().Get("day"))
	if day == "" {
		// The most recent day that HAS data, not today. Analytics lags, so
		// defaulting to today shows an empty list on a working connection.
		q := `SELECT to_char(max(day),'YYYY-MM-DD') FROM builder_analytics_points WHERE metric = $1`
		var d sql.NullString
		if err := s.db.QueryRowContext(r.Context(), q, metric).Scan(&d); err == nil && d.Valid {
			day = d.String
		}
	}
	if day == "" {
		writeJSON(w, http.StatusOK, map[string]any{"day": "", "rows": []topRow{}})
		return
	}
	if _, err := time.Parse("2006-01-02", day); err != nil {
		httpErr(w, http.StatusUnprocessableEntity, "day must be YYYY-MM-DD")
		return
	}

	q := `SELECT dimension, value
	        FROM builder_analytics_points
	       WHERE metric = $1 AND day = $2::date AND dimension <> ''`
	args := []any{metric, day}
	if sourceID != "" {
		q += ` AND source_id = $3`
		args = append(args, sourceID)
	}
	// position is an average RANK: smaller is better, so "top" means ascending.
	// Sorting it descending would list the worst-performing queries under a
	// heading that says top.
	if metric == "position" {
		q += ` ORDER BY value ASC`
	} else {
		q += ` ORDER BY value DESC`
	}
	q += ` LIMIT ` + strconv.Itoa(limit)

	rows, err := s.db.QueryContext(r.Context(), q, args...)
	if err != nil {
		s.log.Error("analytics top", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not read the breakdown")
		return
	}
	defer rows.Close()

	out := []topRow{}
	for rows.Next() {
		var t topRow
		if err := rows.Scan(&t.Dimension, &t.Value); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the breakdown")
			return
		}
		out = append(out, t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"day": day, "metric": metric, "rows": out})
}

// handleAnalyticsConnections lists the connections that have chartable data.
//
// The chart UI needs this to populate its picker: listing every source would
// offer RSS feeds as analytics properties, and listing only configured GA4
// connections would offer ones that have never successfully run.
func (s *Store) handleAnalyticsConnections(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `
		SELECT s.id, s.kind, s.name, count(p.id), to_char(max(p.day),'YYYY-MM-DD')
		  FROM builder_sources s
		  JOIN builder_analytics_points p ON p.source_id = s.id
		 GROUP BY s.id, s.kind, s.name
		 ORDER BY s.name`)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not list the analytics connections")
		return
	}
	defer rows.Close()

	type conn struct {
		ID      string `json:"id"`
		Kind    string `json:"kind"`
		Name    string `json:"name"`
		Points  int    `json:"points"`
		LastDay string `json:"lastDay"`
	}
	out := []conn{}
	for rows.Next() {
		var c conn
		var last sql.NullString
		if err := rows.Scan(&c.ID, &c.Kind, &c.Name, &c.Points, &last); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the connections")
			return
		}
		c.LastDay = last.String
		out = append(out, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": out})
}

func atoiOr(s string, def int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
		return v
	}
	return def
}
