'use client'

// NotificationBell — bell icon + unread badge + a popover list of
// notifications. Transport-agnostic: the consuming app wires onFetch/onMarkRead
// /onMarkAllRead to its own /api/notifications* endpoints (notification-center
// plugin) — this component holds no fetch logic of its own.

import * as React from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "../../ui-core";
import { Badge } from "../../ui-core";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui-core";
import { ScrollArea } from "../../ui-core";
import { cn } from "../../ui-core";
import { formatRelativeTime } from "../../ui-core";

export interface OSNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  action_url?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationBellProps {
  notifications: OSNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** Called when the popover is opened — the consumer fetches fresh data. */
  onFetch?: () => void;
  onNavigate?: (url: string) => void;
  className?: string;
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onFetch,
  onNavigate,
  className,
}: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onFetch?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative h-8 w-8", className)} aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[9px] leading-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="text-sm font-medium text-foreground">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="p-1.5">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read) onMarkRead(n.id);
                    if (n.action_url) onNavigate?.(n.action_url);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-start hover:bg-muted",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="text-xs font-medium text-foreground">{n.title}</span>
                  </span>
                  {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                  <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

NotificationBell.displayName = "NotificationBell";
