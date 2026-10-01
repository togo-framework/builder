import { useEffect, useState, type MouseEvent } from "react";
import { Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { LayoutGrid, Table2, UserRound, Languages, X } from "lucide-react";
import {
  AppShell, AppHeader, AppMain, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarItem, SidebarTrigger, SidebarExpandedOnly,
  DropdownMenuItem, UserMenu, ProductMark, WsStatus, ThemeSwitcher, LocaleSwitcher,
} from "@fadymondy/nasaq/web";
import { useLocale } from "../lib/locale";
import { auth, sessionMe, clearSession, type Me } from "../lib/auth";
import { metaResources, adminList, type ResourceMeta } from "../lib/admin";
import { APP_NAME } from "../lib/api";
import { appPath, routePath } from "../lib/base";
import { AgentAlerts } from "../components/agent-alerts";
import { FleetProgressBar } from "../components/fleet-progress-bar";
import { onLiveChange } from "../lib/alerts";

/** Group a flat resource list by the optional `group` field.
 * Resources with no group fall into the "Resources" default. */
function groupResources(resources: ResourceMeta[]): Map<string, ResourceMeta[]> {
  const map = new Map<string, ResourceMeta[]>();
  for (const r of resources) {
    const g = r.group ?? "Resources";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(r);
  }
  return map;
}

const ar_label = (en: string, ar: string, isAr: boolean) => isAr ? ar : en;

export function AppLayout() {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { language, setLanguage } = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const ar = language === "ar";

  // EN ⇄ AR. setLanguage (LanguageProvider) persists the choice to
  // localStorage + cookie and sets dir/lang on <html>, so the whole app —
  // portals included — mirrors without any per-page wiring.
  const handleToggleLanguage = () => setLanguage(ar ? "en" : "ar");

  // `?lang=` wins inside a FRAME.
  //
  // The shell passes the surrounding product's locale on the frame URL, but
  // LanguageProvider reads its own cookie and localStorage and so ignored the
  // `initialLanguage` we hand it — a screen opened from an Arabic page came up
  // in English under an Arabic window title. Setting it explicitly is the only
  // thing that outranks a stored choice, and it is correct to: inside a window
  // the surrounding product's language is not a preference, it is the context.
  //
  // Frame-only, so a normal visit still keeps whatever the operator chose here.
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    const want = new URLSearchParams(window.location.search).get("lang");
    if ((want === "ar" || want === "en") && want !== language) setLanguage(want);
  }, [language, setLanguage]);

  useEffect(() => {
    // Auth is already guaranteed by the route's beforeLoad guard — just read the cached user.
    sessionMe().then(setMe);
    metaResources().then((rs) => {
      setResources(rs);
      // Sidebar count badges — one fetch per resource (best-effort).
      rs.forEach((r) => adminList(r.table).then((rows) => setCounts((c) => ({ ...c, [r.table]: rows.length }))).catch(() => {}));
    });
    // Subscribe to the REAL stream's state rather than opening a second one.
    // The badge now cannot claim "connected" unless the connection carrying the
    // alerts is genuinely up.
    return onLiveChange(setLive);
  }, []);

  const initial = (me?.email ?? "?").charAt(0).toUpperCase();
  const go = (to: string) => nav({ to });
  const grouped = groupResources(resources);

  // Standalone mode: the page, without the product's chrome.
  //
  // The builder's screens are opened from the feedback launcher, which now
  // NAVIGATES rather than framing them. Drawing the host's sidebar and account
  // menu around one would put the operator back inside the application they
  // just left — the launcher exists to step out of it, not to redecorate it.
  //
  // Three signals, because none alone survives everything:
  //   - `?embed=1` is what the launcher sets, and what makes the mode visible
  //     in the address bar while debugging.
  //   - sessionStorage is what makes it STICK. The param does not survive
  //     in-app navigation: a <Link> to /skills/$name drops the query string,
  //     and the chrome would reappear one click in. With the iframe gone there
  //     is no frame check left to catch that.
  //   - window.self !== window.top still holds for anyone embedding a screen
  //     in their own page, which is an honest question independent of this
  //     launcher.
  //
  // Scoped to the tab (sessionStorage, not localStorage): opening the board in
  // a new tab from a bookmark should give the full product, not a stripped
  // screen the operator has no way to explain.
  const STANDALONE_KEY = "builder:standalone";
  const RETURN_KEY = "builder:standalone:return";

  // The launcher's own screens. The flag is sticky for the tab, so without
  // this list it strips the chrome from the HOST product's pages too: open the
  // board, press the browser's Back, and the dashboard arrives with no sidebar
  // and no account menu, looking broken with no way to explain it.
  //
  // Scoped by prefix so a detail route (/issues/39, /skills/foo) stays
  // standalone, which is the case the sticky flag exists for.
  const STANDALONE_ROUTES = [
    "/agents", "/skills", "/issues", "/vault",
    "/mcp", "/terminal", "/sources", "/library", "/brain", "/chat",
    // Every user-added app, by prefix. A custom app is one of the builder's
    // screens in every way that matters here, and enumerating them would mean
    // this list needs an edit each time one is dropped in — which is the exact
    // coupling the extension point exists to remove.
    "/apps",
  ];

  // Inside an iframe — which for these screens means inside a FeedbackOS app
  // window, whose chrome already names the screen and closes it.
  const framed = typeof window !== "undefined" && window.self !== window.top;

  // html and body paint their own background before any React tree exists, so
  // a transparent wrapper alone still sits on an opaque page. Cleared for the
  // frame's lifetime and restored on unmount.
  useEffect(() => {
    if (!framed) return;
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, [framed]);

  let embedded = false;
  if (typeof window !== "undefined") {
    // Stripped of the mount point: under the plugin build these arrive as
    // /builder/issues, and every entry in STANDALONE_ROUTES is written as the
    // route the router knows. Comparing the raw pathname matched nothing and
    // the standalone mode silently never engaged.
    const path = routePath(window.location.pathname);
    const isAppRoute = STANDALONE_ROUTES.some(
      (p) => path === p || path.startsWith(p + "/"),
    );
    const param = new URLSearchParams(window.location.search).get("embed") === "1";
    if (param && isAppRoute) sessionStorage.setItem(STANDALONE_KEY, "1");
    embedded =
      isAppRoute &&
      (param ||
        window.self !== window.top ||
        sessionStorage.getItem(STANDALONE_KEY) === "1");
  }

  // Leaving standalone mode has to clear the flag, or the next visit to any
  // route in this tab is still stripped.
  const handleClose = () => {
    const back = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(STANDALONE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // The page they were on when they opened the launcher, recorded by the SDK
    // at that moment. history.back() steps ONE entry, so after opening two
    // screens it lands on another builder screen — technically "back", but not
    // where anyone meant.
    if (back) {
      window.location.assign(back);
      return;
    }
    // A screen opened directly, with no launcher and nothing recorded.
    if (window.history.length > 1) window.history.back();
    else window.location.assign(appPath("/"));
  };

  if (embedded) {
    return (
      <>
        {/* No AgentAlerts here: the host page behind this overlay is already
            running its own, and two copies would announce every alert twice. */}
        <div
          /* Transparent when FRAMED so the window's own translucent, blurred
             surface shows through. An opaque page background inside a frosted
             window defeats the frosting exactly at the point it matters — the
             window reads as a solid panel with a decorative border. */
          className={`flex min-h-dvh min-w-0 flex-col ${framed ? "bg-transparent" : "bg-background"}`}
        >
          {/* A background fleet generation is builder state, and these ARE the
              builder's screens — the spend stays visible here too. */}
          <FleetProgressBar />
          {/* One slim bar, and the only host chrome a standalone screen gets.
              Without a way back, arriving here is a one-way trip: the operator
              came from the product, and the launcher gave them no navigation
              to return through.
              
              Hidden when FRAMED, because then a window already provides both
              halves of it — the title bar names the screen and the traffic
              lights close it. Two close buttons a centimetre apart, one of
              which closes a window and one of which navigates a page, is the
              difference between a screen that looks like an app and one that
              looks like a browser inside a window. */}
          {!framed && (
          <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-2">
            {/* The label names the language you would switch TO, written in
                itself — the one string that stays readable from the "wrong"
                locale. me-auto keeps it on the start edge, Close on the end. */}
            <button
              type="button"
              onClick={handleToggleLanguage}
              className="me-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Languages className="size-3.5" />
              {ar ? "English" : "العربية"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label={ar ? "إغلاق والعودة" : "Close and go back"}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              {ar ? "إغلاق" : "Close"}
            </button>
          </div>
          )}
          {/* min-h-0 so the scroll chain reaches this child rather than
              stopping at the flex parent. */}
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </>
    );
  }

  // SidebarItem is a real <a>: keep the href and route in-app on a plain click.
  const link = (to: string) => ({
    href: to,
    active: pathname === to,
    onClick: (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(to);
    },
  });
  const signOut = async () => { await auth.logout(); clearSession(); go("/login"); };
  const name = me?.email?.split("@")[0] ?? "...";

  // Core nav.
  //
  // Agents, Skills, Issues and Vault used to live here. They are the BUILDER's
  // own screens, not the product's, and now live behind the feedback button as
  // an overlay. The sidebar below belongs entirely to the product.
  const sidebar = (
    <Sidebar>
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <ProductMark size={24} />
          <SidebarExpandedOnly><span className="truncate font-semibold">{APP_NAME}</span></SidebarExpandedOnly>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarItem {...link("/dashboard")} icon={<LayoutGrid />}>{ar_label("Dashboard", "لوحة التحكم", ar)}</SidebarItem>
        </SidebarGroup>

        {/* Resource groups: each `group` value becomes its own sidebar section */}
        {Array.from(grouped.entries()).map(([groupName, items]) => (
          <SidebarGroup key={groupName} label={groupName} collapsible>
            {items.map((r) => (
              <SidebarItem
                key={r.table}
                {...link(`/admin/${r.table}`)}
                icon={<Table2 />}
                trailing={counts[r.table] !== undefined ? <span className="text-caption text-muted-foreground tabular-nums">{counts[r.table]}</span> : undefined}
                className="capitalize"
              >
                {r.name || r.table}
              </SidebarItem>
            ))}
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={{ name, email: me?.email ?? "" }} preferences={false} onSignOut={signOut} labels={{ signOut: ar_label("Sign out", "تسجيل الخروج", ar) }}>
          <DropdownMenuItem onClick={() => go("/profile")}><UserRound />{ar_label("Profile", "الملف الشخصي", ar)}</DropdownMenuItem>
        </UserMenu>
      </SidebarFooter>
    </Sidebar>
  );

  return (
    <>
      <AgentAlerts />
      <AppShell sidebar={sidebar}>
        {/* Above the header, on every page: a running generation spends real
            money, and the operator who left the wizard early must never lose
            sight of it. Renders nothing (and polls nothing) when no run exists. */}
        <FleetProgressBar />
        <AppHeader>
          <SidebarTrigger />
          <WsStatus state={live ? "connected" : "offline"} showLatency={false} />
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </AppHeader>
        <AppMain><Outlet /></AppMain>
      </AppShell>
    </>
  );
}
