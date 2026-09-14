'use client'

// Launchpad — a full-screen macOS-style app directory. Opens over a blurred
// backdrop with a scale/fade-in animation. A tap/click launches an app; a
// right-click / long-press opens a context menu to pin/unpin from the Dock or
// add/remove from the Desktop. A search box filters apps (like macOS Launchpad).

import * as React from "react";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const Search = (p: IconProps2) => <Icon name="Search" {...p} />;
const Pin = (p: IconProps2) => <Icon name="Pin" {...p} />;
const PinOff = (p: IconProps2) => <Icon name="PinOff" {...p} />;
const MonitorUp = (p: IconProps2) => <Icon name="MonitorUp" {...p} />;
const MonitorX = (p: IconProps2) => <Icon name="MonitorX" {...p} />;
import { DynamicIcon } from "../../ui-core";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../../ui-core";
import { cn } from "../../ui-core";
import { chromeStrings } from "../../strings";
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
  /** Locale for the Launchpad's own chrome. */
  locale?: string;
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
  locale,
}: LaunchpadProps) {
  const t = chromeStrings(locale);
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

  // Where focus was before this opened, so it can be given back.
  const restoreTo = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only when nothing NESTED is open. A context menu inside the Launchpad
      // registers its own Escape handler, and both fired: dismissing the menu
      // closed the whole Launchpad with it.
      if (document.querySelector("[role='menu']")) return;
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Focus goes back where it came from — the dock tile that opened this.
      // Without it focus falls to <body> and the next Tab restarts from the
      // top of the customer's page.
      restoreTo.current?.focus?.();
    };
  }, [open, onOpenChange]);

  if (!mounted) return null;

  const q = query.trim().toLowerCase();
  // `a.enabled` rather than `a.enabled !== false` filtered EVERY app out here:
  // upstream's apps come from a plugin registry that always sets the flag, but
  // the shell's built-ins and the composer are plain manifests that never
  // mention it. Undefined is not disabled — an app says so explicitly or it is
  // available.
  const list = apps.filter((a) => a.enabled !== false && (!q || a.name.toLowerCase().includes(q)));

  const launch = (slug: string) => { onLaunch(slug); onOpenChange(false); };

  return (
    <div
      // Without this the loader clips the Launchpad away: it paints full-screen
      // but only the sliver overlapping some OTHER opaque region survives, so
      // it read as a dark smear where a window used to be. Everything the shell
      // paints has to declare itself.
      data-fos-opaque=""
      role="dialog"
      aria-modal="true"
      aria-label={t.applications}
      className={cn(
        // Token-driven scrim. It was `bg-black/40` with white text throughout,
        // which is only legible over a dark page — over a light host site the
        // Launchpad was white-on-white-ish and the labels disappeared. The
        // scrim now follows the theme like every other surface.
        "fixed inset-0 z-[60] flex flex-col items-center bg-[color:var(--fos-scrim)] transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
        // pointer-events off while fading OUT. The scrim stayed hit-testable
        // for the whole 200ms transition, so the click that dismissed the
        // Launchpad was followed by 200ms in which the next click hit an
        // invisible full-screen overlay instead of the page.
        shown ? "" : "pointer-events-none",
      )}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/* Search */}
      <div className="mt-14 mb-8 w-full max-w-sm px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--fos-muted)]" />
          <input
            // autoFocus only on a device with a real keyboard. On touch it
            // opened the on-screen keyboard the moment the Launchpad appeared,
            // covering the bottom two rows of the grid the user came to look
            // at — searching is the exception there, tapping is the rule.
            autoFocus={typeof matchMedia === "function" ? matchMedia("(pointer: fine)").matches : true}
            onKeyDown={(e) => {
              // Enter launches the single match. Typing a name and pressing
              // Enter is what everyone tries first, and it did nothing.
              if (e.key !== "Enter" || !list.length) return;
              e.preventDefault();
              launch(list[0].slug);
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="w-full rounded-md border border-[color:var(--fos-chrome-border)] bg-[color:var(--fos-surface)]/70 py-2 ps-9 pe-3 text-center text-sm text-[color:var(--fos-text)] placeholder:text-[color:var(--fos-muted)] outline-none focus-visible:border-[color:var(--fos-focus)] focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
          />
        </div>
      </div>

      {/* App grid */}
      <div
        className={cn(
          "grid w-full max-w-5xl grid-cols-3 gap-x-4 gap-y-8 overflow-y-auto overscroll-contain px-6 pb-24 transition-transform duration-200 ease-out sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7",
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
                  className="group flex select-none flex-col items-center gap-2 p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]"
                >
                  <span
                    className="flex h-16 w-16 items-center justify-center rounded-md text-white ring-1 ring-inset ring-white/25"
                    style={{ backgroundColor: `${app.color || "#64748b"}` }}
                  >
                    <span>
                      <DynamicIcon name={app.icon} label={app.name} size={32} />
                    </span>
                  </span>
                  {/* text-sm over two lines, not text-xs over one. At 12px these were
                      hard to read against a blurred photograph, and a single
                      clamped line turned "Analytics & Marketing" into
                      "Analytics &..." — which is the half that identifies it. */}
                  <span className="line-clamp-2 max-w-[7.5rem] text-center text-sm font-medium leading-snug text-[color:var(--fos-text)]">{app.name}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                {isPinned
                  ? onUnpin && (
                      <ContextMenuItem onClick={() => onUnpin(app.slug)}>
                        <PinOff className="me-2 h-4 w-4" />{t.removeFromDock}</ContextMenuItem>
                    )
                  : onPin && (
                      <ContextMenuItem onClick={() => onPin(app.slug)}>
                        <Pin className="me-2 h-4 w-4" />{t.keepInDock}</ContextMenuItem>
                    )}
                {onDesktop
                  ? onRemoveFromDesktop && (
                      <ContextMenuItem onClick={() => onRemoveFromDesktop(app.slug)}>
                        <MonitorX className="me-2 h-4 w-4" />{t.removeFromDesktop}</ContextMenuItem>
                    )
                  : onAddToDesktop && (
                      <ContextMenuItem onClick={() => onAddToDesktop(app.slug)}>
                        <MonitorUp className="me-2 h-4 w-4" />{t.addToDesktop}</ContextMenuItem>
                    )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {list.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-[color:var(--fos-muted)]">{t.noMatch(query)}</p>
        )}
      </div>
    </div>
  );
}

Launchpad.displayName = "Launchpad";
