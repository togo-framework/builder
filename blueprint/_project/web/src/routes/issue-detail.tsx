import { useEffect, useState } from "react";
import {
  AppWindow, Bot, Boxes, Check, ChevronDown, ChevronRight, ChevronUp, CircleAlert, Clock, Copy,
  Crosshair, ExternalLink, Flag, GitBranch, Globe, History, Link2, MoreHorizontal,
  Route as RouteIcon, Send, Star, Tag, Terminal, Trash2, TriangleAlert, User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listAgents, type Agent } from "../lib/agents";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Callout, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label, MarkdownEditor, MarkdownRenderer, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge,
} from "@togo-framework/ui";
import {
  TRANSITIONS, addComment, deleteIssue, fetchBoard, fetchIssue, patchIssue,
  type Activity, type BrowserContext, type Comment, type ConsoleEntry, type Detail,
  type IssueStatus, type IssueType, type NetworkEntry, type Priority,
} from "../lib/issues";
import { DeployPanel } from "../components/deploy-panel";
import { useStrings } from "../lib/i18n";

// The ONLY colour on this page outside error semantics: the status and
// priority glyphs in the properties rail. Everything else is greyscale so the
// two signals that drive triage decisions are the two things that pop.
const STATUS_DOT: Record<IssueStatus, string> = {
  triage: "bg-muted-foreground/60",
  ready: "bg-primary/70",
  in_progress: "bg-primary",
  blocked: "bg-destructive",
  in_review: "bg-warning",
  done: "bg-success",
  rejected: "bg-muted-foreground/40",
};

const PRIORITY_DOT: Record<Priority, string> = {
  low: "bg-muted-foreground/40",
  normal: "bg-muted-foreground/70",
  high: "bg-warning",
  critical: "bg-destructive",
};

/** Quiet rail controls: they read as text until you reach for them. */
const RAIL_TRIGGER =
  "h-8 w-full border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-muted";

/**
 * Comments and events merged into one chronological thread. Comments keep
 * their card weight — they carry reasoning. Events collapse to one quiet
 * line — a status change is a fact, not a paragraph.
 */
type ThreadItem =
  | { kind: "comment"; at: number; comment: Comment }
  | { kind: "event"; at: number; event: Activity };

/**
 * The board order, flattened, so the header can offer "next issue" without a
 * round trip to the board. Triage is a sequence: read, decide, move on. Going
 * back to the board between every issue is the tax this removes.
 */
const useSiblings = (current: number) => {
  const [numbers, setNumbers] = useState<number[]>([]);

  useEffect(() => {
    void fetchBoard()
      .then((b) => setNumbers(b.columns.flatMap((c) => (b.cards[c] ?? []).map((k) => k.number))))
      .catch(() => setNumbers([]));
  }, []);

  const index = numbers.indexOf(current);
  return {
    total: numbers.length,
    position: index + 1,
    prev: index > 0 ? numbers[index - 1] : null,
    next: index >= 0 && index < numbers.length - 1 ? numbers[index + 1] : null,
  };
};

const STAR_KEY = "builder.starred-issues";

/**
 * Starring is local to the browser: the API has no favourites and inventing a
 * server field for a personal bookmark would be the wrong place to put it.
 */
