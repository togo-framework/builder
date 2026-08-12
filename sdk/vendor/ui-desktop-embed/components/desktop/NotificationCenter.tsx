'use client'

// NotificationCenter — a macOS-style right-side "sideover" panel listing the
// user's notifications. Opened by clicking the top-bar clock (or the bell).
// Transport-agnostic: the consuming app feeds notifications + callbacks.

import * as React from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../ui-core";
import { Button } from "../../ui-core";
import { ScrollArea } from "../../ui-core";
import { formatRelativeTime } from "../../ui-core";
import type { OSNotification } from "./NotificationBell";

export interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: OSNotification[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onNavigate?: (url: string) => void;
  /** Optional slot rendered at the top (e.g. a weather / calendar widget). */
  header?: React.ReactNode;
}

export function NotificationCenter({
  open,
  onOpenChange,
  notifications,
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  header,
}: NotificationCenterProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 border-white/10 bg-background/95 p-0 backdrop-blur-xl sm:max-w-sm">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notifications
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </SheetTitle>
          {notifications.length > 0 && onMarkAllRead && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onMarkAllRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </SheetHeader>

        {header && <div className="border-b border-border p-4">{header}</div>}

        <ScrollArea className="h-[calc(100vh-8rem)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">You're all caught up</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={cnRow(n.read)}
                  onClick={() => {
                    if (!n.read) onMarkRead?.(n.id);
                    if (n.action_url) onNavigate?.(n.action_url);
                  }}
                >
                  <div className="flex items-start gap-3">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                    <div className={n.read ? "ps-5" : ""}>
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground/70">{formatRelativeTime(n.created_at)}</p>
                    </div>
                    {!n.read && onMarkRead && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                        className="ms-auto text-muted-foreground hover:text-foreground"
                        title="Mark read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function cnRow(read: boolean): string {
  return [
    "cursor-pointer px-4 py-3 transition-colors hover:bg-accent/50",
    read ? "opacity-70" : "",
  ].filter(Boolean).join(" ");
}

NotificationCenter.displayName = "NotificationCenter";
