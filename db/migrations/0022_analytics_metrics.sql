-- Analytics as NUMBERS, alongside the prose the brain already gets.
--
-- The GA4 and Search Console collectors write one narrative document per window
-- into builder_memories, which is the right shape for recall: an agent asked
-- "how did the site do last week" gets a paragraph it can quote.
--
-- It is the wrong shape for a chart. "Plot clicks per day for 90 days" against
-- prose means re-parsing sentences the collector already assembled from
-- structured data, and every rounding and phrasing decision in that sentence
-- becomes a parsing bug. So the same fetch lands twice: once as prose for
-- recall, once as rows for charts.
--
-- Deliberately NOT a general time-series table. One row per
-- (connection, date, metric, dimension) is enough for every chart the analytics
-- cards need, and a schema that tried to be more would need a query planner
-- nobody is going to write.

BEGIN;

CREATE TABLE IF NOT EXISTS builder_analytics_points (
    id            bigserial PRIMARY KEY,

    -- Which configured connection produced this. CASCADE because a metric
    -- belongs to its connection: deleting the connection and leaving orphaned
    -- numbers would show a chart for something nobody can find or re-fetch.
    source_id     uuid NOT NULL REFERENCES builder_sources(id) ON DELETE CASCADE,

    -- "ga4" or "gsc". Stored rather than joined so a chart can select on it
    -- without reaching into builder_sources on every query.
    provider      text NOT NULL,

    -- The DAY this measures, not when it was fetched. Analytics data is revised
    -- for days after the fact — Search Console lags about two days and GA4
    -- backfills — so the same day is written many times and must overwrite
    -- rather than accumulate.
    day           date NOT NULL,

    -- e.g. 'screenPageViews', 'activeUsers', 'clicks', 'impressions', 'position'.
    metric        text NOT NULL,

    -- What the number is broken down BY: a page path, a search query, or ''
    -- for the day's total. Empty string rather than NULL so the unique index
    -- below works without COALESCE — NULL is not equal to NULL in a unique
    -- constraint, which would let duplicate totals through.
    dimension     text NOT NULL DEFAULT '',

    value         double precision NOT NULL,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One value per connection/day/metric/dimension. This is what makes a re-fetch
-- of a revised day an UPDATE: without it, a daily collector accumulates a new
-- row for the same day on every run and every chart doubles weekly.
CREATE UNIQUE INDEX IF NOT EXISTS builder_analytics_points_uniq
    ON builder_analytics_points (source_id, day, metric, dimension);

-- The chart query: one metric, one connection, ordered over a date range.
CREATE INDEX IF NOT EXISTS builder_analytics_points_series_idx
    ON builder_analytics_points (source_id, metric, day DESC);

-- The "top pages/queries" query: a single day's breakdown, biggest first.
CREATE INDEX IF NOT EXISTS builder_analytics_points_top_idx
    ON builder_analytics_points (source_id, day, metric, value DESC)
    WHERE dimension <> '';

COMMENT ON TABLE builder_analytics_points IS
  'Numeric analytics points for charts. The same fetch also writes prose to builder_memories for recall — see internal/sources/ga4.go.';

COMMIT;
