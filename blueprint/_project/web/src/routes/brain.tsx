import { useEffect, useState } from "react";
import { Button, Callout, EmptyState, PageHeader } from "@togo-framework/ui";
import { Brain as BrainIcon, X } from "lucide-react";
import { BrainGraph } from "../components/brain-graph";
import {
  fetchProjectBrain, fetchProjectEntity,
  type ProjectBrain, type ProjectEntity, type ProjectMemory,
} from "../lib/brainproject";
import type { BrainGraphNode } from "../lib/agents";
import {
  FilterChip, ListSkeleton, MonoBadge, PageShell, Rows, Section, Stat, StatRow,
} from "../components/page-shell";

/** A memory with where it came from. Provenance is the point of this screen.
 *  A row inside a grouped list, not its own card — twenty memories each in a
 *  bordered slab drowned the content in chrome. */
const MemoryRow = ({ m }: { m: ProjectMemory }) => (
  <div className="px-3 py-2.5 transition-colors hover:bg-muted/40">
    <p className="whitespace-pre-wrap text-sm">{m.content}</p>
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <MonoBadge>{m.from.kind}</MonoBadge>
      <span className="break-all">{m.from.label}</span>
    </div>
  </div>
);
MemoryRow.displayName = "MemoryRow";

export const Brain = () => {
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

  return (
    <PageShell>
      <PageHeader
        title="Project brain"
        icon={<BrainIcon className="size-5" />}
        description="What this project knows, and where each piece of it came from. Every agent reads this; every source writes into it."
      />

      {err && <Callout kind="warn">{err}</Callout>}

      {/* Said plainly. A graph rendered over keyword overlap invites trust it
          has not earned, and the operator cannot tell by looking. */}
      {b && !b.semantic && (
        <Callout kind="warn" title="Recall here is keyword-only">
          The embedder is <code>{b.embedder}</code>, a hashed bag of words with no semantic
          content: “the login button is broken” and “authentication fails” score as unrelated.
          Set <code>BUILDER_EMBED_URL</code> to an embeddings endpoint for real recall.
        </Callout>
      )}

      <StatRow>
        <Stat label="Memories" value={b?.memories ?? 0} />
        <Stat label="Entities" value={b?.entities ?? 0} />
        <Stat label="Connections" value={b?.edges ?? 0} />
        <Stat label="Namespace" value={b?.namespace ?? "—"} mono />
      </StatRow>

      {/* Built from what is actually in the brain, so a deleted source still
          explains the memories it left behind. */}
      {b && b.sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === ""} onClick={() => setFilter("")}>
            Everything
          </FilterChip>
          {b.sources.map((s) => {
            const key = s.kind === "document" ? `doc:${s.source}` : `source:${s.kind}:${s.source}`;
            return (
              <FilterChip key={s.label} active={filter === key} onClick={() => setFilter(key)}>
                {s.label} <span className="tabular-nums opacity-70">{s.memories}</span>
              </FilterChip>
            );
          })}
        </div>
      )}

      {b && b.graph.nodes.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-2">
          <BrainGraph
            nodes={b.graph.nodes}
            edges={b.graph.edges}
            onSelect={handleSelect}
            selectedId={selected?.id ?? null}
          />
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium">{selected.name}</h3>
              <p className="text-xs text-muted-foreground">
                {selected.kind} · {entity?.mentions ?? selected.mentions} mention
                {(entity?.mentions ?? selected.mentions) === 1 ? "" : "s"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setEntity(null); }}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3">
            {!entity && <ListSkeleton rows={2} />}
            {entity && entity.memories.length > 0 && (
              <Rows>
                {entity.memories.map((m) => <MemoryRow key={m.id} m={m} />)}
              </Rows>
            )}
            {entity?.memories.length === 0 && (
              <p className="text-sm text-muted-foreground">No memories reference this yet.</p>
            )}
          </div>
        </div>
      )}

      <Section
        title={filter ? "Filtered memories" : "Most recent"}
        count={b?.recent.length}
      >
        {b === null && <ListSkeleton rows={3} />}
        {b?.recent.length === 0 && (
          <EmptyState
            icon={<BrainIcon className="size-6" />}
            title="Nothing here yet"
            description="Add a source or upload a document and the brain fills itself."
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
