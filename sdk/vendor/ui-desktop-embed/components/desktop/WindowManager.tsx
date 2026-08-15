'use client'

// WindowManager — tracks the list of open windows keyed by app slug
// (open/close/focus/minimize/maximize/z-order) and renders one <Window/> per
// open entry. Deliberately simple/pragmatic (a small context + hook), not a
// generic pub-sub framework.

import * as React from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Window, clampWindowRect, type WindowRect } from "./Window";

export interface OpenWindowOptions {
  title: string;
  icon?: string;
  resizable?: boolean;
  width?: number;
  height?: number;
  content: React.ReactNode;
  /**
   * Deep-link target inside the app — e.g. open Settings straight to
   * "wallpaper". The app reads it via useWindowSection().
   */
  section?: string;
}

interface WindowEntry extends OpenWindowOptions {
  slug: string;
  rect: WindowRect;
  minimized: boolean;
  maximized: boolean;
  z: number;
  /**
   * True for the topmost non-minimized window. Stored, not derived per-render:
   * the chrome reads it for shadow, title contrast and control opacity, and
   * recomputing "which of these has the highest z" inside every Window is how
   * that becomes O(n^2) with a dozen open.
   */
  focused: boolean;
  /** Bumps every time `section` is (re)targeted, so apps re-navigate even to the same section. */
  sectionNonce: number;
}

export interface WindowManagerContextValue {
  windows: WindowEntry[];
  open: (slug: string, opts: OpenWindowOptions) => void;
  close: (slug: string) => void;
  focus: (slug: string) => void;
  /** Toggles: minimizes an open window, restores a minimized one. */
  toggleMinimize: (slug: string) => void;
  /** Un-minimize + bring to front (without replacing content). */
  restore: (slug: string) => void;
  toggleMaximize: (slug: string) => void;
  isOpen: (slug: string) => boolean;
  isMinimized: (slug: string) => boolean;
  /** Deep-link an already-open window to a section (bumps its nonce so apps re-navigate). */
  setSection: (slug: string, section: string) => void;
  /** @internal used by <WindowManager/> to persist drag/resize geometry. */
  updateRect: (slug: string, rect: WindowRect) => void;
}

/** Section deep-link exposed to app window content. */
export interface WindowSection {
  slug: string;
  section?: string;
  nonce: number;
}

const WindowSectionContext = createContext<WindowSection>({ slug: "", nonce: 0 });

/**
 * Read the deep-link section targeted for the current app window (e.g. Settings
 * opened straight to "wallpaper"). `nonce` changes on every (re)target — react
 * to it so re-opening to the same section still navigates. Returns an empty
 * section outside a window.
 */
export function useWindowSection(): WindowSection {
  return useContext(WindowSectionContext);
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

// Z-ORDER — rewritten for the embed.
//
// Upstream keeps `let zCounter = 10` at MODULE scope and only ever increments
// it. Both properties are fine when the desktop owns the page and wrong when it
// does not:
//
//   1. Every provider on the page shares one counter. Mount a second shell —
//      which the host app can do without knowing we exist — and the two fight
//      over one monotonically-rising number.
//   2. It never comes back down. A long session climbs without bound, and the
//      shell is already sitting at a high z-index over a host page that may
//      have its own fixed chrome at 2147483647. "Eventually collides" is not a
//      failure anyone would connect back to a window manager.
//
// So: the counter lives in provider state, starts at `zBase`, and the whole
// list is renormalised to zBase+1..zBase+n on every reorder. Only the ORDER
// carries meaning; the absolute numbers never need to grow.
const TOP = Number.MAX_SAFE_INTEGER;

/**
 * Collapse z values back to a dense zBase+1..zBase+n run, and mark the topmost
 * non-minimized window focused.
 *
 * `focused` is stored rather than derived at every render because the chrome
 * needs it (shadow, title contrast, control opacity) and recomputing "which of
 * these has the highest z" inside each Window is how that becomes O(n²) with a
 * dozen windows open.
 */
function renormalize(ws: WindowEntry[], zBase: number): WindowEntry[] {
  const order = [...ws].sort((a, b) => a.z - b.z);
  const rank = new Map(order.map((w, i) => [w.slug, zBase + i + 1]));
  let top: string | undefined;
  for (const w of order) if (!w.minimized) top = w.slug;
  return ws.map((w) => ({ ...w, z: rank.get(w.slug) ?? zBase + 1, focused: w.slug === top }));
}

function defaultRect(width = 640, height = 440): WindowRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = Math.max(24, (vw - width) / 2 + (Math.random() * 40 - 20));
  const y = Math.max(24, (vh - height) / 2 + (Math.random() * 40 - 20));
  return clampWindowRect({ x, y, w: width, h: height });
}

