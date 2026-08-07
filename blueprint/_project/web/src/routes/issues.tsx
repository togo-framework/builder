import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Callout, EmptyState, Input, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatCard, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, ToggleGroup, ToggleGroupItem,
} from "@togo-framework/ui";
import {
  COLUMN_LABEL, TRANSITIONS, ago, fetchBoard, patchIssue,
  type Board, type Card, type IssueStatus,
} from "../lib/issues";

/**
 * The board is built on togo UI primitives — PageHeader, StatCard, StatusBadge,
 * EmptyState, Callout — but the kanban itself is domain-specific.
 *
 * togo ships `IssuesList`/`IssueDetail`, and they are deliberately NOT used here:
 * their `Issue` type is a crash report (level, count, userCount, stack,
 * breadcrumbs; status unresolved|resolved|ignored). That is error tracking, not
 * work tracking. Mapping this board onto it would drop the seven-column status
 * machine, the human-only flag, agent leases, attempt counts and priority — a
 * downgrade dressed up as reuse. The primitives are shared; the domain is not.
 */

// StatCard and StatusBadge take DIFFERENT tone unions — StatCard says "muted",
// StatusBadge says "neutral". Read from the .d.ts rather than assumed shared.
type BadgeTone = "success" | "info" | "neutral" | "warning" | "danger";
type CardTone = "default" | "success" | "info" | "muted" | "warning" | "danger";

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

export function Issues() {
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
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
    return (
      <div className="p-6">
        <PageHeader title="Issues" description="Loading the board…" />
      </div>
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
    <div className="flex h-full flex-col gap-4 p-6">
      <PageHeader
        title="Issues"
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
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={String(all.length)} />
        <StatCard label="Ready" value={String(board.cards.ready?.length ?? 0)} tone="info" />
        <StatCard label="Agents working" value={String(working)} tone={(working ? "success" : "muted") as CardTone} />
        <StatCard label="Blocked" value={String(blocked)} tone={(blocked ? "warning" : "muted") as CardTone} />
      </div>

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}

      {view === "list" ? (
        <IssueTable rows={all.filter(match)} />
      ) : (
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {board.columns.map((col) => {
          const cards = (board.cards[col] ?? []).filter(match);
          return (
            <section
              key={col}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
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

              <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2">
                {cards.map((c) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("application/json", JSON.stringify(c))
                    }
                    className="cursor-grab rounded-md border border-border bg-background p-3 shadow-sm active:cursor-grabbing"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        #{c.number}
                      </span>
                      <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>
                      {c.humanOnly && (
                        <span title="Agents will never claim this issue">
                          <StatusBadge tone="warning">Human only</StatusBadge>
                        </span>
                      )}
                      <span className="ms-auto">
                        <StatusBadge tone={TYPE_TONE[c.type]}>{c.type}</StatusBadge>
                      </span>
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
                      {c.commentCount > 0 && <span>💬 {c.commentCount}</span>}
                      {c.attempts > 0 && <span title="Agent attempts">↻ {c.attempts}</span>}
                      {c.busy && (
                        <span className="text-emerald-600" title="An agent holds a lease on this issue">
                          ● working
                        </span>
                      )}
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
    </div>
  );
}

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
                {c.busy && (
                  <span className="ms-2 text-[11px] text-emerald-600" title="An agent holds a lease">
                    ● working
                  </span>
                )}
                {c.humanOnly && (
                  <span className="ms-2"><StatusBadge tone="warning">Human only</StatusBadge></span>
                )}
              </TableCell>
              <TableCell><StatusBadge tone="neutral">{COLUMN_LABEL[c.status]}</StatusBadge></TableCell>
              <TableCell><StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge></TableCell>
              <TableCell><StatusBadge tone={TYPE_TONE[c.type]}>{c.type}</StatusBadge></TableCell>
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
