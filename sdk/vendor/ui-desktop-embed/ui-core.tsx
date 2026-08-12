// The single seam between the vendored desktop components and everything they
// depend on — implemented locally rather than re-exported from a design system.
//
// WHY NOT JUST DEPEND ON @togo-framework/ui
//
// It was the first thing tried, and the build refused: the package is not in
// sdk/, and adding it brings a full Radix surface plus lucide-react (132,299 B
// gz on its own, 3.6x the entire current SDK bundle) into a document with a
// 300 KB gz ceiling. The 34 symbols the fork imports are, in practice, `cn`,
// a context menu, and a handful of primitives used by components that are not
// on the shell's boot path at all.
//
// So the seam holds local implementations. They are deliberately minimal: this
// is window chrome, not an application framework. Anything richer belongs in an
// APP, which loads its own UI and is free to bring whatever it likes — the
// shell's job is to draw a window around it and get out of the way.

import * as React from "react";

/* ── cn ──────────────────────────────────────────────────────────────────
 * clsx semantics without the dependency: strings, arrays, and
 * {class: condition} objects, falsy dropped.
 *
 * NOT tailwind-merge. Conflicting utilities resolve by stylesheet order rather
 * than by last-wins, which is upstream's existing behaviour — and adding a
 * merge here would silently change how every vendored component renders.
 */
type ClassValue = string | number | null | false | undefined | ClassValue[] | Record<string, unknown>;

export function cn(...parts: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  };
  parts.forEach(walk);
  return out.join(" ");
}

/* ── DynamicIcon ─────────────────────────────────────────────────────── */
export { DynamicIcon } from "./dynamic-icon";

/* ── wallpaperCss ────────────────────────────────────────────────────── */
export function wallpaperCss(wallpaper?: string | null): string {
  const w = (wallpaper ?? "").trim();
  if (!w) return "transparent";
  if (/^(linear-gradient|radial-gradient|conic-gradient|url|#|rgb|hsl|oklch)/i.test(w)) return w;
  const presets: Record<string, string> = {
    slate: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    indigo: "linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)",
    teal: "linear-gradient(135deg, #115e59 0%, #042f2e 100%)",
    rose: "linear-gradient(135deg, #881337 0%, #4c0519 100%)",
    amber: "linear-gradient(135deg, #92400e 0%, #451a03 100%)",
    light: "linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%)",
  };
  return presets[w.toLowerCase()] ?? w;
}

/* ── formatRelativeTime ──────────────────────────────────────────────── */
/**
 * Intl.RelativeTimeFormat rather than a hand-rolled string, because the
 * notification surfaces are among the most-read in a bilingual shell and "3
 * minutes ago" with Arabic punctuation bolted on is exactly the kind of thing
 * that ships and stays.
 */
export function formatRelativeTime(value: string | number | Date, locale?: string): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800],
    ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1],
  ];
  const lang = locale || (typeof document !== "undefined" ? document.documentElement.lang : "") || "en";
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, per] of units) {
    if (Math.abs(secs) >= per || unit === "second") return rtf.format(Math.trunc(secs / per), unit);
  }
  return "";
}

/* ── primitives ──────────────────────────────────────────────────────────
 *
 * Plain elements carrying the same class contract the vendored components
 * already write against. No Radix.
 *
 * The CONTEXT MENU is a deliberate no-op passthrough, and that is a decision
 * rather than a shortcut: upstream binds right-click on the desktop to
 * wallpaper actions, which is correct when the desktop owns the page. Over a
 * customer's site it steals a gesture the host may depend on — a canvas, a
 * custom editor, their own context menu. The shell renders the trigger's
 * children and leaves right-click alone.
 */

// Deliberately permissive. These stand in for Radix components whose real
// props (align, side, sideOffset, asChild, modal…) the vendored components pass
// through freely. A passthrough that rejects them would force edits to fifteen
// files to satisfy a type that models nothing at run time — the extra props are
// simply ignored.
type Div = React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
type AnyProps = { children?: React.ReactNode } & Record<string, unknown>;
const passthrough = (props: AnyProps) => <>{props.children}</>;

