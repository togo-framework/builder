// Client for the fleet roster.
import { API } from "./api";

export interface Agent {
  slug: string;
  displayName: string;
  title: string;
  description: string;
  role: string;
  model: "haiku" | "sonnet" | "opus" | string;
  areas: string[];
  skills: string[];
  tools: string[];
  enabled: boolean;
  color: string;
  avatarUrl: string;
  maxBudgetUsd: number;
  maxTurns: number;
  specPath: string;
  /** Repo this agent works in. Empty = the fleet default (BUILDER_WORKDIR). */
  workdir: string;
  hasBrain: boolean;
  memories: number;
  lastRunAt: string | null;
  /** True only while a run is actually in flight. */
  busy: boolean;
  busyIssue?: number;
  runs: number;
  spendUsd: number;
  lastStatus: string;
}

export interface AgentActivity {
  kind: string;
  status: string;
  issue?: number;
  title: string;
  files: number;
  added: number;
  removed: number;
  costUsd: number;
  branch: string;
  terminal: string;
  startedAt: string;
}

const base = `${API}/api/builder/fleet`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const listAgents = () =>
  fetch(`${base}/agents`, { credentials: "include" })
    .then(json<{ agents: Agent[] }>)
    .then((d) => d.agents ?? []);

export const fetchAgent = (slug: string, offset = 0, limit = 25) =>
  fetch(`${base}/agents/${encodeURIComponent(slug)}?offset=${offset}&limit=${limit}`,
    { credentials: "include" })
    .then(json<{
      agent: Agent; persona: string; activity: AgentActivity[];
      totalRuns: number; offset: number; limit: number;
    }>);

/** Partial update. Only the keys sent are changed — {} is rejected server-side. */
export const saveAgent = (slug: string, patch: Partial<Agent> & { persona?: string }) =>
  fetch(`${base}/agents/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json<{ ok: boolean }>);

/**
 * A stable colour for an agent that has not been given one.
 *
 * Derived from the slug so the same agent is the same colour on every screen
 * and across reloads — a random colour per render would make the roster
 * unreadable, which is the one job the colour has.
 */
export function agentColor(a: Pick<Agent, "slug" | "color">): string {
  if (a.color) return a.color;
  let h = 0;
  for (let i = 0; i < a.slug.length; i++) h = (h * 31 + a.slug.charCodeAt(i)) >>> 0;
  // Fixed saturation/lightness so every generated colour is legible on both
  // themes; only the hue varies.
  return `hsl(${h % 360} 62% 52%)`;
}

export function initials(a: Pick<Agent, "displayName" | "slug">): string {
  const src = (a.displayName || a.slug).replace(/[-_]/g, " ").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface NewAgent {
  slug: string;
  displayName?: string;
  title?: string;
  description?: string;
  model?: string;
  areas: string[];
  workdir?: string;
  /** The system prompt to hire with. Omitted, the server writes a starter one. */
  persona?: string;
  enabled?: boolean;
}

export interface PersonaDraft {
  persona: string;
  costUsd: number;
}

/**
 * Draft a persona with Claude Code from what the operator has typed so far.
 *
 * Drafts only — it creates no agent. The operator reads the draft, edits it, and
 * hires with it, so a bad draft is a discarded string rather than a live agent
 * that has to be found and disabled.
 *
 * A real Claude Code session runs behind this and reads the repository, so it
 * takes tens of seconds. Callers must show that it is working.
 */
export const draftPersona = (a: NewAgent) =>
  fetch(`${base}/agents/draft-persona`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(a),
  }).then(json<PersonaDraft>);

/**
 * Hire an agent into the fleet.
 *
 * The fleet used to be fixed at setup with no way to grow it, so an operator who
 * found a gap — nobody owns the app's UI, nobody owns the database — had no move
 * but to edit Postgres by hand.
 */
export const hireAgent = (a: NewAgent) =>
  fetch(`${base}/agents`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(a),
  }).then(json<{ slug: string; enabled: boolean; specPath: string }>);

export interface BrainMemory {
  id: string;
  content: string;
  sourceKind: string;
  sourceRef: string;
  importance: number;
  createdAt: string;
}

export interface BrainGraphNode { id: string; name: string; kind: string; mentions: number }
export interface BrainGraphEdge { from: string; to: string; weight: number }

export interface EntityNeighbour {
  id: string;
  name: string;
  kind: string;
  weight: number;
}

/** One graph node, opened: what the agent actually remembers about it. */
export interface EntityDetail {
  id: string;
  name: string;
  kind: string;
  mentions: number;
  lastSeen: string;
  memories: BrainMemory[];
  neighbours: EntityNeighbour[];
}

export const fetchEntity = (slug: string, id: string) =>
  fetch(
    `${base}/agents/${encodeURIComponent(slug)}/brain/entities/${encodeURIComponent(id)}`,
    { credentials: "include" },
  ).then(json<EntityDetail>);

export interface BrainView {
  namespace: string;
  memories: number;
  gaps: number;
  entities: number;
  edges: number;
  embedder: string;
  recent: BrainMemory[];
  graph: { nodes: BrainGraphNode[]; edges: BrainGraphEdge[] };
  openGaps: string[];
}

export const fetchBrain = (slug: string) =>
  fetch(`${base}/agents/${encodeURIComponent(slug)}/brain`, { credentials: "include" })
    .then(json<BrainView>);
