// The shell document's entry point.
//
// Everything here runs in the SHELL's own realm — a same-origin iframe — never
// in the host page. That is the whole reason the architecture is shaped this
// way: a third-party app module loaded with `await import(url)` executes with
// full access to whatever realm it lands in, and the one realm it must never
// land in is the customer's.

import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { WindowManagerProvider, WindowManager, useWindowManager } from "../../vendor/ui-desktop-embed/components/desktop/WindowManager";
import { Dock } from "../../vendor/ui-desktop-embed/components/desktop/Dock";
import { Launchpad } from "../../vendor/ui-desktop-embed/components/desktop/Launchpad";
import type { OSApp } from "../../vendor/ui-desktop-embed/hooks/useOSApps";
import { AppFrame } from "./AppFrame";
import type { AppMeta } from "../app/contract";
import { loadRect, debouncedSaveRect } from "./geometry";
import { Report } from "./apps/report/Report";
import type { ReportAttachment } from "./apps/report/Report";
import type { NewIssue, PinAnchor } from "../types";
import type { ConsoleEntry, NetworkEntry } from "./apps/report/starters";
import { httpTransport } from "../transport";
import { builtinApps } from "./builtins";

/** Options the loader hands the shell across the frame boundary. */
export interface ShellBoot {
  apiBase: string;
  locale: "en" | "ar";
  theme: "default" | "plex";
  dark: boolean;
  accent?: string;
  /** Where window stacking starts. The loader owns the outer band. */
  zBase?: number;
  /**
   * The HOST page's URL and title.
   *
   * Not derivable in here: the shell's own `location` is /sdk/shell.html, so
   * every report filed from the windowed shell was attached to the widget's
   * own document instead of the page the operator was looking at. The loader
   * is the only side that knows, so it says.
   */
  hostHref?: string;
  hostTitle?: string;
  /** The host page's typeface, so the shell does not look bolted on. */
  fonts?: { family?: string; faces?: string[] };
  /** Screens contributed by the embedding site (MountOptions.apps). */
  hostApps?: HostAppSpec[];
}

/** One app contributed by the embedding site. Mirrors HostApp in types.ts. */
export interface HostAppSpec {
  slug: string;
  name: string;
  icon?: string;
  color?: string;
  path: string;
  window?: { width?: number; height?: number; minWidth?: number; minHeight?: number; resizable?: boolean };
}

/**
 * Keep only the host apps that can actually be rendered.
 *
 * A same-origin PATH, never a URL. Accepting "https://evil.example/x" here
 * would let a mis-copied manifest frame a third-party origin unsandboxed,
 * which is exactly the trust the `host` kind is spending. Protocol-relative
 * "//evil.example" is rejected for the same reason — it looks like a path and
 * is not one.
 */
function validHostApps(list: HostAppSpec[] | undefined): HostAppSpec[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list.filter((a) => {
    if (!a || typeof a.slug !== "string" || !a.slug) return false;
    if (typeof a.path !== "string" || !a.path.startsWith("/") || a.path.startsWith("//")) return false;
    if (seen.has(a.slug)) return false;
    seen.add(a.slug);
    return true;
  });
}

const DEFAULTS: ShellBoot = {
  apiBase: "",
  locale: "en",
  theme: "default",
  dark: false,
};

/**
 * Apply boot options to the document.
 *
 * `dir` and `lang` are set on the real <html> element. In the old shadow-DOM
 * widget these were inherited from the host through `:host([dir="rtl"])`; the
 * shell is a top-level document, so nothing inherits and this has to be done
 * explicitly. It is a failure surface the architecture change introduced, so it
 * gets its own function rather than being a line inside a component.
 */
function applyBoot(o: ShellBoot) {
  const root = document.documentElement;
  root.lang = o.locale;
  root.dir = o.locale === "ar" ? "rtl" : "ltr";
  root.setAttribute("data-fos-theme", o.theme);
  root.classList.toggle("fos-dark", o.dark);
  if (o.accent) root.style.setProperty("--fos-accent", o.accent);
  applyHostFonts(o.fonts);
}

