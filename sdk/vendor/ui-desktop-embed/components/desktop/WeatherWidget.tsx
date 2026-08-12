'use client'

// WeatherWidget — a compact top-bar weather readout (icon + temperature). Data
// is prop-driven so the consuming app can wire any source (e.g. the weather OS
// app / open-meteo). Renders nothing until data arrives (keeps the bar clean).

import * as React from "react";
import { Icon, type IconProps } from "../../icons";
type IconProps2 = Omit<IconProps, "name">;
const Cloud = (p: IconProps2) => <Icon name="Cloud" {...p} />;
const CloudRain = (p: IconProps2) => <Icon name="CloudRain" {...p} />;
const CloudSnow = (p: IconProps2) => <Icon name="CloudSnow" {...p} />;
const CloudLightning = (p: IconProps2) => <Icon name="CloudLightning" {...p} />;
const Sun = (p: IconProps2) => <Icon name="Sun" {...p} />;
const CloudSun = (p: IconProps2) => <Icon name="CloudSun" {...p} />;
const CloudFog = (p: IconProps2) => <Icon name="CloudFog" {...p} />;

export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog" | "partly";

export interface WeatherData {
  /** Temperature already formatted's numeric value (°). */
  temp: number;
  condition: WeatherCondition;
  location?: string;
  /** Unit label, default "°". */
  unit?: string;
}

const ICONS: Record<WeatherCondition, React.ComponentType<{ className?: string }>> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  fog: CloudFog,
};

export interface WeatherWidgetProps {
  weather?: WeatherData | null;
  onClick?: () => void;
  className?: string;
}

export function WeatherWidget({ weather, onClick, className }: WeatherWidgetProps) {
  if (!weather) return null;
  const Icon = ICONS[weather.condition] ?? Cloud;
  return (
    <button
      type="button"
      onClick={onClick}
      title={weather.location ? `${weather.location} — ${weather.condition}` : weather.condition}
      className={["flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-white/10", className].filter(Boolean).join(" ")}
    >
      <Icon className="h-4 w-4" />
      <span className="tabular-nums">{Math.round(weather.temp)}{weather.unit ?? "°"}</span>
    </button>
  );
}

WeatherWidget.displayName = "WeatherWidget";
