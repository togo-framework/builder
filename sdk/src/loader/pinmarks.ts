// Persistent outlines over the elements a report has pinned.
//
// Pinning without a mark is an act of faith: the reporter clicks something, a
// chip appears reading "Sponsor on GitHub", and nothing on the page confirms
// that the widget understood which element they meant. The chip is a label, not
// evidence — and when two buttons share a label it is not even that.
//
// These live in the HOST document rather than in the shell, because the shell's
// overlay is clipped to its own opaque rects: a mark drawn in there would be
// invisible everywhere except behind an open window, which is the one place it
// is not wanted.
//
// `highlight()` in picker.ts is the panel's version of this and cannot be
// reused: it flashes for three seconds using a `builder-pin-found` class that
// the PANEL injects into the host document. In shell mode the panel never
// mounts, so that class has no styles and the flash is invisible.

import { resolve, MIN_CONFIDENCE } from "../anchor";
import type { PinAnchor } from "../types";

const CONTAINER_ID = "fos-pin-marks";

/** Marks currently drawn, so a re-render can reposition rather than duplicate. */
let tracked: { anchor: PinAnchor; el: Element; box: HTMLElement }[] = [];
let raf = 0;

/**
 * Draw a mark over each pinned element, replacing whatever was drawn before.
 *
 * The shell owns the list — it is the side that knows which chips the reporter
 * has kept — so this is a full replace rather than an add, and removing a chip
 * removes its mark without any separate message.
 */
export function showPins(anchors: PinAnchor[]): void {
  clear();
  if (!anchors.length || typeof document === "undefined") return;

  const root = document.createElement("div");
  root.id = CONTAINER_ID;
  // data-builder-hide keeps these OUT of screenshots: capture.ts filters on it.
  // A screenshot of the page wearing the widget's own annotations is a picture
  // of the widget, and the pin is already recorded structurally.
  root.setAttribute("data-builder-hide", "");
  root.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2147482500;";
  document.body.appendChild(root);

  anchors.forEach((anchor, i) => {
    const r = resolve(anchor);
    // Refuse a low-confidence match rather than outlining a guess. A mark on
    // the wrong element is worse than no mark: it is confidently wrong, and
    // whoever reads the report goes and fixes something that was never broken.
    if (!r.el || r.confidence < MIN_CONFIDENCE) return;

    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      "border:2px solid #6366f1",
      "border-radius:6px",
      "background:rgba(99,102,241,0.10)",
      "box-shadow:0 0 0 1px rgba(255,255,255,0.35)",
      "pointer-events:none",
      "transition:opacity .15s",
    ].join(";");

    const tag = document.createElement("span");
    tag.textContent = String(i + 1);
    tag.style.cssText = [
      "position:absolute",
      "top:-9px",
      "inset-inline-start:-9px",
      "min-width:18px",
      "height:18px",
      "display:grid",
      "place-items:center",
      "padding:0 5px",
      "border-radius:9px",
      "background:#6366f1",
      "color:#fff",
      "font:600 11px/1 system-ui,sans-serif",
    ].join(";");
    box.appendChild(tag);

    root.appendChild(box);
    tracked.push({ anchor, el: r.el, box });
  });

  if (!tracked.length) {
    clear();
    return;
  }
  position();
  // The page scrolls, resizes, and re-lays-out under these. Following on rAF is
  // the same approach the region reporter uses and costs nothing when the marks
  // are not moving, because only the transform is written.
  const follow = () => {
    position();
    raf = requestAnimationFrame(follow);
  };
  raf = requestAnimationFrame(follow);
}

/** Remove every mark. Safe to call when none are drawn. */
export function clear(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  tracked = [];
  document.getElementById(CONTAINER_ID)?.remove();
}

function position(): void {
  const sx = window.scrollX;
  const sy = window.scrollY;
  for (const t of tracked) {
    const r = t.el.getBoundingClientRect();
    // An element that has scrolled out of its own container, or been hidden,
    // reports a zero box. Hiding the mark beats drawing a 0x0 dot at the
    // top-left corner of the document.
    const gone = r.width === 0 && r.height === 0;
    t.box.style.opacity = gone ? "0" : "1";
    if (gone) continue;
    // Document coordinates: the container is absolutely positioned in the page,
    // so it stays put while the page scrolls beneath a fixed viewport.
    t.box.style.transform = `translate(${r.left + sx}px, ${r.top + sy}px)`;
    t.box.style.width = `${r.width}px`;
    t.box.style.height = `${r.height}px`;
  }
}
