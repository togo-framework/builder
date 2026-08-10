import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  Button, Callout, EmptyState, Input, MarkdownEditor, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, Switch, Tabs, TabsContent, TabsList,
  TabsTrigger,
} from "@togo-framework/ui";
import {
  ArrowLeft, CircleAlert, CircleCheck, CircleDashed, CircleX, LoaderCircle,
} from "lucide-react";
import {
  fetchAgent, fetchBrain, saveAgent,
  type Agent, type AgentActivity, type BrainGraphEdge, type BrainGraphNode,
  type BrainView,
} from "../lib/agents";
import { listSkills, type Skill } from "../lib/skills";
import { BrainGraph } from "../components/brain-graph";
import { EntityPanel } from "../components/entity-panel";
import { SkillMark } from "../components/skill-mark";
import { PageShell } from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { AgentTile } from "./agents";

// Frozen empties, shared. See the note where they are used: a fresh [] per
// render is what made the graph animate without end.
const NO_NODES: BrainGraphNode[] = [];
const NO_EDGES: BrainGraphEdge[] = [];

/**
 * A run's outcome as a SHAPE-coded glyph, not just a tinted word. A check, a
 * cross, an alert and a spinner survive monochrome and colourblindness; four
 * same-shaped badges in different hues do not.
 */
const RunGlyph = ({ status }: { status: string }) => {
  const cls = "mt-0.5 size-4 shrink-0";
  if (status === "succeeded") return <CircleCheck className={`${cls} text-success`} />;
  if (status === "failed") return <CircleX className={`${cls} text-destructive`} />;
  if (status === "needs_input") return <CircleAlert className={`${cls} text-warning`} />;
  if (status === "running")
    return <LoaderCircle className={`${cls} animate-spin text-info motion-reduce:animate-none`} />;
  return <CircleDashed className={`${cls} text-muted-foreground`} />;
};
RunGlyph.displayName = "RunGlyph";

