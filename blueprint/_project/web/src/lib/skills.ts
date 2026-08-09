// Client for the skill catalogue.
//
// A skill is a reusable instruction file (.claude/skills/<name>/SKILL.md) that
// an agent loads by name. The catalogue is the database; the files on disk are
// what Claude Code actually reads at run time, and the server keeps the two in
// step in both directions.
import { API } from "./api";

export type SkillSource = "local" | "github" | "operator";

export interface Skill {
  name: string;
  title: string;
  description: string;
  source: SkillSource;
  /** Provenance: "owner/repo@sha" for github, the scanned path for local. */
  sourceRef: string;
  /** Where the SKILL.md lives, relative to the app root. Empty = never written. */
  installedPath: string;
  enabled: boolean;
  /** lucide icon name, kebab-case. Empty means derive one from the name. */
  icon: string;
  /** #rrggbb, or empty to derive a stable one from the name. */
  color: string;
  createdAt: string;
  updatedAt: string;
  /** How many agents currently name this skill. */
  agents: number;
  /** Only the detail endpoint returns the document. */
  bodyMd?: string;
}

/** One row of the assignment picker: the whole fleet, flagged. */
export interface SkillAgent {
  slug: string;
  displayName: string;
  enabled: boolean;
  has: boolean;
}

/** Something the operator asked for and did not get, with the reason. */
export interface Skipped {
  name: string;
  reason: string;
}

export interface SyncResult {
  dir: string;
  scanned: number;
  created: string[];
  updated: string[];
  skipped: Skipped[];
}

export interface ImportResult {
  repo: string;
  ref: string;
  path: string;
  found: number;
  installed: string[];
  updated: string[];
  skipped: Skipped[];
}

const base = `${API}/api/builder/skills`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
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

export const listSkills = (q = "", offset = 0, limit = 50) =>
  // `base` already ends in /skills — appending it again requested
  // /api/builder/skills/skills, which matched the DETAIL route with the name
  // "skills" and answered "no such skill" while the catalogue rendered empty.
  fetch(`${base}?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`,
    { credentials: "include" })
    .then(json<{ skills: Skill[]; dir: string; total: number; offset: number; limit: number }>);

/**
 * A stable colour for a skill that has not been given one.
 *
 * Derived from the name so the same skill is the same colour on every render and
 * across reloads — a catalogue whose colours shuffle is worse than one with none,
 * because the colour stops being a landmark.
 */
export function skillColor(s: Pick<Skill, "name" | "color">): string {
  if (s.color) return s.color;
  let h = 0;
  for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 58% 52%)`;
}

export const fetchSkill = (name: string) =>
  fetch(`${base}/${encodeURIComponent(name)}`, { credentials: "include" })
    .then(json<{ skill: Skill; agents: SkillAgent[] }>);

/**
 * One appearance of a skill in an agent's working context.
 *
 * Availability, not invocation. The runner reads Claude Code with
 * `--output-format json`, which returns the terminal result and nothing about
 * the tool calls inside the session — so which skills the agent actually
 * reached for is not observable. `loadedAt` is named for what is true.
 */
export interface SkillUse {
  agent: string;
  runId: string;
  issueNumber: number;
  issueTitle: string;
  runStatus: string;
  loadedAt: string;
}

export interface SkillActivity {
  uses: SkillUse[];
  total: number;
  /** Distinct agents that have ever loaded it — not the same as who holds it. */
  agents: number;
}

export const fetchSkillActivity = (name: string, offset = 0, limit = 50) =>
  fetch(
    `${base}/${encodeURIComponent(name)}/activity?offset=${offset}&limit=${limit}`,
    { credentials: "include" },
  ).then(json<SkillActivity>);

export interface RegenerateResult {
  name: string;
  words: number;
  costUsd: number;
  installedPath: string;
  /** False when no BUILDER_WORKDIR is set — the result will be generic. */
  grounded: boolean;
}

/**
 * Rewrite one skill against the real repository.
 *
 * Runs a bounded read-only Claude Code session server-side, so it takes
 * minutes rather than milliseconds. Rejected results are returned as an error
 * and the existing body is left alone — replacing a stub with another stub
 * would look like success.
 */
export const regenerateSkill = (name: string) =>
  send<RegenerateResult>(`/${encodeURIComponent(name)}/regenerate`, "POST");

export interface NewSkill {
  name: string;
  title?: string;
  description?: string;
  bodyMd: string;
}

export const createSkill = (s: NewSkill) =>
  send<{ name: string; installedPath: string }>("", "POST", s);

/**
 * Partial update. Only the keys sent are changed — {} is rejected server-side.
 *
 * `name` is not editable: agents reference a skill by bare name, so a rename
 * would leave every one of those references pointing at nothing.
 */
export const saveSkill = (
  name: string,
  patch: { title?: string; description?: string; bodyMd?: string; enabled?: boolean },
) => send<{ ok: boolean; installedPath?: string }>(`/${encodeURIComponent(name)}`, "PATCH", patch);

/** Removes the row, unassigns it from every agent, and deletes its directory. */
export const deleteSkill = (name: string) =>
  send<{ ok: boolean; removedPath: string }>(`/${encodeURIComponent(name)}`, "DELETE");

export const assignSkill = (name: string, slug: string) =>
  send<{ ok: boolean }>(`/${encodeURIComponent(name)}/agents`, "POST", { slug });

export const unassignSkill = (name: string, slug: string) =>
  send<{ ok: boolean }>(
    `/${encodeURIComponent(name)}/agents/${encodeURIComponent(slug)}`,
    "DELETE",
  );

/** Scan .claude/skills/ and bring the catalogue up to date with what is there. */
export const syncSkills = () => send<SyncResult>("/sync", "POST");

/** Install every SKILL.md in a GitHub repository. Partial success is normal. */
export const importSkills = (repo: string, path?: string) =>
  send<ImportResult>("/import", "POST", { repo, path: path || "" });

export const SOURCE_LABEL: Record<SkillSource, string> = {
  local: "On disk",
  github: "GitHub",
  operator: "Written here",
};

export const SOURCE_TONE: Record<SkillSource, "neutral" | "info" | "success"> = {
  local: "neutral",
  github: "info",
  operator: "success",
};
