'use client'

// Dock — bottom, macOS-style, rounded floating bar. A Launchpad button opens
// Spotlight; then app icons (pinned + open) launch on click; then a Trash bin
// at the trailing end. Always visible.

import * as React from "react";
import { chromeStrings } from "../../strings";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const LayoutGrid = (p: IconProps2) => <Icon name="LayoutGrid" {...p} />;
const Trash2 = (p: IconProps2) => <Icon name="Trash2" {...p} />;
const SquareArrowOutUpRight = (p: IconProps2) => <Icon name="SquareArrowOutUpRight" {...p} />;
const X = (p: IconProps2) => <Icon name="X" {...p} />;
const PinOff = (p: IconProps2) => <Icon name="PinOff" {...p} />;
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
  /** Locale for the dock's own chrome (not the app names). */
  locale?: string;
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
  /**
   * Which edge the dock lives on.
   *
   * "vertical" pins it to the inline-START edge — left in LTR, right in RTL —
   * the way Ubuntu's launcher sits. That is not only a style choice here: this
   * shell floats over somebody else's page, and a horizontal dock lands in the
   * middle of the content column, while a vertical one sits in the margin
   * beside a centred layout and overlaps nothing.
   */
  orientation?: "horizontal" | "vertical";
  /**
   * Edge-to-edge rather than a floating pill.
   *
   * A floating dock reads as an overlay ON somebody's page; a full-height bar
   * flush to the edge reads as part of the chrome, which is what it is once the
   * page reserves space for it instead of being covered by it.
   */
  full?: boolean;
  className?: string;
}

interface DockButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  color?: string;
  isOpen?: boolean;
  /**
   * Shell chrome (Launchpad, Trash) rather than an app.
   *
   * These carried `color="var(--fos-surface-2)"` and inherited the app-icon
   * treatment — a coloured gradient with a WHITE glyph. In the light theme
   * that token is #eef1f4, so the Launchpad tile was white-on-near-white at
   * 1.13:1: the single entry point to every unpinned app, invisible.
   */
  chrome?: boolean;
  /** A side dock puts its labels beside the tile, not above it. */
  vertical?: boolean;
}

const DockButton = React.forwardRef<HTMLButtonElement, DockButtonProps>(
  ({ label, color, isOpen, chrome, vertical, children, ...rest }, ref) => {
    // A slate that stays dark in BOTH themes, which is what a white glyph
    // needs. The previous fallback was `var(--fos-surface-2)` — a surface
    // token that is near-white in light mode, so any app registered without a
    // colour got the same invisible tile the Launchpad had. The Launchpad's
    // own grid already used this exact literal for this exact reason.
    const base = color || "#64748b";
    return (
      <button
        ref={ref}
        type="button"
        aria-label={isOpen ? `${label} (open)` : label}
        {...rest}
        className={cn(
          "group relative flex flex-col items-center transition-transform duration-150 ease-out",
          // The nudge follows the dock's edge. Lifting a tile off a LEFT dock
          // moves it along the bar instead of out of it, which reads as a
          // wobble rather than a hover.
          vertical ? "hover:translate-x-1 rtl:hover:-translate-x-1" : "hover:-translate-y-1.5",
        )}
      >
        {/* The app's name, macOS-style, above the tile.
            `title` was doing this natively and invisibly: a native tooltip
            takes about a second of stillness and renders in the host's chrome
            style, which reads as "no tooltip" next to an OS dock. This one is
            ours, appears immediately, and is marked opaque so the loader's
            clip includes it — without that attribute it would paint into a
            region that is clipped away and be invisible no matter how correct
            the markup was. */}
        <span
          data-fos-opaque=""
          role="tooltip"
          className={cn(
            "pointer-events-none absolute hidden whitespace-nowrap rounded-md border border-[color:var(--fos-chrome-border)] bg-[color:var(--fos-chrome-bg)] px-2 py-1 text-xs font-medium text-[color:var(--fos-text)] group-hover:block group-focus-visible:block",
            // Beside the tile for a side dock, above it for a bottom one.
            //
            // `start-full` is logical, so the label sits to the RIGHT of a
            // left-hand dock and to the LEFT of the right-hand one an RTL page
            // gets — which is the only placement that does not point the label
            // off the edge of the screen.
            vertical
              ? "start-full top-1/2 ms-2 -translate-y-1/2"
              : "bottom-full mb-2",
          )}
        >
          {label}
        </span>
        {/* Solid squircle so the icon reads clearly on ANY wallpaper (macOS style):
            a color gradient fill, a white icon, an inset highlight ring. */}
        <span
          className={
            chrome
              ? // Chrome reads as chrome: a surface tile with FOREGROUND ink,
                // so it is legible in both themes and visibly not an app.
                "flex h-11 w-11 items-center justify-center rounded-md border border-[color:var(--fos-chrome-border)] bg-[color:var(--fos-surface-2)] text-[color:var(--fos-text)] transition-colors"
              : "flex h-11 w-11 items-center justify-center rounded-md text-white ring-1 ring-inset ring-white/25 transition-colors"
          }
          style={chrome ? undefined : { backgroundColor: `${base}` }}
        >
          <span>{children}</span>
        </span>
        <span className={cn(
          // bg-white/90 upstream: invisible against our near-white light chrome.
          "mt-1 h-1 w-1 rounded-full bg-[color:var(--fos-accent)] transition-opacity",
          isOpen ? "opacity-100" : "opacity-0",
        )} />
      </button>
    );
  },
);
DockButton.displayName = "DockButton";

