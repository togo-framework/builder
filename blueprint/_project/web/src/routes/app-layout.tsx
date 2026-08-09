import { useEffect, useState } from "react";
import { Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { LayoutGrid, Table2, User, LogOut, Layers, ChevronDown } from "lucide-react";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarInset, SidebarTrigger, Avatar, AvatarFallback,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  StatusBadge, ThemePicker, useT,
} from "@togo-framework/ui";
import { auth, sessionMe, clearSession, type Me } from "../lib/auth";
import { metaResources, adminList, type ResourceMeta } from "../lib/admin";
import { ToastProvider } from "../components/admin/toast";
import { API, APP_NAME } from "../lib/api";
import { AgentAlerts } from "../components/agent-alerts";
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
  const { language } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [live, setLive] = useState(false);
  const ar = language === "ar";

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

  // Embedded mode: the page, without the product's chrome.
  //
  // The builder's screens are opened from the feedback overlay in an iframe on
  // this same origin. Rendering the full layout in there would put a second
  // sidebar and a second account menu inside a panel floating over the first
  // ones — two apps stacked on screen, both claiming to be the navigation.
  //
  // BOTH conditions, deliberately. The `?embed=1` param is what the launcher
  // sets and what makes the mode visible in the address bar while debugging it,
  // but it does not survive in-app navigation: a <Link> to /skills/$name inside
  // the overlay drops the query string, and the chrome would reappear one click
  // in. The frame check is what actually holds, and it is the honest question —
  // "am I rendering inside someone else's page?" — so it is not scoped to this
  // one launcher either.
  const embedded =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("embed") === "1" ||
      window.self !== window.top);

  if (embedded) {
    return (
      <ToastProvider dir={ar ? "rtl" : "ltr"}>
        {/* No AgentAlerts here: the host page behind this overlay is already
            running its own, and two copies would announce every alert twice. */}
        <main className="min-h-dvh min-w-0 overflow-auto bg-background">
          <Outlet />
        </main>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider dir={ar ? "rtl" : "ltr"}>
    <AgentAlerts />
    <SidebarProvider dir={ar ? "rtl" : "ltr"}>
      {/* collapsible="icon" → the SidebarTrigger minimizes the sidebar to icons. */}
      <Sidebar collapsible="icon" side={ar ? "right" : "left"}>
        <SidebarHeader>
          {/* SidebarHeader already applies p-2; SidebarMenuButton (not a raw
              padded Link) is what carries the group-data-[collapsible=icon]
              sizing that keeps the logo inside the collapsed icon rail. A
              plain Link with its own px-2 doubled the horizontal padding and
              pushed the logo past the sidebar's collapsed width. */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={APP_NAME}>
                <Link to="/dashboard">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Layers className="h-4 w-4" /></span>
                  <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">{APP_NAME}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {/* Core nav.

              Agents, Skills, Issues and Vault used to live here. They are the
              BUILDER's own screens, not the product's, and putting them in the
              product's navigation meant every app built on this framework
              shipped with four permanent menu items belonging to its own build
              tooling — and left the agents no room to add their own without
              colliding with them.

              They now live behind the feedback button as an overlay, which is
              what they always were: a layer over the app, not part of it. The
              sidebar below this point belongs entirely to the product. */}
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname === "/dashboard"} tooltip={ar_label("Dashboard", "لوحة التحكم", ar)} onClick={() => go("/dashboard")}>
                  <LayoutGrid className="h-4 w-4" /><span>{ar_label("Dashboard", "لوحة التحكم", ar)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Resource groups — each `group` value becomes its own sidebar section */}
          {Array.from(grouped.entries()).map(([groupName, groupResources]) => (
            <SidebarGroup key={groupName}>
              <SidebarGroupLabel>{groupName}</SidebarGroupLabel>
              <SidebarMenu>
                {groupResources.map((r) => (
                  <SidebarMenuItem key={r.table}>
                    <SidebarMenuButton
                      isActive={pathname === `/admin/${r.table}`}
                      tooltip={r.name || r.table}
                      onClick={() => go(`/admin/${r.table}`)}
                    >
                      <Table2 className="h-4 w-4" />
                      <span className="capitalize">{r.name || r.table}</span>
                      {counts[r.table] !== undefined && (
                        <span className="ms-auto rounded-full bg-muted px-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                          {counts[r.table]}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
      </Sidebar>

      {/* min-w-0 is load-bearing. SidebarInset renders a flex item, and a flex
          item defaults to min-width:auto — it refuses to shrink below its
          content. Any page wider than the viewport (this board, a wide table)
          therefore stretched this element to the content width and pushed the
          whole layout sideways: the sidebar overlapped the page, the header ran
          off-screen, and the board's own overflow-x-auto never engaged because
          it was never actually constrained. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <StatusBadge tone={live ? "success" : "neutral"}>
              {live ? ar_label("Realtime connected", "متصل مباشرة", ar) : ar_label("Offline", "غير متصل", ar)}
            </StatusBadge>
          </div>
          <div className="flex items-center gap-1">
            {/* Theme picker — cycles through all presets (dark, light, purple, rose, emerald, …) */}
            <ThemePicker size="default" />

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pe-3 ps-1 outline-none transition hover:bg-accent">
                <Avatar className="h-8 w-8"><AvatarFallback>{initial}</AvatarFallback></Avatar>
                <span className="max-w-[160px] truncate text-sm">{me?.email ?? "…"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{me?.email ?? ""}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go("/profile")}>
                  <User className="me-2 h-4 w-4" />{ar_label("Profile", "الملف الشخصي", ar)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={async () => { await auth.logout(); clearSession(); go("/login"); }}>
                  <LogOut className="me-2 h-4 w-4" />{ar_label("Sign out", "تسجيل الخروج", ar)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider>
    </ToastProvider>
  );
}
