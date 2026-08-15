import type { ReactNode } from "react";
import { Label, cn } from "@togo-framework/ui";
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

/**
 * THE RAIL.
 *
 * Every page shares one gutter and one rail, and the content column inside the
 * rail is anchored to the START edge. That single decision is what fixes the
 * complaint that "internal pages don't have a correct layout":
 *
 * Before, a narrow page CENTRED its own column. On a 1440px screen that put the
 * Vault's title 120px further inline than the Agents' title — (1136 - 896) / 2,
 * the centring offset of a max-w-4xl column in the content area — so walking
 * between two screens made the page heading physically jump sideways. Nothing
 * else about either page was wrong; the jump alone is what read as "unfinished".
 *
 * Measured after this change: the h1 of /agents, /skills, /mcp, /vault, /brain,
 * /sources, /issues, /terminal and /chat all begin 288px from the inline-start
 * edge, in English and in Arabic.
 *
 * Now `width` no longer moves the page; it only decides how wide the column
 * inside it is allowed to grow:
 *
 *   narrow   960px measure for forms and reading columns (vault, mcp, chat)
 *   default  fills the rail — catalogues, lists, dashboards
 *   wide     fills the rail AND removes the rail cap, for surfaces that manage
 *            their own horizontal space (the board, the terminal)
 *
 * The rail itself (--page-rail, 1408px) is a no-op on a laptop and only starts
 * doing work on an ultrawide, where it stops a list of cards from stretching
 * into an unreadable 2000px line.
 */
const MEASURE = {
  narrow: "measure-narrow",
  default: "",
  wide: "",
} as const;

/**
 * One container for every page: same gutter, same rail, same page-level gap so
 * vertical rhythm is a property of the shell rather than a per-block `mt-4`
 * that every page tunes differently.
 *
 * `fill` is for screens with an internal scroller (board, chat, terminal):
 * they must claim the full column height or their flex-1 children resolve
 * against nothing and the inner scroll never engages. The flex/min-h-0 chain
 * is carried through all three nested elements for exactly that reason.
 *
 * `title` is optional. Pages that already render their own <PageHeader> as the
 * first child keep working untouched; pages that pass `title` get the shared
 * header rhythm for free and can never drift from it.
 */
const PageShell = ({
  width = "default",
  fill = false,
  title,
  description,
  icon,
  actions,
  above,
  className,
  children,
}: {
  width?: keyof typeof MEASURE;
  fill?: boolean;
  /** Renders the shared page header. Omit to supply your own header as a child. */
  title?: string;
  description?: string;
  icon?: ReactNode;
  /** Trailing controls on the title line (search, primary action). */
  actions?: ReactNode;
  /** A back link / breadcrumb above the title. */
  above?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      // A page's gutter is sized for a browser viewport. Inside a window it is
      // just wasted width — the window's own padding is the margin now.
      inAppWindow() ? "w-full min-w-0 px-4 py-3" : "page-gutter w-full min-w-0",
      fill && "flex h-full flex-col",
    )}
  >
    {/* The rail. mx-auto only bites past 1408px, so on every normal screen the
        page starts exactly at the gutter — the same x on every route. */}
    <div
      className={cn(
        "mx-auto w-full min-w-0",
        width !== "wide" && "page-rail",
        fill && "flex min-h-0 flex-1 flex-col",
      )}
    >
      {/* The measure. me-auto (not mx-auto) is deliberate: a centred column has
          no start edge, which is exactly what made the heading move between
          pages, and it also reads identically in LTR and RTL — losing the
          directional anchor that Arabic layout depends on. */}
      <div
        className={cn(
          "flex w-full min-w-0 flex-col",
          inAppWindow() ? "gap-4" : "gap-6",
          MEASURE[width],
          fill && "min-h-0 flex-1",
          className,
        )}
      >
        {title !== undefined && (
          <PageTitle
            title={title}
            description={description}
            icon={icon}
            actions={actions}
            above={above}
          />
        )}
        {children}
      </div>
    </div>
  </div>
);
PageShell.displayName = "PageShell";

/**
 * The page header, in the shape every screen should use.
 *
 * Type matches the kit's PageHeader exactly (text-2xl, icon at size-5, muted
 * description) so a page that still imports the kit's version is visually
 * indistinguishable from one using the shell's — during a migration the two
 * must not be tellable apart, or the migration itself becomes the inconsistency.
 *
 * `items-start` rather than the kit's `items-center`: when the description wraps
 * to two lines, centring drags the action buttons half a line down and the
 * whole header looks untethered.
 */
/**
 * Is this screen open inside a FeedbackOS app window?
 *
 * A window already states which app it is, in its title bar, a centimetre
 * above. Repeating that as a 24px heading with an explanatory paragraph is
 * what makes a framed screen read as a web page someone put in a box rather
 * than as an app — the working surface starts a third of the way down, and
 * the one line naming it is the line you least need, because you just clicked
 * the tile that says it.
 */
