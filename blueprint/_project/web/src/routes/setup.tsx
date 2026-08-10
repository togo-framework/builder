import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Checkbox, Progress, Textarea, cn, useT } from "@togo-framework/ui";
import {
  Boxes, Brain, Check, ClipboardList, Languages, Rocket, TriangleAlert, Wrench,
} from "lucide-react";
import {
  completeSetup, fetchSetup, genStatus, runPreflight, savePlan, startGenerate,
  type Check as PreflightCheck, type GenProgress, type SetupState,
} from "../lib/setup";
import { useSetupStrings } from "../lib/i18n.setup";
import { Field, FormFooter, PageShell, Section } from "../components/page-shell";
import { ConfirmAction } from "../components/ui/confirm-action";
import { EmptyState } from "../components/ui/empty-state";
import {
  Footprint, FootprintArtefact, FootprintRow, type FootprintStatus,
} from "../components/ui/footprint";
import { TokenCost } from "../components/ui/token-cost";

/**
 * setup — the wizard that stands between a fresh install and a working fleet.
 *
 * PRESENTATION ONLY was changed here. The flow underneath is the expensive
 * part and is untouched: generation is detached on the server, persists after
 * every item, and a failed run RESUMES from the last saved item rather than
 * starting over. Several failed runs and real money went into getting that
 * right, so every affordance on this screen had to be designed around it:
 *
 *   - The failure action is "Continue generating", never "Try again". It says,
 *     in the button and again beneath it, that finished work is kept and only
 *     the missing items are bought. A resume that reads as a restart is how an
 *     operator decides not to press it and abandons a half-paid-for fleet.
 *   - Counts come from `progress.step`, which counts rows PERSISTED on the
 *     server, not sessions launched. So "12 of 27 saved" is a fact about the
 *     database and survives a crash — and the roster below is read from the
 *     database too, which is why it is labelled as saved rather than as live.
 *   - The issues opt-in is an approval, not a preference. Ticking it is the
 *     only control on this page that spends money the fleet itself does not
 *     require, so ticking it reveals the consequences and arms a confirm step;
 *     leaving it alone starts generation on exactly the path it always did.
 *
 * Money is rendered through TokenCost (and therefore formatUsd) so a spend on
 * this screen is formatted identically to a spend anywhere else in the app.
 * The previous hand-rolled `.toFixed(4)` was the fourth money format in the
 * product.
 */

const STEPS = [
  { key: "preflight", icon: Wrench },
  { key: "plan", icon: ClipboardList },
  { key: "fleet", icon: Boxes },
  { key: "done", icon: Rocket },
] as const;

/** A preflight verdict in the footprint's vocabulary. `warn` maps to "blocked"
 *  rather than "failed" because a warning does not stop the run — it is the
 *  glyph for "this will bite you later", which is exactly what a warn is. */
const CHECK_STATUS: Record<PreflightCheck["status"], FootprintStatus> = {
  pass: "done",
  fail: "failed",
  warn: "blocked",
  skip: "skipped",
};

