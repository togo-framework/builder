// Turning the shell's opaque regions into a clip-path.
//
// The shell reports the rectangles it is actually painting — windows, the dock,
// any open overlay — and the loader clips the frame to exactly those. Every
// pixel the shell is not using belongs to the host page and must remain
// clickable, scrollable, hoverable and selectable.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Build a clip-path from disjoint rectangles.
 *
 * Each rect is its own subpath, wound the same way. `path()` uses nonzero
 * winding by default, so identically-wound overlapping subpaths union rather
 * than punching holes in each other — which is what a window overlapping the
 * dock must do.
 *
 * Coordinates are rounded outward. A sub-pixel gap at a window's edge shows up
 * as a one-pixel dead stripe along the title bar, which is the kind of bug that
 * gets reported as "the window sometimes doesn't drag".
 */
export function clipFor(rects: Rect[]): string {
  if (!rects.length) return "path(\"M0 0 Z\")"; // paint nothing, capture nothing
  const parts = rects.map((r) => {
    const x0 = Math.floor(r.x);
    const y0 = Math.floor(r.y);
    const x1 = Math.ceil(r.x + r.w);
    const y1 = Math.ceil(r.y + r.h);
    return `M${x0} ${y0} H${x1} V${y1} H${x0} Z`;
  });
  return `path("${parts.join(" ")}")`;
}

/** Capture the entire viewport. Only ever transient — see watchdog.ts. */
export const CLIP_ALL = "none";

/** Capture nothing; the host page is fully interactive. */
export const CLIP_NONE = 'path("M0 0 Z")';

/**
 * Are two rect lists the same to the pixel?
 *
 * The shell reports on every rAF. Writing an identical clip-path back to the
 * style attribute 60 times a second is a layout invalidation per frame on a
 * page we do not own, so the loader only writes on change.
 */
export function sameRects(a: Rect[], b: Rect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h) return false;
  }
  return true;
}
