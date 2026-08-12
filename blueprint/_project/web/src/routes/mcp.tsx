import { useEffect, useState } from "react";
import {
  Button, Callout, EmptyState, Input, PageHeader, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, StatusBadge,
} from "@togo-framework/ui";
import {
  Check, Copy, KeyRound, ListChecks, Plug, Plus, Radio, ShieldAlert, Trash2,
} from "lucide-react";
import {
  claudeCodeCommand, createMcpToken, listMcpTokens, mcpConfigJSON, mcpUrl,
  revokeMcpToken, serversForScope, type McpScope, type McpServer, type McpToken,
  type MintedToken,
} from "../lib/mcp";
import {
  Field, FormCard, FormFooter, ListSkeleton, PageShell, Row, RowTitle, Rows, Section,
} from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { useAIStrings } from "../lib/i18n.ai";

type Server = McpServer;

/** Which tools each server exposes, in the order the server registers them. */
const TOOLS: Record<Server, string[]> = {
  feedback: ["list_issues", "get_issue", "create_issue", "comment_on_issue"],
  agents: [
    "list_agents", "get_agent", "recall_memory", "retain_memory",
    "list_skills", "get_skill", "list_secret_names",
    // Custom apps. On this server and not feedback: create_app writes an ES
    // module this dashboard imports and executes, which is a different blast
    // radius from filing a bug. An operator minting a token needs to see that
    // here, at the moment they choose the scope.
    "list_apps", "create_app",
  ],
};

const SCOPE_TONE: Record<McpScope, "neutral" | "warning" | "danger"> = {
  feedback: "neutral",
  agents: "warning",
  all: "danger",
};

/** What a probe of an MCP endpoint told us. */
type Probe = "checking" | "listening" | "unreachable" | "odd";

/**
 * Ask the endpoint whether it is there, without a token.
 *
 * A 401 is the CORRECT answer and the only one that proves the server is
 * mounted and enforcing auth: an MCP endpoint answers an unauthenticated
 * request with `WWW-Authenticate: Bearer`. A network failure means nothing is
 * listening on that path at all. Anything else is something other than this
 * server answering, which the operator needs to know before they spend an
 * afternoon debugging their client.
 */
async function probeServer(server: Server): Promise<Probe> {
  try {
    const res = await fetch(mcpUrl(server), { method: "GET" });
    if (res.status === 401 || res.status === 405 || res.ok) return "listening";
    return "odd";
  } catch {
    return "unreachable";
  }
}

/** Copy that reports back, because a silent copy button is indistinguishable
 *  from a broken one. */
const CopyButton = ({
  text, label, done: doneLabel, variant = "outline", className,
}: {
  text: string;
  label: string;
  done: string;
  variant?: "outline" | "ghost";
  className?: string;
}) => {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check className="me-1.5 size-4" /> : <Copy className="me-1.5 size-4" />}
      {done ? doneLabel : label}
    </Button>
  );
};
CopyButton.displayName = "CopyButton";

/**
 * A copyable snippet — code block with a label and a copy affordance.
 *
 * dir="ltr" on the <pre> only. The label above it is prose and stays in the
 * page's direction; putting the whole block in ltr would drag the caption to
 * the wrong edge in Arabic.
 */
const Snippet = ({
  label, note, code, copyLabel, copiedLabel,
}: {
  label: string;
  note?: string;
  code: string;
  copyLabel: string;
  copiedLabel: string;
}) => (
  <div className="min-w-0">
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {note && <span className="min-w-0 text-[11px] text-muted-foreground">{note}</span>}
      <CopyButton
        variant="ghost"
        className="ms-auto h-6 px-1.5 text-[11px]"
        text={code}
        label={copyLabel}
        done={copiedLabel}
      />
    </div>
    <pre
      dir="ltr"
      className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-[11px] leading-relaxed"
    >
      {code}
    </pre>
  </div>
);
Snippet.displayName = "Snippet";

/**
 * Connect an outside agent to this builder.
 *
 * The page is read in one direction — what the servers are, how to connect,
 * then the credentials you already made — because that is the order an
 * operator arriving here needs it in. Two servers, because they have very
 * different blast radii: the issue board on one, the fleet's personas and
 * memory on the other. The boundary is shown rather than hidden: someone
 * pasting a token into a shared editor should be able to see, at the moment
 * they mint it, exactly what they are handing over.
 */
