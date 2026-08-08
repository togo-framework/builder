-- Skills: the reusable instruction files agents load, promoted from "some
-- directories nobody can see" to a first-class, editable table.
--
-- Until now a skill existed only as .claude/skills/<name>/SKILL.md on disk.
-- builder_agents.skills is a text[] of bare names, so the only way to know
-- whether a name in that array resolved to anything was to go and look at the
-- filesystem — and the only way to add one was to write a file by hand on the
-- machine the runner happens to execute on. Neither is something an operator
-- can do from the dashboard, and neither leaves a record.
--
-- The disk files remain the thing Claude Code actually reads at run time. This
-- table is the catalogue and the editing surface; POST /skills/sync reconciles
-- the two in the disk -> database direction, and create/edit writes back in the
-- database -> disk direction.

CREATE TABLE IF NOT EXISTS builder_skills (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The name agents reference in builder_agents.skills, and the directory
    -- name on disk. Unique across the install, not merely per source: a name in
    -- an agent's text[] is a bare string with nowhere to put a qualifier, so it
    -- has to resolve to exactly one skill or dispatch is ambiguous.
    name           text NOT NULL UNIQUE,

    title          text NOT NULL DEFAULT '',
    description    text NOT NULL DEFAULT '',

    -- The markdown BODY, without the YAML frontmatter. Frontmatter is
    -- regenerated from name + description when the file is written, so those
    -- two fields have one owner instead of drifting between the row and the
    -- file's own header.
    body_md        text NOT NULL DEFAULT '',

    --   local    — found on disk by a sync
    --   github   — installed from a repository
    --   operator — typed into the dashboard
    -- Sync uses this to refuse to overwrite an operator's own writing with a
    -- file that happens to share its name.
    source         text NOT NULL DEFAULT 'operator'
                     CHECK (source IN ('local','github','operator')),

    -- Where it came from: "owner/repo@sha" for github, the scanned path for
    -- local, empty for operator. Provenance, not a fetch handle.
    source_ref     text NOT NULL DEFAULT '',

    -- Path of the SKILL.md this row was last written to or read from, relative
    -- to the app root. Empty means the row has never been materialised on disk.
    installed_path text NOT NULL DEFAULT '',

    enabled        boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- A name is a slug because it is also a directory name and a value inside a
    -- text[] literal. Anything with a quote, a slash or a backslash in it would
    -- either escape the skills directory or need escaping every time it is
    -- interpolated into a Postgres array — so it is rejected at the door.
    CONSTRAINT builder_skills_name_slug
      CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
    CONSTRAINT builder_skills_title_len       CHECK (length(title) <= 200),
    CONSTRAINT builder_skills_description_len CHECK (length(description) <= 2000),
    -- 512 KB. A SKILL.md is prose; anything larger is a mistake or a vendored
    -- binary, and both of those reach a model prompt.
    CONSTRAINT builder_skills_body_len        CHECK (length(body_md) <= 524288),
    CONSTRAINT builder_skills_path_len        CHECK (length(installed_path) <= 500)
);

-- The catalogue is listed enabled-first then alphabetically, and filtered by
-- source in the UI. Both are covered here; `name` already has the unique index.
CREATE INDEX IF NOT EXISTS builder_skills_listing
  ON builder_skills (enabled DESC, name);
CREATE INDEX IF NOT EXISTS builder_skills_source
  ON builder_skills (source);

-- Every skill row carries "how many agents use this", which is a containment
-- test against builder_agents.skills on every listed row. Without this index
-- that is a sequential scan of the fleet per skill; `areas` already has the
-- equivalent GIN index for exactly the same reason.
CREATE INDEX IF NOT EXISTS builder_agents_skills
  ON builder_agents USING gin (skills);
