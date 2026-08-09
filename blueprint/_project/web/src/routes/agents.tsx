import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Button, Callout, EmptyState, Input, MarkdownEditor, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge,
} from "@togo-framework/ui";
import { Sparkles, UserPlus, Users } from "lucide-react";
import { agentColor, draftPersona, hireAgent, initials, listAgents, type Agent } from "../lib/agents";
import { Field, FormCard, FormFooter, GridSkeleton, PageShell, Stat, StatRow } from "../components/page-shell";

/** Avatar: the picture if there is one, otherwise initials on the agent's colour. */
const AgentAvatar = ({ a, size = 40 }: { a: Agent; size?: number }) => {
  const color = agentColor(a);
  if (a.avatarUrl) {
    return (
      <img
        src={a.avatarUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
    >
      {initials(a)}
    </span>
  );
};
AgentAvatar.displayName = "AgentAvatar";

/**
 * The status an operator actually cares about, in priority order.
 *
 * "busy" outranks "enabled" because a running agent is the one thing you might
 * need to act on; a disabled agent is inert and can wait.
 */
const statusOf = (a: Agent): { label: string; tone: "success" | "info" | "neutral" | "warning" } => {
  if (a.busy) return { label: a.busyIssue ? `working #${a.busyIssue}` : "working", tone: "success" };
  if (!a.enabled) return { label: "disabled", tone: "neutral" };
  if (!a.hasBrain) return { label: "no brain", tone: "warning" };
  return { label: "idle", tone: "info" };
};

export const Agents = () => {
  // null = not loaded yet. Starting from [] made the first paint claim
  // "No agents yet" to an operator with a full fleet on a slow link.
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [hiring, setHiring] = useState(false);

  const load = () => listAgents().then(setAgents).catch((e) => setErr(String(e.message)));

  useEffect(() => {
    void load();
    // Poll while the page is open: `busy` is live state and a roster that shows
    // a stale "working" is worse than one that shows nothing.
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

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
  const shown = fleet.filter(match);
  const working = fleet.filter((a) => a.busy).length;
  const enabled = fleet.filter((a) => a.enabled).length;
  const covered = new Set(fleet.filter((a) => a.enabled).flatMap((a) => a.areas)).size;

  return (
    <PageShell>
      <PageHeader
        title="Agents"
        icon={<Users className="size-5" />}
        description="The fleet that works your issue board. Only enabled agents can claim work, and an agent only takes issues in an area it owns."
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agents…"
              className="h-9 w-64"
            />
            <Button onClick={() => setHiring(true)}>
              <UserPlus className="me-1.5 size-4" />
              Hire an agent
            </Button>
          </div>
        }
      />

      <StatRow>
        <Stat label="Agents" value={fleet.length} />
        <Stat label="Enabled" value={enabled} tone="info" />
        <Stat label="Working now" value={working} tone={working ? "success" : "muted"} />
        <Stat label="Areas covered" value={covered} />
      </StatRow>

      {err && <Callout kind="warn" title="Could not load the fleet">{err}</Callout>}

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
      ) : shown.length === 0 ? (
        <EmptyState
          title={fleet.length ? "No agents match" : "No agents yet"}
          description={
            fleet.length
              ? "Try a different search."
              : "Run the setup wizard to generate the fleet."
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((a, i) => {
            const st = statusOf(a);
            const color = agentColor(a);
            return (
              <Link
                key={a.slug}
                to="/agents/$slug"
                params={{ slug: a.slug }}
                // Same treatment as the skills catalogue, for the same reason: a
                // grid of near-identical cards is read linearly unless each one
                // carries a mark you recognise before you read it.
                //
                // Staggered entrance, capped at a dozen — past that the stagger
                // stops reading as sequence and starts reading as lag.
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "backwards" }}
                className="group relative flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-xl border
                           border-border bg-card p-4 transition-all duration-200 ease-out
                           hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
                           animate-in fade-in slide-in-from-bottom-2
                           motion-reduce:animate-none motion-reduce:transform-none motion-reduce:transition-none"
              >
                {/* A tint of the agent's own colour. Faint on purpose — a
                    landmark, not decoration. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200
                             group-hover:opacity-100 motion-reduce:transition-none"
                  style={{ background: `radial-gradient(120% 100% at 0% 0%, ${color}14, transparent 60%)` }}
                />
                <div className="flex items-start gap-3">
                  <span className="transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">
                    <AgentAvatar a={a} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium group-hover:underline">
                        {a.displayName || a.slug}
                      </span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.title || a.slug}
                    </p>
                  </div>
                </div>

                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {a.description}
                </p>

                <div className="flex flex-wrap gap-1">
                  {a.areas.slice(0, 5).map((x) => (
                    <span key={x} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {x}
                    </span>
                  ))}
                  {a.areas.length > 5 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{a.areas.length - 5}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{a.model}</span>
                  <span>{a.runs} run{a.runs === 1 ? "" : "s"}</span>
                  <span className="tabular-nums">${a.spendUsd.toFixed(2)}</span>
                  <span className="ms-auto">
                    {a.memories} {a.memories === 1 ? "memory" : "memories"}
                  </span>
                </div>
              </Link>
            );
          })}
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

  async function draft() {
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
  }

  async function submit() {
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
  }

  return (
    <FormCard title="Hire an agent" onClose={onClose}>
      {err && <div className="mb-3"><Callout kind="warn" title="Could not hire">{err}</Callout></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Slug" htmlFor="hire-slug" required
          hint="The permanent machine name — it goes into file paths and cannot change."
        >
          <Input id="hire-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })}
            placeholder="db-engineer" className="font-mono" />
        </Field>
        <Field
          label="Name" htmlFor="hire-name"
          hint="What the dashboard and the board call it."
        >
          <Input id="hire-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })}
            placeholder="DB Engineer" />
        </Field>
        <Field
          label="Areas it owns" htmlFor="hire-areas" required className="sm:col-span-2"
          hint="Comma separated. An agent that owns no area can never claim work."
        >
          <Input id="hire-areas" value={f.areas} onChange={(e) => setF({ ...f, areas: e.target.value })}
            placeholder="db, schema, migration" className="font-mono text-xs" />
        </Field>
        <Field
          label="What it does" htmlFor="hire-desc" className="sm:col-span-2"
          hint="This is what routing reads to decide who owns a report — write it for the router, not for a bio."
        >
          <Input id="hire-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="Owns migrations, schema changes and query performance." />
        </Field>
        <Field
          label="Model" htmlFor="hire-model"
          hint="Haiku is cheap triage, opus is expensive depth — sonnet is the fleet default."
        >
          <Select value={f.model} onValueChange={(v) => setF({ ...f, model: v })}>
            <SelectTrigger id="hire-model" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="haiku">haiku</SelectItem>
              <SelectItem value="sonnet">sonnet</SelectItem>
              <SelectItem value="opus">opus</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Working directory" htmlFor="hire-workdir"
          hint="Where its shell starts. Blank uses the fleet default."
        >
          <Input id="hire-workdir" value={f.workdir} onChange={(e) => setF({ ...f, workdir: e.target.value })}
            placeholder="/absolute/path"
            className="font-mono text-xs" />
        </Field>
      </div>

      {/* The persona IS the system prompt the agent runs with, so it is drafted
          and edited here rather than left as a template to fix later. */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Persona</span>
          <Button
            variant="outline" size="sm"
            onClick={() => void draft()}
            disabled={drafting || !canDraft}
          >
            <Sparkles className="me-1.5 size-3.5" />
            {drafting ? "Drafting…" : persona ? "Draft again" : "Draft with AI"}
          </Button>
          <span className="min-w-0 text-[11px] text-muted-foreground">
            {drafting
              ? "Claude Code is reading the repository. This takes up to a minute."
              : draftCost !== null
                ? `Drafted for $${draftCost.toFixed(2)}. Edit anything it got wrong before hiring.`
                : "Optional. Leave it blank and the agent is hired with a starter template."}
          </span>
        </div>

        {draftErr && (
          <div className="mt-2">
            <Callout kind="warn" title="Could not draft a persona">
              {draftErr} You can still hire the agent and write its persona yourself.
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
          !f.slug.trim() ? "Give it a slug first."
            : !f.areas.trim() ? "Give it at least one area — otherwise it can never claim work."
              : "Created with its own brain, disabled — read the persona, then enable it."
        }
      >
        <Button
          onClick={() => void submit()}
          disabled={busy || drafting || !f.slug.trim() || !f.areas.trim()}
        >
          <UserPlus className="me-1.5 size-4" />
          {busy ? "Hiring…" : "Hire"}
        </Button>
      </FormFooter>
    </FormCard>
  );
};
HireForm.displayName = "HireForm";
