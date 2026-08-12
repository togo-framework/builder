// The overlay frame: the only two nodes FeedbackOS adds to a host page.
//
// One iframe and nothing else. The shell lives inside it, in its own
// same-origin document, so a third-party app module can be imported without
// handing it the customer's realm — which is the security argument the whole
// architecture rests on, not an ergonomic one.

import { CLIP_NONE, clipFor, sameRects, type Rect } from "./clip";
import { probeHitTest } from "./probe";
import { Watchdog } from "./watchdog";

export interface FrameOptions {
  /** Where shell.html is served from. */
  src: string;
  /** Origin allowed to talk to us. Pinned — never document.referrer. */
  origin: string;
  /** Base z-index. Below the existing FAB so both can coexist mid-migration. */
  zIndex?: number;
  /** Called when the windowed shell gives up and the panel should take over. */
  onFallback: (reason: string) => void;
  /** Boot options forwarded to the shell once it reports ready. */
  boot: Record<string, unknown>;
}

export class ShellFrame {
  private el: HTMLIFrameElement | null = null;
  private watchdog: Watchdog | null = null;
  private lastRects: Rect[] = [];
  private onMessage: ((e: MessageEvent) => void) | null = null;
  private loadTimer: number | null = null;

  constructor(private readonly opts: FrameOptions) {}

  /** @returns false when this browser cannot host the windowed shell. */
  mount(): boolean {
    // Anything ambiguous resolves to the panel. The windowed shell is an
    // upgrade; the panel is the shipped, tested path.
    if (probeHitTest() !== "pass") {
      this.opts.onFallback("clip-path does not exclude regions from hit-testing");
      return false;
    }

    const f = document.createElement("iframe");
    f.setAttribute("data-builder-sdk", "");
    f.setAttribute("title", "FeedbackOS");
    // Starts inert: nothing is open, so nothing should be capturing, and a
    // keyboard user tabbing the host page must not fall into our document.
    f.setAttribute("tabindex", "-1");
    (f as unknown as { inert: boolean }).inert = true;
    f.style.cssText = [
      "position:fixed",
      "inset:0",
      "width:100%",
      "height:100%",
      "border:0",
      "background:transparent",
      "color-scheme:normal",
      `z-index:${this.opts.zIndex ?? 2147483000}`,
      "pointer-events:none",
    ].join(";");
    f.style.clipPath = CLIP_NONE;

    // about:blank first, navigated after insertion. Creating it directly at the
    // target URL races the load event on some engines and the ready handshake
    // is missed.
    f.src = "about:blank";
    document.body.appendChild(f);
    this.el = f;

    this.watchdog = new Watchdog({
      onRelease: () => this.setRects(this.lastRects),
      onTeardown: (why) => this.teardown(why),
      onFallback: (why) => {
        this.teardown(why);
        this.opts.onFallback(why);
      },
    });
    this.watchdog.start();

    this.onMessage = (e) => this.handle(e);
    window.addEventListener("message", this.onMessage);

    // A blocked frame — a strict host CSP with a frame-src that excludes us —
    // never loads and never speaks. Without this it would simply sit there
    // invisibly and the widget would appear to do nothing.
    this.loadTimer = window.setTimeout(() => {
      this.teardown("shell did not load within 3s");
      this.opts.onFallback("frame blocked or unreachable (CSP frame-src?)");
    }, 3000);

    f.src = this.opts.src;
    return true;
  }

  private handle(e: MessageEvent): void {
    if (!this.el || e.source !== this.el.contentWindow) return;
    // Pinned origin. document.referrer is attacker-influenced and must never be
    // what decides who may drive the overlay.
    if (e.origin !== this.opts.origin) return;
    const d = e.data as { t?: string; rects?: Rect[]; capture?: boolean };

    switch (d?.t) {
      case "fos:ready":
        if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
        this.loadTimer = null;
        this.el.contentWindow?.postMessage({ t: "fos:boot", boot: this.opts.boot }, this.opts.origin);
        break;
      case "fos:heartbeat":
        this.watchdog?.beat();
        break;
      case "fos:regions":
        this.watchdog?.beat();
        if (d.capture) {
          this.watchdog?.captureAll();
          this.el.style.clipPath = "none";
        } else {
          this.watchdog?.captureEnded();
          this.setRects(d.rects ?? []);
        }
        break;
    }
  }

  private setRects(rects: Rect[]): void {
    if (!this.el) return;
    const open = rects.length > 0;
    // pointer-events and inert follow the region set, so a shell with nothing
    // open is completely transparent to the host — no capture, no tab stop.
    this.el.style.pointerEvents = open ? "auto" : "none";
    this.el.setAttribute("tabindex", open ? "0" : "-1");
    (this.el as unknown as { inert: boolean }).inert = !open;

    if (sameRects(rects, this.lastRects)) return;
    this.lastRects = rects;
    this.el.style.clipPath = open ? clipFor(rects) : CLIP_NONE;
  }

  teardown(_reason: string): void {
    if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
    this.watchdog?.stop();
    if (this.onMessage) window.removeEventListener("message", this.onMessage);
    if (this.el) {
      this.el.style.pointerEvents = "none";
      this.el.style.clipPath = CLIP_NONE;
      this.el.remove();
    }
    this.el = null;
  }
}
