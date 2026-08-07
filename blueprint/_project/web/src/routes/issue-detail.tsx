import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { PageHeader, StatusBadge, Callout, EmptyState, MarkdownRenderer } from "@togo-framework/ui";
import {
  COLUMN_LABEL, TRANSITIONS, ago, addComment, fetchIssue, patchIssue,
  type Detail, type IssueStatus, type Priority,
} from "../lib/issues";

export function IssueDetail() {
  const { number } = useParams({ from: "/_app/issues/$number" });
  const [issue, setIssue] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
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
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              rows={3}
              className="w-full rounded-md border border-border bg-background p-3 text-sm"
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
          <select
            value={issue.status}
            onChange={(e) => void update({ status: e.target.value as IssueStatus })}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value={issue.status}>{COLUMN_LABEL[issue.status]}</option>
            {TRANSITIONS[issue.status]?.map((t) => (
              <option key={t} value={t}>{COLUMN_LABEL[t]}</option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            value={issue.priority}
            onChange={(e) => void update({ priority: e.target.value as Priority })}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            {["low", "normal", "high", "critical"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>

        <Field label="Area">
          <input
            defaultValue={issue.area}
            onBlur={(e) => e.target.value !== issue.area && void update({ area: e.target.value })}
            placeholder="e.g. auth, billing"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </Field>

        <label className="flex items-start gap-2 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={issue.humanOnly}
            onChange={(e) => void update({ humanOnly: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Human only</span>
            <span className="block text-xs text-muted-foreground">
              Agents will never claim this issue.
            </span>
          </span>
        </label>

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
