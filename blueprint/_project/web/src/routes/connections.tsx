// Connections — an integration gallery.
//
// This replaces a list of configured sources with a catalogue of things you can
// connect, because those are different questions. "What have I set up?" is
// answerable from a list; "what CAN I set up, and what does it need?" is not,
// and it was the question the old screen could not answer at all.
//
// Everything renders from the registry (internal/integrations). There is no
// per-integration component here — a new integration is a Go declaration and it
// appears, with its own inputs, its own auth style and its own capability
// badges, without touching this file.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Input, StatusBadge } from "@togo-framework/ui";
import {
  Bot, BookOpen, ChartColumn, Cloud, Database, Github, Globe, LoaderCircle, Lock,
  MessageSquare, Pause, Play, Plug, Plus, RefreshCw, Search, Send, Settings2, Sparkles,
  TerminalSquare, Trash2, TriangleAlert,
} from "lucide-react";
import {
  connect, disconnect, getCatalog, getStatuses, t,
  type Category, type CategoryMeta, type Integration, type Status,
} from "../lib/integrations";
import { AppPageHeader as PageHeader, PageShell, Section } from "../components/page-shell";
import { BRAND } from "../components/brand-icons";
import { SchemaForm, defaultsOf, validate, type JSONSchema, type Values } from "../components/schema-form";
import {
  createSource, deleteSource, listSources, patchSource, refreshSource, type Source,
} from "../lib/sources";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@togo-framework/ui";
import { useStrings } from "../lib/i18n";

/** Registry icon names → the kit's glyphs. Unknown falls back rather than
 *  rendering nothing, so a new integration is never an invisible card. */
const ICONS: Record<string, typeof Plug> = {
  Sparkle: Sparkles, Github, Cloud, MessageSquare, Send, Layers: Database,
  Globe, BookOpen, Search, BarChart3: ChartColumn, Bot, RefreshCw, Lock, Plug,
};
// A real logo when we have a verified one, the registry's generic glyph
// otherwise. Recognising Slack by its mark is most of what makes a gallery
// scannable — but a wrong logo reads as a broken product, so the fallback is
// deliberate rather than a gap.
const iconFor = (slug: string, name: string) => BRAND[slug] ?? ICONS[name] ?? Plug;

const CAT_ICON: Record<Category, typeof Plug> = {
  terminal: TerminalSquare,
  api: MessageSquare,
  database: Database,
  reader: BookOpen,
  analytics: ChartColumn,
};

/** The badge for a live probe. Only terminal integrations have one — the rest
 *  have no status to report until they are configured. */
function StateBadge({ s, ar }: { s?: Status; ar: boolean }) {
  if (!s) return null;
  const map = {
    connected: { tone: "success" as const, label: ar ? "متصل" : "Connected" },
    disconnected: { tone: "warning" as const, label: ar ? "غير متصل" : "Not signed in" },
    missing: { tone: "danger" as const, label: ar ? "غير مثبّت" : "Not installed" },
    unknown: { tone: "neutral" as const, label: ar ? "غير معروف" : "Unknown" },
  }[s.state];
  return <StatusBadge tone={map.tone}>{map.label}</StatusBadge>;
}

/** What this integration is allowed to do, stated rather than implied.
 *
 *  A reader showing "Reads only" is the point of the whole taxonomy: an
 *  operator asking "can this post to my site?" gets an answer instead of an
 *  empty actions list they have to interpret. */
function Capabilities({ i, ar }: { i: Integration; ar: boolean }) {
  const chip = "rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {i.collects && <span className={chip}>{ar ? "يقرأ" : "Reads"}</span>}
      {i.acts && <span className={chip}>{ar ? "يرسل" : "Sends"}</span>}
      {i.collects && !i.acts && (
        <span className={chip} title={ar ? "لا يمكنه إرسال أي شيء" : "This cannot send anything"}>
          {ar ? "قراءة فقط" : "Reads only"}
        </span>
      )}
      {i.beta && (
        <span
          className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning"
          // "Beta" on its own is a shrug. Say what is actually missing: for
          // every integration marked here, the declaration exists and the
          // collector does not — including the OAuth ones, where authorising
          // succeeds and then nothing fetches. Authorisation is not collection.
          title={
            ar
              ? "التكامل معرَّف لكن الجامع لم يُبنَ بعد — المصادقة وحدها لا تجلب البيانات."
              : "Declared, but nothing collects through it yet — authorising alone does not fetch data."
          }
        >
          {ar ? "تجريبي" : "Beta"}
        </span>
      )}
    </div>
  );
}

