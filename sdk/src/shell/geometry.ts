// Where a window sits, and why that is not a server-side preference.
//
// Dock pins are an ACCOUNT preference: "these are my apps" is true wherever I
// sign in, and the os plugin already persists them in DesktopPrefs.
//
// Window geometry is a DEVICE preference. A layout tuned on a 27-inch monitor
// is wrong on a 13-inch laptop and absurd on a phone, so syncing rects across
// devices actively makes things worse — you would sign in on a small screen and
// find every window clamped into a corner, having "restored" a layout that
// never suited it. It is also high-frequency: a drag emits a rect on every
// pointermove, and sending that to a server is a write storm for data nobody
// reads on another machine.
//
// So geometry is local, keyed by viewport bucket, and the server never sees it.

import type { Rect } from "../loader/clip";

const KEY = "fos:geometry:v1";

/**
 * Viewport bucket.
 *
 * Geometry is stored per bucket rather than per exact size, so resizing a
 * browser window by ten pixels does not orphan the layout — but moving between
 * a laptop and an external monitor does get its own. The buckets are coarse
 * because the goal is "does this layout still make sense here", not fidelity.
 */
function bucket(w = window.innerWidth, h = window.innerHeight): string {
  const wb = w < 700 ? "s" : w < 1200 ? "m" : w < 1800 ? "l" : "xl";
  const hb = h < 700 ? "s" : h < 1000 ? "m" : "l";
  return `${wb}${hb}`;
}

type Store = Record<string, Record<string, Rect>>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    // Private mode, a quota error, corrupt JSON from an older version. A
    // forgotten window position is not worth an exception on somebody's page.
    return {};
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* see read() */
  }
}

/** Remembered rect for an app in this viewport bucket, if any. */
export function loadRect(slug: string): Rect | null {
  const b = read()[bucket()];
  const r = b?.[slug];
  if (!r) return null;
  // A stored rect can be off-screen: the window was moved, then the browser was
  // resized, then reopened. Reject anything whose title bar is not reachable —
  // a window you cannot grab is worse than one in the default position.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.x > vw - 80 || r.y > vh - 40 || r.x + r.w < 40 || r.y < 0) return null;
  return r;
}

/** Remember an app's rect for this viewport bucket. */
export function saveRect(slug: string, rect: Rect): void {
  const s = read();
  const b = bucket();
  (s[b] ??= {})[slug] = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
  write(s);
}

export function forgetRect(slug: string): void {
  const s = read();
  // `read()` a SECOND time returned a fresh object, so the delete landed on a
  // throwaway copy and the value written back was the untouched first read.
  // Forgetting a window's geometry silently did nothing, every time.
  const b = s[bucket()];
  if (!b) return;
  delete b[slug];
  write(s);
}

/**
 * Coalesce writes.
 *
 * A drag emits a rect on every pointermove — writing localStorage at that rate
 * is a synchronous main-thread write per frame, on a page we do not own. The
 * final position is the only one anybody wants.
 */
export function debouncedSaveRect(wait = 400): (slug: string, rect: Rect) => void {
  const pending = new Map<string, Rect>();
  let timer: number | null = null;
  return (slug, rect) => {
    pending.set(slug, rect);
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      for (const [s, r] of pending) saveRect(s, r);
      pending.clear();
    }, wait);
  };
}
