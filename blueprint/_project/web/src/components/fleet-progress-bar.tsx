import { useEffect, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import { cn, useT } from "@togo-framework/ui";
import {
  completeSetup, fetchSetup, genStatus, startGenerate, type GenProgress,
} from "../lib/setup";

/**
 * fleet-progress-bar — the slim strip at the top of the app shell that carries
 * a background fleet generation.
 *
 * Generation was always detached on the server (202 + goroutine); it was the
 * WIZARD that blocked on it. This bar is what lets the wizard stop blocking:
 * the operator enters the app the moment the run starts, and this is where the
 * run stays visible — stage in the server's own words, persisted/total counts,
 * and spend, because this is the one operation that costs real money and a
 * hidden bill is indefensible.
 *
 * Honesty contract (Rule 43): `step` counts rows actually persisted on the
 * server, never sessions launched, so "18 of 27" survives a crash. That is
 * also why failure offers CONTINUE, not "try again" — resuming buys only the
 * missing items.
 */
const POLL_MS = 3000;

// Sub-cent amounts round to a lying "$0.00" at two decimals — the early roster
// minutes are exactly when the operator is deciding whether to trust the run.
const fmtCost = (usd: number) => (usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`);

export const FleetProgressBar = () => {
  const { language } = useT();
  const ar = language === "ar";
  const [progress, setProgress] = useState<GenProgress | null>(null);
  // Dismissal is deliberately memory-only: a reload while the run (and the
  // spend) is still going must bring the bar back.
  const [dismissed, setDismissed] = useState(false);
  const [resuming, setResuming] = useState(false);
  const timer = useRef<number | null>(null);
  const fleetName = useRef("default");
  const setupDone = useRef(false);
  const wasDone = useRef(false);

  const stopPolling = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const applyProgress = (p: GenProgress) => {
    if (p.done && !wasDone.current) {
      stopPolling();
      // A dismissed bar comes back for the ending: hiding an in-flight run was
      // the operator's call to make; hiding how it ended — and what it cost —
      // is not.
      setDismissed(false);
      if (!p.error && !setupDone.current) {
        // The fleet landed, so make setup durably complete. Without this, a
        // reload after a background success bounces the operator back to the
        // wizard for a run that already finished. Idempotent on the server.
        setupDone.current = true;
        completeSetup().catch((e) =>
          console.error("[FleetProgressBar]", "could not mark setup complete", e),
        );
      }
    }
    wasDone.current = p.done;
    setProgress(p);
  };

  const startPolling = () => {
    stopPolling();
    timer.current = window.setInterval(() => {
      void genStatus()
        .then(applyProgress)
        .catch(() => {
          // One missed poll is not a failed run — the next tick answers.
        });
    }, POLL_MS);
  };

  useEffect(() => {
    let alive = true;
    // One state fetch on mount decides everything, including whether to poll
    // at all. Polling forever on every page when nothing is running is a bug,
    // and /state (unlike /generate/status) also says whether setup completed —
    // which is what keeps a long-finished run's stale "done" from resurfacing
    // as a banner on every reload.
    void fetchSetup()
      .then((s) => {
        if (!alive) return;
        setupDone.current = s.completed;
        if (s.fleetName) fleetName.current = s.fleetName;
        if (s.completed && !s.progress?.running) return; // steady state: no bar, no polling
        if (s.progress?.running || s.progress?.done) applyProgress(s.progress);
        if (s.progress?.running) startPolling();
      })
      .catch(() => {
        // No reachable setup state, no bar. The route guard already fails open.
      });
    return () => {
      alive = false;
      stopPolling();
    };
    // Mount-only: everything afterwards is driven by the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    setResuming(true);
    // Resume, not restart: the server skips every persisted item and buys only
    // what is missing. The issues opt-in is deliberately not re-sent — a resume
    // must never opt into spend the operator did not just tick.
    void startGenerate(fleetName.current, false)
      .then(() => {
        wasDone.current = false;
        setResuming(false);
        // The server has reset its progress; show "running" now rather than a
        // failed bar until the first poll answers.
        setProgress((p) => (p ? { ...p, running: true, done: false, error: undefined } : p));
        startPolling();
      })
      .catch((e) => {
        console.error("[FleetProgressBar]", "resume failed", e);
        setResuming(false);
      });
  };

  const handleDismiss = () => setDismissed(true);

  if (!progress || dismissed) return null;
  if (!progress.running && !progress.done) return null;

  const failed = progress.done && Boolean(progress.error);
  const ready = progress.done && !progress.error;
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.step / progress.total) * 100)) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "shrink-0 border-b",
        failed ? "border-destructive/30 bg-destructive/10" : "border-border bg-card",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs">
        {failed ? (
          <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
        ) : ready ? (
          <Check className="size-3.5 shrink-0 text-success" />
        ) : (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
        )}

        {/* title carries the server's full sentence; the strip stays one line. */}
        <span
          className="min-w-0 truncate"
          title={failed ? progress.error : progress.summary || undefined}
        >
          {failed ? (
            <>
              <span className="font-medium text-destructive">
                {ar ? "توقف إنشاء الأسطول" : "Fleet generation stopped"}
              </span>{" "}
              <span className="text-muted-foreground">
                — {progress.step} {ar ? "من" : "of"} {progress.total}{" "}
                {ar ? "اكتملت ومحفوظة" : "finished and saved"}
              </span>
            </>
          ) : ready ? (
            <>
              <span className="font-medium">{ar ? "الأسطول جاهز" : "Fleet ready"}</span>{" "}
              <span className="text-muted-foreground">
                — {progress.agents} {ar ? "وكيلًا" : "agents"} · {progress.skills}{" "}
                {ar ? "مهارة" : "skills"}
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">
                {ar ? "جارٍ بناء الأسطول" : "Building your fleet"}
              </span>{" "}
              {/* The stage in the server's own words — never paraphrased. */}
              {progress.stage && (
                <span className="rounded bg-muted px-1 py-px font-mono text-[11px]">
                  {progress.stage}
                </span>
              )}{" "}
              {progress.total > 0 && (
                <span className="tabular-nums text-muted-foreground">
                  {progress.step}/{progress.total}
                </span>
              )}
            </>
          )}
        </span>

        {progress.costUsd > 0 && (
          <span
            className="shrink-0 tabular-nums text-muted-foreground"
            title={ar ? "الإنفاق حتى الآن" : "Spend so far"}
          >
            {fmtCost(progress.costUsd)}
          </span>
        )}

        <span className="ms-auto flex shrink-0 items-center gap-1">
          {failed && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={resuming}
              title={
                ar
                  ? "الاستئناف يشتري العناصر الناقصة فقط — العمل المكتمل محفوظ"
                  : "Resumes where it stopped — finished work is saved, only the missing items are bought"
              }
              className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {resuming ? (ar ? "جارٍ الاستئناف…" : "Resuming…") : ar ? "متابعة" : "Continue"}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={ar ? "إخفاء" : "Dismiss"}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>

      {/* The track under the strip. `step` counts rows persisted on the server,
          not sessions launched — the width is a promise about the database. */}
      {!ready && progress.total > 0 && (
        <div className="h-0.5 w-full bg-muted">
          <div
            className={cn("h-full transition-all", failed ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
};
FleetProgressBar.displayName = "FleetProgressBar";
