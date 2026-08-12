'use client'

// DesktopShell — top-level OS-shell layout: full-bleed wallpaper background
// (image over gradient, from DesktopPrefs.wallpaper via `theme/wallpapers.ts`),
// a <TopBar/> (togo menu + weather + spotlight + clock→notifications), a content
// area with desktop icons + open <Window/>s, a <Dock/> (Launchpad + apps +
// Trash), a <Spotlight/> app launcher, and a <NotificationCenter/> sideover.
// Assumes a <ThemeProvider> sits above it (same convention as AppLayout).

import * as React from "react";
import { wallpaperCss } from "../../ui-core";
import { TopBar, type TopBarProps } from "./TopBar";
import { Dock } from "./Dock";
import { DesktopIconGrid } from "./DesktopIconGrid";
import { DesktopContextMenu, type DesktopContextAction } from "./DesktopContextMenu";
import { WindowManagerProvider, WindowManager, useWindowManager } from "./WindowManager";
import { Spotlight } from "./Spotlight";
import { Launchpad } from "./Launchpad";
import { NotificationCenter } from "./NotificationCenter";
import type { OSApp } from "../../hooks/useOSApps";
import type { DesktopPrefs } from "../../hooks/useOSSession";
import type { OSNotification } from "./NotificationBell";
import { cn } from "../../ui-core";

