'use client'

// TogoMenu — the "Apple menu" of the togo desktop: a logo button in the top-bar
// leading corner that opens a dropdown (About, System Settings, Sleep / Restart
// / Shut Down, Log Out). All actions are prop-driven callbacks.

import * as React from "react";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const Layers = (p: IconProps2) => <Icon name="Layers" {...p} />;
const Info = (p: IconProps2) => <Icon name="Info" {...p} />;
const Settings = (p: IconProps2) => <Icon name="Settings" {...p} />;
const Moon = (p: IconProps2) => <Icon name="Moon" {...p} />;
const RotateCcw = (p: IconProps2) => <Icon name="RotateCcw" {...p} />;
const Power = (p: IconProps2) => <Icon name="Power" {...p} />;
const LogOut = (p: IconProps2) => <Icon name="LogOut" {...p} />;
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui-core";

export interface TogoMenuProps {
  /** Logo glyph (defaults to the togo layers mark). */
  logo?: React.ReactNode;
  label?: string;
  onAbout?: () => void;
  onSettings?: () => void;
  onSleep?: () => void;
  onRestart?: () => void;
  onShutDown?: () => void;
  onLogout?: () => void;
}

export function TogoMenu({
  logo,
  label = "togo",
  onAbout,
  onSettings,
  onSleep,
  onRestart,
  onShutDown,
  onLogout,
}: TogoMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold outline-none transition hover:bg-white/10">
        <span className="text-primary">{logo ?? <Layers className="h-4 w-4" />}</span>
        <span className="text-sm">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {onAbout && (
          <DropdownMenuItem onClick={onAbout}>
            <Info className="me-2 h-4 w-4" />
            About This Desktop
          </DropdownMenuItem>
        )}
        {onSettings && (
          <DropdownMenuItem onClick={onSettings}>
            <Settings className="me-2 h-4 w-4" />
            System Settings…
          </DropdownMenuItem>
        )}
        {(onAbout || onSettings) && (onSleep || onRestart || onShutDown || onLogout) && <DropdownMenuSeparator />}
        {onSleep && (
          <DropdownMenuItem onClick={onSleep}>
            <Moon className="me-2 h-4 w-4" />
            Sleep
          </DropdownMenuItem>
        )}
        {onRestart && (
          <DropdownMenuItem onClick={onRestart}>
            <RotateCcw className="me-2 h-4 w-4" />
            Restart…
          </DropdownMenuItem>
        )}
        {onShutDown && (
          <DropdownMenuItem onClick={onShutDown}>
            <Power className="me-2 h-4 w-4" />
            Shut Down…
          </DropdownMenuItem>
        )}
        {onLogout && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onLogout}>
              <LogOut className="me-2 h-4 w-4" />
              Log Out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

TogoMenu.displayName = "TogoMenu";
