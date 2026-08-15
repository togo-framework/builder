package sources

// The "ga4" and "gsc" source kinds: Google Analytics 4 and Search Console.
//
// Both were in the catalogue with OAuth wired and nothing behind them —
// authorising succeeded and no data ever arrived. These are the collectors.
//
// # Why the two live in one file
//
// They answer halves of the same question. Analytics says what people did once
// they arrived; Search Console says what they searched to get there. An
// operator asking "how is the site doing" wants both, they are reported over
// the same date window, and they share the request/summarise shape below.
//
// # Why a summary rather than raw rows
//
// The destination is a brain, and a memory is prose an agent recalls — not a
// table. 500 rows of `/blog/foo → 12 views` is a spreadsheet nobody will match
// against a question. So each run writes ONE document per window: the headline
// numbers, then the top rows, in a form that answers "what were the best pages
// last week" when recalled.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	KindGA4 = "ga4"
	KindGSC = "gsc"
)

func init() {
	Register(KindGA4, newGA4)
	Register(KindGSC, newGSC)
}

const (
	analyticsAPI = "https://analyticsdata.googleapis.com/v1beta"
	searchAPI    = "https://searchconsole.googleapis.com/webmasters/v3"

	gaDefaultDays = 7
	gaHardDays    = 365
	gaDefaultRows = 25
	gaHardRows    = 250
)

// ───────────────────────────── Analytics ─────────────────────────────

type ga4Config struct {
	PropertyID string `json:"propertyId"`
	Days       int    `json:"days"`
	TopRows    int    `json:"topRows"`
}

type ga4Source struct {
	cfg  ga4Config
	http *http.Client
	// pts holds the last Fetch's numbers, for the charts table. See
	// analytics_points.go for why they do not travel in the Batch.
	pts []Point
}

// Points implements PointSource.
func (g *ga4Source) Points() []Point { return g.pts }

func newGA4(cfg json.RawMessage, _ Secrets) (Source, error) {
	var c ga4Config
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("google analytics source config: %w", err)
		}
	}
	c.PropertyID = strings.TrimSpace(strings.TrimPrefix(c.PropertyID, "properties/"))
	if c.PropertyID == "" {
		return nil, fmt.Errorf(`google analytics source config: "propertyId" is required — the numeric id from Admin → Property Settings, not the "G-" measurement id`)
	}
	c.Days = clampInt(c.Days, gaDefaultDays, 1, gaHardDays)
	c.TopRows = clampInt(c.TopRows, gaDefaultRows, 1, gaHardRows)
	return &ga4Source{cfg: c, http: &http.Client{Timeout: 45 * time.Second}}, nil
}

func (g *ga4Source) Kind() string { return KindGA4 }
func (g *ga4Source) Name() string { return "properties/" + g.cfg.PropertyID }

