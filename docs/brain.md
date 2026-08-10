# What is the project brain, and how good is recall really?

The brain (`internal/brain/`) is builder's shared memory: **memories** plus an
**entity graph**, every memory carrying provenance — where it came from.

Agents read it to answer questions nobody pasted into a prompt. Sources
(`internal/sources/`) and the document library (`internal/docs/`) write into it.

## Read this before you trust a "related memories" panel

**The default embedder is still a hashed bag of words with no semantic content
whatever.** It is what you get until `BUILDER_EMBED_URL` is set and answering.

Quoting `internal/brain/embed_http.go` directly:

> `HashEmbedder` is a hashed bag of words. It has no semantic content whatever:
> "the login button is broken" and "authentication fails" share no tokens, so
> they embed orthogonally and recall scores them as unrelated. Every screen that
> says "related memories" has been showing keyword overlap wearing relevance's
> clothes, and the MCP recall tool inherits the same lie.

So with the default configuration:

- Recall is **keyword overlap**, not semantic similarity.
- Two paraphrases of the same fact will not find each other.
- The MCP recall tool has the same limitation.

This is not a bug to file. It is the offline-capable default, and it is honest
about being shallow.

**The answer to "is this real recall?" is `semantic` on `GET
/api/builder/brain`, and the boot log.** It is true only when a real embedder
was configured, probed successfully at boot, and is still answering.

## Turning on a real embedder

Point builder at any endpoint speaking OpenAI's `/v1/embeddings` wire format —
TEI, Ollama, LM Studio, vLLM, llama.cpp's server, or OpenAI itself. Chosen over
a vendor SDK because this file must stay dependency-free: the plugin has to
scaffold a standalone app.

| Variable | Meaning | Default |
|---|---|---|
| `BUILDER_EMBED_URL` | The endpoint. A bare origin (`http://tei-embed:80`) gets `/v1/embeddings` appended | unset — **this is the switch** |
| `BUILDER_EMBED_MODEL` | Model name the endpoint expects | `bge-m3` |
| `BUILDER_EMBED_KEY` | Bearer token; omit for a local endpoint that wants none | unset |
| `BUILDER_EMBED_DIM` | Vector width, when the model is not the package `Dim` | `1024` |

`bge-m3` is the default because it is the only choice that fits the schema
without further configuration: `Dim` is 1024, migration 0002 declares
`vector(1024)`, and bge-m3 is 1024 wide. It is also multilingual, which matters
here — memories arrive in English and Arabic, and measured cross-lingually
"authentication fails" sits 0.189 from "تعذر تسجيل الدخول", closer than it sits
to its own English paraphrase.

> The previous default was `nomic-embed-text`, which is 768. `New()` rejects a
> width mismatch at boot, so every operator who set only `BUILDER_EMBED_URL` got
> a hard failure. The default is now one that works.

```bash
# public
BUILDER_EMBED_URL=https://think.example.com/v1/embeddings ./builderd

# in-cluster: two services, so the reranker needs naming explicitly
BUILDER_EMBED_URL=http://tei-embed:80 \
BUILDER_RERANK_URL=http://tei-rerank:80/rerank \
  ./builderd
```

### What happens when it is not reachable

The endpoint is **probed at boot** with one short embedding. If it does not
answer, builder logs at ERROR and **falls back to the hash embedder**:

```
ERROR builder.brain embedding endpoint did not answer — FALLING BACK to
      keyword-only recall  embedder=http:bge-m3 err="embedding endpoint returned 522"
INFO  builder.brain ready  embedder=hash-bow dim=1024 semantic=false
INFO  builder.brain recall is KEYWORD-ONLY — set BUILDER_EMBED_URL ...
```

Recall degrades; nothing crashes. A day-0 harness that refuses to start because
a network dependency is down is worse than one that starts shallow and says so.

If the endpoint dies **after** boot, the embedder is marked unhealthy after 3
consecutive failures and `semantic` flips to false. It flips back on the next
success. Builder never swaps in the hash embedder mid-run — hash vectors and
model vectors share a column and a distance operator but not a space, so a hash
vector written between two model vectors is not a worse neighbour, it is a
meaningless one.

HTTP client timeout is 60s — long enough for a cold local model's first batch,
bounded so a hung endpoint cannot wedge an ingest forever.

