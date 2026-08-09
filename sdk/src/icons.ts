// Inline lucide icons for the widget.
//
// The panel used emoji as icons (📍 ✎ 📎 🖼 ✕ 👁). Emoji are not icons: they
// render in the host's emoji font, so the same glyph is a flat outline on one
// platform and a full-colour cartoon on another, they cannot inherit
// currentColor, they sit on a different baseline from the label beside them,
// and several are announced by screen readers with names that have nothing to
// do with the action ("round pushpin" for "pin an element").
//
// These are lucide's own node lists (lucide-react v0.462.0, ISC — inlining is
// permitted), copied verbatim rather than imported: this bundle ships into
// somebody else's page with no React and no dependency graph, and pulling
// lucide-react in for twenty glyphs would cost more than the entire widget.
// Copied as [element, attributes] pairs, NOT flattened to path data: half of
// lucide's glyphs are rects, circles and lines, and redrawing those as
// hand-approximated paths is what made the previous set look assembled rather
// than chosen. Every entry below is the untouched 24x24 / stroke-2 original,
// so the set holds together as one family at any size.

const NS = "http://www.w3.org/2000/svg";

/** lucide's iconNode shape: [element tag, attributes]. */
type IconNode = ReadonlyArray<readonly [string, Record<string, string>]>;

// Keys are the widget's OWN vocabulary (what the glyph means here), not the
// lucide name — call sites say icon("agents"), and swapping which glyph
// "agents" is must never require touching them. The lucide source icon is
// named on each entry.
const ICONS = {
  // message-square-text — the widget's identity: feedback attached to a page.
  messageSquare: [
    ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }],
    ["path", { d: "M13 8H7" }],
    ["path", { d: "M17 12H7" }],
  ],
  // x
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  // plus
  plus: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "M12 5v14" }],
  ],
  // map-pin
  pin: [
    ["path", { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" }],
    ["circle", { cx: "12", cy: "10", r: "3" }],
  ],
  // paperclip
  paperclip: [
    ["path", { d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" }],
  ],
  // camera — the screenshot action. The previous "image" glyph promised a
  // gallery; this one names the capture.
  camera: [
    ["path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }],
    ["circle", { cx: "12", cy: "13", r: "3" }],
  ],
  // eye — "show me the pinned element" (issue detail).
  eye: [
    ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  // arrow-right — the board link. Mirrored in RTL by CSS, not by a second glyph.
  arrowRight: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m12 5 7 7-7 7" }],
  ],
  // chevron-right — the issue rows' "this opens" affordance.
  chevronRight: [
    ["path", { d: "m9 18 6-6-6-6" }],
  ],

  // ---- the launcher's ten surfaces ----------------------------------------
  // One glyph each, chosen so the shapes stay apart at 18px — a launcher whose
  // icons are only distinguishable by colour is a colour picker, not a
  // launcher.
  //
  // bot
  agents: [
    ["path", { d: "M12 8V4H8" }],
    ["rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }],
    ["path", { d: "M2 14h2" }],
    ["path", { d: "M20 14h2" }],
    ["path", { d: "M15 13v2" }],
    ["path", { d: "M9 13v2" }],
  ],
  // graduation-cap
  skills: [
    ["path", { d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" }],
    ["path", { d: "M22 10v6" }],
    ["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" }],
  ],
  // list-todo
  issues: [
    ["rect", { x: "3", y: "5", width: "6", height: "6", rx: "1" }],
    ["path", { d: "m3 17 2 2 4-4" }],
    ["path", { d: "M13 6h8" }],
    ["path", { d: "M13 12h8" }],
    ["path", { d: "M13 18h8" }],
  ],
  // vault — the literal thing, not key-round standing in for it.
  vault: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
    ["circle", { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" }],
    ["path", { d: "m7.9 7.9 2.7 2.7" }],
    ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor" }],
    ["path", { d: "m13.4 10.6 2.7-2.7" }],
    ["circle", { cx: "7.5", cy: "16.5", r: ".5", fill: "currentColor" }],
    ["path", { d: "m7.9 16.1 2.7-2.7" }],
    ["circle", { cx: "16.5", cy: "16.5", r: ".5", fill: "currentColor" }],
    ["path", { d: "m13.4 13.4 2.7 2.7" }],
    ["circle", { cx: "12", cy: "12", r: "2" }],
  ],
  // rss — feeds coming in.
  sources: [
    ["path", { d: "M4 11a9 9 0 0 1 9 9" }],
    ["path", { d: "M4 4a16 16 0 0 1 16 16" }],
    ["circle", { cx: "5", cy: "19", r: "1" }],
  ],
  // library-big — the label says Library, so the icon shows shelved books; the
  // plain "library" variant is four bare lines that vanish at this size.
  docs: [
    ["rect", { width: "8", height: "18", x: "3", y: "3", rx: "1" }],
    ["path", { d: "M7 3v18" }],
    ["path", { d: "M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" }],
  ],
  // brain
  brain: [
    ["path", { d: "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" }],
    ["path", { d: "M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" }],
    ["path", { d: "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" }],
    ["path", { d: "M17.599 6.5a3 3 0 0 0 .399-1.375" }],
    ["path", { d: "M6.003 5.125A3 3 0 0 0 6.401 6.5" }],
    ["path", { d: "M3.477 10.896a4 4 0 0 1 .585-.396" }],
    ["path", { d: "M19.938 10.5a4 4 0 0 1 .585.396" }],
    ["path", { d: "M6 18a4 4 0 0 1-1.967-.516" }],
    ["path", { d: "M19.967 17.484A4 4 0 0 1 18 18" }],
  ],
  // message-circle
  chat: [
    ["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }],
  ],
  // plug-zap — the MCP surface, where outside clients connect.
  mcp: [
    ["path", { d: "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" }],
    ["path", { d: "m2 22 3-3" }],
    ["path", { d: "M7.5 13.5 10 11" }],
    ["path", { d: "M10.5 16.5 13 14" }],
    ["path", { d: "m18 3-4 4h6l-4 4" }],
  ],
  // square-terminal
  terminal: [
    ["path", { d: "m7 11 2-2-2-2" }],
    ["path", { d: "M11 13h4" }],
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
  ],
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/**
 * icon builds an SVG element.
 *
 * aria-hidden always: every caller pairs it with a visible text label or puts
 * the accessible name on the control itself, so an announced icon would make a
 * screen reader read the action twice. Stroke is currentColor so it takes the
 * colour of whatever it sits in — the thing emoji could never do.
 */
export function icon(name: IconName, size = 14): SVGSVGElement {
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

  for (const [tag, attrs] of ICONS[name]) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

/**
 * label replaces a control's contents with an icon plus text.
 *
 * Used instead of assigning textContent, which is what the emoji version did —
 * and which would wipe out any child element, icon included.
 */
export function label(el: Element, name: IconName, text: string, size = 14): void {
  el.replaceChildren();
  el.appendChild(icon(name, size));
  const span = document.createElement("span");
  span.textContent = text;
  el.appendChild(span);
}
