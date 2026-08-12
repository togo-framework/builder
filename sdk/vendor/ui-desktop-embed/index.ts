// ui-desktop-embed — a vendored fork of @togo-framework/ui-desktop, adapted to
// render inside the FeedbackOS shell document rather than owning the page.
//
// Every dependency crosses one seam (./ui-core). @togo-framework/ui-auth is no
// longer a dependency at all — see the note on OSLoginScreen below.

export { DesktopShell } from "./components/desktop/DesktopShell";
export type { DesktopShellProps, DesktopApi } from "./components/desktop/DesktopShell";
export { TopBar } from "./components/desktop/TopBar";
export type { TopBarProps } from "./components/desktop/TopBar";
export { NotificationBell } from "./components/desktop/NotificationBell";
export type { NotificationBellProps, OSNotification } from "./components/desktop/NotificationBell";
export { Dock } from "./components/desktop/Dock";
export type { DockProps } from "./components/desktop/Dock";
export { DesktopIconGrid } from "./components/desktop/DesktopIconGrid";
export type { DesktopIconGridProps, IconPos } from "./components/desktop/DesktopIconGrid";
export { DesktopIcon } from "./components/desktop/DesktopIcon";
export type { DesktopIconProps } from "./components/desktop/DesktopIcon";
export { DesktopContextMenu } from "./components/desktop/DesktopContextMenu";
export type { DesktopContextMenuProps, DesktopContextAction } from "./components/desktop/DesktopContextMenu";
export { Window, WindowSpinner, clampWindowRect } from "./components/desktop/Window";
export type { WindowProps, WindowRect } from "./components/desktop/Window";
export { WindowManager, WindowManagerProvider, useWindowManager, useWindowSection } from "./components/desktop/WindowManager";
export type { WindowManagerContextValue, OpenWindowOptions, WindowSection } from "./components/desktop/WindowManager";
// OSLoginScreen is deliberately NOT part of this fork.
//
// It is upstream's answer for `togo new <app> --frontend os`, where the desktop
// IS the product and therefore owns sign-in. FeedbackOS overlays a site whose
// visitor is already authenticated or deliberately anonymous — there is no
// moment at which the widget should present a lock screen over somebody else's
// page. Dropping it also drops the entire @togo-framework/ui-auth dependency
// (7 symbols), which was the fork's only reason to touch that package.
export { TogoMenu } from "./components/desktop/TogoMenu";
export type { TogoMenuProps } from "./components/desktop/TogoMenu";
export { WeatherWidget } from "./components/desktop/WeatherWidget";
export type { WeatherWidgetProps, WeatherData, WeatherCondition } from "./components/desktop/WeatherWidget";
export { Launchpad } from "./components/desktop/Launchpad";
export type { LaunchpadProps } from "./components/desktop/Launchpad";
export { Spotlight, SpotlightTrigger } from "./components/desktop/Spotlight";
export type { SpotlightProps } from "./components/desktop/Spotlight";
export { NotificationCenter } from "./components/desktop/NotificationCenter";
export type { NotificationCenterProps } from "./components/desktop/NotificationCenter";

// ── desktop hooks ──
export { useOSSession } from "./hooks/useOSSession";
export type { DesktopPrefs, UseOSSessionResult } from "./hooks/useOSSession";
export { useOSApps } from "./hooks/useOSApps";
export type { OSApp, OSAppWindow, UseOSAppsResult } from "./hooks/useOSApps";