## Reranking

Retrieval and ranking are different problems and a bi-encoder is only good at
the first. Embedding compresses a chunk into one vector *before it has seen the
query*, so "does this passage answer THIS question?" is a judgement it
structurally cannot make. A cross-encoder reads the query and the passage
together and scores the pair — it cannot be indexed, which is why it runs over
50 candidates and not over the table.

Recall is now: **vector + full-text fetch N candidates → cross-encoder orders
them → the top `limit` are returned.**

| Variable | Meaning | Default |
|---|---|---|
| `BUILDER_RERANK_URL` | The endpoint | derived: `<embed origin>/rerank` |
| `BUILDER_RERANK_MODEL` | Model name, for endpoints that want one | unset (field omitted) |
| `BUILDER_RERANK_KEY` | Bearer token | falls back to `BUILDER_EMBED_KEY` |
| `BUILDER_RERANK_CANDIDATES` | Rows ranked before returning `limit` | `50`, clamped to `[limit, 200]` |
| `BUILDER_RERANK_MIN_SCORE` | Minimum score to be returned | **no floor** |
| `BUILDER_RERANK_OFF` | Disable reranking with the embedder still on | unset |

Both wire shapes are read: a bare array `[{"index":0,"score":0.99}]` (TEI and
everything that copied it) and `{"results":[{"index":0,"relevance_score":0.99}]}`
(Cohere-compatible). Both are also *sorted locally* — nothing in either format
promises an order, and depending on one that does not sort inverts recall.

`BUILDER_RERANK_MIN_SCORE` has **no floor by default, and that is deliberate**.
The output scale is server-dependent and the two in front of us do not share a
sign convention: TEI applies a sigmoid and answers `0.997 / 0.0000163`, while
llama.cpp returns raw logits, `6.71 / -10.78`. A default of `0` reads as "no
floor" against the first and deletes every result against the second. Measure
your own model against a query it should *not* answer before setting one.

A reranker that is down costs the fused order, not the results — recall logs a
warning and returns what SQL gave it.

### The measured difference

Three auth-adjacent memories, query `"authentication fails"`:

```
--- fused (vector + full text, no rerank) ---
  1. score=0.0164  "the login button is broken"
  2. score=0.0161  "the signup form rejects valid email addresses"
  3. score=0.0159  "the session token is refreshed every fifteen minutes"
--- reranked ---
  1. score=-3.4180  "the login button is broken"
  2. score=-4.3871  "the signup form rejects valid email addresses"
  3. score=-8.1895  "the session token is refreshed every fifteen minutes"

fused separation:    0.000264
reranked separation: 0.969114
```

The fused order was already right — but it separates the answer from the
distractor by 0.0003, which is an artefact of rank position, not a judgement.
The reranker's gap is ~3600× wider. **That is where the quality lands**: not in
finding the row, in being able to tell that it is the one.

## Distance cutoffs are embedder-dependent

`MaxDistance` is a cosine cutoff below which a vector hit counts. It is a
property of the *model*, not of this code, and the two differ enormously:

| | hash-bow | bge-m3 |
|---|---|---|
| identical text | 0.000 | 0.000 |
| related paraphrase | 0.705 | 0.223 |
| unrelated | 1.000 | 0.547 |
| cutoff used | `MaxDistance` = 0.85 | `SemanticMaxDistance` = 0.50 |

A transformer embeds nothing orthogonally to anything else, so unrelated text
lands near 0.55 rather than 1.0. Applying the inherited 0.85 to bge-m3 admits
every row in the table: the floor stops being a floor, no query comes back
empty, and **no gap is ever recorded**. Override with
`BUILDER_RECALL_MAX_DISTANCE` after measuring your own corpus — long chunks
score differently from short sentences.

## Existing memories, and what happens to them

Migration `0018_brain_embedding_model.sql` adds `builder_memories.embedding_model`
and labels every existing vector `hash-bow`.

**Nothing is dropped.** Not a column, not an index, not a row. The vector width
does not change either — migration 0002 already declared `vector(1024)` and
bge-m3 is 1024, so the schema built for the hash embedder fits the real one
exactly.

