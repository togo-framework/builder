import type { ReactNode } from "react";
import { cn } from "@togo-framework/ui";

/**
 * empty-state — the blank screen, treated as a first-class one.
 *
 * An empty state in an AI product is not "no data". It is the moment the
 * operator has to decide what to ask a system that can do almost anything, and
 * a blank rectangle answers none of that. The pattern this adds over a plain
 * "nothing here" is the wayfinder: two or three concrete starting points the
 * operator can press instead of inventing one.
 *
 * Props are a superset of the kit's EmptyState (title, description, icon,
 * action, className) so a route migrates by changing only the import path.
 * What is added:
 *
 *   suggestions      the wayfinder — sample prompts / templates / first steps
 *   secondaryAction  the escape hatch (docs, "why is this empty")
 *   size             "sm" for an empty tab panel, "default" for an empty page
 *   variant          "empty" (dashed, invitational) vs "filtered" (solid, a
 *                    dead end the operator created and can undo)
 *
 * `variant` matters more than it looks. "No agents yet" and "no agents match
 * 'xyz'" are opposite situations — one wants a call to action, the other wants
 * the filter cleared — and rendering both as the same dashed invitation is how
 * a search with a typo starts looking like a broken product.
 */

const SIZE = {
  sm: { box: "px-4 py-8", icon: "size-8", title: "text-sm", desc: "text-xs" },
  default: { box: "px-6 py-12", icon: "size-10", title: "text-base", desc: "text-sm" },
} as const;

type Suggestion = {
  /** Pre-resolved label (the caller picks EN/AR). */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Tooltip — what pressing this will actually do. */
  title?: string;
};

const EmptyState = ({
  title,
  description,
  icon,
  action,
  secondaryAction,
  suggestions,
  suggestionsLabel,
  size = "default",
  variant = "empty",
  className,
}: {
  /** Pre-resolved title (the caller picks EN/AR). */
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Wayfinders: concrete first moves, not advice. */
  suggestions?: Suggestion[];
  /** Pre-resolved caption above the suggestions ("Try one of these"). */
  suggestionsLabel?: string;
  size?: keyof typeof SIZE;
  variant?: "empty" | "filtered";
  className?: string;
}) => {
  const s = SIZE[size];

  return (
    <div
      className={cn(
        "motion-fade flex flex-col items-center justify-center rounded-card text-center",
        s.box,
        variant === "empty"
          ? "border border-dashed border-border bg-card/40"
          : "border border-border bg-muted/30",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "mb-3 flex items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5",
            s.icon,
          )}
        >
          {icon}
        </div>
      ) : null}

      <p className={cn("font-semibold text-foreground", s.title)}>{title}</p>

      {description ? (
        <p className={cn("mt-1 max-w-[52ch] text-muted-foreground", s.desc)}>{description}</p>
      ) : null}

      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="mt-5 flex w-full max-w-lg flex-col items-center gap-2">
          {suggestionsLabel && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {suggestionsLabel}
            </span>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {suggestions.map((sg) => (
              <button
                key={sg.label}
                type="button"
                onClick={sg.onSelect}
                title={sg.title}
                className={cn(
                  "motion-hover motion-press inline-flex max-w-full items-center gap-1.5",
                  "rounded-pill border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground",
                  "hover:border-primary/40 hover:text-foreground",
                  "[&>svg]:size-3.5 [&>svg]:shrink-0",
                )}
              >
                {sg.icon}
                <span className="truncate">{sg.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
EmptyState.displayName = "EmptyState";

export { EmptyState, type Suggestion };
