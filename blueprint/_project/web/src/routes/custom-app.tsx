import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Callout, useT } from "@togo-framework/ui";
import { LayoutGrid, TriangleAlert } from "lucide-react";
import { PageShell } from "../components/page-shell";
import {
  appModuleURL, appText, getApp, makeAppContext,
  type AppMount, type CustomApp,
} from "../lib/apps";

/**
 * custom-app — the one route every user-added app is served through.
 *
 * There is exactly one of these, and it is generic on purpose: a custom app
 * must not require an edit to this file, to the router, or to anything else in
 * the builder. It arrives as a directory on disk, the registry finds it, and
 * /apps/<slug> resolves here.
 *
 * The app's UI is an ES module fetched at run time and imported by URL, not a
 * bundled component. That is what makes "drop it in and reload" true: bundling
 * would mean the app has to exist at build time, which is exactly the coupling
 * this extension point removes. It costs the app React — it renders into a
 * plain DOM node — and that is the trade, taken deliberately: the feedback SDK
 * already ships as a framework-free bundle for the same reason, and a contract
 * of "one function, one element" is one an author can hold in their head.
 *
 * EVERY failure here is contained and explained. A module that 404s, throws on
 * import, exports the wrong shape, or throws inside mount() renders a Callout
 * naming the app and the reason — never a blank screen, and never an error that
 * escapes to the router and takes the shell down with it.
 */
export function CustomApp() {
  const { slug } = useParams({ from: "/_app/apps/$slug" });
  const nav = useNavigate();
  const { language } = useT();
  const ar = language === "ar";

  const hostRef = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<CustomApp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guards the async work against a slug/language change mid-flight: without
    // it, a fast switch between two apps can let the slower one's mount() write
    // into the host after the faster one already did.
    let live = true;
    let unmount: (() => void) | undefined;

    setLoading(true);
    setError("");

    const run = async () => {
      const m = await getApp(slug);
      if (!live) return;
      if (!m) {
        setError(ar
          ? `لا يوجد تطبيق باسم «${slug}». تحقق من /api/builder/apps/_health.`
          : `No app named "${slug}". Check /api/builder/apps/_health.`);
        setLoading(false);
        return;
      }
      setManifest(m);

      // @vite-ignore: the URL is only known at run time — that is the point.
      const mod = await import(/* @vite-ignore */ appModuleURL(slug));
      if (!live) return;

      const mount = (mod?.default ?? mod?.mount) as AppMount | undefined;
      if (typeof mount !== "function") {
        setError(ar
          ? "لا يصدّر ui.js دالة mount افتراضية."
          : "ui.js does not default-export a mount function.");
        setLoading(false);
        return;
      }

      const host = hostRef.current;
      if (!host) return;
      host.replaceChildren();
      host.dir = ar ? "rtl" : "ltr";

      const result = mount(host, makeAppContext(m, language, (to) => nav({ to })));
      if (typeof result === "function") unmount = result;
      setLoading(false);
    };

    run().catch((e: unknown) => {
      if (!live) return;
      const detail = e instanceof Error ? e.message : String(e);
      setError(ar
        ? `تعذّر تحميل التطبيق «${slug}»: ${detail}`
        : `Could not load the app "${slug}": ${detail}`);
      setLoading(false);
    });

    return () => {
      live = false;
      // The app's own cleanup runs first, then the host is emptied regardless —
      // an app that forgets to return a cleanup must not leak its DOM into the
      // next one.
      try {
        unmount?.();
      } catch {
        // A throwing cleanup is the app's bug, not a reason to fail navigation.
      }
      hostRef.current?.replaceChildren();
    };
  }, [slug, language, ar, nav]);

  const title = manifest ? appText(manifest.title, ar) : slug;
  const description = manifest ? appText(manifest.description, ar) : "";

  return (
    <PageShell
      title={title}
      description={description}
      icon={<LayoutGrid className="size-5" />}
    >
      {error ? (
        <Callout kind="warn" className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </Callout>
      ) : null}
      {loading && !error ? (
        <p className="text-sm text-muted-foreground">
          {ar ? "جارٍ التحميل…" : "Loading…"}
        </p>
      ) : null}
      {/* The app's element. Everything inside it belongs to the app. */}
      <div ref={hostRef} className="min-w-0" />
    </PageShell>
  );
}
CustomApp.displayName = "CustomApp";