const inAppWindow = () => typeof window !== "undefined" && window.self !== window.top;

const PageTitle = ({
  title,
  description,
  icon,
  actions,
  above,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  className?: string;
}) =>
  inAppWindow() ? (
    // App mode: the controls, and nothing else. `actions` are the screen's real
    // toolbar — search, filters, the primary action — so they survive; the
    // heading and the description do not. Rendered only when there is something
    // to render, or an actionless screen would open with an empty strip.
    actions ? (
      <header className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
        {actions}
      </header>
    ) : null
  ) : (
  <header className={cn("flex min-w-0 flex-col gap-2", className)}>
    {above}
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          {icon ? (
            <span className="text-muted-foreground [&>svg]:size-5" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  </header>
  );
PageTitle.displayName = "PageTitle";

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
      "grid gap-px overflow-hidden rounded-card border border-border bg-border",
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
        "numeric truncate text-lg font-semibold leading-tight",
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
  <section className={cn("flex min-w-0 flex-col gap-2.5", className)}>
    <div className="flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {count !== undefined && (
        <span className="numeric rounded-pill bg-muted px-1.5 text-[11px] text-muted-foreground">
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
      "divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
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
 *
 * `motion-hover` (not `transition-all`) is the shell's named hover response:
 * colour and border only, at --duration-fast. A row that also MOVES under the
 * cursor makes a long list feel unstable to read.
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
      "motion-hover border-s-2",
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
  <span
    className={cn("rounded-field bg-muted px-1.5 py-0.5 font-mono text-xs", className)}
  >
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
 * The loading block.
 *
 * A sweeping highlight, not a pulse. A pulsing rectangle says "something is
 * here"; a sweep says "something is ARRIVING", and direction is the only cue
 * that distinguishes a placeholder from a disabled control. The sweep and its
 * timing live in the token layer (.skeleton-shimmer) so a reduced-motion
 * preference kills it in one place for the whole app.
 */
const Shimmer = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn("skeleton-shimmer rounded-field", className)} />
);
Shimmer.displayName = "Shimmer";

/**
 * List loading state, shaped like the grouped list it will become — one card,
 * hairline dividers — so nothing jumps or re-borders when data lands.
 */
const ListSkeleton = ({ rows = 3, className }: { rows?: number; className?: string }) => (
  <div
    className={cn(
      "divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
      className,
    )}
    aria-hidden="true"
  >
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 px-3 py-3">
        <Shimmer className="size-8 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2 py-0.5">
          <Shimmer className="h-3.5 w-1/3" />
          <Shimmer className="h-3 w-2/3" />
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
      <div key={i} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Shimmer className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-2/5" />
            <Shimmer className="h-3 w-3/5" />
          </div>
        </div>
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-4/5" />
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
      "grid gap-px overflow-hidden rounded-card border border-border bg-border",
      cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
    )}
  >
    {Array.from({ length: cols }).map((_, i) => (
      <div key={i} className="flex flex-col gap-1.5 bg-card px-3 py-2.5">
        <Shimmer className="h-2.5 w-14" />
        <Shimmer className="h-5 w-8" />
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
 * the record". It arrives with the shell's entrance motion for the same
 * reason: a block that appears with no transition reads as a page reload.
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
  <section
    className={cn(
      "motion-entrance rounded-card border border-border bg-card p-4 shadow-xs",
      className,
    )}
  >
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="motion-hover rounded-field px-1 text-xs text-muted-foreground hover:text-foreground"
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
  <div
    className={cn(
      "mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3",
      className,
    )}
  >
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
      "motion-hover motion-press inline-flex max-w-full items-center gap-1 rounded-pill border px-3 py-1 text-xs",
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
  PageTitle,
  Row,
  RowMeta,
  RowTitle,
  Rows,
  Section,
  Shimmer,
  Stat,
  StatRow,
  StatSkeleton,
};


/**
 * An app-aware drop-in for the kit's `PageHeader`.
 *
 * Same props, same look on a full page — and nothing but the actions when the
 * screen is open inside a FeedbackOS app window. Seven screens render their own
 * header rather than passing `title` to PageShell, so making PageShell alone
 * app-aware left exactly the screens the operator looks at most still wearing a
 * 24px heading that duplicates the window's title bar.
 *
 * Exported from here rather than patched into the kit because the kit is a
 * dependency shared with every togo app, and "is this inside our window shell"
 * is not a question the kit should have an opinion about.
 */
export const AppPageHeader = ({
  title,
  description,
  icon,
  actions,
  above,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  above?: ReactNode;
  className?: string;
}) => (
  <PageTitle
    title={title}
    description={description}
    icon={icon}
    actions={actions}
    above={above}
    className={className}
  />
);
AppPageHeader.displayName = "AppPageHeader";
