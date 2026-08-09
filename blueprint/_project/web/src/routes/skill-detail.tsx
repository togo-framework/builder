import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger, Button, Callout, Checkbox, EmptyState, Input, Label,
  MarkdownEditor, StatusBadge,
} from "@togo-framework/ui";
import { ArrowLeft, Trash2, Wand2 } from "lucide-react";
import { Stat, StatRow } from "../components/page-shell";
import {
  SOURCE_LABEL, SOURCE_TONE, assignSkill, deleteSkill, fetchSkill,
  fetchSkillActivity, regenerateSkill, saveSkill, unassignSkill,
  type Skill, type SkillAgent, type SkillUse,
} from "../lib/skills";
import { SkillMark } from "../components/skill-mark";

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const RUN_TONE: Record<string, "success" | "danger" | "warning" | "info" | "neutral"> = {
  succeeded: "success",
  failed: "danger",
  needs_input: "warning",
  running: "info",
};

const PAGE = 50;

/**
 * One skill, at its own address.
 *
 * This was a panel that expanded underneath the catalogue grid. With twenty-nine
 * tiles above it the panel opened below the fold, so clicking a tile appeared to
 * do nothing at all — the detail was rendering correctly and nobody could tell.
 * A skill now has a URL, which also makes it linkable from the agent that loads
 * it.
 */
