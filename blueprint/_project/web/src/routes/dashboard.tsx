import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Callout, cn } from "@togo-framework/ui";
import {
  ArrowRight,
  Bot,
  CircleHelp,
  FileDiff,
  GitBranch,
  Inbox,
  LibraryBig,
  RefreshCw,
  RotateCcw,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { sessionMe, type Me } from "../lib/auth";
import {
  agentColor,
  fetchAgent,
  initials,
  listAgents,
  type Agent,
  type AgentActivity,
} from "../lib/agents";
import { fetchBoard, patchIssue, TRANSITIONS, type Board, type Card } from "../lib/issues";
import { fetchDecisions, isLive, onAgentEvent, onLiveChange, type Decision } from "../lib/alerts";
import {
  DotLabel,
  MonoBadge,
  PageShell,
  Row,
  RowMeta,
  RowTitle,
  Rows,
  Section,
  Shimmer,
} from "../components/page-shell";
import { EmptyState } from "../components/ui/empty-state";
import {
  Footprint,
  FootprintArtefact,
  FootprintRow,
  type FootprintStatus,
} from "../components/ui/footprint";
import { BudgetMeter } from "../components/ui/token-cost";
import { ConfirmAction } from "../components/ui/confirm-action";
import { relativeTime, useHomeStrings } from "../lib/i18n.home";

/**
 * The dashboard — the landing screen for a fleet that works unwatched.
 *
 * This product lets autonomous agents claim issues, edit a repository, push
 * branches and spend real money while nobody is looking. The operator arrives
 * afterwards, and the four questions they arrive with are always the same:
 *
 *   1. What needs ME?              a stopped agent, a review, a human-only issue
 *   2. What did the fleet DO?      the footprint — actions, artefacts, order
 *   3. What did it COST?           spend against the ceilings that stop it
 *   4. What is FAILING?            runs that ended badly, issues stuck on retries
 *
 * So the page is a governors-and-footprints surface, not a strip of counters.
 * There is deliberately no "total issues / total agents / total runs" band: a
 * number earns its place only if it changes what the operator does next, and
 * "47 issues" changes nothing. Every number here is either an amount of money,
 * a count of things waiting on a human, or a count of failures.
 *
 * The composition is a bento rather than a uniform card wall because the four
 * answers are not the same weight. The fleet map and the waiting queue lead;
 * the footprint feed is the long read; money and failures are narrow governors
 * stacked beside it. On a phone the waiting queue is ordered FIRST — on a small
 * screen the actionable thing must not sit below a picture.
 */

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;

const at = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * The plain-text equivalent of <bdi dir="ltr">, for the strings that cannot
 * carry an element: a `title` tooltip, an aria-label. Without the isolate the
 * bidi algorithm reorders "#46" and "$2.40" inside an Arabic sentence and the
 * operator is told a different number than the one that is true.
 */
const iso = (s: string): string => `⁦${s}⁩`;

/** A run's terminal state, in the footprint's vocabulary. */
const RUN_STATUS: Record<string, FootprintStatus> = {
  succeeded: "done",
  success: "done",
  done: "done",
  merged: "done",
  failed: "failed",
  error: "failed",
  needs_input: "blocked",
  blocked: "blocked",
  expired: "skipped",
  cancelled: "skipped",
  canceled: "skipped",
  running: "running",
  in_progress: "running",
  claimed: "running",
};
const runStatus = (s: string): FootprintStatus => RUN_STATUS[s] ?? "pending";

/** A run that did not deliver. `expired` is a failure: the lease died mid-work. */
const endedBadly = (s: string) => s === "failed" || s === "error" || s === "expired";

type Run = AgentActivity & { agent: Agent };

/** One thing that cannot move without a human. */
type Need =
  | { key: string; kind: "decision"; decision: Decision }
  | { key: string; kind: "stopped"; agent: Agent }
  | { key: string; kind: "review" | "blocked" | "human"; card: Card };

/* ------------------------------------------------------------------ */
/* The fleet map                                                       */
/* ------------------------------------------------------------------ */

/**
 * The fleet as a team, drawn as an orbit.
 *
 * This is built — rather than skipped as decoration — because every channel in
 * it carries a fact that the operator would otherwise have to read a table for:
 *
 *   radius   engagement. Inner ring = running a session right now, middle =
 *            ran in the last 24h, outer = idle or switched off. Distance from
 *            the centre is distance from the work.
 *   colour   identity — agentColor(slug), the same colour this agent has on
 *            the roster and its detail page, so the map is learnable.
 *   motion   ONLY a working agent pulses. Movement means "in flight", which is
 *            why nothing else on the map moves; under prefers-reduced-motion
 *            the pulse is dropped and the ring still states the same fact.
 *   ring     health — over its spend ceiling (destructive), last run ended
 *            badly (warning), switched off (dimmed).
 *
 * Angle is derived from the slug, so an agent keeps its bearing between
 * reloads; only its RADIUS moves as it starts and stops working. Members of a
 * ring are then evenly spaced in that bearing order, which guarantees they
 * cannot overlap without randomising who sits where.
 *
 * Every node is a link to that agent, keyboard reachable, with the same fact
 * spelled out in its accessible name — the picture is a shortcut to the text,
 * never the only copy of it.
 */

type Band = "working" | "today" | "idle";
const BAND_BASE: Record<Band, number> = { working: 44, today: 86, idle: 126 };
const BAND_CAP: Record<Band, number> = { working: 66, today: 104, idle: 134 };
const NODE = 16;
const VIEW = 340;
const MID = VIEW / 2;

const slugAngle = (slug: string): number => {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 360;
};

const bandOf = (a: Agent, now: number): Band =>
  a.busy
    ? "working"
    : a.enabled && a.lastRunAt && now - at(a.lastRunAt) < DAY
      ? "today"
      : "idle";

const FleetOrbit = ({ agents, ar }: { agents: Agent[]; ar: boolean }) => {
  const { S } = useHomeStrings();
  const navigate = useNavigate();

  // The map stays legible; the roster page is where a large fleet is read.
  const shown = useMemo(
    () => agents.slice().sort((p, q) => at(q.lastRunAt) - at(p.lastRunAt)).slice(0, 16),
    [agents],
  );

  const placed = useMemo(() => {
    const now = Date.now();
    const bands: Record<Band, Agent[]> = { working: [], today: [], idle: [] };
    for (const a of shown) bands[bandOf(a, now)].push(a);

    const nodes: { a: Agent; band: Band; x: number; y: number }[] = [];
    const radii: Partial<Record<Band, number>> = {};

    (Object.keys(bands) as Band[]).forEach((band) => {
      const list = bands[band].slice().sort((p, q) => slugAngle(p.slug) - slugAngle(q.slug));
      if (list.length === 0) return;
      // Grow the ring only as far as it must to keep two marks from touching.
      const needed = (list.length * (NODE * 2 + 8)) / (2 * Math.PI);
      const r = Math.min(BAND_CAP[band], Math.max(BAND_BASE[band], needed));
      radii[band] = r;
      const step = 360 / list.length;
      const start = slugAngle(list[0].slug);
      list.forEach((a, i) => {
        const rad = ((start + i * step - 90) * Math.PI) / 180;
        nodes.push({ a, band, x: MID + r * Math.cos(rad), y: MID + r * Math.sin(rad) });
      });
    });

    return { nodes, radii, counts: {
      working: bands.working.length,
      today: bands.today.length,
      idle: bands.idle.length,
    } };
  }, [shown]);

  const overBudget = agents.filter((a) => a.maxBudgetUsd > 0 && a.spendUsd > a.maxBudgetUsd).length;
  const paused = agents.filter((a) => !a.enabled).length;
  const { working, today, idle } = placed.counts;

  const nodeLabel = (a: Agent): string => {
    const where = a.busy
      ? `${S.onIssue}${iso(`#${a.busyIssue ?? "?"}`)}`
      : a.lastRunAt
        ? `${S.lastRun}${relativeTime(a.lastRunAt, ar)}`
        : S.neverRan;
    return `${a.displayName} — ${where}`;
  };

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 rounded-card border border-border bg-card p-4">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="group"
        aria-label={S.fleetAlt(working, today, idle)}
        className="h-auto w-full max-w-[340px]"
      >
        {/* Rings are drawn only where agents actually stand. An empty ring is
            decoration, and this surface has no budget for decoration. */}
        {(Object.keys(placed.radii) as Band[]).map((band) => (
          <circle
            key={band}
            cx={MID}
            cy={MID}
            r={placed.radii[band]}
            fill="none"
            strokeWidth={1}
            strokeDasharray="2 6"
            className="stroke-current text-border"
          />
        ))}

        <text
          x={MID}
          y={MID - 2}
          textAnchor="middle"
          className="numeric fill-current text-3xl font-semibold text-foreground"
        >
          {working}
        </text>
        <text
          x={MID}
          y={MID + 14}
          textAnchor="middle"
          className="fill-current text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {S.working}
        </text>
        <text
          x={MID}
          y={MID + 27}
          textAnchor="middle"
          className="fill-current text-[10px] text-muted-foreground"
        >
          {S.fleetOf(agents.length)}
        </text>

        {placed.nodes.map(({ a, x, y }) => {
          const colour = agentColor(a);
          const over = a.maxBudgetUsd > 0 && a.spendUsd > a.maxBudgetUsd;
          const bad = endedBadly(a.lastStatus) || a.lastStatus === "needs_input";
          return (
            <g
              key={a.slug}
              transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
              role="link"
              tabIndex={0}
              aria-label={nodeLabel(a)}
              onClick={() => navigate({ to: "/agents/$slug", params: { slug: a.slug } })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate({ to: "/agents/$slug", params: { slug: a.slug } });
                }
              }}
              className={cn(
                "group cursor-pointer outline-none",
                !a.enabled && "opacity-40",
              )}
            >
              <title>{nodeLabel(a)}</title>

              {/* In flight. The only movement on the map. */}
              {a.busy && (
                <circle
                  r={NODE + 7}
                  fill={colour}
                  className="animate-ping opacity-25 motion-reduce:animate-none"
                />
              )}

              {/* Health ring + the focus/hover ring, same circle. */}
              <circle
                r={NODE + 4}
                fill="none"
                strokeWidth={over || (a.busy && !bad) || bad ? 2 : 1}
                className={cn(
                  "stroke-current transition-[stroke-width] group-hover:stroke-2 group-focus-visible:stroke-2",
                  over
                    ? "text-destructive"
                    : a.busy
                      ? "text-info"
                      : bad
                        ? "text-warning"
                        : "text-border",
                )}
              />

              {/* The identity colour: stored data, not a style decision. */}
              <circle r={NODE} fill={colour} />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                className="pointer-events-none fill-white text-[11px] font-semibold"
              >
                {initials(a)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The radial encoding, said in words. The picture is the shortcut. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span>{S.bandWorking}</span>
        <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        <span>{S.bandToday}</span>
        <ArrowRight aria-hidden="true" className="size-3 rtl:rotate-180" />
        <span>{S.bandIdle}</span>
      </div>

      <p className="text-center text-xs text-muted-foreground">{S.fleetAlt(working, today, idle)}</p>

      {(overBudget > 0 || paused > 0 || agents.length > shown.length) && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {overBudget > 0 && (
            <DotLabel tone="danger">
              <span className="numeric">{overBudget}</span> {S.overCeiling}
            </DotLabel>
          )}
          {paused > 0 && (
            <DotLabel tone="neutral">
              <span className="numeric">{paused}</span> {S.paused}
            </DotLabel>
          )}
          {agents.length > shown.length && (
            <Link
              to="/agents"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {S.moreAgents(agents.length - shown.length)}
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
FleetOrbit.displayName = "FleetOrbit";

/* ------------------------------------------------------------------ */
/* The route                                                           */
/* ------------------------------------------------------------------ */

export function Dashboard() {
  const { S, ar } = useHomeStrings();
  const navigate = useNavigate();

  const [me, setMe] = useState<Me | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [feed, setFeed] = useState<Run[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(isLive());
  const [requeue, setRequeue] = useState<Card | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [roster, brd, decs] = await Promise.all([
        listAgents(),
        fetchBoard(),
        fetchDecisions().catch(() => [] as Decision[]),
      ]);
      setAgents(roster);
      setBoard(brd);
      setDecisions(decs);
      setErr("");

      // There is no fleet-wide activity endpoint, so the footprint feed is a
      // fan-out over the agents that have actually run, most recent first, and
      // capped — a landing page must not open one request per roster entry.
      const recent = roster
        .filter((a) => a.runs > 0)
        .sort((p, q) => at(q.lastRunAt) - at(p.lastRunAt))
        .slice(0, 6);
      const chunks = await Promise.all(
        recent.map((a) =>
          fetchAgent(a.slug, 0, 5)
            .then((d) => (d.activity ?? []).map((r): Run => ({ ...r, agent: a })))
            .catch(() => [] as Run[]),
        ),
      );
      setFeed(chunks.flat().sort((p, q) => at(q.startedAt) - at(p.startedAt)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setAgents((prev) => prev ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    sessionMe().then(setMe);
    load();
  }, [load]);

  // An agent event means the picture on screen is already stale. Coalesced,
  // because a single run emits a burst and six refetches would be a burst back.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const offEvent = onAgentEvent(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 1500);
    });
    const offLive = onLiveChange(setLive);
    return () => {
      offEvent();
      offLive();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const cards = useMemo<Card[]>(
    () => (board ? Object.values(board.cards ?? {}).flatMap((c) => c ?? []) : []),
    [board],
  );

  /* ---- 1. What needs a human ---- */
  const needs = useMemo<Need[]>(() => {
    const out: Need[] = [];
    for (const d of decisions) out.push({ key: `d-${d.id}`, kind: "decision", decision: d });

    // A run that ended `needs_input` with no open decision row is still an
    // agent standing still waiting for a person — the decisions feed is not
    // the only way work stops.
    const askedBy = new Set(decisions.map((d) => d.agentSlug));
    for (const a of agents ?? []) {
      if (a.lastStatus === "needs_input" && !a.busy && !askedBy.has(a.slug)) {
        out.push({ key: `s-${a.slug}`, kind: "stopped", agent: a });
      }
    }

    for (const c of cards) {
      if (c.status === "in_review") out.push({ key: `r-${c.id}`, kind: "review", card: c });
    }
    for (const c of cards) {
      if (c.status === "blocked") out.push({ key: `b-${c.id}`, kind: "blocked", card: c });
    }
    for (const c of cards) {
      if (c.humanOnly && (c.status === "ready" || c.status === "triage")) {
        out.push({ key: `h-${c.id}`, kind: "human", card: c });
      }
    }
    return out;
  }, [agents, cards, decisions]);

  /* ---- 3. What it cost ---- */
  const money = useMemo(() => {
    const list = agents ?? [];
    const spent = list.reduce((n, a) => n + (a.spendUsd || 0), 0);
    const ceiling = list
      .filter((a) => a.enabled && a.maxBudgetUsd > 0)
      .reduce((n, a) => n + a.maxBudgetUsd, 0);
    const capped = list.filter((a) => a.enabled && a.maxBudgetUsd > 0).length;
    const top = list
      .filter((a) => a.spendUsd > 0)
      .sort((p, q) => q.spendUsd - p.spendUsd)
      .slice(0, 3);
    return { spent, ceiling, capped, top };
  }, [agents]);

  /* ---- 4. What is failing ---- */
  const badRuns = useMemo(() => feed.filter((r) => endedBadly(r.status)).length, [feed]);
  const stuck = useMemo(
    () =>
      cards
        .filter((c) => c.attempts >= 2 && c.status !== "done" && c.status !== "rejected")
        .sort((p, q) => q.attempts - p.attempts)
        .slice(0, 4),
    [cards],
  );

  const handleRequeue = async () => {
    if (!requeue) return;
    try {
      await patchIssue(requeue.number, { status: "ready" });
      setRequeue(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---- Loading ---- */
  if (!me || agents === null) {
    return (
      <PageShell title={S.title}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Shimmer className="h-[420px] lg:col-span-7" />
          <Shimmer className="h-[420px] lg:col-span-5" />
          <Shimmer className="h-64 lg:col-span-7" />
          <Shimmer className="h-64 lg:col-span-5" />
        </div>
      </PageShell>
    );
  }

  const email = String(me.email ?? "");

  /* ---- Fresh install: teach the next move, not a wall of zeros ---- */
  const fresh = agents.length === 0 && cards.length === 0;

  return (
    <PageShell
      title={S.title}
      actions={
        <div className="flex items-center gap-3">
          <DotLabel
            tone={live ? "success" : "neutral"}
            title={live ? S.liveHint : S.offlineHint}
            className="hidden sm:inline-flex"
          >
            {live ? S.live : S.offline}
          </DotLabel>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={busy}
            aria-label={S.refresh}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-3.5", busy && "animate-spin motion-reduce:animate-none")}
            />
            <span className="hidden sm:inline">{S.refresh}</span>
          </Button>
        </div>
      }
    >
      <p className="-mt-4 text-sm text-muted-foreground">
        {S.welcome}{" "}
        <bdi dir="ltr" className="font-medium text-foreground">
          {email}
        </bdi>
      </p>

      {err && (
        <Callout kind="warn" title={S.loadFailed}>
          {err}
        </Callout>
      )}

      {fresh ? (
        <EmptyState
          icon={<Sparkles />}
          title={S.freshTitle}
          description={S.freshDesc}
          suggestionsLabel={S.freshLabel}
          suggestions={[
            {
              label: S.goHire,
              icon: <UserPlus />,
              onSelect: () => void navigate({ to: "/agents" }),
            },
            {
              label: S.goIssue,
              icon: <Inbox />,
              onSelect: () => void navigate({ to: "/issues" }),
            },
            {
              label: S.goDocs,
              icon: <LibraryBig />,
              onSelect: () => void navigate({ to: "/library" }),
            },
          ]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ---------- Waiting on you ---------- */}
          <Section
            title={S.needTitle}
            count={needs.length}
            className="order-first lg:order-none lg:col-span-5"
          >
            {needs.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<CircleHelp />}
                title={S.needQuietTitle}
                description={S.needQuietDesc}
              />
            ) : (
              <>
                <Rows>
                  {needs.slice(0, 6).map((n) => (
                    <NeedItem key={n.key} need={n} ar={ar} />
                  ))}
                </Rows>
                {needs.length > 6 && (
                  <Link
                    to="/issues"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {S.needMore(needs.length - 6)}
                  </Link>
                )}
              </>
            )}
          </Section>

          {/* ---------- The fleet ---------- */}
          <Section
            title={S.fleetTitle}
            className="lg:col-span-7"
            actions={
              <Link
                to="/agents"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {S.goRoster}
              </Link>
            }
          >
            {agents.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<Users />}
                title={S.freshTitle}
                description={S.freshDesc}
                suggestionsLabel={S.freshLabel}
                suggestions={[
                  {
                    label: S.goHire,
                    icon: <UserPlus />,
                    onSelect: () => void navigate({ to: "/agents" }),
                  },
                ]}
              />
            ) : (
              <FleetOrbit agents={agents} ar={ar} />
            )}
          </Section>

          {/* ---------- What they did ---------- */}
          <Section
            title={S.awayTitle}
            className="lg:col-span-7"
            actions={
              <Link
                to="/issues"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {S.awayAll}
              </Link>
            }
          >
            {feed.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<Bot />}
                title={S.awayEmptyTitle}
                description={S.awayEmptyDesc}
                suggestionsLabel={S.freshLabel}
                suggestions={[
                  {
                    label: S.goBoard,
                    icon: <Inbox />,
                    onSelect: () => void navigate({ to: "/issues" }),
                  },
                ]}
              />
            ) : (
              <Footprint bordered>
                {feed.slice(0, 8).map((r, i) => (
                  <FootprintRow
                    key={`${r.agent.slug}-${r.startedAt}-${i}`}
                    arabic={ar}
                    status={runStatus(r.status)}
                    lead={r.issue ? <MonoBadge>#{r.issue}</MonoBadge> : undefined}
                    title={
                      r.issue ? (
                        <Link
                          to="/issues/$number"
                          params={{ number: String(r.issue) }}
                          className="font-medium hover:underline"
                        >
                          {r.title}
                        </Link>
                      ) : (
                        r.title
                      )
                    }
                    actor={r.agent.slug}
                    artefacts={
                      <>
                        {r.branch && (
                          <FootprintArtefact icon={<GitBranch />}>{r.branch}</FootprintArtefact>
                        )}
                        {r.files > 0 && (
                          <FootprintArtefact icon={<FileDiff />} title={S.filesTouched(r.files)}>
                            {`${r.files}f +${r.added} −${r.removed}`}
                          </FootprintArtefact>
                        )}
                      </>
                    }
                    costUsd={r.costUsd}
                    time={relativeTime(r.startedAt, ar)}
                  />
                ))}
              </Footprint>
            )}
          </Section>

          {/* ---------- Governors: money, then failures ---------- */}
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
            <Section title={S.spendTitle}>
              <div className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-card p-4">
                <BudgetMeter
                  spentUsd={money.spent}
                  budgetUsd={money.ceiling}
                  label={S.fleetSpend}
                  hint={money.ceiling > 0 ? S.spendHint(money.capped) : S.spendNoCeiling}
                />
                {money.top.length > 0 && (
                  <div className="flex min-w-0 flex-col gap-3 border-t border-border pt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {S.biggest}
                    </span>
                    {money.top.map((a) => (
                      <BudgetMeter
                        key={a.slug}
                        spentUsd={a.spendUsd}
                        budgetUsd={a.maxBudgetUsd}
                        label={a.displayName}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Section>

            <Section title={S.failTitle} count={stuck.length + badRuns}>
              {stuck.length === 0 && badRuns === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<TriangleAlert />}
                  title={S.failCleanTitle}
                  description={S.failCleanDesc}
                />
              ) : (
                <div className="flex min-w-0 flex-col gap-2">
                  {badRuns > 0 && (
                    <DotLabel tone="danger" className="px-1">
                      {S.failedRuns(badRuns)}
                    </DotLabel>
                  )}
                  {stuck.length > 0 && (
                    <Rows>
                      {stuck.map((c) => (
                        <Row
                          key={c.id}
                          danger={c.attempts >= 3}
                          leading={<MonoBadge>#{c.number}</MonoBadge>}
                          trailing={
                            TRANSITIONS[c.status]?.includes("ready") ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setRequeue(c)}
                                title={S.requeue}
                                aria-label={S.requeue}
                              >
                                <RotateCcw aria-hidden="true" className="size-3.5" />
                              </Button>
                            ) : undefined
                          }
                        >
                          <RowTitle>
                            <Link
                              to="/issues/$number"
                              params={{ number: String(c.number) }}
                              className="text-sm font-medium hover:underline"
                            >
                              {c.title}
                            </Link>
                          </RowTitle>
                          <RowMeta>
                            <DotLabel tone={c.attempts >= 3 ? "danger" : "warning"}>
                              {S.attempts(c.attempts)}
                            </DotLabel>
                            {c.assignee && (
                              <span dir="ltr" className="font-mono">
                                {c.assignee}
                              </span>
                            )}
                          </RowMeta>
                        </Row>
                      ))}
                    </Rows>
                  )}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}

      <ConfirmAction
        open={requeue !== null}
        onOpenChange={(o) => !o && setRequeue(null)}
        tone="primary"
        title={S.requeueTitle}
        description={
          <>
            {S.requeueLead}
            <bdi dir="ltr">#{requeue?.number ?? ""}</bdi>
            {S.requeueTail}
          </>
        }
        consequences={S.requeueConsequences}
        confirmLabel={S.requeueConfirm}
        onConfirm={handleRequeue}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting-on-a-human row                                              */
/* ------------------------------------------------------------------ */

/**
 * One thing that cannot move without a person.
 *
 * Four sources, one shape, in the order an operator should clear them: an
 * agent that asked a question outranks an issue sitting in review, because the
 * first one has a session stopped mid-work and burning nothing while it waits.
 */
const NeedItem = ({ need, ar }: { need: Need; ar: boolean }) => {
  const { S } = useHomeStrings();

  if (need.kind === "decision") {
    const d = need.decision;
    return (
      <Row
        danger={d.urgency === "high" || d.urgency === "critical"}
        leading={<ShieldQuestion aria-hidden="true" className="size-4 text-warning" />}
        trailing={
          <Link
            to="/issues/$number"
            params={{ number: String(d.issueNumber) }}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {S.answer}
          </Link>
        }
      >
        <RowTitle>
          <span className="text-sm font-medium">{d.question || d.issueTitle}</span>
        </RowTitle>
        <RowMeta>
          <span dir="ltr" className="font-mono">
            {d.agentSlug}
          </span>
          <span>
            {S.asked}
            <bdi dir="ltr">{relativeTime(d.askedAt, ar)}</bdi>
          </span>
        </RowMeta>
      </Row>
    );
  }

  if (need.kind === "stopped") {
    const a = need.agent;
    return (
      <Row
        leading={<ShieldQuestion aria-hidden="true" className="size-4 text-warning" />}
        trailing={
          <Link
            to="/agents/$slug"
            params={{ slug: a.slug }}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {S.open}
          </Link>
        }
      >
        <RowTitle>
          <span className="text-sm font-medium">{a.displayName}</span>
          <DotLabel tone="warning">{S.tagStopped}</DotLabel>
        </RowTitle>
        <RowMeta>
          <span>{S.stoppedDesc}</span>
        </RowMeta>
      </Row>
    );
  }

  const c = need.card;
  const tone = need.kind === "blocked" ? "danger" : need.kind === "human" ? "info" : "warning";
  const tag =
    need.kind === "blocked" ? S.tagBlocked : need.kind === "human" ? S.tagHumanOnly : S.tagReview;

  return (
    <Row
      leading={<MonoBadge>#{c.number}</MonoBadge>}
      trailing={
        <Link
          to="/issues/$number"
          params={{ number: String(c.number) }}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {S.open}
        </Link>
      }
    >
      <RowTitle>
        <Link
          to="/issues/$number"
          params={{ number: String(c.number) }}
          className="text-sm font-medium hover:underline"
        >
          {c.title}
        </Link>
      </RowTitle>
      <RowMeta>
        <DotLabel tone={tone}>{tag}</DotLabel>
        {c.assignee && (
          <span dir="ltr" className="font-mono">
            {c.assignee}
          </span>
        )}
        <span>
          <bdi dir="ltr">{relativeTime(c.createdAt, ar)}</bdi>
        </span>
      </RowMeta>
    </Row>
  );
};
NeedItem.displayName = "NeedItem";
