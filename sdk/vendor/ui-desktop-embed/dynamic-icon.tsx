// DynamicIcon — the name-keyed lookup, resolved locally.
//
// Upstream's version comes from lucide-react and is why the whole icon library
// has to ship: it takes a runtime string, so the bundler cannot prove which
// glyphs are reachable and keeps all of them. Same signature here, backed by
// the inlined set, plus a fallback that makes an unknown name legible instead
// of blank.
//
// The fallback matters more than it looks. Apps are registered by third-party
// togo plugins (`os.RegisterApp`) with a free-text `Icon` field, so unknown
// names are the normal case, not the error case — and a dock full of empty
// squares reads as "the shell is broken", not "that plugin picked an icon we
// don't carry".

import * as React from "react";
import { Icon, hasIcon, iconFallbackLetter } from "./icons";

export interface DynamicIconProps extends React.SVGProps<SVGSVGElement> {
  /** A glyph name from the inlined set, or anything at all. */
  name?: string;
  size?: number;
  /**
   * Label the fallback letter is taken from. Defaults to `name`, which is
   * usually right — an app whose icon is "notes" gets an N.
   */
  label?: string;
}

export function DynamicIcon({ name, size = 20, label, className, ...rest }: DynamicIconProps) {
  const key = (name ?? "").trim();
  if (key && hasIcon(key)) {
    return <Icon name={key} size={size} className={className} {...rest} />;
  }

  // Lettered tile. Sized to the same box so dock/launchpad rows do not reflow
  // when one app happens to have an unknown icon.
  const letter = iconFallbackLetter(label || key || "?");
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        // `em` so the letter tracks whatever size the caller asked for.
        fontSize: `${Math.round(size * 0.62)}px`,
        fontWeight: 650,
        lineHeight: 1,
        userSelect: "none",
        // Never let a right-to-left ancestor reorder a single glyph, and never
        // let a long grapheme cluster spill the box.
        direction: "ltr",
        overflow: "hidden",
      }}
    >
      {letter}
    </span>
  );
}
