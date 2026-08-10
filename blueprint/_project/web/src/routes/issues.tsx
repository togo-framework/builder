import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, ChevronsUp, Folder, GitBranch, Hash, LayoutGrid, List, LoaderCircle, MessageSquare, Plus, SquareKanban, UserRound, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Button, Callout, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, Input, Label, MarkdownEditor, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem,
} from "@togo-framework/ui";
import { DotLabel, PageShell, Stat, StatRow, StatSkeleton } from "../components/page-shell";
import {
  TRANSITIONS, createIssue, fetchBoard, patchIssue,
  type Board, type Card, type IssueStatus, type IssueType, type Priority,
} from "../lib/issues";
import { agentColor, initials, listAgents, type Agent } from "../lib/agents";
import { FADE_ONLY } from "../lib/dialog-motion";
import { useStrings } from "../lib/i18n";

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
const WorkingMark = ({ className }: { className?: string }) => {
  const { S } = useStrings();
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-success ${className ?? ""}`}
      title={S.issues.workingTitle}
    >
      <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
      {S.issues.working}
    </span>
  );
};
WorkingMark.displayName = "WorkingMark";

/**
 * The column's identity as a coloured dot — with the column boxes gone this is
 * the only always-on colour the board frame carries. Tones echo the stat strip
 * (ready=info, in-progress=success, blocked=warning) so strip and board read
 * as one system; semantic tokens only, so every theme preset retints them.
 */
const STATUS_DOT: Record<IssueStatus, string> = {
  triage: "text-muted-foreground",
  ready: "text-info",
  in_progress: "text-success",
  blocked: "text-warning",
  in_review: "text-primary",
  done: "text-success",
  rejected: "text-destructive",
};

/**
 * Agent activity as a GLYPH, not a coloured word: a spinner while a lease is
 * held, a check when the attempts carried the card onward (review/done), a
 * cross when they bounced back. Shape as well as colour, so the state survives
 * a monochrome screenshot and colourblindness. Zero runs earn no chip at all —
 * deviation-only ink.
 */
const RunChip = ({ card }: { card: Card }) => {
  const { S } = useStrings();
  if (card.busy) {
    return (
      <span className="inline-flex items-center text-success" title={S.issues.workingTitle}>
        <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
      </span>
    );
  }
  if (card.attempts === 0) return null;
  // The board card carries no per-run verdict, but its position does: attempts
  // that pushed the card to review/done delivered; attempts on a card still
  // sitting anywhere earlier did not stick.
  const delivered = card.status === "in_review" || card.status === "done";
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${delivered ? "text-success" : "text-destructive"}`}
      title={delivered ? S.issues.runDelivered(card.attempts) : S.issues.runStalled(card.attempts)}
    >
      {delivered ? (
        <Check aria-hidden="true" className="size-3" />
      ) : (
        <X aria-hidden="true" className="size-3" />
      )}
      {/* One attempt is the norm once any run exists — only a repeat count earns ink. */}
      {card.attempts > 1 && <span dir="ltr" className="tabular-nums">{card.attempts}</span>}
    </span>
  );
};
RunChip.displayName = "RunChip";

/**
 * Priority as a GLYPH, matching the run mark beside it: an arrow whose
 * direction is the rank, so it survives monochrome and colourblindness the way
 * a coloured word never does. Normal earns nothing at all — deviation-only ink,
 * which is what makes a critical card findable in a column of forty.
 */
