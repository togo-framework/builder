// Client for the builder issue plane.
import { API } from "./api";

export type IssueStatus =
  | "triage" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "rejected";
export type IssueType = "bug" | "feature" | "enhancement" | "question" | "discussion" | "chore";
export type Priority = "low" | "normal" | "high" | "critical";

export interface Card {
  id: string; number: number; title: string;
  type: IssueType; status: IssueStatus; priority: Priority;
  area: string; humanOnly: boolean; busy: boolean;
  source: string; route: string;
  commentCount: number; voteCount: number;
  assignee: string; attempts: number;
  labels: string[]; createdAt: string;
}

export interface Pin {
  ordinal: number; testid: string; css: string; role: string; name: string;
  hint: string; tag: string; href: string; verified: string[];
  resolvedState: string; resolveAttempts: number; resolveHits: number;
  rectX: number; rectY: number; rectW: number; rectH: number;
  scrollY: number; viewport: [number, number]; dpr: number;
}

export interface Comment {
  id: string; author: string; kind: string; body: string; createdAt: string;
}

export interface Activity {
  action: string; actorKind: string; detail: string; createdAt: string;
}

/** One captured console line. `ts` is epoch milliseconds, absent on old captures. */
export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  ts?: number;
}

/**
 * One captured request. Method, URL, status and duration ONLY — bodies and
 * headers are never captured, and the server strips them if a client sends
 * them anyway. `status` 0 means the request never completed (network error,
 * CORS block, aborted).
 */
export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  ts?: number;
}

/**
 * The browser snapshot a bridge-mode SDK ships with a report. Absent on most
 * issues: hand-filed, agent-filed, pre-bridge SDKs, and reporters who chose
 * to send without it.
 */
export interface BrowserContext {
  console?: ConsoleEntry[];
  network?: NetworkEntry[];
  viewport?: { w: number; h: number; dpr: number };
  userAgent?: string;
  locale?: string;
  /**
   * Which hosted app the report came from, when it came through a builder
   * shell framing several — app.co, auth.app.co, dashboard.app.co. Stamped by
   * the shell from its own configured target list, so it is the shell's word
   * and not the framed page's.
   *
   * Present on its own (no console, no network) whenever the app had no SDK
   * loaded or the reporter opted out of the capture: attribution is not part
   * of that bargain, because a report that does not say which surface it is
   * about sends somebody to read the wrong code.
   */
  app?: { id?: string; name?: string; origin?: string };
}

export interface Detail extends Card {
  body: string; pageUrl: string; locale: string; branch: string; prUrl: string;
  pins: Pin[]; comments: Comment[]; activity: Activity[];
  context?: BrowserContext;
}

export interface Board { columns: IssueStatus[]; cards: Record<IssueStatus, Card[]> }

const base = `${API}/api/builder`;

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `request failed (${res.status})`);
  return data as T;
}

export const fetchBoard = () =>
  fetch(`${base}/board`, { credentials: "include" }).then(json<Board>);

export interface NewIssue {
  type: IssueType;
  title: string;
  body?: string;
  priority?: Priority;
  area?: string;
  humanOnly?: boolean;
  /** Agent slug, or "" to let the lead route it. */
  assignee?: string;
}

/**
 * File an issue by hand.
 *
 * Everything on the board used to arrive through the widget's public ingress,
 * which is shaped around a reporter standing on a page with elements pinned —
 * right for a bug report, wrong for writing down a piece of work you already
 * know you want. This takes the fields the board sorts by instead.
 */
export const createIssue = (issue: NewIssue) =>
  fetch(`${base}/issues`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(issue),
  }).then(json<{ id: string; number: number }>);

export const fetchIssue = (n: number | string) =>
  fetch(`${base}/issues/${n}`, { credentials: "include" }).then(json<Detail>);

export const patchIssue = (n: number | string, patch: Partial<{
  status: IssueStatus; priority: Priority; type: IssueType; area: string; humanOnly: boolean;
  /** Agent slug, or "" to let any agent that owns the area take it. */
  assignee: string;
}>) =>
  fetch(`${base}/issues/${n}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json<{ ok: boolean }>);

export const addComment = (n: number | string, body: string, author: string) =>
  fetch(`${base}/issues/${n}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, author }),
  }).then(json<{ ok: boolean }>);

export const COLUMN_LABEL: Record<IssueStatus, string> = {
  triage: "Triage",
  ready: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "Review",
  done: "Done",
  rejected: "Rejected",
};

/** Mirrors the server's transition table so the UI never offers an illegal move. */
export const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  triage: ["ready", "rejected", "blocked"],
  ready: ["in_progress", "blocked", "rejected", "triage"],
  in_progress: ["in_review", "blocked", "ready", "rejected"],
  blocked: ["ready", "rejected"],
  in_review: ["done", "in_progress", "blocked", "rejected"],
  done: ["ready"],
  rejected: ["triage"],
};

export const ago = (iso: string): string => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/**
 * Delete an issue and everything hanging off it.
 *
 * The server refuses with 409 while an agent holds a live lease — deleting the
 * row out from under a running session would orphan its worktree and branch —
 * so that message is surfaced rather than swallowed.
 */
export async function deleteIssue(number: number): Promise<void> {
  const res = await fetch(`${API}/api/builder/issues/${number}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok || res.status === 204) return;
  const d = await res.json().catch(() => ({} as { error?: string }));
  throw new Error(d.error || `could not delete issue #${number} (${res.status})`);
}
