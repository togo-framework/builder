import { capture, isOurs, resolve, MIN_CONFIDENCE } from "./anchor";
import type { PinAnchor } from "./types";

/**
 * Element picker: the user clicks a component on the live page and we capture
 * a durable anchor to it.
 *
 * Runs against the host document rather than the shadow root, so it deliberately
 * adds and removes host classes. Everything it touches is undone on teardown.
 */
export function startPicker(onPick: (a: PinAnchor, el: Element) => void, onCancel: () => void) {
  let hovered: Element | null = null;
  document.body.classList.add("builder-pin-armed");

  const clear = () => {
    hovered?.classList.remove("builder-pin-hover");
    hovered = null;
  };

  const onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    // Never let the user pin the widget itself.
    if (!el || isOurs(el) || el === document.body || el === document.documentElement) {
      clear();
      return;
    }
    if (el === hovered) return;
    clear();
    hovered = el;
    el.classList.add("builder-pin-hover");
  };

  const onClick = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOurs(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const anchor = capture(el);
    teardown();
    onPick(anchor, el);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      teardown();
      onCancel();
    }
  };

  function teardown() {
    clear();
    document.body.classList.remove("builder-pin-armed");
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  }

  // Capture phase throughout: the host page's own handlers must not see these
  // events, or clicking to pin would also navigate.
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);

  return teardown;
}

export interface HighlightResult {
  found: boolean;
  by: string;
  confidence: number;
}

/**
 * Re-find a stored anchor and flash it.
 *
 * Refuses below MIN_CONFIDENCE. Confidently highlighting the wrong element is
 * worse than admitting the pin is stale: the reader trusts the highlight, and a
 * wrong one sends them to fix a component that was never broken.
 */
export function highlight(a: PinAnchor): HighlightResult {
  const r = resolve(a);
  if (!r.el || r.confidence < MIN_CONFIDENCE) {
    return { found: false, by: r.by, confidence: r.confidence };
  }
  const el = r.el;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("builder-pin-found");
  setTimeout(() => el.classList.remove("builder-pin-found"), 3000);
  return { found: true, by: r.by, confidence: r.confidence };
}
