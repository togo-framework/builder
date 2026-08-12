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

function Shell({ boot }: { boot: ShellBoot }) {
  const { open, windows } = useWindowManager();
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

  return (
    <>
      <WindowManager />
      <Dock
        apps={apps}
        // `pinned` is REQUIRED and has no default: the Dock spreads
        // [...pinned, ...openSlugs], so omitting it throws "not iterable" before
        // anything renders. Until per-user pins are wired (that reads
        // DesktopPrefs from /api/os/session), every installed app is pinned,
        // which is also the sensible empty state for a fresh install.
        pinned={apps.map((a) => a.slug)}
        openSlugs={openSlugs}
        onLaunch={(slug: string) => {
          const app = apps.find((a) => a.slug === slug);
          open(slug, {
            title: app?.name ?? slug,
            icon: app?.icon,
            width: app?.window?.width,
            height: app?.window?.height,
            resizable: app?.window?.resizable ?? true,
            content: null,
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
}

mountShell();