export function WindowManagerProvider({
  children,
  zBase = 10,
}: {
  children: React.ReactNode;
  /**
   * Base of this manager's z range. The embedded shell passes its own value so
   * window stacking sits inside the band the loader reserved, rather than in a
   * module-global range shared with any other manager on the page.
   */
  zBase?: number;
}) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const slugsRef = useRef<Set<string>>(new Set());

  const open = useCallback((slug: string, opts: OpenWindowOptions) => {
    setWindows((prev) => {
      const existing = prev.find((w) => w.slug === slug);
      if (existing) {
        return renormalize(
          prev.map((w) =>
            w.slug === slug
              ? { ...w, ...opts, minimized: false, z: TOP, sectionNonce: w.sectionNonce + 1 }
              : w,
          ),
          zBase,
        );
      }
      slugsRef.current.add(slug);
      return renormalize(
        [
          ...prev,
          {
            slug,
            ...opts,
            rect: defaultRect(opts.width, opts.height),
            minimized: false,
            maximized: false,
            z: TOP,
            focused: true,
            sectionNonce: 0,
          },
        ],
        zBase,
      );
    });
  }, [zBase]);

  const close = useCallback((slug: string) => {
    slugsRef.current.delete(slug);
    // Renormalise on close too, so `focused` moves to whatever is now on top
    // instead of leaving the stack with no focused window.
    setWindows((prev) => renormalize(prev.filter((w) => w.slug !== slug), zBase));
  }, [zBase]);

  const focus = useCallback((slug: string) => {
    setWindows((prev) =>
      renormalize(prev.map((w) => (w.slug === slug ? { ...w, z: TOP } : w)), zBase),
    );
  }, [zBase]);

  // Named for what it does. Upstream calls this `minimize` while the body is
  // `minimized: !w.minimized` — a toggle — so `minimize()` on an already
  // minimized window restored it, which is the opposite of what every caller
  // reading the name would expect.
  const toggleMinimize = useCallback((slug: string) => {
    setWindows((prev) =>
      renormalize(
        prev.map((w) => (w.slug === slug ? { ...w, minimized: !w.minimized } : w)),
        zBase,
      ),
    );
  }, [zBase]);

  const restore = useCallback((slug: string) => {
    setWindows((prev) =>
      renormalize(
        prev.map((w) => (w.slug === slug ? { ...w, minimized: false, z: TOP } : w)),
        zBase,
      ),
    );
  }, [zBase]);

  const toggleMaximize = useCallback((slug: string) => {
    setWindows((prev) => prev.map((w) => (w.slug === slug ? { ...w, maximized: !w.maximized } : w)));
  }, []);

  const isOpen = useCallback((slug: string) => slugsRef.current.has(slug), []);
  const isMinimized = useCallback(
    (slug: string) => windows.find((w) => w.slug === slug)?.minimized ?? false,
    [windows],
  );

  const setSection = useCallback((slug: string, section: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.slug === slug ? { ...w, section, sectionNonce: w.sectionNonce + 1 } : w)),
    );
  }, []);

  const updateRect = useCallback((slug: string, rect: WindowRect) => {
    setWindows((prev) => prev.map((e) => (e.slug === slug ? { ...e, rect } : e)));
  }, []);

  const value = useMemo<WindowManagerContextValue>(
    () => ({ windows, open, close, focus, toggleMinimize, restore, toggleMaximize, isOpen, isMinimized, setSection, updateRect }),
    [windows, open, close, focus, toggleMinimize, restore, toggleMaximize, isOpen, isMinimized, setSection, updateRect],
  );

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

/** Access the window manager API. Must be used within <WindowManagerProvider>. */
export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be used within a <WindowManagerProvider>");
  return ctx;
}

/**
 * WindowManager — renders one <Window/> per open entry tracked by the
 * nearest <WindowManagerProvider>. Place this once inside the desktop's
 * content area (DesktopShell does this for you).
 */
export function WindowManager({ locale }: { locale?: string } = {}) {
  const { windows, close, toggleMinimize, toggleMaximize, focus, updateRect } = useWindowManager();

  return (
    <>
      {windows.map((w) => (
        <Window
          key={w.slug}
          locale={locale}
          title={w.title}
          icon={w.icon}
          rect={w.rect}
          resizable={w.resizable ?? true}
          minimized={w.minimized}
          maximized={w.maximized}
          zIndex={w.z}
          onRectChange={(rect) => updateRect(w.slug, rect)}
          onClose={() => close(w.slug)}
          focused={w.focused}
          onMinimize={() => toggleMinimize(w.slug)}
          onMaximizeToggle={() => toggleMaximize(w.slug)}
          onFocus={() => focus(w.slug)}
        >
          <WindowSectionContext.Provider value={{ slug: w.slug, section: w.section, nonce: w.sectionNonce }}>
            {w.content}
          </WindowSectionContext.Provider>
        </Window>
      ))}
    </>
  );
}

WindowManagerProvider.displayName = "WindowManagerProvider";
WindowManager.displayName = "WindowManager";
