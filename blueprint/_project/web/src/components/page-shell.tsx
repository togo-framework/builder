import type { ReactNode } from "react";
import { Label, Skeleton, cn } from "@togo-framework/ui";
import { CircleAlert } from "lucide-react";

/**
 * page-shell — the layout primitives every builder screen is assembled from.
 *
 * The reference is the SDK feedback panel (builder/sdk/src/styles.ts), the one
 * surface the operator has signed off. Its decisions are load-bearing here:
 *
 *   - Lists are ONE grouped card with hairline dividers, not a stack of
 *     individually bordered slabs. Slabs make every row shout at the same
 *     volume; a grouped list lets the content carry the hierarchy.
 *   - Types are a coloured dot + word. Filled pills are reserved for status,
 *     because ten tinted pills in a list is decoration, one dot per row is
 *     information.
 *   - Numbers are tabular, quiet, and grouped — an instrument strip, not four
 *     floating dashboard tiles.
 *   - Status colours come from the theme's semantic tokens (success, warning,
 *     info, destructive) so every theme preset retints them. A hardcoded
 *     emerald stays emerald under a rose theme, which is how a page stops
 *     belonging to the product.
 *
 * Everything here is presentation. Nothing fetches, nothing owns state.
 */

/* ------------------------------------------------------------------ */
/* Page container                                                      */
/* ------------------------------------------------------------------ */

const SHELL_WIDTH = {
  /** Reading surfaces (vault, mcp, chat) — a form 1152px wide is a hallway. */
  narrow: "max-w-4xl",
  /** The default for list/catalogue pages. */
  default: "max-w-6xl",
  /** Boards and terminals that manage their own horizontal space. */
  wide: "max-w-none",
} as const;

/**
 * One container for every page: same max-width scale, same padding, and one
 * page-level gap so vertical rhythm is a property of the shell rather than a
 * per-block `mt-4` that every page tunes differently.
 *
 * `fill` is for screens with an internal scroller (board, chat, terminal):
 * they must claim the full column height or their flex-1 children resolve
 * against nothing and the inner scroll never engages.
 */
const PageShell = ({
  width = "default",
  fill = false,
  className,
  children,
}: {
  width?: keyof typeof SHELL_WIDTH;
  fill?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "mx-auto flex w-full min-w-0 flex-col gap-5 p-4 sm:p-6",
      SHELL_WIDTH[width],
      fill && "h-full",
      className,
    )}
  >
    {children}
  </div>
);
PageShell.displayName = "PageShell";

/* ------------------------------------------------------------------ */
/* Stat strip                                                          */
/* ------------------------------------------------------------------ */

/**
 * The stat strip under the page header: ONE bordered card divided into cells
 * by hairlines, matching the panel's grouped-card language. The previous
 * four-floating-tiles version (each its own Card, hover shadow, 24px bold mono
 * value) is what made a page read as "eight unrelated blocks" — and a hover
 * elevation on a tile that does nothing when clicked is a promise the page
 * can't keep.
 *
 * gap-px over a bg-border container is the divider mechanism because it draws
 * correct hairlines on BOTH axes at any responsive wrap; divide-x/divide-y
 * cannot follow a 4-to-2-column reflow without lying on one edge.
 */
const StatRow = ({
  cols = 4,
  className,
  children,
}: {
  cols?: 3 | 4;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "grid gap-px overflow-hidden rounded-lg border border-border bg-border",
      cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      className,
    )}
  >
    {children}
  </div>
);
StatRow.displayName = "StatRow";

const STAT_TONE = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
} as const;

/**
 * One cell of the strip. The value is deliberately smaller and quieter than a
 * dashboard hero number — these are working counts an engineer scans, and at
 * four-across a row of 24px bold numerals competes with the page title.
 * Tabular numerals so 9→10 does not shift the column.
 */
