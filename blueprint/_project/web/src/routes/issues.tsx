import { useEffect, useState } from "react";
import { LayoutGrid, List, LoaderCircle, MessageSquare, Plus, RotateCw, SquareKanban } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Button, Callout, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Input, Label, MarkdownEditor, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem,
} from "@togo-framework/ui";
import { DotLabel, PageShell, Stat, StatRow, StatSkeleton } from "../components/page-shell";
import {
  COLUMN_LABEL, TRANSITIONS, ago, createIssue, fetchBoard, patchIssue,
  type Board, type Card, type IssueStatus, type IssueType, type Priority,
} from "../lib/issues";
import { listAgents, type Agent } from "../lib/agents";
import { FADE_ONLY } from "../lib/dialog-motion";

/**
 * The board is built on togo UI primitives — PageHeader, StatusBadge,
 * EmptyState, Callout — plus the page-shell strip, but the kanban itself is
 * domain-specific.
 *
 * togo ships `IssuesList`/`IssueDetail`, and they are deliberately NOT used here:
 * their `Issue` type is a crash report (level, count, userCount, stack,
 * breadcrumbs; status unresolved|resolved|ignored). That is error tracking, not
 * work tracking. Mapping this board onto it would drop the seven-column status
 * machine, the human-only flag, agent leases, attempt counts and priority — a
 * downgrade dressed up as reuse. The primitives are shared; the domain is not.
 */

type BadgeTone = "success" | "info" | "neutral" | "warning" | "danger";

