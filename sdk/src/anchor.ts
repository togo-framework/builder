import type { PinAnchor } from "./types";

/** Elements the SDK owns. Never pinnable, never captured in a screenshot. */
export const OWN_MARKER = "data-builder-sdk";

export function isOurs(el: Element | null): boolean {
  return !!el?.closest?.(`[${OWN_MARKER}]`);
}

/**
 * Capture every re-resolution strategy for an element, most durable first.
 *
 * The reference implementation stores one CSS path. That path is built from
 * class names and `nth-of-type` indices, so it breaks on the first restyle and
 * — worse — after a list reorder it silently resolves to a *different* element.
 * A pin that confidently highlights the wrong component is more damaging than
 * one that admits it is lost, so we capture several independent signals and
 * score them at resolve time instead of trusting one.
 */
export function capture(el: Element): PinAnchor {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;

  const anchor: PinAnchor = {
    tag: el.tagName.toLowerCase(),
    hint: text(el),
    css: cssPath(el),
    // Fractions, not pixels: a pin captured on a laptop must still mean
    // something when reopened on an external monitor.
    rect: { x: rect.left / vw, y: rect.top / vh, w: rect.width / vw, h: rect.height / vh },
    scrollY: window.scrollY,
    viewport: { w: vw, h: vh, dpr: window.devicePixelRatio || 1 },
    href: location.href.slice(0, 2048),
    verified: [],
  };

  const testid = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id");
  if (testid) anchor.testid = testid;
  if (el.id && !looksGenerated(el.id)) anchor.domId = el.id;

  const role = el.getAttribute("role") ?? implicitRole(el);
  if (role) anchor.role = role;
  const name = accessibleName(el);
  if (name) anchor.name = name;

  // Record which strategies actually identify this element uniquely *right now*.
  // A strategy that is already ambiguous on the page it was captured from will
  // never get better, and should not be trusted later.
  for (const [key, sel] of selectorsFor(anchor)) {
    try {
      const hits = document.querySelectorAll(sel);
      if (hits.length === 1 && hits[0] === el) anchor.verified!.push(key);
    } catch {
      /* an invalid selector is not worth failing a capture over */
    }
  }
  return anchor;
}

function selectorsFor(a: PinAnchor): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (a.testid) out.push(["testid", `[data-testid="${cssEscape(a.testid)}"]`]);
  if (a.domId) out.push(["domId", `#${cssEscape(a.domId)}`]);
  if (a.css) out.push(["css", a.css]);
  return out;
}

export interface Resolution {
  el: Element | null;
  /** Which strategy matched. */
  by: string;
  /** 0..1. Below MIN_CONFIDENCE the caller must refuse to highlight. */
  confidence: number;
}

/** Below this we say "the pinned element has changed" rather than guess. */
export const MIN_CONFIDENCE = 0.5;

/**
 * Re-resolve a captured anchor, scoring the match instead of trusting the
 * first selector that returns something.
 */
export function resolve(a: PinAnchor): Resolution {
  // 1. testid — durable across both restyle and reorder.
  if (a.testid) {
    const hits = qsa(`[data-testid="${cssEscape(a.testid)}"]`);
    if (hits.length === 1) return { el: hits[0], by: "testid", confidence: 1 };
    if (hits.length > 1) {
      const best = pickByGeometryAndText(hits, a);
      if (best) return { el: best, by: "testid+geometry", confidence: 0.8 };
    }
  }

  // 2. id — durable unless the framework generates it per render.
  if (a.domId) {
    const el = document.getElementById(a.domId);
    if (el) return { el, by: "id", confidence: 0.9 };
  }

  // 3. role + accessible name — survives restyle and usually reorder.
  if (a.role && a.name) {
    const hits = qsa(`[role="${cssEscape(a.role)}"]`).filter(
      (el) => accessibleName(el) === a.name,
    );
    if (hits.length === 1) return { el: hits[0], by: "role+name", confidence: 0.85 };
    if (hits.length > 1) {
      const best = pickByGeometryAndText(hits, a);
      if (best) return { el: best, by: "role+name+geometry", confidence: 0.65 };
    }
  }

  // 4. CSS path — LAST resort. It can resolve to the wrong element after a
  //    reorder, so a match here only counts if the text still agrees.
  if (a.css) {
    const hits = qsa(a.css);
    if (hits.length === 1) {
      const el = hits[0];
      const agrees = !a.hint || similar(text(el), a.hint);
      return { el, by: "css", confidence: agrees ? 0.6 : 0.35 };
    }
  }

  // 5. Text alone. Weak, but better than pointing at nothing.
  if (a.hint) {
    const hits = qsa(a.tag || "*").filter((el) => similar(text(el), a.hint!));
    if (hits.length === 1) return { el: hits[0], by: "text", confidence: 0.45 };
  }

  return { el: null, by: "none", confidence: 0 };
}

/** Among several candidates, prefer the one closest in position and text. */
function pickByGeometryAndText(candidates: Element[], a: PinAnchor): Element | null {
  if (!a.rect) return null;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  let best: Element | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const dx = r.left / vw - a.rect.x;
    const dy = r.top / vh - a.rect.y;
    let score = Math.hypot(dx, dy);
    if (a.hint && similar(text(el), a.hint)) score -= 0.5; // text agreement is strong evidence
    if (score < bestScore) [best, bestScore] = [el, score];
  }
  return best;
}

function qsa(sel: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(sel)).filter((el) => !isOurs(el));
  } catch {
    return [];
  }
}

/**
 * A structural path. Deliberately avoids class names: utility-CSS class churn
 * would invalidate every stored pin on the next restyle.
 */
function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 6 && cur !== document.body; depth++) {
    if (cur.id && !looksGenerated(cur.id)) {
      parts.unshift(`#${cssEscape(cur.id)}`);
      break; // an id is an anchor point; nothing above it adds information
    }
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(cur) + 1})` : tag);
    cur = parent;
  }
  return parts.join(" > ").slice(0, 512);
}

/** React, Emotion and friends emit ids like `:r3:` or `mui-4821`. */
function looksGenerated(id: string): boolean {
  return /^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(id);
}

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

function accessibleName(el: Element): string {
  const label =
    el.getAttribute("aria-label") ??
    el.getAttribute("title") ??
    (el as HTMLInputElement).placeholder ??
    "";
  return (label || text(el)).slice(0, 80);
}

function implicitRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (tag === "input") return (el as HTMLInputElement).type === "checkbox" ? "checkbox" : "textbox";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (/^h[1-6]$/.test(tag)) return "heading";
  return "";
}

function cssEscape(s: string): string {
  return (window.CSS?.escape ?? ((x: string) => x.replace(/["\\\]]/g, "\\$&")))(s);
}