func (g *ga4Source) Fetch(ctx context.Context, _ string) (Batch, error) {
	tok, err := accessToken(ctx, "google-analytics")
	if err != nil {
		return Batch{}, err
	}

	body := map[string]any{
		"dateRanges": []map[string]string{{
			// GA4 accepts "NdaysAgo" relative dates, which keeps the window
			// moving with the schedule rather than fixed at configuration time.
			"startDate": fmt.Sprintf("%ddaysAgo", g.cfg.Days),
			"endDate":   "yesterday",
		}},
		"dimensions": []map[string]string{{"name": "pagePath"}},
		"metrics": []map[string]string{
			{"name": "screenPageViews"},
			{"name": "activeUsers"},
			{"name": "userEngagementDuration"},
		},
		"orderBys": []map[string]any{{
			"metric": map[string]string{"metricName": "screenPageViews"},
			"desc":   true,
		}},
		"limit": g.cfg.TopRows,
	}

	var out gaReport
	u := fmt.Sprintf("%s/properties/%s:runReport", analyticsAPI, g.cfg.PropertyID)
	if err := googlePost(ctx, g.http, tok, u, body, &out, "Google Analytics", "analytics.readonly"); err != nil {
		return Batch{}, err
	}

	// The window's last day. GA4's "yesterday" is the newest COMPLETE day, and
	// dating the points to the fetch time instead would put every run's numbers
	// on today and overwrite each other.
	endDay := time.Now().AddDate(0, 0, -1)
	end := endDay.Format("2006-01-02")
	g.pts = g.pts[:0]
	var sb strings.Builder
	fmt.Fprintf(&sb, "Google Analytics — property %s, the %d days ending %s.\n\n",
		g.cfg.PropertyID, g.cfg.Days, end)

	var views, users int64
	for _, r := range out.Rows {
		v, u := atoi64(r.metric(0)), atoi64(r.metric(1))
		views += v
		users += u
		// Per-page, so a chart can show which pages moved.
		if path := r.dim(0); path != "" {
			g.pts = append(g.pts,
				Point{Day: endDay, Metric: "screenPageViews", Dimension: path, Value: float64(v)},
				Point{Day: endDay, Metric: "activeUsers", Dimension: path, Value: float64(u)},
			)
		}
	}
	// Dimensionless totals — the series a headline chart plots.
	g.pts = append(g.pts,
		Point{Day: endDay, Metric: "screenPageViews", Value: float64(views)},
		Point{Day: endDay, Metric: "activeUsers", Value: float64(users)},
	)
	fmt.Fprintf(&sb, "%d page views from %d active users across the top %d pages.\n\nTop pages:\n",
		views, users, len(out.Rows))
	for _, r := range out.Rows {
		fmt.Fprintf(&sb, "  %s — %s views, %s users\n",
			r.dim(0), r.metric(0), r.metric(1))
	}
	if len(out.Rows) == 0 {
		// An empty report is a real answer and a common one — a brand-new
		// property, or a window before the site had traffic. Saying so beats
		// a document containing only a header.
		sb.WriteString("  (no traffic recorded in this window)\n")
	}

	return Batch{Docs: []Doc{{
		// The window is part of the Ref, so each week is its own memory and a
		// re-run of the same week updates rather than duplicates. Without the
		// date, every run would overwrite the only analytics memory that exists
		// and the history would be one row deep.
		Ref:        fmt.Sprintf("ga4:%s:%s:%dd", g.cfg.PropertyID, end, g.cfg.Days),
		Title:      fmt.Sprintf("Analytics — %d days to %s", g.cfg.Days, end),
		Text:       sb.String(),
		Importance: 0.6,
	}}}, nil
}

// gaReport is the runReport response, narrowed to what is read.
type gaReport struct {
	Rows []gaRow `json:"rows"`
}

type gaRow struct {
	DimensionValues []gaValue `json:"dimensionValues"`
	MetricValues    []gaValue `json:"metricValues"`
}

type gaValue struct {
	Value string `json:"value"`
}

// dim and metric index defensively.
//
// GA4 returns dimensions and metrics as parallel arrays in the order they were
// requested, with no names on the values — so reading them is positional, and a
// response with fewer entries than expected (a metric the property does not
// collect) would panic on a bare index. An empty string is a fine answer for a
// summary line; a crashed refresh is not.
func (r gaRow) dim(i int) string {
	if i < len(r.DimensionValues) {
		return r.DimensionValues[i].Value
	}
	return ""
}

func (r gaRow) metric(i int) string {
	if i < len(r.MetricValues) {
		return r.MetricValues[i].Value
	}
	return "0"
}

// urlPathEscape escapes a Search Console site URL for use in a path segment.
//
// Site URLs are themselves URLs ("https://example.com/") or the domain form
// ("sc-domain:example.com"), and both contain characters that must not be read
// as path structure.
func urlPathEscape(s string) string { return url.PathEscape(s) }

// ─────────────────────────── Search Console ───────────────────────────

type gscConfig struct {
	SiteURL string `json:"siteUrl"`
	Days    int    `json:"days"`
	TopRows int    `json:"topRows"`
}

type gscSource struct {
	cfg  gscConfig
	http *http.Client
	pts  []Point
}

// Points implements PointSource.
func (g *gscSource) Points() []Point { return g.pts }

func newGSC(cfg json.RawMessage, _ Secrets) (Source, error) {
	var c gscConfig
	if len(cfg) > 0 {
		if err := json.Unmarshal(cfg, &c); err != nil {
			return nil, fmt.Errorf("search console source config: %w", err)
		}
	}
	c.SiteURL = strings.TrimSpace(c.SiteURL)
	if c.SiteURL == "" {
		return nil, fmt.Errorf(`search console source config: "siteUrl" is required — exactly as it appears in Search Console, including the trailing slash, or "sc-domain:example.com" for a domain property`)
	}
	c.Days = clampInt(c.Days, gaDefaultDays, 1, gaHardDays)
	c.TopRows = clampInt(c.TopRows, gaDefaultRows, 1, gaHardRows)
	return &gscSource{cfg: c, http: &http.Client{Timeout: 45 * time.Second}}, nil
}