/**
 * Adopt the host page's typeface.
 *
 * Two halves, and both are required: the `@font-face` rules, because this
 * document loaded none of the host's fonts and naming a family it does not
 * have resolves to the fallback; and the family itself, prepended to the
 * shell's own stack rather than replacing it, so an Arabic page whose font
 * lacks Latin glyphs still has somewhere to fall through to.
 *
 * Written into a single dedicated <style> that is replaced wholesale, so a
 * re-boot (locale change, theme change) cannot stack a second copy of every
 * face on top of the first.
 */
function applyHostFonts(fonts: ShellBoot["fonts"]): void {
  if (!fonts) return;
  const ID = "fos-host-fonts";
  let el = document.getElementById(ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = ID;
    document.head.appendChild(el);
  }
  el.textContent = (fonts.faces ?? []).join("\n");
  if (fonts.family) {
    document.documentElement.style.setProperty(
      "--fos-font",
      // The host's stack FIRST, ours after it. Replacing the stack outright
      // would leave a page whose font covers only Arabic with no Latin
      // fallback at all, and the shell renders both — app names, URLs, code.
      `${fonts.family}, var(--fos-font-fallback)`,
    );
  }
}

// One debouncer for the whole shell: a drag emits a rect per pointermove, and a
// synchronous localStorage write per frame on somebody else's page is not free.
const persistRect = debouncedSaveRect();

/**
 * Which apps sit in the dock.
 *
 * Device-local rather than per-account: this is "the apps I reach for on THIS
 * screen", and a phone's dock and a 27-inch monitor's are not the same short
 * list. Window geometry is stored the same way and for the same reason.
 */
const PIN_KEY = "fos:pins";

/**
 * Whether the launcher is showing. Device-local, like the pins.
 *
 * Versioned in the NAME. A short-lived hover-to-reveal build wrote "0" to the
 * unversioned key every time the pointer left the dock, so anyone who ran it
 * carries a stored "hidden" that has nothing to do with a choice they made —
 * and the launcher would come up hidden on a build where hiding is a deliberate
 * act. A new key starts everyone from the default and costs one line.
 */
const DOCK_KEY = "fos:launcher.v1";

/**
 * The launcher's width, in CSS pixels.
 *
 * One constant, used in three places that must agree: the opaque strip the
 * shell claims, the width reported to the loader, and — through the loader —
 * the padding the host page reserves. A dock wider than the reserved space
 * covers content; narrower, and there is a gap. Deriving it from a measured
 * rect would be more elegant and would also mean the page reflows on every
 * shell re-render, so it is declared.
 */
const DOCK_W = 68;

/** A first-run dock: the things an operator opens daily, not all twelve. */
const DEFAULT_PINS = ["report", "issues", "agents", "chat", "terminal"];

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return DEFAULT_PINS;
    const v: unknown = JSON.parse(raw);
    // An empty array is a real answer — the operator unpinned everything — so
    // it must survive, which `||` would quietly overwrite.
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : DEFAULT_PINS;
  } catch {
    return DEFAULT_PINS;
  }
}


/**
 * Ask the HOST page to capture something, and wait for its answer.
 *
 * The shell's own document is /sdk/shell.html, so anything it photographs or
 * points at is itself. The loader is the only side that can see the page the
 * report is about, so capture is a request, not a call.
 *
 * Every request carries an id and the listener is removed when it settles: a
 * composer opened, closed and reopened would otherwise accumulate handlers and
 * resolve the wrong promise with the right screenshot.
 */
let captureSeq = 0;

/**
 * A monotonic id for an attachment chip.
 *
 * Ids were `shot-${attachments.length}`, which repeats: remove one of three
 * chips and the next capture is numbered against a shorter list, so two chips
 * shared an id and Remove deleted whichever React matched first — usually not
 * the one that was clicked.
 */
let attachSeq = 0;
const nextId = () => ++attachSeq;
function requestCapture(kind: "screenshot" | "region" | "pin"): Promise<CaptureReply> {
  const id = `cap-${++captureSeq}`;
  return new Promise((resolve) => {
    const done = (r: CaptureReply) => {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as CaptureReply & { t?: string; id?: string };
      if (d?.t !== "fos:capture:result" || d.id !== id) return;
      done(d);
    };
    window.addEventListener("message", onMsg);
    // A picker the operator walks away from must not leave the composer
    // spinning forever. Generous, because picking is a human action.
    const timer = setTimeout(() => done({ cancelled: true }), 120000);
    window.parent?.postMessage({ t: "fos:capture", id, kind }, "*");
  });
}

