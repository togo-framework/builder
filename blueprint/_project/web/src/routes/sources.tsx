import { useEffect, useState, type ComponentType } from "react";
import {
  Button, Callout, EmptyState, Input, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, StatusBadge, Textarea,
} from "@togo-framework/ui";
import {
  Bot, Boxes, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleAlert,
  CircleCheck, CircleDashed, CirclePause, CircleX, Database, FileText, Github, Globe,
  History, LoaderCircle, MessageSquare, PenLine, Play, Plus, RefreshCw, Rss, Trash2, X,
} from "lucide-react";
import {
  configTemplate, createSource, deleteSource, listKinds, listSources, patchSource,
  refreshSource, sourceRuns, type Source, type SourceRun,
} from "../lib/sources";
import {
  Field, FormCard, FormFooter, ListSkeleton, PageShell, Row, RowMeta, RowTitle, Rows,
  Section, Shimmer, Stat, StatRow, StatSkeleton,
} from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { useKnowledge } from "../lib/i18n.knowledge";

/** One glyph per connector kind — the same marks the brain puts on a memory's
 *  provenance, so a row here and a citation there are visibly the same thing. */
const KIND_ICON: Record<string, ComponentType<{ className?: string }>> = {
  github: Github,
  rss: Rss,
  slack: MessageSquare,
  crawl: Globe,
  sql: Database,
  document: FileText,
  agent: Bot,
  manual: PenLine,
};
const kindIcon = (k: string) => KIND_ICON[k] ?? Boxes;

/** Quiet separator between two facts that belong to one thought. */
const Sep = () => (
  <span aria-hidden="true" className="select-none text-border">
    ·
  </span>
);
Sep.displayName = "Sep";

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

type HealthKey = "error" | "off" | "running" | "ok" | "new";

/**
 * Health is a SHAPE first.
 *
 * A cross, a pause, a spinner, a tick and a dashed ring differ in outline
 * before they differ in hue, so a failing source survives a monochrome
 * screenshot and a reader who cannot separate red from green. Colour is the
 * second layer, the word is the third, and the failing rows are lifted into
 * their own group above the list — so the answer is also carried by POSITION.
 */
const HEALTH: Record<HealthKey, { Icon: ComponentType<{ className?: string }>; tone: string }> = {
  error: { Icon: CircleX, tone: "text-destructive" },
  off: { Icon: CirclePause, tone: "text-warning" },
  running: { Icon: LoaderCircle, tone: "text-info" },
  ok: { Icon: CircleCheck, tone: "text-success" },
  new: { Icon: CircleDashed, tone: "text-muted-foreground" },
};

/** A source that last failed is FAILING even while switched off — the disabling
 *  is a second fact, carried by its own pill, not a way to hide the first. */
const healthOf = (s: Source): HealthKey =>
  s.lastStatus === "error"
    ? "error"
    : !s.enabled
      ? "off"
      : s.lastStatus === "running"
        ? "running"
        : s.lastRunAt
          ? "ok"
          : "new";

const Health = ({ s }: { s: Source }) => {
  const { S } = useStrings();
  const K = useKnowledge();
  const key = healthOf(s);
  const { Icon, tone } = HEALTH[key];
  const word =
    key === "error"
      ? S.sources.failingBadge(s.consecutiveFailures)
      : key === "off"
        ? S.sources.off
        : key === "running"
          ? S.sources.runningWord
          : key === "ok"
            ? K.sources.healthy
            : K.sources.neverRun;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${tone}`}>
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${key === "running" ? "animate-spin motion-reduce:animate-none" : ""}`}
      />
      {word}
    </span>
  );
};
Health.displayName = "Health";

/* ------------------------------------------------------------------ */
/* Run history                                                         */
/* ------------------------------------------------------------------ */

/** Wall-clock duration of a finished run — "812ms" / "1.2s". Pure math; the
 *  "still running" word is language-dependent and supplied at the call site. */
