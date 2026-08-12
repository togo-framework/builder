'use client'

// Spotlight — a macOS-style search palette (Cmd/Ctrl+K or the top-bar search
// button). A rounded search field drops in near the top-center over a blurred
// backdrop, scaling + fading in like macOS Spotlight. Lists installed OS apps,
// filters as you type, launches on select. Built on cmdk's Command primitives
// (NOT the shared Dialog) so the open animation is fully custom.

import * as React from "react";
import { Search } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../ui-core";
import { DynamicIcon } from "../../ui-core";
import { cn } from "../../ui-core";
import type { OSApp } from "../../hooks/useOSApps";

export interface SpotlightProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: OSApp[];
  onLaunch: (slug: string) => void;
}

export function Spotlight({ open, onOpenChange, apps, onLaunch }: SpotlightProps) {
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);

  // Cmd/Ctrl+K toggles Spotlight globally; Escape closes.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Mount/unmount with an enter/exit animation (matches Launchpad).
  React.useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 10);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-start justify-center bg-black/30 backdrop-blur-md transition-opacity duration-200",
        shown ? "opacity-100" : "opacity-0",
      )}
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div
        className={cn(
          "mt-[16vh] w-[92vw] max-w-xl origin-top overflow-hidden rounded-2xl border border-border/60 bg-popover/90 shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-out",
          shown ? "translate-y-0 scale-100 opacity-100" : "-translate-y-3 scale-95 opacity-0",
        )}
      >
        <Command className="bg-transparent [&_[cmdk-input]]:h-12">
          <CommandInput autoFocus placeholder="Spotlight Search" className="text-base" />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>No apps found.</CommandEmpty>
            <CommandGroup heading="Applications">
              {apps.map((app) => (
                <CommandItem
                  key={app.slug}
                  value={`${app.name} ${app.slug} ${app.category}`}
                  onSelect={() => { onLaunch(app.slug); onOpenChange(false); }}
                  className="gap-3"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white ring-1 ring-inset ring-white/25"
                    style={{ backgroundImage: `linear-gradient(160deg, ${app.color || "#64748b"}, ${app.color || "#64748b"}bb)` }}
                  >
                    <DynamicIcon name={app.icon} size={18} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{app.name}</span>
                    <span className="text-xs capitalize text-muted-foreground">{app.category}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}

Spotlight.displayName = "Spotlight";

/** Small icon button that opens Spotlight (for the top bar). */
export function SpotlightTrigger({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Search (⌘K)"
      className={className}
      aria-label="Open Spotlight search"
    >
      <Search className="h-4 w-4" />
    </button>
  );
}
