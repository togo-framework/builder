// Renders an app's content inside a window.
//
// Four kinds, one host. The window chrome is always ours — an iframe app is not
// a second-class citizen visually, it simply cannot reach us.

import { useEffect, useRef, useState } from "react";
import {
  isFeedbackOSApp,
  type AppHost,
  type AppInstance,
  type AppMeta,
} from "../app/contract";

export interface AppFrameProps {
  app: AppMeta;
  host: Omit<AppHost, "slug">;
  /** Built-ins compiled into the shell, keyed by Content.entry. */
  builtins?: Record<string, () => Promise<{ default: unknown }>>;
}

type State =
  | { s: "loading" }
  | { s: "ready" }
  | { s: "error"; why: string }
  | { s: "unsupported"; kind: string };

export function AppFrame({ app, host, builtins }: AppFrameProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<AppInstance | null>(null);
  const [state, setState] = useState<State>({ s: "loading" });
  // Frames report their own readiness. A route or host app that is slow, or
  // that a CSP refuses to frame, otherwise showed an empty window with nothing
  // to explain it — indistinguishable from an app that renders nothing.
  const [frameState, setFrameState] = useState<"loading" | "ready" | "blocked">("loading");

  useEffect(() => {
    if (kindIsFramed(app.content.kind)) setFrameState("loading");
  }, [app.content.kind, app.content.entry]);

  useEffect(() => {
    if (!kindIsFramed(app.content.kind)) return;
    // `load` never fires for a frame the browser refused. Ten seconds is long
    // enough for a slow dashboard and short enough that nobody waits twice.
    const t = setTimeout(() => setFrameState((s) => (s === "loading" ? "blocked" : s)), 10000);
    return () => clearTimeout(t);
  }, [app.content.kind, app.content.entry]);

  const { kind, entry } = app.content;

  useEffect(() => {
    // iframe and route are rendered declaratively below, not mounted here.
    if (kind === "iframe" || kind === "route") {
      setState({ s: "ready" });
      return;
    }
    let cancelled = false;
    const el = elRef.current;
    if (!el) return;

    const full: AppHost = { ...host, slug: app.slug };

    (async () => {
      try {
        let mod: { default: unknown };
        switch (kind) {
          case "module":
            // Imported into the SHELL's realm — which is the whole reason the
            // shell has a realm of its own. In the host page this line would
            // hand a third-party module the customer's cookies and DOM.
            mod = (await import(
              /* @vite-ignore */ `${host.apiBase}/api/builder/apps/${app.slug}/${entry}`
            )) as { default: unknown };
            break;
          case "builtin": {
            const load = builtins?.[entry];
            if (!load) throw new Error(`no builtin named ${entry}`);
            mod = await load();
            break;
          }
          default:
            // An app built for a newer builder. One tile says so; the registry
            // and every other app are unaffected.
            if (!cancelled) setState({ s: "unsupported", kind });
            return;
        }

        if (cancelled) return;
        const def = (mod as { default: unknown }).default;
        if (!isFeedbackOSApp(def)) {
          setState({ s: "error", why: "the module has no default export with a mount()" });
          return;
        }
        const inst = await def.mount(el, full);
        if (cancelled) {
          (inst as AppInstance | undefined)?.unmount?.();
          return;
        }
        instRef.current = (inst as AppInstance) ?? null;
        setState({ s: "ready" });
      } catch (err) {
        if (!cancelled) {
          // An app that throws on mount must not take the shell with it. The
          // window stays, showing why, and every other window keeps working.
          setState({ s: "error", why: err instanceof Error ? err.message : String(err) });
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        instRef.current?.unmount?.();
      } catch {
        // An app that throws while unmounting has already been removed from the
        // DOM by React. Nothing left to salvage, and rethrowing here would take
        // out the window manager mid-update.
      }
      instRef.current = null;
    };
  }, [app.slug, kind, entry, host.apiBase]);

  // Re-target an already-open app rather than remounting it: the operator
  // expects Settings to jump to a section, not to lose its state.
  useEffect(() => {
    if (host.section) instRef.current?.onSection?.(host.section, host.sectionNonce);
  }, [host.section, host.sectionNonce]);

  useEffect(() => {
    instRef.current?.onHostChange?.({ ...host, slug: app.slug });
  }, [host.locale, host.dir, host.dark]);

  // A dashboard route: the REAL screen, same-origin, in a frame.
  //
  // Same-origin and NOT sandboxed, which is the whole difference from an
  // `iframe` app. These are our own screens on our own origin — the session
  // cookie already applies, so there is exactly one implementation of each
  // screen rather than a windowed reimplementation that drifts from the page.
  // The existing panel launcher established this; it is not a new trust
  // decision, just the same one in a window.
  /** Wraps a framed app with its loading and blocked states. */
  const framed = (el: React.ReactElement) => (
    <div className="relative h-full w-full">
      {el}
      {frameState !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-[color:var(--fos-bg)]/60 p-6 text-center backdrop-blur-sm">
          {frameState === "loading" ? (
            <span
              role="status"
              aria-label={host.locale === "ar" ? "جارٍ التحميل" : "Loading"}
              className="size-6 animate-spin rounded-full border-2 border-[color:var(--fos-border)] border-t-[color:var(--fos-accent)]"
            />
          ) : (
            <div>
              <p className="text-sm font-medium text-[color:var(--fos-danger)]">
                {host.locale === "ar" ? "تعذّر فتح هذا التطبيق" : "This app could not be opened"}
              </p>
              {/* The likely reason, named. A frame that never loads is almost
                  always a CSP frame-ancestors rule, and saying so is the
                  difference between a two-minute fix and an afternoon. */}
              <p className="mt-1 text-xs text-[color:var(--fos-muted)]">
                {host.locale === "ar"
                  ? "قد تمنع سياسة أمان المحتوى تضمين هذه الصفحة."
                  : "A Content-Security-Policy may be preventing it from being framed."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (kind === "route") {
    const base = host.apiBase.replace(/\/$/, "");
    // `?embed=1` is not decoration: without it the dashboard renders its own
    // sidebar, header and account menu INSIDE our window chrome, so an app
    // window looked like a browser showing the whole product rather than like
    // an app. The dashboard already understands the flag — the launcher has
    // always set it — and it makes the mode visible in the frame's URL while
    // debugging, which the frame check alone does not.
    // `lang` travels with the frame. The dashboard's LanguageProvider defaults
    // to English and only remembers a choice the operator made INSIDE it, so a
    // framed screen came up in English under an Arabic window title, on an
    // Arabic page, in a right-to-left shell.
    const q = new URLSearchParams(entry.includes("?") ? entry.slice(entry.indexOf("?") + 1) : "");
    q.set("embed", "1");
    q.set("lang", host.locale);
    const path = entry.includes("?") ? entry.slice(0, entry.indexOf("?")) : entry;
    return framed(
      <iframe
        onLoad={() => setFrameState("ready")}
        title={app.title}
        src={`${base}/builder${path}?${q.toString()}`}
        className="h-full w-full overscroll-contain border-0 bg-transparent"
      />,
    );
  }

  // A screen belonging to the EMBEDDING site, framed on its own origin.
  //
  // Same-origin and unsandboxed, like `route` — this is the host's own
  // application under the host's own session, and it only ever appears because
  // the host itself listed it in mount({ apps }). Nothing the server sends can
  // produce this kind, so a compromised app registry cannot use it to frame
  // the customer's pages.
  if (kind === "host") {
    // `?embed=1`, exactly as `route` does, and for exactly the same reason:
    // the host's page is its whole application, so framing it raw draws its
    // header, sidebar, admin bar and its OWN copy of this widget inside our
    // window. The site is expected to honour the flag by rendering the screen
    // and nothing around it; one that ignores it still works, it just looks
    // like a browser inside a window.
    const url = new URL(entry, location.origin);
    url.searchParams.set("embed", "1");
    url.searchParams.set("lang", host.locale);
    return framed(
      <iframe
        onLoad={() => setFrameState("ready")}
        title={app.title}
        src={url.href}
        className="h-full w-full overscroll-contain border-0 bg-transparent"
      />,
    );
  }

  if (kind === "iframe") {
    return framed(
      <iframe
        onLoad={() => setFrameState("ready")}
        title={app.title}
        src={entry}
        className="h-full w-full overscroll-contain border-0 bg-transparent"
        // Default withholds allow-same-origin deliberately: a cross-origin app
        // gets a scoped token over postMessage, never our cookies. An app that
        // needs more has to say so in its manifest, where it is reviewable.
        sandbox={app.content.sandbox || "allow-scripts allow-forms allow-popups"}
        referrerPolicy="no-referrer"
      />,
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={elRef} className="h-full w-full overflow-auto" />
      {state.s === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-sm text-[color:var(--fos-muted)]">
          …
        </div>
      )}
      {state.s === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p role="alert" className="text-sm font-medium text-[color:var(--fos-danger)]">
              {host.locale === "ar"
                ? `تعذّر تشغيل ${app.title}`
                : `${app.title} could not start`}
            </p>
            {/* The reason, verbatim. "Something went wrong" sends whoever wrote
                the app to read our source instead of their own. */}
            <p className="mt-1 text-xs text-[color:var(--fos-muted)]">{state.why}</p>
          </div>
        </div>
      )}
      {state.s === "unsupported" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p role="alert" className="text-sm font-medium">
              {host.locale === "ar"
                ? `${app.title} يحتاج إصدارًا أحدث`
                : `${app.title} needs a newer builder`}
            </p>
            <p className="mt-1 text-xs text-[color:var(--fos-muted)]">
              This app is a “{state.kind}” app, which this version does not know how to render.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


/** The kinds rendered as an iframe, which therefore have a load event. */
function kindIsFramed(kind: string): boolean {
  return kind === "route" || kind === "host" || kind === "iframe";
}
