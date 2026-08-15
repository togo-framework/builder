// The overlay frame: the only two nodes FeedbackOS adds to a host page.
//
// One iframe and nothing else. The shell lives inside it, in its own
// same-origin document, so a third-party app module can be imported without
// handing it the customer's realm — which is the security argument the whole
// architecture rests on, not an ergonomic one.

import { CLIP_NONE, clipFor, sameRects, type Rect } from "./clip";
import { screenshot } from "../capture";
import { startPicker } from "../picker";
import { selectRegion, cropBlob } from "./region";
import { install as installRecorder, recorded } from "./recorder";
import { collectHostFonts } from "./fonts";
import { HOST_CSS } from "../styles";
import { showPins, clear as clearPins } from "./pinmarks";
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

/** The one <style> the loader adds to the host document (picker decoration). */
const HOST_STYLE_ID = "fos-host-css";

export class ShellFrame {
  private el: HTMLIFrameElement | null = null;
  private watchdog: Watchdog | null = null;
  private themeObserver: MutationObserver | null = null;
  private booted = false;
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

    // Start recording BEFORE the frame exists. Console and network evidence is
    // only worth anything if it was already being kept when the failure
    // happened — a recorder that starts when the composer opens has, by
    // definition, missed the event being reported.
    installRecorder();

