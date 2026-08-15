// Borrow the host page's typeface.
//
// The shell renders in its own same-origin document, and a separate document
// inherits nothing — not the cascade, and not `@font-face`. So a widget sitting
// on a site with a carefully chosen Arabic face rendered in the system UI font
// instead, which reads as a third-party bolt-on no matter how well the colours
// match. Type is the single strongest signal that two surfaces belong together.
//
// Naming the family is not enough. `font-family: "IBM Plex Sans Arabic"` in the
// shell resolves to nothing unless that face is also LOADED in the shell's
// document, so the `@font-face` rules have to come across too.
//
// Only `@font-face` rules are copied. Importing the host's stylesheets wholesale
// would drag their entire cascade into the shell — resets, utility classes,
// `* { box-sizing }` — and the widget would inherit whatever the customer's CSS
// does to a `<button>`. Faces are the one part that is safe to share.

export interface HostFonts {
  /** The host's own font stack, verbatim from the computed style. */
  family?: string;
  /** `@font-face` rules, with relative urls made absolute. */
  faces: string[];
}

/** Beyond this, something is wrong and we are about to inline a whole icon font. */
const MAX_FACES = 40;
const MAX_CSS = 120_000;

/**
 * Read the host's typography.
 *
 * Never throws. A page whose stylesheets are all cross-origin yields the family
 * with no faces, which is still an improvement when the family is a web-safe or
 * already-loaded system font, and is never worse than ignoring the host.
 */
export function collectHostFonts(): HostFonts {
  const out: HostFonts = { faces: [] };
  if (typeof document === "undefined") return out;

  try {
    const body = getComputedStyle(document.body).fontFamily;
    // A page that never set a font computes to the browser default, which is
    // not a decision worth copying — the shell's own stack is better chosen.
    if (body && !/^(?:-webkit-)?(?:standard|serif|sans-serif|monospace)$/i.test(body.trim())) {
      out.family = body;
    }
  } catch {
    /* getComputedStyle before body exists. Nothing to read yet. */
  }

  let total = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      // A cross-origin stylesheet throws on .cssRules. Expected, not an error:
      // most sites load at least one font from a CDN.
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (out.faces.length >= MAX_FACES || total > MAX_CSS) return out;
      // Duck-typed rather than `instanceof CSSFontFaceRule`: the constructor is
      // absent in some engines and the rule still reports type 5.
      const isFace =
        rule.constructor?.name === "CSSFontFaceRule" ||
        (rule as { type?: number }).type === 5;
      if (!isFace) continue;
      const css = absolutize(rule.cssText, sheet.href);
      total += css.length;
      out.faces.push(css);
    }
  }
  return out;
}

/**
 * Rewrite relative `url()` against the stylesheet that declared it.
 *
 * A relative font url resolves against the document that owns the rule. Copied
 * verbatim into the shell it would resolve against /sdk/shell.html, so
 * `url(../fonts/plex.woff2)` on a page at /en/about silently 404s and the face
 * falls back — the exact failure this file exists to prevent, arriving with no
 * error anywhere.
 */
function absolutize(cssText: string, href: string | null): string {
  const base = href || document.baseURI;
  return cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (whole, quote: string, url: string) => {
    if (/^(?:data:|https?:|blob:|\/\/)/i.test(url)) return whole;
    try {
      return `url(${quote}${new URL(url, base).href}${quote})`;
    } catch {
      return whole;
    }
  });
}
