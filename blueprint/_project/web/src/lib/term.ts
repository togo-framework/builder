// Client for the terminal surface.
//
// The terminal is a shell on the machine the builder runs on. It is off unless
// BUILDER_TERMINAL=1 and refuses outright in production, so the first thing
// this asks is whether it is available at all — the page is built around that
// answer rather than around a terminal that might not connect.
import { API } from "./api";

const base = `${API}/api/builder/term`;

export interface TermStatus {
  enabled: boolean;
  /** Why not, when disabled. Shown verbatim — it names the flag to set. */
  reason?: string;
  hasTmux: boolean;
  /** The exact install command for this machine, when tmux is missing. */
  install?: string;
  workdir: string;
  sessions: string[];
}

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const termStatus = () =>
  fetch(`${base}/status`, { credentials: "include" }).then(json<TermStatus>);

export const createSession = (name: string) =>
  fetch(`${base}/sessions`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(json<{ name: string }>);

export async function killSession(name: string): Promise<void> {
  const res = await fetch(`${base}/sessions/${encodeURIComponent(name)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok || res.status === 204) return;
  const d = await res.json().catch(() => ({} as { error?: string }));
  throw new Error(d.error || `could not kill ${name} (${res.status})`);
}

/**
 * The WebSocket URL for attaching to a session.
 *
 * ws:// or wss:// derived from the page, not hardcoded: served over HTTPS, a
 * ws:// socket is blocked as mixed content and the terminal simply never
 * connects with nothing in the console to explain it.
 */
export function attachURL(name: string, cols: number, rows: number): string {
  const origin = API || window.location.origin;
  const u = new URL(`${origin}/api/builder/term/attach/${encodeURIComponent(name)}`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("cols", String(cols));
  u.searchParams.set("rows", String(rows));
  return u.toString();
}
