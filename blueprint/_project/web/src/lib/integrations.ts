// The Connections app's data layer.
//
// Mirrors internal/integrations. The catalogue is static per build, the statuses
// are live — so they are two calls rather than one, and the gallery can render
// fully while the probes are still running. A screen that waits for three
// subprocess round trips before showing anything looks broken.

import { API } from "./api";

const base = `${API}/api/builder/integrations`;

export type Category = "terminal" | "api" | "database" | "reader" | "analytics";
export type Auth = "terminal" | "token" | "dsn" | "oauth" | "none";
export type State = "connected" | "disconnected" | "missing" | "unknown";

export interface Text {
  en: string;
  ar: string;
}

export interface Integration {
  slug: string;
  title: Text;
  summary: Text;
  category: Category;
  auth: Auth;
  icon: string;
  color: string;
  collects: boolean;
  acts: boolean;
  actorKind?: string;
  sourceKind?: string;
  inputs: unknown;
  terminal?: {
    bin: string;
    install: Text;
    login: string[];
    status: string[];
    version: string[];
    logout: string[];
  };
  docsUrl?: string;
  beta?: boolean;
}

export interface CategoryMeta {
  key: Category;
  title: Text;
  help: Text;
}

export interface Status {
  slug: string;
  state: State;
  version?: string;
  detail?: string;
  install?: Text;
}

export interface ConnectResult {
  session: string;
  command: string;
  hint: Text;
}

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  // The server's messages name the exact thing that is wrong — a missing
  // binary says which one, and carries its install hint. Surfacing them
  // verbatim beats anything invented here.
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const getCatalog = () =>
  fetch(`${base}/catalog`, { credentials: "include" }).then(
    json<{ categories: CategoryMeta[]; integrations: Integration[] }>,
  );

export const getStatuses = () =>
  fetch(`${base}/status`, { credentials: "include" }).then(json<{ statuses: Status[] }>);

export const getStatus = (slug: string) =>
  fetch(`${base}/status/${slug}`, { credentials: "include" }).then(json<Status>);

export const connect = (slug: string) =>
  fetch(`${base}/connect/${slug}`, { method: "POST", credentials: "include" }).then(
    json<ConnectResult>,
  );

export const disconnect = (slug: string) =>
  fetch(`${base}/disconnect/${slug}`, { method: "POST", credentials: "include" }).then(
    json<ConnectResult>,
  );

/** Pick the reader's language out of a localized pair. */
export const t = (v: Text | undefined, ar: boolean) => (ar ? v?.ar : v?.en) || v?.en || "";
