-- Sources: recurring jobs that turn an external system into project memory.
--
-- The first kind is 'sql': a saved read-only SELECT against a real database,
-- run on a schedule, rendered to text, and retained as ONE memory an agent can
-- quote back ("we have 12,431 users, 84 signed up this week").
--
-- WHY A TABLE AND NOT A BLUEPRINT FILE
-- A source has mutable runtime state — next_run_at, a lease, a failure count,
-- the last error — and that state has to be visible to every app instance and
-- editable without a redeploy. A file in blueprint/ is none of those things.
-- It also gets the same CRUD surface as everything else in the dashboard.
--
-- WHY kind + config jsonb RATHER THAN sql/template/dsn COLUMNS
-- The webhook ingestion work needs exactly this row shape — schedule, lease,
-- failure count, target namespace — and differs only in what configures a run.
-- Splitting that into two tables would mean two schedulers and two lease
-- protocols. `kind` selects the runner; `config` is that runner's own business
-- and is validated in Go (internal/sources), where the types actually live.
--
-- NOTE FOR WHOEVER APPLIES THIS
-- builder_sources / builder_source_items / builder_source_runs already exist in
-- builder_dev and builder_test, applied by an earlier attempt on this issue
-- whose working tree was reset while the databases were not. No branch contains
-- the migration that made them. Every statement here is idempotent, so this
-- file reconciles those databases with the tree instead of colliding with them.
-- Applying it to a shared environment is still `migration_apply_to_shared_env`
-- and still needs a human — this file has NOT been applied anywhere but a
-- throwaway database.

CREATE TABLE IF NOT EXISTS builder_sources (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which runner handles this row. 'sql' is the only kind implemented here.
    kind       text NOT NULL CHECK (kind ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),

    -- The runner's own configuration. For kind='sql' this is
    -- {dsnSecret, sql, template, runAs, maxRows, timeoutMs} — see
    -- internal/sources/sql.go, which is the schema of record.
    --
    -- dsnSecret is the NAME of a vault secret, never a connection string.
    -- A credential in this column would be readable by every operator with
    -- SELECT on the table and would appear in every backup in plaintext,
    -- which is the entire thing the vault exists to prevent (Rule 34).
    config     jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- The brain namespace the rendered result is retained into.
    namespace  text NOT NULL DEFAULT '',

    -- '@hourly', '@daily', or a Go duration ('30m'). Parsed in Go; kept as text
    -- so an operator can read it back in the form they typed.
    schedule   text NOT NULL DEFAULT '@hourly',

    -- DEFAULT false, deliberately. A migration must not be able to start
    -- polling somebody's production database, and neither should creating a
    -- row in a form. Turning a source on is a separate, deliberate act.
    enabled    boolean NOT NULL DEFAULT false,

    next_run_at          timestamptz NOT NULL DEFAULT now(),
    last_run_at          timestamptz,
    last_status          text NOT NULL DEFAULT ''
                           CHECK (last_status IN ('','running','ok','error')),
    -- Scrubbed before it is written here: a driver error routinely quotes the
    -- DSN it failed to dial, password included. See sources.Scrub.
    last_error           text NOT NULL DEFAULT '',
    consecutive_failures integer NOT NULL DEFAULT 0,

    -- The lease. Two app instances share one database, so "is this source due?"
    -- and "am I the one running it?" have to be one atomic UPDATE, exactly as
    -- the orchestrator claims an issue.
    claim_token      text,
    lease_expires_at timestamptz,

    total_runs bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT builder_sources_uniq UNIQUE (kind, name)
);

-- Converge the databases that already have this table from the reset attempt.
-- A no-op everywhere else.
--
-- CREATE TABLE IF NOT EXISTS skips the WHOLE statement when the table is there,
-- columns and all. So on the databases this file exists to reconcile, the new
-- columns were never added and the table kept the older shape — and the first
-- thing to touch one was markOK, whose UPDATE names total_runs. Its error was
-- discarded, so the schedule never advanced, so the scheduler re-claimed the
-- same source on the next pass and refetched it in a tight loop.
ALTER TABLE builder_sources ALTER COLUMN enabled SET DEFAULT false;

ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS total_runs  bigint NOT NULL DEFAULT 0;
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS total_added bigint NOT NULL DEFAULT 0;
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS cursor      text   NOT NULL DEFAULT '';
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS last_status text   NOT NULL DEFAULT '';
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS last_error  text   NOT NULL DEFAULT '';
ALTER TABLE builder_sources ADD COLUMN IF NOT EXISTS namespace   text   NOT NULL DEFAULT '';

