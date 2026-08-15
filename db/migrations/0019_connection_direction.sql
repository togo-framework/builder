-- A connection has a DIRECTION: it collects, or it acts.
--
-- `builder_sources` was built for one job — poll something on a schedule and
-- retain the result into the brain. That is only half of what a connection is.
-- The other half sends: a message to Slack or WhatsApp, an email, a webhook to
-- a partner. Both halves share everything that is actually hard — a kind, a
-- runner, JSON config, a vault secret reference, an enabled flag, a run history
-- with an error and a duration — and differ in exactly one respect, which is
-- which way the data moves.
--
-- So this is a column, not a second table. Two tables would have duplicated the
-- config/secret/enabled/run-history machinery, and then drifted: the half that
-- got attention would grow a retry policy or a rate limit and the other would
-- not. One table with a direction keeps a single scheduler, a single vault
-- path, and a single place to add the next thing both halves need.
--
-- NOTHING IS DROPPED and no existing row changes meaning. Every row present
-- today is a collector, which is what the default says.
--
-- The table keeps its name for now. Renaming builder_sources -> builder_connections
-- touches 26 Go files and every query in them, and is a mechanical change worth
-- doing on its own rather than smuggled into a migration that is about meaning.

BEGIN;

ALTER TABLE builder_sources
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'source';

-- Constrained, not free text. `direction` decides which runner touches a row,
-- so a typo is not a bad label — it is a row no scheduler claims and nobody
-- notices, because the symptom is silence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'builder_sources_direction_check'
  ) THEN
    ALTER TABLE builder_sources
      ADD CONSTRAINT builder_sources_direction_check
      CHECK (direction IN ('source', 'actor'));
  END IF;
END
$$;

-- The scheduler asks "which enabled collectors are due?" on every tick. The
-- existing builder_sources_due_idx is (next_run_at) WHERE enabled and predates
-- this column, so it now matches actor rows too — the planner reads them on
-- every tick and discards them. A DISTINCT name, because CREATE INDEX IF NOT
-- EXISTS on the old name silently skips and leaves the claim unindexed for the
-- direction it just started filtering on.
CREATE INDEX IF NOT EXISTS builder_sources_due_by_direction_idx
  ON builder_sources (direction, next_run_at)
  WHERE enabled;

COMMENT ON COLUMN builder_sources.direction IS
  'source = collect into the brain on a schedule; actor = send outward when invoked. See internal/sources.';

COMMIT;
