'use client'

// Window — generic draggable/resizable window chrome. Drag (title bar) and
// resize (edges + corners) use POINTER CAPTURE on the grabbed element, so the
// gesture keeps tracking even when the pointer leaves the element / window —
// the robust approach. Includes open/close/minimize animation states and a
// traffic-light control cluster.

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const X = (p: IconProps2) => <Icon name="X" {...p} />;
const Minus = (p: IconProps2) => <Icon name="Minus" {...p} />;
const Plus = (p: IconProps2) => <Icon name="Plus" {...p} />;
import { DynamicIcon } from "../../ui-core";
import { cn } from "../../ui-core";

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Chrome insets and minimum sizes, as CSS custom properties.
//
// Upstream hard-codes these four numbers, which is right when the desktop owns
// the viewport: the top bar is 40px and the dock is 92px because upstream drew
// both. The embedded shell draws neither at those sizes — it has no OS top bar
// at all, its dock is positioned against the HOST page's chrome, and on a phone
// the host's own bottom bar may claim space we must not cover.
//
// Reading them from custom properties lets the shell set its own geometry in
// CSS, where the rest of its layout already lives, instead of forking this file
// again. The fallbacks are upstream's values, so nothing changes for a caller
// that sets nothing.
const CSS_FALLBACK = { minW: 320, minH: 220, top: 40, dock: 92 } as const;

