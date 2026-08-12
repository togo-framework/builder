// Client for the MCP surface.
//
// Two servers, each with its own URL and its own audience: the feedback server
// is the issue board, the agents server is the fleet, its skills and its
// memory. A token carries the scope, so what a client can reach is decided when
// the credential is minted rather than per call.
import { API } from "./api";

const base = `${API}/api/builder/mcp`;

export type McpScope = "feedback" | "agents" | "all";

/** The two servers. A scope names one of them, or both. */
export type McpServer = "feedback" | "agents";

export interface McpToken {
  id: string;
  name: string;
  /** First few characters, enough to identify the row. Never the whole token. */
  prefix: string;
  scope: McpScope;
  createdAt: string;
  /** Null until something actually connects with it. */
  lastUsedAt: string | null;
}

/** Only ever returned once, at creation. */
export interface MintedToken {
  id: string;
  name: string;
  scope: McpScope;
  token: string;
}

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const listMcpTokens = () =>
  fetch(`${base}/tokens`, { credentials: "include" })
    .then(json<{ tokens: McpToken[] }>)
    .then((d) => d.tokens ?? []);

export const createMcpToken = (name: string, scope: McpScope) =>
  fetch(`${base}/tokens`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, scope }),
  }).then(json<MintedToken>);

export async function revokeMcpToken(id: string): Promise<void> {
  const res = await fetch(`${base}/tokens/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.ok || res.status === 204) return;
  const d = await res.json().catch(() => ({} as { error?: string }));
  throw new Error(d.error || `could not revoke the token (${res.status})`);
}

/**
 * The absolute URL of a server, for pasting into a client's config.
 *
 * Absolute on purpose: a relative path is meaningless in an editor's mcp.json,
 * which is read by a process that has no idea what page it came from. When the
 * dashboard is served from the same origin as the API, `API` is empty and
 * location.origin is the right answer.
 */
export const mcpUrl = (server: McpServer) =>
  `${API || (typeof window === "undefined" ? "" : window.location.origin)}/api/builder/mcp/${server}`;

/**
 * The servers a scope can actually reach.
 *
 * The snippets are generated from this rather than from a guess, because the
 * two are not interchangeable: a `feedback` token presented to the agents URL
 * is refused with a 401 that looks exactly like a bad token. An `all` token
 * reaches both, and both entries have to be written — an operator who added one
 * and was told to "swap the URL" ended up overwriting the entry they had just
 * made, because the NAME is the key a client stores it under.
 */
export const serversForScope = (scope: McpScope): McpServer[] =>
  scope === "all" ? ["feedback", "agents"] : [scope];

const entry = (server: McpServer, token: string) => ({
  type: "http",
  url: mcpUrl(server),
  headers: { Authorization: `Bearer ${token}` },
});

/** The config block for a client that speaks streamable HTTP. */
export const mcpConfigJSON = (servers: McpServer[], token: string) =>
  JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        servers.map((s) => [`builder-${s}`, entry(s, token)]),
      ),
    },
    null,
    2,
  );

/**
 * The one-liner for Claude Code, which takes it from the command line.
 *
 * `--scope user` on purpose. Without it the flag defaults to `local`, which
 * binds the server to the ONE directory the command was run in — so the
 * operator connects their builder, moves to the repo they actually work in,
 * and finds it gone. A builder is an account-level tool, not a per-checkout
 * one. The note beside this snippet says how to bind it to a single directory
 * instead, for the case where that is what was wanted.
 */
export const claudeCodeCommand = (servers: McpServer[], token: string) =>
  servers
    .map(
      (s) =>
        `claude mcp add --transport http --scope user builder-${s} ${mcpUrl(s)} ` +
        `--header "Authorization: Bearer ${token}"`,
    )
    .join("\n");