-- The old shape carried these; nothing reads them now. Left in place rather
-- than dropped: a DROP here would be irreversible on the one database that
-- still holds the only copy of whatever they recorded.

-- The scheduler's only query: which enabled sources are due?
CREATE INDEX IF NOT EXISTS builder_sources_due_idx
    ON builder_sources (next_run_at) WHERE enabled;

-- One row per refresh attempt. Without it a source that fails at 03:00 and
-- succeeds at 04:00 looks like it has always been fine, because last_error is
-- overwritten by the next success.
CREATE TABLE IF NOT EXISTS builder_source_runs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id  uuid NOT NULL REFERENCES builder_sources(id) ON DELETE CASCADE,
    status     text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','ok','error')),
    -- 'schedule' | 'manual'. A hand-triggered refresh that fails should be
    -- distinguishable from the scheduler quietly failing all night.
    trigger    text NOT NULL DEFAULT 'schedule',
    -- Rows actually read, after the row cap. `truncated` says the query had
    -- more to give — the number an agent quotes is then a floor, not a total,
    -- and the rendered text says so.
    rows_read  integer NOT NULL DEFAULT 0,
    truncated  boolean NOT NULL DEFAULT false,
    error      text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at   timestamptz
);

-- Same converge as builder_sources, for the same reason: where this table
-- already exists from the reset attempt it has the older column set, and
-- CREATE TABLE IF NOT EXISTS adds nothing to it.
ALTER TABLE builder_source_runs ADD COLUMN IF NOT EXISTS rows_read integer NOT NULL DEFAULT 0;
ALTER TABLE builder_source_runs ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;
ALTER TABLE builder_source_runs ADD COLUMN IF NOT EXISTS trigger   text    NOT NULL DEFAULT 'schedule';
ALTER TABLE builder_source_runs ADD COLUMN IF NOT EXISTS error     text    NOT NULL DEFAULT '';

-- Relax the leftovers.
--
-- The older shape carried columns this code never writes (claim_token,
-- items_seen, cursor_before, …), and some are NOT NULL with no default. The
-- new INSERT names neither, so it fails the constraint and the refresh goes
-- unrecorded — a source that ran perfectly leaves no trace in the ledger.
--
-- Dropping NOT NULL rather than dropping the columns: this relaxes a
-- constraint, which is reversible, whereas DROP COLUMN would discard whatever
-- the reset-era rows still hold, on the one database that has them.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'builder_source_runs'
       AND is_nullable = 'NO'
       AND column_default IS NULL
       AND column_name NOT IN ('id','source_id','status','trigger','rows_read',
                               'truncated','error','started_at')
  LOOP
    EXECUTE format('ALTER TABLE builder_source_runs ALTER COLUMN %I DROP NOT NULL', c.column_name);
  END LOOP;
END $$;

-- The status vocabulary differs too: the older table allowed
-- running|succeeded|failed, this code writes running|ok|error. Existing rows
-- are migrated to the new words rather than being left unreadable by the
-- constraint that is about to replace it.
UPDATE builder_source_runs SET status = 'ok'    WHERE status = 'succeeded';
UPDATE builder_source_runs SET status = 'error' WHERE status = 'failed';
ALTER TABLE builder_source_runs DROP CONSTRAINT IF EXISTS builder_source_runs_status_check;
ALTER TABLE builder_source_runs ADD  CONSTRAINT builder_source_runs_status_check
    CHECK (status IN ('running','ok','error'));

CREATE INDEX IF NOT EXISTS builder_source_runs_recent_idx
    ON builder_source_runs (source_id, started_at DESC);
