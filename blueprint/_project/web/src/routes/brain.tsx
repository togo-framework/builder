import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Callout, EmptyState } from "@togo-framework/ui";
import {
  Bot, Boxes, Brain as BrainIcon, Database, FileText, Github, Globe, ListFilter,
  MessageSquare, PenLine, Rss, X,
} from "lucide-react";
import { BrainGraph } from "../components/brain-graph";
import {
  fetchProjectBrain, fetchProjectEntity,
  type ProjectBrain, type ProjectEntity, type ProjectMemory,
} from "../lib/brainproject";
import type { BrainGraphNode } from "../lib/agents";
import {
  FilterChip, MonoBadge, PageShell, Rows, Section, Shimmer, Stat, StatRow, StatSkeleton,
} from "../components/page-shell";
import { useStrings } from "../lib/i18n";
import { useKnowledge } from "../lib/i18n.knowledge";

/**
 * One glyph per ingestion kind, shared in spirit with the sources screen: a
 * memory's provenance and the source that produced it must be recognisable as
 * the same thing at a glance. Shape carries the kind, so the mark still works
 * in a monochrome screenshot and for a reader who cannot separate the hues.
 */
const KIND_ICON: Record<string, ComponentType<{ className?: string }>> = {
  github: Github,
  rss: Rss,
  slack: MessageSquare,
  crawl: Globe,
  sql: Database,
  document: FileText,
  agent: Bot,
  chat: MessageSquare,
  manual: PenLine,
};
const kindIcon = (k: string) => KIND_ICON[k] ?? Boxes;

/** The citation separator. Decoration, never read aloud. */
const Sep = () => (
  <span aria-hidden="true" className="select-none text-border">
    ·
  </span>
);
Sep.displayName = "Sep";

/**
 * A memory, rendered as a CITATION.
 *
 * The claim reads first and in the foreground colour; the provenance sits
 * underneath in one quiet line — source · reference · when — the shape a reader
 * already knows from a footnote. Before, the kind was a mono chip and the label
 * a bare string, which made the two halves of the same fact look like two
 * unrelated tags.
 *
 * It is a row inside a grouped list, not its own card: twenty memories each in
 * a bordered slab drowned the content in chrome.
 */
const MemoryRow = ({ m }: { m: ProjectMemory }) => {
  const { S } = useStrings();
  const K = useKnowledge();
  const [open, setOpen] = useState(false);
  const Icon = kindIcon(m.from.kind);

  // The citation is assembled from the PARTS, not from `from.label` — the
  // server composes that as "kind · source · ref", so rendering the label and
  // then the ref beside it prints the same reference twice, and the glyph
  // repeats the kind a third time.
  const primary = m.from.source || m.from.label;
  const ref = m.from.ref && m.from.ref !== primary ? m.from.ref : "";

  // A crawled page arrives as several paragraphs of prose. Sixty of them at
  // full height is not a list, it is a document nobody scrolls — so the claim
  // is clamped to a readable opening and the rest is one click away. The
  // threshold is a heuristic on purpose: measuring the rendered height would
  // cost a layout pass per row for a decision the character count already makes
  // correctly.
  const long = m.content.length > 260;

  return (
    <article className="motion-hover px-3 py-3 hover:bg-muted/40">
      {/* dir="auto": memories arrive in whatever language the source wrote —
          an English memory under the Arabic UI must still read left-to-right. */}
      <p
        dir="auto"
        className={`whitespace-pre-wrap text-sm leading-relaxed text-foreground ${
          long && !open ? "line-clamp-4" : ""
        }`}
      >
        {m.content}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="motion-hover mt-1 rounded-field text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? K.brain.less : K.brain.more}
        </button>
      )}

      <footer className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="sr-only">{K.brain.fromLabel}</span>
        <Icon aria-label={m.from.kind} className="size-3.5 shrink-0" />
        {/* <bdi> rather than a dir on the row: an English feed name inside an
            Arabic line must isolate itself without dragging the whole citation
            away from the reading edge. */}
        <bdi className="min-w-0 truncate font-medium text-foreground/80">{primary}</bdi>
        {ref && (
          <>
            <Sep />
            <bdi dir="ltr" className="min-w-0 truncate font-mono text-[11px]">{ref}</bdi>
          </>
        )}
        <Sep />
        <time dateTime={m.createdAt} className="shrink-0 tabular-nums">
          {S.sources.ago(m.createdAt)}
        </time>
      </footer>
    </article>
  );
};
MemoryRow.displayName = "MemoryRow";