const tookDuration = (r: SourceRun) => {
  const ms = new Date(r.endedAt!).getTime() - new Date(r.startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

// One template for the header and every row, so the columns cannot drift apart.
// A grid rather than fixed-width flex children: the same track sizes resolve
// from the start edge in both directions without a single physical margin.
const RUN_COLS =
  "grid min-w-[34rem] grid-cols-[1.25rem_5.5rem_4.5rem_5.5rem_3.5rem_minmax(0,1fr)] items-start gap-x-3";

/**
 * The run history for one source.
 *
 * last_error alone cannot tell you a source failed at 03:00 and succeeded at
 * 04:00 — the success overwrites it, and the night looks clean. Given columns
 * and a header, the same rows answer "is this getting worse" by shape rather
 * than by reading four values per line.
 */
const RunHistory = ({ id, reloadKey }: { id: string; reloadKey: number }) => {
  const { S } = useStrings();
  const K = useKnowledge();
  const [runs, setRuns] = useState<SourceRun[] | null>(null);
  const [err, setErr] = useState("");

  // reloadKey is bumped by a manual refresh. Without it this panel keeps showing
  // the runs it fetched when it was opened, so the run the operator just
  // triggered — the one they pressed the button in order to see — never arrives.
  useEffect(() => {
    let stale = false;
    sourceRuns(id)
      .then((d) => { if (!stale) setRuns(d.runs); })
      .catch((e) => { if (!stale) setErr(String(e.message)); });
    // Two refreshes in quick succession can resolve out of order, and the late
    // arrival of the earlier fetch would overwrite the newer list.
    return () => { stale = true; };
  }, [id, reloadKey]);

  // The tray sits on a muted wash so an expanded row reads as "opened", the
  // way the panel's detail surfaces sit on --surface rather than --bg.
  const tray = "border-t border-border/60 bg-muted/30";

  if (err) return <p className={`${tray} px-3 py-2.5 text-xs text-destructive`}>{err}</p>;

  // Shaped like the table it becomes — short bars on the fixed columns, not a
  // spinner. A spinner says "wait"; a placeholder in the right shape says what
  // is about to be there, and nothing re-lays-out when it lands.
  if (!runs) {
    return (
      <div className={`${tray} py-2`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${RUN_COLS} px-3 py-1.5`}>
            <Shimmer className="size-3.5 rounded-full" />
            <Shimmer className="h-2.5 w-12" />
            <Shimmer className="h-2.5 w-10" />
            <Shimmer className="h-2.5 w-12" />
            <Shimmer className="h-2.5 w-8" />
            <span />
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return <p className={`${tray} px-3 py-2.5 text-xs text-muted-foreground`}>{S.sources.noRuns}</p>;
  }

  return (
    <div className={`${tray} overflow-x-auto`} role="group" aria-label={K.sources.runHistory}>
      <div className="py-1.5">
        <div
          className={`${RUN_COLS} px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
        >
          <span aria-hidden="true" />
          <span>{K.sources.colWhen}</span>
          <span>{K.sources.colTrigger}</span>
          <span>{K.sources.colItems}</span>
          <span>{K.sources.colTook}</span>
          <span aria-hidden="true" />
        </div>

        <div className="divide-y divide-border/40">
          {runs.map((r) => (
            <div key={r.id} className={`${RUN_COLS} px-3 py-1.5 text-xs`}>
              {/* Icon, not a coloured dot: the outcome must survive a monochrome
                  screenshot, and a check and a cross differ in shape, not just hue. */}
              {r.status === "ok" ? (
                <CircleCheck aria-label={S.sources.runOk} className="mt-px size-3.5 text-success" />
              ) : r.status === "error" ? (
                <CircleX aria-label={S.sources.runFailed} className="mt-px size-3.5 text-destructive" />
              ) : (
                <LoaderCircle
                  aria-label={S.sources.runningWord}
                  className="mt-px size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
              )}
              <span className="tabular-nums text-muted-foreground">{S.sources.ago(r.startedAt)}</span>
              <span className="truncate text-muted-foreground">{S.sources.trigger(r.trigger)}</span>
              <span className="tabular-nums text-muted-foreground">
                {S.sources.items(r.rowsRead, r.truncated)}
              </span>
              <bdi dir="ltr" className="tabular-nums text-muted-foreground">
                {r.endedAt ? tookDuration(r) : S.sources.runningWord}
              </bdi>
              {r.error ? (
                <span dir="auto" className="min-w-0 break-words text-destructive">{r.error}</span>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
RunHistory.displayName = "RunHistory";

/* ------------------------------------------------------------------ */
/* Source row                                                          */
/* ------------------------------------------------------------------ */

const SourceRow = ({
  s, onChanged, onError,
}: {
  s: Source;
  onChanged: () => void;
  onError: (m: string) => void;
}) => {
  const { S, isRTL } = useStrings();
  const K = useKnowledge();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [runsKey, setRunsKey] = useState(0);

  const handleToggle = async () => {
    setBusy("toggle");
    try {
      await patchSource(s.id, { enabled: !s.enabled });
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleRefresh = async () => {
    setBusy("refresh");
    setResult(null);
    try {
      const r = await refreshSource(s.id);
      // ok:false is the collection failing, not the request. Rendering it as a
      // readable line is the whole point of the button: this is where an
      // operator finds out their config is wrong, instead of at 3am.
      setResult({
        ok: r.ok,
        text: r.ok ? S.sources.collected : r.error || S.sources.refreshFailed,
      });
      // A failed run is still a run, and its row carries the error in full —
      // so the history is refetched either way, not only on success.
      setRunsKey((n) => n + 1);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(S.sources.confirmDelete(s.name))) return;
    setBusy("delete");
    try {
      await deleteSource(s.id);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const failing = s.lastStatus === "error";
  const KindIcon = kindIcon(s.kind);
  // The collapsed chevron points INTO the row's content — rightwards in LTR,
  // leftwards in RTL. A right-pointing chevron in an RTL list points off the
  // page edge instead of at what it opens.
  const ClosedChevron = isRTL ? ChevronLeft : ChevronRight;
  // The zero value the server sends for "not scheduled" is a year-0001 instant,
  // which would render as "due now" and libel a source that is simply off.
  const scheduled = s.enabled && new Date(s.nextRunAt).getFullYear() > 2000;

  return (
    <Row
      danger={failing}
      leading={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? S.sources.hideRuns : S.sources.showRuns}
          aria-expanded={open}
          className="motion-hover rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {open ? <ChevronDown className="size-4" /> : <ClosedChevron className="size-4" />}
        </button>
      }
      trailing={
        <>
          <Button
            variant="ghost" size="sm" onClick={handleRefresh} disabled={busy !== ""}
            title={S.sources.refreshTitle} aria-label={S.sources.refreshTitle}
          >
            <RefreshCw
              className={`size-4 ${busy === "refresh" ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggle} disabled={busy !== ""}>
            {s.enabled ? S.sources.disable : S.sources.enable}
          </Button>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={busy !== ""}
            title={S.sources.deleteTitle} aria-label={S.sources.deleteTitle}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      }
      footer={open ? <RunHistory id={s.id} reloadKey={runsKey} /> : undefined}
    >
      {/* The name is the one thing that matters, so it reads first and alone in
          the foreground colour. The kind is a glyph rather than a fourth chip —
          five badges on a line is a wall, and shape identifies a connector
          faster than the word does. */}
      <RowTitle>
        <KindIcon aria-label={s.kind} className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 font-medium text-foreground">{s.name}</span>
        <Health s={s} />
        {/* Disabled is the single most confusing state — a source that collects
            nothing and looks configured — so when it hides behind a failure it
            still gets said out loud. */}
        {failing && !s.enabled && <StatusBadge tone="warning">{S.sources.off}</StatusBadge>}
      </RowTitle>

      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

      <RowMeta>
        {/* <bdi dir="ltr"> on the machine values: "@hourly" and "ns:name" carry
            bidi-neutral leading characters that reorder inside Arabic text —
            isolated per value, never as a direction on the whole line. */}
        <span>
          {S.sources.into} <bdi dir="ltr" className="font-mono">{s.namespace}</bdi>
        </span>
        <span>
          {S.sources.every} <bdi dir="ltr" className="font-mono">{s.schedule}</bdi>
        </span>
        <span className="inline-flex items-center gap-1">
          <History aria-hidden="true" className="size-3.5" />
          {S.sources.lastRun} {S.sources.ago(s.lastRunAt)}
        </span>
        {scheduled && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock aria-hidden="true" className="size-3.5" />
            {K.sources.nextRun} {K.sources.inWhen(s.nextRunAt)}
          </span>
        )}
        <span className="inline-flex items-center gap-2 tabular-nums">
          {S.sources.runsCount(s.totalRuns)}
          {s.totalAdded > 0 && (
            <>
              <Sep />
              {K.sources.added(s.totalAdded)}
            </>
          )}
        </span>
      </RowMeta>

      {s.lastError && (
        <p className="mt-2 flex items-start gap-1.5 rounded-field border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span dir="auto" className="min-w-0 break-words">{s.lastError}</span>
        </p>
      )}
      {result && (
        <p
          className={`mt-2 inline-flex items-start gap-1.5 text-xs ${
            result.ok ? "text-success" : "text-destructive"
          }`}
        >
          {result.ok ? (
            <CircleCheck aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          )}
          <span dir="auto" className="min-w-0 break-words">{result.text}</span>
        </p>
      )}
    </Row>
  );
};
SourceRow.displayName = "SourceRow";

/* ------------------------------------------------------------------ */
/* Create form                                                         */
/* ------------------------------------------------------------------ */

/**
 * The create form, structured field-by-field rather than the JSON dump it was.
 *
 * The configuration stays a JSON editor on purpose — a per-kind form is worth
 * building once the kinds settle; until then it would be four forms to keep in
 * step with four connectors — but it is validated as it is typed, so "not
 * valid JSON" is caught next to the field while the operator is still there,
 * not by the server after submit.
 */
const AddSourceForm = ({
  kinds, onClose, onCreated, onError,
}: {
  kinds: string[];
  onClose: () => void;
  onCreated: () => void;
  onError: (m: string) => void;
}) => {
  const { S } = useStrings();
  const [kind, setKind] = useState(kinds[0] ?? "");
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("default:project");
  const [schedule, setSchedule] = useState("@hourly");
  const [config, setConfig] = useState(configTemplate(kinds[0] ?? ""));
  const [saving, setSaving] = useState(false);

  const handleKind = (k: string) => {
    setKind(k);
    setConfig(configTemplate(k));
  };

  // Validated live, but only surfaced as an error — the parsed value the
  // server receives is still produced at submit time from the same string.
  let jsonError = "";
  try {
    JSON.parse(config);
  } catch {
    jsonError = S.sources.jsonError;
  }

  const canSubmit = !saving && kind !== "" && name.trim() !== "" && jsonError === "";
  const blockedBy =
    name.trim() === "" ? S.sources.nameFirst
      : jsonError ? S.sources.fixConfig
        : S.sources.createdOff;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createSource({
        kind, name, namespace, schedule,
        config: JSON.parse(config),
        // Created off, always. A form must not be able to start polling
        // somebody's production database the moment it is submitted.
        enabled: false,
      });
      onCreated();
    } catch (e2) {
      // Verbatim. The server names the exact field that is wrong and is better
      // at it than anything this form could guess.
      onError((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormCard title={S.sources.formTitle} onClose={onClose} closeLabel={S.common.cancel}>
      <form onSubmit={handleCreate}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={S.sources.kindLabel} htmlFor="src-kind" required
            hint={S.sources.kindHint}
          >
            <Select value={kind} onValueChange={handleKind}>
              <SelectTrigger id="src-kind" className="w-full font-mono text-xs">
                <SelectValue placeholder={S.sources.pickConnector} />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k} className="font-mono text-xs">{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={S.sources.nameLabel} htmlFor="src-name" required
            hint={S.sources.nameHint}
          >
            <Input
              id="src-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={S.sources.namePlaceholder}
            />
          </Field>
          <Field
            label={S.sources.collectIntoLabel} htmlFor="src-ns"
            hint={S.sources.collectIntoHint}
          >
            <Input
              id="src-ns" value={namespace} onChange={(e) => setNamespace(e.target.value)}
              dir="ltr" className="font-mono text-xs"
            />
          </Field>
          <Field
            label={S.sources.scheduleLabel} htmlFor="src-sched"
            hint={S.sources.scheduleHint}
          >
            <Input
              id="src-sched" value={schedule} onChange={(e) => setSchedule(e.target.value)}
              placeholder="@hourly" dir="ltr" className="font-mono text-xs"
            />
          </Field>
        </div>

        <Field
          label={S.sources.configLabel} htmlFor="src-cfg" className="mt-4"
          error={jsonError || undefined}
          hint={S.sources.configHint(kind)}
        >
          {/* JSON is source code — it stays LTR even under an RTL page. */}
          <Textarea
            id="src-cfg" value={config} onChange={(e) => setConfig(e.target.value)}
            rows={9} spellCheck={false}
            aria-invalid={jsonError !== ""}
            dir="ltr"
            className="font-mono text-xs leading-relaxed"
          />
        </Field>

        <FormFooter note={blockedBy}>
          <Button type="submit" disabled={!canSubmit}>
            <Plus className="me-1.5 size-4" />
            {saving ? S.sources.saving : S.sources.createSource}
          </Button>
        </FormFooter>
      </form>
    </FormCard>
  );
};
AddSourceForm.displayName = "AddSourceForm";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const Sources = () => {
  const { S } = useStrings();
  const K = useKnowledge();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    listSources().then((d) => setSources(d.sources)).catch((e) => setErr(String(e.message)));
  };

  useEffect(() => {
    load();
    listKinds().then((d) => setKinds(d.kinds)).catch(() => {});
  }, []);

  const list = sources ?? [];
  const enabled = list.filter((s) => s.enabled).length;
  const collected = list.reduce((n, s) => n + s.totalRuns, 0);

  // Triage by POSITION. A broken source at the bottom of an alphabetical list
  // is a broken source nobody sees; lifted into its own group it is the first
  // thing on the page after the numbers.
  const broken = list.filter((s) => s.lastStatus === "error");
  const rest = list.filter((s) => s.lastStatus !== "error");

  return (
    <PageShell
      title={S.sources.title}
      icon={<Rss />}
      description={S.sources.desc}
      actions={
        <Button onClick={() => setAdding((v) => !v)}>
          {adding ? <X className="me-1.5 size-4" /> : <Plus className="me-1.5 size-4" />}
          {adding ? S.common.cancel : S.sources.addSource}
        </Button>
      }
    >
      {sources === null ? (
        <StatSkeleton />
      ) : (
        <StatRow>
          <Stat label={S.sources.statSources} value={list.length} />
          <Stat label={S.sources.statCollecting} value={enabled} tone={enabled ? "success" : "muted"} />
          <Stat
            label={S.sources.statFailing}
            value={broken.length}
            tone={broken.length ? "danger" : "muted"}
          />
          <Stat label={S.sources.statRuns} value={collected} />
        </StatRow>
      )}

      {err && <Callout kind="warn" title={S.common.somethingWrong}>{err}</Callout>}

      {adding && (
        <AddSourceForm
          // Keyed so a form opened before the kinds list arrives remounts with
          // a real default kind + template instead of an empty picker.
          key={kinds.join(",")}
          kinds={kinds}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
          onError={setErr}
        />
      )}

      {sources === null && (
        <Section title={K.sources.allSources}>
          <ListSkeleton rows={3} />
        </Section>
      )}

      {sources?.length === 0 && (
        <Section title={K.sources.allSources}>
          <EmptyState
            icon={<Play className="size-6" />}
            title={S.sources.emptyTitle}
            description={S.sources.emptyDesc}
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="me-1.5 size-4" />
                {S.sources.addSource}
              </Button>
            }
          />
        </Section>
      )}

      {broken.length > 0 && (
        <Section title={K.sources.attention} count={broken.length}>
          <Rows>
            {broken.map((s) => (
              <SourceRow key={s.id} s={s} onChanged={load} onError={setErr} />
            ))}
          </Rows>
        </Section>
      )}

      {rest.length > 0 && (
        <Section
          title={broken.length > 0 ? K.sources.rest : K.sources.allSources}
          count={rest.length}
        >
          <Rows>
            {rest.map((s) => (
              <SourceRow key={s.id} s={s} onChanged={load} onError={setErr} />
            ))}
          </Rows>
        </Section>
      )}
    </PageShell>
  );
};
Sources.displayName = "Sources";
