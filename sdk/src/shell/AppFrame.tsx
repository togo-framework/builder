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
  if (kind === "route") {
    const base = host.apiBase.replace(/\/$/, "");
    return (
      <iframe
        title={app.title}
        src={`${base}/builder${entry}`}
        className="h-full w-full border-0 bg-[color:var(--fos-bg)]"
      />
    );
  }

  if (kind === "iframe") {
    return (
      <iframe
        title={app.title}
        src={entry}
        className="h-full w-full border-0 bg-[color:var(--fos-bg)]"
        // Default withholds allow-same-origin deliberately: a cross-origin app
        // gets a scoped token over postMessage, never our cookies. An app that
        // needs more has to say so in its manifest, where it is reviewable.
        sandbox={app.content.sandbox || "allow-scripts allow-forms allow-popups"}
        referrerPolicy="no-referrer"
      />
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
            <p className="text-sm font-medium text-[color:var(--fos-danger)]">
              {app.title} could not start
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
            <p className="text-sm font-medium">{app.title} needs a newer builder</p>
            <p className="mt-1 text-xs text-[color:var(--fos-muted)]">
              This app is a “{state.kind}” app, which this version does not know how to render.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
