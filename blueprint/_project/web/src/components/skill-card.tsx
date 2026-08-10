import { Link } from "@tanstack/react-router";
import { Button } from "@togo-framework/ui";
import { Folder, FolderX, Github, HardDrive, PenLine, Users } from "lucide-react";
import type { Skill } from "../lib/skills";
import { SkillMark } from "./skill-mark";
import { useStrings } from "../lib/i18n";

/** The provenance glyph: where this skill's file came from. */
const SOURCE_GLYPH = {
  local: HardDrive,
  github: Github,
  operator: PenLine,
} as const;

/**
 * A skill as a STORE card, in the reference's shape:
 *
 *   [coloured tile] [Bold Title] ................. [Enable / Disable]
 *   machine name, small and mono
 *   description, one or two lines, muted
 *   [glyph] source   [glyph] 3 agents   [dot] Disabled   [glyph] path
 *
 * Three decisions carry the layout:
 *
 *   1. The primary action is a BUTTON on the card, pinned to the trailing edge
 *      and vertically centred on the title. A switch used to sit here; a switch
 *      is a settings control, and in a catalogue the operator is choosing
 *      whether to take a thing, not adjusting a preference. The button also
 *      states what pressing it DOES, which a knob never can.
 *   2. Because the button now says "Enable" on a disabled card — the inverse of
 *      the current state — the state itself is carried by a coloured dot in the
 *      meta row plus the greyed tile. Never a coloured word: the dot survives a
 *      monochrome screenshot and colour blindness, the word would not.
 *   3. Meta items appear only when they are true. A skill nobody holds simply
 *      omits the agents item rather than printing "0 agents", which is noise
 *      dressed as information.
 */
export const SkillCard = ({
  skill, onToggle,
}: {
  skill: Skill;
  onToggle: (name: string, enabled: boolean) => void;
}) => {
  const { S } = useStrings();
  const off = !skill.enabled;
  const SourceGlyph = SOURCE_GLYPH[skill.source] ?? HardDrive;
  const sourceWord =
    skill.source === "github"
      ? S.skills.sourceGithub
      : skill.source === "operator"
        ? S.skills.sourceOperator
        : S.skills.sourceLocal;

  // A skill with no title is carried by its directory name, so the loud line
  // becomes machine text and is set in mono. With a title, the name drops to
  // the quiet line beneath — it is still the thing agents reference by, so it
  // is never dropped altogether.
  const named = Boolean(skill.title);

  const handleToggle = () => onToggle(skill.name, off);

  return (
    <div
      className="relative flex h-full w-full min-w-0 flex-col rounded-xl border border-border bg-card p-5
                 transition-colors hover:border-primary/50 hover:bg-muted/30
                 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary"
    >
      <div className="flex items-start gap-3">
        <SkillMark
          skill={skill}
          className={`size-10 ${off ? "opacity-40 grayscale" : ""}`}
        />

        <div className="min-w-0 flex-1">
          {/* Title and action share one line and are centred on each other, so
              the button lands at the same y on every card in the grid. */}
          <div className="flex items-center gap-3">
            <Link
              to="/skills/$name"
              params={{ name: skill.name }}
              // The stretched overlay: the whole card is the click target, the
              // link carries the semantics. The button is a sibling raised
              // above it, so pressing it is never also a navigation.
              className="min-w-0 flex-1 focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {/* <bdi> isolates a latin name inside an Arabic row without the
                  block-level dir="ltr" that would drag it off the reading edge. */}
              <span
                className={`block truncate text-sm font-semibold ${named ? "" : "font-mono"} ${
                  off ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                <bdi>{skill.title || skill.name}</bdi>
              </span>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              className="relative z-10 h-7 shrink-0 px-2.5 text-xs"
              aria-label={
                skill.enabled ? S.skills.disableAria(skill.name) : S.skills.enableAria(skill.name)
              }
            >
              {skill.enabled ? S.skills.disable : S.skills.enable}
            </Button>
          </div>

          {named && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              <bdi>{skill.name}</bdi>
            </p>
          )}
        </div>
      </div>

      {/* min-h-[2lh] reserves two lines even when the text is one, so the grid
          stays a grid and cards do not ragged-edge. */}
      {/* <bdi> around the description, not just the machine text. Skill bodies
          are authored in English while the UI may be Arabic; without the
          isolate the sentence's final full stop is a neutral that inherits the
          RTL paragraph and jumps to the far edge, so every card reads
          ".Triggered when an agent…". The isolate also leaves genuinely Arabic
          descriptions right-to-left, because bdi detects, it does not force. */}
      <p
        className={`mt-3 line-clamp-2 min-h-[2lh] text-xs leading-relaxed text-muted-foreground ${off ? "opacity-60" : ""}`}
      >
        <bdi>{skill.description || S.skills.noDescription}</bdi>
      </p>

      {/* The quiet row. No divider above it and no separators inside it —
          whitespace groups, and six glyphs plus five pipes is more ink than
          information at 11px. */}
      <div
        className={`mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-4
                    text-[11px] leading-4 text-muted-foreground ${off ? "opacity-70" : ""}`}
      >
        <span className="inline-flex items-center gap-1">
          <SourceGlyph className="size-3 shrink-0" />
          {sourceWord}
        </span>

        {skill.agents > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Users className="size-3 shrink-0" />
            {S.skills.agentsCount(skill.agents)}
          </span>
        )}

        {off && (
          <span className="inline-flex items-center gap-1 text-warning">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
            {S.skills.disabledMeta}
          </span>
        )}

        {skill.installedPath ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Folder className="size-3 shrink-0" />
            <bdi className="truncate font-mono">{skill.installedPath}</bdi>
          </span>
        ) : (
          // Shown rather than hidden: "never written to disk" is the one fact
          // that explains why an agent loaded nothing.
          <span className="inline-flex min-w-0 items-center gap-1">
            <FolderX className="size-3 shrink-0" />
            {S.skills.notInstalled}
          </span>
        )}
      </div>
    </div>
  );
};
SkillCard.displayName = "SkillCard";
