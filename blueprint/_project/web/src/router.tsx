import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router";
import { SentraLoading } from "@togo-framework/ui";
import { Providers } from "./providers";
import { sessionMe } from "./lib/auth";
import { isSetupComplete } from "./lib/setup";
import { Welcome } from "./routes/welcome";
import { Login } from "./routes/login";
import { Register } from "./routes/register";
import { Reset } from "./routes/reset";
import { AppLayout } from "./routes/app-layout";

// The authenticated admin surface (dashboard charts/widgets/ThemePicker, the
// resource tables/forms/infolists) is the heavy part of the bundle — lazy-load it
// so it splits into its own chunk and the public/auth first paint stays small.
// The router's pending component (SentraLoading) shows while the chunk loads.
const Dashboard = lazyRouteComponent(() => import("./routes/dashboard"), "Dashboard");
const AdminResource = lazyRouteComponent(() => import("./routes/admin-resource"), "AdminResource");
const Profile = lazyRouteComponent(() => import("./routes/profile"), "Profile");
const Issues = lazyRouteComponent(() => import("./routes/issues"), "Issues");
const IssueDetail = lazyRouteComponent(() => import("./routes/issue-detail"), "IssueDetail");
const Setup = lazyRouteComponent(() => import("./routes/setup"), "Setup");
const Vault = lazyRouteComponent(() => import("./routes/vault"), "Vault");
const Agents = lazyRouteComponent(() => import("./routes/agents"), "Agents");
const AgentDetail = lazyRouteComponent(() => import("./routes/agent-detail"), "AgentDetail");
const Skills = lazyRouteComponent(() => import("./routes/skills"), "Skills");
const Sources = lazyRouteComponent(() => import("./routes/sources"), "Sources");
const Docs = lazyRouteComponent(() => import("./routes/docs"), "Docs");
const Brain = lazyRouteComponent(() => import("./routes/brain"), "Brain");
const Chat = lazyRouteComponent(() => import("./routes/chat"), "Chat");
const SkillDetail = lazyRouteComponent(() => import("./routes/skill-detail"), "SkillDetail");
const Mcp = lazyRouteComponent(() => import("./routes/mcp"), "Mcp");
const Terminal = lazyRouteComponent(() => import("./routes/terminal"), "Terminal");

const rootRoute = createRootRoute({ component: () => (<Providers><Outlet /></Providers>) });

// Already signed in → skip the auth pages and go straight to the dashboard.
const redirectIfAuthed = async () => {
  if (await sessionMe()) throw redirect({ to: "/dashboard" });
};

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Welcome });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: Login, beforeLoad: redirectIfAuthed });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/register", component: Register, beforeLoad: redirectIfAuthed });
const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset", component: Reset });
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: Setup,
  beforeLoad: async () => {
    // Auth still required — but NOT the setup gate, or this route redirects to itself.
    if (!(await sessionMe())) throw redirect({ to: "/login" });
  },
});

// Protected shell. The guard runs in beforeLoad — BEFORE the layout/children render —
// so unauthenticated visitors are redirected to /login without the private page ever
// painting (the router shows the pending loader while the check runs). The resolved
// user is returned as route context so children don't re-fetch /me.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  component: AppLayout,
  beforeLoad: async () => {
    const me = await sessionMe();
    if (!me) throw redirect({ to: "/login" });
    // The fleet is generated BEFORE the dashboard opens, so a filed issue always
    // has a team to work it. isSetupComplete fails open: a setup endpoint that is
    // down must not lock an operator out of a working dashboard.
    if (!(await isSetupComplete())) throw redirect({ to: "/setup" });
    return { me };
  },
});
const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: "/dashboard", component: Dashboard });
const resourceRoute = createRoute({ getParentRoute: () => appRoute, path: "/admin/$resource", component: AdminResource });
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: "/profile", component: Profile });
const issuesRoute = createRoute({ getParentRoute: () => appRoute, path: "/issues", component: Issues });
const vaultRoute = createRoute({ getParentRoute: () => appRoute, path: "/vault", component: Vault });
const agentsRoute = createRoute({ getParentRoute: () => appRoute, path: "/agents", component: Agents });
const agentDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/agents/$slug", component: AgentDetail });
const skillsRoute = createRoute({ getParentRoute: () => appRoute, path: "/skills", component: Skills });
const sourcesRoute = createRoute({ getParentRoute: () => appRoute, path: "/sources", component: Sources });
// /docs belongs to togo's own API reference (Stoplight, served by the Go
// backend), so the reference library lives at /library. Discovered by opening
// it: the route resolved to the API docs and this page never rendered.
const docsRoute = createRoute({ getParentRoute: () => appRoute, path: "/library", component: Docs });
const brainRoute = createRoute({ getParentRoute: () => appRoute, path: "/brain", component: Brain });
const chatRoute = createRoute({ getParentRoute: () => appRoute, path: "/chat", component: Chat });
const skillDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/skills/$name", component: SkillDetail });
const mcpRoute = createRoute({ getParentRoute: () => appRoute, path: "/mcp", component: Mcp });
const terminalRoute = createRoute({ getParentRoute: () => appRoute, path: "/terminal", component: Terminal });
const issueDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/issues/$number", component: IssueDetail });

const routeTree = rootRoute.addChildren([
  indexRoute, loginRoute, registerRoute, resetRoute, setupRoute,
  appRoute.addChildren([dashboardRoute, resourceRoute, profileRoute, issuesRoute, issueDetailRoute, vaultRoute, agentsRoute, agentDetailRoute, skillsRoute, skillDetailRoute, sourcesRoute, docsRoute, brainRoute, chatRoute, mcpRoute, terminalRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // Branded full-screen loader while a route's beforeLoad (e.g. the auth check) runs.
  // 150ms delay so cached/instant navigations don't flash it.
  defaultPendingComponent: () => <SentraLoading />,
  defaultPendingMs: 150,
  defaultPendingMinMs: 300,
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
