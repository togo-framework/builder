'use client'

// Window — generic draggable/resizable window chrome. Drag (title bar) and
// resize (edges + corners) use POINTER CAPTURE on the grabbed element, so the
// gesture keeps tracking even when the pointer leaves the element / window —
// the robust approach. Includes open/close/minimize animation states and a
// traffic-light control cluster.

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { DynamicIcon } from "../../ui-core";
import { cn } from "../../ui-core";

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 320;
const MIN_H = 220;
// Chrome insets: the top bar (~36px) and the floating Dock at the bottom. Windows
// live BETWEEN them, so they never slip under the dock ("push windows to the top").
const TOP_INSET = 40;
const DOCK_INSET = 92;

export function clampWindowRect(r: WindowRect): WindowRect {
  if (typeof window === "undefined") return r;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(r.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(r.h, MIN_H), vh - TOP_INSET - DOCK_INSET);
  const x = Math.min(Math.max(r.x, 8), Math.max(8, vw - w - 8));
  const y = Math.min(Math.max(r.y, TOP_INSET), Math.max(TOP_INSET, vh - h - DOCK_INSET));
  return { x, y, w, h };
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
    const h = vh - TOP_INSET - DOCK_INSET;
    if (zone === "left") return { x: 8, y: TOP_INSET, w: vw / 2 - 12, h };
    if (zone === "right") return { x: vw / 2 + 4, y: TOP_INSET, w: vw / 2 - 12, h };
    return { x: 8, y: TOP_INSET, w: vw - 16, h };
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
    if (isMobile) return { left: 0, top: TOP_INSET, right: 0, bottom: DOCK_INSET, width: "auto", height: "auto", zIndex };
    if (maximized) return { left: 8, top: TOP_INSET, right: 8, bottom: DOCK_INSET, width: "auto", height: "auto", zIndex };
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
      className={cn(
        "fixed flex flex-col overflow-hidden border border-border bg-card/95 shadow-2xl backdrop-blur-xl",
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
        <div className="group/lights flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] text-[#7a0d02] transition hover:brightness-95"
          >
            <X className="h-2 w-2 opacity-0 transition-opacity group-hover/lights:opacity-100" strokeWidth={3} />
          </button>
          <button
            type="button"
            aria-label="Minimize"
            onClick={onMinimize}
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e] text-[#985712] transition hover:brightness-95"
          >
            <Minus className="h-2 w-2 opacity-0 transition-opacity group-hover/lights:opacity-100" strokeWidth={3} />
          </button>
          <button
            type="button"
            aria-label="Maximize"
            onClick={onMaximizeToggle}
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840] text-[#0b6118] transition hover:brightness-95"
          >
            <Plus className="h-2 w-2 opacity-0 transition-opacity group-hover/lights:opacity-100" strokeWidth={3} />
          </button>
        </div>
        {icon && <DynamicIcon name={icon} size={14} className="ms-1 shrink-0 text-muted-foreground" />}
        <span className="flex-1 truncate text-center text-xs font-medium text-foreground">{title}</span>
        <span className="w-12" aria-hidden="true" />
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
