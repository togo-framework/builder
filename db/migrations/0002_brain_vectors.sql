-- Per-agent memory: the vector column and its index.
--
-- Separate from 0001 so a Postgres without pgvector still boots — the brain
-- degrades to driver='none' rather than the whole app failing to migrate.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- 1024 dimensions: what the default local embedder produces, and comfortably
-- under pgvector's 2000-dimension HNSW ceiling.
ALTER TABLE builder_memories ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Partial HNSW: rows without an embedding (retained before the embedder was
-- configured) are skipped rather than poisoning the index.
CREATE INDEX IF NOT EXISTS builder_memories_hnsw
  ON builder_memories USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Recall is always namespace-scoped, and the namespace is a *pre*-filter here
-- rather than a post-filter over a global index. A global index with a
-- namespace filter applied afterwards starves: at ef_search=40 a query against
-- a small namespace inside a large corpus returns mostly rows it must discard.
CREATE INDEX IF NOT EXISTS builder_memories_ns_valid
  ON builder_memories (namespace, valid_at DESC)
  WHERE invalid_at IS NULL;

COMMIT;