    // The picker's decoration lives in the HOST document, not in ours.
    //
    // `startPicker` marks the element under the cursor with `builder-pin-hover`
    // and the body with `builder-pin-armed`, and both are styled by HOST_CSS —
    // which until now only the PANEL injected. In shell mode the panel never
    // mounts, so picking an element showed no crosshair and no outline: the
    // reporter clicked blind and only found out what they had pinned after the
    // chip appeared.
    if (!document.getElementById(HOST_STYLE_ID)) {
      const st = document.createElement("style");
      st.id = HOST_STYLE_ID;
      st.setAttribute("data-builder-hide", "");
      st.textContent = HOST_CSS;
      document.head.appendChild(st);
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

    // FOLLOW the host's theme AND language, do not sample them once.
    //
    // Sampling at mount was wrong in a way that only shows up on a real site:
    // the launcher mounts as soon as /api/auth/me resolves, which is before the
    // host's own ThemeProvider has settled, so the widget read "light" off a
    // page that was about to be dark and never looked again. The user then
    // toggles the theme and the widget stays behind, which reads as broken
    // rather than as a race.
    //
    // Watching the attributes every host actually uses costs one observer and
    // removes both problems at once. `lang` and `dir` are here for the same
    // reason: on a site with a language switch, the widget stayed in whichever
    // locale happened to be active when it mounted, so switching the site to
    // Arabic left the dock, the Launchpad and the composer in English — and
    // left the whole shell laid out left-to-right inside a right-to-left page.
    // Fonts can still be loading at handshake time. `document.fonts.ready`
    // resolves once they are not, and re-syncing then costs one message on
    // page load and nothing afterwards.
    document.fonts?.ready
      .then(() => this.syncHost())
      .catch(() => {
        /* No Font Loading API. The handshake-time read stands. */
      });

    this.themeObserver = new MutationObserver(() => this.syncHost());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "lang", "dir"],
    });

    return true;
  }

  /**
   * Replace the embedding site's contributed apps after mount.
   *
   * A single-page app does not know its own routes until it has booted, which
   * is normally after this widget has. Requiring the list at mount() would mean
   * either duplicating it in the page's HTML or delaying the widget behind the
   * framework — so it can arrive late instead.
   */
  setHostApps(apps: unknown[]): void {
    this.opts.boot.hostApps = apps;
    if (!this.booted || !this.el) return;
    this.el.contentWindow?.postMessage({ t: "fos:boot", boot: this.opts.boot }, this.opts.origin);
  }

  /** Re-send boot when the host's theme or language changes under us. */
  private syncHost(): void {
    if (!this.booted || !this.el) return;
    const dark = hostIsDark();
    const locale = hostLocale(this.opts.boot.locale as string | undefined);
    const fonts = collectHostFonts();
    const prev = this.opts.boot.fonts as { family?: string; faces?: string[] } | undefined;
    const fontsChanged =
      prev?.family !== fonts.family || (prev?.faces?.length ?? 0) !== fonts.faces.length;
    if (this.opts.boot.dark === dark && this.opts.boot.locale === locale && !fontsChanged) return;
    this.opts.boot.dark = dark;
    this.opts.boot.locale = locale;
    this.opts.boot.fonts = fonts;
    this.el.contentWindow?.postMessage({ t: "fos:boot", boot: this.opts.boot }, this.opts.origin);
  }

  private handle(e: MessageEvent): void {
    if (!this.el || e.source !== this.el.contentWindow) return;
    // Pinned origin. document.referrer is attacker-influenced and must never be
    // what decides who may drive the overlay.
    if (e.origin !== this.opts.origin) return;
    const d = e.data as { t?: string; rects?: Rect[]; capture?: boolean };

    switch (d?.t) {
      case "fos:ready":
        // Answered EVERY time, not only the first. The shell re-announces until
        // it is booted, so a de-duplicated reply here would leave it waiting on
        // an answer that was already spent.
        if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
        this.loadTimer = null;
        // Re-read the theme on every ready. The first boot may have been sent
        // before the host's own theme provider settled.
        this.opts.boot.dark = hostIsDark();
        this.opts.boot.locale = hostLocale(this.opts.boot.locale as string | undefined);
        // Re-read the typeface here rather than trusting what mount() sampled.
        // The widget mounts as soon as its script runs, which on a real site is
        // BEFORE the stylesheets have parsed: the first read returned "Times"
        // for the family and zero @font-face rules, so the shell adopted the
        // browser default and looked like a bolted-on third-party widget on
        // exactly the sites that care most about their type.
        this.opts.boot.fonts = collectHostFonts();
        this.booted = true;
        this.el.contentWindow?.postMessage({ t: "fos:boot", boot: this.opts.boot }, this.opts.origin);
        break;
      case "fos:capture":
        // The shell CANNOT do this itself, and that is by design rather than an
        // oversight: it lives in its own same-origin document, so `document.body`
        // in there is the widget's own markup. A screenshot taken inside the
        // shell photographs the shell. Only this side can see the host's page,
        // so the shell asks and this side answers.
        void this.capture(d as { id?: string; kind?: string });
        break;
      case "fos:context":
        // Runtime evidence lives on this side (see recorder.ts) — the shell's
        // own console and fetch are the widget's, never the product's.
        this.el.contentWindow?.postMessage(
          { t: "fos:context:result", id: (d as { id?: string }).id, ...recorded() },
          this.opts.origin,
        );
        break;
      case "fos:pins":
        // The shell owns the list of kept pins; this side just draws them.
        showPins(((d as { pins?: unknown[] }).pins ?? []) as Parameters<typeof showPins>[0]);
        break;
      case "fos:dockwidth":
        // The shell says how wide its launcher is; this side publishes it as a
        // CSS variable the host page can reserve space with.
        //
        // A variable rather than the loader editing the layout itself: only the
        // page knows WHICH element should move over — a padding on <body> is
        // wrong for a fixed header, and a margin is wrong for a full-bleed hero.
        // This mirrors --admin-bar-h, which the site already consumes the same
        // way.
        this.setDockWidth(Number((d as { width?: unknown }).width) || 0);
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

  /**
   * Run a host-page capture on the shell's behalf and post the result back.
   *
   * Errors are reported, never thrown: a screenshot that fails on a page with
   * a tainted canvas must leave the operator with a composer they can still
   * type into and send.
   */
  private async capture(req: { id?: string; kind?: string }): Promise<void> {
    const reply = (r: Record<string, unknown>) =>
      this.el?.contentWindow?.postMessage(
        { t: "fos:capture:result", id: req.id, ...r },
        this.opts.origin,
      );

    try {
      if (req.kind === "region") {
        // Ask FIRST, shoot after. Selecting on a live page and cropping the
        // result means the reporter draws the box around what they can see,
        // rather than guessing at coordinates in an image taken beforehand.
        const el = this.el;
        const prevClip = el?.style.clipPath ?? CLIP_NONE;
        const prevPE = el?.style.pointerEvents ?? "none";
        // The overlay must fall through while the box is being drawn, or the
        // composer window swallows the drag over its own area.
        if (el) {
          el.style.pointerEvents = "none";
          el.style.clipPath = CLIP_NONE;
        }
        let region: Awaited<ReturnType<typeof selectRegion>> = null;
        try {
          region = await selectRegion();
        } finally {
          if (el) {
            el.style.clipPath = prevClip;
            el.style.pointerEvents = prevPE;
          }
        }
        if (!region) {
          reply({ cancelled: true });
          return;
        }
        const scrollY = window.scrollY;
        const prevVis = el?.style.visibility ?? "";
        if (el) el.style.visibility = "hidden";
        try {
          const full = await screenshot();
          const cropped = await cropBlob(full.blob, region, scrollY);
          reply({
            attachment: {
              ...full,
              blob: cropped,
              size: cropped.size,
              name: full.name.replace(/\.png$/, `-${Math.round(region.w)}x${Math.round(region.h)}.png`),
            },
          });
        } finally {
          if (el) el.style.visibility = prevVis;
        }
        return;
      }

      if (req.kind === "screenshot") {
        // Hide the overlay for the shot. Without this the shell's own windows
        // are photographed on top of the page the report is about — and the
        // composer would appear in the evidence for its own bug.
        const el = this.el;
        const prev = el?.style.visibility ?? "";
        if (el) el.style.visibility = "hidden";
        try {
          reply({ attachment: await screenshot() });
        } finally {
          if (el) el.style.visibility = prev;
        }
        return;
      }

      if (req.kind === "pin") {
        // The picker needs the host's clicks, so the overlay must fall through
        // completely for the duration — including the shell's open windows,
        // which would otherwise swallow the very element being pointed at.
        const el = this.el;
        const restore = () => {
          if (!el) return;
          el.style.pointerEvents = this.lastRects.length ? "auto" : "none";
          el.style.clipPath = this.lastRects.length ? clipFor(this.lastRects) : CLIP_NONE;
        };
        if (el) {
          el.style.pointerEvents = "none";
          el.style.clipPath = CLIP_NONE;
        }
        startPicker(
          (anchor) => {
            restore();
            reply({ anchor });
          },
          () => {
            restore();
            reply({ cancelled: true });
          },
        );
        return;
      }

      reply({ error: `unknown capture kind: ${String(req.kind)}` });
    } catch (err) {
      reply({ error: describeError(err) });
    }
  }

  /**
   * Publish the launcher's width to the host document.
   *
   * Set on <html> rather than <body> so a page whose body is itself positioned
   * still sees it, and removed entirely at 0 so a host that styles on the
   * variable's PRESENCE (rather than its value) sees it go away.
   */
  private setDockWidth(px: number): void {
    const root = document.documentElement;
    if (px > 0) root.style.setProperty("--fos-dock-w", `${px}px`);
    else root.style.removeProperty("--fos-dock-w");
  }

  /** Show, hide or toggle the launcher. Called by the host's own chrome. */
  toggleDock(open?: boolean): void {
    if (!this.booted || !this.el) return;
    this.el.contentWindow?.postMessage(
      { t: "fos:dock", ...(typeof open === "boolean" ? { open } : {}) },
      this.opts.origin,
    );
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
    clearPins();
    document.getElementById(HOST_STYLE_ID)?.remove();
    // The page must reclaim the launcher's space when the shell goes away, or a
    // torn-down widget leaves a permanent empty column.
    this.setDockWidth(0);
    this.themeObserver?.disconnect();
    this.themeObserver = null;
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


/**
 * Is the host page dark right now?
 *
 * Checked in the order a host is most likely to mean it: an explicit
 * `data-theme`, then the `.dark` class every Tailwind/shadcn project uses, then
 * the OS preference. A site that signals none of these gets light, which is the
 * right guess for a page that never said otherwise.
 */
export function hostIsDark(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const attr = (root.getAttribute("data-theme") || "").toLowerCase();
  if (attr === "dark") return true;
  if (attr === "light") return false;
  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}


/**
 * A message a human can act on.
 *
 * html-to-image rejects with the raw `error` Event when an image fails to
 * load, and `String(event)` is "[object Event]" — which is how a perfectly
 * diagnosable CORS failure reaches the log as noise.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof Event !== "undefined" && err instanceof Event) {
    const t = err.target as { src?: string; tagName?: string } | null;
    const what = t?.src ? ` (${t.src})` : "";
    return `failed to load ${t?.tagName?.toLowerCase() || "a resource"}${what}`;
  }
  return String(err);
}


/**
 * The host page's language, as a locale the shell knows.
 *
 * `fallback` is whatever the embedder passed to mount() — an explicit
 * `locale` option is a decision and outranks sniffing. It is only consulted
 * when the page itself says nothing.
 */
export function hostLocale(fallback?: string): string {
  if (typeof document === "undefined") return fallback || "en";
  // `ar-EG` and `ar` are the same language for our purposes; the shell ships
  // two locales, not a full BCP-47 matcher.
  const lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  if (lang.startsWith("ar")) return "ar";
  if (lang.startsWith("en")) return "en";
  return fallback || "en";
}
