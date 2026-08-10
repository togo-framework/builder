import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Button, Callout, EmptyState, Input, MarkdownEditor, PageHeader,
} from "@togo-framework/ui";
import { BookOpen, Download, FolderSync, Github, Plus, X } from "lucide-react";
import {
  createSkill, importSkills, listSkills, saveSkill, syncSkills,
  type ImportResult, type Skill, type Skipped, type SyncResult,
} from "../lib/skills";
import { SkillCard } from "../components/skill-card";
import { Field, FormCard, FormFooter, GridSkeleton, PageShell, Stat, StatRow } from "../components/page-shell";
import { useStrings } from "../lib/i18n";

/**
 * What a sync or an import actually did.
 *
 * Both operations are routinely partial — a repository with eight skills where
 * two have unusable names installs six. Showing only a count would hide the two
 * that did not land, which is the number the operator needs.
 */
const OutcomeReport = ({
  title, created, updated, skipped, onDismiss,
}: {
  title: string;
  created: string[];
  updated: string[];
  skipped: Skipped[];
  onDismiss: () => void;
}) => {
  const { S } = useStrings();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label={S.common.dismiss}>
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-sm">
        {created.length > 0 && (
          <p>
            <span className="font-medium">{S.skills.added}</span>{" "}
            <span dir="ltr" className="font-mono text-xs">{created.join(", ")}</span>
          </p>
        )}
        {updated.length > 0 && (
          <p>
            <span className="font-medium">{S.skills.updated}</span>{" "}
            <span dir="ltr" className="font-mono text-xs">{updated.join(", ")}</span>
          </p>
        )}
        {created.length === 0 && updated.length === 0 && (
          <p className="text-muted-foreground">{S.skills.nothingChanged}</p>
        )}
      </div>

      {skipped.length > 0 && (
        <div className="mt-3">
          <Callout kind="warn" title={S.skills.skippedCount(skipped.length)}>
            <ul className="flex flex-col gap-1">
              {skipped.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  <span dir="ltr" className="font-mono text-xs">{s.name || S.skills.unnamed}</span> — {s.reason}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}
    </div>
  );
};
OutcomeReport.displayName = "OutcomeReport";

// One page of the catalogue. Small enough that the first paint is immediate,
// large enough that scrolling is rare on a normal fleet.
const PAGE = 50;

export const Skills = () => {
  const { S } = useStrings();
  // null = not loaded yet, so the first paint is a skeleton rather than a
  // false "No skills yet" while the request is in flight.
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [dir, setDir] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<SyncResult | null>(null);

  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search runs in the DATABASE. Filtering the fetched page in the browser only
  // ever matched what happened to be loaded, so a hit on page 3 was invisible.
  const load = (query = q) =>
    listSkills(query, 0, PAGE)
      .then((d) => {
        setSkills(d.skills);
        setTotal(d.total);
        setDir(d.dir);
        setErr("");
      })
      .catch((e: Error) => setErr(e.message));

  async function loadMore() {
    if (loadingMore || (skills?.length ?? 0) >= total) return;
    setLoadingMore(true);
    try {
      const d = await listSkills(q, skills?.length ?? 0, PAGE);
      setSkills((prev) => [...(prev ?? []), ...d.skills]);
      setTotal(d.total);
    } catch {
      /* a failed page must not discard the ones already shown */
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function runSync() {
    setSyncing(true);
    setErr("");
    try {
      setSync(await syncSkills());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  // Optimistic: the switch must answer instantly or it reads as broken; the
  // reload afterwards is what makes the server's truth win.
  const handleToggle = (name: string, enabled: boolean) => {
    setSkills((prev) => (prev ? prev.map((s) => (s.name === name ? { ...s, enabled } : s)) : prev));
    saveSkill(name, { enabled })
      .catch((e) => setErr(String((e as Error).message)))
      .finally(() => void load());
  };

  const shown = skills ?? [];
  const inUse = shown.filter((s) => s.agents > 0).length;
  const unused = shown.filter((s) => s.agents === 0).length;
  const off = shown.filter((s) => !s.enabled).length;

  return (
    <PageShell>
      <PageHeader
        title={S.skills.title}
        icon={<BookOpen className="size-5" />}
        description={S.skills.desc}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={S.skills.search}
              className="h-9 w-56"
            />
            <Button variant="outline" size="sm" onClick={() => void runSync()} disabled={syncing}>
              <FolderSync className="me-1.5 size-4" />
              {syncing ? S.skills.syncing : S.skills.sync}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImporting((v) => !v);
                setCreating(false);
              }}
            >
              <Github className="me-1.5 size-4" />
              {S.skills.importGh}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreating((v) => !v);
                setImporting(false);
              }}
            >
              <Plus className="me-1.5 size-4" />
              {S.skills.newSkill}
            </Button>
          </div>
        }
      />

      <StatRow>
        <Stat label={S.skills.statSkills} value={shown.length} />
        <Stat label={S.skills.statInUse} value={inUse} tone={inUse ? "success" : "muted"} />
        <Stat label={S.skills.statUnused} value={unused} tone={unused ? "warning" : "muted"} />
        <Stat label={S.skills.statDisabled} value={off} tone="muted" />
      </StatRow>

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {creating && (
        <CreateSkill
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            // Straight to the new skill. It was just written and has no body
            // beyond what was typed, so the next thing wanted is always to edit
            // it — not to hunt for it in a grid of thirty.
            void navigate({ to: "/skills/$name", params: { name } });
          }}
        />
      )}

      {importing && <ImportSkills onClose={() => setImporting(false)} onDone={() => void load()} />}

      {sync && (
        <OutcomeReport
          title={S.skills.scannedTitle(dir || ".claude/skills", sync.scanned)}
          created={sync.created}
          updated={sync.updated}
          skipped={sync.skipped}
          onDismiss={() => setSync(null)}
        />
      )}

      {skills === null ? (
        <GridSkeleton count={6} />
      ) : shown.length === 0 ? (
        <EmptyState
          // Search is server-side, so an empty RESULT with a query is "no
          // match" — the local array being empty says nothing about the fleet.
          title={q.trim() ? S.skills.noMatchTitle : S.skills.emptyTitle}
          description={q.trim() ? S.skills.noMatchDesc : S.skills.emptyDesc(dir || ".claude/skills")}
        />
      ) : (
        <>
          {/* Two columns, a generous gutter, hairline borders and no shadow —
              the store grid from the reference. auto-rows-fr + h-full keep
              every row's cards level even when descriptions differ in length. */}
          <div className="grid auto-rows-fr gap-5 sm:grid-cols-2">
            {shown.map((s, i) => (
              <div
                key={s.name}
                // min-w-0 because a GRID child defaults to min-width:auto just
                // as a flex child does — without it a long unbroken description
                // pushes the tile past the track and it renders clipped.
                //
                // Staggered entrance, capped: past a dozen the stagger stops
                // reading as sequence and starts reading as lag.
                className="h-full min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "backwards" }}
              >
                <SkillCard skill={s} onToggle={handleToggle} />
              </div>
            ))}
          </div>

          {shown.length < total && (
            <div
              ref={(el) => {
                if (!el) return;
                const io = new IntersectionObserver(
                  (entries) => entries[0]?.isIntersecting && void loadMore(),
                  { rootMargin: "300px" },
                );
                io.observe(el);
              }}
              className="py-4 text-center text-xs text-muted-foreground"
            >
              {loadingMore ? S.common.loading : S.skills.progress(shown.length, total)}
            </div>
          )}
        </>
      )}

    </PageShell>
  );
};
Skills.displayName = "Skills";

