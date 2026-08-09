// Client for the project brain — the one every agent reads and every source
// writes into.
import { API } from "./api";
import type { BrainGraphNode, BrainGraphEdge } from "./agents";

/** Where one memory came from. Assembled server-side so every surface agrees. */
export interface Provenance {
  kind: string;
  source: string;
  ref: string;
  label: string;
}

export interface ProjectMemory {
  id: string;
  content: string;
  importance: number;
  createdAt: string;
  from: Provenance;
}

export interface SourceCount {
  kind: string;
  source: string;
  label: string;
  memories: number;
}

export interface ProjectBrain {
  namespace: string;
  embedder: string;
  /** False when recall is a hashed bag of words — keyword overlap, not meaning. */
  semantic: boolean;
  memories: number;
  entities: number;
  edges: number;
  recent: ProjectMemory[];
  sources: SourceCount[];
  graph: { nodes: BrainGraphNode[]; edges: BrainGraphEdge[] };
}

export interface ProjectEntity {
  id: string;
  name: string;
  kind: string;
  mentions: number;
  lastSeen: string;
  memories: ProjectMemory[];
}

const base = `${API}/api/builder/brain`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const fetchProjectBrain = (source = "") =>
  fetch(`${base}${source ? `?source=${encodeURIComponent(source)}` : ""}`, {
    credentials: "include",
  }).then(json<ProjectBrain>);

export const fetchProjectEntity = (id: string) =>
  fetch(`${base}/entities/${encodeURIComponent(id)}`, { credentials: "include" })
    .then(json<ProjectEntity>);
