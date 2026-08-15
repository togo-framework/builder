// Client for the ingestion sources.
//
// A source is a recurring job that turns an external system — a repository, a
// feed, a Slack channel, a saved SQL query — into project memory the fleet can
// recall. The server owns the schedule, the lease and the retry backoff; this
// is only the operator's view of it.
import { API } from "./api";

export interface Source {
  id: string;
  kind: string;
  name: string;
  namespace: string;
  schedule: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: "" | "running" | "ok" | "error";
  lastError: string;
  consecutiveFailures: number;
  totalRuns: number;
  totalAdded: number;
  createdAt: string;
  /**
   * One sentence about the state of this source, assembled by the server so
   * every surface says the same thing about the same row — in both locales,
   * because it renders beside content that is already translated.
   */
  description: { en: string; ar: string };
}

export interface SourceRun {
  id: string;
  status: "running" | "ok" | "error";
  trigger: string;
  rowsRead: number;
  truncated: boolean;
  error: string;
  startedAt: string;
  endedAt: string | null;
}

const base = `${API}/api/builder/sources`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  // The server's 422 messages are written for the operator and name the exact
  // field that is wrong. Surfacing them verbatim beats anything invented here.
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

const send = <T>(path: string, method: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(json<T>);

export const listSources = () =>
  fetch(base, { credentials: "include" }).then(json<{ sources: Source[] }>);

/** What this build can actually run. Read from the registry, not hardcoded. */
export const listKinds = () =>
  fetch(`${base}/kinds`, { credentials: "include" }).then(json<{ kinds: string[] }>);

export const createSource = (body: {
  kind: string;
  name: string;
  namespace: string;
  schedule: string;
  config: unknown;
  enabled: boolean;
  /** "source" collects on a schedule, "actor" sends when invoked. Omitted
   *  means source, which is what every caller written before the column
   *  existed means — see migration 0019. */
  direction?: "source" | "actor";
}) => send<{ id: string }>("", "POST", body);

export const patchSource = (
  id: string,
  body: Partial<{ name: string; namespace: string; schedule: string; enabled: boolean; config: unknown }>,
) => send<void>(`/${id}`, "PATCH", body);

export const deleteSource = (id: string) => send<void>(`/${id}`, "DELETE");

/**
 * Run one source now.
 *
 * Answers 200 with `ok:false` when the refresh itself failed — the request
 * succeeded, the collection did not, and the operator needs to read why. A
 * rejected promise here would be indistinguishable from the server falling over.
 */
export const refreshSource = (id: string) =>
  send<{ ok: boolean; error?: string }>(`/${id}/refresh`, "POST");

export const sourceRuns = (id: string) =>
  fetch(`${base}/${id}/runs`, { credentials: "include" }).then(json<{ runs: SourceRun[] }>);

/**
 * A starting config per kind, so the first thing an operator sees is the shape
 * of the answer rather than an empty box. Every field here is one the connector
 * actually reads.
 */
export const configTemplate = (kind: string): string => {
  const t: Record<string, unknown> = {
    github: { owner: "golang", repo: "example", branch: "master", include: ["README*", "docs/**"] },
    rss: { feedURL: "https://go.dev/blog/feed.atom", maxEntries: 25 },
    slack: { channelID: "C0123456789", tokenSecret: "slack-bot-token", maxMessages: 200 },
    crawl: { startURL: "https://go.dev/ref/mod", maxDepth: 2, maxPages: 25, sameOriginOnly: true },
    sql: {
      dsnSecret: "analytics-dsn",
      sql: "SELECT count(*) AS users FROM users",
      template: "We have {{users}} users.",
    },
  };
  return JSON.stringify(t[kind] ?? {}, null, 2);
};
