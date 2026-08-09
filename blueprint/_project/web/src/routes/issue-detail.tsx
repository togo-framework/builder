import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { listAgents, type Agent } from "../lib/agents";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Button, Callout, Checkbox, EmptyState, Input, Label, MarkdownEditor, MarkdownRenderer, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge,
} from "@togo-framework/ui";
import {
  COLUMN_LABEL, TRANSITIONS, ago, addComment, fetchIssue, patchIssue,
  type Detail, type IssueStatus, type Priority, deleteIssue } from "../lib/issues";
import { DeployPanel } from "../components/deploy-panel";

export function IssueDetail() {
  const { number } = useParams({ from: "/_app/issues/$number" });
  const [issue, setIssue] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => { void listAgents().then(setAgents).catch(() => {}); }, []);
  const nav = useNavigate();

  async function removeIssue() {
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
    }
  }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    fetchIssue(number).then(setIssue).catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    setIssue(null);
    setErr("");
    void load();
  }, [number]);

  async function update(patch: Parameters<typeof patchIssue>[1]) {
    try {
      await patchIssue(number, patch);
      await load();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function comment() {
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

  if (err && !issue) {
    return (
      <div className="p-8">
        <Link to="/issues" className="text-sm text-muted-foreground hover:underline">← Issues</Link>
        <div className="mt-4"><Callout kind="warn" title="Could not load this issue">{err}</Callout></div>
      </div>
    );
  }
  if (!issue) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 p-6 lg:grid-cols-[1fr_280px]">
      <main className="min-w-0">
        <Link to="/issues" className="text-sm text-muted-foreground hover:underline">← Issues</Link>

        <p className="mt-4 text-sm tabular-nums text-muted-foreground">#{issue.number}</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{issue.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge tone={issue.type === "bug" ? "danger" : "info"}>{issue.type}</StatusBadge>
          <StatusBadge tone="neutral">{COLUMN_LABEL[issue.status]}</StatusBadge>
          {issue.source === "feedback" && <StatusBadge tone="neutral">feedback</StatusBadge>}
          {issue.busy && <StatusBadge tone="success">agent working</StatusBadge>}
          <span className="text-muted-foreground">{ago(issue.createdAt)} ago</span>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What &amp; why
          </h2>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            {issue.body ? (
              <MarkdownRenderer content={issue.body} />
            ) : (
              <span className="text-muted-foreground">No description was given.</span>
            )}
          </div>
        </section>

        {issue.pageUrl && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reported from
            </h2>
            <a
              href={issue.pageUrl}
              className="break-all text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {issue.pageUrl}
            </a>
          </section>
        )}

        {issue.pins.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pinned element
            </h2>
            {issue.pins.map((p) => (
              <div key={p.ordinal} className="rounded-lg border border-border p-4 text-sm">
                <p className="font-medium">
                  &lt;{p.tag || "?"}&gt;{p.name && ` — “${p.name}”`}
                </p>
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
                  {p.testid && (<><dt className="text-muted-foreground">testid</dt><dd className="font-mono break-all">{p.testid}</dd></>)}
                  {p.role && (<><dt className="text-muted-foreground">role</dt><dd className="font-mono">{p.role}</dd></>)}
                  {p.css && (<><dt className="text-muted-foreground">css path</dt><dd className="font-mono break-all">{p.css}</dd></>)}
                  {p.hint && (<><dt className="text-muted-foreground">text</dt><dd className="break-all">{p.hint}</dd></>)}
                  <dt className="text-muted-foreground">verified</dt>
                  <dd>
                    {p.verified.length ? (
                      p.verified.map((v) => (
                        <span key={v} className="me-1 rounded bg-emerald-500/12 px-1.5 py-0.5 font-mono text-emerald-600 dark:text-emerald-400">
                          {v}
                        </span>
                      ))
                    ) : (
                      <span className="text-amber-600">
                        none — no strategy was unique when this was captured
                      </span>
                    )}
                  </dd>
                </dl>
                {/* Honest about the weak case: a css-only pin is the one that
                    silently re-resolves to the wrong element after a reorder. */}
                {p.verified.length === 1 && p.verified[0] === "css" && (
                  <div className="mt-3">
                    <Callout kind="warn" title="This pin is fragile">
                      Only the structural CSS path was unique here. That breaks on a restyle and can
                      resolve to a different element after a list reorder — add a{" "}
                      <code className="font-mono">data-testid</code> to make this pin durable.
                    </Callout>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="mt-6">
          <DeployPanel number={Number(number)} onDeployed={() => void load()} />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Discussion
          </h2>
          {issue.comments.length === 0 && (
            <EmptyState title="No comments yet" description="Answers from agents appear here." />
          )}
          <div className="flex flex-col gap-3">
            {issue.comments.map((c) => (
              <article key={c.id} className="rounded-lg border border-border p-3">
                <p className="mb-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author}</span>
                  {c.kind === "agent" && (
                    <span className="ms-2"><StatusBadge tone="info">agent</StatusBadge></span>
                  )}
                  <span className="ms-2">{ago(c.createdAt)} ago</span>
                </p>
                <div className="text-sm leading-relaxed">
                  <MarkdownRenderer content={c.body} />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4">
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              // The kit defaults to "split", which halves the writing area to
              // preview a comment that is usually two lines of plain prose.
              // Start on write; preview is one click away when it is wanted.
              defaultView="write"
              placeholder="Add a comment…  **bold**, `code`, - lists"
              minRows={3}
            />
            <button
              onClick={() => void comment()}
              disabled={sending || !draft.trim()}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {sending ? "Posting…" : "Comment"}
            </button>
          </div>
        </section>

        {issue.activity.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </h2>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {issue.activity.map((a, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{a.actorKind}</span> {a.action}
                  <span className="ms-2">{ago(a.createdAt)} ago</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <aside className="flex flex-col gap-4 text-sm">
        {err && <p className="text-xs text-red-600">{err}</p>}

        <Field label="Status">
          <Select
            value={issue.status}
            onValueChange={(v) => void update({ status: v as IssueStatus })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* The current status plus everything it may legally move to —
                  the allowed set is the transition table, not every status. */}
              <SelectItem value={issue.status}>{COLUMN_LABEL[issue.status]}</SelectItem>
              {TRANSITIONS[issue.status]?.map((t) => (
                <SelectItem key={t} value={t}>{COLUMN_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Priority">
          <Select
            value={issue.priority}
            onValueChange={(v) => void update({ priority: v as Priority })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["low", "normal", "high", "critical"].map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Area">
          <Input
            defaultValue={issue.area}
            onBlur={(e) => e.target.value !== issue.area && void update({ area: e.target.value })}
            placeholder="e.g. auth, billing"
          />
        </Field>

        <Field label="Assignee">
          {/* One control for the whole routing decision: a specific agent, any
              agent that owns the area, or a person. Splitting "assignee" from
              "human only" made it possible to set both and get a silently
              unclaimable issue. */}
          <Select
            value={issue.humanOnly ? "__human__" : (issue.assignee || "__auto__")}
            onValueChange={(v) => {
              if (v === "__human__") return void update({ humanOnly: true, assignee: "" });
              if (v === "__auto__") return void update({ humanOnly: false, assignee: "" });
              void update({ assignee: v, humanOnly: false });
            }}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">Any agent that owns the area</SelectItem>
              <SelectItem value="__human__">A person — agents keep out</SelectItem>
              {agents.filter((a) => a.enabled && a.role === "builder").map((a) => (
                <SelectItem key={a.slug} value={a.slug}>
                  {a.displayName || a.slug}
                  {a.areas.length ? ` — ${a.areas.slice(0, 3).join(", ")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {issue.assignee && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Only {issue.assignee} can claim this issue.
            </p>
          )}
        </Field>

        <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
          <Checkbox
            id="human-only"
            checked={issue.humanOnly}
            onCheckedChange={(v) => void update({ humanOnly: v === true })}
            className="mt-0.5"
          />
          <Label htmlFor="human-only" className="cursor-pointer font-normal">
            <span className="font-medium">Human only</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Agents will never claim this issue, whatever the assignee says.
            </span>
          </Label>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={deleting}
              className="w-full text-red-600 hover:bg-red-500/10 hover:text-red-600">
              <Trash2 className="me-1.5 size-4" />
              {deleting ? "Deleting…" : "Delete issue"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete issue #{number}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the issue and everything attached to it — comments,
                pins, attachments and its activity trail. It cannot be undone.
                {" "}An issue an agent is actively working cannot be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void removeIssue()}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


        <dl className="grid grid-cols-[80px_1fr] gap-y-1.5 rounded-lg border border-border p-3 text-xs">
          <dt className="text-muted-foreground">Route</dt>
          <dd className="font-mono break-all">{issue.route || "—"}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{issue.source}</dd>
          <dt className="text-muted-foreground">Attempts</dt>
          <dd className="tabular-nums">{issue.attempts}</dd>
          <dt className="text-muted-foreground">Assignee</dt>
          <dd>{issue.assignee || "unassigned"}</dd>
        </dl>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
