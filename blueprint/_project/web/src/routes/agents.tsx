import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Button, Callout, EmptyState, Input, MarkdownEditor, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue,
} from "@togo-framework/ui";
import {
  Brain, Briefcase, Check, Cpu, History, LoaderCircle, RotateCcw, Sparkles, UserPlus, Users,
} from "lucide-react";
import { agentColor, draftPersona, hireAgent, initials, listAgents, saveAgent, type Agent } from "../lib/agents";
import { Field, FormCard, FormFooter, GridSkeleton, PageShell, Stat, StatRow, AppPageHeader as PageHeader } from "../components/page-shell";
import { useStrings } from "../lib/i18n";

/**
 * The agent's mark as a SQUARE app tile, store-style — not the round avatar.
 *
 * Same generator as before (stable colour from the slug, initials on top), just
 * bigger and squared so the grid reads as a catalogue of installable things.
 * `dimmed` is the disabled treatment: greyscale + faded, so a switched-off
 * agent looks switched off before any text is read.
 */
export const AgentTile = ({
  a, className = "size-14 text-lg", dimmed = false,
}: {
  a: Pick<Agent, "slug" | "displayName" | "color" | "avatarUrl">;
  /** Size AND initials font-size travel together (e.g. "size-16 text-xl"). */
  className?: string;
  dimmed?: boolean;
}) => {
  const color = agentColor(a);
  const dim = dimmed ? "opacity-40 grayscale" : "";
  if (a.avatarUrl) {
    return (
      <img
        src={a.avatarUrl}
        alt=""
        className={`shrink-0 rounded-xl object-cover ${dim} ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl font-semibold text-white ${dim} ${className}`}
      // The one non-token colour on the page: the agent's own identity colour,
      // stored data (or derived from the slug), not a style decision.
      style={{ background: color }}
    >
      {initials(a)}
    </span>
  );
};
AgentTile.displayName = "AgentTile";

/**
 * Tag-chip tints, drawn from the theme's semantic tokens rather than a fixed
 * palette so every theme preset retints them — a hardcoded violet stays violet
 * under a rose theme, which is how a page stops belonging to the product.
 * `destructive` is deliberately absent: an area chip is a label, never an
 * alarm, and a red chip on a healthy agent reads as a fault.
 */
const CHIP_TONE = [
  "bg-primary/10 text-primary",
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-warning/10 text-warning",
] as const;

/** Stable tint per area name, so "db" is the same colour on every card. */
const chipTone = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CHIP_TONE[h % CHIP_TONE.length];
};

/** How many area chips fit before the row starts wrapping past its worth. */
const CHIPS_SHOWN = 3;

/**
 * One agent as a STORE card, in the reference's shape:
 *
 *   [tile] [Bold Name] ......................... [Enable / Disable]
 *          small muted line — its title, or what it is working on
 *   description, one or two lines, muted
 *   [db] [schema] [+2 more]                 ← coloured chips, explicit overflow
 *   [glyph] role  [glyph] model  [glyph] runs  [dot] Disabled
 *
 * The primary action is a BUTTON pinned to the trailing edge of the title row,
 * the same slot on every card. A Switch used to sit here; a switch is a
 * settings control, and in a catalogue the operator is deciding whether to put
 * an agent to work, not adjusting a preference.
 *
 * Because the button now reads "Enable" on a disabled agent — the inverse of
 * its state — the state is carried separately by a coloured dot in the meta row
 * and the greyed tile. State is a glyph, never a coloured word.
 */