export const Mcp = () => {
  const { S } = useStrings();
  const { A } = useAIStrings();
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<McpScope>("feedback");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<MintedToken | null>(null);
  const [tab, setTab] = useState<"claude" | "json">("claude");
  const [probes, setProbes] = useState<Record<Server, Probe>>({
    feedback: "checking", agents: "checking",
  });

  const SCOPE_LABEL: Record<McpScope, string> = {
    feedback: A.mcp.scopeFeedback,
    agents: A.mcp.scopeAgents,
    all: A.mcp.scopeAll,
  };

  const load = () =>
    listMcpTokens().then(setTokens).catch((e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
    // Truthful state, not a green dot that is always green: each server is
    // actually asked.
    (["feedback", "agents"] as Server[]).forEach((s) => {
      void probeServer(s).then((p) => setProbes((prev) => ({ ...prev, [s]: p })));
    });
  }, []);

  async function mint() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr("");
    try {
      setMinted(await createMcpToken(n, scope));
      setName("");
      setTab("claude");
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

  // Which servers a minted token can actually reach, for the snippets below.
  //
  // Derived, not assumed: an "all" token reaches both, and the snippet writes
  // both entries. It used to write one and tell the operator to edit the URL of
  // a copy, which produced a second entry under the SAME name — the client kept
  // whichever was added last, and the other server was simply missing.
  const servers = minted ? serversForScope(minted.scope) : [];
  const snippet = minted
    ? (tab === "claude"
        ? claudeCodeCommand(servers, minted.token)
        : mcpConfigJSON(servers, minted.token))
    : "";

  const PROBE_TONE: Record<Probe, "neutral" | "success" | "warning" | "danger"> = {
    checking: "neutral", listening: "success", unreachable: "danger", odd: "warning",
  };
  const PROBE_LABEL: Record<Probe, string> = {
    checking: A.mcp.probeChecking,
    listening: A.mcp.probeListening,
    unreachable: A.mcp.probeUnreachable,
    odd: A.mcp.probeOdd,
  };
  const PROBE_TITLE: Record<Probe, string> = {
    checking: A.mcp.probeChecking,
    listening: A.mcp.probeListeningTitle,
    unreachable: A.mcp.probeUnreachableTitle,
    odd: A.mcp.probeOddTitle,
  };

  const serverCard = (id: Server, badge: string, tone: "neutral" | "warning") => (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        {/* The server name is an identifier, not a word — same in both
            languages, and in the mono face that says so. */}
        <h3 className="font-mono text-sm font-semibold">{id}</h3>
        <StatusBadge tone={tone}>{badge}</StatusBadge>
        <span
          title={PROBE_TITLE[probes[id]]}
          className="ms-auto inline-flex shrink-0 items-center gap-1.5"
        >
          <Radio
            aria-hidden="true"
            className={`size-3 ${probes[id] === "listening" ? "text-success" : "text-muted-foreground"}`}
          />
          <StatusBadge tone={PROBE_TONE[probes[id]]}>{PROBE_LABEL[probes[id]]}</StatusBadge>
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {A.mcp.endpointLabel}
        </span>
        {/* A URL is machine text: it keeps its own direction whatever the page
            is doing, and it is the single most-copied string on this screen. */}
        <bdi
          dir="ltr"
          className="min-w-0 flex-1 break-all font-mono text-[11px] text-muted-foreground"
        >
          {mcpUrl(id)}
        </bdi>
        <CopyButton
          variant="ghost"
          className="h-7 shrink-0 px-2 text-[11px]"
          text={mcpUrl(id)}
          label={A.mcp.copyUrl}
          done={A.term.copied}
        />
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <ListChecks className="size-3.5" />
        {A.mcp.toolsCount(TOOLS[id].length)}
      </div>
      <ul className="flex flex-col gap-2 px-4 pb-4">
        {TOOLS[id].map((t) => (
          <li key={t} className="min-w-0">
            <code dir="ltr" className="text-xs font-medium text-foreground">{t}</code>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {A.mcp.tools[t as keyof typeof A.mcp.tools]}
            </p>
          </li>
        ))}
      </ul>
    </article>
  );

  return (
    <PageShell>
      <PageHeader
        title={A.mcp.title}
        icon={<Plug className="size-5" />}
        description={A.mcp.desc}
      />

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      <Section title={A.mcp.serversHeading}>
        <p className="-mt-1 mb-1 max-w-2xl text-xs text-muted-foreground">
          {A.mcp.serversNote}
        </p>
        {/* items-start: the two servers expose four and seven tools, and
            stretching the shorter card to match leaves a panel of dead space
            that reads as "something failed to load". */}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {serverCard("feedback", A.mcp.badgeFeedback, "neutral")}
          {serverCard("agents", A.mcp.badgeAgents, "warning")}
        </div>
      </Section>

      {/* Three steps, numbered, because "how do I connect this" is the only
          question this page exists to answer and it has an order. */}
      <Section title={A.mcp.stepsHeading}>
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {[A.mcp.step1, A.mcp.step2, A.mcp.step3].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 bg-card px-4 py-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold tabular-nums text-primary">
                {i + 1}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* Said once, plainly, next to the thing it constrains. */}
      <Callout kind="info" title={A.mcp.vaultTitle}>{A.mcp.vaultBody}</Callout>

      <FormCard title={A.mcp.formTitle}>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <Field
            label={A.mcp.nameLabel} htmlFor="mcp-name" required hint={A.mcp.nameHint}
          >
            <Input
              id="mcp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={A.mcp.namePlaceholder}
              onKeyDown={(e) => e.key === "Enter" && void mint()}
            />
          </Field>
          <Field label={A.mcp.scopeLabel} htmlFor="mcp-scope" hint={A.mcp.scopeHint}>
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
        <FormFooter note={name.trim() ? A.mcp.noteReady : A.mcp.noteNameFirst}>
          <Button onClick={() => void mint()} disabled={busy || !name.trim()}>
            <Plus className="me-1.5 size-4" />
            {busy ? A.mcp.creating : A.mcp.createCta}
          </Button>
        </FormFooter>
      </FormCard>

      {minted && (
        <section className="rounded-xl border border-success/40 bg-success/5">
          <header className="flex flex-wrap items-center gap-2 border-b border-success/30 px-4 py-3">
            <KeyRound className="size-4 shrink-0 text-success" />
            <h2 className="min-w-0 text-sm font-semibold">
              <bdi>{A.mcp.mintedTitle(minted.name)}</bdi>
            </h2>
            <StatusBadge tone={SCOPE_TONE[minted.scope]}>
              {SCOPE_LABEL[minted.scope]}
            </StatusBadge>
          </header>

          <div className="space-y-4 px-4 py-4">
            {/* The one thing that must be unmissable: it is not recoverable. */}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {A.mcp.mintedWarn}
            </p>

            <div>
              <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {A.mcp.tokenLabel}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code
                  dir="ltr"
                  className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-xs"
                >
                  {minted.token}
                </code>
                <CopyButton
                  text={minted.token}
                  label={A.mcp.copyToken}
                  done={A.term.copied}
                />
              </div>
            </div>

            {/* Segmented control: two ways to say the same thing to two kinds
                of client. Stacking both blocks made the page look like it was
                asking for both. */}
            <div>
              <div
                role="tablist"
                aria-label={A.mcp.stepsHeading}
                className="mb-2 inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
              >
                {([
                  ["claude", A.mcp.tabClaude],
                  ["json", A.mcp.tabJson],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      tab === k
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <Snippet
                label={tab === "claude" ? A.mcp.tabClaude : A.mcp.tabJson}
                note={tab === "claude" ? A.mcp.tabClaudeNote : A.mcp.tabJsonNote}
                code={snippet}
                copyLabel={A.term.copyCommand}
                copiedLabel={A.term.copied}
              />
            </div>

            {minted.scope === "all" && (
              <p className="text-[11px] text-muted-foreground">{A.mcp.bothServers}</p>
            )}

            {/* The check, spelled out. "Ask the client to list its tools" is
                advice; this is the command, and what it should print. */}
            <Snippet
              label={A.mcp.verifyLabel}
              note={A.mcp.verifyNote(servers.reduce((n, s) => n + TOOLS[s].length, 0))}
              code="claude mcp list"
              copyLabel={A.term.copyCommand}
              copiedLabel={A.term.copied}
            />

            <Button variant="outline" size="sm" onClick={() => setMinted(null)}>
              {A.mcp.doneCta}
            </Button>
          </div>
        </section>
      )}

      <Section title={A.mcp.tokensHeading} count={tokens?.length}>
        {tokens === null && <ListSkeleton rows={2} />}
        {tokens?.length === 0 && (
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title={A.mcp.emptyTitle}
            description={A.mcp.emptyDesc}
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
                    {A.mcp.revoke}
                  </Button>
                }
              >
                <RowTitle>
                  <bdi className="truncate text-sm font-medium">{t.name}</bdi>
                  <StatusBadge tone={SCOPE_TONE[t.scope]}>{SCOPE_LABEL[t.scope]}</StatusBadge>
                </RowTitle>
                {/* The prefix is machine text; the ages beside it are prose.
                    Each carries its own direction rather than the row being
                    forced into one. */}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <bdi dir="ltr" className="font-mono">{t.prefix}…</bdi>
                  <span>{A.mcp.createdAgo(A.mcp.ago(t.createdAt))}</span>
                  {/* "Never used" is the fact that makes a token safe to revoke
                      without asking anyone. */}
                  <span>
                    {t.lastUsedAt ? A.mcp.lastUsedAgo(A.mcp.ago(t.lastUsedAt)) : A.mcp.neverUsed}
                  </span>
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
