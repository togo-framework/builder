// Inline SVG icons for the widget.
//
// The panel used emoji as icons (📍 ✎ 📎 🖼 ✕ 👁). Emoji are not icons: they
// render in the host's emoji font, so the same glyph is a flat outline on one
// platform and a full-colour cartoon on another, they cannot inherit
// currentColor, they sit on a different baseline from the label beside them,
// and several are announced by screen readers with names that have nothing to
// do with the action ("round pushpin" for "pin an element").
//
// The kit uses lucide, and these are the same lucide paths. They are inlined
// rather than imported because this bundle ships into somebody else's page with
// no React and no dependency graph — pulling lucide-react in for six glyphs
// would cost more than the entire widget.

const NS = "http://www.w3.org/2000/svg";

// lucide, 24x24, stroke-based. Only the `d` attributes are needed.
const PATHS: Record<string, string[]> = {
  // map-pin
  pin: ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4"],
  // x
  x: ["M18 6 6 18", "m6 6 12 12"],
  // paperclip
  paperclip: ["M13.234 20.252 21 12.3a3.53 3.53 0 0 0 0-5 3.53 3.53 0 0 0-5 0L4.32 18.98a5.3 5.3 0 0 0 0 7.5 5.3 5.3 0 0 0 7.5 0l8.49-8.49"],
  // image
  image: ["M15 8h.01", "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "m3 16 5-5c.928-.893 2.072-.893 3 0l5 5", "m14 14 1-1c.928-.893 2.072-.893 3 0l3 3"],
  // pencil
  pencil: ["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"],
  // eye
  eye: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6"],
  // arrow-right
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],

  // The four builder surfaces, for the launcher. One glyph each, chosen so the
  // shapes stay apart at 20px — a launcher whose icons are only distinguishable
  // by colour is a colour picker, not a launcher.
  //
  // bot
  agents: ["M12 8V4H8", "M2 14h2", "M20 14h2", "M15 13v2", "M9 13v2", "M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2"],
  // graduation-cap
  skills: ["M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z", "M22 10v6", "M6 12.5V16a6 3 0 0 0 12 0v-3.5"],
  // list-todo
  issues: ["M13 5h8", "M13 12h8", "M13 19h8", "m3 17 2 2 4-4", "M3 7h6v-4H3z"],
  // key-round
  vault: ["M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z", "M16.5 7.5h.01"],

  // plug-zap — the MCP surface, where outside clients connect.
  mcp: ["M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z", "m2 22 3-3", "M7.5 13.5 10 11", "M10.5 16.5 13 14", "m18 3-4 4h6l-4 4", "M22 2 12 12"],

  // external-link, for the launcher's "open in a tab" affordance.
  external: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
};

/**
 * icon builds an SVG element.
 *
 * aria-hidden always: every caller pairs it with a visible text label, so an
 * announced icon would make a screen reader read the action twice. Stroke is
 * currentColor so it takes the colour of whatever it sits in — the thing emoji
 * could never do.
 */
export function icon(name: keyof typeof PATHS, size = 14): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("ico");

  for (const d of PATHS[name] ?? []) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * label replaces a control's contents with an icon plus text.
 *
 * Used instead of assigning textContent, which is what the emoji version did —
 * and which would wipe out any child element, icon included.
 */
export function label(el: Element, name: keyof typeof PATHS, text: string, size = 14): void {
  el.replaceChildren();
  el.appendChild(icon(name, size));
  const span = document.createElement("span");
  span.textContent = text;
  el.appendChild(span);
}
