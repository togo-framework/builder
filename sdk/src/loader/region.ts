// Drag out a region of the HOST page.
//
// "Take a screenshot" that silently grabs the whole page produces evidence
// nobody can read: a 1400x3000 PNG in which the broken button is forty pixels
// tall somewhere in the middle. Letting the reporter draw a box around the
// thing they are complaining about is the difference between an attachment and
// a piece of evidence.
//
// Lives on the host side for the same reason the rest of capture does: the
// coordinates being selected are the host page's, and the shell cannot see it.

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Below this, a drag is a mis-click rather than a selection. */
const MIN_SIZE = 8;

/**
 * Show a crosshair over the page and resolve with the dragged rectangle.
 *
 * Resolves with null when the reporter presses Escape, right-clicks, or
 * releases without really dragging — all three mean "actually, no", and none
 * of them should leave a 2x3-pixel screenshot attached to their report.
 *
 * Coordinates are viewport CSS pixels, which is what the cropper needs: the
 * screenshot it crops is rendered from the same viewport.
 */
export function selectRegion(): Promise<Region | null> {
  return new Promise((resolve) => {
    const layer = document.createElement("div");
    // 2147483600 sits above the shell's own overlay (…000) deliberately: the
    // selector must be drawable over an open composer window, since that is
    // exactly where the reporter is standing when they press the button.
    layer.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483600",
      "cursor:crosshair",
      "background:rgba(0,0,0,0.28)",
      // A page mid-selection must not scroll under the pointer.
      "touch-action:none",
      "user-select:none",
    ].join(";");
    layer.setAttribute("data-builder-hide", "");

    const box = document.createElement("div");
    box.style.cssText = [
      "position:fixed",
      "border:2px solid #6366f1",
      "background:rgba(99,102,241,0.14)",
      "box-shadow:0 0 0 9999px rgba(0,0,0,0.28)",
      "pointer-events:none",
      "display:none",
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "Drag to select an area · Esc to cancel";
    hint.style.cssText = [
      "position:fixed",
      "top:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "padding:6px 12px",
      "border-radius:8px",
      "background:rgba(17,17,20,0.92)",
      "color:#fff",
      "font:500 12px/1.4 system-ui,sans-serif",
      "pointer-events:none",
      "white-space:nowrap",
    ].join(";");

    layer.appendChild(box);
    layer.appendChild(hint);
    document.body.appendChild(layer);

    let sx = 0;
    let sy = 0;
    let dragging = false;

    const done = (r: Region | null) => {
      window.removeEventListener("keydown", onKey, true);
      layer.remove();
      resolve(r);
    };

    const rectFrom = (x: number, y: number): Region => ({
      // Math.min/abs rather than assuming a top-left origin: dragging up and
      // to the left is a perfectly normal way to draw a box, and produces
      // negative width everywhere that does not handle it.
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      w: Math.abs(x - sx),
      h: Math.abs(y - sy),
    });

    const draw = (r: Region) => {
      box.style.display = "block";
      box.style.left = `${r.x}px`;
      box.style.top = `${r.y}px`;
      box.style.width = `${r.w}px`;
      box.style.height = `${r.h}px`;
      hint.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase and stopPropagation: Escape must cancel the SELECTION,
      // not close the composer behind it and leave the reporter re-typing.
      e.preventDefault();
      e.stopPropagation();
      done(null);
    };

    layer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        done(null);
        return;
      }
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      layer.setPointerCapture(e.pointerId);
      draw(rectFrom(sx, sy));
    });

    layer.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      draw(rectFrom(e.clientX, e.clientY));
    });

    layer.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      const r = rectFrom(e.clientX, e.clientY);
      done(r.w >= MIN_SIZE && r.h >= MIN_SIZE ? r : null);
    });

    // A drag that leaves the window entirely (released over the browser chrome)
    // never fires pointerup here. Without this the crosshair would be stuck on
    // the customer's page with no way out but a reload.
    layer.addEventListener("pointercancel", () => done(null));

    layer.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      done(null);
    });

    window.addEventListener("keydown", onKey, true);
  });
}

/**
 * Crop a full-page PNG blob to a viewport region.
 *
 * The screenshot is rendered at the page's device pixel ratio while the region
 * was measured in CSS pixels, so the two have to be reconciled — and the ratio
 * is derived from the image itself rather than read from `devicePixelRatio`,
 * because the capture clamps its own pixelRatio and the two disagree on any
 * display where that clamp bites.
 */
export async function cropBlob(blob: Blob, region: Region, scrollY = 0): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = bitmap.width / Math.max(document.documentElement.clientWidth, 1);

  const sx = Math.round(region.x * scale);
  const sy = Math.round((region.y + scrollY) * scale);
  const sw = Math.round(region.w * scale);
  const sh = Math.round(region.h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(sw, 1);
  canvas.height = Math.max(sh, 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  // Falling back to the uncropped shot is right: a slightly-too-large piece of
  // evidence beats no evidence and an error message.
  return out ?? blob;
}
