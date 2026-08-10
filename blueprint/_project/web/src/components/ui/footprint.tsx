import type { ReactNode } from "react";
import { cn } from "@togo-framework/ui";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  LoaderCircle,
} from "lucide-react";
import { TokenCost } from "./token-cost";

/**
 * footprint — show what the agent actually did.
 *
 * The trust problem this product has is specific: agents work while nobody is
 * looking. They claim an issue, open a terminal, edit files, spend money, write
 * to a shared brain and push a branch — and the operator arrives afterwards and
 * has to decide whether to believe it. A summary ("done") is not evidence. The
 * footprint is: one line per action, with the artefacts it touched and what it
 * cost, in the order it happened.
 *
 * The app already builds this by hand on the agent's Runs tab. That version is
 * fine and this is its canonical form, so the same shape can appear on an
 * issue, a skill, a chat answer and a deploy without being redesigned each time.
 *
 * Two rules the shape enforces:
 *
 *   1. Outcome is a SHAPE, not a colour. Six different glyphs, so the list is
 *      readable in monochrome, at a glance, and by an operator who cannot
 *      distinguish the green from the amber. Colour is the second layer.
 *   2. The metadata line is facts with wide gaps and no separators. Dots and
 *      pipes between six values at 11px are more ink than information.
 */

type FootprintStatus =
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "blocked"
  | "pending";

const STATUS_GLYPH = {
  running: LoaderCircle,
  done: CircleCheck,
  failed: CircleX,
  skipped: CircleMinus,
  blocked: CircleAlert,
  pending: CircleDashed,
} as const;

const STATUS_TONE: Record<FootprintStatus, string> = {
  running: "text-info",
  done: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  blocked: "text-warning",
  pending: "text-muted-foreground",
};

/** English/Arabic pairs for the screen-reader label. The status must be
 *  announced — a glyph with no accessible name is a decoration to a reader. */
const STATUS_LABEL: Record<FootprintStatus, [string, string]> = {
  running: ["Running", "قيد التنفيذ"],
  done: ["Succeeded", "نجحت"],
  failed: ["Failed", "فشلت"],
  skipped: ["Skipped", "تم تخطيها"],
  blocked: ["Blocked", "محجوبة"],
  pending: ["Pending", "بالانتظار"],
};

/**
 * The outcome glyph. Exported on its own because a run's status also has to
 * appear in places that are not a footprint list — a header, a tab, a chip.
 */
const FootprintGlyph = ({
  status,
  arabic = false,
  className,
}: {
  status: FootprintStatus;
  /** Picks the Arabic accessible name. */
  arabic?: boolean;
  className?: string;
}) => {
  const Icon = STATUS_GLYPH[status];
  return (
    <Icon
      role="img"
      aria-label={STATUS_LABEL[status][arabic ? 1 : 0]}
      className={cn(
        "size-4 shrink-0",
        STATUS_TONE[status],
        status === "running" && "animate-spin motion-reduce:animate-none",
        className,
      )}
    />
  );
};
FootprintGlyph.displayName = "FootprintGlyph";

/**
 * The container. Hairline dividers and no outer border by default, so it drops
 * into a tab panel or a card without producing a box inside a box; pass
 * `bordered` when it stands alone on the page.
 */
const Footprint = ({
  bordered = false,
  className,
  children,
}: {
  bordered?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <ol
    className={cn(
      "flex min-w-0 list-none flex-col divide-y divide-border",
      bordered && "overflow-hidden rounded-card border border-border bg-card",
      className,
    )}
  >
    {children}
  </ol>
);
Footprint.displayName = "Footprint";

/**
 * One action.
 *
 * `title` is what the agent did, in a sentence. `artefacts` is what it left
 * behind — the files, the branch, the terminal, the memory it wrote. Those are
 * the checkable claims, which is why they sit on their own line in mono rather
 * than being folded into prose.
 *
 * `costUsd` renders through TokenCost so the money on a footprint row is
 * formatted identically to the money everywhere else in the product.
 */
const FootprintRow = ({
  status,
  title,
  actor,
  lead,
  artefacts,
  costUsd,
  tokens,
  time,
  trailing,
  arabic = false,
  className,
  children,
}: {
  status: FootprintStatus;
  /** What happened, in one line. */
  title: ReactNode;
  /** Who did it — an agent handle, a model name. Rendered LTR + mono. */
  actor?: string;
  /** A leading badge in front of the title (an issue number, a step index). */
  lead?: ReactNode;
  /** The checkable artefacts: files touched, branch, terminal, memory key. */
  artefacts?: ReactNode;
  costUsd?: number;
  tokens?: number;
  /** Pre-resolved relative time ("3m ago"). Placed at the inline end. */
  time?: string;
  /** Actions on the row (open the diff, retry, view the log). */
  trailing?: ReactNode;
  /** Picks the Arabic accessible names for the status glyph. */
  arabic?: boolean;
  className?: string;
  /** Expanded detail — a diff, a log tail, the reasoning. */
  children?: ReactNode;
}) => (
  <li className={cn("motion-hover min-w-0 hover:bg-muted/40", className)}>
    <div className="flex items-start gap-3 px-3 py-2.5">
      <span className="flex shrink-0 items-center pt-0.5">
        <FootprintGlyph status={status} arabic={arabic} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {lead}
          <span className="min-w-0">{title}</span>
        </div>

        {(actor || artefacts || costUsd !== undefined) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {actor && (
              <span dir="ltr" className="font-mono">
                {actor}
              </span>
            )}
            {artefacts}
            {costUsd !== undefined && costUsd > 0 && (
              <TokenCost usd={costUsd} tokens={tokens} size="sm" />
            )}
          </div>
        )}

        {children}
      </div>

      {(time || trailing) && (
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {time && <span className="text-xs text-muted-foreground">{time}</span>}
          {trailing}
        </div>
      )}
    </div>
  </li>
);
FootprintRow.displayName = "FootprintRow";

/**
 * A single checkable artefact inside `artefacts` — a path, a branch, a diffstat.
 * Mono and LTR because every one of these is a machine name, and a machine name
 * inside an Arabic sentence still reads left to right.
 */
const FootprintArtefact = ({
  icon,
  title,
  className,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}) => (
  <span
    title={title}
    dir="ltr"
    className={cn(
      "inline-flex max-w-full items-center gap-1 truncate font-mono [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:opacity-70",
      className,
    )}
  >
    {icon}
    {children}
  </span>
);
FootprintArtefact.displayName = "FootprintArtefact";

export {
  Footprint,
  FootprintArtefact,
  FootprintGlyph,
  FootprintRow,
  type FootprintStatus,
};