Recall's vector arm then filters on the model in use, because a hash vector and
a bge-m3 vector share this column and its distance operator while living in
unrelated spaces — a meaningless 0.4 outranks a real match at 0.5. Rows from an
older embedder:

- **keep** their content, their vector and their full-text index,
- **stay findable by keyword** exactly as before,
- are **excluded from the vector arm** until they are re-embedded.

Re-embedding happens automatically. At boot, with a real embedder active,
builder counts what is stale and rewrites it in the background:

```
INFO builder.brain re-embedding memories written by a previous embedder
     pending=1002 note="they stay findable by keyword until this completes"
INFO builder.brain re-embedding complete written=1002 failed=0 took=48s
```

| Variable | Meaning | Default |
|---|---|---|
| `BUILDER_EMBED_BACKFILL` | `off` to skip re-embedding at boot | on |
| `BUILDER_EMBED_BACKFILL_RATE` | Pause between 64-row batches | `250ms` |

It is interruptible and resumable: the work queue is a predicate over the table,
not a cursor, so a run that stops halfway leaves 500 rows better off and finds
the rest next boot. `GET /api/builder/brain` reports `pendingReembed`.

## Namespaces

A brain is addressed by namespace, shaped `<fleet>:<slug>`.

The **project** brain is `<fleet>:project` — for the default fleet, that is
`default:project`. Not `project:<name>`. Every agent brain already reads
`<fleet>:<slug>`, so the project brain is that shape with `project` in the slug
position.

`builder_brains.agent_slug` is nullable with
`CHECK (agent_slug IS NOT NULL OR namespace LIKE '%:project')`.

**Status caveat.** That schema change lives on an unmerged branch. See
[`brain-provenance.md`](brain-provenance.md) for the full state, including that
`internal/fleet/agents_api.go:handleBrain` resolves a brain with
`WHERE b.agent_slug = $1`, which structurally cannot serve a project brain whose
`agent_slug` is NULL. Do not assume the project brain is reachable over the
agent-brain handler.

## Provenance

Two rules, answered by the operator and recorded so they are not re-asked:

1. **Deleting a source must not delete what was learned from it.** The
   provenance link goes; the knowledge stays. A memory whose source is gone
   reads as "we no longer know where this came from", which is true.
2. **Staleness is a missed cadence, not silence.** A source declares
   `expected_every`; it is stale when
   `now() - last_success_at > expected_every * 2`. One missed cycle is noise,
   two is a pattern, and an indicator that cries wolf gets ignored. A NULL
   `expected_every` means the source is **never** stale — the honest answer for
   a webhook nobody promised a cadence for.

There is an unresolved schema question about which table carries the
source→memory edge. It is written up in
[`brain-provenance.md`](brain-provenance.md) and is not an agent's call to make.

## Files

| File | What |
|---|---|
| `brain.go` | `Store`, the `Embedder` interface, recall, the rerank pass |
| `embedder.go` | `HashEmbedder` |
| `embed_http.go` | The OpenAI-compatible HTTP embedder, `EmbedderFromEnv`, `Probe`, `IsSemantic` |
| `rerank.go` | The cross-encoder client and `RerankerFromEnv` |
| `reembed.go` | The background backfill that re-embeds a previous embedder's rows |
| `chunk.go` | Chunking |
| `document.go` | `Document`, `IngestDocument` |
| `ingest.go` | Ingest pipeline |
| `graph.go` | The entity graph |
| `project.go` | Project-namespace resolution |
| `pdf.go` | PDF text extraction |
| `redact.go` | `Redact` — runs before text is retained, so a key checked into someone's README does not become a memory an agent can quote back |

## HTTP

| Method | Path |
|---|---|
| GET | `/api/builder/brain` |
| GET | `/api/builder/brain/entities/{id}` |
| GET | `/api/builder/fleet/agents/{slug}/brain` |
| GET | `/api/builder/fleet/agents/{slug}/brain/entities/{id}` |

Verified from the `Routes` functions in `internal/brain/service.go` and
`internal/fleet/agents_api.go`, plus the mount points in `providers.go:258` and
`:228`.

The document library that writes into the brain is `internal/docs/`, mounted at
`/api/builder/docs`. It is **not** the `docs/` folder you are reading.
</content>
</invoke>
