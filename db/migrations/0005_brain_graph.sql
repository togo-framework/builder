-- The entity graph: the half of a brain that flat vector search cannot do.
--
-- Recall today fuses vector similarity and BM25, which finds memories that LOOK
-- like the query. It cannot find the memory that never mentions the query's
-- words but is about the same thing — the note about `dispatch.go` when you ask
-- about "the fleet going idle". cabrain closes that with a 1-hop entity
-- expansion: resolve the query's hits to entities, then pull in what else those
-- entities appear in.
--
-- Entities here are extracted deterministically (file paths, Go/TS symbols,
-- issue refs, agent slugs, areas) rather than by a model call. A blueprint that
-- needs an LLM round trip to store a memory is one nobody turns on.

CREATE TABLE IF NOT EXISTS builder_entities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace     text NOT NULL,
  -- Canonical form, lowercased. `Dispatch.go` and `dispatch.go` are one entity.
  name          text NOT NULL,
  -- What kind of thing it is, which is what makes the graph readable rather
  -- than a bag of strings.
  kind          text NOT NULL DEFAULT 'term',
  mention_count integer NOT NULL DEFAULT 0,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT builder_entities_kind_check
    CHECK (kind IN ('file','symbol','issue','agent','area','term')),
  CONSTRAINT builder_entities_name_len CHECK (length(name) BETWEEN 2 AND 200),
  -- One row per (brain, name). The graph is per-namespace: agents do not share
  -- entities any more than they share memories.
  UNIQUE (namespace, name)
);
CREATE INDEX IF NOT EXISTS builder_entities_ns ON builder_entities (namespace, mention_count DESC);
CREATE INDEX IF NOT EXISTS builder_entities_kind ON builder_entities (namespace, kind);

-- Which memories mention which entities. This is the edge that recall walks.
CREATE TABLE IF NOT EXISTS builder_memory_entities (
  memory_id uuid NOT NULL REFERENCES builder_memories(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES builder_entities(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, entity_id)
);
CREATE INDEX IF NOT EXISTS builder_memory_entities_by_entity
  ON builder_memory_entities (entity_id);

-- Entity-to-entity co-occurrence. Two entities named in the same memory are
-- related; weight is how often. This is what makes the graph a graph rather
-- than two disconnected lists.
CREATE TABLE IF NOT EXISTS builder_entity_edges (
  namespace text NOT NULL,
  from_id   uuid NOT NULL REFERENCES builder_entities(id) ON DELETE CASCADE,
  to_id     uuid NOT NULL REFERENCES builder_entities(id) ON DELETE CASCADE,
  weight    integer NOT NULL DEFAULT 1,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id),
  -- Stored once per unordered pair, not twice. Without this a graph of N
  -- entities carries 2x the edges and every query has to de-duplicate.
  CONSTRAINT builder_entity_edges_ordered CHECK (from_id < to_id)
);
CREATE INDEX IF NOT EXISTS builder_entity_edges_ns ON builder_entity_edges (namespace, weight DESC);
