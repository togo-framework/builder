import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  FileDiff,
  GitPullRequest,
  KeyRound,
  Languages,
  LayoutGrid,
  Layers,
  ListChecks,
  MousePointerClick,
  UserCheck,
} from "lucide-react";
import { Button, useT } from "@togo-framework/ui";
import { PageShell, Rows, Section } from "../components/page-shell";
import { EmptyState, type Suggestion } from "../components/ui/empty-state";
import {
  Footprint,
  FootprintArtefact,
  FootprintRow,
  type FootprintStatus,
} from "../components/ui/footprint";
import { API, APP_NAME } from "../lib/api";
import { sessionMe, type Me } from "../lib/auth";
import { useWelcomeStrings } from "../lib/i18n.welcome";

/**
 * welcome — the first screen, treated as a WAYFINDER rather than a landing page.
 *
 * The previous version explained the product in prose: a 60-word hero
 * paragraph, then four "how it works" slabs, then three pillar slabs, then four
 * link cards. Fifteen boxes, all at the same volume, and the actual next action
 * — log in — sat above the fold and then never appeared again. A newcomer had
 * to READ the page to find out what the thing does.
 *
 * This version shows instead of tells, and the substitution is the whole edit:
 *
 *   1. The hero states the promise in one line and one sentence. Everything the
 *      paragraph used to claim is demonstrated below rather than asserted here.
 *   2. "How it works" is rendered as an actual Footprint — the product's own
 *      evidence primitive, the same component the agent's Runs tab uses. A
 *      newcomer does not read that agents leave a checkable trail; they look at
 *      one, with the handles, the files, the diffstat and the spend on it. It
 *      is labelled as an example, because a fabricated trace presented as real
 *      data would poison the one thing this component exists to establish.
 *   3. The last row of that trace is `pending`, not `done`. The single most
 *      important fact about an autonomous fleet — that a human stands between
 *      every change and production — is therefore carried by the SHAPE of a
 *      glyph in a list, which survives being skimmed.
 *   4. One primary action, auth-aware, in one place. The signed-out visitor
 *      gets the four destinations as wayfinder pills on an EmptyState, because
 *      "you have no fleet yet" is an honest empty state and not a failure.
 *
 * Every route the old page linked to is still reachable: /dashboard, /agents,
 * /issues, /vault, /login, /register.
 *
 * Layout note: this page owns NO horizontal geometry. PageShell supplies the
 * gutter, the rail and the start-anchored measure. A local `max-w-* mx-auto`
 * here is exactly what made the h1 jump 120px between routes.
 */

/* ------------------------------------------------------------------ */
/* The example run                                                     */
/* ------------------------------------------------------------------ */

/**
 * The machine half of the trace. These are identical in English and Arabic —
 * an agent handle, a path and a diffstat are machine names in both — so they
 * live here rather than in i18n.welcome, and every one of them is rendered
 * through FootprintArtefact, which carries `dir="ltr"`.
 *
 * Indexes are parallel to `S.steps`, which is a fixed-length tuple so the two
 * cannot drift apart without a type error.
 */
type Beat = {
  status: FootprintStatus;
  /** Agent handle. Rendered LTR + mono by FootprintRow. */
  actor?: string;
  /** Checkable artefacts: [icon, machine value] pairs. */
  artefacts?: { icon: typeof Camera; value: string }[];
  costUsd?: number;
  tokens?: number;
};

const RUN: readonly Beat[] = [
  {
    status: "done",
    artefacts: [
      { icon: Camera, value: "screenshot.png" },
      { icon: MousePointerClick, value: "click-path" },
    ],
  },
  { status: "done", actor: "agent:qa", artefacts: [{ icon: ListChecks, value: "issue #128" }] },
  {
    status: "done",
    actor: "agent:web",
    artefacts: [
      { icon: Layers, value: "web/src/routes/welcome.tsx" },
      { icon: FileDiff, value: "+38 −12" },
    ],
    costUsd: 0.12,
    tokens: 48000,
  },
  {
    status: "done",
    actor: "agent:review",
    artefacts: [{ icon: GitPullRequest, value: "PR #91" }],
  },
  { status: "pending", artefacts: [{ icon: UserCheck, value: "human gate" }] },
];

