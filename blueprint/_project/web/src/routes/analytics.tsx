// Analytics — the numbers the GA4 and Search Console connections collect.
//
// This is the second half of those integrations. The first half writes a prose
// summary into the brain, which is what an agent recalls when asked "how did
// the site do last week". Prose is the wrong shape for a chart, so the same
// fetch also writes rows to builder_analytics_points, and this reads them.
//
// Everything here is scoped to ONE connection. Summing two GA4 properties into
// a single line would be a chart of a number nobody measures.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState } from "@togo-framework/ui";
import { ChartColumn, LoaderCircle, RefreshCw } from "lucide-react";
import { AppPageHeader as PageHeader, PageShell, Section } from "../components/page-shell";
import { Sparkline, TopBars, type SeriesPoint } from "../components/ui/sparkline";
import { useStrings } from "../lib/i18n";
import { API } from "../lib/api";

const base = `${API}/api/builder/sources/analytics`;

interface Conn {
  id: string;
  kind: string;
  name: string;
  points: number;
  lastDay: string;
}

/** Which metrics belong to which provider, and how each one reads. */
const METRICS = {
  ga4: [
    { key: "screenPageViews", en: "Page views", ar: "مشاهدات الصفحات" },
    { key: "activeUsers", en: "Active users", ar: "المستخدمون النشطون" },
  ],
  gsc: [
    { key: "clicks", en: "Clicks", ar: "النقرات" },
    { key: "impressions", en: "Impressions", ar: "مرات الظهور" },
    // Average RANK: smaller is better, which the chart has to know or it
    // draws the worst-performing queries as the winners.
    { key: "position", en: "Average position", ar: "متوسط الترتيب", ascending: true },
  ],
} as const;

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(base + path, { credentials: "include" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error || `request failed (${r.status})`);
  return d as T;
};

export const Analytics = () => {
  const { isRTL: ar } = useStrings();
  const [conns, setConns] = useState<Conn[]>([]);
  const [active, setActive] = useState<string>("");
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<Record<string, SeriesPoint[]>>({});
  const [top, setTop] = useState<Record<string, { dimension: string; value: number }[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const conn = useMemo(() => conns.find((c) => c.id === active), [conns, active]);
  const metrics = useMemo(
    () => (conn ? (METRICS[conn.kind as keyof typeof METRICS] ?? []) : []),
    [conn],
  );

  const loadConns = useCallback(async () => {
    try {
      const d = await get<{ connections: Conn[] }>("/connections");
      setConns(d.connections);
      // Pick one on first load, so the page is not an empty picker over an
      // empty chart when there is exactly one obvious answer.
      setActive((cur) => cur || d.connections[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConns();
  }, [loadConns]);

  const loadData = useCallback(async () => {
    if (!conn) return;
    setBusy(true);
    try {
      // Requested in PARALLEL. Each is an independent query and the page is
      // useless until all of them answer, so serialising would make the wait
      // the sum rather than the slowest.
      const results = await Promise.all(
        metrics.flatMap((m) => [
          get<{ points: SeriesPoint[] }>(
            `/series?metric=${m.key}&days=${days}&sourceId=${conn.id}`,
          ).then((d) => ["s", m.key, d.points] as const),
          get<{ rows: { dimension: string; value: number }[] }>(
            `/top?metric=${m.key}&limit=8&sourceId=${conn.id}`,
          ).then((d) => ["t", m.key, d.rows] as const),
        ]),
      );
      const s: Record<string, SeriesPoint[]> = {};
      const t: Record<string, { dimension: string; value: number }[]> = {};
      for (const [which, key, val] of results) {
        if (which === "s") s[key] = val as SeriesPoint[];
        else t[key] = val as { dimension: string; value: number }[];
      }
      setSeries(s);
      setTop(t);
    } catch {
      // A failed load leaves the previous chart rather than replacing the page
      // with an error. A stale number is more useful than no page, and the
      // Refresh button is right there.
    } finally {
      setBusy(false);
    }
  }, [conn, metrics, days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <PageShell width="wide">
        <div className="grid place-items-center py-16">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        icon={<ChartColumn className="size-5" />}
        title={ar ? "التحليلات" : "Analytics"}
        description={
          ar
            ? "أرقام من اتصالات جوجل أناليتكس وسيرش كونسول."
            : "Numbers from your Google Analytics and Search Console connections."
        }
        actions={
          conns.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={busy}>
              <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
              {ar ? "تحديث" : "Refresh"}
            </Button>
          )
        }
      />

      {conns.length === 0 ? (
        <EmptyState
          icon={<ChartColumn className="size-6" />}
          title={ar ? "لا توجد بيانات بعد" : "No analytics data yet"}
          // Says the NEXT ACTION, not just the absence. The most common reason
          // to land here is a connection that has been configured but never
          // authorised or never run.
          description={
            ar
              ? "أضف اتصال جوجل أناليتكس أو سيرش كونسول من صفحة الاتصالات، فوّض حساب جوجل، ثم شغّله. تظهر الأرقام بعد أول جلب."
              : "Add a Google Analytics or Search Console connection from Connections, authorize Google, and turn it on. Numbers appear after the first fetch."
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {conns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  c.id === active
                    ? "border-brand bg-brand/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <bdi>{c.name}</bdi>
                {/* The last day WITH data, not "now". Analytics lags by days,
                    and an operator who does not know that reads a two-day-old
                    chart as a broken connection. */}
                <span className="ms-2 text-[11px] text-muted-foreground">{c.lastDay}</span>
              </button>
            ))}
            <div className="ms-auto flex overflow-hidden rounded-lg border border-border">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    d === days ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {metrics.map((m) => {
              const asc = "ascending" in m && m.ascending;
              const pts = series[m.key] ?? [];
              const latest = pts.length ? pts[pts.length - 1].value : null;
              return (
                <Section key={m.key} title={ar ? m.ar : m.en}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-semibold tabular-nums">
                      {latest === null
                        ? "—"
                        : Number.isInteger(latest)
                          ? latest.toLocaleString()
                          : latest.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ar ? `آخر ${days} يوم` : `last ${days} days`}
                    </span>
                  </div>
                  <Sparkline points={pts} label={ar ? m.ar : m.en} className="mt-2" />
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {ar ? "الأعلى" : "Top"}
                    </p>
                    <TopBars
                      rows={top[m.key] ?? []}
                      ascending={!!asc}
                      emptyLabel={ar ? "لا تفصيل بعد" : "No breakdown yet"}
                    />
                  </div>
                </Section>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
};
