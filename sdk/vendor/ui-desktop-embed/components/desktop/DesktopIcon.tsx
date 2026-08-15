'use client'

// DesktopIcon — a single desktop icon (icon glyph + label). Double-click
// (or Enter/Space when focused) calls `onOpen`.

import * as React from "react";
import { DynamicIcon } from "../../ui-core";
import { cn } from "../../ui-core";
import type { OSApp } from "../../hooks/useOSApps";

export interface DesktopIconProps {
  app: OSApp;
  onOpen: (slug: string) => void;
  selected?: boolean;
  onSelect?: (slug: string) => void;
  /** Open on a single click/tap (mobile-friendly) instead of double-click. */
  tapToOpen?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function DesktopIcon({ app, onOpen, selected, onSelect, tapToOpen, className, style }: DesktopIconProps) {
  return (
    <button
      type="button"
      style={style}
      className={cn(
        "flex w-20 select-none flex-col items-center gap-1 rounded-lg p-2 text-center outline-none",
        selected ? "bg-primary/20" : "hover:bg-white/10 focus-visible:bg-white/10",
        className,
      )}
      onClick={() => { onSelect?.(app.slug); if (tapToOpen) onOpen(app.slug); }}
      onDoubleClick={() => onOpen(app.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(app.slug);
        }
      }}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-[14px] text-white shadow-md ring-1 ring-inset ring-white/25"
        style={{ backgroundImage: `linear-gradient(160deg, ${app.color || "#64748b"}, color-mix(in srgb, ${app.color || "#64748b"} 72%, #000))` }}
      >
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
          <DynamicIcon name={app.icon} size={24} />
        </span>
      </span>
      <span className="line-clamp-2 text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{app.name}</span>
    </button>
  );
}

DesktopIcon.displayName = "DesktopIcon";
