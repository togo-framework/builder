-- Per-agent working directory.
--
-- BUILDER_WORKDIR was a single env var for the whole fleet, but a fleet spans
-- more than one codebase: the feedback widget lives in the plugin (sdk/), the
-- application's own screens live in the generated app (web/src/routes/), and
-- some agents have surfaces in both. One path cannot be correct for all of them.
--
-- The symptom was an agent correctly reporting "could not reproduce" for a file
-- that exists — just not in the repo it was handed — and other agents happily
-- editing the blueprint TEMPLATE when the report was about the running app. Real
-- commits, on the wrong tree, with no effect on what the operator was looking at.
--
-- Empty means "use BUILDER_WORKDIR", so existing fleets keep working unchanged.
ALTER TABLE builder_agents
  ADD COLUMN IF NOT EXISTS workdir text NOT NULL DEFAULT '';

-- Absolute paths only. A relative path would resolve against the API's cwd,
-- which is not something the operator can see or reason about.
ALTER TABLE builder_agents
  DROP CONSTRAINT IF EXISTS builder_agents_workdir_check;
ALTER TABLE builder_agents
  ADD CONSTRAINT builder_agents_workdir_check
  CHECK (workdir = '' OR workdir ~ '^/');