export function Dock({ apps, pinned, openSlugs = [], onLaunch, onCloseApp, onUnpin, onLaunchpad, onTrash, locale, orientation = "horizontal", full = false, className }: DockProps) {
  const vertical = orientation === "vertical";
  const t = chromeStrings(locale);
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
    <div className={cn(
      "pointer-events-none fixed z-40 flex",
      vertical
        // start-3 rather than left-3: logical positioning, so an Arabic host
        // puts the launcher on the right where that reader expects it.
        ? full
          ? "inset-y-0 start-0 items-stretch justify-start"
          : "inset-y-0 start-3 items-center justify-start py-2"
        : "inset-x-0 bottom-3 justify-center px-2",
      className,
    )}>
      <div
        // The loader clips the overlay frame to the union of [data-fos-opaque]
        // rects. Without this the dock renders inside the shell and is clipped
        // away — present in the DOM, invisible on screen, impossible to click.
        // Every surface the shell actually paints must carry it.
        data-fos-opaque=""
        className={cn(
          // No overflow container. Two reasons, and the second is the one that
          // matters: `no-scrollbar` is an upstream project utility that does not
          // exist in this build, so the scrollbar was simply visible under the
          // tiles — and `overflow-x: auto` forces overflow-y to compute to auto
          // as well, which clipped every tooltip the moment it was added.
          //
          // The dock holds PINNED apps now, not all of them, so the list it has
          // to fit is short by construction. Everything else lives in the
          // Launchpad, which is the surface built for a long list.
          // items-CENTER, and real padding on all four sides. `items-end` with
          // px-2.5/py-2 left the tiles pressed against the container's edges and
          // sitting unevenly — the running-state dot under each tile is part of
          // the tile's box, so aligning to the end pushed the icons up while the
          // dots took the remaining room.
          // flex-wrap rather than an overflow container. Removing the scroll
          // fixed the scrollbar and the clipped tooltips, but left nothing to
          // stop a long pin list running past the viewport edge — where the
          // clip does not reach, so the tiles are both invisible and dead.
          // Wrapping grows the dock's own rect instead, which the clip follows.
          "pointer-events-auto flex flex-wrap items-center justify-center gap-2",
          // The wrap axis follows the orientation, and so does the cap that
          // stops a long pin list running past the edge where the clip does not
          // reach — off the bottom for a row, off the side for a column.
          vertical
            ? full
              // Flush to the edge: no rounding on the outer corners, no cap on
              // height, and the tiles start at the top rather than centring in
              // a column that is now the whole viewport.
              ? "h-full flex-col content-start justify-start overflow-y-auto rounded-none border-y-0 border-s-0 px-2.5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "max-h-[calc(100vh-2rem)] flex-col px-3 py-3.5"
            : "max-w-[calc(100vw-2rem)] px-3.5 py-3",
          // Upstream: `border-white/15 bg-black/25`. That reads correctly only
          // over a dark wallpaper the desktop owns. We float over an unknown
          // host — a white marketing page, a photo, a video — where 25% black
          // is a coin flip and the white hairline disappears entirely.
          "border border-[color:var(--fos-chrome-border)] bg-[color:var(--fos-chrome-bg)]",
        )}>
        {onLaunchpad && (
          <>
            <DockButton label={t.launchpad} chrome vertical={vertical} onClick={onLaunchpad}>
              <LayoutGrid className="h-5 w-5" />
            </DockButton>
            {(slugs.length > 0 || onTrash) && (
              // The separator turns with the dock: a vertical hairline between
              // stacked tiles is a line pointing the wrong way.
              <span className={cn(
                "self-center bg-[color:var(--fos-chrome-border)]",
                vertical ? "my-1 h-px w-9" : "mx-1 h-9 w-px",
              )} />
            )}
          </>
        )}

        {slugs.map((slug) => {
          const app = bySlug.get(slug)!;
          const running = openSlugs.includes(slug);
          return (
            <ContextMenu key={slug}>
              <ContextMenuTrigger asChild>
                <DockButton label={app.name} color={app.color} isOpen={running} vertical={vertical} onClick={() => onLaunch(slug)}>
                  <DynamicIcon name={app.icon} label={app.name} size={22} />
                </DockButton>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem onClick={() => onLaunch(slug)}>
                  <SquareArrowOutUpRight className="me-2 h-4 w-4" />
                  {running ? t.show : t.open}
                </ContextMenuItem>
                {onUnpin && (
                  <ContextMenuItem onClick={() => onUnpin(slug)}>
                    <PinOff className="me-2 h-4 w-4" />{t.removeFromDock}</ContextMenuItem>
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
