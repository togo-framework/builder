import { useEffect, useState } from "react";
import { Button, Callout, EmptyState, PageHeader, StatCard } from "@togo-framework/ui";
import { Brain as BrainIcon, X } from "lucide-react";
import { BrainGraph } from "../components/brain-graph";
import {
  fetchProjectBrain, fetchProjectEntity,
  type ProjectBrain, type ProjectEntity, type ProjectMemory,
} from "../lib/brainproject";
import type { BrainGraphNode } from "../lib/agents";

/** A memory with where it came from. Provenance is the point of this screen. */
const MemoryCard = ({ m }: { m: ProjectMemory }) => (
  <div className="rounded-lg border border-border bg-card p-3">
    <p className="whitespace-pre-wrap text-sm">{m.content}</p>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{m.from.kind}</span>
      <span className="break-all">{m.from.label}</span>
    </div>
  </div>
);
MemoryCard.displayName = "MemoryCard";

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
    <div className="mx-auto w-full max-w-6xl p-6">
      <PageHeader
        title="Project brain"
        description="What this project knows, and where each piece of it came from. Every agent reads this; every source writes into it."
      />

      {err && <Callout kind="warn" className="mt-4">{err}</Callout>}

      {/* Said plainly. A graph rendered over keyword overlap invites trust it
          has not earned, and the operator cannot tell by looking. */}
      {b && !b.semantic && (
        <Callout kind="warn" className="mt-4" title="Recall here is keyword-only">
          The embedder is <code>{b.embedder}</code>, a hashed bag of words with no semantic
          content: “the login button is broken” and “authentication fails” score as unrelated.
          Set <code>BUILDER_EMBED_URL</code> to an embeddings endpoint for real recall.
        </Callout>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Memories" value={String(b?.memories ?? 0)} />
        <StatCard label="Entities" value={String(b?.entities ?? 0)} />
        <StatCard label="Connections" value={String(b?.edges ?? 0)} />
        <StatCard label="Namespace" value={b?.namespace ?? "—"} />
      </div>

      {/* Built from what is actually in the brain, so a deleted source still
          explains the memories it left behind. */}
      {b && b.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("")}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === "" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            Everything
          </button>
          {b.sources.map((s) => {
            const key = s.kind === "document" ? `doc:${s.source}` : `source:${s.kind}:${s.source}`;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filter === key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                {s.label} <span className="tabular-nums opacity-70">{s.memories}</span>
              </button>
            );
          })}
        </div>
      )}

      {b && b.graph.nodes.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-card p-2">
          <BrainGraph
            nodes={b.graph.nodes}
            edges={b.graph.edges}
            onSelect={handleSelect}
            selectedId={selected?.id ?? null}
          />
        </div>
      )}

      {selected && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
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
          <div className="mt-3 space-y-2">
            {!entity && <p className="text-sm text-muted-foreground">Loading…</p>}
            {entity?.memories.map((m) => <MemoryCard key={m.id} m={m} />)}
            {entity?.memories.length === 0 && (
              <p className="text-sm text-muted-foreground">No memories reference this yet.</p>
            )}
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-medium text-muted-foreground">
        {filter ? "Filtered memories" : "Most recent"}
      </h2>
      <div className="mt-2 space-y-2">
        {b === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {b?.recent.length === 0 && (
          <EmptyState
            icon={<BrainIcon className="size-6" />}
            title="Nothing here yet"
            description="Add a source or upload a document and the brain fills itself."
          />
        )}
        {b?.recent.map((m) => <MemoryCard key={m.id} m={m} />)}
      </div>
    </div>
  );
};
Brain.displayName = "Brain";
