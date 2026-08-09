-- Browser context: the console/network/environment snapshot a bridge-mode SDK
-- volunteers alongside a feedback report filed from inside a framed product.
--
-- Shape (internal/issues/context.go is the schema of record — the endpoint
-- clamps and re-marshals before anything reaches this column):
--
--   {
--     "console":  [{"level","text","ts"}],                      -- ≤ 200 entries
--     "network":  [{"method","url","status","durationMs","ts"}],-- ≤ 100 entries
--     "viewport": {"w","h","dpr"},
--     "userAgent": "...",
--     "locale":    "..."
--   }
--
-- Never request/response bodies and never an Authorization header — those are
-- excluded at capture time in the SDK, and the Go sanitizer strips any field
-- it does not know by re-marshalling through typed structs.
--
-- WHY ONE JSONB COLUMN AND NOT child tables
-- The context is written once, with the report, and never again; it is read in
-- exactly one place (the issue detail page), always whole, never filtered,
-- joined, aggregated or updated. Child tables would buy query surface nothing
-- uses, at the price of a 300-row fan-out INSERT inside the feedback
-- transaction — the hot, rate-limited, public path.
--
-- WHY NULLABLE WITH NO DEFAULT
-- NULL means "no context arrived". Most issues have none: filed by hand from
-- the board, filed by an agent, imported, reported by an SDK that predates
-- bridge mode, or reported by someone who used the opt-out ("send without
-- console and network"). A '{}'::jsonb default would erase that distinction —
-- every issue would claim an (empty) context, and the UI could no longer tell
-- "not captured" from "captured nothing", so the opt-out would be invisible.

ALTER TABLE builder_issues ADD COLUMN IF NOT EXISTS browser_context jsonb;

-- Belt-and-braces size cap. The endpoint authoritatively rejects context over
-- 256 KB of raw JSON; this CHECK is for every OTHER writer — a seeder, an
-- agent with SQL access, a future import path — none of which pass through
-- the endpoint's bound. 512 KB, not 256 KB: jsonb's binary form can run
-- larger than the JSON text that produced it (object keys are stored
-- uncompressed per element), and a constraint that rejects what the endpoint
-- accepted would fail the whole report transaction over headroom accounting.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'builder_issues_browser_context_size'
       AND conrelid = 'builder_issues'::regclass
  ) THEN
    ALTER TABLE builder_issues
      ADD CONSTRAINT builder_issues_browser_context_size
      CHECK (browser_context IS NULL OR pg_column_size(browser_context) <= 524288);
  END IF;
END $$;

-- NO INDEX, deliberately.
--
-- The only read is the issue page's single-row lookup — WHERE number = $1 —
-- which the existing UNIQUE index on builder_issues(number) already serves;
-- the context comes along in the same row fetch. Nothing filters or searches
-- BY the context: the board query never touches it, and there is no
-- "issues with console errors" listing. A GIN index here would cost every
-- feedback INSERT maintenance work to accelerate a query that does not exist.
