// Client for the advisory chat.
//
// The agent answers from the project brain and cites what it used. It has no
// tools: this surface asks questions, it does not build.
import { API } from "./api";

export interface ChatAgent {
  slug: string;
  displayName: string;
  role: string;
  description: string;
  model: string;
}

export interface Citation {
  content: string;
  from: string;
  score: number;
}

export interface Turn {
  role: "you" | "agent";
  text: string;
  citations?: Citation[];
  /** False means nothing in the brain matched — the answer is the model's own. */
  grounded?: boolean;
}

const base = `${API}/api/builder/chat`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const listChatAgents = () =>
  fetch(`${base}/agents`, { credentials: "include" }).then(json<{ agents: ChatAgent[] }>);

export interface SessionSummary {
  id: string;
  agent: string;
  title: string;
  turns: number;
  updatedAt: string;
}

export const listSessions = () =>
  fetch(`${base}/sessions`, { credentials: "include" })
    .then(json<{ sessions: SessionSummary[] }>);

export const fetchSession = (id: string) =>
  fetch(`${base}/sessions/${encodeURIComponent(id)}`, { credentials: "include" })
    .then(json<{ id: string; agent: string; title: string; turns: StoredTurn[] }>);

export interface StoredTurn {
  role: "you" | "agent";
  text: string;
  citations: Citation[];
  grounded: boolean;
  createdAt: string;
}

export const deleteSession = (id: string) =>
  fetch(`${base}/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  }).then(json<void>);

export const ask = (agent: string, question: string, history: Turn[], session = "") =>
  fetch(`${base}/ask`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    // Only the plain turns travel: citations are the server's own output and
    // sending them back would grow the prompt with text it already wrote.
    // With a session open the server reads the history from the database
    // instead — trusting the client's copy meant a reopened conversation
    // answered as though it had just begun.
    body: JSON.stringify({
      agent,
      question,
      session,
      history: session ? [] : history.map((t) => ({ role: t.role, text: t.text })),
    }),
  }).then(json<{
    answer: string; citations: Citation[]; costUSD: number;
    grounded: boolean; session: string;
  }>);