interface CaptureReply {
  attachment?: { name?: string; blob?: Blob; label?: string };
  anchor?: unknown;
  cancelled?: boolean;
  error?: string;
}

/**
 * The composer, with the state it needs to accumulate evidence.
 *
 * Held here rather than inside Report so the attachments survive the window
 * being minimised and restored — the window manager unmounts nothing, but a
 * report half-written with a screenshot attached is exactly the state that
 * must not be casually thrown away.
 */
function ReportWindow({ boot, route }: { boot: ShellBoot; route: string }) {
  const [attachments, setAttachments] = useState<ReportAttachment[]>([
    { id: "route", kind: "route", label: route, removable: false },
  ]);
  const [busy, setBusy] = useState<null | "screenshot" | "region" | "pin">(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Whether the server offers the rewrite at all. Probed rather than assumed:
  // the capability ships OFF (BUILDER_ENHANCER) and is authenticated-only, so
  // the control must be absent on most installations rather than present and
  // failing. See internal/issues/enhance.go.
  const [canEnhance, setCanEnhance] = useState(false);

  // Issues already filed on THIS route.
  //
  // Duplicate detection, done with the cheapest possible signal: not a model
  // call and not a similarity index, just "here is what people already
  // reported about this page". Clicking one lets the reporter say "this again"
  // instead of writing a second description of the same bug — which is what
  // actually creates duplicates.
  const [recent, setRecent] = useState<{ number: number; title: string }[]>([]);
  useEffect(() => {
    let alive = true;
    httpTransport(boot.apiBase)
      .listByRoute(route)
      .then((list) => {
        if (!alive) return;
        setRecent(list.slice(0, 3).map((i) => ({ number: i.number, title: i.title })));
      })
      // No recent issues is the same as the endpoint being unreachable, as far
      // as the composer is concerned: fewer suggestions, never an error.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [boot.apiBase, route]);

  useEffect(() => {
    let alive = true;
    fetch(`${boot.apiBase}/api/builder/enhance`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => {
        if (alive) setCanEnhance(!!d?.available);
      })
      // A probe that fails means no button, which is the same as the feature
      // being off — never an error the reporter has to read.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [boot.apiBase]);
  const [ctx, setCtx] = useState<{ console: ConsoleEntry[]; network: NetworkEntry[] }>({
    console: [],
    network: [],
  });

  // Pull the host's recorded console and network once, when the composer
  // opens. Live-streaming it would mean the starters reshuffle under the
  // reporter's cursor while they are reading them.
  useEffect(() => {
    let alive = true;
    const id = `ctx-${++captureSeq}`;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; id?: string; console?: ConsoleEntry[]; network?: NetworkEntry[] };
      if (d?.t !== "fos:context:result" || d.id !== id) return;
      window.removeEventListener("message", onMsg);
      if (alive) setCtx({ console: d.console ?? [], network: d.network ?? [] });
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ t: "fos:context", id }, "*");
    return () => {
      alive = false;
      window.removeEventListener("message", onMsg);
    };
  }, []);

  /**
   * File the report.
   *
   * This was `async () => {}` while the composer was being built, and a no-op
   * here is invisible from the outside: the button says "Sending…" for a frame
   * and returns to "Send" with the text still in the box, no issue created and
   * no error shown. The widget's entire purpose silently did not happen.
   *
   * The transport already existed and already did all of this — multipart,
   * blobs, kinds — it was simply never called from the windowed shell.
   */
  const submit = async ({ mode, text }: { mode: string; text: string; dropped: string[] }) => {
    const kept = attachments.filter((a) => !a.removable || true);
    await httpTransport(boot.apiBase).create({
      type: mode as NewIssue["type"],
      // The first line is the title, the rest is the body — the composer is one
      // box on purpose (see the Initial CTA note in Report.tsx), so the split
      // has to be inferred rather than asked for.
      title: firstLine(text),
      body: text,
      route,
      pageUrl: boot.hostHref || route,
      locale: boot.locale,
      pins: kept.filter((a) => a.kind === "pin" && a.anchor).map((a) => a.anchor as PinAnchor),
      attachments: kept
        .filter((a) => a.blob)
        .map((a) => ({
          name: a.label,
          kind: a.kind === "screenshot" ? "screenshot" : "file",
          mime: a.blob!.type || "application/octet-stream",
          size: a.blob!.size,
          blob: a.blob!,
        })) as unknown as NewIssue["attachments"],
      context: ctx.console.length || ctx.network.length ? { console: ctx.console, network: ctx.network } as unknown as NewIssue["context"] : undefined,
    });
  };

  // Tell the host which elements to outline, whenever the kept pins change.
  //
  // Pinning with no mark on the page is an act of faith — the chip is a label,
  // and when two buttons share a label it is not even that. Driven off the
  // attachment list rather than the pick itself, so removing a chip removes its
  // outline with no separate message.
  useEffect(() => {
    const pins = attachments.filter((a) => a.kind === "pin" && a.anchor).map((a) => a.anchor);
    window.parent?.postMessage({ t: "fos:pins", pins }, "*");
  }, [attachments]);

  // Closing the composer must take the outlines with it: they are annotations
  // ON the customer's page, and leaving them behind is graffiti.
  useEffect(() => () => {
    window.parent?.postMessage({ t: "fos:pins", pins: [] }, "*");
  }, []);

  const capture = async (kind: "screenshot" | "region" | "pin") => {
    if (busy) return;
    setBusy(kind);
    try {
      const r = await requestCapture(kind);
      if (r.cancelled) return;
      if (r.error) {
        // A swallowed capture error is indistinguishable from a cancelled one:
        // the button returns to its resting state and nothing appears, so the
        // reporter presses it again and gets the same silence. The loader
        // already produces a readable reason (describeError in frame.ts).
        setCaptureError(r.error);
        return;
      }
      setCaptureError(null);
      if (r.attachment) {
        setAttachments((a) => [
          ...a,
          {
            id: `shot-${nextId()}`,
            kind: "screenshot",
            label: r.attachment?.name || r.attachment?.label || "screenshot.png",
            removable: true,
            blob: r.attachment?.blob,
          },
        ]);
      } else if (r.anchor) {
        setAttachments((a) => [
          ...a,
          { id: `pin-${nextId()}`, kind: "pin", label: describeAnchor(r.anchor), removable: true, anchor: r.anchor },
        ]);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Report
      host={{
        slug: "report", apiBase: boot.apiBase, locale: boot.locale,
        dir: boot.locale === "ar" ? "rtl" : "ltr", dark: boot.dark,
        fetch: (path, init) => fetch(`${boot.apiBase}${path}`, { credentials: "include", ...init }),
        setTitle: () => {}, close: () => {}, open: () => {}, sectionNonce: 0,
      }}
      context={{ route, console: ctx.console, network: ctx.network, pinName: pinName(attachments), recent }}
      attachments={attachments}
      onRemoveAttachment={(id: string) => setAttachments((a) => a.filter((x) => x.id !== id))}
      onCapture={capture}
      capturing={busy}
      captureError={captureError}
      onEnhance={
        canEnhance
          ? async (t: string) => {
              const res = await fetch(`${boot.apiBase}/api/builder/enhance`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: t, locale: boot.locale }),
              });
              if (!res.ok) throw new Error(`enhance failed (${res.status})`);
              const d = await res.json();
              return typeof d?.text === "string" ? d.text : t;
            }
          : undefined
      }
      onSubmit={submit}
    />
  );
}

/** The title line: the first sentence or line, whichever comes first. */
function firstLine(text: string): string {
  const t = text.trim();
  const cut = t.search(/[\n.!?]/);
  const head = (cut > 0 ? t.slice(0, cut) : t).trim();
  return (head.length > 120 ? head.slice(0, 117) + "…" : head) || "Untitled report";
}

/**
 * The first pinned element's name.
 *
 * The starters use it to write a suggestion that names the thing the reporter
 * actually pointed at, rather than a generic one — which is the whole reason
 * pinning is worth the interaction.
 */
function pinName(list: ReportAttachment[]): string | undefined {
  return list.find((a) => a.kind === "pin")?.label;
}

/**
 * A pin's chip label: the element as the operator would name it.
 *
 * Ordered by how much the answer means to a HUMAN reading the report later,
 * which is nearly the reverse of PinAnchor's own ordering (that one is ranked
 * by how well a strategy survives a re-render). "Sponsor on GitHub" is worth
 * more in a chip than `div > div:nth-child(3)`, even though the CSS path is
 * the more mechanically precise of the two — the anchor still carries every
 * strategy, so nothing is lost by labelling it readably.
 */
function describeAnchor(a: unknown): string {
  const o = a as {
    name?: string; hint?: string; testid?: string; domId?: string;
    role?: string; tag?: string; css?: string;
  } | null;
  const clip = (t: string) => (t.length > 24 ? t.slice(0, 24) + "…" : t);
  const text = o?.name?.trim() || o?.hint?.trim();
  if (text) return clip(text);
  if (o?.testid) return clip(o.testid);
  if (o?.domId) return clip("#" + o.domId);
  if (o?.role) return clip(o.role);
  if (o?.tag) return clip("<" + o.tag + ">");
  if (o?.css) return clip(o.css);
  return "element";
}

function Shell({ boot }: { boot: ShellBoot }) {
  const { open, windows } = useWindowManager();

  // Remember where windows are put. Device-local by design — see geometry.ts:
  // a layout tuned on a 27-inch monitor is wrong on a laptop, so syncing rects
  // across devices makes things worse rather than better.
  useEffect(() => {
    for (const w of windows) persistRect(w.slug, w.rect);
  }, [windows]);
  const [apps, setApps] = useState<OSApp[]>([]);
  const [launchpad, setLaunchpad] = useState(false);
  // The dock is SHOWN by default and toggled from the host's admin bar.
  //
  // It was briefly hover-to-reveal. That is the right call for a dock that
  // floats over content, and the wrong one now that the page reserves space for
  // it: a bar the layout has already made room for should not vanish, because
  // the gap it leaves is worse than the bar.
  //
  // Persisted per device, like the pins and the window geometry — "do I want
  // the launcher on this screen" is a property of the screen, not the account.
  const [dockOpen, setDockOpen] = useState(() => {
    try {
      return localStorage.getItem(DOCK_KEY) !== "0";
    } catch {
      return true;
    }
  });

  // The host toggles it from the admin bar, and the host is the side that has
  // to reserve the space — so the width goes back out on every change.
  useEffect(() => {
    try {
      localStorage.setItem(DOCK_KEY, dockOpen ? "1" : "0");
    } catch {
      // Private mode: the toggle still works for this session.
    }
    const onToggle = (e: MessageEvent) => {
      const d = e.data as { t?: string; open?: boolean } | null;
      if (!d || d.t !== "fos:dock") return;
      setDockOpen((cur) => (typeof d.open === "boolean" ? d.open : !cur));
    };
    window.addEventListener("message", onToggle);
    // Tell the loader how much room to reserve on the host page. 0 when hidden,
    // so the content reclaims the space rather than leaving a stripe.
    parent.postMessage({ t: "fos:dockwidth", width: dockOpen ? DOCK_W : 0 }, "*");
    return () => window.removeEventListener("message", onToggle);
  }, [dockOpen]);
  const [pinned, setPinned] = useState<string[]>(loadPins);

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
    } catch {
      // Private mode. Pins last the session instead of forever, which is a
      // smaller failure than refusing to pin at all.
    }
  }, [pinned]);

  useEffect(() => {
    let alive = true;
    fetch(`${boot.apiBase}/api/builder/apps`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { apps: [] }))
      .then((d) => {
        if (alive) setApps(Array.isArray(d) ? d : (d.apps ?? []));
      })
      // A dock with no apps is a working dock with nothing in it. It must not
      // be an unhandled rejection that takes the shell down — the host page is
      // still someone's product.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [boot.apiBase]);

  // Every open window, minimized or not.
  //
  // This filtered minimized windows OUT, and the Dock builds its icon list from
  // [...pinned, ...openSlugs] — so minimizing an app launched from the
  // Launchpad removed its icon entirely while the window was still mounted and
  // hidden. The only way back was to find it in the Launchpad again, which is
  // precisely the trip a dock exists to remove. Minimize is where a dock earns
  // its keep; hiding the icon at that moment inverts it.
  const openSlugs = windows.map((w) => w.slug);

  // The composer is a BUILT-IN: compiled into the shell, no fetch, and it must
  // work with no authentication and no model. It is the one app whose failure
  // would mean feedback silently stops being collected.
  const reportApp: OSApp = {
    slug: "report", name: boot.locale === "ar" ? "الإبلاغ عن مشكلة" : "Report an issue",
    icon: "MessageSquare", color: "#4f46e5",
    window: { width: 720, height: 520, resizable: true },
  } as OSApp;
  // The dock is: the composer, the builder's own screens as `route` apps, then
  // whatever the server registered. Built-ins do not wait on a fetch — a dock
  // that is empty until the network answers looks broken on a slow connection.
  const builtins = builtinApps(boot.locale);
  const hostApps = validHostApps(boot.hostApps);
  const serverSlugs = new Set(apps.map((a) => a.slug));
  const allApps = [
    reportApp,
    ...builtins
      .filter((b) => !serverSlugs.has(b.slug))
      .map((b) => ({ slug: b.slug, name: b.title, icon: b.icon, color: b.color } as OSApp)),
    ...apps.filter((a) => a.slug !== "report"),
    // The embedding site's own screens, last: a product adding an app should
    // never reorder the builder's, and a slug collision resolves in favour of
    // whatever was already there rather than letting a host app shadow Issues.
    ...hostApps
      .filter((h) => !serverSlugs.has(h.slug) && !builtins.some((b) => b.slug === h.slug))
      .map((h) => ({ slug: h.slug, name: h.name, icon: h.icon, color: h.color } as OSApp)),
  ];

  /**
   * The page the operator is actually looking at.
   *
   * `location.pathname` in here is /sdk/shell.html — the shell's own document —
   * so every report filed from a window was attached to the widget rather than
   * to the page under it. The loader supplies the real one.
   */
  const hostRoute = boot.hostHref
    ? new URL(boot.hostHref).pathname + new URL(boot.hostHref).search
    : location.pathname;

  // One launch path, shared by the dock, the Launchpad and any app that opens
  // another. Three copies of this drifted apart the moment one gained a case.
  const handleLaunch = (slug: string) => {
          if (slug === "report") {
            open(slug, {
              title: reportApp.name,
              icon: reportApp.icon,
              width: 720, height: 520, resizable: true,
              content: <ReportWindow boot={boot} route={hostRoute} />,
            });
            return;
          }
          const hostApp = hostApps.find((h) => h.slug === slug);
          if (hostApp) {
            const remembered = loadRect(slug);
            open(slug, {
              title: hostApp.name,
              icon: hostApp.icon,
              width: remembered?.w ?? hostApp.window?.width ?? 900,
              height: remembered?.h ?? hostApp.window?.height ?? 640,
              // Position too, not just size. Both were persisted and validated
              // and only the size was ever read back, so a window moved to the
              // second monitor reopened in the middle of the first.
              ...(remembered ? { x: remembered.x, y: remembered.y } : {}),
              resizable: hostApp.window?.resizable ?? true,
              content: (
                <AppFrame
                  app={{
                    slug: hostApp.slug,
                    title: hostApp.name,
                    icon: hostApp.icon,
                    color: hostApp.color,
                    content: { kind: "host", entry: hostApp.path },
                    window: hostApp.window,
                  }}
                  host={{
                    apiBase: boot.apiBase, locale: boot.locale,
                    dir: boot.locale === "ar" ? "rtl" : "ltr", dark: boot.dark,
                    fetch: (path, init) => fetch(`${boot.apiBase}${path}`, { credentials: "include", ...init }),
                    setTitle: () => {}, close: () => {}, open: () => {}, sectionNonce: 0,
                  }}
                />
              ),
            });
            return;
          }
          const builtin = builtins.find((b) => b.slug === slug);
          const app = apps.find((a) => a.slug === slug) as (OSApp & Partial<AppMeta>) | undefined;
          if (!builtin && !app) return;
          const meta: AppMeta = builtin ?? {
            slug,
            title: app!.name ?? slug,
            icon: app!.icon,
            color: app!.color,
            // `UI` is the shorthand every app that exists today uses; the Go
            // side resolves it to {module, ui.js}. Mirrored here so an older
            // manifest opens without the server having been upgraded first.
            content: app!.content ?? { kind: "module", entry: "ui.js" },
            window: app!.window,
          };
          const remembered = loadRect(slug);
          open(slug, {
            title: meta.title,
            icon: meta.icon,
            width: meta.window?.width,
            height: meta.window?.height,
            resizable: meta.window?.resizable ?? true,
            // A remembered size wins over the manifest's: the operator resized
            // it deliberately, and the manifest is only ever a first guess.
            ...(remembered ? { width: remembered.w, height: remembered.h, x: remembered.x, y: remembered.y } : {}),
            content: (
              <AppFrame
                app={meta}
                host={{
                  apiBase: boot.apiBase,
                  locale: boot.locale,
                  dir: boot.locale === "ar" ? "rtl" : "ltr",
                  dark: boot.dark,
                  fetch: (path, init) =>
                    fetch(`${boot.apiBase}${path}`, { credentials: "include", ...init }),
                  setTitle: () => {},
                  close: () => {},
                  open: () => {},
                  sectionNonce: 0,
                }}
              />
            ),
          });
          };

  return (
    <>
      <WindowManager locale={boot.locale} />
      <Launchpad
        locale={boot.locale}
        open={launchpad}
        onOpenChange={setLaunchpad}
        apps={allApps}
        pinned={pinned}
        onLaunch={(slug: string) => {
          setLaunchpad(false);
          handleLaunch(slug);
        }}
        onPin={(slug: string) => setPinned((p) => (p.includes(slug) ? p : [...p, slug]))}
        onUnpin={(slug: string) => setPinned((p) => p.filter((s) => s !== slug))}
      />
      {/* The dock's own strip. Opaque so the shell receives clicks on it, and
          exactly as wide as the space the host reserved — see DOCK_W.

          Nothing is rendered here when the dock is hidden: an invisible 8px
          hot zone made sense for hover-to-reveal, and is just a dead strip on
          somebody's page once the toggle lives in the admin bar.

          The dock used to sit on the customer's page permanently — a 612×78
          interactive region parked in the middle of somebody else's content
          column. Now it lives on the inline-START edge, where a centred layout
          has margin to spare, and it is hidden until asked for: the shell's
          resting footprint on the host page is an 8px strip down one side.

          Shown by default and switched from the host's admin bar. Hover-to-
          reveal was tried and removed: it is the right gesture for a dock that
          floats over content, and the wrong one now that the page reserves a
          column for it — a bar the layout has already made room for should not
          disappear, because the empty stripe it leaves is worse than the bar. */}
      {dockOpen && (
        <div
          data-fos-opaque=""
          className="fixed inset-y-0 start-0 z-30"
          style={{ width: DOCK_W }}
        />
      )}
      <Dock
        // Translated out of view rather than unmounted, so the icons do not
        // re-mount (and re-run their tooltips) each time it is toggled.
        // pointer-events-none while hidden stops an off-screen tile from
        // answering a click that lands where it used to be.
        orientation="vertical"
        full
        // Slides out along the INLINE axis, so rtl:translate-x flips with the
        // dock rather than sliding it in from the wrong side.
        className={
          dockOpen
            ? "translate-x-0 transition-transform duration-200 ease-out"
            : "pointer-events-none -translate-x-full transition-transform duration-200 ease-in rtl:translate-x-full"
        }
        locale={boot.locale}
        apps={allApps}
        // `pinned` is REQUIRED and has no default: the Dock spreads
        // [...pinned, ...openSlugs], so omitting it throws "not iterable"
        // before anything renders.
        //
        // Only PINNED apps, plus whatever is running. A dock that lists every
        // installed app is a menu, not a dock — the whole point of pinning is
        // that the operator chooses the short list, and everything else lives
        // one click away in the Launchpad.
        pinned={pinned.filter((slug) => allApps.some((a) => a.slug === slug))}
        onLaunchpad={() => setLaunchpad(true)}
        onUnpin={(slug: string) => setPinned((p) => p.filter((s) => s !== slug))}
        openSlugs={openSlugs}
        onLaunch={handleLaunch}
      />
    </>
  );
}