export const ContextMenu = passthrough;
export const ContextMenuTrigger = passthrough;
/** Never rendered: the shell does not intercept the host's right-click. */
export const ContextMenuContent = (_p: AnyProps) => null;
export const ContextMenuItem = (_p: AnyProps) => null;
export const ContextMenuSeparator = (_p: AnyProps) => null;

export const DropdownMenu = passthrough;
export const DropdownMenuTrigger = passthrough;
export const DropdownMenuContent = ({ className, align: _a, side: _s, sideOffset: _o, ...p }: Div) => (
  <div className={cn("rounded-md border border-border bg-popover p-1 shadow-md", className)} {...(p as Div)} />
);
export const DropdownMenuItem = ({ className, ...p }: Div) => (
  <div role="menuitem" className={cn("cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-muted", className)} {...p} />
);
export const DropdownMenuSeparator = ({ className, ...p }: Div) => (
  <div className={cn("my-1 h-px bg-border", className)} {...p} />
);

export const Popover = passthrough;
export const PopoverTrigger = passthrough;
export const PopoverContent = ({ className, align: _a, side: _s, sideOffset: _o, ...p }: Div) => (
  <div className={cn("rounded-md border border-border bg-popover p-2 shadow-md", className)} {...(p as Div)} />
);

export const Sheet = passthrough;
export const SheetContent = ({ className, side: _s, ...p }: Div) => (
  <div className={cn("fixed inset-y-0 end-0 w-80 border-s border-border bg-card shadow-xl", className)} {...(p as Div)} />
);
export const SheetHeader = ({ className, ...p }: Div) => (
  <div className={cn("border-b border-border p-4", className)} {...p} />
);
export const SheetTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("text-sm font-semibold", className)} {...p} />
);

export const ScrollArea = ({ className, ...p }: Div) => (
  <div className={cn("overflow-auto", className)} {...p} />
);

export const Avatar = ({ className, ...p }: Div) => (
  <div className={cn("relative grid size-8 place-items-center overflow-hidden rounded-full bg-muted", className)} {...p} />
);
export const AvatarFallback = ({ className, ...p }: Div) => (
  <span className={cn("text-xs font-medium text-muted-foreground", className)} {...p} />
);

export const Badge = ({ className, ...p }: Div) => (
  <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs", className)} {...p} />
);

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accepted and ignored — shadcn's variant/size API, which these plain
   *  elements do not implement. Typed so the vendored call sites compile
   *  unchanged rather than needing an edit each. */
  variant?: string;
  size?: string;
};

export const Button = ({ className, variant: _v, size: _sz, ...p }: BtnProps) => (
  <button
    type="button"
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
      "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2",
      "focus-visible:ring-[color:var(--fos-focus)] focus-visible:ring-offset-2",
      className,
    )}
    {...p}
  />
);

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none",
      "focus-visible:ring-2 focus-visible:ring-[color:var(--fos-focus)]",
      className,
    )}
    {...p}
  />
);

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-xs font-medium text-muted-foreground", className)} {...p} />
);

/* Command palette primitives — plain elements. Spotlight supplies its own
 * filtering and keyboard handling, so there was never much here to inherit. */
export const Command = ({ className, ...p }: Div) => (
  <div className={cn("flex flex-col overflow-hidden", className)} {...p} />
);
export const CommandInput = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn("h-11 w-full bg-transparent px-3 text-sm outline-none", className)} {...p} />
);
export const CommandList = ({ className, ...p }: Div) => (
  <div className={cn("max-h-80 overflow-auto p-1", className)} {...p} />
);
export const CommandEmpty = ({ className, ...p }: Div) => (
  <div className={cn("p-4 text-center text-sm text-muted-foreground", className)} {...p} />
);
export const CommandGroup = ({ className, ...p }: Div) => (
  <div className={cn("p-1", className)} {...p} />
);
export const CommandItem = ({ className, ...p }: Div) => (
  <div className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted", className)} {...p} />
);
