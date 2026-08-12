'use client'

// DesktopIconGrid — desktop icons for installed OS apps. A single tap/click
// opens the app (mobile-friendly); double-click also works. When `onMove` is
// provided, icons are freely draggable and their positions are reported back
// (persisted by the host as DesktopPrefs.icon_positions); otherwise they lay out
// in a simple auto-grid. Right-click / long-press an icon to remove it from the
// desktop (via `onRemove`).

import * as React from "react";
import { SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { DesktopIcon } from "./DesktopIcon";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../../ui-core";
import { cn } from "../../ui-core";
import type { OSApp } from "../../hooks/useOSApps";

export interface IconPos { x: number; y: number; }

export interface DesktopIconGridProps {
  apps: OSApp[];
  onOpen: (slug: string) => void;
  /** Saved per-slug positions (DesktopPrefs.icon_positions). */
  positions?: Record<string, IconPos>;
  /** Called when an icon is dragged to a new position. Enables drag mode. */
  onMove?: (slug: string, pos: IconPos) => void;
  /** Slugs hidden from the desktop (DesktopPrefs.desktop_hidden). */
  hidden?: string[];
  /** Right-click → Remove from Desktop. */
  onRemove?: (slug: string) => void;
  className?: string;
}

const CELL_W = 88;
const CELL_H = 104;
const TOP = 48;
const LEFT = 16;

function clampPos(p: IconPos): IconPos {
  if (typeof window === "undefined") return p;
  const x = Math.min(Math.max(p.x, 8), window.innerWidth - CELL_W);
  const y = Math.min(Math.max(p.y, TOP), window.innerHeight - CELL_H - 72);
  return { x, y };
}

// Default auto-layout: fill top-down columns from the top-left.
function defaultPos(index: number): IconPos {
  const perCol = Math.max(3, Math.floor((typeof window !== "undefined" ? window.innerHeight - TOP - 120 : 600) / CELL_H));
  const col = Math.floor(index / perCol);
  const row = index % perCol;
  return { x: LEFT + col * CELL_W, y: TOP + row * CELL_H };
}

function IconMenu({ app, onOpen, onRemove, children }: { app: OSApp; onOpen: (s: string) => void; onRemove?: (s: string) => void; children: React.ReactNode }) {
  if (!onRemove) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onOpen(app.slug)}>
          <SquareArrowOutUpRight className="me-2 h-4 w-4" />
          Open
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive" onClick={() => onRemove(app.slug)}>
          <Trash2 className="me-2 h-4 w-4" />
          Remove from Desktop
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function DesktopIconGrid({ apps, onOpen, positions, onMove, hidden = [], onRemove, className }: DesktopIconGridProps) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const visible = React.useMemo(
    () => apps.filter((a) => a.enabled && !hiddenSet.has(a.slug)),
    [apps, hiddenSet],
  );

  // Grid mode (no drag) — simple auto-fill grid.
  if (!onMove) {
    return (
      <div
        className={cn("grid auto-rows-max grid-cols-[repeat(auto-fill,5rem)] gap-1 p-4", className)}
        onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
      >
        {visible.map((app) => (
          <IconMenu key={app.slug} app={app} onOpen={onOpen} onRemove={onRemove}>
            <DesktopIcon app={app} onOpen={onOpen} tapToOpen selected={selected === app.slug} onSelect={setSelected} />
          </IconMenu>
        ))}
      </div>
    );
  }

  // Free-drag mode — absolutely positioned, pointer-capture drag.
  return (
    <div
      className={cn("absolute inset-0", className)}
      onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
    >
      {visible.map((app, i) => (
        <PositionedIcon
          key={app.slug}
          app={app}
          pos={positions?.[app.slug] ?? defaultPos(i)}
          onOpen={onOpen}
          onMove={onMove}
          onRemove={onRemove}
          selected={selected === app.slug}
          onSelect={setSelected}
        />
      ))}
    </div>
  );
}

function PositionedIcon({
  app,
  pos,
  onOpen,
  onMove,
  onRemove,
  selected,
  onSelect,
}: {
  app: OSApp;
  pos: IconPos;
  onOpen: (slug: string) => void;
  onMove: (slug: string, pos: IconPos) => void;
  onRemove?: (slug: string) => void;
  selected: boolean;
  onSelect: (slug: string) => void;
}) {
  const [live, setLive] = React.useState(pos);
  const dragging = React.useRef(false);
  React.useEffect(() => { if (!dragging.current) setLive(pos); }, [pos]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // let right-click open the context menu
    onSelect(app.slug);
    const el = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = live;
    let moved = false;
    let captured = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        moved = true;
        dragging.current = true;
        // Only capture once a real drag starts, so a plain tap still fires a
        // click/open (capturing on down suppresses synthetic click/dblclick).
        el.setPointerCapture(e.pointerId);
        captured = true;
      }
      if (dragging.current) setLive(clampPos({ x: orig.x + dx, y: orig.y + dy }));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (captured) el.releasePointerCapture?.(e.pointerId);
      if (moved) {
        dragging.current = false;
        setLive((p) => { onMove(app.slug, p); return p; });
      } else {
        // A tap/click with no drag → open the app.
        onOpen(app.slug);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <IconMenu app={app} onOpen={onOpen} onRemove={onRemove}>
      <div className="absolute touch-none" style={{ left: live.x, top: live.y }} onPointerDown={onPointerDown}>
        <DesktopIcon app={app} onOpen={onOpen} selected={selected} />
      </div>
    </IconMenu>
  );
}

DesktopIconGrid.displayName = "DesktopIconGrid";
