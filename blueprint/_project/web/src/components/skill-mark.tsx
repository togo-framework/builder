import * as Icons from "lucide-react";
import { Sparkles } from "lucide-react";
import { skillColor, type Skill } from "../lib/skills";

/**
 * Resolve a lucide icon by kebab-case name.
 *
 * Skills store an icon name rather than markup, so the catalogue can render a
 * real component and fall back cleanly when the name is unknown — a stored
 * string that turned out to be nonsense should show a default icon, never a
 * blank space or a crash.
 */
export function iconFor(name: string) {
  if (!name) return null;
  const pascal = name
    .split("-")
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
  const C = (Icons as unknown as Record<string, unknown>)[pascal];
  return typeof C === "function" ? (C as typeof Sparkles) : null;
}

/**
 * A skill's icon in its own colour.
 *
 * Shared by the catalogue tile, the skill page, and the chips on an agent, so
 * the same skill is recognised by the same mark wherever it appears — which is
 * the entire value of giving it one.
 */
export const SkillMark = ({
  skill,
  className = "size-10",
}: {
  skill: Pick<Skill, "name" | "color" | "icon">;
  className?: string;
}) => {
  const color = skillColor(skill);
  const Icon = iconFor(skill.icon) ?? Sparkles;
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg ${className}`}
      style={{ background: `${color}22`, color }}
    >
      <Icon className="size-[55%]" />
    </span>
  );
};
SkillMark.displayName = "SkillMark";
