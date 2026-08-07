import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  answerDecision, audioUnlocked, chime, connectAlerts, fetchDecisions,
  onAgentEvent, onUnlockChange, unlockAudio,
  type AgentEvent, type Decision,
} from "../lib/alerts";

/**
 * Live agent alerts: a toast per event, and a blocking panel for decisions.
 *
 * Mounted in the app shell so it is present on every authenticated page — an
 * agent can block at any moment and the admin must find out wherever they are.
 */
export function AgentAlerts() {
  const [toasts, setToasts] = useState<AgentEvent[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [muted, setMuted] = useState(!audioUnlocked());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = () => void fetchDecisions().then(setDecisions).catch(() => {});
    load();

    const offEvent = onAgentEvent((e) => {
      setToasts((t) => [e, ...t].slice(0, 4));
      // A decision changes what the operator must do, so refetch immediately
      // rather than waiting for the poll.
      if (e.kind === "decision_opened") load();
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), 12_000);
    });
    const offUnlock = onUnlockChange((u) => setMuted(!u));
    const disconnect = connectAlerts();
    // Fallback for a dropped stream — SSE reconnects, but a missed decision
    // must not sit unseen because one event was lost mid-reconnect.
    const poll = setInterval(load, 30_000);

    return () => { offEvent(); offUnlock(); disconnect(); clearInterval(poll); };
  }, []);

  async function submit(d: Decision, state: string) {
    const text = (answers[d.id] ?? "").trim();
    if (!text) { setErr("Write an answer before submitting."); return; }
    setBusy(d.id); setErr("");
    try {
      await answerDecision(d.id, text, state);
      setDecisions((xs) => xs.filter((x) => x.id !== d.id));
      setAnswers((a) => ({ ...a, [d.id]: "" }));
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Audio is blocked until the user interacts with the page. Saying so is
          better than silently failing to alert them — a muted alert that nobody
          knows is muted is worse than no alert at all. */}
      {muted && decisions.length > 0 && (
        <button
          onClick={() => { unlockAudio(); void chime("alert-blocked"); }}
          className="fixed bottom-4 start-4 z-50 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
        >
          🔇 Alert sound is blocked — click to enable
        </button>
      )}

      {decisions.length > 0 && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-amber-500/40 bg-amber-500/10 backdrop-blur">
          <div className="mx-auto max-w-4xl p-4">
            <p className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
              {decisions.length === 1
                ? "An agent is waiting on your decision"
                : `${decisions.length} agents are waiting on your decision`}
              <span className="ms-2 font-normal opacity-80">
                — work on {decisions.length === 1 ? "this issue is" : "these issues are"} blocked until you answer.
              </span>
            </p>

            {err && <p className="mb-2 text-xs text-red-600">{err}</p>}

            <div className="flex flex-col gap-3">
              {decisions.map((d) => (
                <article key={d.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">
                    <Link
                      to="/issues/$number"
                      params={{ number: String(d.issueNumber) }}
                      className="font-medium text-foreground hover:underline"
                    >
                      #{d.issueNumber} {d.issueTitle}
                    </Link>
                    <span className="ms-2">asked by {d.agentSlug || "an agent"}</span>
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{d.question}</p>
                  {d.context && (
                    <p className="mt-1 text-xs text-muted-foreground">{d.context}</p>
                  )}
                  <textarea
                    value={answers[d.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [d.id]: e.target.value }))}
                    rows={2}
                    placeholder="Your answer — the agent continues from this."
                    className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void submit(d, "approved")}
                      disabled={busy === d.id}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === d.id ? "Sending…" : "Approve & unblock"}
                    </button>
                    <button
                      onClick={() => void submit(d, "rejected")}
                      disabled={busy === d.id}
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed bottom-4 end-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border p-3 shadow-lg backdrop-blur ${
              t.severity === "action_required"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-background"}`}
          >
            <p className="text-sm font-medium">{t.title}</p>
            {t.preview && <p className="mt-0.5 text-xs text-muted-foreground">{t.preview}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
