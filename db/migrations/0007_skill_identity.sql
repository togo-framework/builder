-- Icon and colour for skills, so the catalogue reads as a grid of apps rather
-- than a wall of table rows.
--
-- A list of 29 near-identical rows is scanned linearly and slowly; a grid with a
-- distinct mark per item is recognised at a glance, which is the whole job of a
-- catalogue you return to often.
ALTER TABLE builder_skills
  ADD COLUMN IF NOT EXISTS icon  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';

-- Icon is a lucide name (kebab-case), not markup or an emoji: the UI maps it to
-- a real icon component, and anything it cannot map falls back to a derived one.
ALTER TABLE builder_skills DROP CONSTRAINT IF EXISTS builder_skills_icon_check;
ALTER TABLE builder_skills
  ADD CONSTRAINT builder_skills_icon_check
  CHECK (icon = '' OR icon ~ '^[a-z][a-z0-9-]{0,39}$');

ALTER TABLE builder_skills DROP CONSTRAINT IF EXISTS builder_skills_color_check;
ALTER TABLE builder_skills
  ADD CONSTRAINT builder_skills_color_check
  CHECK (color = '' OR color ~ '^#[0-9a-fA-F]{6}$');