export interface DesktopShellProps {
  /** Current desktop preferences (wallpaper, dock_pinned, ...) — e.g. from useOSSession(). */
  prefs: DesktopPrefs;
  /** Installed apps — e.g. from useOSApps(). */
  apps: OSApp[];
  /** Renders window content for a given app slug. */
  renderApp: (app: OSApp) => React.ReactNode;
  /** Top-bar props (me / logout / weather / menu callbacks / notifications data). */
  topBar: Omit<TopBarProps, "className" | "onOpenSpotlight" | "onOpenNotifications">;
  /** Notifications for the sideover (same list the bell uses). */
  notifications?: OSNotification[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onNavigate?: (url: string) => void;
  onContextAction?: (action: DesktopContextAction) => void;
  /** Opens the Trash (dock). */
  onTrash?: () => void;
  /** Saved desktop-icon positions (DesktopPrefs.icon_positions). */
  iconPositions?: Record<string, { x: number; y: number }>;
  /** Persist a desktop-icon position after a drag. */
  onIconMove?: (slug: string, pos: { x: number; y: number }) => void;
  /** Slugs hidden from the desktop (DesktopPrefs.desktop_hidden). */
  desktopHidden?: string[];
  /** Remove an app icon from the desktop. */
  onRemoveDesktopIcon?: (slug: string) => void;
  /** Add an app icon back to the desktop (from Launchpad). */
  onAddDesktopIcon?: (slug: string) => void;
  /** Pin an app to the dock (from Launchpad). */
  onPinDock?: (slug: string) => void;
  /** Unpin an app from the dock (dock/Launchpad context menu). */
  onUnpinDock?: (slug: string) => void;
  /**
   * Called once the shell is mounted, with an imperative API so the host page
   * can open app windows from outside the shell (e.g. a top-bar shortcut).
   */
  onReady?: (api: DesktopApi) => void;
  className?: string;
}

/** Imperative handle exposed via DesktopShellProps.onReady. */
export interface DesktopApi {
  /**
   * Open (or restore/focus) a registered app by slug, optionally deep-linking to
   * a section inside it (e.g. open("prefs", "wallpaper") jumps Settings straight
   * to the Wallpaper pane). The app reads the target via useWindowSection().
   */
  open: (slug: string, section?: string) => void;
  /** Open (or restore/focus) an arbitrary window not backed by an installed app. */
  openWindow: (opts: {
    slug: string;
    title: string;
    icon?: string;
    width?: number;
    height?: number;
    content: React.ReactNode;
    section?: string;
  }) => void;
}

export function DesktopShell({
  prefs,
  apps,
  renderApp,
  topBar,
  notifications = [],
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  onContextAction,
  onTrash,
  onReady,
  iconPositions,
  onIconMove,
  desktopHidden,
  onRemoveDesktopIcon,
  onAddDesktopIcon,
  onPinDock,
  onUnpinDock,
  className,
}: DesktopShellProps) {
  const [spotlightOpen, setSpotlightOpen] = React.useState(false);
  const [launchpadOpen, setLaunchpadOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  return (
    <WindowManagerProvider>
      <div
        className={cn("fixed inset-0 overflow-hidden", className)}
        style={{ background: wallpaperCss(prefs.wallpaper) }}
      >
        <DesktopContent
          apps={apps}
          pinned={prefs.dock_pinned}
          renderApp={renderApp}
          topBar={topBar}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
          onNavigate={onNavigate}
          onContextAction={onContextAction}
          onTrash={onTrash}
          onReady={onReady}
          iconPositions={iconPositions}
          onIconMove={onIconMove}
          desktopHidden={desktopHidden}
          onRemoveDesktopIcon={onRemoveDesktopIcon}
          onAddDesktopIcon={onAddDesktopIcon}
          onPinDock={onPinDock}
          onUnpinDock={onUnpinDock}
          spotlightOpen={spotlightOpen}
          setSpotlightOpen={setSpotlightOpen}
          launchpadOpen={launchpadOpen}
          setLaunchpadOpen={setLaunchpadOpen}
          notifOpen={notifOpen}
          setNotifOpen={setNotifOpen}
        />
      </div>
    </WindowManagerProvider>
  );
}

// Content area — needs useWindowManager(), so it lives below the provider.
function DesktopContent({
  apps,
  pinned,
  renderApp,
  topBar,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  onContextAction,
  onTrash,
  onReady,
  iconPositions,
  onIconMove,
  desktopHidden,
  onRemoveDesktopIcon,
  onAddDesktopIcon,
  onPinDock,
  onUnpinDock,
  spotlightOpen,
  setSpotlightOpen,
  launchpadOpen,
  setLaunchpadOpen,
  notifOpen,
  setNotifOpen,
}: {
  apps: OSApp[];
  pinned: string[];
  renderApp: (app: OSApp) => React.ReactNode;
  topBar: DesktopShellProps["topBar"];
  notifications: OSNotification[];
  unreadCount: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onNavigate?: (url: string) => void;
  onContextAction?: (action: DesktopContextAction) => void;
  onTrash?: () => void;
  onReady?: (api: DesktopApi) => void;
  iconPositions?: Record<string, { x: number; y: number }>;
  onIconMove?: (slug: string, pos: { x: number; y: number }) => void;
  desktopHidden?: string[];
  onRemoveDesktopIcon?: (slug: string) => void;
  onAddDesktopIcon?: (slug: string) => void;
  onPinDock?: (slug: string) => void;
  onUnpinDock?: (slug: string) => void;
  spotlightOpen: boolean;
  setSpotlightOpen: (v: boolean) => void;
  launchpadOpen: boolean;
  setLaunchpadOpen: (v: boolean) => void;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
}) {
  const wm = useWindowManager();
  const bySlug = React.useMemo(() => new Map(apps.map((a) => [a.slug, a])), [apps]);

  const launch = React.useCallback(
    (slug: string, section?: string) => {
      const app = bySlug.get(slug);
      if (!app) return;
      if (wm.isOpen(slug)) {
        // Already open — restore (if minimized) and bring to front, without
        // remounting its content. Re-target its section if a deep-link was given.
        wm.restore(slug);
        if (section) wm.setSection(slug, section);
        return;
      }
      wm.open(slug, {
        title: app.name,
        icon: app.icon,
        resizable: app.window?.resizable ?? true,
        width: app.window?.width,
        height: app.window?.height,
        content: renderApp(app),
        section,
      });
    },
    [bySlug, wm, renderApp],
  );

  const openWindow = React.useCallback(
    (opts: { slug: string; title: string; icon?: string; width?: number; height?: number; content: React.ReactNode; section?: string }) => {
      if (wm.isOpen(opts.slug)) {
        wm.restore(opts.slug);
        if (opts.section) wm.setSection(opts.slug, opts.section);
        return;
      }
      wm.open(opts.slug, { title: opts.title, icon: opts.icon, width: opts.width, height: opts.height, content: opts.content, section: opts.section });
    },
    [wm],
  );

  // Expose an imperative opener to the host page (top-bar shortcuts, etc.).
  const onReadyRef = React.useRef(onReady);
  onReadyRef.current = onReady;
  React.useEffect(() => {
    onReadyRef.current?.({ open: launch, openWindow });
  }, [launch, openWindow]);

  const openSlugs = wm.windows.map((w) => w.slug);
  // Dock: pinned apps, or every installed app when nothing is pinned yet.
  const dockSlugs = pinned.length > 0 ? pinned : apps.map((a) => a.slug);

  return (
    <>
      <TopBar
        {...topBar}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onNavigate={onNavigate}
        onOpenSpotlight={() => setSpotlightOpen(true)}
        onOpenNotifications={() => setNotifOpen(true)}
      />

      <DesktopContextMenu onAction={(a) => onContextAction?.(a)} className="absolute inset-0 top-9">
        <div className="relative h-full w-full">
          <DesktopIconGrid
            apps={apps}
            onOpen={launch}
            positions={iconPositions}
            onMove={onIconMove}
            hidden={desktopHidden}
            onRemove={onRemoveDesktopIcon}
          />
        </div>
      </DesktopContextMenu>

      <WindowManager />

      <Dock
        apps={apps}
        pinned={dockSlugs}
        openSlugs={openSlugs}
        onLaunch={launch}
        onCloseApp={(slug) => wm.close(slug)}
        onUnpin={onUnpinDock}
        onLaunchpad={() => setLaunchpadOpen(true)}
        onTrash={onTrash}
      />

      <Launchpad
        open={launchpadOpen}
        onOpenChange={setLaunchpadOpen}
        apps={apps}
        pinned={dockSlugs}
        hidden={desktopHidden}
        onLaunch={launch}
        onPin={onPinDock}
        onUnpin={onUnpinDock}
        onAddToDesktop={onAddDesktopIcon}
        onRemoveFromDesktop={onRemoveDesktopIcon}
      />

      <Spotlight open={spotlightOpen} onOpenChange={setSpotlightOpen} apps={apps} onLaunch={launch} />

      <NotificationCenter
        open={notifOpen}
        onOpenChange={setNotifOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onNavigate={onNavigate}
      />
    </>
  );
}

DesktopShell.displayName = "DesktopShell";