const Stat = ({
  label,
  value,
  tone = "default",
  mono = false,
  className,
}: {
  label: string;
  value: string | number;
  tone?: keyof typeof STAT_TONE;
  /** For machine-name values (a namespace, a path) — the value only, so the
   *  label stays in the UI face beside its siblings. */
  mono?: boolean;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1 bg-card px-3 py-2.5", className)}>
    <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <span
      className={cn(
        "truncate text-lg font-semibold leading-tight tabular-nums",
        mono && "font-mono text-base",
        STAT_TONE[tone],
      )}
      title={String(value)}
    >
      {value}
    </span>
  </div>
);
Stat.displayName = "Stat";

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

/**
 * A titled region of a page. The heading style is the panel's `.label` — small
 * caps, wide tracking, muted — so a section reads as the same product as the
 * approved widget. The heading and its content share a tight gap inside one
 * <section>, while PageShell's larger gap separates sections; proximity is
 * what groups them.
 */
const Section = ({
  title,
  count,
  actions,
  className,
  children,
}: {
  title: string;
  /** Row count beside the title — the "is it worth scrolling" answer. */
  count?: number;
  /** Trailing controls (a filter, a small button), kept on the title line. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <section className={cn("flex min-w-0 flex-col gap-2", className)}>
    <div className="flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
    </div>
    {children}
  </section>
);
Section.displayName = "Section";

/* ------------------------------------------------------------------ */
/* Grouped list                                                        */
/* ------------------------------------------------------------------ */

/**
 * The list container: one card, hairline dividers, hover per row. This is the
 * panel's `.rows` verbatim — the decision the operator already approved.
 * Uniform bordered slabs (each row its own card, stacked with a gap) made
 * every row shout at the same volume; grouping lets the name, badges and meta
 * carry the hierarchy instead of the chrome.
 */
const Rows = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div
    className={cn(
      "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card",
      className,
    )}
  >
    {children}
  </div>
);
Rows.displayName = "Rows";

/**
 * One row inside `Rows`: leading mark, body, trailing actions, optional
 * expanded footer. No border of its own — the group draws the chrome.
 *
 * `danger` is a start-edge accent bar, not a red outline: inside a grouped
 * list an outline cannot exist, and the bar is positional — it survives
 * colourblindness and a monochrome screenshot because the broken row is
 * physically marked, not merely tinted. The transparent bar on healthy rows
 * keeps every row's content at the same x-position.
 */
const Row = ({
  leading,
  trailing,
  footer,
  danger = false,
  className,
  children,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <article
    className={cn(
      "border-s-2 transition-colors",
      danger
        ? "border-s-destructive bg-destructive/5"
        : "border-s-transparent hover:bg-muted/40",
      className,
    )}
  >
    <div className="flex items-start gap-3 px-3 py-2.5">
      {leading && <div className="flex shrink-0 items-center pt-0.5">{leading}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
    {footer}
  </article>
);
Row.displayName = "Row";

/** The first line of a Row: name + badges, wrapping instead of clipping. */
const RowTitle = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
);
RowTitle.displayName = "RowTitle";

/**
 * The metadata line of a Row. Wide gaps between facts, no separators — dots
 * and pipes between six values are more ink than information at this size.
 */
const RowMeta = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div
    className={cn(
      "mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
      className,
    )}
  >
    {children}
  </div>
);
RowMeta.displayName = "RowMeta";

/** The small mono chip for MACHINE names (kind, area, namespace) — one shape
 *  everywhere, so a chip is recognised as "a machine name" before it is read.
 *  Never used to carry status colour; that job belongs to DotLabel and
 *  StatusBadge. */
const MonoBadge = ({ className, children }: { className?: string; children: ReactNode }) => (
  <span className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-xs", className)}>
    {children}
  </span>
);
MonoBadge.displayName = "MonoBadge";

/* ------------------------------------------------------------------ */
/* Dot label                                                           */
/* ------------------------------------------------------------------ */

const DOT_TONE = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
} as const;

/**
 * A type as a coloured dot + word — the panel's `.chip`, and its reasoning:
 * ten tinted pills in a list is decoration, one dot per row is information.
 * The word does the work in monochrome; the dot is the glanceable layer on
 * top. Semantic tones only, so every theme preset retints it.
 */
const DotLabel = ({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: keyof typeof DOT_TONE;
  title?: string;
  className?: string;
  children: ReactNode;
}) => (
  <span
    title={title}
    className={cn(
      "inline-flex items-center gap-1.5 text-xs font-medium",
      DOT_TONE[tone],
      className,
    )}
  >
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
    {children}
  </span>
);
DotLabel.displayName = "DotLabel";

/* ------------------------------------------------------------------ */
/* Loading skeletons                                                   */
/* ------------------------------------------------------------------ */

/**
 * List loading state, shaped like the grouped list it will become — one card,
 * hairline dividers — so nothing jumps or re-borders when data lands.
 */
const ListSkeleton = ({ rows = 3, className }: { rows?: number; className?: string }) => (
  <div
    className={cn(
      "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card",
      className,
    )}
    aria-hidden="true"
  >
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 px-3 py-3">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2 py-0.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);
ListSkeleton.displayName = "ListSkeleton";

/** Card-grid loading state for the catalogue pages (agents, skills). */
const GridSkeleton = ({ count = 6, className }: { count?: number; className?: string }) => (
  <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", className)} aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    ))}
  </div>
);
GridSkeleton.displayName = "GridSkeleton";

/** Stat-strip loading state in the strip's own shape — cells, not free
 *  Skeleton tiles, so the hairline grid is already there when numbers land. */
const StatSkeleton = ({ cols = 4 }: { cols?: 3 | 4 }) => (
  <div
    aria-hidden="true"
    className={cn(
      "grid gap-px overflow-hidden rounded-lg border border-border bg-border",
      cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
    )}
  >
    {Array.from({ length: cols }).map((_, i) => (
      <div key={i} className="flex flex-col gap-1.5 bg-card px-3 py-2.5">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-5 w-8" />
      </div>
    ))}
  </div>
);
StatSkeleton.displayName = "StatSkeleton";

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

/**
 * One form field: label above the control, then EITHER an inline error or the
 * help text — never both, because the error replaces the advice the operator
 * has just proven they need. The error sits next to the field it concerns;
 * a validation summary at the top of a form makes the reader find the field
 * twice.
 */
const Field = ({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Explains what the value DOES — never restates the label. */
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {label}
      {required && (
        <span aria-hidden="true" className="text-destructive">
          {" "}
          *
        </span>
      )}
    </Label>
    {children}
    {error ? (
      <p role="alert" className="flex items-start gap-1 text-xs text-destructive">
        <CircleAlert className="mt-px size-3.5 shrink-0" />
        <span>{error}</span>
      </p>
    ) : hint ? (
      <p className="text-xs text-muted-foreground">{hint}</p>
    ) : null}
  </div>
);
Field.displayName = "Field";

/**
 * The container for an inline create/edit form: a card with a clear title and
 * a quiet dismiss. Forms live in a card because they are a temporary mode of
 * the page — the border is what says "this block is an activity, the rest is
 * the record".
 */
const FormCard = ({
  title,
  onClose,
  closeLabel = "Cancel",
  className,
  children,
}: {
  title: string;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}) => (
  <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:underline"
        >
          {closeLabel}
        </button>
      )}
    </div>
    {children}
  </section>
);
FormCard.displayName = "FormCard";

/**
 * The submit line: buttons, then the sentence that earns them. A disabled
 * primary with no adjacent reason reads as broken; the note is where "why
 * can't I press this" and "what happens when I do" are answered before the
 * question is asked.
 */
const FormFooter = ({
  note,
  className,
  children,
}: {
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn("mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3", className)}>
    {children}
    {note && <span className="min-w-0 text-xs text-muted-foreground">{note}</span>}
  </div>
);
FormFooter.displayName = "FormFooter";

/* ------------------------------------------------------------------ */
/* Filter chips                                                        */
/* ------------------------------------------------------------------ */

/**
 * A toggleable filter pill. Brain's source filters and chat's session pills
 * had each invented their own; a filter must look like a filter wherever it
 * appears, or the operator re-learns the control per page.
 */
const FilterChip = ({
  active = false,
  onClick,
  title,
  className,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={cn(
      "inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      className,
    )}
  >
    {children}
  </button>
);
FilterChip.displayName = "FilterChip";

export {
  DotLabel,
  Field,
  FilterChip,
  FormCard,
  FormFooter,
  GridSkeleton,
  ListSkeleton,
  MonoBadge,
  PageShell,
  Row,
  RowMeta,
  RowTitle,
  Rows,
  Section,
  Stat,
  StatRow,
  StatSkeleton,
};
