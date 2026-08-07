-- Agent identity: the fields an operator sets to tell agents apart at a glance.
--
-- The fleet is generated with a slug and a persona, which is enough for the
-- orchestrator but not for a human scanning a roster. Colour and avatar make a
-- list of a dozen agents readable; title is the one-line role that belongs
-- under the name, distinct from `description` (which the router reads to decide
-- who owns an area, and which is therefore written for a model, not a person).

ALTER TABLE builder_agents
  ADD COLUMN IF NOT EXISTS color      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title      text NOT NULL DEFAULT '';

-- Colour is either empty (fall back to a hash of the slug, so every agent still
-- gets a stable one) or a #rrggbb literal. Anything else would end up
-- interpolated into a style attribute.
ALTER TABLE builder_agents
  DROP CONSTRAINT IF EXISTS builder_agents_color_check;
ALTER TABLE builder_agents
  ADD CONSTRAINT builder_agents_color_check
  CHECK (color = '' OR color ~ '^#[0-9a-fA-F]{6}$');

-- Avatars are served, not embedded: a data: URI here would be read on every
-- roster render. Empty means "draw the initials".
ALTER TABLE builder_agents
  DROP CONSTRAINT IF EXISTS builder_agents_avatar_check;
ALTER TABLE builder_agents
  ADD CONSTRAINT builder_agents_avatar_check
  CHECK (avatar_url = '' OR avatar_url ~ '^(https?://|/)' );

ALTER TABLE builder_agents
  DROP CONSTRAINT IF EXISTS builder_agents_title_len;
ALTER TABLE builder_agents
  ADD CONSTRAINT builder_agents_title_len CHECK (length(title) <= 120);
