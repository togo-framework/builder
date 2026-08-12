// The builder's own screens, as OS apps.
//
// These are the twenty-odd dashboard screens the plan wanted windowed "without
// being rewritten". They are `route` apps: the REAL screen, same-origin, in a
// frame — so there is exactly one implementation of each and the session cookie
// already applies. A windowed reimplementation would drift from the page
// version within a release.
//
// The panel's launcher (src/index.ts) has always worked this way. This is the
// same set with the same paths and the same accent tokens, expressed as app
// manifests so the dock, Launchpad and Spotlight can all read one list.

import type { AppMeta } from "../app/contract";

interface Screen {
  slug: string;
  path: string;
  icon: string;
  en: string;
  ar: string;
}

/**
 * Paths are the dashboard's, not the host's.
 *
 * AppFrame prefixes `${apiBase}/builder`, which matters: the launcher used to
 * open "/issues" at the ROOT of whatever page the widget sat on. That is
 * correct only for a project scaffolded from the blueprint, whose own router
 * happens to define those paths — installed into an existing application every
 * tile opened a 404, because the host owns "/" and has never heard of
 * "/agents".
 */
const SCREENS: Screen[] = [
  { slug: "issues", path: "/issues", icon: "Flag", en: "Issues", ar: "المشكلات" },
  { slug: "agents", path: "/agents", icon: "User", en: "Agents", ar: "الوكلاء" },
  { slug: "skills", path: "/skills", icon: "Sparkle", en: "Skills", ar: "المهارات" },
  { slug: "brain", path: "/brain", icon: "Lightbulb", en: "Brain", ar: "الذاكرة" },
  { slug: "chat", path: "/chat", icon: "MessageSquare", en: "Chat", ar: "المحادثة" },
  { slug: "sources", path: "/sources", icon: "RefreshCw", en: "Connections", ar: "الاتصالات" },
  { slug: "docs", path: "/library", icon: "Layers", en: "Library", ar: "المكتبة" },
  { slug: "vault", path: "/vault", icon: "Settings", en: "Vault", ar: "الخزنة" },
  { slug: "mcp", path: "/mcp", icon: "SquareArrowOutUpRight", en: "MCP", ar: "MCP" },
  { slug: "terminal", path: "/terminal", icon: "MonitorUp", en: "Terminal", ar: "الطرفية" },
];

/**
 * Manifests for the built-in screens.
 *
 * Sizes are per screen rather than uniform. A terminal that opens at 640x440 is
 * unusable — you cannot read wrapped output — and a vault list does not need
 * 1100px. `minWidth` is where each screen's layout stops working, which is the
 * app's own knowledge and nobody else's.
 */
export function builtinApps(locale: string): AppMeta[] {
  const ar = locale === "ar";
  return SCREENS.map((s, i) => ({
    slug: s.slug,
    title: ar ? s.ar : s.en,
    icon: s.icon,
    color: `var(--app-${s.slug})`,
    order: i,
    content: { kind: "route" as const, entry: s.path },
    window: windowFor(s.slug),
  }));
}

function windowFor(slug: string): AppMeta["window"] {
  switch (slug) {
    case "terminal":
      // Wide and short: 80 columns of monospace is the shape of the content,
      // and wrapped terminal output is not readable.
      return { width: 900, height: 520, minWidth: 640, minHeight: 320, resizable: true };
    case "chat":
      return { width: 560, height: 680, minWidth: 380, minHeight: 420, resizable: true };
    case "brain":
    case "issues":
      // Board-shaped: several columns side by side.
      return { width: 1040, height: 680, minWidth: 720, minHeight: 420, resizable: true };
    default:
      return { width: 820, height: 600, minWidth: 480, minHeight: 360, resizable: true };
  }
}