function Card({
  i, status, ar, busy, rows, rowBusy, conn, onConnect, onDisconnect, onConfigure, onAuthorize,
}: {
  i: Integration;
  status?: Status;
  ar: boolean;
  busy: boolean;
  /** This integration's configured connections. Many are normal. */
  rows: Source[];
  rowBusy: string | null;
  conn: {
    toggle: (s: Source) => void;
    refresh: (s: Source) => void;
    remove: (s: Source) => void;
    replace: (s: Source) => void;
  };
  onConnect: (i: Integration) => void;
  onDisconnect: (i: Integration) => void;
  onConfigure: (i: Integration) => void;
  onAuthorize: (i: Integration) => void;
}) {
  const Icon = iconFor(i.slug, i.icon);
  const terminal = i.auth === "terminal";
  const connected = status?.state === "connected";
  const missing = status?.state === "missing";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: i.color }}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{t(i.title, ar)}</h3>
            <StateBadge s={status} ar={ar} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{t(i.summary, ar)}</p>
        </div>
      </div>

      <Capabilities i={i} ar={ar} />

      {/* Configured connections, for the integrations that have them.
          Terminal logins are genuinely singular — there is one signed-in gh per
          machine — so they get Connect/Disconnect and no list.

          OAuth ones DO get a list. The authorization is one grant per provider,
          but what you do with it is not: two Gmail searches, three calendars
          and a GA4 property are all separate connections riding the same
          Google token. Hiding the list here would have meant authorising
          Google and then having nowhere to say what to collect. */}
      {!terminal && !i.beta && (
        <ConnectionRows
          rows={rows}
          ar={ar}
          busy={rowBusy}
          onAdd={() => onConfigure(i)}
          onToggle={conn.toggle}
          onRefresh={conn.refresh}
          onDelete={conn.remove}
          onReplace={conn.replace}
        />
      )}

      {/* The probe's own words. `gh auth status` names the account, gcloud the
          active one — more useful than any label we could write, and it is how
          an operator spots that they are signed in as the wrong identity. */}
      {status?.detail && (
        <p className="truncate text-xs text-muted-foreground" title={status.detail}>
          <bdi>{status.detail}</bdi>
        </p>
      )}

      {missing && status?.install && (
        <div className="rounded-lg border border-border bg-muted/40 p-2">
          <p className="text-xs text-muted-foreground">
            {ar ? "ثبّته أولًا:" : "Install it first:"}
          </p>
          {/* dir=ltr: a shell command is not Arabic text, and letting it mirror
              puts the flags before the binary. */}
          <code dir="ltr" className="mt-1 block font-mono text-xs">{t(status.install, ar)}</code>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        {terminal ? (
          <>
            <Button size="sm" disabled={busy || missing} onClick={() => onConnect(i)}>
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {connected ? (ar ? "إعادة الاتصال" : "Reconnect") : ar ? "اتصال" : "Connect"}
            </Button>
            {connected && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDisconnect(i)}>
                {ar ? "قطع الاتصال" : "Disconnect"}
              </Button>
            )}
          </>
        ) : i.auth === "oauth" ? (
          // OAuth authorises in the vendor's own window. The button leaves the
          // app deliberately — a redirect the operator can see is the only
          // honest way to do consent.
          <Button size="sm" onClick={() => onAuthorize(i)} disabled={busy}>
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {ar ? "المصادقة" : "Authorize"}
          </Button>
        ) : i.beta ? (
          // A Beta integration is declared but has no runner behind it, so
          // saving a configuration would be refused by the create endpoint.
          // Disabling the button says that before the operator fills a form,
          // rather than after — a 422 naming a field they were never shown is
          // the worst possible way to learn an integration is unfinished.
          <Button
            size="sm"
            variant="outline"
            disabled
            title={
              ar
                ? "لم يُبنَ الجامع لهذا التكامل بعد"
                : "The collector for this integration is not built yet"
            }
          >
            {ar ? "قريبًا" : "Coming soon"}
          </Button>
        ) : null}
        {i.docsUrl && (
          <a
            href={i.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="ms-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {ar ? "الدليل" : "Docs"}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Configure one integration.
 *
 * The form is rendered from the integration's own JSON Schema, which is also
 * what the server validates against — so a field cannot be required on one side
 * and optional on the other, and a new integration needs no UI work.
 */
/**
 * The connections an operator has actually configured for one integration.
 *
 * An integration is a KIND of thing you can connect, not a connection. Three
 * RSS feeds, two Postgres databases and two Slack workspaces are all normal,
 * and `builder_sources` has always been a table of named rows — the gallery was
 * the part that pretended there was one config per integration, offering a
 * single Configure button with nowhere for the second feed to go.
 *
 * Note what is deliberately NOT here: an editor that shows the current values.
 * `config` is written and never read back (internal/sources/service.go), because
 * for a database connection it names a vault secret. Replacing a configuration
 * therefore means entering it again, which is the honest consequence of that
 * choice rather than a gap.
 */
function ConnectionRows({
  rows, ar, busy, onAdd, onToggle, onRefresh, onDelete, onReplace,
}: {
  rows: Source[];
  ar: boolean;
  busy: string | null;
  onAdd: () => void;
  onToggle: (s: Source) => void;
  onRefresh: (s: Source) => void;
  onDelete: (s: Source) => void;
  onReplace: (s: Source) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((s) => {
        const working = busy === s.id;
        return (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5"
          >
            {/* The dot carries the state at a glance: green running clean, red
                failing, hollow disabled. The text beside it says the same thing
                in words, because colour alone is not an accessible signal. */}
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                !s.enabled
                  ? "bg-muted-foreground/40"
                  : s.lastStatus === "error"
                    ? "bg-destructive"
                    : s.lastStatus === "ok"
                      ? "bg-success"
                      : "bg-muted-foreground/60"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                <bdi>{s.name}</bdi>
              </div>
              {/* The server assembles this sentence so every surface says the
                  same thing about the same row. */}
              <div
                className="truncate text-[11px] text-muted-foreground"
                title={t(s.description, ar)}
              >
                {t(s.description, ar)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconBtn
                label={s.enabled ? (ar ? "تعطيل" : "Disable") : ar ? "تفعيل" : "Enable"}
                disabled={working}
                onClick={() => onToggle(s)}
              >
                {s.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </IconBtn>
              <IconBtn
                label={ar ? "تحديث الآن" : "Refresh now"}
                disabled={working || !s.enabled}
                onClick={() => onRefresh(s)}
              >
                <RefreshCw className={`size-3.5 ${working ? "animate-spin" : ""}`} />
              </IconBtn>
              <IconBtn
                label={ar ? "استبدال الإعداد" : "Replace configuration"}
                disabled={working}
                onClick={() => onReplace(s)}
              >
                <Settings2 className="size-3.5" />
              </IconBtn>
              <IconBtn
                label={ar ? "حذف" : "Delete"}
                disabled={working}
                destructive
                onClick={() => onDelete(s)}
              >
                <Trash2 className="size-3.5" />
              </IconBtn>
            </div>
          </div>
        );
      })}
      <Button size="sm" variant="outline" className="mt-0.5 self-start" onClick={onAdd}>
        <Plus className="size-3.5" />
        {rows.length === 0
          ? ar
            ? "إعداد"
            : "Configure"
          : ar
            ? "إضافة اتصال آخر"
            : "Add another"}
      </Button>
    </div>
  );
}

function IconBtn({
  label, disabled, destructive, onClick, children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Both, deliberately: title gives a sighted operator a tooltip, aria-label
      // gives a screen reader the same words. An icon-only button with neither
      // is an unlabelled control.
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ConfigureDialog({
  i, ar, replacing, onClose, onSaved,
}: {
  i: Integration | null;
  ar: boolean;
  /** Set when the form was opened to REPLACE an existing connection's config
   *  rather than add another one. */
  replacing: Source | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const schema = (i?.inputs ?? {}) as JSONSchema;
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("@hourly");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!i) return;
    setValues(defaultsOf(schema));
    setErrors({});
    // Adding: seed a name from the slug and let the operator rename it, which
    // matters as soon as there are two — "rss" and "rss" tells them nothing.
    // Replacing: keep the name the connection already has.
    setName(replacing?.name ?? i.slug);
    setSchedule(replacing?.schedule ?? "@hourly");
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i?.slug, replacing?.id]);

  if (!i) return null;

  const save = async () => {
    const e = validate(schema, values);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setErr(null);
    const config = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    try {
      if (replacing) {
        // PATCH the row that was there. Creating instead would leave the
        // operator with two connections where they meant to fix one — and the
        // old one still running against the configuration they replaced.
        //
        // `enabled` is untouched: replacing the credentials of a live
        // connection should not silently stop it, and replacing a disabled
        // one's should not silently start it.
        await patchSource(replacing.id, { name: name.trim() || replacing.name, schedule, config });
        onSaved(
          ar ? `تم تحديث إعداد ${replacing.name}.` : `${replacing.name} reconfigured.`,
        );
      } else {
        await createSource({
          // The registry says which runner handles this, so the UI never
          // guesses a kind — an integration and its runner cannot drift apart.
          kind: i.sourceKind || i.actorKind || i.slug,
          name: name.trim() || i.slug,
          direction: i.collects ? "source" : "actor",
          // Left EMPTY on purpose, for collectors and actors alike.
          //
          // A collector writes to this fleet's project brain, and only the
          // server knows what that fleet is called — hardcoding
          // "default:project" here was right on a fresh install and silently
          // wrong on any fleet the wizard had named, sending rows to a brain
          // nothing reads. The server fills it in. Actors have no namespace.
          namespace: "",
          schedule,
          config,
          // OFF on create, always. Saving a form must never start polling
          // somebody's database or posting to their channel — turning it on is
          // a separate, deliberate act.
          enabled: false,
        });
        onSaved(
          ar
            ? `تم حفظ ${name.trim() || t(i.title, ar)} — مُعطّل حتى تشغّله.`
            : `${name.trim() || t(i.title, ar)} saved — disabled until you turn it on.`,
        );
      }
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(i.title, ar)}</DialogTitle>
          <DialogDescription>{t(i.summary, ar)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{ar ? "الاسم" : "Name"}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} dir="ltr" />
          </div>

          {i.collects && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{ar ? "التكرار" : "Runs"}</span>
              <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} dir="ltr" />
              <p className="text-xs text-muted-foreground">
                {ar ? "‎@hourly أو ‎@daily أو مدة مثل 30m" : "@hourly, @daily, or a duration like 30m"}
              </p>
            </div>
          )}

          <SchemaForm schema={schema} values={values} errors={errors} onChange={setValues} />

          {err && <p className="text-sm text-danger">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {ar ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Connections = () => {
  const { isRTL: ar } = useStrings();

  const [cats, setCats] = useState<CategoryMeta[]>([]);
  const [items, setItems] = useState<Integration[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [configuring, setConfiguring] = useState<Integration | null>(null);

  // The operator's actual connections, and which row is mid-action.
  const [sources, setSources] = useState<Source[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Set when "Replace configuration" opened the form, so saving PATCHes that
  // row instead of creating a second connection beside it.
  const [replacing, setReplacing] = useState<Source | null>(null);

  const loadSources = useCallback(async () => {
    try {
      const { sources } = await listSources();
      setSources(sources);
    } catch {
      // A failed list leaves the cards without their connections rather than
      // replacing the gallery with an error. The catalogue is still usable.
    }
  }, []);

  // Grouped by kind once per render rather than filtered inside every card,
  // which would be O(integrations × sources) for no reason.
  const byKind = useMemo(() => {
    const m: Record<string, Source[]> = {};
    for (const s of sources) (m[s.kind] ||= []).push(s);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [sources]);

  const rowsFor = useCallback(
    (i: Integration) => byKind[i.sourceKind || i.actorKind || i.slug] ?? [],
    [byKind],
  );

  // Every row action re-reads the list afterwards rather than patching local
  // state: the server computes `description`, `nextRunAt` and the failure count,
  // and a hand-maintained copy of those drifts from what the row actually says.
  const withRow = async (s: Source, fn: () => Promise<unknown>, msg?: string) => {
    setRowBusy(s.id);
    setNotice(null);
    try {
      await fn();
      if (msg) setNotice(msg);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setRowBusy(null);
      await loadSources();
    }
  };

  const conn = {
    toggle: (s: Source) =>
      withRow(s, () => patchSource(s.id, { enabled: !s.enabled })),
    refresh: (s: Source) =>
      withRow(
        s,
        () => refreshSource(s.id),
        ar ? `يجري تحديث ${s.name}…` : `Refreshing ${s.name}…`,
      ),
    remove: (s: Source) => {
      // Deleting a connection throws away a configuration that cannot be read
      // back and therefore cannot be restored by copying it first. Confirming
      // is worth one click.
      const ok = window.confirm(
        ar
          ? `حذف الاتصال "${s.name}"؟ لا يمكن استرجاع إعداداته.`
          : `Delete the connection “${s.name}”? Its configuration cannot be recovered.`,
      );
      if (!ok) return;
      return withRow(
        s,
        () => deleteSource(s.id),
        ar ? `تم حذف ${s.name}.` : `${s.name} deleted.`,
      );
    },
    replace: (s: Source) => {
      const i = items.find((x) => (x.sourceKind || x.actorKind || x.slug) === s.kind);
      if (!i) return;
      setReplacing(s);
      setConfiguring(i);
    },
  };

  const probe = useCallback(async () => {
    setProbing(true);
    try {
      const { statuses } = await getStatuses();
      setStatuses(Object.fromEntries(statuses.map((s) => [s.slug, s])));
    } catch {
      // A failed probe leaves the badges as they were. The catalogue is still
      // useful without them, and an error banner over a working gallery is
      // worse than a stale badge.
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getCatalog()
      .then((d) => {
        if (!alive) return;
        setCats(d.categories);
        setItems(d.integrations);
      })
      .finally(() => alive && setLoading(false));
    // Deliberately NOT awaited with the catalogue: the gallery renders at once
    // and the badges arrive when the probes finish.
    probe();
    // Same reasoning — the cards render before their connections load, and each
    // fills in when the list arrives.
    void loadSources();
    return () => {
      alive = false;
    };
  }, [probe, loadSources]);

  const onConnect = async (i: Integration) => {
    setBusy(i.slug);
    setNotice(null);
    try {
      const r = await connect(i.slug);
      setNotice(
        `${t(r.hint, ar)} — ${ar ? "الجلسة" : "session"} “${r.session}” · ${r.command}`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async (i: Integration) => {
    setBusy(i.slug);
    try {
      const r = await disconnect(i.slug);
      setNotice(`${t(r.hint, ar)} — ${r.command}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onAuthorize = async (i: Integration) => {
    setBusy(i.slug);
    setNotice(null);
    try {
      // Ask the server for the authorize URL rather than building it here: the
      // state and PKCE verifier have to be minted and STORED server-side, or
      // the CSRF defence is decorative.
      const r = await fetch(`/api/builder/integrations/authorize/${i.slug}`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `could not start authorization (${r.status})`);
      window.location.href = d.url;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.slug.includes(needle) ||
        i.title.en.toLowerCase().includes(needle) ||
        i.title.ar.includes(needle) ||
        i.summary.en.toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <PageShell width="wide">
      <PageHeader
        title={ar ? "الاتصالات" : "Connections"}
        icon={<Plug className="size-5" />}
        description={
          ar
            ? "اربط الأدوات والخدمات. بعضها يقرأ إلى الذاكرة، وبعضها يرسل، والقارئات لا ترسل شيئًا."
            : "Connect your tools and services. Some read into the brain, some send, and readers do neither."
        }
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={ar ? "ابحث…" : "Search…"}
                className="w-48 ps-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={probe} disabled={probing}>
              <RefreshCw className={`size-3.5 ${probing ? "animate-spin" : ""}`} />
              {ar ? "تحديث" : "Refresh"}
            </Button>
          </>
        }
      />

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1">{notice}</p>
          <button className="text-xs text-muted-foreground" onClick={() => setNotice(null)}>
            {ar ? "إغلاق" : "Dismiss"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title={ar ? "لا نتائج" : "Nothing matches"}
          description={ar ? "جرّب كلمة أخرى." : "Try another word."}
        />
      ) : (
        cats.map((c) => {
          const group = filtered.filter((i) => i.category === c.key);
          if (group.length === 0) return null;
          const CatIcon = CAT_ICON[c.key];
          return (
            <Section
              key={c.key}
              title={t(c.title, ar)}
              count={group.length}
              actions={<CatIcon className="size-4 text-muted-foreground" />}
            >
              <p className="-mt-1 max-w-[70ch] text-sm text-muted-foreground">{t(c.help, ar)}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((i) => (
                  <Card
                    key={i.slug}
                    i={i}
                    ar={ar}
                    status={statuses[i.slug]}
                    busy={busy === i.slug}
                    rows={rowsFor(i)}
                    rowBusy={rowBusy}
                    conn={conn}
                    onConnect={onConnect}
                    onDisconnect={onDisconnect}
                    onConfigure={setConfiguring}
                    onAuthorize={onAuthorize}
                  />
                ))}
              </div>
            </Section>
          );
        })
      )}

      <ConfigureDialog
        i={configuring}
        ar={ar}
        replacing={replacing}
        onClose={() => {
          setConfiguring(null);
          setReplacing(null);
        }}
        onSaved={(msg) => {
          setNotice(msg);
          // The new row has to appear on the card that opened the form, or the
          // save looks like it did nothing.
          void loadSources();
        }}
      />
    </PageShell>
  );
};
Connections.displayName = "Connections";
