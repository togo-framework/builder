'use client'

// Dock — bottom, macOS-style, rounded floating bar. A Launchpad button opens
// Spotlight; then app icons (pinned + open) launch on click; then a Trash bin
// at the trailing end. Always visible.

import * as React from "react";
import { LayoutGrid, Trash2, SquareArrowOutUpRight, X, PinOff } from "lucide-react";
import { DynamicIcon } from "../../ui-core";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../../ui-core";
import { cn } from "../../ui-core";
import type { OSApp } from "../../hooks/useOSApps";

export interface DockProps {
  /** All installed apps (used to resolve name/icon/color for pinned slugs). */
  apps: OSApp[];
  /** Slugs to show, in order (pinned, or all installed apps as a fallback). */
  pinned: string[];
  /** Slugs of currently-open windows — shown with an "open" indicator dot. */
  openSlugs?: string[];
  onLaunch: (slug: string) => void;
  /** Right-click → Quit on a running app icon. */
  onCloseApp?: (slug: string) => void;
  /** Right-click → Remove from Dock (unpin). */
  onUnpin?: (slug: string) => void;
  /** Opens the Launchpad / app directory (leading icon). */
  onLaunchpad?: () => void;
  /** Opens the Trash (trailing icon). */
  onTrash?: () => void;
  className?: string;
}

interface DockButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  color?: string;
  isOpen?: boolean;
}

const DockButton = React.forwardRef<HTMLButtonElement, DockButtonProps>(
  ({ label, color, isOpen, children, ...rest }, ref) => {
    const base = color || "#64748b";
    return (
      <button
        ref={ref}
        type="button"
        title={label}
        {...rest}
        className="group relative flex flex-col items-center transition-transform duration-150 ease-out hover:-translate-y-1.5"
      >
        {/* Solid squircle so the icon reads clearly on ANY wallpaper (macOS style):
            a color gradient fill, a white icon, an inset highlight ring. */}
        <span
          className="flex h-11 w-11 items-center justify-center rounded-[14px] text-white shadow-md ring-1 ring-inset ring-white/25 transition-shadow group-hover:shadow-xl"
          style={{ backgroundImage: `linear-gradient(160deg, ${base}, ${base}bb)` }}
        >
          <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{children}</span>
        </span>
        <span className={cn("mt-1 h-1 w-1 rounded-full bg-white/90 transition-opacity", isOpen ? "opacity-100" : "opacity-0")} />
      </button>
    );
  },
);
DockButton.displayName = "DockButton";

export function Dock({ apps, pinned, openSlugs = [], onLaunch, onCloseApp, onUnpin, onLaunchpad, onTrash, className }: DockProps) {
  const bySlug = React.useMemo(() => new Map(apps.map((a) => [a.slug, a])), [apps]);
  const slugs = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of [...pinned, ...openSlugs]) {
      if (!seen.has(s) && bySlug.has(s)) {
        seen.add(s);
        ordered.push(s);
      }
    }
    return ordered;
  }, [pinned, openSlugs, bySlug]);

  return (
    <div className={cn("pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-2", className)}>
      <div className="no-scrollbar pointer-events-auto flex max-w-full items-end gap-1.5 overflow-x-auto rounded-2xl border border-white/15 bg-black/25 px-2.5 py-2 shadow-2xl backdrop-blur-2xl">
        {onLaunchpad && (
          <>
            <DockButton label="Launchpad" color="#6366f1" onClick={onLaunchpad}>
              <LayoutGrid className="h-5 w-5" />
            </DockButton>
            {(slugs.length > 0 || onTrash) && <span className="mx-1 h-9 w-px self-center bg-white/15" />}
          </>
        )}

        {slugs.map((slug) => {
          const app = bySlug.get(slug)!;
          const running = openSlugs.includes(slug);
          return (
            <ContextMenu key={slug}>
              <ContextMenuTrigger asChild>
                <DockButton label={app.name} color={app.color} isOpen={running} onClick={() => onLaunch(slug)}>
                  <DynamicIcon name={app.icon} size={22} />
                </DockButton>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem onClick={() => onLaunch(slug)}>
                  <SquareArrowOutUpRight className="me-2 h-4 w-4" />
                  {running ? "Show" : "Open"}
                </ContextMenuItem>
                {onUnpin && (
                  <ContextMenuItem onClick={() => onUnpin(slug)}>
                    <PinOff className="me-2 h-4 w-4" />
                    Remove from Dock
                  </ContextMenuItem>
                )}
                {running && onCloseApp && (
                  <ContextMenuItem className="text-destructive" onClick={() => onCloseApp(slug)}>
                    <X className="me-2 h-4 w-4" />
                    Quit {app.name}
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {onTrash && (
          <>
            <span className="mx-1 h-9 w-px self-center bg-white/15" />
            <DockButton label="Trash" onClick={onTrash}>
              <Trash2 className="h-5 w-5 text-white/80" />
            </DockButton>
          </>
        )}
      </div>
    </div>
  );
}

Dock.displayName = "Dock";
