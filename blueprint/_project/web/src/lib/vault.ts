// Client for the secret vault.
//
// Note what is NOT here: nothing caches a revealed value. A reveal is a
// deliberate, audited act — holding the plaintext in a module-level store would
// mean the audit log says "read once" while the value lives in memory for the
// rest of the session.
import { API } from "./api";

export interface Secret {
  id: string;
  scope: "project" | "agent";
  agentSlug?: string;
  name: string;
  kind: string;
  /** Masked, non-reversible: sk-…a1b2. Never the value. */
  hint: string;
  version: number;
  createdAt: string;
  reads: number;
}

export interface AuditEntry {
  Secret: string;
  Agent: string;
  RunID: string;
  Outcome: "ok" | "denied" | "rate_limited" | "expired";
  IP: string;
  At: string;
}

const base = `${API}/api/builder/vault`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as any).error || `request failed (${res.status})`);
  return d as T;
}

export const listSecrets = () =>
  fetch(`${base}/secrets`, { credentials: "include" })
    .then(json<{ secrets: Secret[] }>)
    .then((d) => d.secrets ?? []);

export const storeSecret = (s: {
  scope: string; name: string; kind: string; value: string; agentSlug?: string;
}) =>
  fetch(`${base}/secrets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  }).then(json<{ id: string; version: number; hint: string }>);

/** Returns plaintext. The caller must not persist it. */
export const revealSecret = (name: string) =>
  fetch(`${base}/secrets/${encodeURIComponent(name)}/reveal`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).then(json<{ name: string; value: string }>);

export const deleteSecret = (name: string) =>
  fetch(`${base}/secrets/${encodeURIComponent(name)}`, {
    method: "DELETE",
    credentials: "include",
  }).then((r) => {
    if (!r.ok && r.status !== 204) throw new Error(`delete failed (${r.status})`);
  });

export const grantSecret = (name: string, agentSlug: string, canReveal: boolean, maxPerRun = 3) =>
  fetch(`${base}/secrets/${encodeURIComponent(name)}/grant`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentSlug, canReveal, maxPerRun }),
  }).then(json<{ granted: boolean }>);

export const fetchAudit = () =>
  fetch(`${base}/audit`, { credentials: "include" })
    .then(json<{ reads: AuditEntry[] }>)
    .then((d) => d.reads ?? []);
