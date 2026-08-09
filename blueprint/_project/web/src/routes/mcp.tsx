import { useEffect, useState } from "react";
import {
  Button, Callout, EmptyState, Input, PageHeader, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, StatusBadge,
} from "@togo-framework/ui";
import { Check, Copy, KeyRound, Plug, Plus, Trash2 } from "lucide-react";
import {
  claudeCodeCommand, createMcpToken, listMcpTokens, mcpConfigJSON, mcpUrl,
  revokeMcpToken, type McpScope, type McpToken, type MintedToken,
} from "../lib/mcp";
import {
  Field, FormCard, FormFooter, ListSkeleton, PageShell, Row, RowTitle, Rows, Section,
} from "../components/page-shell";

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const SCOPE_LABEL: Record<McpScope, string> = {
  feedback: "Issue board only",
  agents: "Fleet, skills and memory",
  all: "Everything",
};

const SCOPE_TONE: Record<McpScope, "neutral" | "warning" | "danger"> = {
  feedback: "neutral",
  agents: "warning",
  all: "danger",
};

/** Copy that reports back, because a silent copy button is indistinguishable
 *  from a broken one. */
const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check className="me-1.5 size-4" /> : <Copy className="me-1.5 size-4" />}
      {done ? "Copied" : label}
    </Button>
  );
};
CopyButton.displayName = "CopyButton";

/**
 * Connect an outside agent to this builder.
 *
 * Two servers, because they have very different blast radii — the issue board
 * on one, the fleet's personas and memory on the other. The page shows the
 * boundary rather than hiding it: an operator pasting a token into a shared
 * editor should be able to see, at the moment they mint it, exactly what they
 * are handing over.
 */
export const Mcp = () => {
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpScope>("feedback");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<MintedToken | null>(null);

  const load = () =>
    listMcpTokens().then(setTokens).catch((e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
  }, []);

  async function mint() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr("");
    try {
      setMinted(await createMcpToken(n, scope));
      setName("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setErr("");
    try {
      await revokeMcpToken(id);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Which server a minted token can actually reach, for the snippets below.
  const server = minted?.scope === "agents" ? "agents" : "feedback";

  return (
    <PageShell width="narrow">
      <PageHeader
        title="MCP"
        icon={<Plug className="size-5" />}
        description="Connect Claude Code, Codex or any MCP client to this builder — read the board, file issues, and talk to the fleet and its memory."
      />

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold">feedback</h2>
            <StatusBadge tone="neutral">issue board</StatusBadge>
          </div>
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
            {mcpUrl("feedback")}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li><code>list_issues</code> · <code>get_issue</code></li>
            <li><code>create_issue</code> · <code>comment_on_issue</code></li>
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold">agents</h2>
            <StatusBadge tone="warning">fleet & memory</StatusBadge>
          </div>
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
            {mcpUrl("agents")}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li><code>list_agents</code> · <code>get_agent</code></li>
            <li><code>recall_memory</code> · <code>retain_memory</code></li>
            <li><code>list_skills</code> · <code>get_skill</code> · <code>list_secret_names</code></li>
          </ul>
        </div>
      </section>

      {/* Said once, plainly, next to the thing it constrains. */}
      <Callout kind="info" title="Secret values never leave the vault">
        The agents server can list the NAMES of your credentials so a client
        knows what exists. It cannot read one. Reveal a value from the Vault
        screen, where every read is recorded.
      </Callout>

      <FormCard title="New token">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <Field
            label="What is it for?" htmlFor="mcp-name" required
            hint="Names are how you find the right one to revoke — 'my laptop', 'Codex', 'CI'."
          >
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my laptop"
              onKeyDown={(e) => e.key === "Enter" && void mint()}
            />
          </Field>
          <Field
            label="Reaches" htmlFor="mcp-scope"
            hint="Grant the least the client needs — a board-only token cannot touch the fleet."
          >
            <Select value={scope} onValueChange={(v) => setScope(v as McpScope)}>
              <SelectTrigger id="mcp-scope" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feedback">{SCOPE_LABEL.feedback}</SelectItem>
                <SelectItem value="agents">{SCOPE_LABEL.agents}</SelectItem>
                <SelectItem value="all">{SCOPE_LABEL.all}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FormFooter
          note={name.trim() ? "Shown once, stored hashed." : "Name the token, so you know which one to revoke later."}
        >
          <Button onClick={() => void mint()} disabled={busy || !name.trim()}>
            <Plus className="me-1.5 size-4" />
            {busy ? "Creating…" : "Create token"}
          </Button>
        </FormFooter>
      </FormCard>

      {minted && (
        <section className="rounded-lg border border-success/40 bg-success/5 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound className="size-4" />
            {minted.name} — copy it now
          </h2>
          {/* The one thing that must be unmissable: it is not recoverable. */}
          <p className="mt-1 text-xs text-muted-foreground">
            This is the only time the token is shown. Only its hash is stored,
            so if you lose it you revoke it and make another.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
              {minted.token}
            </code>
            <CopyButton text={minted.token} label="Copy token" />
          </div>

          <div className="mt-4">
            <p className="mb-1 text-xs font-medium">Claude Code</p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-background p-2.5 text-[11px]">
                {claudeCodeCommand(server, minted.token)}
              </pre>
              <CopyButton text={claudeCodeCommand(server, minted.token)} label="Copy" />
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1 text-xs font-medium">Anything that reads mcp.json</p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-background p-2.5 text-[11px]">
                {mcpConfigJSON(server, minted.token)}
              </pre>
              <CopyButton text={mcpConfigJSON(server, minted.token)} label="Copy" />
            </div>
          </div>

          {minted.scope === "all" && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              This token reaches both servers. The snippets show the fleet one;
              swap <code>agents</code> for <code>feedback</code> in the URL to
              add the board as a second entry.
            </p>
          )}

          <Button variant="outline" size="sm" className="mt-3" onClick={() => setMinted(null)}>
            Done
          </Button>
        </section>
      )}

      <Section title="Tokens" count={tokens?.length}>
        {tokens === null && <ListSkeleton rows={2} />}
        {tokens?.length === 0 && (
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title="No tokens yet"
            description="Create one above to connect a client."
          />
        )}
        {tokens && tokens.length > 0 && (
          <Rows>
            {tokens.map((t) => (
              <Row
                key={t.id}
                trailing={
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void revoke(t.id)}
                  >
                    <Trash2 className="me-1.5 size-4" />
                    Revoke
                  </Button>
                }
              >
                <RowTitle>
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <StatusBadge tone={SCOPE_TONE[t.scope]}>{SCOPE_LABEL[t.scope]}</StatusBadge>
                </RowTitle>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {t.prefix}… · created {ago(t.createdAt)}
                  {/* "Never used" is the fact that makes a token safe to
                      revoke without asking anyone. */}
                  {t.lastUsedAt
                    ? ` · last used ${ago(t.lastUsedAt)}`
                    : " · never used"}
                </p>
              </Row>
            ))}
          </Rows>
        )}
      </Section>
    </PageShell>
  );
};
Mcp.displayName = "Mcp";