/** The citation-shaped loading block — a claim, then its provenance line. */
const MemorySkeleton = ({ rows = 2 }: { rows?: number }) => (
  <div className="divide-y divide-border" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="space-y-2 px-3 py-3">
        <Shimmer className="h-3.5 w-11/12" />
        <Shimmer className="h-3.5 w-3/5" />
        <Shimmer className="h-2.5 w-1/3" />
      </div>
    ))}
  </div>
);
MemorySkeleton.displayName = "MemorySkeleton";

export const Brain = () => {
  const { S } = useStrings();
  const K = useKnowledge();
  const navigate = useNavigate();
  const [b, setB] = useState<ProjectBrain | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<BrainGraphNode | null>(null);
  const [entity, setEntity] = useState<ProjectEntity | null>(null);

  const load = (source: string) => {
    fetchProjectBrain(source).then(setB).catch((e) => setErr(String(e.message)));
  };

  useEffect(() => load(filter), [filter]);

  const handleSelect = (n: BrainGraphNode) => {
    setSelected(n);
    setEntity(null);
    fetchProjectEntity(n.id).then(setEntity).catch((e) => setErr(String(e.message)));
  };

  const handleClose = () => {
    setSelected(null);
    setEntity(null);
  };

  // Loading and "no entities at all" are different answers. The map keeps its
  // place through the first while so the page does not reflow under the reader.
  const showMap = b === null || b.graph.nodes.length > 0;

  return (
    <PageShell title={S.brain.title} icon={<BrainIcon />} description={S.brain.desc}>
      {err && <Callout kind="warn">{err}</Callout>}

      {/* Said plainly. A graph rendered over keyword overlap invites trust it
          has not earned, and the operator cannot tell by looking. The sentence
          is assembled around its two <code> islands so both languages keep the
          identifiers verbatim and LTR. */}
      {b && !b.semantic && (
        <Callout kind="warn" title={S.brain.keywordTitle}>
          {S.brain.kbBefore}<code dir="ltr">{b.embedder}</code>{S.brain.kbMiddle}
          <code dir="ltr">BUILDER_EMBED_URL</code>{S.brain.kbAfter}
        </Callout>
      )}

      {b === null ? (
        <StatSkeleton />
      ) : (
        <StatRow>
          <Stat label={S.brain.statMemories} value={b.memories} />
          <Stat label={S.brain.statEntities} value={b.entities} />
          <Stat label={S.brain.statConnections} value={b.edges} />
          <Stat label={S.brain.statNamespace} value={b.namespace} mono />
        </StatRow>
      )}

      {/* THE FACET BAR.
          Built from what is actually in the brain, so a deleted source still
          explains the memories it left behind. A labelled, bordered bar rather
          than a loose row of pills: a filter that floats between two blocks
          looks like content, and the reader cannot tell what it acts on. */}
      {b && b.sources.length > 0 && (
        <div
          role="group"
          aria-label={K.brain.filterLegend}
          className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-2"
        >
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListFilter aria-hidden="true" className="size-3.5" />
            {K.brain.filterLabel}
          </span>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

          <FilterChip active={filter === ""} onClick={() => setFilter("")}>
            {S.brain.everything}
          </FilterChip>
          {b.sources.map((s) => {
            const key = s.kind === "document" ? `doc:${s.source}` : `source:${s.kind}:${s.source}`;
            const Icon = kindIcon(s.kind);
            return (
              <FilterChip
                key={s.label}
                active={filter === key}
                onClick={() => setFilter(key)}
                // The composed label is the hover answer; the chip itself shows
                // the source alone, because the glyph has already said the kind
                // and a feed URL will not survive a pill at any width.
                title={s.label}
                className="max-w-[15rem]"
              >
                <Icon aria-hidden="true" className="size-3 shrink-0 opacity-70" />
                <bdi className="min-w-0 truncate">{s.source || s.label}</bdi>
                <span className="shrink-0 tabular-nums opacity-60">{s.memories}</span>
              </FilterChip>
            );
          })}

          {filter !== "" && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="motion-hover ms-auto inline-flex shrink-0 items-center gap-1 rounded-field px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X aria-hidden="true" className="size-3.5" />
              {K.brain.clear}
            </button>
          )}
        </div>
      )}

      {/* MASTER–DETAIL. The map is capped at the width its square canvas can
          actually use; the detail column takes the rest, because memories are
          prose and prose needs the measure. Stacked on narrow screens. */}
      {showMap && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start">
          <Section title={K.brain.mapTitle} count={b?.graph.nodes.length}>
            {b === null ? (
              <Shimmer className="aspect-square w-full max-w-[560px] rounded-card" />
            ) : (
              <BrainGraph
                nodes={b.graph.nodes}
                edges={b.graph.edges}
                onSelect={handleSelect}
                selectedId={selected?.id ?? null}
              />
            )}
          </Section>

          <Section title={K.brain.selectionTitle} count={selected ? entity?.memories.length : undefined}>
            {selected ? (
              <div className="motion-entrance overflow-hidden rounded-card border border-border bg-card">
                <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <h3 dir="auto" className="truncate text-sm font-semibold">{selected.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <MonoBadge>{selected.kind}</MonoBadge>
                      <span className="tabular-nums">
                        {S.brain.mentions(entity?.mentions ?? selected.mentions)}
                      </span>
                      {entity?.lastSeen && (
                        <>
                          <Sep />
                          <span>{K.brain.lastSeen} {S.sources.ago(entity.lastSeen)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="sm" aria-label={S.common.close} onClick={handleClose}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="max-h-[30rem] divide-y divide-border overflow-y-auto">
                  {!entity && <MemorySkeleton rows={2} />}
                  {entity?.memories.map((m) => <MemoryRow key={m.id} m={m} />)}
                  {entity?.memories.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {S.brain.noMemoriesRef}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* A WAYFINDER, not a blank panel: the empty half of a master–detail
                 is the one place a reader will look for what to do next. */
              <div className="rounded-card border border-dashed border-border px-4 py-10 text-center">
                <BrainIcon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{K.brain.selectionIdleTitle}</p>
                <p className="mx-auto mt-1 max-w-[38ch] text-xs text-muted-foreground">
                  {K.brain.selectionIdleDesc}
                </p>
              </div>
            )}
          </Section>
        </div>
      )}

      <Section
        title={filter ? S.brain.filtered : S.brain.recent}
        count={b?.recent.length}
      >
        {b === null && (
          <div className="overflow-hidden rounded-card border border-border bg-card">
            <MemorySkeleton rows={3} />
          </div>
        )}

        {/* Two different silences, two different answers. An empty brain points
            at the pipe that fills it; an empty FILTER points back at the rest of
            the brain, which is still there. */}
        {b?.recent.length === 0 && filter === "" && (
          <EmptyState
            icon={<BrainIcon className="size-6" />}
            title={S.brain.emptyTitle}
            description={S.brain.emptyDesc}
            action={
              <Button onClick={() => navigate({ to: "/sources" })}>
                <Rss className="me-1.5 size-4" />
                {K.brain.manageSources}
              </Button>
            }
          />
        )}
        {b?.recent.length === 0 && filter !== "" && (
          <EmptyState
            icon={<ListFilter className="size-6" />}
            title={K.brain.filteredEmptyTitle}
            description={K.brain.filteredEmptyDesc}
            action={
              <Button variant="outline" onClick={() => setFilter("")}>
                {K.brain.showEverything}
              </Button>
            }
          />
        )}

        {b && b.recent.length > 0 && (
          <Rows>
            {b.recent.map((m) => <MemoryRow key={m.id} m={m} />)}
          </Rows>
        )}
      </Section>
    </PageShell>
  );
};
Brain.displayName = "Brain";
