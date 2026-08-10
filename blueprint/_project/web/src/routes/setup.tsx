import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  completeSetup, fetchSetup, genStatus, runPreflight, savePlan, startGenerate,
  type Check, type GenProgress, type SetupState,
} from "../lib/setup";

const STEPS = [
  { key: "preflight", label: "Tooling" },
  { key: "plan", label: "Your plan" },
  { key: "fleet", label: "The fleet" },
  { key: "done", label: "Done" },
] as const;

export function Setup() {
  const nav = useNavigate();
  const [state, setState] = useState<SetupState | null>(null);
  const [step, setStep] = useState<string>("preflight");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("");
  // Unticked by default, deliberately: the pass costs a model call per issue
  // and seeds a board agents can later spend on. Opting in is the operator's
  // call to make with the price in front of them, never a default.
  const [withIssues, setWithIssues] = useState(false);
  const [progress, setProgress] = useState<GenProgress | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await fetchSetup().catch(() => null);
      if (!s) return;
      setState(s);
      setPlan(s.planMd);
      // A run in flight always means the fleet step, whatever the stored step
      // says — the operator should land on the progress bar, not a form that
      // will 409 the moment they submit it.
      if (s.progress?.running) {
        setStep("fleet");
        setProgress(s.progress);
        setBusy(true);
        watch();
      } else {
        setStep(s.completed ? "done" : s.step === "welcome" ? "preflight" : s.step);
      }
    })();
    return () => { if (poll.current) clearInterval(poll.current); };
  }, []);

  function watch() {
    if (poll.current) clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const p = await genStatus().catch(() => null);
      if (!p) return;
      setProgress(p);
      if (p.done) {
        if (poll.current) clearInterval(poll.current);
        setBusy(false);
        if (p.error) setErr(p.error);
        else {
          const s = await fetchSetup().catch(() => null);
          if (s) setState(s);
        }
      }
    }, 3000);
  }

  async function doPreflight() {
    setBusy(true); setErr("");
    try {
      const r = await runPreflight();
      setState((s) => (s ? { ...s, preflight: r.report } : s));
      if (r.ok) setStep("plan");
      else setErr("Some required checks are failing. Fix them and run this again.");
    } catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  }

  async function doPlan() {
    setBusy(true); setErr("");
    try { await savePlan(plan); setStep("fleet"); }
    catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  }

  async function doGenerate() {
    setBusy(true); setErr(""); setProgress(null);
    try {
      const r = await startGenerate("default", withIssues);
      if (r.alreadyRunning) {
        // Attach to the run instead of complaining about it.
        const p = await genStatus().catch(() => null);
        if (p) setProgress(p);
      }
      watch();
    } catch (e) {
      setErr(String((e as Error).message));
      setBusy(false);
    }
  }

  async function doComplete() {
    setBusy(true); setErr("");
    try { await completeSetup(); void nav({ to: "/dashboard" }); }
    catch (e) { setErr(String((e as Error).message)); setBusy(false); }
  }

  const idx = STEPS.findIndex((s) => s.key === step);
  const agents = state?.agents ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your project</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The agent team is built from your plan before the dashboard opens — so the
          first issue you file already has someone to work it.
        </p>
      </header>

      <ol className="mb-8 flex gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                i < idx ? "bg-primary text-primary-foreground"
                : i === idx ? "border-2 border-primary text-primary"
                : "border border-border text-muted-foreground"}`}
            >
              {i < idx ? "✓" : i + 1}
            </span>
            <span className={`text-xs ${i === idx ? "font-semibold" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {err && (
        <p className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </p>
      )}

      {step === "preflight" && (
        <section>
          <h2 className="text-base font-semibold">Connect your tooling</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The build loop shells out to the GitHub CLI and to Claude Code, so both must be
            authenticated before anything can run. The last check actually executes a
            headless prompt — authentication can report healthy while execution still fails.
          </p>
          <button
            onClick={() => void doPreflight()}
            disabled={busy}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Checking…" : "Run the checks"}
          </button>

          {state?.preflight?.checks && (
            <ul className="mt-5 flex flex-col gap-1.5">
              {state.preflight.checks.map((c: Check) => (
                <li key={c.id} className="flex items-start gap-2.5 rounded-md border border-border p-2.5 text-sm">
                  <span className={
                    c.status === "pass" ? "text-success"
                    : c.status === "fail" ? "text-destructive"
                    : c.status === "warn" ? "text-warning" : "text-muted-foreground"}>
                    {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : c.status === "warn" ? "!" : "–"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.label}</span>
                    {c.required && (
                      <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">required</span>
                    )}
                    {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                    {c.status !== "pass" && c.remedy && (
                      <code className="mt-1 block rounded bg-muted p-1.5 text-[11px]">{c.remedy}</code>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === "plan" && (
        <section>
          <h2 className="text-base font-semibold">Describe what you want to build</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This goes to the fleet-builder, which reads your repository and designs the team
            around it. Be specific about surfaces, stack and the boundaries you care about —
            the fleet is only ever as specific as the plan.
          </p>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={12}
            placeholder="e.g. A bilingual EN/AR media-monitoring dashboard. Ingests RSS and the X API into Postgres, clusters into topics, shows analysts a daily briefing. Surfaces: marketing site, analyst dashboard, admin panel. Must be RTL-correct. I need someone owning collection adapters, someone owning the analyst UI, someone owning the schema, and someone checking Arabic copy before anything ships."
            className="mt-4 w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => void doPlan()}
              disabled={busy || plan.trim().length < 40}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Continue
            </button>
            <span className="text-xs text-muted-foreground">
              {plan.trim().length < 40
                ? `${40 - plan.trim().length} more characters`
                : `${plan.trim().length} characters`}
            </span>
          </div>
        </section>
      )}

      {step === "fleet" && (
        <section>
          <h2 className="text-base font-semibold">Build the team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The fleet-builder explores your repository with read-only tools and proposes a
            roster; the server writes the files. It never writes them itself — that would
            mean handing full write access to a session that just read an untrusted plan.
          </p>

          {!progress?.running && !agents.length && (
            <>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={withIssues}
                  onChange={(e) => setWithIssues(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Also break my plan into issues</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Costs one model call per issue (capped at 15) and puts work on the
                    board assigned to this fleet. The issues arrive held for your
                    review — but once you release them, agents can start claiming and
                    spending on them.
                  </span>
                </span>
              </label>
              <button
                onClick={() => void doGenerate()}
                disabled={busy}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Starting…" : "Generate the fleet"}
              </button>
            </>
          )}

          {progress && (progress.running || progress.done) && (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="text-sm font-medium">
                {progress.running
                  ? progress.stage === "roster"
                    ? "Designing the roster…"
                    : progress.stage === "issues-plan"
                      ? "Breaking the plan into issues…"
                      : `Writing ${progress.stage} ${progress.step}/${progress.total}`
                  : progress.error ? "Generation failed" : "Fleet ready"}
              </p>
              {progress.total > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((progress.step / progress.total) * 100)}%` }}
                  />
                </div>
              )}
              {progress.costUsd > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  ${progress.costUsd.toFixed(4)} spent
                </p>
              )}
              {progress.summary && <p className="mt-2 text-sm">{progress.summary}</p>}
              {progress.issues > 0 && (
                <p className="mt-2 text-sm">
                  {progress.issues} issues from your plan are on the board, held for your
                  review — release them when you have read them.
                </p>
              )}
              {progress.issuesNote && (
                <p className="mt-2 rounded-md bg-warning/10 p-2 text-xs text-warning">
                  {progress.issuesNote}
                </p>
              )}
            </div>
          )}

          {agents.length > 0 && (
            <>
              <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {agents.length} agents · each with its own brain
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {agents.map((a) => (
                  <li key={a.slug} className="rounded-md border border-border p-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {a.displayName}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{a.role}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{a.model}</span>
                      {!a.enabled && (
                        <span
                          className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
                          title="Generated agents land disabled — a human turns them on"
                        >
                          disabled
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                    {a.brainNamespace && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        🧠 {a.brainNamespace} · {a.memories} memories
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void doComplete()}
                disabled={busy}
                className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Finish setup and open the dashboard
              </button>
            </>
          )}
        </section>
      )}

      {step === "done" && (
        <section>
          <h2 className="text-base font-semibold">Setup is complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {agents.length} agents are registered. Generated agents start disabled — enable
            the ones you want working before the loop picks up issues.
          </p>
          <button
            onClick={() => void nav({ to: "/dashboard" })}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open the dashboard
          </button>
        </section>
      )}
    </div>
  );
}
