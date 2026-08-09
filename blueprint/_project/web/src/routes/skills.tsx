import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Button, Callout, EmptyState, Input, Label, MarkdownEditor, PageHeader, StatCard,
} from "@togo-framework/ui";
import { Download, FolderSync, Github, Plus, X } from "lucide-react";
import {
  createSkill, importSkills, listSkills, syncSkills,
  type ImportResult, type Skill, type Skipped, type SyncResult,
} from "../lib/skills";
import { SkillCard } from "../components/skill-card";

const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(m, 0)}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

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
}) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>

    <div className="mt-3 flex flex-col gap-2 text-sm">
      {created.length > 0 && (
        <p>
          <span className="font-medium">Added:</span>{" "}
          <span className="font-mono text-xs">{created.join(", ")}</span>
        </p>
      )}
      {updated.length > 0 && (
        <p>
          <span className="font-medium">Updated:</span>{" "}
          <span className="font-mono text-xs">{updated.join(", ")}</span>
        </p>
      )}
      {created.length === 0 && updated.length === 0 && (
        <p className="text-muted-foreground">Nothing changed.</p>
      )}
    </div>

    {skipped.length > 0 && (
      <div className="mt-3">
        <Callout kind="warn" title={`${skipped.length} skipped`}>
          <ul className="flex flex-col gap-1">
            {skipped.map((s, i) => (
              <li key={`${s.name}-${i}`}>
                <span className="font-mono text-xs">{s.name || "(unnamed)"}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </Callout>
      </div>
    )}
  </div>
);
OutcomeReport.displayName = "OutcomeReport";

// One page of the catalogue. Small enough that the first paint is immediate,
// large enough that scrolling is rare on a normal fleet.
const PAGE = 50;

export const Skills = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
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
    if (loadingMore || skills.length >= total) return;
    setLoadingMore(true);
    try {
      const d = await listSkills(q, skills.length, PAGE);
      setSkills((prev) => [...prev, ...d.skills]);
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

  const shown = skills;
  const inUse = skills.filter((s) => s.agents > 0).length;
  const unused = skills.filter((s) => s.agents === 0).length;
  const off = skills.filter((s) => !s.enabled).length;

  return (
    <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        title="Skills"
        description="The instruction files agents load by name. Editing one here rewrites its SKILL.md on disk, which is what an agent actually reads on its next run."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills…"
              className="h-9 w-56"
            />
            <Button variant="outline" size="sm" onClick={() => void runSync()} disabled={syncing}>
              <FolderSync className="me-1.5 size-4" />
              {syncing ? "Scanning…" : "Sync from disk"}
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
              Import from GitHub
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreating((v) => !v);
                setImporting(false);
              }}
            >
              <Plus className="me-1.5 size-4" />
              New skill
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Skills" value={String(skills.length)} />
        <StatCard label="In use" value={String(inUse)} tone={inUse ? "success" : "muted"} />
        <StatCard label="Nobody uses" value={String(unused)} tone={unused ? "warning" : "muted"} />
        <StatCard label="Disabled" value={String(off)} tone="muted" />
      </div>

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

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
          title={`Scanned ${dir || ".claude/skills"} — ${sync.scanned} ${sync.scanned === 1 ? "directory" : "directories"}`}
          created={sync.created}
          updated={sync.updated}
          skipped={sync.skipped}
          onDismiss={() => setSync(null)}
        />
      )}

      {shown.length === 0 ? (
        <EmptyState
          title={skills.length ? "No skills match" : "No skills yet"}
          description={
            skills.length
              ? "Try a different search."
              : `Sync from disk to pick up whatever is already in ${dir || ".claude/skills"}, import a repository, or write one here.`
          }
        />
      ) : (
        <>
          {/* A grid of tiles, not a table. 29 near-identical rows are read
              linearly — you scan every line to find one. A tile with its own
              icon and colour is recognised before any text is processed, which
              is what a catalogue you return to repeatedly has to be. */}
          {/* Three across, not four. At four the tiles are too narrow for a
              description to be readable, and the point of a tile is that you
              can judge it without opening it. */}
          <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((s, i) => (
              <div
                key={s.name}
                // min-w-0 because a GRID child defaults to min-width:auto just
                // as a flex child does — without it a long unbroken description
                // pushes the tile past the track and it renders clipped.
                //
                // Staggered entrance, capped: past a dozen the stagger stops
                // reading as sequence and starts reading as lag.
                // h-full so every tile in a row is the same height. Without it
                // the wrapper takes its natural height and the row is ragged,
                // because descriptions differ in length.
                className="h-full min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "backwards" }}
              >
                <SkillCard skill={s} />
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
              {loadingMore ? "Loading…" : `${shown.length} of ${total} — scroll for more`}
            </div>
          )}
        </>
      )}

    </div>
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
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
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
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">New skill</h2>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:underline">
          Cancel
        </button>
      </div>

      {err && <div className="mt-3"><Callout kind="warn" title="Could not create it">{err}</Callout></div>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="skill-name" className="mb-1 block text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="verify"
            className="font-mono"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Lowercase letters, digits and hyphens. This is also the directory name, and
            agents reference it — it cannot be changed later.
          </span>
        </div>
        <div>
          <Label htmlFor="skill-title" className="mb-1 block text-xs text-muted-foreground">
            Title
          </Label>
          <Input
            id="skill-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Verify before claiming done"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="skill-desc" className="mb-1 block text-xs text-muted-foreground">
            When an agent should reach for it
          </Label>
          <Input
            id="skill-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Use before closing an issue or saying a change is done."
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            This becomes the description in the file's frontmatter, which is what the model
            reads to decide whether the skill applies.
          </span>
        </div>
      </div>

      <div className="mt-3">
        <Label className="mb-1 block text-xs text-muted-foreground">Instructions</Label>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          defaultView="write"
          minRows={12}
          placeholder={"# What this skill teaches\n\nSteps, commands, and the constraints that matter."}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={() => void submit()} disabled={busy || !name.trim() || !body.trim()}>
          {busy ? "Creating…" : "Create skill"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Written to .claude/skills/&lt;name&gt;/SKILL.md, then assign it to the agents that need it.
        </span>
      </div>
    </div>
  );
};
CreateSkill.displayName = "CreateSkill";

/** Install every SKILL.md in a public GitHub repository. */
const ImportSkills = ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => {
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run() {
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
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Import from GitHub</h2>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:underline">
          Close
        </button>
      </div>

      {err && <div className="mt-3"><Callout kind="warn" title="Could not import">{err}</Callout></div>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="import-repo" className="mb-1 block text-xs text-muted-foreground">
            Repository
          </Label>
          <Input
            id="import-repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="anthropics/skills"
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="import-path" className="mb-1 block text-xs text-muted-foreground">
            Folder inside it — optional
          </Label>
          <Input
            id="import-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder=".claude/skills"
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={() => void run()} disabled={busy || !repo.trim()}>
          <Download className="me-1.5 size-4" />
          {busy ? "Downloading…" : "Import"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Public repositories only. Every directory holding a SKILL.md becomes a skill, up to 50 per import.
        </span>
      </div>

      {result && (
        <div className="mt-4">
          <OutcomeReport
            title={`${result.repo}${result.ref ? `@${result.ref}` : ""} — ${result.found} found`}
            created={result.installed}
            updated={result.updated}
            skipped={result.skipped}
            onDismiss={() => setResult(null)}
          />
        </div>
      )}
    </div>
  );
};
ImportSkills.displayName = "ImportSkills";