const PriorityMark = ({ priority }: { priority: Priority }) => {
  const { S } = useStrings();
  if (priority === "normal") return null;
  const Icon = priority === "critical" ? ChevronsUp : priority === "high" ? ChevronUp : ChevronDown;
  const tone =
    priority === "critical"
      ? "text-destructive"
      : priority === "high"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <span
      className={`inline-flex shrink-0 items-center ${tone}`}
      title={`${S.issues.priorityLabel}: ${S.issues.priorities[priority]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {/* The glyph is the whole visual; the word exists only for a reader. */}
      <span className="sr-only">{S.issues.priorities[priority]}</span>
    </span>
  );
};
PriorityMark.displayName = "PriorityMark";

/**
 * A 16px face for the card's provenance row — the roster's identity system
 * (photo, or initials on the agent's stable colour) at card scale, so a face
 * learned on the fleet page is recognised here. The colour is fleet DATA
 * (stored, or slug-derived by agentColor), not a design token, which is why it
 * is the one inline style on the board — same precedent as AgentAvatar.
 */
const CardAgent = ({ agent }: { agent: Agent }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    {agent.avatarUrl ? (
      <img src={agent.avatarUrl} alt="" className="size-4 shrink-0 rounded-full object-cover" />
    ) : (
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-[7px] font-semibold text-white"
        style={{ background: agentColor(agent) }}
      >
        {initials(agent)}
      </span>
    )}
    <span className="truncate">{agent.displayName || agent.slug}</span>
  </span>
);
CardAgent.displayName = "CardAgent";

export const Issues = () => {
  const { S } = useStrings();
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  // Facets, not ink. Type left the card face when the card was cut back to the
  // reference's four rows; it lives here instead, where a dimension you filter
  // by belongs. "all" is the sentinel — Radix rejects an empty-string value.
  const [fType, setFType] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fAgent, setFAgent] = useState("all");
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

  // The fleet roster resolves assignee slugs into faces and names for the
  // cards' provenance row. Best-effort: a board that cannot reach the fleet
  // still renders, showing bare slugs instead of faces.
  const [agents, setAgents] = useState<Agent[]>([]);

  const load = () => fetchBoard().then(setBoard).catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    void load();
    listAgents().then(setAgents).catch(() => setAgents([]));
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
          title={S.issues.title}
          icon={<SquareKanban className="size-5" />}
          description={S.issues.descLoading}
        />
        {view === "list" && <StatSkeleton />}
        <div className="flex flex-1 gap-6 overflow-hidden" aria-hidden="true">
          {/* Mirrors the chrome-less columns: a header LINE, then floating
              cards — not a boxed header slab — so nothing re-shapes on load. */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex w-72 shrink-0 flex-col gap-2 px-2">
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  const needle = q.trim().toLowerCase();
  const match = (c: Card) =>
    (!needle ||
      c.title.toLowerCase().includes(needle) ||
      String(c.number).includes(needle) ||
      c.area.toLowerCase().includes(needle)) &&
    (fType === "all" || c.type === fType) &&
    (fPriority === "all" || c.priority === fPriority) &&
    (fAgent === "all" || c.assignee === fAgent);

  const all = Object.values(board.cards).flat();
  const working = all.filter((c) => c.busy).length;
  const blocked = board.cards.blocked?.length ?? 0;
  const agentBySlug = new Map(agents.map((a) => [a.slug, a] as const));

  return (
    <PageShell width="wide" fill className="gap-4">
      <PageHeader
        title={S.issues.title}
        icon={<SquareKanban className="size-5" />}
        description={S.issues.desc}
        actions={
          /* Search, then the facets, then the view toggle at the trailing end —
             the toggle is last because it changes the shape of the page, not
             its contents. */
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={S.issues.search}
              className="h-9 w-56"
            />
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger className="h-9 w-auto gap-1.5 text-xs" aria-label={S.issues.typeLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{S.issues.filterType}</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{S.issues.types[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fPriority} onValueChange={setFPriority}>
              <SelectTrigger className="h-9 w-auto gap-1.5 text-xs" aria-label={S.issues.priorityLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{S.issues.filterPriority}</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{S.issues.priorities[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Offered only once the roster answered — an agent filter with one
                empty option is a dead control. */}
            {agents.length > 0 && (
              <Select value={fAgent} onValueChange={setFAgent}>
                <SelectTrigger className="h-9 w-auto gap-1.5 text-xs" aria-label={S.issues.assigneeLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{S.issues.filterAgent}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>{a.displayName || a.slug}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Filing work directly.
                The widget is for reporting what you just hit on a page. This is
                for writing down work you already know you want, which had no
                path at all — the only way onto this board was to go and find a
                page to complain about. */}
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="me-1.5 size-4" />
              {S.issues.newIssue}
            </Button>
            <ToggleGroup type="single" value={view} onValueChange={setViewMode}>
              <ToggleGroupItem value="board" aria-label={S.issues.boardView} title={S.issues.board}>
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label={S.issues.listView} title={S.issues.list}>
                <List className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
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

      {/* The strip is list-view furniture. On the board every number in it is
          already printed beside a column name — total, ready, blocked — and a
          row of four tiles between the header and the columns was the loudest
          thing on a page whose whole point is that the cards are the content.
          Working is the one figure the columns cannot show, and the spinner on
          each held card shows it in place. */}
      {view === "list" && (
        <StatRow>
          <Stat label={S.issues.statTotal} value={all.length} />
          <Stat label={S.issues.statReady} value={board.cards.ready?.length ?? 0} tone="info" />
          <Stat label={S.issues.statWorking} value={working} tone={working ? "success" : "muted"} />
          <Stat label={S.issues.statBlocked} value={blocked} tone={blocked ? "warning" : "muted"} />
        </StatRow>
      )}

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {view === "list" ? (
        <IssueTable rows={all.filter(match)} />
      ) : (
      <div className="flex flex-1 gap-6 overflow-x-auto pb-4 scrollbar-hide">
        {board.columns.map((col) => {
          const cards = (board.cards[col] ?? []).filter(match);
          return (
            <section
              key={col}
              // No box, no background: a dot, a name, a count, then cards
              // floating on the page itself. Whitespace does the grouping —
              // five bordered columns competed with the cards inside them.
              // The section still stretches to the row's full height, so an
              // empty column stays a full-height drop target.
              className="flex w-72 shrink-0 flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("application/json");
                if (!raw) return;
                const card: Card = JSON.parse(raw);
                if (card.status === col) return;
                // The server enforces this too; refusing here avoids a pointless 409.
                if (!TRANSITIONS[card.status]?.includes(col)) {
                  setErr(S.issues.illegalMove(S.issues.columns[card.status], S.issues.columns[col]));
                  return;
                }
                void move(card, col);
              }}
            >
              {/* An empty column keeps this header and its zero — "Blocked 0"
                  is information: it says nothing is stuck. */}
              <h2 className="flex items-center gap-2 px-2 pb-2.5 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-full bg-current ${STATUS_DOT[col]}`}
                />
                {S.issues.columns[col]}
                <span dir="ltr" className="font-normal tabular-nums text-muted-foreground/70">
                  {cards.length}
                </span>
              </h2>

              <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-hide">
                {cards.map((c, i) => {
                  const agent = agentBySlug.get(c.assignee);
                  return (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("application/json", JSON.stringify(c))
                    }
                    // Restrained on purpose: a board is dragged, and a card that
                    // lifts and glows on hover fights the drag affordance rather
                    // than supporting it. Entrance only, plus a border response
                    // — no translate, and no shadow at all. The card is a
                    // hairline border over a fill a few percent off the page;
                    // that difference, not elevation, is what separates it.
                    style={{ animationDelay: `${Math.min(i, 10) * 20}ms`, animationFillMode: "backwards" }}
                    className="group relative cursor-grab rounded-lg border border-border bg-card p-3
                               transition-colors duration-200 ease-out
                               hover:border-primary/60
                               active:cursor-grabbing
                               animate-in fade-in slide-in-from-bottom-1
                               motion-reduce:animate-none motion-reduce:transition-none"
                  >
                    {/* Provenance leads, metadata follows: who works it and
                        where it lives, both quiet, so the title below is the
                        only loud element. The old leading row of coloured
                        pills made the eye hit priority before the work. */}
                    {(c.humanOnly || !!c.assignee || !!c.area) && (
                      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        {c.humanOnly ? (
                          // Human-only fills the "who" slot: the answer to
                          // "which agent takes this" is nobody, ever — that
                          // is provenance here, not a badge.
                          <span
                            className="inline-flex min-w-0 items-center gap-1"
                            title={S.issues.humanOnlyTitle}
                          >
                            {/* Colour rides the glyph, not the word — the row
                                stays one quiet weight either way. */}
                            <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
                            <span className="truncate">{S.issues.humanOnly}</span>
                          </span>
                        ) : agent ? (
                          <CardAgent agent={agent} />
                        ) : c.assignee ? (
                          // Roster unreachable or the agent was fired — the
                          // slug still names them. Machine name: mono + LTR.
                          <span dir="ltr" className="truncate font-mono">{c.assignee}</span>
                        ) : null}
                        {c.area && (
                          // Where the work lives, trailing — glyph plus bare
                          // text, no chip. A filled pill here read as a badge
                          // and pulled rank over the title underneath it.
                          <span
                            className="ms-auto inline-flex min-w-0 shrink-0 items-center gap-1"
                            title={S.issues.areaTitle}
                          >
                            <Folder aria-hidden="true" className="size-3 shrink-0" />
                            <bdi className="truncate font-mono text-[10px]">{c.area}</bdi>
                          </span>
                        )}
                      </div>
                    )}

                    {/* The one loud thing on the card. Medium, not bold: it
                        only has to beat two whispering rows, not shout. */}
                    <Link
                      to="/issues/$number"
                      params={{ number: String(c.number) }}
                      className="block text-sm font-medium leading-snug text-foreground hover:underline"
                    >
                      {c.title}
                    </Link>

                    {/* The machine identity: mono, dim, LTR. The branch name
                        carries the issue number, so the old "#N" chip was
                        double ink. Constructed from the number — board cards
                        do not ship the branch field, and builder/issue-N is
                        the server's branch-naming contract. */}
                    <div
                      className="mt-1 flex items-center gap-1 text-muted-foreground/80"
                      title={S.issues.branchTitle}
                    >
                      <GitBranch aria-hidden="true" className="size-3 shrink-0" />
                      <span dir="ltr" className="truncate font-mono text-[11px]">
                        builder/issue-{c.number}
                      </span>
                    </div>

                    {/* The bottom row: identity and run state leading, age
                        trailing, everything at one quiet weight. No coloured
                        words survive here — the attempt verdict is a check, a
                        spinner or a cross, and priority is an arrow. */}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5"
                        title={S.issues.numberTitle(c.number)}
                      >
                        <Hash aria-hidden="true" className="size-3" />
                        <bdi className="tabular-nums">{c.number}</bdi>
                      </span>
                      <RunChip card={c} />
                      <PriorityMark priority={c.priority} />
                      {c.commentCount > 0 && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5"
                          title={S.issues.commentsTitle(c.commentCount)}
                        >
                          <MessageSquare aria-hidden="true" className="size-3" />
                          <bdi className="tabular-nums">{c.commentCount}</bdi>
                        </span>
                      )}
                      {/* Age is the last thing checked, so it sits trailing,
                          quiet, out of the reading path. */}
                      <span className="ms-auto shrink-0">{S.issues.ago(c.createdAt)}</span>
                    </div>

                    {/* Keyboard/assistive path — a drag-only board is unusable
                        without a mouse, and the drag handle is the whole card.
                        Revealed on hover/focus: the select is the fallback
                        verb, not the main one, and always-on it was the
                        loudest chrome on a quiet card. Overlaid rather than
                        given its own band: reserving 40px on every card left a
                        visible dead strip under each one, and absolute
                        positioning gets the same no-layout-shift guarantee for
                        free. Pointer events are off until it is revealed, so
                        the whole card stays draggable until you reach for it. */}
                    <Select
                      value={c.status}
                      onValueChange={(v) => void move(c, v as IssueStatus)}
                    >
                      <SelectTrigger
                        aria-label={S.issues.statusOf(c.number)}
                        className="absolute inset-x-3 bottom-3 h-8 w-auto bg-background text-xs
                                   pointer-events-none opacity-0 transition-opacity duration-150
                                   group-hover:pointer-events-auto group-hover:opacity-100
                                   group-focus-within:pointer-events-auto group-focus-within:opacity-100
                                   data-[state=open]:pointer-events-auto data-[state=open]:opacity-100
                                   motion-reduce:transition-none"
                        // The card is the drag handle, so a pointerdown inside
                        // the trigger would start a drag instead of opening it.
                        onPointerDown={(e) => e.stopPropagation()}
                        draggable={false}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={c.status}>{S.issues.columns[c.status]}</SelectItem>
                        {TRANSITIONS[c.status]?.map((t) => (
                          <SelectItem key={t} value={t}>{S.issues.columns[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      )}

      {all.length === 0 && (
        <EmptyState
          title={S.issues.emptyTitle}
          description={S.issues.emptyDesc}
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
  const { S } = useStrings();
  if (rows.length === 0) {
    return <EmptyState title={S.issues.noMatchTitle} description={S.issues.noMatchDesc} />;
  }
  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>{S.issues.colTitle}</TableHead>
            <TableHead className="w-28">{S.issues.colStatus}</TableHead>
            <TableHead className="w-24">{S.issues.colPriority}</TableHead>
            <TableHead className="w-24">{S.issues.colType}</TableHead>
            <TableHead className="w-28">{S.issues.colArea}</TableHead>
            <TableHead className="w-28 text-end">{S.issues.colAge}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell dir="ltr" className="tabular-nums text-muted-foreground">#{c.number}</TableCell>
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
                  <span className="ms-2"><StatusBadge tone="warning">{S.issues.humanOnly}</StatusBadge></span>
                )}
              </TableCell>
              <TableCell><StatusBadge tone="neutral">{S.issues.columns[c.status]}</StatusBadge></TableCell>
              {/* The column header gives the word its meaning, so the baseline
                  values sit as plain text; only a deviation wears the pill —
                  which is what makes a critical row findable in a scan. */}
              <TableCell>
                {c.priority === "critical" || c.priority === "high" ? (
                  <StatusBadge tone={PRIORITY_TONE[c.priority]}>
                    {S.issues.priorities[c.priority]}
                  </StatusBadge>
                ) : (
                  <span className="text-xs text-muted-foreground">{S.issues.priorities[c.priority]}</span>
                )}
              </TableCell>
              <TableCell><DotLabel tone={TYPE_TONE[c.type]}>{S.issues.types[c.type]}</DotLabel></TableCell>
              <TableCell dir="ltr" className="text-xs text-muted-foreground">{c.area || "—"}</TableCell>
              <TableCell className="text-end text-xs text-muted-foreground">{S.issues.ago(c.createdAt)}</TableCell>
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
  const { S } = useStrings();
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
      setErr(S.issues.titleRequired);
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
          <DialogTitle>{S.issues.dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {err && <Callout kind="warn" title={S.issues.dialogErrTitle}>{err}</Callout>}

          <div>
            <Label htmlFor="ni-title" className="mb-1 block text-xs text-muted-foreground">
              {S.issues.titleLabel}
            </Label>
            <Input
              id="ni-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={S.issues.titlePlaceholder}
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
              <Label className="mb-1 block text-xs text-muted-foreground">{S.issues.typeLabel}</Label>
              <Select value={type} onValueChange={(v) => setType(v as IssueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{S.issues.types[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">{S.issues.priorityLabel}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{S.issues.priorities[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ni-area" className="mb-1 block text-xs text-muted-foreground">
              {S.issues.areaLabel}
            </Label>
            <Input
              id="ni-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={S.issues.areaPlaceholder}
            />
            {/* Said out loud, because an unrouted issue sits on the board
                looking claimable and never is. */}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {S.issues.areaHint}
            </p>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">{S.issues.assigneeLabel}</Label>
            <Select value={assignee || "__auto"} onValueChange={(v) => setAssignee(v === "__auto" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* Radix rejects an empty-string value, so the "no choice"
                    option carries a sentinel and is mapped back on the way
                    out. */}
                <SelectItem value="__auto">{S.issues.assigneeAuto}</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.slug} value={a.slug}>
                    {a.displayName || a.slug}
                    {!a.enabled && S.issues.assigneeDisabled}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {S.issues.assigneeHint}
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
              <span className="text-sm font-medium">{S.issues.humanOnly}</span>
              <span className="block text-xs text-muted-foreground">
                {S.issues.humanOnlyDesc}
              </span>
            </Label>
          </div>

          <div>
            <Label htmlFor="ni-body" className="mb-1 block text-xs text-muted-foreground">
              {S.issues.detailsLabel}
            </Label>
            {/* The body is rendered as markdown on the issue page, in the
                widget and in the agent's own prompt, so it is written as
                markdown here too rather than in a bare textarea. */}
            <MarkdownEditor
              value={body}
              onChange={setBody}
              defaultView="write"
              minRows={6}
              placeholder={S.issues.detailsPlaceholder}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {S.issues.detailsHint}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>{S.common.cancel}</Button>
            <Button onClick={() => void submit()} disabled={busy || !title.trim()}>
              {busy ? S.issues.filing : S.issues.fileIssue}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
NewIssueDialog.displayName = "NewIssueDialog";
