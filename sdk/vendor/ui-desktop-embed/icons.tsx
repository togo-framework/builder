// Inlined icon set for the embedded shell.
//
// WHY THIS FILE EXISTS
//
// The shell has a hard 300 KB gz budget. `lucide-react` is 132,299 B gz — 3.6x
// the ENTIRE current SDK bundle (36,665 B gz) — and it cannot be tree-shaken,
// because upstream resolves glyphs through `<DynamicIcon name={someString} />`.
// A name-keyed lookup means the compiler cannot know which names arrive at run
// time, so every glyph has to ship. That one indirection is the whole 132 KB.
//
// So the glyphs are inlined: the exact set this shell renders, and nothing
// else. Adding one is a line here, which is the point — the budget stays
// visible instead of being someone else's transitive dependency.
//
// The path data is copied VERBATIM from lucide-react rather than redrawn, so
// the family stays visually coherent with the rest of the togo kit and nobody
// has to eyeball-match a stroke join.
//
//   lucide-react v0.462.0 — ISC licensed.
//   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
//   part of Feather (MIT). All other copyright (c) for Lucide are held by
//   Lucide Contributors 2022.
//
// Generated from node_modules/lucide-react/dist/esm/icons/*.js — regenerate
// rather than hand-editing the arrays.

import * as React from "react";

/** A lucide node: [tag, attributes]. */
export type IconNode = [string, Record<string, string | number>][];

export const ICONS: Record<string, IconNode> = {
  Bell: [ ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }], ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0" }] ],
  Check: [["path", { d: "M20 6 9 17l-5-5" }]],
  CheckCheck: [ ["path", { d: "M18 6 7 17l-5-5" }], ["path", { d: "m22 10-7.5 7.5L13 16" }] ],
  Cloud: [ ["path", { d: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" }] ],
  CloudFog: [ ["path", { d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" }], ["path", { d: "M16 17H7" }], ["path", { d: "M17 21H9" }] ],
  CloudLightning: [ ["path", { d: "M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" }], ["path", { d: "m13 12-3 5h4l-3 5" }] ],
  CloudRain: [ ["path", { d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" }], ["path", { d: "M16 14v6" }], ["path", { d: "M8 14v6" }], ["path", { d: "M12 16v6" }] ],
  CloudSnow: [ ["path", { d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" }], ["path", { d: "M8 15h.01" }], ["path", { d: "M8 19h.01" }], ["path", { d: "M12 17h.01" }], ["path", { d: "M12 21h.01" }], ["path", { d: "M16 15h.01" }], ["path", { d: "M16 19h.01" }] ],
  CloudSun: [ ["path", { d: "M12 2v2" }], ["path", { d: "m4.93 4.93 1.41 1.41" }], ["path", { d: "M20 12h2" }], ["path", { d: "m19.07 4.93-1.41 1.41" }], ["path", { d: "M15.947 12.65a4 4 0 0 0-5.925-4.128" }], ["path", { d: "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" }] ],
  Image: [ ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }], ["circle", { cx: "9", cy: "9", r: "2" }], ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }] ],
  Info: [ ["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 16v-4" }], ["path", { d: "M12 8h.01" }] ],
  Layers: [ [ "path", { d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" } ], ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }], ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" }] ],
  LayoutGrid: [ ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1" }], ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1" }], ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1" }], ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1" }] ],
  LogOut: [ ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["polyline", { points: "16 17 21 12 16 7" }], ["line", { x1: "21", x2: "9", y1: "12", y2: "12" }] ],
  Minus: [["path", { d: "M5 12h14" }]],
  MonitorUp: [ ["path", { d: "m9 10 3-3 3 3" }], ["path", { d: "M12 13V7" }], ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }], ["path", { d: "M12 17v4" }], ["path", { d: "M8 21h8" }] ],
  MonitorX: [ ["path", { d: "m14.5 12.5-5-5" }], ["path", { d: "m9.5 12.5 5-5" }], ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }], ["path", { d: "M12 17v4" }], ["path", { d: "M8 21h8" }] ],
  Moon: [ ["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }] ],
  Palette: [ ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }], [ "path", { d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" } ] ],
  Pin: [ ["path", { d: "M12 17v5" }], [ "path", { d: "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" } ] ],
  PinOff: [ ["path", { d: "M12 17v5" }], ["path", { d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" }], ["path", { d: "m2 2 20 20" }], [ "path", { d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" } ] ],
  Plus: [ ["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }] ],
  Power: [ ["path", { d: "M12 2v10" }], ["path", { d: "M18.4 6.6a9 9 0 1 1-12.77.04" }] ],
  RefreshCw: [ ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }], ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M8 16H3v5" }] ],
  RotateCcw: [ ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }] ],
  Search: [ ["circle", { cx: "11", cy: "11", r: "8" }], ["path", { d: "m21 21-4.3-4.3" }] ],
  Settings: [ [ "path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" } ], ["circle", { cx: "12", cy: "12", r: "3" }] ],
  SquareArrowOutUpRight: [ ["path", { d: "M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" }], ["path", { d: "m21 3-9 9" }], ["path", { d: "M15 3h6v6" }] ],
  Sun: [ ["circle", { cx: "12", cy: "12", r: "4" }], ["path", { d: "M12 2v2" }], ["path", { d: "M12 20v2" }], ["path", { d: "m4.93 4.93 1.41 1.41" }], ["path", { d: "m17.66 17.66 1.41 1.41" }], ["path", { d: "M2 12h2" }], ["path", { d: "M20 12h2" }], ["path", { d: "m6.34 17.66-1.41 1.41" }], ["path", { d: "m19.07 4.93-1.41 1.41" }] ],
  Trash2: [ ["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }], ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }], ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }], ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }] ],
  User: [ ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }], ["circle", { cx: "12", cy: "7", r: "4" }] ],
  X: [ ["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }] ],
};

export type IconName = keyof typeof ICONS;

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: number;
}

/**
 * Render a glyph by name.
 *
 * Unknown names do NOT render a missing-icon box. A third-party app can declare
 * any icon string it likes, and a blank square in the dock is indistinguishable
 * from a broken app — so an unresolved name falls back to a lettered tile built
 * from the label (see `iconFallbackLetter`).
 */
export function Icon({ name, size = 20, ...rest }: IconProps) {
  const nodes = ICONS[name];
  if (!nodes) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {nodes.map(([Tag, attrs], i) => React.createElement(Tag, { key: i, ...attrs }))}
    </svg>
  );
}

export const hasIcon = (name: string): boolean => name in ICONS;

/**
 * The first GRAPHEME of a label, uppercased, for the unknown-app tile.
 *
 * Intl.Segmenter rather than `.charAt(0)`: an Arabic or emoji app name is
 * multi-byte, and charAt would slice a surrogate pair or a combining sequence in
 * half and render a replacement character. This shell is bilingual by
 * requirement, so that is a guaranteed bug, not a theoretical one.
 */
export function iconFallbackLetter(label: string): string {
  const s = (label ?? "").trim();
  if (!s) return "?";
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = seg.segment(s)[Symbol.iterator]().next();
    return (first.done ? s[0] : first.value.segment).toLocaleUpperCase();
  } catch {
    return [...s][0].toLocaleUpperCase();
  }
}