export const AgentDetail = () => {
  const { S } = useStrings();
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
  // The skill catalogue, fetched once: the agent record carries bare skill
  // names, and a list of bare names has no glyph and no description to show.
  const [catalogue, setCatalogue] = useState<Skill[] | null>(null);

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

  useEffect(() => {
    // Best-effort too — a missing catalogue degrades the Skills tab to
    // name-only rows, it must not error the page.
    listSkills("", 0, 200)
      .then((d) => setCatalogue(d.skills))
      .catch(() => setCatalogue(null));
  }, []);

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

  async function patch(p: Parameters<typeof saveAgent>[1], note = S.agents.saved) {
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

  const back = (
    <Link
      to="/agents"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
      {S.agents.back}
    </Link>
  );

  if (!agent) {
    return (
      <PageShell>
        {back}
        {err ? <Callout kind="warn" title={S.agents.loadOneErr}>{err}</Callout> : null}
      </PageShell>
    );
  }

  return (
    <PageShell>
      {back}

      {/* The hero band: big tile, name, one-line tagline, and the ONE primary
          action — enabled — on the trailing side. Everything else is a tab or
          the rail. */}
      <header className="flex flex-wrap items-start gap-4 sm:gap-5">
        <AgentTile a={agent} className="size-16 text-xl sm:size-20 sm:text-2xl" dimmed={!agent.enabled} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {agent.displayName || agent.slug}
            </h1>
            {agent.busy && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                {agent.busyIssue ? S.agents.workingOn(agent.busyIssue) : S.agents.working}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {agent.title || agent.description}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span dir="ltr" className="font-mono">@{agent.slug}</span>
            {agent.role && <span>{agent.role}</span>}
            <span dir="ltr" className="font-mono">{agent.model}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
          <label className="flex cursor-pointer items-center gap-2">
            <span className={`text-sm font-medium ${agent.enabled ? "" : "text-warning"}`}>
              {agent.enabled ? S.agents.enabledLabel : S.common.off}
            </span>
            <Switch
              checked={agent.enabled}
              onCheckedChange={(v) => void patch({ enabled: v === true })}
              aria-label={
                agent.enabled
                  ? S.agents.disableAria(agent.displayName || agent.slug)
                  : S.agents.enableAria(agent.displayName || agent.slug)
              }
            />
          </label>
          <span className="max-w-44 text-end text-[11px] text-muted-foreground">
            {S.agents.enabledHint}
          </span>
        </div>
      </header>

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {/* Content leads, the quiet meta rail trails — the same split as the
          issue page, one pattern across the product. The grid follows the
          document direction, so the rail changes side in Arabic by itself. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList>
            <TabsTrigger value="overview">{S.agents.tabOverview}</TabsTrigger>
            <TabsTrigger value="skills">{S.agents.tabSkills}</TabsTrigger>
            <TabsTrigger value="runs">{S.agents.tabRuns}</TabsTrigger>
            <TabsTrigger value="memory">{S.agents.tabMemory}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 flex min-w-0 flex-col gap-6">
            <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>

            <section className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {S.agents.personaHeading}
                </h2>
                <span dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                  {agent.specPath}
                </span>
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
                <Button
                  onClick={() =>
                    void patch({ persona: draft ?? persona }, S.agents.personaSaved).then(() => setDraft(null))
                  }
                  disabled={busy || draft === null || draft === persona}
                >
                  {busy ? S.common.saving : S.agents.savePersona}
                </Button>
                {draft !== null && draft !== persona && (
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    {S.common.discard}
                  </Button>
                )}
                {saved && <span className="text-xs text-success">{saved}</span>}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="skills" className="mt-4 flex min-w-0 flex-col gap-5">
            {agent.skills.length === 0 ? (
              <EmptyState title={S.agents.skillsEmpty} description="" />
            ) : (
              // A plain list with hairline dividers — glyph, name, description.
              // No cards: a nested collection inside a detail page does not get
              // its own chrome.
              <div className="divide-y divide-border">
                {agent.skills.map((name) => {
                  const sk = catalogue?.find((s) => s.name === name);
                  return (
                    <Link
                      key={name}
                      to="/skills/$name"
                      params={{ name }}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <SkillMark
                        skill={sk ?? { name, color: "", icon: "" }}
                        className="size-9"
                      />
                      <span className="min-w-0 flex-1">
                        {/* <bdi>, not block dir="ltr" — the name keeps its
                            latin order yet stays on the reading edge in RTL. */}
                        <span className="block truncate font-mono text-sm font-medium group-hover:underline">
                          <bdi>{name}</bdi>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sk ? sk.title || sk.description || S.skills.noDescription : S.agents.noDescription}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* The list shows; this field edits. Assign or unassign by editing
                the comma-separated names — the same patch the roster uses. */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {S.agents.skillsFieldLabel}
              </p>
              <Input
                defaultValue={agent.skills.join(", ")}
                placeholder="issue-plane, pin-anchor-resolution"
                dir="ltr"
                onBlur={(e) => {
                  const next = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                  if (next.join(",") !== agent.skills.join(",")) void patch({ skills: next });
                }}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{S.agents.skillsFieldHint}</p>
            </div>
          </TabsContent>

          <TabsContent value="runs" className="mt-4 min-w-0">
            {activity.length === 0 ? (
              <EmptyState title={S.agents.runsEmptyTitle} description={S.agents.runsEmptyDesc} />
            ) : (
              // Plain rows, hairline dividers, outcome as a shaped glyph. The
              // table this replaces made six columns out of what is really one
              // sentence per run.
              <div className="divide-y divide-border">
                {activity.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5">
                    <RunGlyph status={r.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        {r.issue ? (
                          <Link
                            to="/issues/$number"
                            params={{ number: String(r.issue) }}
                            className="shrink-0 font-medium tabular-nums hover:underline"
                          >
                            <span dir="ltr">#{r.issue}</span>
                          </Link>
                        ) : null}
                        <span className="min-w-0 truncate">{r.title || r.kind}</span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {r.terminal && <span>{r.terminal}</span>}
                        {r.files > 0 && (
                          <span dir="ltr" className="font-mono">{r.files}f +{r.added}/-{r.removed}</span>
                        )}
                        <span dir="ltr" className="tabular-nums">${r.costUsd.toFixed(4)}</span>
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {S.agents.ago(r.startedAt)}
                    </span>
                  </div>
                ))}
                {activity.length < totalRuns && (
                  <div
                    ref={(el) => {
                      // Infinite scroll: fetch the next page when the sentinel
                      // below the list comes into view. rootMargin so it starts
                      // before the operator actually reaches the bottom.
                      if (!el) return;
                      const io = new IntersectionObserver(
                        (entries) => entries[0]?.isIntersecting && void loadMore(),
                        { rootMargin: "200px" },
                      );
                      io.observe(el);
                    }}
                    className="py-3 text-center text-xs text-muted-foreground"
                  >
                    {loadingMore ? S.common.loading : S.agents.runsProgress(activity.length, totalRuns)}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="memory" className="mt-4 flex min-w-0 flex-col gap-4">
            {!brain ? (
              <EmptyState title={S.agents.noBrainTitle} description={S.agents.noBrainDesc} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span dir="ltr" className="font-mono">{brain.namespace}</span>
                  <span dir="ltr" className="font-mono">{brain.embedder}</span>
                  <span className="ms-auto flex flex-wrap gap-3">
                    <span><b className="text-foreground">{brain.memories}</b> {S.agents.brainMemories}</span>
                    <span><b className="text-foreground">{brain.entities}</b> {S.agents.brainEntities}</span>
                    <span><b className="text-foreground">{brain.edges}</b> {S.agents.brainLinks}</span>
                    <span><b className="text-foreground">{brain.gaps}</b> {S.agents.brainGaps}</span>
                  </span>
                </div>

                <BrainGraph
                  nodes={graphNodes}
                  edges={graphEdges}
                  selectedId={entityId}
                  onSelect={(n) => setEntityId(n.id)}
                />

                {(brain.openGaps?.length ?? 0) > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                      {S.agents.gapsTitle}
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {(brain.openGaps ?? []).map((g, i) => (
                        <li key={i} className="text-xs text-muted-foreground">— {g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {(brain.recent?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {S.agents.remembersTitle}
                    </p>
                    {/* A plain list with hairline dividers — the memories are a
                        nested collection, not a stack of cards. */}
                    <ul className="divide-y divide-border">
                      {(brain.recent ?? []).map((m) => (
                        <li key={m.id} className="py-2 text-xs leading-relaxed">
                          <span dir="ltr" className="me-2 font-mono text-[10px] text-muted-foreground">
                            {m.sourceKind}{m.sourceRef ? " " + m.sourceRef : ""}
                          </span>
                          {m.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* The quiet meta rail: configuration and totals. Everything here is a
            fact or a setting; the work happens in the tabs. */}
        <aside className="flex flex-col gap-4 text-sm">
          <Field label={S.agents.railName}>
            <Input
              defaultValue={agent.displayName}
              onBlur={(e) => e.target.value !== agent.displayName && void patch({ displayName: e.target.value })}
            />
          </Field>

          <Field label={S.agents.railTitle}>
            <Input
              defaultValue={agent.title}
              placeholder={S.agents.railTitlePlaceholder}
              onBlur={(e) => e.target.value !== agent.title && void patch({ title: e.target.value })}
            />
          </Field>

          <Field label={S.agents.railModel}>
            <Select value={agent.model} onValueChange={(v) => void patch({ model: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="haiku">{S.agents.modelHaiku}</SelectItem>
                <SelectItem value="sonnet">{S.agents.modelSonnet}</SelectItem>
                <SelectItem value="opus">{S.agents.modelOpus}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label={S.agents.railColour}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                // The picker's value is DATA (the agent's stored identity
                // colour), not a styling decision — hence the literal default.
                value={agent.color || "#4f46e5"}
                onChange={(e) => void patch({ color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                aria-label={S.agents.colourAria}
              />
              <Input
                defaultValue={agent.color}
                placeholder={S.agents.colourPlaceholder}
                dir="ltr"
                onBlur={(e) => e.target.value !== agent.color && void patch({ color: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
          </Field>

          <Field label={S.agents.railAvatar}>
            <Input
              defaultValue={agent.avatarUrl}
              placeholder={S.agents.avatarPlaceholder}
              dir="ltr"
              onBlur={(e) => e.target.value !== agent.avatarUrl && void patch({ avatarUrl: e.target.value })}
              className="text-xs"
            />
          </Field>

          <Field label={S.agents.railBudget}>
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
            <p className="mt-1 text-[11px] text-muted-foreground">{S.agents.budgetHint}</p>
          </Field>

          <Field label={S.agents.railTurns}>
            <Input
              type="number" step="1" min="1" max="2000"
              defaultValue={String(agent.maxTurns)}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v !== agent.maxTurns) void patch({ maxTurns: v });
              }}
            />
          </Field>

          <Field label={S.agents.railWorkdir}>
            <Input
              defaultValue={agent.workdir}
              placeholder={S.agents.workdirPlaceholder}
              dir="ltr"
              onBlur={(e) => e.target.value !== agent.workdir && void patch({ workdir: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{S.agents.workdirRailHint}</p>
          </Field>

          <Field label={S.agents.railAreas}>
            <Input
              defaultValue={agent.areas.join(", ")}
              placeholder="sdk, widget, a11y"
              dir="ltr"
              onBlur={(e) => {
                const next = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                if (next.join(",") !== agent.areas.join(",")) void patch({ areas: next });
              }}
              className="text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{S.agents.areasRailHint}</p>
          </Field>

          {/* The totals: hairline rows, no box — a rail inside a rail is chrome
              on chrome. */}
          <div className="divide-y divide-border border-t border-border text-xs">
            <StatLine k={S.agents.statRuns} v={String(agent.runs)} />
            <StatLine k={S.agents.statSpent} v={`$${agent.spendUsd.toFixed(4)}`} />
            <StatLine k={S.agents.statCap} v={`$${agent.maxBudgetUsd.toFixed(2)}`} />
            <StatLine k={S.agents.statMemories} v={String(agent.memories)} />
            <StatLine k={S.agents.statBrain} v={agent.hasBrain ? S.agents.brainYes : S.agents.brainNone} plain />
            <StatLine k={S.agents.statLastRun} v={agent.lastRunAt ? S.agents.ago(agent.lastRunAt) : S.agents.never} plain />
          </div>
        </aside>
      </div>

      {entityId && (
        <EntityPanel
          slug={slug}
          entityId={entityId}
          onClose={() => setEntityId(null)}
          onOpenEntity={setEntityId}
        />
      )}
    </PageShell>
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

/** One quiet fact in the rail. `plain` opts a localised word out of mono+LTR —
 *  mono is for machine values, and forcing LTR on an Arabic word breaks it. */
const StatLine = ({ k, v, plain = false }: { k: string; v: string; plain?: boolean }) => (
  <div className="flex justify-between gap-3 py-1.5">
    <span className="text-muted-foreground">{k}</span>
    {plain ? <span>{v}</span> : <span dir="ltr" className="font-mono tabular-nums">{v}</span>}
  </div>
);
StatLine.displayName = "StatLine";
