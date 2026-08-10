-- Record which model produced each vector.
--
-- Until now every row in builder_memories was embedded by HashEmbedder, whose
-- vectors carry no semantic content at all. Turning on a real model does not
-- make those rows better; it makes them WORSE, because a hash vector and a
-- bge-m3 vector share this column, its dimension and its distance operator
-- while living in unrelated spaces. Cosine distance between them is a number
-- with no meaning, and a meaningless 0.4 outranks a real match at 0.5.
--
-- So recall filters on the model that wrote the vector, and this column is what
-- it filters on. Old rows keep their vectors, keep their full-text index, and
-- stay findable by keyword exactly as before — they are simply not offered to a
-- vector query they cannot answer. reembed.go replaces them in the background
-- once a real embedder is configured, at which point they rejoin the vector arm
-- with meaning behind them.
--
-- NOTHING IS DROPPED. Not the column, not the index, not a row. The width does
-- not change either: migration 0002 already declared vector(1024) and bge-m3 is
-- 1024, so the schema that was built for the hash embedder happens to fit the
-- real one exactly.

BEGIN;

ALTER TABLE builder_memories
  ADD COLUMN IF NOT EXISTS embedding_model text;

-- Every existing vector came from HashEmbedder, which is what it reports as its
-- name. Labelled rather than nulled: NULL would mean "unknown provenance", and
-- these are known — they are hashed bags of words, and saying so is what lets
-- the backfill find them and an operator understand the count.
UPDATE builder_memories
   SET embedding_model = 'hash-bow'
 WHERE embedding IS NOT NULL
   AND embedding_model IS NULL;

-- The backfill's scan predicate: rows that have text but no vector from the
-- current model. Partial, so it indexes only the work queue and shrinks to
-- nothing as the backfill drains it — a full index on a column with one
-- distinct value would be dead weight forever after.
CREATE INDEX IF NOT EXISTS builder_memories_embed_model
  ON builder_memories (namespace, embedding_model)
  WHERE invalid_at IS NULL;

COMMIT;
