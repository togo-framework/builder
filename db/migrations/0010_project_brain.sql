-- The project brain: one namespace the whole fleet reads.
--
-- Every agent already had a private brain (`<fleet>:<slug>`), and migration
-- 0001 already grants every agent a read-only grant on `<fleet>:project`. But
-- no row for that namespace could ever exist: `builder_brains.agent_slug` was
-- `text NOT NULL UNIQUE` with a foreign key to `builder_agents(slug)`, and a
-- project brain belongs to no agent. So the grants pointed at a namespace with
-- zero brain rows — readable, uncountable, and invisible to every screen that
-- joins through `builder_brains`.
--
-- WRITING this file is allowed; APPLYING it to a shared environment is not
-- (autonomy.yaml: `migration_apply_to_shared_env` is must_ask). It has been
-- applied only to a throwaway database to verify it.
--
-- Naming: `<fleet>:project` is canonical — the same shape as every agent brain
-- with `project` in the slug position, not a second convention. `project:<name>`
-- appeared in the issue text and is NOT used anywhere in the code.

-- 1. A brain may belong to an agent, or to the project.
ALTER TABLE builder_brains ALTER COLUMN agent_slug DROP NOT NULL;

-- The foreign key needs no change: SQL foreign keys do not constrain NULLs, so
-- a project row simply does not participate in it. The UNIQUE on agent_slug
-- likewise permits many NULLs, which is what lets one project brain exist per
-- fleet.
--
-- Without this CHECK, dropping NOT NULL would also permit an ownerless AGENT
-- brain — a row nothing can ever write to and nothing can ever clean up.
ALTER TABLE builder_brains ADD CONSTRAINT builder_brains_owner_check
  CHECK (agent_slug IS NOT NULL OR namespace LIKE '%:project');

-- 2. One project brain per fleet.
--
-- can_write stays true: the row describes the brain, not who may write it.
-- Agents reach it only through the read-only grant below, because
-- `brain.Writable` resolves a writable namespace by agent_slug and a project
-- row has none. The only writer is ingestion, via `brain.RetainProject`.
INSERT INTO builder_brains (agent_slug, namespace, driver, can_read, can_write, embedding_dim)
SELECT NULL, f.name || ':project', 'pgvector', true, true, 1024
  FROM builder_fleets f
ON CONFLICT (namespace) DO NOTHING;

-- A database migrated before the wizard has ever run has no fleet row yet, and
-- `default` is the name the wizard uses. Seeding it here means recall has a
-- project brain to merge from on the very first run rather than after the first
-- generate.
INSERT INTO builder_brains (agent_slug, namespace, driver, can_read, can_write, embedding_dim)
SELECT NULL, 'default:project', 'pgvector', true, true, 1024
 WHERE NOT EXISTS (SELECT 1 FROM builder_fleets)
ON CONFLICT (namespace) DO NOTHING;

-- 3. Backfill the missing read grants.
--
-- The wizard grants this at generate time, but an agent hired through the web
-- API never got one — `handleCreate` inserted a brain and stopped. Those agents
-- (six of nine in the reference install) could not read the project brain at
-- all. Read-only, always: an agent learns what the team knows without being
-- able to rewrite it.
INSERT INTO builder_brain_grants (namespace, agent_slug, can_read, can_write)
SELECT b.namespace, a.slug, true, false
  FROM builder_brains b
 CROSS JOIN builder_agents a
 WHERE b.agent_slug IS NULL
ON CONFLICT (namespace, agent_slug) DO NOTHING;
