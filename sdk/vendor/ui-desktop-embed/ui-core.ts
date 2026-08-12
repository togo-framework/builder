// The single seam between the vendored desktop components and everything they
// depend on.
//
// Every `@togo-framework/ui-core` import in the fork was rewritten to point
// here, deliberately. Upstream, those 34 symbols come from a package the SDK
// cannot take a dependency on: the shell has a hard 300 KB gz budget, and
// ui-core pulls a full Radix surface plus lucide-react (132,299 B gz on its
// own — 3.6x the ENTIRE current SDK bundle, which is 36,665 B gz).
//
// Routing them through one file means the budget conversation happens in one
// place. Swapping a heavy import for a local implementation is an edit here,
// not a sweep across fifteen components — and CI can assert on this file alone.
//
// 32 of the 34 resolve from @togo-framework/ui today. The two that do not are
// implemented below, because they are ten lines each and not worth a dependency.

export {
  Avatar, AvatarFallback,
  Badge,
  Button,
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  Input,
  Label,
  Popover, PopoverContent, PopoverTrigger,
  ScrollArea,
  Sheet, SheetContent, SheetHeader, SheetTitle,
  cn,
} from "@togo-framework/ui";

// ---------------------------------------------------------------------------
// DynamicIcon — DELIBERATELY NOT RE-EXPORTED. See task #25.
//
// Upstream resolves an icon from a runtime STRING (`<DynamicIcon name={app.icon} />`),
// which is why lucide-react cannot be tree-shaken out of the bundle: a
// name-keyed lookup means every glyph must be present, because the compiler
// cannot know which name arrives. That single indirection is the 132 KB.
//
// The replacement is an injectable resolver, so the shell supplies ~60 inlined
// glyphs and an app whose icon is unknown gets a lettered tile rather than a
// missing box. Until that lands, this throws rather than silently importing
// lucide — a loud failure at the ten call sites is the point.
// ---------------------------------------------------------------------------
export function DynamicIcon(_props: { name?: string; size?: number; className?: string }): never {
  throw new Error(
    "DynamicIcon is not available in the embedded shell — inject an icon resolver instead. " +
      "lucide-react's name-keyed lookup defeats tree-shaking and costs 132 KB gz. See task #25.",
  );
}

// ---------------------------------------------------------------------------
// The two helpers @togo-framework/ui does not export.
// ---------------------------------------------------------------------------

/** A desktop wallpaper token resolved to a CSS `background` value. */
export function wallpaperCss(wallpaper?: string | null): string {
  const w = (wallpaper ?? "").trim();
  if (!w) return "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
  // An explicit CSS value (gradient, url(), colour) is passed through — the
  // caller already said what it wanted.
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

/**
 * "3 minutes ago" for a timestamp.
 *
 * Uses Intl.RelativeTimeFormat so Arabic renders correctly rather than as an
 * English string with Arabic punctuation — this shell is bilingual and the
 * notification centre is one of its most-read surfaces.
 */
export function formatRelativeTime(value: string | number | Date, locale?: string): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800],
    ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1],
  ];
  const lang =
    locale ??
    (typeof document !== "undefined" ? document.documentElement.lang : "") ??
    "en";
  const rtf = new Intl.RelativeTimeFormat(lang || "en", { numeric: "auto" });
  for (const [unit, secsPer] of units) {
    if (Math.abs(secs) >= secsPer || unit === "second") {
      return rtf.format(Math.trunc(secs / secsPer), unit);
    }
  }
  return "";
}
