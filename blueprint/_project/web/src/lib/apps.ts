// Client for the custom-app registry.
//
// A custom app is a screen somebody added to this builder without editing the
// builder's source: a directory holding app.json and ui.js, discovered at boot.
// This module is the only place the web app knows about them — the route below
// it is generic, so adding an app never touches a file here.
import { API } from "./api";

/** One user-facing string, in both languages. AR falls back to EN. */
export interface AppText {
  en: string;
  ar?: string;
}

export interface CustomApp {
  slug: string;
  title: AppText;
  description?: AppText;
  /** lucide glyph name. "app" (or anything unknown) resolves to a generic tile. */
  icon?: string;
  /** #rrggbb tile colour. */
  color?: string;
  /** Launcher position. Built-ins occupy 0..99; custom apps default to 100. */
  order?: number;
  /** The ES module's filename inside the app directory. */
  ui?: string;
  /** "disk" for a drop-in app, "compiled" for one registered from Go. */
  source?: string;
  /** Whether the app mounted its own backend routes. */
  hasApi?: boolean;
  /** The app's directory, so a broken tile can be traced to files. */
  path?: string;
}

/** What the registry refused, and why. */
export interface AppsHealth {
  dir: string;
  apps: number;
  problems: string[];
}

/** Pick the string for a language, falling back to English. */
export const appText = (t: AppText | undefined, ar: boolean): string => {
  if (!t) return "";
  return ar && t.ar ? t.ar : t.en;
};

/**
 * listApps returns the installed custom apps.
 *
 * Fails SOFT, always. This is called from the app shell and from the launcher;
 * a registry that is down, unauthorised, or serving something unparseable must
 * cost the operator a row of tiles, never the page they were on.
 */
export async function listApps(): Promise<CustomApp[]> {
  try {
    const res = await fetch(`${API}/api/builder/apps`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.apps) ? (data.apps as CustomApp[]) : [];
  } catch {
    return [];
  }
}

/** getApp returns one manifest, or null when the slug is unknown. */
export async function getApp(slug: string): Promise<CustomApp | null> {
  const res = await fetch(`${API}/api/builder/apps/${encodeURIComponent(slug)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`the registry answered ${res.status}`);
  return (await res.json()) as CustomApp;
}

/** The URL the app's ES module is imported from. */
export const appModuleURL = (slug: string): string =>
  `${API}/api/builder/apps/${encodeURIComponent(slug)}/ui.js`;

/** appsHealth reports what the last scan rejected. */
export async function appsHealth(): Promise<AppsHealth> {
  const res = await fetch(`${API}/api/builder/apps/_health`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`the registry answered ${res.status}`);
  return (await res.json()) as AppsHealth;
}

/** The per-app JSON blob. Drop-in apps only; a compiled app owns its storage. */
export async function getAppState(slug: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/api/builder/apps/${encodeURIComponent(slug)}/state`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`state read failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

export async function putAppState(slug: string, value: unknown): Promise<void> {
  const res = await fetch(`${API}/api/builder/apps/${encodeURIComponent(slug)}/state`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value ?? {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `state write failed (${res.status})`);
  }
}

/**
 * AppContext is what a custom app's `mount` receives. It is the contract — a
 * change here is a breaking change for every installed app, so it grows by
 * addition only.
 */
export interface AppContext {
  slug: string;
  manifest: CustomApp;
  /** "en" | "ar". */
  lang: string;
  /** "ltr" | "rtl", already applied to the host element. */
  dir: string;
  /** Pick a string for the current language. */
  t: (en: string, ar: string) => string;
  /** fetch scoped to this app's own backend, /api/builder/apps/<slug>/api. */
  api: (path: string, init?: RequestInit) => Promise<Response>;
  /** The app's JSON blob. */
  state: {
    get: () => Promise<Record<string, unknown>>;
    put: (value: unknown) => Promise<void>;
  };
  /** Router navigation, e.g. navigate("/issues"). */
  navigate: (to: string) => void;
}

/** What a custom app's ui.js must default-export. */
export type AppMount = (host: HTMLElement, ctx: AppContext) => void | (() => void);

/** Build the context handed to one app's mount(). */
export function makeAppContext(
  manifest: CustomApp,
  lang: string,
  navigate: (to: string) => void,
): AppContext {
  const slug = manifest.slug;
  const ar = lang === "ar";
  return {
    slug,
    manifest,
    lang,
    dir: ar ? "rtl" : "ltr",
    t: (en, arText) => (ar ? arText || en : en),
    api: (path, init) =>
      fetch(
        `${API}/api/builder/apps/${encodeURIComponent(slug)}/api${path.startsWith("/") ? path : `/${path}`}`,
        { credentials: "include", ...init },
      ),
    state: {
      get: () => getAppState(slug),
      put: (value) => putAppState(slug, value),
    },
    navigate,
  };
}
