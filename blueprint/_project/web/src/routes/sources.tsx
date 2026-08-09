import { useEffect, useState } from "react";
import {
  Button, Callout, EmptyState, Input, Label, PageHeader, StatCard,
} from "@togo-framework/ui";
import { ChevronDown, ChevronRight, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  configTemplate, createSource, deleteSource, listKinds, listSources, patchSource,
  refreshSource, sourceRuns, type Source, type SourceRun,
} from "../lib/sources";

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const took = (r: SourceRun) => {
  if (!r.endedAt) return "running";
  const ms = new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

/**
 * The run history for one source.
 *
 * last_error alone cannot tell you a source failed at 03:00 and succeeded at
 * 04:00 — the success overwrites it, and the night looks clean.
 */
const RunHistory = ({ id, reloadKey }: { id: string; reloadKey: number }) => {
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

  if (err) return <p className="px-3 py-2 text-xs text-destructive">{err}</p>;
  if (!runs) return <p className="px-3 py-2 text-xs text-muted-foreground">Loading runs…</p>;
  if (runs.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No runs yet.</p>;
  }

  return (
    <div className="space-y-1 px-3 pb-3">
      {runs.map((r) => (
        <div key={r.id} className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
          <span
            className={
              r.status === "ok" ? "text-emerald-500"
                : r.status === "error" ? "text-destructive"
                  : "text-muted-foreground"
            }
          >
            ●
          </span>
          <span className="w-24 shrink-0 text-muted-foreground">{ago(r.startedAt)}</span>
          <span className="w-16 shrink-0 text-muted-foreground">{r.trigger}</span>
          <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
            {r.rowsRead} item{r.rowsRead === 1 ? "" : "s"}
            {r.truncated ? "+" : ""}
          </span>
          <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{took(r)}</span>
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
      setResult(r.ok ? "Collected." : r.error || "The refresh failed.");
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
    if (!window.confirm(
      `Delete the source "${s.name}"?\n\nWhat it already collected stays in the brain — ` +
      `removing the pipe is not a statement that the knowledge was wrong.`,
    )) return;
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

  return (
    <div
      className={`rounded-lg border ${failing ? "border-destructive/50" : "border-border"} bg-card`}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Hide runs" : "Show runs"}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{s.kind}</span>
            <span className="font-medium">{s.name}</span>
            {/* Disabled is the single most confusing state — a source that
                collects nothing and looks configured — so it is unmissable. */}
            {!s.enabled && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Off
              </span>
            )}
            {failing && (
              <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
                Failing{s.consecutiveFailures > 1 ? ` ×${s.consecutiveFailures}` : ""}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>into <span className="font-mono">{s.namespace}</span></span>
            <span>every <span className="font-mono">{s.schedule}</span></span>
            <span>last run {ago(s.lastRunAt)}</span>
            <span className="tabular-nums">{s.totalRuns} runs</span>
          </div>

          {s.lastError && (
            <p className="mt-2 break-words rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {s.lastError}
            </p>
          )}
          {result && <p className="mt-2 text-xs text-muted-foreground">{result}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost" size="sm" onClick={handleRefresh} disabled={busy !== ""}
            title="Run it now and show what happened"
          >
            <RefreshCw className={`size-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToggle} disabled={busy !== ""}>
            {s.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={busy !== ""}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {open && <RunHistory id={s.id} reloadKey={runsKey} />}
    </div>
  );
};
SourceRow.displayName = "SourceRow";

export const Sources = () => {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  const [kind, setKind] = useState("");
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("default:project");
  const [schedule, setSchedule] = useState("@hourly");
  const [config, setConfig] = useState("{}");
  const [saving, setSaving] = useState(false);

  const load = () => {
    listSources().then((d) => setSources(d.sources)).catch((e) => setErr(String(e.message)));
  };

  useEffect(() => {
    load();
    listKinds().then((d) => {
      setKinds(d.kinds);
      if (d.kinds.length > 0) {
        setKind(d.kinds[0]);
        setConfig(configTemplate(d.kinds[0]));
      }
    }).catch(() => {});
  }, []);

  const handleKind = (k: string) => {
    setKind(k);
    setConfig(configTemplate(k));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(config);
    } catch {
      setErr("The configuration is not valid JSON.");
      return;
    }
    setSaving(true);
    try {
      await createSource({ kind, name, namespace, schedule, config: parsed, enabled: false });
      setAdding(false);
      setName("");
      load();
    } catch (e2) {
      // Verbatim. The server names the exact field that is wrong and is better
      // at it than anything this form could guess.
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const enabled = (sources ?? []).filter((s) => s.enabled).length;
  const failing = (sources ?? []).filter((s) => s.lastStatus === "error").length;
  const collected = (sources ?? []).reduce((n, s) => n + s.totalRuns, 0);

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <PageHeader
        title="Sources"
        description="Everything that feeds the project brain on a schedule — repositories, feeds, channels, saved queries."
        actions={
          <Button onClick={() => setAdding((v) => !v)}>
            {adding ? <X className="size-4" /> : <Plus className="size-4" />}
            {adding ? "Cancel" : "Add a source"}
          </Button>
        }
      />

      {err && (
        <Callout kind="warn" className="mt-4">
          {err}
        </Callout>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sources" value={String(sources?.length ?? 0)} />
        <StatCard label="Collecting" value={String(enabled)} />
        <StatCard label="Failing" value={String(failing)} />
        <StatCard label="Runs" value={String(collected)} />
      </div>

      {adding && (
        <form onSubmit={handleCreate} className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="kind">Kind</Label>
              <select
                id="kind"
                value={kind}
                onChange={(e) => handleKind(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="what you will recognise it by" required
              />
            </div>
            <div>
              <Label htmlFor="ns">Collect into</Label>
              <Input id="ns" value={namespace} onChange={(e) => setNamespace(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sched">Schedule</Label>
              <Input
                id="sched" value={schedule} onChange={(e) => setSchedule(e.target.value)}
                placeholder="@hourly, @daily, or 30m"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cfg">Configuration</Label>
            {/* A JSON textarea rather than a form per kind. A per-kind form is
                worth building once the kinds settle; until then it would be
                four forms to keep in step with four connectors. */}
            <textarea
              id="cfg" value={config} onChange={(e) => setConfig(e.target.value)} rows={9}
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
            {/* Created off, always. A form must not be able to start polling
                somebody's production database the moment it is submitted. */}
            <span className="text-xs text-muted-foreground">
              Created switched off — enable it when you have run it once.
            </span>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {sources === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {sources?.length === 0 && (
          <EmptyState
            icon={<Play className="size-6" />}
            title="No sources yet"
            description="Add a repository, a feed or a saved query and the brain keeps itself current."
          />
        )}
        {sources?.map((s) => (
          <SourceRow key={s.id} s={s} onChanged={load} onError={setErr} />
        ))}
      </div>
    </div>
  );
};
Sources.displayName = "Sources";