const AgentCard = ({
  a, onToggle,
}: {
  a: Agent;
  onToggle: (slug: string, enabled: boolean) => void;
}) => {
  const { S } = useStrings();
  const off = !a.enabled;
  const name = a.displayName || a.slug;
  const extra = a.areas.length - CHIPS_SHOWN;

  const handleToggle = () => onToggle(a.slug, off);

  return (
    <div
      className="relative flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-5
                 transition-colors hover:border-primary/50 hover:bg-muted/30
                 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary"
    >
      <div className="flex items-start gap-3">
        <AgentTile a={a} className="size-11 text-base" dimmed={off} />

        <div className="min-w-0 flex-1">
          {/* Name and action share one line, centred on each other, so the
              button lands at the same y on every card in the grid. */}
          <div className="flex items-center gap-3">
            <Link
              to="/agents/$slug"
              params={{ slug: a.slug }}
              // The stretched overlay: the card is the click target, the link
              // is the semantics. The button is a sibling raised above this
              // overlay, so pressing it is never also a navigation.
              className="min-w-0 flex-1 focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              <span
                className={`block truncate text-sm font-semibold ${off ? "text-muted-foreground" : "text-foreground"}`}
              >
                <bdi>{name}</bdi>
              </span>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              className="relative z-10 h-7 shrink-0 px-2.5 text-xs"
              aria-label={a.enabled ? S.agents.disableAria(name) : S.agents.enableAria(name)}
            >
              {a.enabled ? S.agents.disable : S.agents.enable}
            </Button>
          </div>

          {/* The quiet second line. A live run displaces it, because "working
              on #42" is the only fact on this card that changes by the minute
              and it must not be buried in the footer. */}
          {a.busy ? (
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
              {a.busyIssue ? S.agents.workingOn(a.busyIssue) : S.agents.working}
            </span>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <bdi>{a.title || a.slug}</bdi>
            </p>
          )}
        </div>
      </div>

      {/* min-h-[2lh] reserves two lines whether the text fills them or not, so
          short descriptions cannot ragged-edge the grid. */}
      {/* <bdi> around the description, not just the machine text. Personas are
          authored in English while the UI may be Arabic; without the isolate
          the sentence's final full stop is a neutral that inherits the RTL
          paragraph and jumps to the far edge, so every card reads ".Use for
          the autonomous run loop…". bdi detects direction, it does not force
          it, so a genuinely Arabic description still sets right-to-left. */}
      <p
        className={`mt-3 line-clamp-2 min-h-[2lh] text-xs leading-relaxed text-muted-foreground ${off ? "opacity-60" : ""}`}
      >
        <bdi>{a.description || S.agents.noDescription}</bdi>
      </p>

      {/* Areas as coloured chips with an EXPLICIT overflow count. A silently
          truncated list makes an agent look narrower than it is, and routing
          reads every one of these — the operator needs to know more exist. */}
      {a.areas.length > 0 && (
        <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${off ? "opacity-60" : ""}`}>
          {a.areas.slice(0, CHIPS_SHOWN).map((area) => (
            <span
              key={area}
              className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${chipTone(area)}`}
            >
              <bdi>{area}</bdi>
            </span>
          ))}
          {extra > 0 && (
            <span
              className="rounded-pill border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              title={a.areas.slice(CHIPS_SHOWN).join(", ")}
            >
              {S.agents.moreCount(extra)}
            </span>
          )}
        </div>
      )}

      {/* The quiet row: no divider above it, no separators inside it —
          whitespace groups, and pipes between five facts are more ink than
          information at 11px. Items appear only when they are true. */}
      <div
        className={`mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-4
                    text-[11px] leading-4 text-muted-foreground ${off ? "opacity-70" : ""}`}
      >
        {a.role && a.role !== a.title && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Briefcase className="size-3 shrink-0" />
            <span className="truncate">{a.role}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Cpu className="size-3 shrink-0" />
          <bdi className="font-mono">{a.model}</bdi>
        </span>
        {a.runs > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <History className="size-3 shrink-0" />
            {S.agents.runsCount(a.runs)}
          </span>
        )}
        {a.memories > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Brain className="size-3 shrink-0" />
            {S.agents.memoriesCount(a.memories)}
          </span>
        )}
        {off && (
          <span className="inline-flex items-center gap-1 text-warning">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
            {S.agents.disabledMeta}
          </span>
        )}
      </div>
    </div>
  );
};
AgentCard.displayName = "AgentCard";

/**
 * One row of a facet list: `[check] Label ......... count`.
 *
 * The leader dots are a flex filler, not a string of periods, so they stretch
 * to whatever the label leaves and read identically right-to-left. The check
 * occupies its slot even when unselected — otherwise every label shifts
 * sideways the moment a facet is chosen, and the list appears to jump.
 */
const FacetRow = ({
  label, count, active, onClick, mono = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  /** For machine values (an area token, a model name). */
  mono?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-xs
                transition-colors hover:bg-muted/60 ${active ? "text-foreground" : "text-muted-foreground"}`}
  >
    <Check
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${active ? "text-primary opacity-100" : "opacity-0"}`}
    />
    <span className={`min-w-0 truncate ${active ? "font-medium" : ""} ${mono ? "font-mono" : ""}`}>
      <bdi>{label}</bdi>
    </span>
    <span
      aria-hidden="true"
      className="h-px min-w-3 flex-1 border-b border-dotted border-border"
    />
    <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
  </button>
);
FacetRow.displayName = "FacetRow";

/** A facet group: small-caps heading, then its rows. */
const Facet = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <h2 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h2>
    {children}
  </div>
);
Facet.displayName = "Facet";