export const SkillDetail = () => {
  const { name } = useParams({ from: "/_app/skills/$name" });

  const [skill, setSkill] = useState<Skill | null>(null);
  const [agents, setAgents] = useState<SkillAgent[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const [uses, setUses] = useState<SkillUse[]>([]);
  const [useTotal, setUseTotal] = useState(0);
  const [useAgents, setUseAgents] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const load = () =>
    fetchSkill(name)
      .then((d) => {
        setSkill(d.skill);
        setAgents(d.agents);
        setTitle(d.skill.title);
        setDescription(d.skill.description);
        setBody(d.skill.bodyMd ?? "");
        setErr("");
      })
      .catch((e: Error) => setErr(e.message));

  useEffect(() => {
    // Clear the previous skill's state first. Without this, navigating between
    // two skills shows the old document under the new name until the fetch
    // lands, and a stale error banner outlives the failure that caused it.
    setSkill(null);
    setErr("");
    setSaved("");
    setUses([]);
    setUseTotal(0);
    void load();
    void fetchSkillActivity(name, 0, PAGE)
      .then((a) => {
        setUses(a.uses);
        setUseTotal(a.total);
        setUseAgents(a.agents);
      })
      .catch(() => {
        // The activity log is supplementary. A failure here must not replace a
        // perfectly readable skill with an error page.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Infinite scroll over the usage log.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || uses.length >= useTotal || moreBusy) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setMoreBusy(true);
      fetchSkillActivity(name, uses.length, PAGE)
        .then((a) => setUses((prev) => [...prev, ...a.uses]))
        .catch(() => undefined)
        .finally(() => setMoreBusy(false));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [name, uses.length, useTotal, moreBusy]);

  const dirty =
    !!skill &&
    (title !== skill.title || description !== skill.description || body !== (skill.bodyMd ?? ""));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await saveSkill(name, { title, description, bodyMd: body });
      setSaved("Saved, and written to disk");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setRegenBusy(true);
    setErr("");
    setSaved("");
    try {
      const r = await regenerateSkill(name);
      await load();
      setSaved(
        `Rewritten — ${r.words} words, $${r.costUsd.toFixed(2)}` +
          (r.grounded ? "" : " (no repository was available, so it is generic)"),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRegenBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    setErr("");
    try {
      await saveSkill(name, { enabled });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function toggleAgent(slug: string, has: boolean) {
    setErr("");
    // Optimistic: the checkbox has to answer immediately or it reads as broken.
    // load() below is what makes the real state win.
    setAgents((prev) => prev.map((a) => (a.slug === slug ? { ...a, has } : a)));
    try {
      await (has ? assignSkill(name, slug) : unassignSkill(name, slug));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      await load();
    }
  }

  async function remove() {
    setErr("");
    try {
      await deleteSkill(name);
      window.location.href = "/skills";
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const back = (
    <Link
      to="/skills"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      All skills
    </Link>
  );

  if (!skill) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4">
        {back}
        {err ? (
          <Callout kind="warn" title="Could not open this skill">
            {err}
          </Callout>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  const holders = agents.filter((a) => a.has).length;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      {back}

      <div className="flex min-w-0 items-center gap-3">
        <SkillMark skill={skill} className="size-11" />
        <div className="min-w-0">
          <h1 className="truncate font-mono text-lg font-semibold">{skill.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {skill.title || "No title yet"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={SOURCE_TONE[skill.source] ?? "neutral"}>
          {SOURCE_LABEL[skill.source] ?? skill.source}
        </StatusBadge>
        {!skill.enabled && <StatusBadge tone="warning">disabled</StatusBadge>}
        {skill.sourceRef && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {skill.sourceRef}
          </span>
        )}
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {skill.installedPath || "not written to disk yet"}
        </span>
      </div>

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

      <StatRow cols={3}>
        <Stat label="Agents holding it" value={holders} tone={holders ? "success" : "warning"} />
        <Stat label="Times loaded" value={useTotal} tone={useTotal ? "default" : "muted"} />
        <Stat label="Agents that ran it" value={useAgents} tone="muted" />
      </StatRow>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="edit-title" className="mb-1 block text-xs text-muted-foreground">
            Title
          </Label>
          <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="edit-desc" className="mb-1 block text-xs text-muted-foreground">
            When an agent should reach for it
          </Label>
          <Input
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Instructions</Label>
        <MarkdownEditor value={body} onChange={setBody} defaultView="write" minRows={18} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={busy || !dirty || !body.trim()}>
            {busy ? "Saving…" : "Save skill"}
          </Button>
          {/* Offered next to Save because the two are alternatives: write the
              procedure yourself, or have it read the repository and write one.
              Disabled while the editor is dirty — regenerating would discard
              unsaved edits with no warning. */}
          <Button
            variant="outline"
            onClick={() => void regenerate()}
            disabled={regenBusy || busy || dirty}
            title={
              dirty
                ? "Save or discard your edits first — regenerating replaces the whole body"
                : "Read the repository and rewrite this skill as a full procedure"
            }
          >
            <Wand2 className="me-1.5 size-4" />
            {regenBusy ? "Reading the repo…" : "Regenerate"}
          </Button>
          {regenBusy && (
            <span className="text-xs text-muted-foreground">
              This runs a real Claude Code session — usually two or three minutes.
            </span>
          )}
          {dirty && (
            <Button
              variant="outline"
              onClick={() => {
                setTitle(skill.title);
                setDescription(skill.description);
                setBody(skill.bodyMd ?? "");
              }}
            >
              Discard
            </Button>
          )}
          {saved && !dirty && <span className="text-xs text-success">{saved}</span>}
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agents using this skill — {holders} of {agents.length}
        </h3>
        {agents.length === 0 ? (
          <EmptyState title="No agents yet" description="Hire an agent before assigning skills." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <div
                key={a.slug}
                className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border p-2.5"
              >
                <Checkbox
                  id={`assign-${a.slug}`}
                  checked={a.has}
                  onCheckedChange={(v) => void toggleAgent(a.slug, v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={`assign-${a.slug}`} className="min-w-0 flex-1 cursor-pointer font-normal">
                  <span className="block truncate text-sm font-medium">
                    {a.displayName || a.slug}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    @{a.slug}
                    {!a.enabled && " · disabled"}
                  </span>
                </Label>
                {/* Straight through to the agent — the assignment picker is the
                    natural place to ask "who is this?". */}
                <Link
                  to="/agents/$slug"
                  params={{ slug: a.slug }}
                  className="shrink-0 self-center text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h3>
        {/* Stated plainly, because the distinction matters and the number would
            otherwise be read as a count of times the agent chose this skill. */}
        <p className="mb-2 text-xs text-muted-foreground">
          Every run that carried this skill in its context. Claude Code reports a
          run's result, not its individual tool calls, so this records that the
          skill was loaded — not that the agent reached for it.
        </p>
        {uses.length === 0 ? (
          <EmptyState
            title="Not loaded yet"
            description={
              holders === 0
                ? "No agent holds this skill, so no run has ever carried it. Assign it above."
                : "It is assigned, but no run has started since. The log fills as agents work."
            }
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {uses.map((u, i) => (
              <div
                key={`${u.runId}-${i}`}
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <Link
                  to="/agents/$slug"
                  params={{ slug: u.agent }}
                  className="font-mono font-medium hover:underline"
                >
                  @{u.agent}
                </Link>
                {u.issueNumber > 0 && (
                  <Link
                    to="/issues/$number"
                    params={{ number: String(u.issueNumber) }}
                    className="min-w-0 truncate text-muted-foreground hover:text-foreground hover:underline"
                  >
                    #{u.issueNumber} {u.issueTitle}
                  </Link>
                )}
                {u.runStatus && (
                  <StatusBadge tone={RUN_TONE[u.runStatus] ?? "neutral"}>
                    {u.runStatus.replace(/_/g, " ")}
                  </StatusBadge>
                )}
                <span className="ms-auto shrink-0 text-muted-foreground">{ago(u.loadedAt)}</span>
              </div>
            ))}
            <div ref={sentinel} className="h-4" />
            {moreBusy && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
            {uses.length >= useTotal && useTotal > PAGE && (
              <p className="text-center text-xs text-muted-foreground">
                All {useTotal} shown.
              </p>
            )}
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="skill-enabled"
            checked={skill.enabled}
            onCheckedChange={(v) => void toggleEnabled(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="skill-enabled" className="cursor-pointer font-normal">
            <span className="text-sm font-medium">Enabled</span>
            <span className="block text-xs text-muted-foreground">
              A disabled skill stays in the catalogue and keeps its assignments.
            </span>
          </Label>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="me-1.5 size-4" />
              Delete skill
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {skill.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the skill from the catalogue, unassigns it from the{" "}
                {holders === 1 ? "one agent" : `${holders} agents`} that{" "}
                {holders === 1 ? "loads" : "load"} it, and deletes{" "}
                {skill.installedPath || `.claude/skills/${skill.name}`} from disk. It
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void remove()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </footer>
    </div>
  );
};
SkillDetail.displayName = "SkillDetail";