func (g *gscSource) Kind() string { return KindGSC }
func (g *gscSource) Name() string { return g.cfg.SiteURL }

func (g *gscSource) Fetch(ctx context.Context, _ string) (Batch, error) {
	tok, err := accessToken(ctx, "google-search-console")
	if err != nil {
		return Batch{}, err
	}

	// Search Console data lags by about two days, so a window ending today is
	// partly empty and reads as a traffic collapse. Ending three days back is
	// the difference between a report and a false alarm.
	end := time.Now().AddDate(0, 0, -3)
	start := end.AddDate(0, 0, -g.cfg.Days)

	body := map[string]any{
		"startDate":  start.Format("2006-01-02"),
		"endDate":    end.Format("2006-01-02"),
		"dimensions": []string{"query"},
		"rowLimit":   g.cfg.TopRows,
	}

	var out struct {
		Rows []struct {
			Keys        []string `json:"keys"`
			Clicks      float64  `json:"clicks"`
			Impressions float64  `json:"impressions"`
			CTR         float64  `json:"ctr"`
			Position    float64  `json:"position"`
		} `json:"rows"`
	}
	u := fmt.Sprintf("%s/sites/%s/searchAnalytics/query", searchAPI, urlPathEscape(g.cfg.SiteURL))
	if err := googlePost(ctx, g.http, tok, u, body, &out, "Search Console", "webmasters.readonly"); err != nil {
		return Batch{}, err
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Search Console — %s, %s to %s.\n\n",
		g.cfg.SiteURL, start.Format("2006-01-02"), end.Format("2006-01-02"))

	g.pts = g.pts[:0]
	var clicks, impressions float64
	for _, r := range out.Rows {
		clicks += r.Clicks
		impressions += r.Impressions
		if len(r.Keys) > 0 && r.Keys[0] != "" {
			g.pts = append(g.pts,
				Point{Day: end, Metric: "clicks", Dimension: r.Keys[0], Value: r.Clicks},
				Point{Day: end, Metric: "impressions", Dimension: r.Keys[0], Value: r.Impressions},
				// Position is an AVERAGE rank, so summing it would be
				// meaningless — it is stored per query only.
				Point{Day: end, Metric: "position", Dimension: r.Keys[0], Value: r.Position},
			)
		}
	}
	g.pts = append(g.pts,
		Point{Day: end, Metric: "clicks", Value: clicks},
		Point{Day: end, Metric: "impressions", Value: impressions},
	)
	fmt.Fprintf(&sb, "%.0f clicks from %.0f impressions across the top %d queries.\n\nTop queries:\n",
		clicks, impressions, len(out.Rows))
	for _, r := range out.Rows {
		q := ""
		if len(r.Keys) > 0 {
			q = r.Keys[0]
		}
		fmt.Fprintf(&sb, "  %q — %.0f clicks, %.0f impressions, position %.1f\n",
			q, r.Clicks, r.Impressions, r.Position)
	}
	if len(out.Rows) == 0 {
		sb.WriteString("  (no search data in this window)\n")
	}

	return Batch{Docs: []Doc{{
		Ref:        fmt.Sprintf("gsc:%s:%s:%dd", g.cfg.SiteURL, end.Format("2006-01-02"), g.cfg.Days),
		Title:      fmt.Sprintf("Search Console — %d days to %s", g.cfg.Days, end.Format("2006-01-02")),
		Text:       sb.String(),
		Importance: 0.6,
	}}}, nil
}

// ───────────────────────────── shared ─────────────────────────────

// googlePost is one authenticated JSON POST to a Google API.
func googlePost(ctx context.Context, c *http.Client, tok, url string, in, out any, product, scope string) error {
	payload, err := json.Marshal(in)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == http.StatusUnauthorized, res.StatusCode == http.StatusForbidden:
		// The most common cause is not a missing scope but an account that has
		// no access to THIS property — an operator with several Google accounts
		// authorises the wrong one and gets a 403 that says nothing about which.
		return fmt.Errorf("%s refused the request (%d) — check that the authorized Google account has access to this property, and that the grant includes %s",
			product, res.StatusCode, scope)
	case res.StatusCode == http.StatusNotFound:
		return fmt.Errorf("%s has no such property — check the id exactly as it appears in the console", product)
	case res.StatusCode < 200 || res.StatusCode >= 300:
		return fmt.Errorf("%s returned %d", product, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// clampInt lives in crawl.go — same bounds semantics, one copy.

func atoi64(s string) int64 {
	var n int64
	fmt.Sscanf(s, "%d", &n)
	return n
}
