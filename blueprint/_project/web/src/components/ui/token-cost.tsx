import type { ReactNode } from "react";
import { cn, useT } from "@togo-framework/ui";
import { Coins, Cpu, TriangleAlert } from "lucide-react";

/**
 * token-cost — spend transparency.
 *
 * This product runs models on the operator's money without being watched. The
 * one thing it therefore owes them, everywhere and identically, is an honest
 * readout of what a run cost and how much of the ceiling is gone.
 *
 * Before this file the app formatted money in four different places and four
 * different ways: `$${usd.toFixed(4)}` on the agent's run list, a bespoke
 * `fmtCost` in the fleet progress bar, `.toFixed(2)` in the skill rewriter,
 * `.toFixed(4)` again in setup. Four formats for one fact means the operator
 * cannot compare two numbers without first working out which one is lying
 * about its precision.
 *
 * Two shapes, and they answer different questions:
 *
 *   TokenCost    "what did this cost?"      — an inline fact on a row
 *   BudgetMeter  "how much is left?"        — a governor, with an alarm
 *
 * Direction: a currency figure is LTR content even on an Arabic page. `$` is a
 * prefix in both languages and `dir="ltr"` is what stops the bidi algorithm
 * from moving it to the wrong end of the number.
 */

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * The single money format for the whole app.
 *
 * Precision follows magnitude, because the two questions are different: at
 * $12.40 nobody cares about the hundredth of a cent, and at $0.0042 the
 * hundredths are the entire number. A run that cost something must never
 * render as "$0.00" — that reads as free, and "free" is the one thing an
 * autonomous agent's work is not.
 */
const formatUsd = (usd: number): string => {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1000) return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

/** Token counts are scanned, not audited — 1.2M reads faster than 1,234,567. */
const formatTokens = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

/* ------------------------------------------------------------------ */
/* TokenCost                                                           */
/* ------------------------------------------------------------------ */

const COST_SIZE = {
  sm: "text-[11px] gap-1 [&>svg]:size-3",
  default: "text-xs gap-1.5 [&>svg]:size-3.5",
} as const;

/**
 * The inline spend readout. Quiet by default — a cost is a fact about a row,
 * not the row's headline — and it only raises its voice through `tone`, which
 * the caller sets when the number has become the point.
 *
 * The icon is not decoration: in a metadata line of five muted values at 11px,
 * the coin is what lets the eye find the money without reading the line.
 */
const TokenCost = ({
  usd,
  tokens,
  size = "default",
  showIcon = true,
  tone = "muted",
  label,
  className,
}: {
  /** Spend in USD. */
  usd: number;
  /** Optional token count shown beside the money. */
  tokens?: number;
  size?: keyof typeof COST_SIZE;
  showIcon?: boolean;
  tone?: "muted" | "default" | "warning" | "danger";
  /** Tooltip text — say what the number covers ("spend on this run"). */
  label?: string;
  className?: string;
}) => {
  const { language } = useT();
  const ar = language === "ar";
  const title = label ?? (ar ? "التكلفة" : "Cost");

  return (
    <span
      title={title}
      className={cn(
        "numeric inline-flex shrink-0 items-center",
        COST_SIZE[size],
        tone === "muted" && "text-muted-foreground",
        tone === "default" && "text-foreground",
        tone === "warning" && "text-warning",
        tone === "danger" && "text-destructive",
        className,
      )}
    >
      {showIcon && <Coins aria-hidden="true" />}
      <span dir="ltr">{formatUsd(usd)}</span>
      {tokens !== undefined && tokens > 0 && (
        <>
          <Cpu aria-hidden="true" className="ms-1 opacity-70" />
          <span dir="ltr" className="opacity-80">
            {formatTokens(tokens)}
          </span>
        </>
      )}
    </span>
  );
};
TokenCost.displayName = "TokenCost";

/* ------------------------------------------------------------------ */
/* BudgetMeter                                                         */
/* ------------------------------------------------------------------ */

/**
 * A governor, not a gauge.
 *
 * The escalation is deliberate and has three steps, because a bar that stays
 * one colour until it is full gives the operator no moment to intervene:
 *
 *   under 70%   muted    — information
 *   70 – 90%    warning  — "decide now whether to let this finish"
 *   over 90%    danger   — "this is about to stop, or about to overrun"
 *
 * Over budget is a state of its own, not a clipped bar: the fill stays at 100%
 * (a bar cannot honestly overflow) and the overrun is stated in words, because
 * "how far over" is the only question worth answering at that point.
 */
const BudgetMeter = ({
  spentUsd,
  budgetUsd,
  label,
  hint,
  className,
}: {
  spentUsd: number;
  /** The ceiling. Omit or pass 0 and the meter renders as a plain readout. */
  budgetUsd?: number;
  /** Pre-resolved caption. Defaults to "Spend" / "الإنفاق". */
  label?: string;
  /** Pre-resolved supporting line under the bar. */
  hint?: ReactNode;
  className?: string;
}) => {
  const { language } = useT();
  const ar = language === "ar";

  const hasCeiling = Number.isFinite(budgetUsd) && (budgetUsd ?? 0) > 0;
  const ratio = hasCeiling ? spentUsd / (budgetUsd as number) : 0;
  const pct = Math.max(0, Math.min(1, ratio));
  const over = hasCeiling && ratio > 1;

  const tone = !hasCeiling || ratio < 0.7 ? "muted" : ratio < 0.9 ? "warning" : "danger";

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label ?? (ar ? "الإنفاق" : "Spend")}
        </span>
        <span className="numeric ms-auto flex items-center gap-1.5 text-xs">
          <span
            dir="ltr"
            className={cn(
              "font-semibold",
              tone === "muted" && "text-foreground",
              tone === "warning" && "text-warning",
              tone === "danger" && "text-destructive",
            )}
          >
            {formatUsd(spentUsd)}
          </span>
          {hasCeiling && (
            <span dir="ltr" className="text-muted-foreground">
              / {formatUsd(budgetUsd as number)}
            </span>
          )}
        </span>
      </div>

      {hasCeiling && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(budgetUsd as number)}
          aria-valuenow={Number(spentUsd.toFixed(2))}
          aria-label={label ?? (ar ? "الإنفاق مقابل السقف" : "Spend against ceiling")}
          className="h-1.5 w-full overflow-hidden rounded-pill bg-muted"
        >
          {/* Width, not transform: a transform-scaled fill blurs its own end cap
              at sub-pixel widths, and this bar is 6px tall. */}
          <div
            className={cn(
              "h-full rounded-pill transition-[width] duration-(--duration-slow) ease-(--ease-standard)",
              tone === "muted" && "bg-muted-foreground/60",
              tone === "warning" && "bg-warning",
              tone === "danger" && "bg-destructive",
            )}
            style={{ width: `${(pct * 100).toFixed(2)}%` }}
          />
        </div>
      )}

      {over ? (
        <p className="flex items-start gap-1 text-[11px] text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-px size-3 shrink-0" />
          {/* <bdi> is load-bearing, not decoration. "$2.40" dropped into an
              Arabic sentence is a neutral-then-number run inside an RTL
              paragraph: the bidi algorithm moves the dollar sign to the wrong
              end and the operator reads "2.40$". The isolate is what keeps a
              currency figure intact in both languages. */}
          <span>
            {ar ? "تجاوز السقف بمقدار " : "Over the ceiling by "}
            <bdi dir="ltr">{formatUsd(spentUsd - (budgetUsd as number))}</bdi>
          </span>
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
};
BudgetMeter.displayName = "BudgetMeter";

export { BudgetMeter, TokenCost, formatTokens, formatUsd };
