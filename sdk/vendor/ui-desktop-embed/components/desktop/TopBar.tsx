'use client'

// TopBar — the OS menu bar. Leading side: the togo "Apple menu" (About /
// Settings / power / logout). Trailing side: weather, a Spotlight search
// trigger, the ThemePicker, a notification bell, an avatar menu, and the live
// clock (moved to the far end, macOS-style, and clickable to open the
// Notification Center sideover).

import * as React from "react";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const LogOut = (p: IconProps2) => <Icon name="LogOut" {...p} />;
const User = (p: IconProps2) => <Icon name="User" {...p} />;
import { Avatar, AvatarFallback } from "../../ui-core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui-core";
import type { OSNotification } from "./NotificationBell";
import { TogoMenu, type TogoMenuProps } from "./TogoMenu";
import { WeatherWidget, type WeatherData } from "./WeatherWidget";
import { SpotlightTrigger } from "./Spotlight";
import { cn } from "../../ui-core";

export interface TopBarProps {
  me: { email: string } | null;
  onLogout: () => void;
  onProfile?: () => void;

  // togo (Apple-style) menu — omit to hide the leading menu.
  menu?: Omit<TogoMenuProps, "onLogout"> & { enabled?: boolean };

  // Notifications
  notifications?: OSNotification[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onFetchNotifications?: () => void;
  onNavigate?: (url: string) => void;
  /** Clicking the clock (and, if provided, the bell) opens the notification center. */
  onOpenNotifications?: () => void;

  // Spotlight
  onOpenSpotlight?: () => void;

  // Weather
  weather?: WeatherData | null;
  onWeatherClick?: () => void;

  className?: string;
}

function useClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar({
  me,
  onLogout,
  onProfile,
  menu,
  onOpenNotifications,
  onOpenSpotlight,
  weather,
  onWeatherClick,
  className,
}: TopBarProps) {
  const now = useClock();
  const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const initial = me?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-between gap-3 bg-black/25 px-2 text-xs text-white backdrop-blur-lg",
        className,
      )}
    >
      {/* Leading: togo menu */}
      <div className="flex items-center gap-1">
        {menu?.enabled !== false && (
          <TogoMenu {...menu} onLogout={onLogout} />
        )}
      </div>

      {/* Trailing: weather · spotlight · avatar · clock */}
      <div className="flex items-center gap-0.5">
        <WeatherWidget weather={weather} onClick={onWeatherClick} className="text-white/90" />

        {onOpenSpotlight && (
          <SpotlightTrigger
            onClick={onOpenSpotlight}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/90 transition hover:bg-white/10"
          />
        )}

        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 outline-none transition hover:bg-white/10">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-white/20 text-[10px] text-white">{initial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{me.email}</div>
              <DropdownMenuSeparator />
              {onProfile && (
                <DropdownMenuItem onClick={onProfile}>
                  <User className="me-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={onLogout}>
                <LogOut className="me-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clock — far end, click to open the Notification Center (macOS-style). */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="flex items-center gap-2 rounded-md px-2 py-1 font-medium transition hover:bg-white/10"
          title="Open Notification Center"
        >
          <span className="hidden text-white/80 sm:inline">{dateStr}</span>
          <span>{clock}</span>
        </button>
      </div>
    </div>
  );
}

TopBar.displayName = "TopBar";