/** Write a skill by hand. Named once and never renamed — see saveSkill. */
const CreateSkill = ({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) => {
  const { S } = useStrings();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    setBusy(true);
    setErr("");
    try {
      const created = await createSkill({
        name: name.trim().toLowerCase(),
        title: title.trim(),
        description: description.trim(),
        bodyMd: body,
      });
      onCreated(created.name);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title={S.skills.createTitle} onClose={onClose} closeLabel={S.common.cancel}>
      {err && <div className="mb-3"><Callout kind="warn" title={S.skills.createErrTitle}>{err}</Callout></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={S.skills.nameLabel} htmlFor="skill-name" required hint={S.skills.nameHint}>
          <Input
            id="skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="verify"
            dir="ltr"
            className="font-mono"
          />
        </Field>
        <Field label={S.skills.titleLabel} htmlFor="skill-title" hint={S.skills.titleHint}>
          <Input
            id="skill-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Verify before claiming done"
          />
        </Field>
        <Field
          label={S.skills.whenLabel} htmlFor="skill-desc" className="sm:col-span-2"
          hint={S.skills.whenHint}
        >
          <Input
            id="skill-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Use before closing an issue or saying a change is done."
          />
        </Field>
      </div>

      <Field label={S.skills.bodyLabel} required className="mt-4">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          defaultView="write"
          minRows={12}
          placeholder={"# What this skill teaches\n\nSteps, commands, and the constraints that matter."}
        />
      </Field>

      <FormFooter
        note={
          !name.trim() ? S.skills.noteNameFirst
            : !body.trim() ? S.skills.noteBodyFirst
              : S.skills.noteReady
        }
      >
        <Button onClick={() => void handleSubmit()} disabled={busy || !name.trim() || !body.trim()}>
          <Plus className="me-1.5 size-4" />
          {busy ? S.skills.creating : S.skills.createCta}
        </Button>
      </FormFooter>
    </FormCard>
  );
};
CreateSkill.displayName = "CreateSkill";

/** Install every SKILL.md in a public GitHub repository. */
const ImportSkills = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const { S } = useStrings();
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleRun = async () => {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const r = await importSkills(repo.trim(), path.trim());
      setResult(r);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title={S.skills.importTitle} onClose={onClose} closeLabel={S.common.close}>
      {err && <div className="mb-3"><Callout kind="warn" title={S.skills.importErrTitle}>{err}</Callout></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={S.skills.repoLabel} htmlFor="import-repo" required hint={S.skills.repoHint}>
          <Input
            id="import-repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="anthropics/skills"
            dir="ltr"
            className="font-mono text-xs"
          />
        </Field>
        <Field label={S.skills.folderLabel} htmlFor="import-path" hint={S.skills.folderHint}>
          <Input
            id="import-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder=".claude/skills"
            dir="ltr"
            className="font-mono text-xs"
          />
        </Field>
      </div>

      <FormFooter note={!repo.trim() ? S.skills.noteRepoFirst : S.skills.noteImport}>
        <Button onClick={() => void handleRun()} disabled={busy || !repo.trim()}>
          <Download className="me-1.5 size-4" />
          {busy ? S.skills.downloading : S.skills.importCta}
        </Button>
      </FormFooter>

      {result && (
        <div className="mt-4">
          <OutcomeReport
            title={S.skills.foundTitle(`${result.repo}${result.ref ? `@${result.ref}` : ""}`, result.found)}
            created={result.installed}
            updated={result.updated}
            skipped={result.skipped}
            onDismiss={() => setResult(null)}
          />
        </div>
      )}
    </FormCard>
  );
};
ImportSkills.displayName = "ImportSkills";
