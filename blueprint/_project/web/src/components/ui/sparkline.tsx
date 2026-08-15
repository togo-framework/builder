/**
 * sparkline — a metric over time, in inline SVG.
 *
 * No charting library, and that is a decision rather than a shortcut. Adding
 * one is a permanent commitment to somebody else's release cadence and bundle
 * size, for two shapes this dashboard needs: a line over days, and a ranked
 * list of bars. Both are about forty lines of SVG. Recharts is ~90KB gzipped.
 *
 * Two properties the shape has to get right, because a chart that gets them
 * wrong is worse than a table:
 *
 *   1. A single point is not a line. One day of data drawn as a flat line
 *      implies a trend that has not been measured — it renders as a dot.
 *   2. A y-axis that does not include zero exaggerates every wiggle into a
 *      cliff. This one always includes zero, so the height of the fill means
 *      what a reader assumes it means.
 */
import { useId } from "react";

export interface SeriesPoint {
  day: string;
  value: number;
}

export function Sparkline({
  points,
  label,
  height = 64,
  className,
}: {
  points: SeriesPoint[];
  /** Announced to a screen reader, which cannot read the path. */
  label: string;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();

  if (points.length === 0) {
    return (
      <div
        className={`grid place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground ${className ?? ""}`}
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  // viewBox units, not pixels: the SVG scales to its container and the maths
  // stays in one coordinate space.
  const W = 100;
  const H = 32;
  const PAD = 2;

  // Always from zero — see the note above.
  const max = Math.max(...points.map((p) => p.value), 0);
  const span = max === 0 ? 1 : max;

  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / span) * (H - PAD * 2);

  if (points.length === 1) {
    const p = points[0];
    return (
      <svg
        role="img"
        aria-label={`${label}: ${p.value} on ${p.day}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={className}
        style={{ height, width: "100%" }}
      >
        <circle cx={W / 2} cy={y(p.value)} r="1.6" className="fill-brand" />
      </svg>
    );
  }

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg
      role="img"
      // The summary a sighted reader gets from the shape, in words.
      aria-label={`${label}: ${first.value} on ${first.day} to ${last.value} on ${last.day}, peak ${max}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height, width: "100%" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="[stop-color:var(--color-brand,#f97316)]" stopOpacity="0.28" />
          <stop offset="100%" className="[stop-color:var(--color-brand,#f97316)]" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        className="stroke-brand"
        strokeWidth="1.2"
        // Non-scaling, or preserveAspectRatio="none" stretches the stroke into
        // a wedge that is thick at one end.
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A ranked breakdown — "top pages", "top queries".
 *
 * Bars rather than a pie: these are almost always long-tailed, and a pie of
 * twenty slices is a colour-matching exercise. The bar is a background on the
 * row itself, so the label stays readable at any width.
 */
export function TopBars({
  rows,
  format,
  emptyLabel,
  /** Smaller is better — average search position, for instance. */
  ascending = false,
}: {
  rows: { dimension: string; value: number }[];
  format?: (v: number) => string;
  emptyLabel: string;
  ascending?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const fmt = format ?? ((v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        // For an ascending metric the BEST value is the smallest, so a bar
        // proportional to the value would draw the winner shortest. Inverted,
        // so "longer" always means "better" whichever way the metric runs.
        const pct = ascending ? (1 - r.value / max) * 100 : (r.value / max) * 100;
        return (
          <li
            key={r.dimension}
            className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1 text-xs"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 start-0 rounded-md bg-brand/12"
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
            {/* dir=ltr on the key: a URL path or a search query is not Arabic
                prose, and letting it mirror puts the leading slash on the
                wrong end. */}
            <bdi dir="ltr" className="relative truncate font-mono" title={r.dimension}>
              {r.dimension}
            </bdi>
            <span className="relative shrink-0 tabular-nums font-medium">{fmt(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