function mountShell() {
  // No stylesheet injection here. build.shell.mjs compiles Tailwind and inlines
  // the result into the document's <style> — importing tokens.css as a raw
  // string as well would ship the source a second time (uncompiled, so useless)
  // and carry its comments into the bundle.

  const host = document.getElementById("fos");
  if (!host) return;

  let boot = DEFAULTS;
  applyBoot(boot);

  const root = createRoot(host);
  const render = () =>
    root.render(
      <WindowManagerProvider zBase={boot.zBase ?? 10}>
        <Shell boot={boot} />
      </WindowManagerProvider>,
    );
  render();

  // The loader configures the shell after load, so options do not have to ride
  // in the URL where they would end up in logs and referrers.
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window.parent) return;
    if (e.data?.t !== "fos:boot") return;
    booted = true;
    clearInterval(readyTimer);
    boot = { ...DEFAULTS, ...e.data.boot };
    applyBoot(boot);
    render();
  });

  // Announce until the loader answers, not once.
  //
  // A single "ready" is a race with no recovery: if the loader's listener is
  // not attached yet, or the message lands during its own setup, the shell
  // waits forever for options it will never receive — and the failure is
  // silent and cosmetic-looking. It renders, but with DEFAULTS, so a dark host
  // gets a light widget dropped on it and nothing appears broken enough to
  // investigate.
  //
  // Re-announcing costs one postMessage every 150ms for at most three seconds
  // and removes the whole class.
  let booted = false;
  const announce = () => {
    if (booted) return;
    window.parent?.postMessage({ t: "fos:ready" }, "*");
  };
  announce();
  const readyTimer = setInterval(announce, 150);
  setTimeout(() => clearInterval(readyTimer), 3000);

  // The heartbeat. Unconditional and on a timer — NOT tied to render, and not
  // on rAF, because rAF is throttled or halted in a backgrounded tab and the
  // loader must be able to tell "backgrounded" from "dead". Missing this is
  // what the loader's watchdog exists to survive; sending it is what keeps a
  // working shell from being torn down for looking broken.
  setInterval(() => {
    window.parent?.postMessage({ t: "fos:heartbeat" }, "*");
  }, 500);

  // Report the opaque regions the shell is actually painting, so the loader can
  // clip the frame to exactly them and every other pixel stays the host's.
  //
  // Reported on rAF because it must track a drag, but the loader only rewrites
  // the clip-path when the rects actually change — writing an identical value
  // 60 times a second is a layout invalidation per frame on a page we do not own.
  // Belt to the braces above: a pointerup that never reaches the window's own
  // handler — released over browser chrome, or a cancelled touch — would leave
  // the attribute set and the overlay solid over the whole page. The loader's
  // watchdog would eventually tear down, but recovering here is cheaper and
  // invisible.
  for (const ev of ["pointerup", "pointercancel", "blur"] as const) {
    window.addEventListener(ev, () => document.documentElement.removeAttribute("data-fos-dragging"), true);
  }

  const report = () => {
    const rects = Array.from(document.querySelectorAll<HTMLElement>("[data-fos-opaque]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    // CAPTURE while a window is being dragged or resized.
    //
    // A drag toward the screen edge takes the pointer outside the window's own
    // opaque rect, where the overlay is clipped and the event falls through to
    // the host page — so the window stopped following the cursor and the edge
    // snapping upstream already implements could never be reached. Capture
    // makes the whole overlay solid for the duration; the loader's dead-man's
    // switch (watchdog.ts) is what guarantees it cannot get stuck that way.
    const capture = document.documentElement.hasAttribute("data-fos-dragging");
    window.parent?.postMessage({ t: "fos:regions", rects, capture }, "*");
    requestAnimationFrame(report);
  };
  requestAnimationFrame(report);
}

mountShell();