const useStar = (number: number) => {
  const [starred, setStarred] = useState(false);

  const read = (): number[] => {
    try {
      const raw = window.localStorage.getItem(STAR_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
    } catch (error) {
      console.error("[IssueDetail]", "could not read the starred list", error);
      return [];
    }
  };

  useEffect(() => { setStarred(read().includes(number)); }, [number]);

  const toggle = () => {
    const next = read().includes(number)
      ? read().filter((n) => n !== number)
      : [...read(), number];
    try {
      window.localStorage.setItem(STAR_KEY, JSON.stringify(next));
      setStarred(next.includes(number));
    } catch (error) {
      console.error("[IssueDetail]", "could not save the starred list", error);
    }
  };

  return { starred, toggle };
};

export const IssueDetail = () => {
  const { S } = useStrings();
  const T = S.issueDetail;
  const { number } = useParams({ from: "/_app/issues/$number" });
  const [issue, setIssue] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const nav = useNavigate();
  const siblings = useSiblings(Number(number));
  const star = useStar(Number(number));

  useEffect(() => { void listAgents().then(setAgents).catch(() => {}); }, []);

  const load = () =>
    fetchIssue(number).then(setIssue).catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    setIssue(null);
    setErr("");
    void load();
  }, [number]);

  async function handleDelete() {
    setDeleting(true);
    setErr("");
    try {
      await deleteIssue(Number(number));
      // Back to the board: the page we are on no longer exists.
      void nav({ to: "/issues" });
    } catch (e) {
      // The common failure is a 409 while an agent holds the lease, which is
      // the server protecting a running session — show it rather than retry.
      setErr(String((e as Error).message));
      setDeleting(false);
      setConfirming(false);
    }
  }

  async function handleUpdate(patch: Parameters<typeof patchIssue>[1]) {
    try {
      await patchIssue(number, patch);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function handleComment() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await addComment(number, body, "you");
      setDraft("");
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setSending(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1600);
    } catch (error) {
      console.error("[IssueDetail]", "could not copy the issue link", error);
    }
  }

  if (err && !issue) {
    return (
      <div className="p-8">
        <Link to="/issues" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
          <Boxes aria-hidden="true" className="size-3.5" />
          {S.issues.title}
        </Link>
        <div className="mt-4"><Callout kind="warn" title={T.loadErrTitle}>{err}</Callout></div>
      </div>
    );
  }
  if (!issue) return <p className="p-8 text-sm text-muted-foreground">{S.common.loading}</p>;

  const thread: ThreadItem[] = [
    ...issue.comments.map((c) => ({ kind: "comment" as const, at: Date.parse(c.createdAt), comment: c })),
    ...issue.activity.map((a) => ({ kind: "event" as const, at: Date.parse(a.createdAt), event: a })),
  ].sort((x, y) => x.at - y.at);

  const labels = issue.labels ?? [];
  // Which of a shell's hosted apps this came from. Surfaced HERE, in the
  // always-open links block, rather than inside the collapsed captured-context
  // section: "is this bug in the app, in auth, or in the dashboard?" is the
  // first question triage asks, and an answer you have to expand a disclosure
  // to find is an answer most readers never see.
  const reportedApp = issue.context?.app;
  const appName = reportedApp?.name || reportedApp?.id || "";
  const linkCount = (appName ? 1 : 0) + (issue.pageUrl ? 1 : 0) + (issue.prUrl ? 1 : 0);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-4">
      {/* Top bar: where you are, what you can do to this issue, and the way
          out to the next one — the whole reason you can triage without ever
          returning to the board. */}
      <header className="flex items-center gap-1 border-b border-border pb-2.5">
        <nav aria-label={S.issues.title} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Link
            to="/issues"
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 motion-hover hover:bg-muted hover:text-foreground"
          >
            <Boxes aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{S.issues.title}</span>
          </Link>
          <ChevronRight aria-hidden="true" className="size-3 shrink-0 opacity-50 rtl:rotate-180" />
          <span className="px-0.5 font-medium tabular-nums text-foreground" dir="ltr">#{issue.number}</span>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={T.moreActions}
              title={T.moreActions}
              className="rounded p-1 text-muted-foreground motion-hover hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onSelect={() => void handleCopyLink()}>
              {linkCopied
                ? <Check aria-hidden="true" className="me-2 size-3.5 text-success" />
                : <Copy aria-hidden="true" className="me-2 size-3.5" />}
              {linkCopied ? T.copiedLink : T.copyLink}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setConfirming(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 aria-hidden="true" className="me-2 size-3.5" />
              {T.deleteCta}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={star.toggle}
          aria-pressed={star.starred}
          aria-label={star.starred ? T.starRemove : T.starAdd}
          title={star.starred ? T.starRemove : T.starAdd}
          className="rounded p-1 text-muted-foreground motion-hover hover:bg-muted hover:text-foreground"
        >
          <Star aria-hidden="true" className={star.starred ? "size-4 fill-current text-warning" : "size-4"} />
        </button>

        {siblings.position > 0 && siblings.total > 1 && (
          <div className="ms-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="tabular-nums" dir="ltr">
              {T.pagerPosition(siblings.position, siblings.total)}
            </span>
            <PagerStep to={siblings.prev} label={T.pagerPrev} icon={ChevronUp} />
            <PagerStep to={siblings.next} label={T.pagerNext} icon={ChevronDown} />
          </div>
        )}
      </header>

      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

      {/* The rail is FIRST in the DOM so that below lg it stacks above the
          content — properties stay reachable on a phone instead of living a
          full page-scroll away. On lg, explicit grid placement swaps it to
          the trailing column. */}
      <div className="mt-5 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_264px]">
        <aside className="text-sm lg:col-start-2 lg:row-start-1">
          <div className="lg:sticky lg:top-4">
            <h2 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{T.propertiesHeading}</h2>

            <div className="flex flex-col">
              <PropRow
                icon={<span className={`size-2.5 rounded-full ${STATUS_DOT[issue.status]}`} />}
                label={S.issues.colStatus}
              >
                <Select
                  value={issue.status}
                  onValueChange={(v) => void handleUpdate({ status: v as IssueStatus })}
                >
                  <SelectTrigger className={RAIL_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* The current status plus everything it may legally move to —
                        the allowed set is the transition table, not every status. */}
                    <SelectItem value={issue.status}>{S.issues.columns[issue.status]}</SelectItem>
                    {TRANSITIONS[issue.status]?.map((t) => (
                      <SelectItem key={t} value={t}>{S.issues.columns[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>

              <PropRow
                icon={<span className={`size-2.5 rounded-full ${PRIORITY_DOT[issue.priority]}`} />}
                label={S.issues.colPriority}
              >
                <Select
                  value={issue.priority}
                  onValueChange={(v) => void handleUpdate({ priority: v as Priority })}
                >
                  <SelectTrigger className={RAIL_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(S.issues.priorities) as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>{S.issues.priorities[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>

              <PropRow icon={<Flag className="size-3.5" />} label={S.issues.colType}>
                <Select
                  value={issue.type}
                  onValueChange={(v) => void handleUpdate({ type: v as IssueType })}
                >
                  <SelectTrigger className={RAIL_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(S.issues.types) as IssueType[]).map((t) => (
                      <SelectItem key={t} value={t}>{S.issues.types[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>

              <PropRow
                icon={<User className="size-3.5" />}
                label={S.issues.assigneeLabel}
                hint={issue.assignee ? T.onlyClaim(issue.assignee) : undefined}
              >
                {/* One control for the whole routing decision: a specific agent, any
                    agent that owns the area, or a person. Splitting "assignee" from
                    "human only" made it possible to set both and get a silently
                    unclaimable issue. */}
                <Select
                  value={issue.humanOnly ? "__human__" : (issue.assignee || "__auto__")}
                  onValueChange={(v) => {
                    if (v === "__human__") return void handleUpdate({ humanOnly: true, assignee: "" });
                    if (v === "__auto__") return void handleUpdate({ humanOnly: false, assignee: "" });
                    void handleUpdate({ assignee: v, humanOnly: false });
                  }}
                >
                  <SelectTrigger className={RAIL_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">{T.assigneeAnyArea}</SelectItem>
                    <SelectItem value="__human__">{T.assigneeHuman}</SelectItem>
                    {agents.filter((a) => a.enabled && a.role === "builder").map((a) => (
                      <SelectItem key={a.slug} value={a.slug}>
                        {a.displayName || a.slug}
                        {a.areas.length ? ` — ${a.areas.slice(0, 3).join(", ")}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>

              {/* Labels are read-only here — the API has no label patch — but an
                  empty set still shows, the way Linear keeps "Set milestone"
                  visible rather than hiding a property that has no value. */}
              <PropRow icon={<Tag className="size-3.5" />} label={T.labelsLabel}>
                {labels.length ? (
                  <div className="flex flex-wrap gap-1 py-1.5">
                    {labels.map((l) => (
                      <span key={l} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        <bdi>{l}</bdi>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{T.labelsEmpty}</p>
                )}
              </PropRow>

              <PropRow icon={<Boxes className="size-3.5" />} label={S.issues.colArea}>
                <Input
                  defaultValue={issue.area}
                  onBlur={(e) => e.target.value !== issue.area && void handleUpdate({ area: e.target.value })}
                  placeholder={T.setArea}
                  className="h-8 border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-muted focus-visible:border-border"
                />
              </PropRow>

              <PropRow icon={<RouteIcon className="size-3.5" />} label={T.sourceLabel}>
                {/* Source values ("feedback", "manual") are machine identifiers. */}
                <p className="px-2 py-1.5 text-xs"><bdi>{issue.source}</bdi></p>
              </PropRow>

              <PropRow icon={<GitBranch className="size-3.5" />} label={T.branchLabel}>
                {issue.branch ? (
                  <p className="break-all px-2 py-1.5 font-mono text-[11px]" dir="ltr">{issue.branch}</p>
                ) : (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">{T.branchEmpty}</p>
                )}
              </PropRow>

              <PropRow icon={<History className="size-3.5" />} label={T.attemptsLabel}>
                <p className="px-2 py-1.5 text-xs tabular-nums" dir="ltr">{issue.attempts}</p>
              </PropRow>

              {issue.route && (
                <PropRow icon={<RouteIcon className="size-3.5" />} label={T.routeLabel}>
                  <p className="break-all px-2 py-1.5 font-mono text-[11px]" dir="ltr">{issue.route}</p>
                </PropRow>
              )}

              {/* Only while an agent actually holds this issue. The tmux session is
                  created for the run and dies with it, so showing the command on a
                  finished issue would hand the operator something that just errors. */}
              {issue.busy && (
                <PropRow icon={<Terminal className="size-3.5" />} label={T.tmuxLabel}>
                  <div className="pt-1">
                    <TmuxAttach
                      session={`builder-issue-${issue.number}-${issue.attempts}`}
                      copyLabel={T.tmuxCopy}
                      copiedLabel={T.tmuxCopied}
                      hint={T.tmuxHint}
                    />
                  </div>
                </PropRow>
              )}
            </div>

            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-border p-2.5">
              <Checkbox
                id="human-only"
                checked={issue.humanOnly}
                onCheckedChange={(v) => void handleUpdate({ humanOnly: v === true })}
                className="mt-0.5"
              />
              <Label htmlFor="human-only" className="cursor-pointer font-normal">
                <span className="text-xs font-medium">{S.issues.humanOnly}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  {S.issues.humanOnlyDesc}
                </span>
              </Label>
            </div>
          </div>
        </aside>

        <main className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight" dir="auto">{issue.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{T.opened(T.ago(issue.createdAt))}</span>
            {issue.busy && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5" title={S.issues.workingTitle}>
                  {/* Greyscale on purpose — the pulse alone says "alive". */}
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-foreground/70" />
                  {S.issues.working}
                </span>
              </>
            )}
          </p>

          {/* The description IS the page — no heading, no box, straight under
              the title, like a document. */}
          <div className="mt-5 text-sm leading-relaxed" dir="auto">
            {issue.body ? (
              <MarkdownRenderer content={issue.body} />
            ) : (
              <span className="text-muted-foreground">{T.noDescription}</span>
            )}
          </div>

          {linkCount > 0 && (
            <Section title={T.linksHeading} count={linkCount}>
              <div className="flex flex-col gap-2">
                {appName && (
                  <ObjectRow
                    icon={AppWindow}
                    name={T.appLabel}
                    // The name is what the operator called it; the origin is
                    // what the browser calls it, and it is the part that
                    // settles an argument about which deployment this was.
                    // Rendered as text, never as a link: it is a value the
                    // ingress accepted, and a clickable one would be an open
                    // redirect wearing an issue page.
                    meta={
                      <span dir="auto">
                        {appName}
                        {reportedApp?.origin ? ` — ${reportedApp.origin}` : ""}
                      </span>
                    }
                  />
                )}
                {issue.pageUrl && (
                  <ObjectRow
                    icon={Globe}
                    name={T.reportedFrom}
                    meta={<span dir="ltr">{issue.pageUrl}</span>}
                    trailing={<OpenAction href={issue.pageUrl} label={T.openLink} />}
                  />
                )}
                {issue.prUrl && (
                  <ObjectRow
                    icon={GitBranch}
                    name={T.prLabel}
                    meta={<span dir="ltr">{issue.prUrl}</span>}
                    trailing={<OpenAction href={issue.prUrl} label={T.openLink} />}
                  />
                )}
              </div>
            </Section>
          )}

          {issue.pins.length > 0 && (
            <Section title={T.pinnedHeading} count={issue.pins.length}>
              <div className="flex flex-col gap-2">
                {issue.pins.map((p) => (
                  <div key={p.ordinal} className="rounded-lg border border-border">
                    {/* The pin is an object, not a link: a tile, a name, and the
                        one fact that says whether it can be found again. */}
                    <div className="flex items-center gap-3 p-2.5">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted/40">
                        <Crosshair className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" dir="ltr">
                          &lt;{p.tag || "?"}&gt;{p.name && ` — “${p.name}”`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.verified.length ? (
                            <bdi>{p.verified.join(", ")}</bdi>
                          ) : (
                            T.pinNoStrategy
                          )}
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 border-t border-border p-3 text-xs">
                      {p.testid && (<><dt className="text-muted-foreground">testid</dt><dd className="break-all font-mono" dir="ltr">{p.testid}</dd></>)}
                      {p.role && (<><dt className="text-muted-foreground">role</dt><dd className="font-mono" dir="ltr">{p.role}</dd></>)}
                      {p.css && (<><dt className="text-muted-foreground">css path</dt><dd className="break-all font-mono" dir="ltr">{p.css}</dd></>)}
                      {p.hint && (<><dt className="text-muted-foreground">text</dt><dd className="break-all" dir="auto">{p.hint}</dd></>)}
                      <dt className="text-muted-foreground">{T.pinVerified}</dt>
                      <dd>
                        {p.verified.length ? (
                          p.verified.map((v) => (
                            <span key={v} className="me-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/80">
                              {v}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">{T.pinNoStrategy}</span>
                        )}
                      </dd>
                    </dl>
                    {/* Honest about the weak case: a css-only pin is the one that
                        silently re-resolves to the wrong element after a reorder. */}
                    {p.verified.length === 1 && p.verified[0] === "css" && (
                      <div className="p-3 pt-0">
                        <Callout kind="warn" title={T.fragileTitle}>
                          {T.fragileBefore}
                          <code className="font-mono">data-testid</code>
                          {T.fragileAfter}
                        </Callout>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <BrowserContextSection context={issue.context} />

          <div className="mt-6">
            <DeployPanel number={Number(number)} onDeployed={() => void load()} />
          </div>

          <section className="mt-8 border-t border-border pt-5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium text-foreground/80">{T.activityHeading}</h2>
              {thread.length > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{thread.length}</span>
              )}
            </div>

            {thread.length === 0 && (
              <div className="mt-3">
                <EmptyState title={T.emptyThreadTitle} description={T.emptyThreadDesc} />
              </div>
            )}

            {/* One stream, two weights: a comment carries reasoning and gets a
                card; an event is a fact and gets a line. The thread line makes
                them one conversation rather than two lists. */}
            <ol className="mt-4 flex flex-col">
              {thread.map((item, i) =>
                item.kind === "comment" ? (
                  <li key={`c-${item.comment.id}`} className="relative flex gap-3 pb-4">
                    <ThreadLine />
                    <ActorAvatar name={item.comment.author} agent={item.comment.kind === "agent"} />
                    <article className="min-w-0 flex-1 rounded-lg border border-border">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground"><bdi>{item.comment.author}</bdi></span>
                        {item.comment.kind === "agent" && (
                          <StatusBadge tone="neutral">{T.agentBadge}</StatusBadge>
                        )}
                        <span aria-hidden>·</span>
                        <span>{T.ago(item.comment.createdAt)}</span>
                      </p>
                      <div className="px-3 py-2.5 text-sm leading-relaxed" dir="auto">
                        <MarkdownRenderer content={item.comment.body} />
                      </div>
                    </article>
                  </li>
                ) : (
                  <li key={`e-${i}`} className="relative flex items-center gap-3 pb-4">
                    <ThreadLine />
                    <span aria-hidden className="relative grid size-6 shrink-0 place-items-center rounded-full bg-background">
                      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    </span>
                    <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        <span className="text-foreground/80"><bdi>{item.event.actorKind}</bdi></span> {item.event.action}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{S.issues.ago(item.event.createdAt)}</span>
                    </p>
                  </li>
                )
              )}
            </ol>

            {/* The composer is the last node of the stream, always visible —
                answering should never require finding a button first. */}
            <div className="flex gap-3">
              <ActorAvatar name={T.youLabel} />
              <div className="min-w-0 flex-1">
                <MarkdownEditor
                  value={draft}
                  onChange={setDraft}
                  // The kit defaults to "split", which halves the writing area to
                  // preview a comment that is usually two lines of plain prose.
                  // Start on write; preview is one click away when it is wanted.
                  defaultView="write"
                  placeholder={T.commentPlaceholder}
                  minRows={3}
                />
                <div className="mt-2 flex items-center">
                  <Button
                    size="sm"
                    className="ms-auto"
                    aria-label={T.sendComment}
                    onClick={() => void handleComment()}
                    disabled={sending || !draft.trim()}
                  >
                    <Send aria-hidden="true" className="me-1.5 size-3.5 rtl:-scale-x-100" />
                    {sending ? T.posting : T.commentCta}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Controlled rather than trigger-bound: the way in is the ··· menu, and
          a menu item cannot also be a dialog trigger. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T.deleteTitle(number)}</AlertDialogTitle>
            <AlertDialogDescription>{T.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T.keep}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? T.deleting : T.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
IssueDetail.displayName = "IssueDetail";

/**
 * One step of the header pager. A missing neighbour still renders, greyed:
 * the control must not move under the pointer at the ends of the list.
 */
const PagerStep = ({ to, label, icon: Icon }: { to: number | null; label: string; icon: LucideIcon }) => {
  if (to === null) {
    return (
      <span aria-hidden className="rounded p-1 text-muted-foreground/30">
        <Icon className="size-3.5" />
      </span>
    );
  }
  return (
    <Link
      to="/issues/$number"
      params={{ number: String(to) }}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground motion-hover hover:bg-muted hover:text-foreground"
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </Link>
  );
};
PagerStep.displayName = "PagerStep";

/** The faint vertical line that makes the activity read as one thread. */
const ThreadLine = () => (
  <span aria-hidden className="absolute inset-y-0 start-3 w-px bg-border" />
);
ThreadLine.displayName = "ThreadLine";

/** Initials for a person, a glyph for an agent — sized to sit on the thread line. */
const ActorAvatar = ({ name, agent }: { name: string; agent?: boolean }) => (
  <span
    aria-hidden
    className="relative grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background text-[10px] font-medium uppercase text-muted-foreground"
  >
    {agent ? <Bot className="size-3.5" /> : <bdi>{name.trim().slice(0, 1) || "?"}</bdi>}
  </span>
);
ActorAvatar.displayName = "ActorAvatar";

/**
 * A collapsible group: `▾ Title  count` with room for an action at the
 * trailing edge. Sections that hold nothing are never rendered by the caller,
 * so an open section always has something in it.
 */
const Section = ({
  title, count, action, defaultOpen = true, children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const handleToggle = () => setOpen((o) => !o);

  return (
    <section className="mt-6">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-start text-xs font-medium text-foreground/80 motion-hover hover:bg-muted"
        >
          {/* Open points down; closed points into the reading direction. */}
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`}
          />
          <span className="truncate">{title}</span>
          {count !== undefined && (
            <span className="shrink-0 font-normal tabular-nums text-muted-foreground" dir="ltr">{count}</span>
          )}
        </button>
        {action && <div className="ms-auto flex shrink-0 items-center gap-0.5">{action}</div>}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
};
Section.displayName = "Section";

/**
 * A captured artefact rendered as an object: a tile, a name, and one line of
 * detail beneath. Deliberately not a bare hyperlink — these are things the
 * report carries, and they should look like things.
 */
const ObjectRow = ({
  icon: Icon, name, meta, trailing,
}: {
  icon: LucideIcon;
  name: string;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
}) => (
  <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted/40">
      <Icon className="size-4 text-muted-foreground" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{name}</p>
      {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
    </div>
    {trailing}
  </div>
);
ObjectRow.displayName = "ObjectRow";

const OpenAction = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
    title={label}
    className="shrink-0 rounded p-1.5 text-muted-foreground motion-hover hover:bg-muted hover:text-foreground"
  >
    <ExternalLink aria-hidden="true" className="size-3.5" />
  </a>
);
OpenAction.displayName = "OpenAction";

/**
 * A properties row: a quiet label at the start, the value trailing it. The
 * label column is fixed so the values line up into a column of their own —
 * the rail reads as a table of facts, never as a form.
 */
const PropRow = ({
  icon, label, hint, children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-2">
    <span className="flex w-[88px] shrink-0 items-center gap-1.5 pt-2 text-xs text-muted-foreground">
      <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
    <div className="min-w-0 flex-1">
      {children}
      {hint && <p className="px-2 pb-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  </div>
);
PropRow.displayName = "PropRow";

/**
 * The command that attaches a terminal to the agent working this issue.
 *
 * The session name is derived, not fetched: the runner names every session
 * `builder-issue-<number>-<attempt>`, so the page already knows it and no API
 * round trip is needed. If that naming ever changes in internal/runner, this
 * breaks silently — the one cost of deriving rather than reading it back.
 *
 * The command is machine text and stays LTR in Arabic, but the hint beside it
 * is prose and must not be dragged along with it, so the isolate is on the
 * command alone rather than the row.
 */
const TmuxAttach = ({
  session, copyLabel, copiedLabel, hint,
}: { session: string; copyLabel: string; copiedLabel: string; hint: string }) => {
  const [copied, setCopied] = useState(false);
  const command = `tmux attach -t ${session}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("[TmuxAttach]", "could not copy the attach command", error);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-field border border-border bg-muted/40 px-2 py-1.5">
        <Terminal aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <code dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[11px]">{command}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
          className="shrink-0 rounded p-1 text-muted-foreground motion-hover hover:bg-background hover:text-foreground"
        >
          {copied
            ? <Check aria-hidden="true" className="size-3.5 text-success" />
            : <Copy aria-hidden="true" className="size-3.5" />}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
};
TmuxAttach.displayName = "TmuxAttach";

// --- Browser context ---------------------------------------------------------
//
// The console/network snapshot a bridge-mode SDK volunteers with a report.
// Collapsed by default: it is reference material, not the report itself, and
// an open 200-line log would push the discussion off the screen. The header
// still surfaces the error counts while collapsed — the one fact a reader
// wants before deciding whether to expand.
//
// Most issues have no context at all (hand-filed, agent-filed, opted out), and
// those render exactly as before: the section returns null rather than showing
// an empty shell on every issue.
//
// The destructive/warning tints inside the logs survive the page's greyscale
// rule on purpose: they are error SEMANTICS in diagnostic data, not layout
// decoration, and a log where errors do not stand out is useless.

/** Wall-clock time of a captured entry; ring-buffer timestamps are epoch ms. */
const tsTime = (ts?: number): string =>
  ts ? new Date(ts).toLocaleTimeString(undefined, { hour12: false }) : "";

const CONSOLE_TONE: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-muted-foreground",
  debug: "text-muted-foreground",
  log: "text-muted-foreground",
};

const ConsoleLine = ({ entry }: { entry: ConsoleEntry }) => (
  <li
    className={`flex items-start gap-2 px-3 py-1 font-mono text-xs leading-relaxed ${
      entry.level === "error" ? "bg-destructive/10" : ""
    }`}
  >
    {entry.level === "error" && (
      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
    )}
    {entry.level === "warn" && (
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
    )}
    <span className={`min-w-0 break-all ${CONSOLE_TONE[entry.level] ?? "text-muted-foreground"}`}>
      <span className="me-2 select-none uppercase opacity-60">{entry.level}</span>
      {entry.text}
    </span>
    {entry.ts ? (
      <span className="ms-auto shrink-0 tabular-nums text-muted-foreground/60">{tsTime(entry.ts)}</span>
    ) : null}
  </li>
);
ConsoleLine.displayName = "ConsoleLine";

/** Requests slower than this get flagged — a second of waiting is user-visible. */
const SLOW_MS = 1000;

const isFailed = (r: NetworkEntry): boolean => r.status === 0 || r.status >= 400;

const NetworkLine = ({ entry }: { entry: NetworkEntry }) => {
  const failed = isFailed(entry);
  const slow = !failed && entry.durationMs >= SLOW_MS;
  return (
    <li
      className={`flex items-start gap-2 px-3 py-1 font-mono text-xs leading-relaxed ${
        failed ? "bg-destructive/10" : ""
      }`}
    >
      {failed && <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
      {slow && <Clock className="mt-0.5 size-3.5 shrink-0 text-warning" />}
      <span className={`shrink-0 font-semibold ${failed ? "text-destructive" : "text-muted-foreground"}`}>
        {/* Status 0 is "never completed" — a network error, CORS block or
            abort. Rendering "0" would read as an HTTP code that doesn't exist. */}
        {entry.status === 0 ? "ERR" : entry.status}
      </span>
      <span className="shrink-0 text-muted-foreground">{entry.method}</span>
      <span className={`min-w-0 break-all ${failed ? "text-destructive" : "text-foreground"}`}>
        {entry.url}
      </span>
      <span className={`ms-auto shrink-0 tabular-nums ${slow ? "text-warning" : "text-muted-foreground/60"}`}>
        {entry.durationMs}ms
      </span>
    </li>
  );
};
NetworkLine.displayName = "NetworkLine";

const BrowserContextSection = ({ context }: { context?: BrowserContext }) => {
  const { S } = useStrings();
  const T = S.issueDetail;
  const [copied, setCopied] = useState(false);

  const consoleEntries = context?.console ?? [];
  const network = context?.network ?? [];
  const hasEnv = Boolean(context?.viewport || context?.userAgent || context?.locale);
  // No context captured → no section at all. Rendering an empty "Browser
  // context" on the many issues that have none would be pure noise.
  if (!context || (consoleEntries.length === 0 && network.length === 0 && !hasEnv)) return null;

  // Errors first, each group in captured order. The person opening a bug
  // report is looking for the failure, not for the page-load chatter above it.
  const consoleErrors = consoleEntries.filter((e) => e.level === "error");
  const consoleRest = consoleEntries.filter((e) => e.level !== "error");
  const failedReqs = network.filter(isFailed);
  const okReqs = network.filter((r) => !isFailed(r));

  const handleCopyLog = async () => {
    const text = [
      ...consoleEntries.map((e) => `[${e.level}] ${e.text}`),
      ...network.map((r) => `${r.status === 0 ? "ERR" : r.status} ${r.method} ${r.url} ${r.durationMs}ms`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("[BrowserContextSection]", "could not copy the captured log", error);
    }
  };

  return (
    <Section
      title={T.contextHeading}
      count={consoleEntries.length + network.length}
      defaultOpen={false}
      action={
        <button
          type="button"
          onClick={() => void handleCopyLog()}
          aria-label={copied ? T.copiedLog : T.copyLog}
          title={copied ? T.copiedLog : T.copyLog}
          className="rounded p-1 text-muted-foreground motion-hover hover:bg-muted hover:text-foreground"
        >
          {copied
            ? <Check aria-hidden="true" className="size-3.5 text-success" />
            : <Copy aria-hidden="true" className="size-3.5" />}
        </button>
      }
    >
      {/* The error counts sit above the logs rather than in the header: the
          header stays a header, and the counts stay the reason to read on. */}
      {(consoleErrors.length > 0 || failedReqs.length > 0) && (
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {consoleErrors.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
              <CircleAlert aria-hidden="true" className="size-3" />
              {T.errorsCount(consoleErrors.length)}
            </span>
          )}
          {failedReqs.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
              <Globe aria-hidden="true" className="size-3" />
              {T.failedCount(failedReqs.length)}
            </span>
          )}
          <span className="text-muted-foreground">
            {T.contextSummary(consoleEntries.length, network.length)}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        {consoleEntries.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <p className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Terminal aria-hidden="true" className="size-3.5" /> {T.consoleHeading}
            </p>
            {/* Logs are LTR machine text even on an RTL page. */}
            <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto py-1" dir="ltr">
              {consoleErrors.map((e, i) => <ConsoleLine key={`err-${i}`} entry={e} />)}
              {consoleRest.map((e, i) => <ConsoleLine key={`log-${i}`} entry={e} />)}
            </ul>
          </div>
        )}

        {network.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <p className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Globe aria-hidden="true" className="size-3.5" /> {T.networkHeading}
            </p>
            <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto py-1" dir="ltr">
              {failedReqs.map((r, i) => <NetworkLine key={`bad-${i}`} entry={r} />)}
              {okReqs.map((r, i) => <NetworkLine key={`ok-${i}`} entry={r} />)}
            </ul>
          </div>
        )}

        {hasEnv && (
          <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-xs">
            {context.viewport && (
              <>
                <dt className="text-muted-foreground">{T.viewportLabel}</dt>
                <dd className="tabular-nums" dir="ltr">
                  {context.viewport.w}×{context.viewport.h}
                  {context.viewport.dpr ? ` @${context.viewport.dpr}x` : ""}
                </dd>
              </>
            )}
            {context.locale && (
              <>
                <dt className="text-muted-foreground">{T.localeLabel}</dt>
                <dd className="font-mono" dir="ltr">{context.locale}</dd>
              </>
            )}
            {context.userAgent && (
              <>
                <dt className="text-muted-foreground">{T.userAgentLabel}</dt>
                <dd className="break-all font-mono text-muted-foreground" dir="ltr">{context.userAgent}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </Section>
  );
};
BrowserContextSection.displayName = "BrowserContextSection";
