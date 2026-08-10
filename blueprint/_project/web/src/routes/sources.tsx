import { useEffect, useState } from "react";
import {
  Button, Callout, EmptyState, Input, PageHeader, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, StatusBadge, Textarea,
} from "@togo-framework/ui";
import {
  ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleX, History,
  LoaderCircle, Play, Plus, RefreshCw, Rss, Trash2, X,
} from "lucide-react";
import {
  configTemplate, createSource, deleteSource, listKinds, listSources, patchSource,
  refreshSource, sourceRuns, type Source, type SourceRun,
} from "../lib/sources";
import {
  Field, FormCard, FormFooter, ListSkeleton, MonoBadge, PageShell, Row, RowMeta,
  RowTitle, Rows, Section, Stat, StatRow,
} from "../components/page-shell";
import { useStrings } from "../lib/i18n";

/** Wall-clock duration of a finished run — "812ms" / "1.2s". Pure math; the
 *  "still running" word is language-dependent and supplied at the call site. */
const tookDuration = (r: SourceRun) => {
  const ms = new Date(r.endedAt!).getTime() - new Date(r.startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

/**
 * The run history for one source.
 *
 * last_error alone cannot tell you a source failed at 03:00 and succeeded at
 * 04:00 — the success overwrites it, and the night looks clean.
 */
const RunHistory = ({ id, reloadKey }: { id: string; reloadKey: number }) => {
  const { S } = useStrings();
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

  if (err) return <p className={`${tray} px-4 py-2.5 text-xs text-destructive`}>{err}</p>;
  if (!runs) {
    return (
      <p className={`${tray} flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground`}>
        <RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
        {S.sources.loadingRuns}
      </p>
    );
  }
  if (runs.length === 0) {
    return <p className={`${tray} px-4 py-2.5 text-xs text-muted-foreground`}>{S.sources.noRuns}</p>;
  }

  return (
    <div className={`${tray} divide-y divide-border/40 py-0.5`}>
      {runs.map((r) => (
        <div key={r.id} className="flex items-start gap-2.5 px-4 py-1.5 text-xs">
          {/* Icon, not a coloured dot: the outcome must survive a monochrome
              screenshot, and a check and a cross differ in shape, not just hue. */}
          {r.status === "ok" ? (
            <CircleCheck aria-label={S.sources.runOk} className="mt-px size-3.5 shrink-0 text-success" />
          ) : r.status === "error" ? (
            <CircleX aria-label={S.sources.runFailed} className="mt-px size-3.5 shrink-0 text-destructive" />
          ) : (
            <LoaderCircle
              aria-label={S.sources.runningWord}
              className="mt-px size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
          <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{S.sources.ago(r.startedAt)}</span>
          <span className="w-16 shrink-0 text-muted-foreground">{S.sources.trigger(r.trigger)}</span>
          <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
            {S.sources.items(r.rowsRead, r.truncated)}
          </span>
          <span dir="ltr" className="w-14 shrink-0 tabular-nums text-muted-foreground">
            {r.endedAt ? tookDuration(r) : S.sources.runningWord}
          </span>
          {r.error && <span className="min-w-0 flex-1 break-words text-destructive">{r.error}</span>}
        </div>
      ))}
    </div>
  );
};
RunHistory.displayName = "RunHistory";

const SourceRow = ({
  s, onChanged, onError,
}: {
  s: Source;
  onChanged: () => void;
  onError: (m: string) => void;
}) => {
  const { S, isRTL } = useStrings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");
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
    setResult("");
    try {
      const r = await refreshSource(s.id);
      // ok:false is the collection failing, not the request. Rendering it as a
      // readable line is the whole point of the button: this is where an
      // operator finds out their config is wrong, instead of at 3am.
      setResult(r.ok ? S.sources.collected : r.error || S.sources.refreshFailed);
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
  // The collapsed chevron points INTO the row's content — rightwards in LTR,
  // leftwards in RTL. A right-pointing chevron in an RTL list points off the
  // page edge instead of at what it opens.
  const ClosedChevron = isRTL ? ChevronLeft : ChevronRight;

  return (
    <Row
      danger={failing}
      leading={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? S.sources.hideRuns : S.sources.showRuns}
          aria-expanded={open}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {open ? <ChevronDown className="size-4" /> : <ClosedChevron className="size-4" />}
        </button>
      }
      trailing={
        <>
          <Button
            variant="ghost" size="sm" onClick={handleRefresh} disabled={busy !== ""}
            title={S.sources.refreshTitle}
          >
            <RefreshCw className={`size-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggle} disabled={busy !== ""}>
            {s.enabled ? S.sources.disable : S.sources.enable}
          </Button>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={busy !== ""}
            title={S.sources.deleteTitle}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      }
      footer={open ? <RunHistory id={s.id} reloadKey={runsKey} /> : undefined}
    >
      <RowTitle>
        <MonoBadge>{s.kind}</MonoBadge>
        <span className="font-medium">{s.name}</span>
        {/* Disabled is the single most confusing state — a source that
            collects nothing and looks configured — so it is unmissable. */}
        {!s.enabled && <StatusBadge tone="warning">{S.sources.off}</StatusBadge>}
        {failing && (
          <StatusBadge tone="danger">
            {S.sources.failingBadge(s.consecutiveFailures)}
          </StatusBadge>
        )}
      </RowTitle>

      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

      <RowMeta>
        {/* dir="ltr" on the machine values: "@hourly" and "ns:name" carry
            bidi-neutral leading characters that reorder inside Arabic text. */}
        <span>{S.sources.into} <span dir="ltr" className="font-mono">{s.namespace}</span></span>
        <span>{S.sources.every} <span dir="ltr" className="font-mono">{s.schedule}</span></span>
        <span className="inline-flex items-center gap-1">
          <History className="size-3.5" />
          {S.sources.lastRun} {S.sources.ago(s.lastRunAt)}
        </span>
        <span className="tabular-nums">{S.sources.runsCount(s.totalRuns)}</span>
      </RowMeta>

      {s.lastError && (
        <p className="mt-2 break-words rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {s.lastError}
        </p>
      )}
      {result && <p className="mt-2 text-xs text-muted-foreground">{result}</p>}
    </Row>
  );
};
SourceRow.displayName = "SourceRow";

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

export const Sources = () => {
  const { S } = useStrings();
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

  const enabled = (sources ?? []).filter((s) => s.enabled).length;
  const failing = (sources ?? []).filter((s) => s.lastStatus === "error").length;
  const collected = (sources ?? []).reduce((n, s) => n + s.totalRuns, 0);

  return (
    <PageShell>
      <PageHeader
        title={S.sources.title}
        icon={<Rss className="size-5" />}
        description={S.sources.desc}
        actions={
          <Button onClick={() => setAdding((v) => !v)}>
            {adding ? <X className="me-1.5 size-4" /> : <Plus className="me-1.5 size-4" />}
            {adding ? S.common.cancel : S.sources.addSource}
          </Button>
        }
      />

      <StatRow>
        <Stat label={S.sources.statSources} value={sources?.length ?? 0} />
        <Stat label={S.sources.statCollecting} value={enabled} tone={enabled ? "success" : "muted"} />
        <Stat label={S.sources.statFailing} value={failing} tone={failing ? "danger" : "muted"} />
        <Stat label={S.sources.statRuns} value={collected} />
      </StatRow>

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

      <Section title={S.sources.title} count={sources?.length}>
        {sources === null && <ListSkeleton rows={3} />}
        {sources?.length === 0 && (
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
        )}
        {sources && sources.length > 0 && (
          <Rows>
            {sources.map((s) => (
              <SourceRow key={s.id} s={s} onChanged={load} onError={setErr} />
            ))}
          </Rows>
        )}
      </Section>
    </PageShell>
  );
};
Sources.displayName = "Sources";