function inset(name: string, fallback: number): number {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Module-level accessors for the sites outside clampWindowRect (snap zones and
// the maximized/mobile geometry) that need the same numbers.
const topInset = () => inset("--fos-top-inset", CSS_FALLBACK.top);
const dockInset = () => inset("--fos-dock-inset", CSS_FALLBACK.dock);

export function clampWindowRect(r: WindowRect, bounds?: { w: number; h: number }): WindowRect {
  if (typeof window === "undefined") return r;
  // Bounds are injectable: the embedded shell clamps to ITS frame, which is not
  // necessarily the viewport. Upstream always used window.innerWidth/Height,
  // which is the same thing only when the desktop owns the page.
  const vw = bounds?.w ?? window.innerWidth;
  const vh = bounds?.h ?? window.innerHeight;
  const MIN_W = inset("--fos-window-min-w", CSS_FALLBACK.minW);
  const MIN_H = inset("--fos-window-min-h", CSS_FALLBACK.minH);
  const TOP_INSET = inset("--fos-top-inset", CSS_FALLBACK.top);
  const DOCK_INSET = inset("--fos-dock-inset", CSS_FALLBACK.dock);
  const w = Math.min(Math.max(r.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(r.h, MIN_H), vh - TOP_INSET - DOCK_INSET);
  const x = Math.min(Math.max(r.x, 8), Math.max(8, vw - w - 8));
  const y = Math.min(Math.max(r.y, TOP_INSET), Math.max(TOP_INSET, vh - h - DOCK_INSET));
  return { x, y, w, h };
}

/**
 * One window-chrome button.
 *
 * 28px hit target with a ~14px glyph: the box is what the pointer and the
 * WCAG 2.5.8 minimum care about, the glyph is what the eye reads. Glyphs are
 * always visible rather than revealed on hover, because hover is not a state a
 * keyboard or a touchscreen has.
 *
 * `danger` tints toward --fos-danger on hover/focus only. Close is not filled
 * red at rest: a permanently red control reads as "destructive action here"
 * next to a title bar, which is not what closing a window is.
 */
function WindowControl({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-[color:var(--fos-chrome-fg-muted)]",
        "transition-colors hover:text-[color:var(--fos-chrome-fg)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2",
        danger
          ? "hover:bg-[color:var(--fos-danger-soft)] hover:text-[color:var(--fos-danger)]"
          : "hover:bg-[color:var(--fos-surface-2)]",
      )}
    >
      {children}
    </button>
  );
}

// Which edges a resize handle drags.
type ResizeDir = "e" | "s" | "se" | "w" | "n" | "nw" | "ne" | "sw";

export interface WindowProps {
  title: string;
  icon?: string;
  rect: WindowRect;
  onRectChange: (rect: WindowRect) => void;
  resizable?: boolean;
  minimized?: boolean;
  zIndex?: number;
  onClose: () => void;
  onMinimize?: () => void;
  onMaximizeToggle?: () => void;
  maximized?: boolean;
  /**
   * Topmost non-minimized window. Drives the chrome's focus treatment — a
   * stack of identically-styled windows over a busy host page gives the eye
   * nothing to latch onto, and z-order alone is not a visual signal.
   */
  focused?: boolean;
  onFocus?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function Window({
  title,
  icon,
  rect,
  onRectChange,
  resizable = true,
  minimized = false,
  zIndex = 10,
  onClose,
  onMinimize,
  onMaximizeToggle,
  maximized = false,
  focused = true,
  onFocus,
  className,
  children,
}: WindowProps) {
  const [live, setLive] = useState<WindowRect>(rect);
  const dragging = useRef(false);
  // 'enter' plays the open animation; 'exit' plays close/minimize before unmount.
  const [phase, setPhase] = useState<"enter" | "shown">("enter");
  const prevMinimized = useRef(minimized);
  // Snap zone preview while dragging the title bar ("max" | "left" | "right").
  const [snapHint, setSnapHint] = useState<null | "max" | "left" | "right">(null);
  // On phones the window fills the screen (iOS-style) — no drag/resize/snap.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!dragging.current) setLive(rect);
  }, [rect]);

  useEffect(() => {
    const t = setTimeout(() => setPhase("shown"), 10);
    return () => clearTimeout(t);
  }, []);

  // Re-clamp on viewport resize so windows never drift off-screen.
  useEffect(() => {
    const onResize = () => setLive((r) => clampWindowRect(r));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Generic pointer-capture gesture. `apply` maps the pointer delta to a rect.
  const beginGesture = useCallback(
    (apply: (orig: WindowRect, dx: number, dy: number) => WindowRect) =>
      (e: React.PointerEvent) => {
        if (maximized) return;
        e.preventDefault();
        e.stopPropagation();
        onFocus?.();
        const orig = live;
        const startX = e.clientX;
        const startY = e.clientY;
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        dragging.current = true;

        const move = (ev: PointerEvent) => {
          setLive(clampWindowRect(apply(orig, ev.clientX - startX, ev.clientY - startY)));
        };
        const up = () => {
          dragging.current = false;
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          setLive((r) => {
            onRectChange(r);
            return r;
          });
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      },
    [maximized, live, onFocus, onRectChange],
  );

  // snapRect computes the target rect for a snap zone.
  const snapRect = useCallback((zone: "max" | "left" | "right"): WindowRect => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = vh - topInset() - dockInset();
    if (zone === "left") return { x: 8, y: topInset(), w: vw / 2 - 12, h };
    if (zone === "right") return { x: vw / 2 + 4, y: topInset(), w: vw / 2 - 12, h };
    return { x: 8, y: topInset(), w: vw - 16, h };
  }, []);

  // Title-bar drag with edge snapping (top = maximize, sides = half-tile).
  const onDragTitle = useCallback(
    (e: React.PointerEvent) => {
      if (maximized || isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      onFocus?.();
      const orig = live;
      const startX = e.clientX;
      const startY = e.clientY;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      dragging.current = true;

      const zoneFor = (x: number, y: number): "max" | "left" | "right" | null => {
        if (y <= 6) return "max";
        if (x <= 6) return "left";
        if (x >= window.innerWidth - 6) return "right";
        return null;
      };

      const move = (ev: PointerEvent) => {
        setLive(clampWindowRect({ ...orig, x: orig.x + (ev.clientX - startX), y: orig.y + (ev.clientY - startY) }));
        setSnapHint(zoneFor(ev.clientX, ev.clientY));
      };
      const up = (ev: PointerEvent) => {
        dragging.current = false;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        const zone = zoneFor(ev.clientX, ev.clientY);
        setSnapHint(null);
        if (zone) {
          const r = snapRect(zone);
          setLive(r);
          onRectChange(r);
        } else {
          setLive((r) => { onRectChange(r); return r; });
        }
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [maximized, isMobile, live, onFocus, onRectChange, snapRect],
  );

  const resizeHandlers: Record<ResizeDir, (o: WindowRect, dx: number, dy: number) => WindowRect> = {
    e: (o, dx) => ({ ...o, w: o.w + dx }),
    s: (o, _dx, dy) => ({ ...o, h: o.h + dy }),
    se: (o, dx, dy) => ({ ...o, w: o.w + dx, h: o.h + dy }),
    w: (o, dx) => ({ ...o, x: o.x + dx, w: o.w - dx }),
    n: (o, _dx, dy) => ({ ...o, y: o.y + dy, h: o.h - dy }),
    nw: (o, dx, dy) => ({ ...o, x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }),
    ne: (o, dx, dy) => ({ ...o, y: o.y + dy, w: o.w + dx, h: o.h - dy }),
    sw: (o, dx, dy) => ({ ...o, x: o.x + dx, w: o.w - dx, h: o.h + dy }),
  };

  const style = useMemo<React.CSSProperties>(() => {
    // Phone: fill the screen edge-to-edge below the top bar, above the dock.
    if (isMobile) return { left: 0, top: topInset(), right: 0, bottom: dockInset(), width: "auto", height: "auto", zIndex };
    if (maximized) return { left: 8, top: topInset(), right: 8, bottom: dockInset(), width: "auto", height: "auto", zIndex };
    return { left: live.x, top: live.y, width: live.w, height: live.h, zIndex };
  }, [isMobile, maximized, live, zIndex]);

  prevMinimized.current = minimized;
  const animating = phase === "enter";

  const snapPreview = snapHint
    ? (() => {
        const r = snapRect(snapHint);
        return (
          <div
            className="pointer-events-none fixed rounded-xl border-2 border-primary/70 bg-primary/15 backdrop-blur-sm transition-all duration-100"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: zIndex - 1 }}
            aria-hidden="true"
          />
        );
      })()
    : null;

  // Kept mounted while minimized (preserves app state); flies down toward the
  // dock via transform so minimize/restore animate. Dock shows the running app.
  return (
    <>
      {snapPreview}
    <div
      // See Dock.tsx: the loader clips to the union of these rects.
      data-fos-opaque=""
      className={cn(
        "fixed flex flex-col overflow-hidden border bg-card/95 backdrop-blur-xl transition-shadow",
        // Only the CHROME recedes on blur. The content area is untouched:
        // repainting an app to dim it is expensive, and no real desktop does it.
        focused
          ? "border-[color:var(--fos-border-strong)] shadow-[var(--fos-shadow-window)]"
          : "border-border shadow-[var(--fos-shadow-1)]",
        isMobile ? "rounded-none" : "rounded-xl",
        "origin-bottom transition-[opacity,transform] duration-200 ease-out",
        minimized
          ? "pointer-events-none translate-y-[45vh] scale-50 opacity-0"
          : animating
            ? "scale-95 opacity-0"
            : "scale-100 opacity-100",
        className,
      )}
      style={style}
      aria-hidden={minimized}
      onPointerDown={() => onFocus?.()}
      role="dialog"
      aria-label={title}
    >
      {/* Title bar — drag handle + macOS traffic lights */}
      <div
        className="flex shrink-0 cursor-grab select-none items-center gap-2 border-b border-border bg-background/70 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onDragTitle}
        onDoubleClick={onMaximizeToggle}
      >
        {icon && <DynamicIcon name={icon} size={14} className="shrink-0 text-muted-foreground" />}
        {/* `dir` is set explicitly, not inherited. Ellipsis truncation clips the
            WRONG end in RTL when direction is only inherited, so an Arabic
            window title would lose its beginning instead of its tail. */}
        <span
          className="flex-1 truncate text-xs font-medium text-foreground"
          style={{ direction: "inherit" }}
          title={title}
        >
          {title}
        </span>

        {/* Window controls.
         *
         * Upstream draws macOS's traffic lights: three hardcoded hex circles at
         * 12px, pinned to the leading edge, with their glyphs at opacity-0 until
         * hover and no focus ring at all. Four problems, and only one of them is
         * taste:
         *
         *   - hardcoded #ff5f57 / #febc2e / #28c840 ignore the token layer
         *     entirely, so they are the same colour in every theme a project picks
         *   - 12px is below the WCAG 2.5.8 minimum of 24px
         *   - no :focus-visible, and glyphs invisible until hover, means a
         *     keyboard user tabbing here sees nothing and cannot tell what is
         *     focused — close/minimize/maximize were effectively unreachable
         *   - macOS never mirrors these, so keeping the imitation would have
         *     required a documented RTL exception
         *
         * Imitating one specific OS is also the wrong signal for a widget that
         * floats over somebody else's product. Dropping the imitation removes the
         * RTL exception along with it: at the inline-end, this mirrors correctly
         * with no special case.
         */}
        <div className="flex shrink-0 items-center" onPointerDown={(e) => e.stopPropagation()}>
          {onMinimize && (
            <WindowControl label="Minimize" onClick={onMinimize}>
              <Minus className="size-3.5" />
            </WindowControl>
          )}
          {onMaximizeToggle && (
            <WindowControl label={maximized ? "Restore" : "Maximize"} onClick={onMaximizeToggle}>
              <Plus className="size-3.5" />
            </WindowControl>
          )}
          <WindowControl label="Close" onClick={onClose} danger>
            <X className="size-3.5" />
          </WindowControl>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <React.Suspense fallback={<WindowSpinner />}>{children}</React.Suspense>
      </div>

      {/* Resize handles (edges + corners) — desktop only */}
      {resizable && !maximized && !isMobile && (
        <>
          <div onPointerDown={beginGesture(resizeHandlers.n)} className="absolute inset-x-2 top-0 h-1.5 cursor-ns-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.s)} className="absolute inset-x-2 bottom-0 h-1.5 cursor-ns-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.w)} className="absolute inset-y-2 left-0 w-1.5 cursor-ew-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.e)} className="absolute inset-y-2 right-0 w-1.5 cursor-ew-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.nw)} className="absolute left-0 top-0 h-3 w-3 cursor-nwse-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.ne)} className="absolute right-0 top-0 h-3 w-3 cursor-nesw-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.sw)} className="absolute bottom-0 left-0 h-3 w-3 cursor-nesw-resize touch-none" />
          <div onPointerDown={beginGesture(resizeHandlers.se)} className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize touch-none" />
        </>
      )}
    </div>
    </>
  );
}

Window.displayName = "Window";

/** Centered loading spinner used as the window content fallback. */
export function WindowSpinner() {
  return (
    <div className="flex h-full min-h-[160px] w-full items-center justify-center">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary" aria-label="Loading" />
    </div>
  );
}
