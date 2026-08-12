'use client'

// Launchpad — a full-screen macOS-style app directory. Opens over a blurred
// backdrop with a scale/fade-in animation. A tap/click launches an app; a
// right-click / long-press opens a context menu to pin/unpin from the Dock or
// add/remove from the Desktop. A search box filters apps (like macOS Launchpad).

import * as React from "react";
import { Search, Pin, PinOff, MonitorUp, MonitorX } from "lucide-react";
import { DynamicIcon } from "../../ui-core";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../../ui-core";
import { cn } from "../../ui-core";
import type { OSApp } from "../../hooks/useOSApps";

export interface LaunchpadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: OSApp[];
  /** Slugs currently pinned to the dock. */
  pinned?: string[];
  /** Slugs currently hidden from the desktop. */
  hidden?: string[];
  onLaunch: (slug: string) => void;
  onPin?: (slug: string) => void;
  onUnpin?: (slug: string) => void;
  onAddToDesktop?: (slug: string) => void;
  onRemoveFromDesktop?: (slug: string) => void;
}

export function Launchpad({
  open,
  onOpenChange,
  apps,
  pinned = [],
  hidden = [],
  onLaunch,
  onPin,
  onUnpin,
  onAddToDesktop,
  onRemoveFromDesktop,
}: LaunchpadProps) {
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const pinnedSet = React.useMemo(() => new Set(pinned), [pinned]);
  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 10);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => { setMounted(false); setQuery(""); }, 200);
    return () => clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!mounted) return null;

  const q = query.trim().toLowerCase();
  const list = apps.filter((a) => a.enabled && (!q || a.name.toLowerCase().includes(q)));

  const launch = (slug: string) => { onLaunch(slug); onOpenChange(false); };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center bg-black/40 backdrop-blur-2xl transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/* Search */}
      <div className="mt-14 mb-8 w-full max-w-sm px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-white/20 bg-white/10 py-2 ps-9 pe-3 text-center text-sm text-white placeholder:text-white/60 outline-none backdrop-blur-md focus:border-white/40"
          />
        </div>
      </div>

      {/* App grid */}
      <div
        className={cn(
          "grid w-full max-w-5xl grid-cols-3 gap-x-4 gap-y-8 overflow-y-auto px-6 pb-24 transition-transform duration-200 ease-out sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7",
          shown ? "scale-100" : "scale-90",
        )}
      >
        {list.map((app) => {
          const isPinned = pinnedSet.has(app.slug);
          const onDesktop = !hiddenSet.has(app.slug);
          return (
            <ContextMenu key={app.slug}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => launch(app.slug)}
                  className="group flex select-none flex-col items-center gap-2 rounded-2xl p-2 outline-none transition hover:scale-105 focus-visible:scale-105"
                >
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-[22px] text-white shadow-lg ring-1 ring-inset ring-white/25"
                    style={{ backgroundImage: `linear-gradient(160deg, ${app.color || "#64748b"}, ${app.color || "#64748b"}bb)` }}
                  >
                    <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                      <DynamicIcon name={app.icon} size={32} />
                    </span>
                  </span>
                  <span className="line-clamp-1 text-xs font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{app.name}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                {isPinned
                  ? onUnpin && (
                      <ContextMenuItem onClick={() => onUnpin(app.slug)}>
                        <PinOff className="me-2 h-4 w-4" /> Remove from Dock
                      </ContextMenuItem>
                    )
                  : onPin && (
                      <ContextMenuItem onClick={() => onPin(app.slug)}>
                        <Pin className="me-2 h-4 w-4" /> Keep in Dock
                      </ContextMenuItem>
                    )}
                {onDesktop
                  ? onRemoveFromDesktop && (
                      <ContextMenuItem onClick={() => onRemoveFromDesktop(app.slug)}>
                        <MonitorX className="me-2 h-4 w-4" /> Remove from Desktop
                      </ContextMenuItem>
                    )
                  : onAddToDesktop && (
                      <ContextMenuItem onClick={() => onAddToDesktop(app.slug)}>
                        <MonitorUp className="me-2 h-4 w-4" /> Add to Desktop
                      </ContextMenuItem>
                    )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {list.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-white/70">No apps match “{query}”.</p>
        )}
      </div>
    </div>
  );
}

Launchpad.displayName = "Launchpad";
