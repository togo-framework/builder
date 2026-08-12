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
import type { OSApp } from "../../vendor/ui-desktop-embed/hooks/useOSApps";
import { AppFrame } from "./AppFrame";
import type { AppMeta } from "../app/contract";
import { loadRect, debouncedSaveRect } from "./geometry";
import { Report } from "./apps/report/Report";
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
}

// One debouncer for the whole shell: a drag emits a rect per pointermove, and a
// synchronous localStorage write per frame on somebody else's page is not free.
const persistRect = debouncedSaveRect();

function Shell({ boot }: { boot: ShellBoot }) {
  const { open, windows } = useWindowManager();

  // Remember where windows are put. Device-local by design — see geometry.ts:
  // a layout tuned on a 27-inch monitor is wrong on a laptop, so syncing rects
  // across devices makes things worse rather than better.
  useEffect(() => {
    for (const w of windows) persistRect(w.slug, w.rect);
  }, [windows]);
  const [apps, setApps] = useState<OSApp[]>([]);

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

  const openSlugs = windows.filter((w) => !w.minimized).map((w) => w.slug);

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
  const serverSlugs = new Set(apps.map((a) => a.slug));
  const allApps = [
    reportApp,
    ...builtins
      .filter((b) => !serverSlugs.has(b.slug))
      .map((b) => ({ slug: b.slug, name: b.title, icon: b.icon, color: b.color } as OSApp)),
    ...apps.filter((a) => a.slug !== "report"),
  ];

  return (
    <>
      <WindowManager />
      <Dock
        apps={allApps}
        // `pinned` is REQUIRED and has no default: the Dock spreads
        // [...pinned, ...openSlugs], so omitting it throws "not iterable" before
        // anything renders. Until per-user pins are wired (that reads
        // DesktopPrefs from /api/os/session), every installed app is pinned,
        // which is also the sensible empty state for a fresh install.
        pinned={allApps.map((a) => a.slug)}
        openSlugs={openSlugs}
        onLaunch={(slug: string) => {
          if (slug === "report") {
            open(slug, {
              title: reportApp.name,
              icon: reportApp.icon,
              width: 720, height: 520, resizable: true,
              content: (
                <Report
                  host={{
                    slug: "report", apiBase: boot.apiBase, locale: boot.locale,
                    dir: boot.locale === "ar" ? "rtl" : "ltr", dark: boot.dark,
                    fetch: (path, init) => fetch(`${boot.apiBase}${path}`, { credentials: "include", ...init }),
                    setTitle: () => {}, close: () => {}, open: () => {}, sectionNonce: 0,
                  }}
                  context={{ route: location.pathname, console: [], network: [] }}
                  attachments={[
                    { id: "route", kind: "route", label: location.pathname, removable: false },
                  ]}
                  onRemoveAttachment={() => {}}
                  onSubmit={async () => {}}
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
            ...(remembered ? { width: remembered.w, height: remembered.h } : {}),
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
        }}
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
    boot = { ...DEFAULTS, ...e.data.boot };
    applyBoot(boot);
    render();
  });

  window.parent?.postMessage({ t: "fos:ready" }, "*");

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
  const report = () => {
    const rects = Array.from(document.querySelectorAll<HTMLElement>("[data-fos-opaque]")).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    window.parent?.postMessage({ t: "fos:regions", rects, capture: false }, "*");
    requestAnimationFrame(report);
  };
  requestAnimationFrame(report);
}

mountShell();
