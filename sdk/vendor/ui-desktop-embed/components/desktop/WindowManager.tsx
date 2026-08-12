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
  /** Bumps every time `section` is (re)targeted, so apps re-navigate even to the same section. */
  sectionNonce: number;
}

export interface WindowManagerContextValue {
  windows: WindowEntry[];
  open: (slug: string, opts: OpenWindowOptions) => void;
  close: (slug: string) => void;
  focus: (slug: string) => void;
  minimize: (slug: string) => void;
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

let zCounter = 10;

function defaultRect(width = 640, height = 440): WindowRect {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = Math.max(24, (vw - width) / 2 + (Math.random() * 40 - 20));
  const y = Math.max(24, (vh - height) / 2 + (Math.random() * 40 - 20));
  return clampWindowRect({ x, y, w: width, h: height });
}

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const slugsRef = useRef<Set<string>>(new Set());

  const open = useCallback((slug: string, opts: OpenWindowOptions) => {
    setWindows((prev) => {
      const existing = prev.find((w) => w.slug === slug);
      zCounter += 1;
      if (existing) {
        return prev.map((w) =>
          w.slug === slug
            ? { ...w, ...opts, minimized: false, z: zCounter, sectionNonce: w.sectionNonce + 1 }
            : w,
        );
      }
      slugsRef.current.add(slug);
      return [
        ...prev,
        {
          slug,
          ...opts,
          rect: defaultRect(opts.width, opts.height),
          minimized: false,
          maximized: false,
          z: zCounter,
          sectionNonce: 0,
        },
      ];
    });
  }, []);

  const close = useCallback((slug: string) => {
    slugsRef.current.delete(slug);
    setWindows((prev) => prev.filter((w) => w.slug !== slug));
  }, []);

  const focus = useCallback((slug: string) => {
    zCounter += 1;
    const z = zCounter;
    setWindows((prev) => prev.map((w) => (w.slug === slug ? { ...w, z } : w)));
  }, []);

  const minimize = useCallback((slug: string) => {
    setWindows((prev) => prev.map((w) => (w.slug === slug ? { ...w, minimized: !w.minimized } : w)));
  }, []);

  const restore = useCallback((slug: string) => {
    zCounter += 1;
    const z = zCounter;
    setWindows((prev) => prev.map((w) => (w.slug === slug ? { ...w, minimized: false, z } : w)));
  }, []);

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
    () => ({ windows, open, close, focus, minimize, restore, toggleMaximize, isOpen, isMinimized, setSection, updateRect }),
    [windows, open, close, focus, minimize, restore, toggleMaximize, isOpen, isMinimized, setSection, updateRect],
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
export function WindowManager() {
  const { windows, close, minimize, toggleMaximize, focus, updateRect } = useWindowManager();

  return (
    <>
      {windows.map((w) => (
        <Window
          key={w.slug}
          title={w.title}
          icon={w.icon}
          rect={w.rect}
          resizable={w.resizable ?? true}
          minimized={w.minimized}
          maximized={w.maximized}
          zIndex={w.z}
          onRectChange={(rect) => updateRect(w.slug, rect)}
          onClose={() => close(w.slug)}
          onMinimize={() => minimize(w.slug)}
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
