// Client for the MCP surface.
//
// Two servers, each with its own URL and its own audience: the feedback server
// is the issue board, the agents server is the fleet, its skills and its
// memory. A token carries the scope, so what a client can reach is decided when
// the credential is minted rather than per call.
import { API } from "./api";

const base = `${API}/api/builder/mcp`;

export type McpScope = "feedback" | "agents" | "all";

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
export const mcpUrl = (server: "feedback" | "agents") =>
  `${API || (typeof window === "undefined" ? "" : window.location.origin)}/api/builder/mcp/${server}`;

/** The config block for a client that speaks streamable HTTP. */
export const mcpConfigJSON = (server: "feedback" | "agents", token: string) =>
  JSON.stringify(
    {
      mcpServers: {
        [`builder-${server}`]: {
          type: "http",
          url: mcpUrl(server),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

/** The one-liner for Claude Code, which takes it from the command line. */
export const claudeCodeCommand = (server: "feedback" | "agents", token: string) =>
  `claude mcp add --transport http builder-${server} ${mcpUrl(server)} --header "Authorization: Bearer ${token}"`;
