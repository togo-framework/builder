import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Callout, Checkbox, EmptyState, Input, Label, MarkdownEditor, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, StatusBadge, Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@togo-framework/ui";
import {
  agentColor, fetchAgent, fetchBrain, initials, saveAgent,
  type Agent, type AgentActivity, type BrainGraphEdge, type BrainGraphNode,
  type BrainView,
} from "../lib/agents";
import { BrainGraph } from "../components/brain-graph";
import { EntityPanel } from "../components/entity-panel";

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Frozen empties, shared. See the note where they are used: a fresh [] per
// render is what made the graph animate without end.
const NO_NODES: BrainGraphNode[] = [];
const NO_EDGES: BrainGraphEdge[] = [];

const RUN_TONE: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  succeeded: "success",
  failed: "danger",
  needs_input: "warning",
  running: "info",
};

export const AgentDetail = () => {
  const { slug } = useParams({ from: "/_app/agents/$slug" });
  const [agent, setAgent] = useState<Agent | null>(null);
  const [persona, setPersona] = useState("");
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  // Edited persona is held separately so a poll refresh cannot overwrite
  // something half-typed.
  const [draft, setDraft] = useState<string | null>(null);
  const [brain, setBrain] = useState<BrainView | null>(null);
  const [totalRuns, setTotalRuns] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Stable identities for the graph.
  //
  // `brain.graph?.nodes ?? []` minted a fresh array on every render, which
  // restarted the layout simulation, which re-rendered — the graph animated
  // forever and the page never settled. The fallback is hoisted to a module
  // constant so the identity only changes when the data does.
  const graphNodes = brain?.graph?.nodes ?? NO_NODES;
  const graphEdges = brain?.graph?.edges ?? NO_EDGES;

  const load = async () => {
    try {
      const d = await fetchAgent(slug);
      setAgent(d.agent);
      setPersona(d.persona);
      setActivity(d.activity);
      setTotalRuns(d.totalRuns ?? d.activity.length);
      // Best-effort: an agent without a brain is a valid state, not an error.
      fetchBrain(slug).then(setBrain).catch(() => setBrain(null));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [slug]);

  // Append the next page. The poll above replaces the FIRST page only, so
  // pages already loaded are not thrown away every six seconds.
  async function loadMore() {
    if (loadingMore || activity.length >= totalRuns) return;
    setLoadingMore(true);
    try {
      const d = await fetchAgent(slug, activity.length, 25);
      setActivity((prev) => [...prev, ...d.activity]);
      setTotalRuns(d.totalRuns);
    } catch {
      /* a failed page must not break the ones already shown */
    } finally {
      setLoadingMore(false);
    }
  }

  async function patch(p: Parameters<typeof saveAgent>[1], note = "Saved") {
    setBusy(true);
    setErr("");
    try {
      await saveAgent(slug, p);
      setSaved(note);
      setTimeout(() => setSaved(""), 2000);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        {err ? <Callout kind="warn" title="Could not load the agent">{err}</Callout> : null}
      </div>
    );
  }

  const color = agentColor(agent);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-[1fr_300px]">
      <main className="min-w-0">
        <Link to="/agents" className="text-sm text-muted-foreground hover:underline">
          ← Agents
        </Link>

        <header className="mt-4 flex items-start gap-4">
          {agent.avatarUrl ? (
            <img src={agent.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
              style={{ background: color }}
            >
              {initials(agent)}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {agent.displayName || agent.slug}
              </h1>
              {agent.busy ? (
                <StatusBadge tone="success">
                  {agent.busyIssue ? `working #${agent.busyIssue}` : "working"}
                </StatusBadge>
              ) : (
                <StatusBadge tone={agent.enabled ? "info" : "neutral"}>
                  {agent.enabled ? "idle" : "disabled"}
                </StatusBadge>
              )}
              <StatusBadge tone="neutral">{agent.role}</StatusBadge>
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">@{agent.slug}</p>
            {agent.title && <p className="mt-1 text-sm text-muted-foreground">{agent.title}</p>}
          </div>
        </header>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>

        {err && <div className="mt-4"><Callout kind="warn" title="Something went wrong">{err}</Callout></div>}

        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Persona
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">{agent.specPath}</span>
          </div>
          {/* This markdown IS the system prompt the agent runs with — editing it
              changes behaviour on the next run, which is why it is a first-class
              editor rather than a textarea. */}
          <MarkdownEditor
            value={draft ?? persona}
            onChange={setDraft}
            defaultView="write"
            minRows={16}
            placeholder="# Role&#10;&#10;What this agent owns, how it works, what it must not touch."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => void patch({ persona: draft ?? persona }, "Persona saved").then(() => setDraft(null))}
              disabled={busy || draft === null || draft === persona}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save persona"}
            </button>
            {draft !== null && draft !== persona && (
              <button
                onClick={() => setDraft(null)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Discard
              </button>
            )}
            {saved && <span className="text-xs text-success">{saved}</span>}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Brain
          </h2>
          {!brain ? (
            <EmptyState title="No brain" description="This agent has no memory store." />
          ) : (
            <div className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-muted-foreground">{brain.namespace}</span>
                <StatusBadge tone="neutral">{brain.embedder}</StatusBadge>
                <span className="ms-auto flex gap-3 text-muted-foreground">
                  <span><b className="text-foreground">{brain.memories}</b> memories</span>
                  <span><b className="text-foreground">{brain.entities}</b> entities</span>
                  <span><b className="text-foreground">{brain.edges}</b> links</span>
                  <span><b className="text-foreground">{brain.gaps}</b> gaps</span>
                </span>
              </div>

              <BrainGraph
                nodes={graphNodes}
                edges={graphEdges}
                selectedId={entityId}
                onSelect={(n) => setEntityId(n.id)}
              />

              {(brain.openGaps?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                    What it looked for and did not find
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {(brain.openGaps ?? []).map((g, i) => (
                      <li key={i} className="text-xs text-muted-foreground">— {g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(brain.recent?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    What it remembers
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {(brain.recent ?? []).map((m) => (
                      <li key={m.id} className="rounded border border-border p-2 text-xs leading-relaxed">
                        <span className="me-2 font-mono text-[10px] text-muted-foreground">
                          {m.sourceKind}{m.sourceRef ? " " + m.sourceRef : ""}
                        </span>
                        {m.content}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Activity
          </h2>
          {activity.length === 0 ? (
            <EmptyState title="No runs yet" description="This agent has not claimed any work." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Issue</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead className="w-28">Result</TableHead>
                    <TableHead className="w-28">Diff</TableHead>
                    <TableHead className="w-20 text-end">Cost</TableHead>
                    <TableHead className="w-24 text-end">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">
                        {r.issue ? (
                          <Link to="/issues/$number" params={{ number: String(r.issue) }}
                            className="hover:underline">#{r.issue}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-xs">{r.title || r.kind}</TableCell>
                      <TableCell>
                        <StatusBadge tone={RUN_TONE[r.status] ?? "neutral"}>
                          {r.terminal || r.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {r.files > 0 ? `${r.files}f +${r.added}/-${r.removed}` : "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-xs">
                        ${r.costUsd.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-end text-xs text-muted-foreground">
                        {ago(r.startedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {activity.length < totalRuns && (
                <div ref={(el) => {
                  // Infinite scroll: fetch the next page when the sentinel below
                  // the table comes into view. rootMargin so it starts before the
                  // operator actually reaches the bottom.
                  if (!el) return;
                  const io = new IntersectionObserver(
                    (entries) => entries[0]?.isIntersecting && void loadMore(),
                    { rootMargin: "200px" },
                  );
                  io.observe(el);
                }} className="p-3 text-center text-xs text-muted-foreground">
                  {loadingMore
                    ? "Loading…"
                    : `${activity.length} of ${totalRuns} runs — scroll for more`}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <aside className="flex flex-col gap-4 text-sm">
        <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
          <Checkbox
            id="enabled"
            checked={agent.enabled}
            onCheckedChange={(v) => void patch({ enabled: v === true })}
            className="mt-0.5"
          />
          <Label htmlFor="enabled" className="cursor-pointer font-normal">
            <span className="font-medium">Enabled</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Only enabled agents can claim work.
            </span>
          </Label>
        </div>

        <Field label="Name">
          <Input
            defaultValue={agent.displayName}
            onBlur={(e) => e.target.value !== agent.displayName && void patch({ displayName: e.target.value })}
          />
        </Field>

        <Field label="Title">
          <Input
            defaultValue={agent.title}
            placeholder="e.g. App UI Engineer"
            onBlur={(e) => e.target.value !== agent.title && void patch({ title: e.target.value })}
          />
        </Field>

        <Field label="Model">
          <Select value={agent.model} onValueChange={(v) => void patch({ model: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="haiku">haiku — cheapest, classification</SelectItem>
              <SelectItem value="sonnet">sonnet — the default for code</SelectItem>
              <SelectItem value="opus">opus — hardest reasoning</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Colour">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={agent.color || "#4f46e5"}
              onChange={(e) => void patch({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
              aria-label="Agent colour"
            />
            <Input
              defaultValue={agent.color}
              placeholder="#4f46e5 — blank derives one"
              onBlur={(e) => e.target.value !== agent.color && void patch({ color: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        </Field>

        <Field label="Avatar URL">
          <Input
            defaultValue={agent.avatarUrl}
            placeholder="https://… or /path"
            onBlur={(e) => e.target.value !== agent.avatarUrl && void patch({ avatarUrl: e.target.value })}
            className="text-xs"
          />
        </Field>

        <Field label="Per-run budget (USD)">
          {/* This is the live ceiling. The orchestrator passes it into the run
              as BUILDER_RUN_BUDGET_USD, and budget-meter.sh prefers it over
              .claude/autonomy.yaml — so this field is the source of truth and
              the operator never has to edit YAML to unblock an agent. */}
          <Input
            type="number" step="0.5" min="0" max="1000"
            defaultValue={String(agent.maxBudgetUsd)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== agent.maxBudgetUsd) void patch({ maxBudgetUsd: v });
            }}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            One session. A run that stops here reports rather than half-finishing.
          </p>
        </Field>

        <Field label="Max turns per run">
          <Input
            type="number" step="1" min="1" max="2000"
            defaultValue={String(agent.maxTurns)}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v !== agent.maxTurns) void patch({ maxTurns: v });
            }}
          />
        </Field>

        <Field label="Working directory">
          <Input
            defaultValue={agent.workdir}
            placeholder="/absolute/path — blank uses BUILDER_WORKDIR"
            onBlur={(e) => e.target.value !== agent.workdir && void patch({ workdir: e.target.value })}
            className="font-mono text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            The repository this agent branches from. A fleet can span more than one —
            point each agent at the codebase its areas actually live in.
          </p>
        </Field>

        <Field label="Areas it owns">
          <Input
            defaultValue={agent.areas.join(", ")}
            placeholder="sdk, widget, a11y"
            onBlur={(e) => {
              const next = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
              if (next.join(",") !== agent.areas.join(",")) void patch({ areas: next });
            }}
            className="text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            An issue is only claimable by an agent that owns its area.
          </p>
        </Field>

        <Field label="Skills">
          <Input
            defaultValue={agent.skills.join(", ")}
            placeholder="issue-plane, pin-anchor-resolution"
            onBlur={(e) => {
              const next = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
              if (next.join(",") !== agent.skills.join(",")) void patch({ skills: next });
            }}
            className="text-xs"
          />
          {/* The field edits the list; these open them. A skill name in a
              comma-separated box is not obviously a thing you can go and read,
              and reading it is the usual reason for looking at this field. */}
          {agent.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.skills.map((s) => (
                <Link
                  key={s}
                  to="/skills/$name"
                  params={{ name: s }}
                  className="rounded-md border border-border px-2 py-0.5 font-mono text-[11px]
                             text-muted-foreground transition-colors hover:border-primary/60
                             hover:text-foreground"
                >
                  {s}
                </Link>
              ))}
            </div>
          )}
          {agent.skills.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              No skills. This agent runs on its persona alone.
            </p>
          )}
        </Field>

        <div className="rounded-lg border border-border p-3 text-xs">
          <Row k="Runs" v={String(agent.runs)} />
          <Row k="Spent" v={`$${agent.spendUsd.toFixed(4)}`} />
          <Row k="Per-run cap" v={`$${agent.maxBudgetUsd.toFixed(2)}`} />
          <Row k="Memories" v={String(agent.memories)} />
          <Row k="Brain" v={agent.hasBrain ? "yes" : "none"} />
          <Row k="Last run" v={agent.lastRunAt ? ago(agent.lastRunAt) : "never"} />
        </div>
      </aside>

      {entityId && (
        <EntityPanel
          slug={slug}
          entityId={entityId}
          onClose={() => setEntityId(null)}
          onOpenEntity={setEntityId}
        />
      )}
    </div>
  );
};
AgentDetail.displayName = "AgentDetail";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    {children}
  </div>
);
Field.displayName = "Field";

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3 py-0.5">
    <span className="text-muted-foreground">{k}</span>
    <span className="font-mono">{v}</span>
  </div>
);
Row.displayName = "Row";