/* ------------------------------------------------------------------ */
/* Destinations                                                        */
/* ------------------------------------------------------------------ */

type DestKey = "dashboard" | "agents" | "issues" | "vault";

const DESTINATIONS: { key: DestKey; icon: typeof Bot; to: string }[] = [
  { key: "dashboard", icon: LayoutGrid, to: "/dashboard" },
  { key: "agents", icon: Bot, to: "/agents" },
  { key: "issues", icon: ListChecks, to: "/issues" },
  { key: "vault", icon: KeyRound, to: "/vault" },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function Welcome() {
  const { setLanguage } = useT();
  const { S, ar } = useWelcomeStrings();
  const navigate = useNavigate();
  const Arrow = ar ? ArrowLeft : ArrowRight;

  const [health, setHealth] = useState<{ status?: string; togo?: string } | null>(null);
  // undefined = still asking. Distinguished from null so the hand-off slot can
  // hold its height instead of flashing the signed-out state at every visitor.
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
    sessionMe().then(setMe).catch(() => setMe(null));
  }, []);

  const online = health?.status === "ok";

  const label: Record<DestKey, { name: string; desc: string }> = {
    dashboard: { name: S.dashboard, desc: S.dashboardDesc },
    agents: { name: S.agents, desc: S.agentsDesc },
    issues: { name: S.issues, desc: S.issuesDesc },
    vault: { name: S.vault, desc: S.vaultDesc },
  };

  // The wayfinder. Same four destinations as the signed-in list, so the page
  // teaches one map regardless of session state; the router's own guard sends
  // an unauthenticated visitor to /login and back.
  const suggestions: Suggestion[] = DESTINATIONS.map((d) => ({
    label: label[d.key].name,
    title: `${S.opens}${label[d.key].name}`,
    icon: <d.icon aria-hidden="true" />,
    onSelect: () => navigate({ to: d.to }),
  }));

  return (
    <main dir={ar ? "rtl" : "ltr"} className="relative min-h-screen bg-background text-foreground">
      {/* Brand glow. Theme-token driven, so it retints under every preset —
          a hardcoded gradient stays blue under a rose theme, which is how a
          page stops belonging to the product. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96"
      />

      <PageShell>
        {/* Utility row — kept out of the hero's flow so it cannot compete with
            the primary action. A bilingual product whose first screen has no
            way to change language has already failed half its audience. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setLanguage(ar ? "en" : "ar")}
            aria-label={S.switchLang}
            className="motion-hover motion-press inline-flex items-center gap-1.5 rounded-pill border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Languages aria-hidden="true" className="size-3.5" />
            <bdi>{S.otherLang}</bdi>
          </button>
        </div>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="motion-entrance motion-reduce:animate-none flex flex-col items-start gap-4 pt-2 sm:pt-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-primary text-primary-foreground shadow-brand">
              <Layers aria-hidden="true" className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              {/* APP_NAME is a product name — Latin in both languages, and the
                  isolate is what stops it colliding with the Arabic eyebrow. */}
              <bdi dir="ltr" className="truncate text-sm font-semibold text-foreground">
                {APP_NAME}
              </bdi>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {S.eyebrow}
              </span>
            </div>
          </div>

          {/* The measure is wide enough for the whole promise to sit on one
              line on a laptop. At a poster width it broke after "An", which
              splits the subject from its verb and makes a seven-word headline
              read as two fragments. */}
          <h1 className="max-w-[42ch] text-balance text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">

            {S.headline}
          </h1>
          <p className="max-w-[62ch] text-base text-muted-foreground">{S.sub}</p>

          {/* The hand-off. One primary action; every path the old page offered
              is preserved. The undefined branch reserves the row's height so
              the hero does not reflow when /me resolves. */}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {me === undefined ? (
              <span
                aria-label={S.loading}
                className="skeleton-shimmer h-11 w-40 rounded-field"
              />
            ) : me ? (
              <Button asChild size="lg">
                <Link to="/dashboard">
                  {S.ctaDashboard}
                  <Arrow aria-hidden="true" className="ms-2 size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/login">
                    {S.ctaLogin}
                    <Arrow aria-hidden="true" className="ms-2 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/register">{S.ctaRegister}</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        {/* ── The example run ──────────────────────────────────────── */}
        <Section
          title={S.runTitle}
          className="motion-entrance motion-reduce:animate-none [animation-delay:80ms]"
        >
          <p className="-mt-1 text-xs text-muted-foreground">{S.runCaption}</p>
          <Footprint bordered>
            {RUN.map((beat, i) => (
              <FootprintRow
                key={S.steps[i]}
                status={beat.status}
                arabic={ar}
                actor={beat.actor}
                costUsd={beat.costUsd}
                tokens={beat.tokens}
                lead={
                  <span
                    title={S.stepLabel(i + 1)}
                    className="numeric flex size-5 shrink-0 items-center justify-center rounded-pill bg-muted text-[10px] font-semibold text-muted-foreground"
                  >
                    <bdi dir="ltr">{i + 1}</bdi>
                  </span>
                }
                title={<span className="text-foreground">{S.steps[i]}</span>}
                artefacts={beat.artefacts?.map((a) => (
                  <FootprintArtefact key={a.value} icon={<a.icon aria-hidden="true" />}>
                    {a.value}
                  </FootprintArtefact>
                ))}
              />
            ))}
          </Footprint>
        </Section>

        {/* ── Where to start ───────────────────────────────────────── */}
        <Section
          title={S.startTitle}
          className="motion-entrance motion-reduce:animate-none [animation-delay:160ms]"
        >
          {me === undefined ? (
            <div aria-label={S.loading} className="skeleton-shimmer h-44 w-full rounded-card" />
          ) : me ? (
            /* Signed in: the grouped list, one card with hairlines. Links carry
               the row's interactive shell because Rows' own Row is an <article>
               and a destination has to be a real anchor — middle-clickable,
               copyable, announced as a link. */
            <Rows>
              {DESTINATIONS.map((d) => (
                <Link
                  key={d.key}
                  to={d.to}
                  className="motion-hover group flex items-center gap-3 border-s-2 border-s-transparent px-3 py-3 hover:border-s-primary hover:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-field bg-muted text-muted-foreground group-hover:text-primary">
                    <d.icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {label[d.key].name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {label[d.key].desc}
                    </span>
                  </span>
                  <Arrow
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-primary"
                  />
                </Link>
              ))}
            </Rows>
          ) : (
            /* size="sm" is deliberate. At the default size this dashed box
               became the largest object on the page, which tells a first-time
               visitor that the most important thing here is an absence. It is
               a status line with doors on it, so it gets a strip's height. */
            <EmptyState
              size="sm"
              icon={<Bot aria-hidden="true" />}
              title={S.emptyTitle}
              description={S.emptyDesc}
              suggestionsLabel={S.emptyLabel}
              suggestions={suggestions}
            />
          )}
        </Section>

        {/* ── Status ───────────────────────────────────────────────── */}
        {/* pb-20 buys clearance from the SDK feedback launcher, which is fixed
            to the bottom-END corner of the viewport and does NOT mirror under
            RTL — so on an Arabic page it lands on top of the start-aligned
            status line and covers the togo version. */}
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pb-20 pt-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2 rounded-pill ${online ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            {online ? S.apiOnline : S.apiOffline}
          </span>
          {/* A version string is LTR content even on an Arabic page. Without the
              isolate `togo 0.1.11` renders with the number thrown to the wrong
              end of the name. */}
          <bdi dir="ltr" className="numeric font-mono">
            togo {health?.togo ?? "…"}
          </bdi>
          <span>
            {S.poweredBy}
            <bdi dir="ltr">Go</bdi>
          </span>
        </footer>
      </PageShell>
    </main>
  );
}
Welcome.displayName = "Welcome";