// The type wears a dot + word (the panel's issue-type treatment), so its tone
// is a DotLabel tone; priority stays a status pill. Same union, two shapes.
const TYPE_TONE: Record<string, BadgeTone> = {
  bug: "danger",
  feature: "info",
  enhancement: "info",
  question: "warning",
  discussion: "neutral",
  chore: "neutral",
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  critical: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

/** The lease indicator: a spinner (the panel's own "agent holds a lease"
 *  mark), so motion + shape carry it, not colour alone. */
const WorkingMark = ({ className }: { className?: string }) => (
  <span
    className={`inline-flex items-center gap-1 text-[11px] font-medium text-success ${className ?? ""}`}
    title="An agent holds a lease on this issue"
  >
    <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
    working
  </span>
);
WorkingMark.displayName = "WorkingMark";

export const Issues = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  // Remembered: an operator who works in list view wants it next time too.
  const [view, setView] = useState<"board" | "list">(
    () => (localStorage.getItem("builder.issues.view") as "board" | "list") || "board",
  );
  const setViewMode = (v: "board" | "list") => {
    if (!v) return; // ToggleGroup emits "" when the active item is re-clicked
    setView(v);
    localStorage.setItem("builder.issues.view", v);
  };

  const load = () => fetchBoard().then(setBoard).catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    void load();
    // The board is a live queue — agents move cards without the browser asking.
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, []);

  async function move(card: Card, to: IssueStatus) {
    // Optimistic: at a 10s poll the board feels dead if a drop waits for the
    // round trip. Reconciled against the server either way.
    setBoard((b) => {
      if (!b) return b;
      const cards = { ...b.cards };
      cards[card.status] = cards[card.status].filter((c) => c.id !== card.id);
      cards[to] = [{ ...card, status: to }, ...cards[to]];
      return { ...b, cards };
    });
    try {
      await patchIssue(card.number, { status: to });
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      void load();
    }
  }

  if (!board) {
    // A skeleton in the board's own shape, not "Loading…" — the columns are
    // where the eye will land, so that is where the promise of content goes.
    return (
      <PageShell width="wide" fill>
        <PageHeader
          title="Issues"
          icon={<SquareKanban className="size-5" />}
          description="Reported from the feedback widget or filed by hand."
        />
        <StatSkeleton />
        <div className="flex flex-1 gap-4 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex w-72 shrink-0 flex-col gap-2">
              <Skeleton className="h-8 rounded-md" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  const needle = q.trim().toLowerCase();
  const match = (c: Card) =>
    !needle ||
    c.title.toLowerCase().includes(needle) ||
    String(c.number).includes(needle) ||
    c.area.toLowerCase().includes(needle);

  const all = Object.values(board.cards).flat();
  const working = all.filter((c) => c.busy).length;
  const blocked = board.cards.blocked?.length ?? 0;

  return (
    <PageShell width="wide" fill className="gap-4">
      <PageHeader
        title="Issues"
        icon={<SquareKanban className="size-5" />}
        description="Reported from the feedback widget or filed by hand. Drag a card, or use its status menu."
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search issues…"
              className="h-9 w-64"
            />
            <ToggleGroup type="single" value={view} onValueChange={setViewMode}>
              <ToggleGroupItem value="board" aria-label="Board view" title="Board">
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view" title="List">
                <List className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
            {/* Filing work directly.
                The widget is for reporting what you just hit on a page. This is
                for writing down work you already know you want, which had no
                path at all — the only way onto this board was to go and find a
                page to complain about. */}
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="me-1.5 size-4" />
              New issue
            </Button>
          </div>
        }
      />

      {creating && (
        <NewIssueDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      <StatRow>
        <Stat label="Total" value={all.length} />
        <Stat label="Ready" value={board.cards.ready?.length ?? 0} tone="info" />
        <Stat label="Agents working" value={working} tone={working ? "success" : "muted"} />
        <Stat label="Blocked" value={blocked} tone={blocked ? "warning" : "muted"} />
      </StatRow>

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

      {view === "list" ? (
        <IssueTable rows={all.filter(match)} />
      ) : (
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {board.columns.map((col) => {
          const cards = (board.cards[col] ?? []).filter(match);
          return (
            <section
              key={col}
              className="flex w-72 shrink-0 flex-col rounded-lg"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("application/json");
                if (!raw) return;
                const card: Card = JSON.parse(raw);
                if (card.status === col) return;
                // The server enforces this too; refusing here avoids a pointless 409.
                if (!TRANSITIONS[card.status]?.includes(col)) {
                  setErr(`${COLUMN_LABEL[card.status]} → ${COLUMN_LABEL[col]} is not a legal move`);
                  return;
                }
                void move(card, col);
              }}
            >
              <h2 className="flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {COLUMN_LABEL[col]}
                <span className="tabular-nums">{cards.length}</span>
              </h2>

              <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-hide">
                {cards.map((c, i) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("application/json", JSON.stringify(c))
                    }
                    // Same treatment as the skills catalogue and the fleet.
                    //
                    // Restrained here on purpose: a board is dragged, and a card
                    // that lifts and glows on hover fights the drag affordance
                    // rather than supporting it. Entrance only, plus a border
                    // and shadow response — no translate.
                    style={{ animationDelay: `${Math.min(i, 10) * 20}ms`, animationFillMode: "backwards" }}
                    className="group cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm
                               transition-all duration-200 ease-out
                               hover:border-primary/60 hover:shadow-md
                               active:cursor-grabbing
                               animate-in fade-in slide-in-from-bottom-1
                               motion-reduce:animate-none motion-reduce:transition-none"
                  >
                    {/* Number and type as quiet marks, per the panel's row
                        anatomy. A "normal" priority pill on every card was
                        chrome — priority earns ink only when it deviates. */}
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        #{c.number}
                      </span>
                      <DotLabel tone={TYPE_TONE[c.type]} className="capitalize">{c.type}</DotLabel>
                      {c.priority !== "normal" && (
                        <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>
                      )}
                      {c.humanOnly && (
                        <span className="ms-auto" title="Agents will never claim this issue">
                          <StatusBadge tone="warning">Human only</StatusBadge>
                        </span>
                      )}
                    </div>

                    <Link
                      to="/issues/$number"
                      params={{ number: String(c.number) }}
                      className="block text-sm font-medium leading-snug hover:underline"
                    >
                      {c.title}
                    </Link>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {c.source === "feedback" && (
                        <span className="rounded bg-muted px-1.5 py-0.5">feedback</span>
                      )}
                      {c.area && <span className="rounded bg-muted px-1.5 py-0.5">{c.area}</span>}
                      {c.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="size-3" />
                          {c.commentCount}
                        </span>
                      )}
                      {c.attempts > 0 && (
                        <span className="inline-flex items-center gap-0.5" title="Agent attempts">
                          <RotateCw className="size-3" />
                          {c.attempts}
                        </span>
                      )}
                      {c.busy && <WorkingMark />}
                      <span className="ms-auto">{ago(c.createdAt)}</span>
                    </div>

                    {/* Keyboard/assistive path — a drag-only board is unusable
                        without a mouse, and the drag handle is the whole card. */}
                    <Select
                      value={c.status}
                      onValueChange={(v) => void move(c, v as IssueStatus)}
                    >
                      <SelectTrigger
                        aria-label={`Status of issue ${c.number}`}
                        className="mt-2 h-8 w-full text-xs"
                        // The card is the drag handle, so a pointerdown inside
                        // the trigger would start a drag instead of opening it.
                        onPointerDown={(e) => e.stopPropagation()}
                        draggable={false}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={c.status}>{COLUMN_LABEL[c.status]}</SelectItem>
                        {TRANSITIONS[c.status]?.map((t) => (
                          <SelectItem key={t} value={t}>{COLUMN_LABEL[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </article>
                ))}

                {!cards.length && (
                  <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      )}

      {all.length === 0 && (
        <EmptyState
          title="No issues yet"
          description="Click the feedback button on any page to file the first one."
        />
      )}
    </PageShell>
  );
};
Issues.displayName = "Issues";

/**
 * The same issues as a dense table.
 *
 * The board answers "what is the state of the work"; a list answers "find me
 * this one". With 40+ issues the kanban needs horizontal scrolling and hides
 * most of the queue behind it, which is when scanning a single ordered column
 * beats five parallel ones.
 */
const IssueTable = ({ rows }: { rows: Card[] }) => {
  if (rows.length === 0) {
    return <EmptyState title="No issues match" description="Try a different search." />;
  }
  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24">Priority</TableHead>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-28">Area</TableHead>
            <TableHead className="w-28 text-end">Age</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="tabular-nums text-muted-foreground">#{c.number}</TableCell>
              <TableCell>
                <Link
                  to="/issues/$number"
                  params={{ number: String(c.number) }}
                  className="font-medium hover:underline"
                >
                  {c.title}
                </Link>
                {c.busy && <WorkingMark className="ms-2" />}
                {c.humanOnly && (
                  <span className="ms-2"><StatusBadge tone="warning">Human only</StatusBadge></span>
                )}
              </TableCell>
              <TableCell><StatusBadge tone="neutral">{COLUMN_LABEL[c.status]}</StatusBadge></TableCell>
              {/* The column header gives the word its meaning, so the baseline
                  values sit as plain text; only a deviation wears the pill —
                  which is what makes a critical row findable in a scan. */}
              <TableCell>
                {c.priority === "critical" || c.priority === "high" ? (
                  <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>
                ) : (
                  <span className="text-xs capitalize text-muted-foreground">{c.priority}</span>
                )}
              </TableCell>
              <TableCell><DotLabel tone={TYPE_TONE[c.type]} className="capitalize">{c.type}</DotLabel></TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.area || "—"}</TableCell>
              <TableCell className="text-end text-xs text-muted-foreground">{ago(c.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
IssueTable.displayName = "IssueTable";

const TYPES: IssueType[] = ["bug", "feature", "enhancement", "chore", "question", "discussion"];
const PRIORITIES: Priority[] = ["low", "normal", "high", "critical"];

/**
 * File an issue by hand.
 *
 * Deliberately not the widget's form. That one is built around a reporter
 * standing on a page — it captures the route, the pinned elements, a
 * screenshot — and none of that exists when you are looking at the board
 * writing down work you already know you want. What matters here is the two
 * fields the board actually sorts by, priority and area, which the widget has
 * no business asking a passer-by for.
 */
const NewIssueDialog = ({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (n: number) => void;
}) => {
  const [type, setType] = useState<IssueType>("feature");
  const [priority, setPriority] = useState<Priority>("normal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [assignee, setAssignee] = useState("");
  const [humanOnly, setHumanOnly] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // The fleet, for the assignee picker. Best-effort: an operator who cannot
  // reach the agent list can still file the issue and let the lead route it.
  useEffect(() => {
    listAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  async function submit() {
    const t = title.trim();
    if (!t) {
      setErr("Give the issue a title.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await createIssue({ type, title: t, body, priority, area, assignee, humanOnly });
      onCreated(r.number);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" style={FADE_ONLY}>
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {err && <Callout kind="warn" title="Could not file it">{err}</Callout>}

          <div>
            <Label htmlFor="ni-title" className="mb-1 block text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id="ni-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              onKeyDown={(e) => {
                // Enter submits from the title, because that is the only
                // required field and typing one line then reaching for the
                // mouse is the whole friction this dialog exists to remove.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as IssueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ni-area" className="mb-1 block text-xs text-muted-foreground">
              Area
            </Label>
            <Input
              id="ni-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="dashboard, sdk, db…"
            />
            {/* Said out loud, because an unrouted issue sits on the board
                looking claimable and never is. */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              An agent only claims work in an area it owns. Leave it blank and
              the lead will route it.
            </p>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Assignee</Label>
            <Select value={assignee || "__auto"} onValueChange={(v) => setAssignee(v === "__auto" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* Radix rejects an empty-string value, so the "no choice"
                    option carries a sentinel and is mapped back on the way
                    out. */}
                <SelectItem value="__auto">Let the lead choose</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.slug} value={a.slug}>
                    {a.displayName || a.slug}
                    {!a.enabled && " (disabled)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Naming someone overrides area routing entirely — they get it even
              if the area is not theirs.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border p-2.5">
            <Checkbox
              id="ni-human"
              checked={humanOnly}
              onCheckedChange={(v) => setHumanOnly(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="ni-human" className="cursor-pointer font-normal">
              <span className="text-sm font-medium">Human only</span>
              <span className="block text-xs text-muted-foreground">
                Agents will never claim it, whatever the assignee says. For work
                you intend to do yourself.
              </span>
            </Label>
          </div>

          <div>
            <Label htmlFor="ni-body" className="mb-1 block text-xs text-muted-foreground">
              Details
            </Label>
            {/* The body is rendered as markdown on the issue page, in the
                widget and in the agent's own prompt, so it is written as
                markdown here too rather than in a bare textarea. */}
            <MarkdownEditor
              value={body}
              onChange={setBody}
              defaultView="write"
              minRows={6}
              placeholder="What does done look like? Anything the agent should not touch?"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              A title on its own is enough. Leave this empty and the agent will
              ask you what it needs before it starts.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy || !title.trim()}>
              {busy ? "Filing…" : "File issue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
NewIssueDialog.displayName = "NewIssueDialog";
