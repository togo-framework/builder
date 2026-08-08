-- Skill usage log.
--
-- The catalogue could say how many agents HOLD a skill, but not whether any of
-- them had ever actually worked with it. A skill nobody has exercised and a
-- skill exercised on every run looked identical, so there was no way to tell a
-- load-bearing procedure from a stub somebody generated once.
--
-- One row per (run, skill): the skills that were in the agent's context for
-- that run. That is the honest signal available — the runner reads Claude Code
-- with --output-format json, which returns the terminal result only, so
-- individual in-session tool calls are not observable from here. The column is
-- named `loaded_at` rather than `invoked_at` for exactly that reason.

CREATE TABLE IF NOT EXISTS builder_skill_uses (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Both the id and the name. The id gives referential integrity and cascades
    -- the log away with the skill; the name keeps a row readable when the join
    -- is not worth it, and survives in an export.
    skill_id     uuid NOT NULL REFERENCES builder_skills(id) ON DELETE CASCADE,
    skill_name   text NOT NULL,

    agent_slug   text NOT NULL,

    -- ON DELETE SET NULL, not CASCADE: pruning old runs must not silently
    -- rewrite how often a skill was used. The row survives with a null run.
    run_id       uuid REFERENCES builder_runs(id) ON DELETE SET NULL,
    issue_id     uuid REFERENCES builder_issues(id) ON DELETE SET NULL,

    -- Denormalised so the activity list renders "#42" without a join to an
    -- issue row that may since have been deleted.
    issue_number bigint,

    loaded_at    timestamptz NOT NULL DEFAULT now()
);

-- A run loads each of its skills exactly once. Without this, a reconciler that
-- re-announces a run would double every count.
CREATE UNIQUE INDEX IF NOT EXISTS builder_skill_uses_run_skill_idx
    ON builder_skill_uses (run_id, skill_id)
    WHERE run_id IS NOT NULL;

-- The skill page reads its own activity newest-first; this is that query.
CREATE INDEX IF NOT EXISTS builder_skill_uses_skill_idx
    ON builder_skill_uses (skill_id, loaded_at DESC);

-- The agent page reads the same log filtered the other way.
CREATE INDEX IF NOT EXISTS builder_skill_uses_agent_idx
    ON builder_skill_uses (agent_slug, loaded_at DESC);
