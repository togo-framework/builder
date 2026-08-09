import type { ReactNode } from "react";
import { Label, Skeleton, cn } from "@togo-framework/ui";
import { CircleAlert } from "lucide-react";

/**
 * page-shell — the layout primitives every builder screen is assembled from.
 *
 * Ten pages each inventing their own container, stat strip, row layout and
 * form spacing is what made the product read as ten side projects. These
 * primitives fix the decisions once — width, rhythm, grouping, the shape of a
 * row, the shape of a form field — so a page is only ever its content.
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
/* Stat row                                                            */
/* ------------------------------------------------------------------ */

/**
 * The stat strip under the page header. One grid, one gap, so four StatCards
 * read as a single instrument panel instead of four floating tiles. `cols={3}`
 * exists because a 3-stat page in a 2+4 responsive grid wraps into 2-then-1,
 * which reads as a mistake.
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
      "grid gap-3",
      cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
      className,
    )}
  >
    {children}
  </div>
);
StatRow.displayName = "StatRow";

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

/**
 * A titled region of a page. The heading and its content share a tight gap
 * inside one <section>, while PageShell's larger gap separates sections —
 * proximity is what groups them. Without this, a page with four stats and a
 * list reads as eight unrelated blocks, which is exactly the complaint.
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
/* List rows                                                           */
/* ------------------------------------------------------------------ */

/**
 * The one row layout: leading mark, body, trailing actions, optional expanded
 * footer. Rows across sources, docs, vault and tokens previously each chose
 * their own padding and alignment, so the same information sat at different
 * x-positions on every page and nothing could be scanned by column.
 *
 * `danger` moves the failure signal to the border — an operator scrolling a
 * long list finds the broken row before reading any text.
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
      "rounded-lg border bg-card transition-colors",
      danger ? "border-destructive/50" : "border-border",
      className,
    )}
  >
    <div className="flex items-start gap-3 p-3">
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

/** The small mono chip (kind, area, namespace). One shape everywhere, so a
 *  chip is recognised as "a machine name" before it is read. */
const MonoBadge = ({ className, children }: { className?: string; children: ReactNode }) => (
  <span className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-xs", className)}>
    {children}
  </span>
);
MonoBadge.displayName = "MonoBadge";

/* ------------------------------------------------------------------ */
/* Loading skeletons                                                   */
/* ------------------------------------------------------------------ */

/**
 * List loading state, shaped like the rows it will become so nothing jumps
 * when data lands. Bare "Loading…" text is what made these pages feel like a
 * side project — a skeleton says the page knows what it is about to show.
 */
const ListSkeleton = ({ rows = 3, className }: { rows?: number; className?: string }) => (
  <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2 py-0.5">
          <Skeleton className="h-4 w-1/3" />
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
  Section,
  StatRow,
};
