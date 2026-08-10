import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger, Button, Callout, Checkbox, EmptyState, Input, Label,
  MarkdownEditor, Switch, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@togo-framework/ui";
import {
  ArrowLeft, CircleAlert, CircleCheck, CircleDashed, CircleX, Folder, Github,
  HardDrive, LoaderCircle, PenLine, Trash2, Wand2,
} from "lucide-react";
import {
  assignSkill, deleteSkill, fetchSkill, fetchSkillActivity, regenerateSkill,
  saveSkill, unassignSkill,
  type Skill, type SkillAgent, type SkillUse,
} from "../lib/skills";
import { SkillMark } from "../components/skill-mark";
import { PageShell } from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { appPath } from "../lib/base";
import { AgentTile } from "./agents";

const PAGE = 50;

/**
 * A run's outcome as a SHAPE-coded glyph — check, cross, alert, spinner — so it
 * survives monochrome. Kept local rather than shared with agent-detail: five
 * lines is cheaper than coupling two lazy route chunks together.
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

/** The provenance glyph, same mapping as the catalogue card. */
const SOURCE_GLYPH = {
  local: HardDrive,
  github: Github,
  operator: PenLine,
} as const;

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
  const { S } = useStrings();
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
      setSaved(S.skills.savedNote);
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
      setSaved(S.skills.rewritten(r.words, `$${r.costUsd.toFixed(2)}`, r.grounded));
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
      window.location.href = appPath("/skills");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const handleDiscard = () => {
    if (!skill) return;
    setTitle(skill.title);
    setDescription(skill.description);
    setBody(skill.bodyMd ?? "");
  };

  const back = (
    <Link
      to="/skills"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
      {S.skills.back}
    </Link>
  );

  if (!skill) {
    return (
      <PageShell>
        {back}
        {err ? (
          <Callout kind="warn" title={S.skills.openErr}>{err}</Callout>
        ) : (
          <p className="text-sm text-muted-foreground">{S.common.loading}</p>
        )}
      </PageShell>
    );
  }

  const holders = agents.filter((a) => a.has).length;
  const SourceGlyph = SOURCE_GLYPH[skill.source] ?? HardDrive;
  const sourceWord =
    skill.source === "github"
      ? S.skills.sourceGithub
      : skill.source === "operator"
        ? S.skills.sourceOperator
        : S.skills.sourceLocal;

  // The save/discard row appears in BOTH editing tabs (Overview owns the
  // frontmatter, Body owns the document) because one PATCH carries all three
  // fields — wherever the operator edited, the exit is in reach.
  const saveRow = (showRegen: boolean) => (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void save()} disabled={busy || !dirty || !body.trim()}>
        {busy ? S.common.saving : S.skills.save}
      </Button>
      {showRegen && (
        /* Offered next to Save because the two are alternatives: write the
           procedure yourself, or have it read the repository and write one.
           Disabled while the editor is dirty — regenerating would discard
           unsaved edits with no warning. */
        <Button
          variant="outline"
          onClick={() => void regenerate()}
          disabled={regenBusy || busy || dirty}
          title={dirty ? S.skills.regenDirtyTitle : S.skills.regenTitle}
        >
          <Wand2 className="me-1.5 size-4" />
          {regenBusy ? S.skills.regenerating : S.skills.regenerate}
        </Button>
      )}
      {showRegen && regenBusy && (
        <span className="text-xs text-muted-foreground">{S.skills.regenNote}</span>
      )}
      {dirty && (
        <Button variant="outline" onClick={handleDiscard}>{S.common.discard}</Button>
      )}
      {saved && !dirty && <span className="text-xs text-success">{saved}</span>}
    </div>
  );

  return (
    <PageShell>
      {back}

      {/* The hero band: big mark, name, one-line tagline, and the ONE primary
          action — enabled — on the trailing side. */}
      <header className="flex flex-wrap items-start gap-4 sm:gap-5">
        <SkillMark skill={skill} className={`size-16 sm:size-20 ${skill.enabled ? "" : "opacity-40 grayscale"}`} />
        <div className="min-w-0 flex-1">
          {/* <bdi>, not a block-level dir="ltr": the name must keep its latin
              glyph order AND sit on the reading edge — right in Arabic. A block
              dir would drag it to the far left of an RTL page. */}
          <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">
            <bdi>{skill.name}</bdi>
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {skill.title || S.skills.noTitle}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <SourceGlyph className="size-3 shrink-0" />
              {sourceWord}
            </span>
            <span dir="ltr" className="truncate font-mono text-[11px]">
              {skill.installedPath || S.skills.notInstalled}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
          <label className="flex cursor-pointer items-center gap-2">
            <span className={`text-sm font-medium ${skill.enabled ? "" : "text-warning"}`}>
              {skill.enabled ? S.skills.enabledLabel : S.common.off}
            </span>
            <Switch
              checked={skill.enabled}
              onCheckedChange={(v) => void toggleEnabled(v === true)}
              aria-label={skill.enabled ? S.skills.disableAria(skill.name) : S.skills.enableAria(skill.name)}
            />
          </label>
          <span className="max-w-44 text-end text-[11px] text-muted-foreground">
            {S.skills.enabledHint}
          </span>
        </div>
      </header>

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {/* Content leads, the quiet meta rail trails — the same split as the
          issue and agent pages. The grid follows the document direction, so
          the rail changes side in Arabic by itself. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Tabs defaultValue="overview" className="min-w-0">
          <TabsList>
            <TabsTrigger value="overview">{S.skills.tabOverview}</TabsTrigger>
            <TabsTrigger value="body">{S.skills.tabBody}</TabsTrigger>
            <TabsTrigger value="agents">{S.skills.tabAgents}</TabsTrigger>
            <TabsTrigger value="activity">{S.skills.tabActivity}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 flex min-w-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-title" className="mb-1 block text-xs text-muted-foreground">
                  {S.skills.editTitleLabel}
                </Label>
                <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="edit-desc" className="mb-1 block text-xs text-muted-foreground">
                  {S.skills.editDescLabel}
                </Label>
                <Input
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            {saveRow(false)}
          </TabsContent>

          <TabsContent value="body" className="mt-4 flex min-w-0 flex-col gap-2">
            <MarkdownEditor value={body} onChange={setBody} defaultView="write" minRows={18} />
            {saveRow(true)}
          </TabsContent>

          <TabsContent value="agents" className="mt-4 min-w-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {S.skills.agentsHeading(holders, agents.length)}
            </h3>
            {agents.length === 0 ? (
              <EmptyState title={S.skills.noAgentsTitle} description={S.skills.noAgentsDesc} />
            ) : (
              // The whole fleet as a plain list with hairline dividers — glyph,
              // name, and the assignment checkbox trailing. No cards: this is a
              // nested collection, not a page of its own.
              <div className="divide-y divide-border">
                {agents.map((a) => (
                  <div key={a.slug} className="flex min-w-0 items-center gap-3 py-2.5">
                    <AgentTile
                      a={{ slug: a.slug, displayName: a.displayName, color: "", avatarUrl: "" }}
                      className="size-9 text-xs"
                      dimmed={!a.enabled}
                    />
                    <Label
                      htmlFor={`assign-${a.slug}`}
                      className="min-w-0 flex-1 cursor-pointer font-normal"
                    >
                      <span className="block truncate text-sm font-medium">
                        {a.displayName || a.slug}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        <span dir="ltr" className="font-mono">@{a.slug}</span>
                        {!a.enabled && ` · ${S.skills.agentDisabled}`}
                      </span>
                    </Label>
                    {/* Straight through to the agent — the assignment picker is
                        the natural place to ask "who is this?". */}
                    <Link
                      to="/agents/$slug"
                      params={{ slug: a.slug }}
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {S.common.open}
                    </Link>
                    <Checkbox
                      id={`assign-${a.slug}`}
                      checked={a.has}
                      onCheckedChange={(v) => void toggleAgent(a.slug, v === true)}
                      aria-label={S.skills.assignAria(a.displayName || a.slug)}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4 min-w-0">
            {/* Stated plainly, because the distinction matters and the number
                would otherwise be read as a count of times the agent chose
                this skill. */}
            <p className="mb-3 text-xs text-muted-foreground">{S.skills.activityNote}</p>
            {uses.length === 0 ? (
              <EmptyState
                title={S.skills.notLoadedTitle}
                description={holders === 0 ? S.skills.notLoadedNoHolder : S.skills.notLoadedAssigned}
              />
            ) : (
              // Plain rows with hairline dividers: outcome glyph, who, what,
              // when trailing.
              <div className="divide-y divide-border">
                {uses.map((u, i) => (
                  <div key={`${u.runId}-${i}`} className="flex min-w-0 items-start gap-3 py-2.5">
                    <RunGlyph status={u.runStatus} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/agents/$slug"
                        params={{ slug: u.agent }}
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        <span dir="ltr">@{u.agent}</span>
                      </Link>
                      {u.issueNumber > 0 && (
                        <Link
                          to="/issues/$number"
                          params={{ number: String(u.issueNumber) }}
                          className="mt-0.5 block min-w-0 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <span dir="ltr">#{u.issueNumber}</span> {u.issueTitle}
                        </Link>
                      )}
                    </div>
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {S.skills.ago(u.loadedAt)}
                    </span>
                  </div>
                ))}
                <div ref={sentinel} className="h-4" />
                {moreBusy && <p className="py-2 text-center text-xs text-muted-foreground">{S.common.loading}</p>}
                {uses.length >= useTotal && useTotal > PAGE && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {S.skills.allShown(useTotal)}
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* The quiet meta rail: counts and provenance, and the one destructive
            act at the very end where it cannot be pressed by momentum. */}
        <aside className="flex flex-col gap-4 text-sm">
          <div className="divide-y divide-border border-t border-border text-xs">
            <MetaLine k={S.skills.statHolders} v={String(holders)} tone={holders ? "" : "text-warning"} />
            <MetaLine k={S.skills.statLoads} v={String(useTotal)} />
            <MetaLine k={S.skills.statRan} v={String(useAgents)} />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {S.skills.sourceLabel}
            </p>
            <p className="flex items-center gap-1.5 text-xs">
              <SourceGlyph className="size-3.5 shrink-0 text-muted-foreground" />
              {sourceWord}
            </p>
            {skill.sourceRef && (
              <p dir="ltr" className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {skill.sourceRef}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {S.skills.pathLabel}
            </p>
            <p className="flex items-start gap-1.5 text-xs">
              <Folder className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span dir="ltr" className="break-all font-mono text-[11px] text-muted-foreground">
                {skill.installedPath || S.skills.notInstalled}
              </span>
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="me-1.5 size-4" />
                {S.skills.delete}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{S.skills.deleteTitle(skill.name)}</AlertDialogTitle>
                <AlertDialogDescription>
                  {S.skills.deleteDesc(holders, skill.installedPath || `.claude/skills/${skill.name}`)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{S.skills.keep}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void remove()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {S.skills.deleteConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </aside>
      </div>
    </PageShell>
  );
};
SkillDetail.displayName = "SkillDetail";

/** One quiet fact in the rail: label leading, tabular value trailing. */
const MetaLine = ({ k, v, tone = "" }: { k: string; v: string; tone?: string }) => (
  <div className="flex justify-between gap-3 py-1.5">
    <span className="text-muted-foreground">{k}</span>
    <span dir="ltr" className={`font-mono tabular-nums ${tone}`}>{v}</span>
  </div>
);
MetaLine.displayName = "MetaLine";
