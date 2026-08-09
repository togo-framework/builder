import { Link } from "@tanstack/react-router";
import { StatusBadge } from "@togo-framework/ui";
import { skillColor, type Skill } from "../lib/skills";
import { SkillMark } from "./skill-mark";

/**
 * A skill as an app tile.
 *
 * The catalogue was a table, and a table of 29 near-identical rows is read
 * linearly — you scan every line to find one. A grid with a distinct mark per
 * item is recognised at a glance, which is what a catalogue you return to
 * repeatedly needs to be.
 *
 * A Link, not a button: the tile used to expand a panel below the grid, which
 * with 29 tiles above it opened off-screen and read as a dead click. A skill
 * has an address now.
 */
export const SkillCard = ({ skill }: { skill: Skill }) => {
  const color = skillColor(skill);

  return (
    <Link
      to="/skills/$name"
      params={{ name: skill.name }}
      className="group relative flex h-full w-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-start
                 transition-all duration-200 ease-out
                 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                 motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* A tint of the skill's own colour, so the tile reads as that skill
          before any text is processed. Kept faint — the colour is a landmark,
          not decoration. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity
                   duration-200 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ background: `radial-gradient(120% 100% at 0% 0%, ${color}14, transparent 60%)` }}
      />

      <div className="flex items-start gap-3">
        <SkillMark
          skill={skill}
          className="size-10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">{skill.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {skill.title || "No title yet"}
          </p>
        </div>
      </div>

      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {skill.description || "No description."}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-[11px]">
        <StatusBadge tone={skill.source === "github" ? "info" : "neutral"}>
          {skill.source}
        </StatusBadge>
        {!skill.enabled && <StatusBadge tone="warning">disabled</StatusBadge>}
        <span className="ms-auto text-muted-foreground">
          {skill.agents} {skill.agents === 1 ? "agent" : "agents"}
        </span>
      </div>
    </Link>
  );
};
SkillCard.displayName = "SkillCard";
