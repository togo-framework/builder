'use client'

// DesktopContextMenu — right-click context menu wrapper around the desktop
// surface. Placeholder items only; the consuming app wires real behaviour
// via `onAction`.

import * as React from "react";
import { Image as ImageIcon, Palette, RefreshCw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui-core";

export type DesktopContextAction = "change-wallpaper" | "personalize" | "refresh";

export interface DesktopContextMenuProps {
  onAction: (action: DesktopContextAction) => void;
  children: React.ReactNode;
  className?: string;
}

export function DesktopContextMenu({ onAction, children, className }: DesktopContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className={className}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => onAction("change-wallpaper")}>
          <ImageIcon className="me-2 h-4 w-4" />
          Change wallpaper
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAction("personalize")}>
          <Palette className="me-2 h-4 w-4" />
          Personalize
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onAction("refresh")}>
          <RefreshCw className="me-2 h-4 w-4" />
          Refresh
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

DesktopContextMenu.displayName = "DesktopContextMenu";
