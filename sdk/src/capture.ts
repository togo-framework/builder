import { toBlob } from "html-to-image";
import { OWN_MARKER } from "./anchor";
import type { Attachment } from "./types";

/** Anything carrying this is excluded from a screenshot. */
export const HIDE_MARKER = "data-builder-hide";

/** Per-kind ceilings, mirrored server-side. */
export const LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 100 * 1024 * 1024, // 100 MB — a screen recording is the highest-signal attachment there is
  file: 25 * 1024 * 1024,
};

export const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "text/plain",
].join(",");

export function kindOf(mime: string): Attachment["kind"] {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "file";
}

export function limitFor(kind: Attachment["kind"]): number {
  return kind === "video" ? LIMITS.video : kind === "image" ? LIMITS.image : LIMITS.file;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Rasterize the current page.
 *
 * Returns a real Blob, not a filename. The published togo widget's
 * `onScreenshot` returns a string name and its attachment type carries no
 * bytes at all, which makes the whole feature decorative — this is the fix.
 *
 * Capped at dpr 1.5: a 3x retina capture of a full page routinely exceeds
 * 20 MB and takes long enough that users assume it hung.
 */
export async function screenshot(timeoutMs = 20000): Promise<Attachment> {
  const blob = await Promise.race([
    toBlob(document.body, {
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      // cacheBust appends a query string to every image URL, which turns a
      // cached same-origin hit into a fresh cross-origin request — and any
      // third-party image that answers without CORS headers then fails. One
      // failed avatar rejected the ENTIRE screenshot, so a page with a single
      // remote thumbnail could never be captured at all.
      cacheBust: false,
      // Do NOT inline the page's fonts.
      //
      // html-to-image's default walks every stylesheet, finds every @font-face,
      // and fetches each src to embed it as a data URI. On a site with a
      // Google Fonts @import and seven local faces that is a dozen network
      // round trips per capture, and it dominated the cost — screenshots that
      // had been succeeding started hitting the 15s timeout once the page grew.
      //
      // The output is a PNG. Fonts are already rasterised into it by the time
      // it is encoded; embedding the FILES only matters for SVG output, which
      // this is not. Skipping them costs nothing visible and removes the
      // slowest step entirely.
      skipFonts: true,
      // A 1x1 transparent PNG stands in for whatever could not be fetched.
      // A screenshot missing one image is evidence; a rejected promise is not.
      imagePlaceholder:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      // Exclude the widget and anything the host marked as noise.
      filter: (node) => {
        const el = node as Element;
        if (el?.getAttribute?.(OWN_MARKER) !== null && el?.hasAttribute?.(OWN_MARKER)) return false;
        if (el?.hasAttribute?.(HIDE_MARKER)) return false;
        return true;
      },
    }),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("screenshot timed out")), timeoutMs),
    ),
  ]);

  if (!blob) throw new Error("screenshot produced no image");
  return {
    name: `screenshot-${stamp()}.png`,
    mime: blob.type || "image/png",
    size: blob.size,
    kind: "screenshot",
    blob,
  };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Normalize a page URL into the route key issues are grouped by. */
export function normalizeRoute(href: string = location.href): string {
  try {
    const u = new URL(href);
    // Path only: query and hash would fragment "issues on this page" into one
    // bucket per filter combination.
    let p = u.pathname.toLowerCase();
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p.slice(0, 512);
  } catch {
    return "/";
  }
}