/** Facet state. "" always means "no filter", never a real value. */
type Status = "" | "enabled" | "disabled" | "working";

/** How many area rows the rail lists before deferring to the dropdown. */
const AREAS_SHOWN = 12;

export const Agents = () => {
  const { S } = useStrings();
  // null = not loaded yet. Starting from [] made the first paint claim
  // "No agents yet" to an operator with a full fleet on a slow link.
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [hiring, setHiring] = useState(false);

  const load = () => listAgents().then(setAgents).catch((e) => setErr(String(e.message)));

  useEffect(() => {
    void load();
    // Poll while the page is open: `busy` is live state and a roster that shows
    // a stale "working" is worse than one that shows nothing.
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  // Optimistic: the switch must answer instantly or it reads as broken. The
  // reload (and the 5s poll) is what makes the server's truth win.
  const handleToggle = (slug: string, enabled: boolean) => {
    setAgents((prev) => (prev ? prev.map((a) => (a.slug === slug ? { ...a, enabled } : a)) : prev));
    saveAgent(slug, { enabled })
      .catch((e) => setErr(String((e as Error).message)))
      .finally(() => void load());
  };

  const match = (a: Agent) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      a.slug.toLowerCase().includes(s) ||
      a.displayName.toLowerCase().includes(s) ||
      a.areas.some((x) => x.includes(s))
    );
  };

  const fleet = agents ?? [];
  // Facet counts are computed AFTER search but BEFORE the facets themselves,
  // so a count never contradicts what clicking it would show, and choosing one
  // area does not collapse every other area's count to zero.
  const searched = fleet.filter(match);

  const areaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of searched) for (const x of a.areas) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [searched]);

  const models = useMemo(
    () => [...new Set(searched.map((a) => a.model).filter(Boolean))].sort(),
    [searched],
  );

  const statusCounts = {
    enabled: searched.filter((a) => a.enabled).length,
    disabled: searched.filter((a) => !a.enabled).length,
    working: searched.filter((a) => a.busy).length,
  };

  const shown = searched.filter(
    (a) =>
      (!area || a.areas.includes(area)) &&
      (!model || a.model === model) &&
      (status === "" ||
        (status === "enabled" && a.enabled) ||
        (status === "disabled" && !a.enabled) ||
        (status === "working" && a.busy)),
  );

  const filtered = Boolean(area || model || status);
  const handleReset = () => {
    setArea("");
    setModel("");
    setStatus("");
  };
  // Clicking an active facet row clears it — the row is the on/off control, so
  // an operator is never stranded with no way back to the whole fleet.
  const pick = <T,>(cur: T, next: T, set: (v: T) => void, none: T) =>
    set(cur === next ? none : next);

  const working = fleet.filter((a) => a.busy).length;
  const enabled = fleet.filter((a) => a.enabled).length;
  const covered = new Set(fleet.filter((a) => a.enabled).flatMap((a) => a.areas)).size;

  return (
    <PageShell>
      <PageHeader
        title={S.agents.title}
        icon={<Users className="size-5" />}
        description={S.agents.desc}
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={S.agents.search}
              className="h-9 w-64"
            />
            <Button onClick={() => setHiring(true)}>
              <UserPlus className="me-1.5 size-4" />
              {S.agents.hire}
            </Button>
          </div>
        }
      />

      <StatRow>
        <Stat label={S.agents.statAgents} value={fleet.length} />
        <Stat label={S.agents.statEnabled} value={enabled} tone="info" />
        <Stat label={S.agents.statWorking} value={working} tone={working ? "success" : "muted"} />
        <Stat label={S.agents.statAreas} value={covered} />
      </StatRow>

      {err && <Callout kind="warn" title={S.agents.loadErr}>{err}</Callout>}

      {hiring && (
        <HireForm
          onClose={() => setHiring(false)}
          onHired={() => {
            setHiring(false);
            void load();
          }}
        />
      )}

      {agents === null ? (
        <GridSkeleton count={6} />
      ) : fleet.length === 0 ? (
        <EmptyState title={S.agents.emptyTitle} description={S.agents.emptyDesc} />
      ) : (
        // Facets at the start edge, catalogue after. The sidebar collapses away
        // under lg: on a narrow screen a 13rem rail costs more than it earns,
        // and the sentence bar already carries area and model.
        <div className="grid min-w-0 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden min-w-0 flex-col gap-5 lg:flex">
            <Facet title={S.agents.facetAreas}>
              {areaCounts.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">{S.agents.noAreasFacet}</p>
              ) : (
                <>
                  {areaCounts.slice(0, AREAS_SHOWN).map(([name, n]) => (
                    <FacetRow
                      key={name}
                      label={name}
                      count={n}
                      mono
                      active={area === name}
                      onClick={() => pick(area, name, setArea, "")}
                    />
                  ))}
                  {/* The cap is explicit, never silent. A fleet can own forty
                      areas and a rail that quietly stopped at twelve would make
                      the other twenty-eight look like they do not exist — the
                      sentence's area dropdown carries the complete list. */}
                  {areaCounts.length > AREAS_SHOWN && (
                    <p className="px-2 pt-1 text-[11px] text-muted-foreground">
                      {S.agents.moreCount(areaCounts.length - AREAS_SHOWN)}
                    </p>
                  )}
                </>
              )}
            </Facet>

            {/* Kept even at zero — an empty count is an answer ("nobody is
                working"), and a row that vanishes makes the list jump. */}
            <Facet title={S.agents.facetStatus}>
              <FacetRow
                label={S.agents.statusEnabled} count={statusCounts.enabled}
                active={status === "enabled"}
                onClick={() => pick<Status>(status, "enabled", setStatus, "")}
              />
              <FacetRow
                label={S.agents.statusDisabled} count={statusCounts.disabled}
                active={status === "disabled"}
                onClick={() => pick<Status>(status, "disabled", setStatus, "")}
              />
              <FacetRow
                label={S.agents.statusWorking} count={statusCounts.working}
                active={status === "working"}
                onClick={() => pick<Status>(status, "working", setStatus, "")}
              />
            </Facet>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            {/* The filter bar reads as a SENTENCE. Dropdowns inline in running
                text state what the grid below is, rather than making the
                operator assemble that meaning from three loose controls. The
                slot order is logical, so Arabic reads correctly right-to-left
                without a single directional override. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{shown.length}</span>
              <span>{S.agents.sentenceAgents(shown.length)}</span>
              <span>{S.agents.sentenceIn}</span>
              <Select value={area || "all"} onValueChange={(v) => setArea(v === "all" ? "" : v)}>
                <SelectTrigger
                  className="h-8 w-auto gap-1.5 border-dashed px-2.5 text-xs"
                  aria-label={S.agents.facetAreas}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{S.agents.allAreas}</SelectItem>
                  {areaCounts.map(([name]) => (
                    <SelectItem key={name} value={name} className="font-mono">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{S.agents.sentenceRunning}</span>
              <Select value={model || "all"} onValueChange={(v) => setModel(v === "all" ? "" : v)}>
                <SelectTrigger
                  className="h-8 w-auto gap-1.5 border-dashed px-2.5 text-xs"
                  aria-label={S.agents.allModels}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{S.agents.allModels}</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!filtered}
                className="ms-auto h-8 px-2.5 text-xs"
              >
                <RotateCcw className="me-1.5 size-3.5" />
                {S.agents.reset}
              </Button>
            </div>

            {shown.length === 0 ? (
              <EmptyState title={S.agents.noMatchTitle} description={S.agents.noMatchDesc} />
            ) : (
              // Two columns, generous cards, hairline borders — a store grid,
              // not a dashboard. auto-rows-fr + h-full keep every row level.
              <div className="grid auto-rows-fr gap-5 sm:grid-cols-2">
                {shown.map((a, i) => (
                  <div
                    key={a.slug}
                    // Staggered entrance, capped at a dozen — past that the
                    // stagger stops reading as sequence and starts as lag.
                    className="h-full min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "backwards" }}
                  >
                    <AgentCard a={a} onToggle={handleToggle} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
};
Agents.displayName = "Agents";

/**
 * The hire form.
 *
 * Areas are required and the copy says why: an agent that owns nothing can never
 * claim work, and a fleet full of idle specialists is the failure mode this
 * whole surface exists to prevent.
 */
const HireForm = ({ onClose, onHired }: { onClose: () => void; onHired: () => void }) => {
  const { S } = useStrings();
  const [f, setF] = useState({
    slug: "", displayName: "", title: "", description: "",
    model: "sonnet", areas: "", workdir: "",
  });
  const [persona, setPersona] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState("");
  const [draftCost, setDraftCost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fields = () => ({
    slug: f.slug.trim(),
    displayName: f.displayName.trim() || undefined,
    title: f.title.trim() || undefined,
    description: f.description.trim() || undefined,
    model: f.model,
    areas: f.areas.split(",").map((x) => x.trim()).filter(Boolean),
    workdir: f.workdir.trim() || undefined,
  });

  // Drafting needs something to draft from — the server rejects a bare slug,
  // and it is a better answer to grey the button out than to spend a session
  // producing advice that would fit any project.
  const canDraft = Boolean(f.slug.trim()) && Boolean(f.areas.trim() || f.description.trim());

  const handleDraft = async () => {
    setDrafting(true);
    setDraftErr("");
    try {
      const d = await draftPersona(fields());
      setPersona(d.persona);
      setDraftCost(d.costUsd);
    } catch (e) {
      setDraftErr(String((e as Error).message));
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setErr("");
    try {
      await hireAgent({
        ...fields(),
        // Blank means the server writes its starter template, so hiring never
        // depends on the drafting session having worked.
        persona: persona.trim() || undefined,
        // Hired disabled on purpose: the operator reads the persona and turns
        // it on, rather than a half-described agent immediately claiming work.
        enabled: false,
      });
      onHired();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title={S.agents.hire} onClose={onClose} closeLabel={S.common.cancel}>
      {err && <div className="mb-3"><Callout kind="warn" title={S.agents.hireErrTitle}>{err}</Callout></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={S.agents.slugLabel} htmlFor="hire-slug" required hint={S.agents.slugHint}>
          <Input id="hire-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })}
            placeholder="db-engineer" dir="ltr" className="font-mono" />
        </Field>
        <Field label={S.agents.nameLabel} htmlFor="hire-name" hint={S.agents.nameHint}>
          <Input id="hire-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })}
            placeholder="DB Engineer" />
        </Field>
        <Field
          label={S.agents.areasLabel} htmlFor="hire-areas" required className="sm:col-span-2"
          hint={S.agents.areasHint}
        >
          <Input id="hire-areas" value={f.areas} onChange={(e) => setF({ ...f, areas: e.target.value })}
            placeholder="db, schema, migration" dir="ltr" className="font-mono text-xs" />
        </Field>
        <Field label={S.agents.whatLabel} htmlFor="hire-desc" className="sm:col-span-2" hint={S.agents.whatHint}>
          <Input id="hire-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="Owns migrations, schema changes and query performance." />
        </Field>
        <Field label={S.agents.modelLabel} htmlFor="hire-model" hint={S.agents.modelHint}>
          <Select value={f.model} onValueChange={(v) => setF({ ...f, model: v })}>
            <SelectTrigger id="hire-model" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="haiku">haiku</SelectItem>
              <SelectItem value="sonnet">sonnet</SelectItem>
              <SelectItem value="opus">opus</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.agents.workdirLabel} htmlFor="hire-workdir" hint={S.agents.workdirHint}>
          <Input id="hire-workdir" value={f.workdir} onChange={(e) => setF({ ...f, workdir: e.target.value })}
            placeholder="/absolute/path" dir="ltr" className="font-mono text-xs" />
        </Field>
      </div>

      {/* The persona IS the system prompt the agent runs with, so it is drafted
          and edited here rather than left as a template to fix later. */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{S.agents.personaLabel}</span>
          <Button
            variant="outline" size="sm"
            onClick={() => void handleDraft()}
            disabled={drafting || !canDraft}
          >
            <Sparkles className="me-1.5 size-3.5" />
            {drafting ? S.agents.drafting : persona ? S.agents.draftAgain : S.agents.draftAI}
          </Button>
          <span className="min-w-0 text-[11px] text-muted-foreground">
            {drafting
              ? S.agents.draftingNote
              : draftCost !== null
                ? S.agents.draftedFor(`$${draftCost.toFixed(2)}`)
                : S.agents.draftOptional}
          </span>
        </div>

        {draftErr && (
          <div className="mt-2">
            <Callout kind="warn" title={S.agents.draftErrTitle}>
              {draftErr} {S.agents.draftErrNote}
            </Callout>
          </div>
        )}

        {(persona || draftErr) && (
          <div className="mt-3">
            <MarkdownEditor
              value={persona}
              onChange={setPersona}
              defaultView="write"
              minRows={14}
              placeholder="# Role&#10;&#10;What this agent owns, how it works, what it must not touch."
            />
          </div>
        )}
      </div>

      <FormFooter
        note={
          !f.slug.trim() ? S.agents.noteSlugFirst
            : !f.areas.trim() ? S.agents.noteAreasFirst
              : S.agents.noteReady
        }
      >
        <Button
          onClick={() => void handleSubmit()}
          disabled={busy || drafting || !f.slug.trim() || !f.areas.trim()}
        >
          <UserPlus className="me-1.5 size-4" />
          {busy ? S.agents.hiring : S.agents.hireCta}
        </Button>
      </FormFooter>
    </FormCard>
  );
};
HireForm.displayName = "HireForm";