export function Setup() {
  const nav = useNavigate();
  const { S, language } = useSetupStrings();
  const { setLanguage } = useT();
  const ar = language === "ar";
  const [state, setState] = useState<SetupState | null>(null);
  const [step, setStep] = useState<string>("preflight");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("");
  // Unticked by default, deliberately: the pass costs a model call per issue
  // and seeds a board agents can later spend on. Opting in is the operator's
  // call to make with the price in front of them, never a default.
  const [withIssues, setWithIssues] = useState(false);
  // Arms the approval dialog. Only reachable while the opt-in is ticked, so the
  // default (fleet only) path keeps exactly the one click it always had.
  const [confirmOpen, setConfirmOpen] = useState(false);
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
        // A terminal run must be visible too: without it, a failure that
        // happened while nobody was watching leaves the fleet step offering a
        // fresh "Generate" with no word about what already completed.
        if (s.progress?.done) setProgress(s.progress);
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
          // Mark setup durably complete the moment the fleet lands: the run
          // outlives this tab, and a reload must open the app, not this
          // wizard. Idempotent on the server; the agents exist by now.
          await completeSetup().catch((e) =>
            console.error("[Setup]", "could not mark setup complete", e));
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
      else setErr(S.setup.pfFailing);
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
    setBusy(true); setErr("");
    // Optimistic "running" rather than null: the done step reads this before
    // the first poll answers, and a 3-second flash of "setup is complete"
    // during a resume would be a lie. Cost/counts carry over from a failed run
    // so the resume never appears to un-spend money.
    setProgress((p) => ({
      running: true, done: false, agents: 0, skills: 0,
      costUsd: p?.costUsd ?? 0, step: p?.step ?? 0, total: p?.total ?? 0, issues: 0,
    }));
    try {
      const r = await startGenerate("default", withIssues);
      if (r.alreadyRunning) {
        // Attach to the run instead of complaining about it.
        const p = await genStatus().catch(() => null);
        if (p) setProgress(p);
      }
      watch();
      // Started is enough to move on. Generation is detached and per-item
      // durable on the server; the wizard's part ends when the run begins, and
      // the app shell's top bar carries progress from here.
      setStep("done");
    } catch (e) {
      setErr(String((e as Error).message));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  async function doComplete() {
    setBusy(true); setErr("");
    try { await completeSetup(); void nav({ to: "/dashboard" }); }
    catch (e) { setErr(String((e as Error).message)); setBusy(false); }
  }

  // The approval closes before the work starts: the panel behind it is where a
  // start failure gets reported, and a dialog sitting over that panel would
  // hide the very message it caused.
  const handleApprovedGenerate = async () => {
    setConfirmOpen(false);
    await doGenerate();
  };

  const handleToggleLanguage = () => setLanguage(ar ? "en" : "ar");

  const idx = STEPS.findIndex((s) => s.key === step);
  const agents = state?.agents ?? [];
  const failed = Boolean(progress?.done && progress.error);
  const succeeded = Boolean(progress?.done && !progress?.error);
  const live = Boolean(progress && (progress.running || progress.done));
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.step / progress.total) * 100))
      : 0;
  const pending = progress ? Math.max(0, progress.total - progress.step) : 0;

  /** The stage in the server's own words — never paraphrased, because the
   *  operator comparing this screen with the top bar must read one story. */
  const headline = !progress
    ? ""
    : progress.running
      ? !progress.stage
        ? S.setup.progStarting
        : progress.stage === "roster"
          ? S.setup.progRoster
          : progress.stage === "issues-plan"
            ? S.setup.progIssues
            : S.setup.progStage(progress.stage, progress.step, progress.total)
      : progress.error
        // Counts persisted items, so "finished and saved" is a fact about the
        // database, not a hope about the retry.
        ? S.setup.progStopped(progress.step, progress.total)
        : S.setup.progReady;

  // Shared between the fleet step and the done step: after starting, the
  // wizard advances immediately, and whichever step the operator is looking at
  // must tell the same story about the same run.
  const progressPanel = live && progress ? (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "motion-entrance flex flex-col gap-3 rounded-card border p-4",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {failed ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : succeeded ? (
            <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
          ) : (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
            />
          )}
          <span className={cn("min-w-0", failed && "text-destructive")}>{headline}</span>
        </span>
        {progress.costUsd > 0 && (
          <TokenCost
            usd={progress.costUsd}
            tone={failed ? "warning" : "default"}
            label={S.setup.progSpend}
            className="ms-auto"
          />
        )}
      </div>

      {progress.total > 0 && (
        <div className="flex flex-col gap-1.5">
          <Progress value={pct} aria-label={S.setup.progItems(progress.step, progress.total)} />
          <div className="flex flex-wrap items-baseline gap-x-3 text-[11px] text-muted-foreground">
            <span className="numeric">{S.setup.progItems(progress.step, progress.total)}</span>
            {progress.running && pending > 0 && (
              <span className="numeric ms-auto">{S.setup.progPending(pending)}</span>
            )}
          </div>
        </div>
      )}

      {progress.summary && <p className="text-sm text-muted-foreground">{progress.summary}</p>}

      {progress.issues > 0 && (
        <p className="text-sm">{S.setup.progIssuesLanded(progress.issues)}</p>
      )}

      {progress.issuesNote && (
        <p className="flex items-start gap-1.5 rounded-field bg-warning/10 p-2 text-xs text-warning">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0">{progress.issuesNote}</span>
        </p>
      )}
    </div>
  ) : null;

  /**
   * The roster, as a footprint: what is being written now, what is already
   * saved, what stopped. Done rows come from the DATABASE (state.agents) and
   * the running row comes from the poll — two different sources, so the
   * section says plainly that the list is what is saved, not what is live.
   */
  const rosterList = agents.length > 0 || live ? (
    <Footprint bordered>
      {progress?.running && (
        <FootprintRow
          status="running"
          arabic={ar}
          title={headline}
          lead={
            progress && progress.total > 0 ? (
              <span className="numeric rounded-field bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <span dir="ltr">{progress.step + 1}/{progress.total}</span>
              </span>
            ) : undefined
          }
          time={S.setup.progLive}
        />
      )}

      {failed && (
        <FootprintRow
          status="failed"
          arabic={ar}
          title={<span className="text-destructive">{headline}</span>}
        >
          {progress?.error && progress.error !== err && (
            <p className="mt-1 break-words text-xs text-muted-foreground">{progress.error}</p>
          )}
        </FootprintRow>
      )}

      {agents.map((a) => (
        <FootprintRow
          key={a.slug}
          status="done"
          arabic={ar}
          title={<span className="font-medium">{a.displayName}</span>}
          lead={
            <span className="rounded-field bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              <bdi dir="ltr">{a.role}</bdi>
            </span>
          }
          actor={a.model}
          artefacts={
            a.brainNamespace ? (
              <>
                <FootprintArtefact icon={<Brain />} title={a.brainNamespace}>
                  {a.brainNamespace}
                </FootprintArtefact>
                <span className="numeric">{S.setup.memories(a.memories)}</span>
              </>
            ) : undefined
          }
          trailing={
            !a.enabled ? (
              <span
                title={S.setup.disabledWhy}
                className="rounded-pill bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
              >
                {S.setup.disabled}
              </span>
            ) : undefined
          }
        >
          {a.description && (
            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
          )}
        </FootprintRow>
      ))}

      {progress?.running && pending > 0 && (
        <FootprintRow
          status="pending"
          arabic={ar}
          title={<span className="text-muted-foreground">{S.setup.progPending(pending)}</span>}
        />
      )}
    </Footprint>
  ) : null;

  /** The resume sentence. Shown wherever a continue button is, because the one
   *  thing this button must never be mistaken for is "start over". */
  const resumeNote = progress && progress.total > 0 && progress.step > 0 ? (
    <span className="flex flex-col gap-0.5">
      <span>{S.setup.genResumeFrom(progress.step, progress.total)}</span>
      <span>{S.setup.genResumeNote}</span>
    </span>
  ) : (
    <span>{S.setup.genResumeNote}</span>
  );

  const generateLabel = busy
    ? S.setup.genStarting
    : failed || agents.length
      ? S.setup.genResume
      : S.setup.genStart;

  return (
    <PageShell
      width="narrow"
      title={S.setup.title}
      description={S.setup.desc}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleLanguage}
          aria-label={S.setup.switchLangAria}
          className="motion-press"
        >
          <Languages aria-hidden="true" className="me-1.5 size-4" />
          {S.setup.switchLang}
        </Button>
      }
    >
      {/* The stepper. Position, not decoration: the operator arriving on a
          resumed run needs to see where the wizard has put them before they
          read a single word of the step. */}
      <ol aria-label={S.setup.stepsAria} className="flex min-w-0 list-none items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const current = i === idx;
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-current={current ? "step" : undefined}
                title={`${S.setup.stepOf(i + 1, STEPS.length)} — ${S.setup.steps[s.key]}`}
                className={cn(
                  "motion-hover grid size-8 shrink-0 place-items-center rounded-full",
                  done && "bg-primary text-primary-foreground",
                  current && "border-2 border-primary bg-primary/10 text-primary",
                  !done && !current && "border border-border text-muted-foreground",
                )}
              >
                {done ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Icon aria-hidden="true" className="size-4" />
                )}
                <span className="sr-only">
                  {S.setup.stepOf(i + 1, STEPS.length)}
                  {done ? ` — ${S.setup.stepDone}` : current ? ` — ${S.setup.stepCurrent}` : ""}
                </span>
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:block",
                  current ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {S.setup.steps[s.key]}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn("h-px min-w-4 flex-1", done ? "bg-primary/50" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>

      {err && (
        <p
          role="alert"
          className="motion-entrance flex items-start gap-2 rounded-card border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{err}</span>
        </p>
      )}

      {step === "preflight" && (
        <section className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{S.setup.pfTitle}</h2>
            <p className="text-sm text-muted-foreground">{S.setup.pfDesc}</p>
          </header>

          <div>
            <Button onClick={() => void doPreflight()} disabled={busy} className="motion-press">
              {busy
                ? S.setup.pfRunning
                : state?.preflight?.checks
                  ? S.setup.pfRerun
                  : S.setup.pfRun}
            </Button>
          </div>

          {state?.preflight?.checks ? (
            <Section title={S.setup.pfResults} count={state.preflight.checks.length}>
              <Footprint bordered>
                {state.preflight.checks.map((c: PreflightCheck) => (
                  <FootprintRow
                    key={c.id}
                    status={CHECK_STATUS[c.status]}
                    arabic={ar}
                    title={<span className="font-medium">{c.label}</span>}
                    lead={
                      c.required ? (
                        <span className="rounded-field bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {S.setup.pfRequired}
                        </span>
                      ) : undefined
                    }
                    trailing={
                      <span className="text-xs text-muted-foreground">
                        {S.setup.pfStatus[c.status]}
                      </span>
                    }
                  >
                    {c.detail && (
                      <p className="mt-1 break-words text-xs text-muted-foreground">{c.detail}</p>
                    )}
                    {c.status !== "pass" && c.remedy && (
                      <div className="mt-2 flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {S.setup.pfRemedy}
                        </span>
                        {/* A shell command is LTR in both languages. */}
                        <code
                          dir="ltr"
                          className="block overflow-x-auto rounded-field bg-muted p-2 font-mono text-[11px]"
                        >
                          {c.remedy}
                        </code>
                      </div>
                    )}
                  </FootprintRow>
                ))}
              </Footprint>
            </Section>
          ) : (
            <EmptyState
              size="sm"
              icon={<Wrench />}
              title={S.setup.pfEmptyTitle}
              description={S.setup.pfEmptyDesc}
            />
          )}
        </section>
      )}

      {step === "plan" && (
        <section className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{S.setup.planTitle}</h2>
            <p className="text-sm text-muted-foreground">{S.setup.planDesc}</p>
          </header>

          <Field
            label={S.setup.planLabel}
            htmlFor="plan"
            required
            hint={S.setup.planHint}
            error={
              plan.trim().length > 0 && plan.trim().length < 40
                ? S.setup.planShort(40 - plan.trim().length)
                : undefined
            }
          >
            <Textarea
              id="plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={12}
              placeholder={S.setup.planPlaceholder}
              className="min-h-56 text-sm leading-relaxed"
            />
          </Field>

          <FormFooter
            note={
              <span className="numeric">
                {plan.trim().length < 40
                  ? S.setup.planShort(40 - plan.trim().length)
                  : S.setup.planCount(plan.trim().length)}
              </span>
            }
          >
            <Button
              onClick={() => void doPlan()}
              disabled={busy || plan.trim().length < 40}
              className="motion-press"
            >
              {S.setup.planContinue}
            </Button>
          </FormFooter>
        </section>
      )}

      {step === "fleet" && (
        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{S.setup.fleetTitle}</h2>
            <p className="text-sm text-muted-foreground">{S.setup.fleetDesc}</p>
          </header>

          {!progress?.running && !succeeded && (!agents.length || failed) && (
            <div className="flex flex-col gap-4">
              {!agents.length && !failed && (
                <EmptyState
                  size="sm"
                  icon={<Boxes />}
                  title={S.setup.fleetEmptyTitle}
                  description={S.setup.fleetEmptyDesc}
                />
              )}

              {/* The opt-in. Ticking it is the only control on this page that
                  spends money the fleet does not require, so the consequences
                  are revealed by the tick rather than hidden behind it. */}
              <div
                className={cn(
                  "motion-hover rounded-card border p-4",
                  withIssues ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="with-issues"
                    checked={withIssues}
                    onCheckedChange={(v) => setWithIssues(v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <label htmlFor="with-issues" className="cursor-pointer text-sm font-medium">
                      {S.setup.issuesLabel}
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">{S.setup.issuesShort}</p>
                  </div>
                </div>

                {withIssues && (
                  <div className="motion-entrance mt-3 rounded-card border border-warning/40 bg-warning/10 p-3">
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-warning">
                      <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                      <span className="min-w-0">{S.setup.issuesArmed}</span>
                    </p>
                    <ul className="mt-1.5 flex list-none flex-col gap-1 text-xs text-muted-foreground">
                      {S.setup.issuesPoints.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-1 shrink-0 rounded-full bg-warning"
                          />
                          <span className="min-w-0">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <FormFooter
                note={failed || agents.length ? resumeNote : undefined}
                className="mt-0 border-t-0 pt-0"
              >
                <Button
                  onClick={
                    withIssues ? () => setConfirmOpen(true) : () => void doGenerate()
                  }
                  disabled={busy}
                  className="motion-press"
                >
                  {generateLabel}
                </Button>
              </FormFooter>

              {/* Controlled, and only mounted while the opt-in is armed: the
                  default path keeps the single click it has always had. */}
              {withIssues && (
                <ConfirmAction
                  open={confirmOpen}
                  onOpenChange={setConfirmOpen}
                  tone="primary"
                  title={S.setup.issuesConfirmTitle}
                  description={S.setup.issuesConfirmDesc}
                  consequences={S.setup.issuesPoints}
                  confirmLabel={S.setup.issuesConfirmCta}
                  busy={busy}
                  onConfirm={handleApprovedGenerate}
                />
              )}
            </div>
          )}

          {progressPanel}

          {progress?.running && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => void nav({ to: "/dashboard" })}
                className="motion-press"
              >
                {S.setup.bgContinue}
              </Button>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {S.setup.bgNote}
              </span>
            </div>
          )}

          {rosterList && (
            <Section title={S.setup.rosterHeading} count={agents.length}>
              {rosterList}
              <p className="text-[11px] text-muted-foreground">{S.setup.rosterNote}</p>
            </Section>
          )}

          {agents.length > 0 && (
            <div>
              <Button onClick={() => void doComplete()} disabled={busy} className="motion-press">
                {S.setup.finish}
              </Button>
            </div>
          )}
        </section>
      )}

      {step === "done" && (
        <section className="flex flex-col gap-5">
          {progress?.running ? (
            <>
              <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{S.setup.doneRunningTitle}</h2>
                <p className="text-sm text-muted-foreground">{S.setup.doneRunningDesc}</p>
              </header>
              {progressPanel}
              {rosterList && (
                <Section title={S.setup.rosterHeading} count={agents.length}>
                  {rosterList}
                  <p className="text-[11px] text-muted-foreground">{S.setup.rosterNote}</p>
                </Section>
              )}
              <div>
                <Button onClick={() => void nav({ to: "/dashboard" })} className="motion-press">
                  {S.setup.openDashboard}
                </Button>
              </div>
            </>
          ) : failed ? (
            <>
              <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-destructive">
                  {S.setup.doneFailedTitle}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {S.setup.doneFailedDesc(progress?.step ?? 0, progress?.total ?? 0)}
                </p>
              </header>
              {progressPanel}
              {rosterList && (
                <Section title={S.setup.rosterHeading} count={agents.length}>
                  {rosterList}
                  <p className="text-[11px] text-muted-foreground">{S.setup.rosterNote}</p>
                </Section>
              )}
              <FormFooter note={resumeNote} className="mt-0 border-t-0 pt-0">
                <Button onClick={() => void doGenerate()} disabled={busy} className="motion-press">
                  {busy ? S.setup.genStarting : S.setup.genResume}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void nav({ to: "/dashboard" })}
                  className="motion-press"
                >
                  {S.setup.openDashboard}
                </Button>
              </FormFooter>
            </>
          ) : (
            <>
              <header className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Check aria-hidden="true" className="size-4 text-success" />
                  {S.setup.doneOkTitle}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {S.setup.doneOkDesc(agents.length)}
                </p>
              </header>
              {progressPanel}
              {rosterList && (
                <Section title={S.setup.rosterHeading} count={agents.length}>
                  {rosterList}
                  <p className="text-[11px] text-muted-foreground">{S.setup.rosterNote}</p>
                </Section>
              )}
              <div>
                <Button onClick={() => void nav({ to: "/dashboard" })} className="motion-press">
                  {S.setup.openDashboard}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
    </PageShell>
  );
}
Setup.displayName = "Setup";
