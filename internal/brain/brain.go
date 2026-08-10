// Package brain gives each agent its own memory.
//
// Every agent gets a private namespace plus a read-only grant on the shared
// project brain. That split is the whole design: an agent can learn what the
// team knows without being able to rewrite it, so one agent's wrong conclusion
// never becomes every agent's premise.
//
// The default driver is pgvector in the app's own Postgres rather than a hosted
// service. A day-0 harness cannot have a hard dependency on an endpoint that
// might be down — and during research the hosted cabrain instance answered 502
// on two endpoints, ran on a single workstation with no HA, and resolved
// tokenless callers as admin.
package brain

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

// MaxDistance is the cosine-distance cutoff for a vector hit.
//
// Without it, vector search returns the top-k no matter how bad the match is,
// so a query about something the brain has never heard of still "succeeds" —
// the agent gets confidently irrelevant memories and no gap is ever recorded.
//
// Measured with the default hash embedder on real rows: an identical document
// scores 0.000, a related one 0.705, and an unrelated one 1.000 (orthogonal —
// no shared tokens). 0.85 separates those cleanly.
//
// This value is EMBEDDER-DEPENDENT. A semantic model produces a completely
// different distance distribution, so re-measure when swapping one in.
const MaxDistance = 0.85

// SemanticMaxDistance is the same cutoff for a real embedding model.
//
// Re-measured, as the note above demands, against bge-m3 on the sentences the
// package documentation uses as its example:
//
//	identical text                                        0.000
//	"authentication fails" ~ "the login button is broken"  0.223
//	"authentication fails" ~ "تعذر تسجيل الدخول"           0.189   (cross-lingual)
//	"authentication fails" ~ "the deploy pipeline runs…"   0.540
//	"authentication fails" ~ "bananas are yellow"          0.547
//
// A real model's distances are COMPRESSED compared to the hash embedder's,
// which scores unrelated text at 1.000 because it shares no tokens. Nothing a
// transformer embeds is orthogonal to anything else, so unrelated text lands
// near 0.55 — and the inherited 0.85 cutoff, applied to bge-m3, admits every
// row in the table. The floor stops being a floor, no query ever comes back
// empty, and no gap is ever recorded.
//
// 0.50 sits below the unrelated band and well above the related one. It is a
// coarse pre-filter, not the ranking: the cross-encoder is what decides the
// order of what survives it, so this only has to exclude the obviously wrong.
// Override with BUILDER_RECALL_MAX_DISTANCE after measuring your own corpus —
// long chunks score differently from the short sentences above.
const SemanticMaxDistance = 0.50

// Dim is the embedding width. It must match the vector column in migration
// 0002 — a mismatch fails at insert time with a confusing cast error, so it is
// validated at boot instead.
const Dim = 1024

// Embedder turns text into a vector. The seam exists so a project can swap in a
// real model without the store knowing anything about it.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	Dimensions() int
	Name() string
}

type Memory struct {
	ID         string  `json:"id"`
	Namespace  string  `json:"namespace"`
	Content    string  `json:"content"`
	SourceKind string  `json:"sourceKind"`
	SourceRef  string  `json:"sourceRef"`
	Importance float64 `json:"importance"`
	Score      float64 `json:"score,omitempty"`
	CreatedAt  string  `json:"createdAt"`
}

type Store struct {
	db  *sql.DB
	log *slog.Logger
	emb Embedder
	rr  Reranker
}

func New(db *sql.DB, log *slog.Logger, emb Embedder) (*Store, error) {
	if emb != nil && emb.Dimensions() != Dim {
		// Fail at boot, not at the first retain. cabrain ships a Dim() check
		// with zero call sites, which is the same as not having one.
		return nil, fmt.Errorf("embedder %s produces %d dimensions, the schema expects %d",
			emb.Name(), emb.Dimensions(), Dim)
	}
	return &Store{db: db, log: log, emb: emb}, nil
}

// SetReranker installs the second-pass ranker. Optional and separate from New
// so a store without one behaves exactly as it did — the reranker improves the
// order of results the fused query already found, it is not load-bearing.
func (s *Store) SetReranker(rr Reranker) { s.rr = rr }

// Embedder is what this store embeds with, for a surface that reports it.
func (s *Store) Embedder() Embedder { return s.emb }

// Semantic reports whether recall over this store means anything, which is the
// embedder question plus the liveness of the endpoint behind it.
func (s *Store) Semantic() bool { return IsSemantic(s.emb) }

// EmbedderName is the embedder's name, or "none" — a store can be constructed
// without one and s.emb.Name() on a nil interface panics.
func (s *Store) EmbedderName() string {
	if s.emb == nil {
		return "none"
	}
	return s.emb.Name()
}

// RerankerName is the reranker's name, or "" when recall returns the fused
// order unchanged.
func (s *Store) RerankerName() string {
	if s.rr == nil {
		return ""
	}
	return s.rr.Name()
}

// Retain writes a memory.
//
// source_ref is identity: retaining the same source twice updates in place
// rather than growing a duplicate. Without it an agent that re-reads a file on
// every run accumulates one copy per run and its recall degrades into noise.
func (s *Store) Retain(ctx context.Context, ns, content, sourceKind, sourceRef string, importance float64) (string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", errors.New("nothing to retain")
	}
	if importance <= 0 {
		importance = 0.5
	}

	// vec and model travel together and are written together. A vector with no
	// model recorded is unusable by recall's model filter, and a model recorded
	// with no vector claims an embedding that is not there — so neither is ever
	// set without the other.
	var vec, model any
	if s.emb != nil {
		vs, err := s.emb.Embed(ctx, []string{content})
		if err != nil {
			// Degrade rather than fail: a memory without an embedding is still
			// findable by keyword, and losing the write entirely is worse. The
			// backfill in reembed.go picks these up once the endpoint is back,
			// so a source that failed to embed during an outage is not a
			// permanently keyword-only memory.
			s.log.Warn("embed failed; retaining without a vector",
				"err", err, "embedder", s.emb.Name(), "ref", sourceRef)
		} else if len(vs) == 1 {
			vec, model = vecLiteral(vs[0]), s.emb.Name()
		}
	}

	// A transaction so the memory and its graph land together. A memory with no
	// entities is invisible to expansion; an entity with no memory is a dangling
	// node. Either half alone is worse than neither.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("retain: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var id string
	err = tx.QueryRowContext(ctx,
		`INSERT INTO builder_memories (namespace, content, source_kind, source_ref, importance, embedding, embedding_model)
		 VALUES ($1,$2,$3,$4,$5,$6::vector,$7::text)
		 ON CONFLICT (namespace, source_ref) WHERE source_ref <> ''
		 DO UPDATE SET content = EXCLUDED.content, importance = EXCLUDED.importance,
		               embedding = EXCLUDED.embedding,
		               embedding_model = EXCLUDED.embedding_model, valid_at = now()
		 RETURNING id`,
		ns, content, sourceKind, sourceRef, importance, vec, model).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("retain: %w", err)
	}

	// The graph. A failure here fails the whole retain rather than silently
	// storing a memory that no expansion can ever reach.
	if err := s.linkEntities(ctx, tx, ns, id, content); err != nil {
		return "", fmt.Errorf("retain: link entities: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("retain: %w", err)
	}

	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_brains
		    SET memory_count = (SELECT count(*) FROM builder_memories m WHERE m.namespace = $1),
		        last_retain_at = now()
		  WHERE namespace = $1`, ns)
	return id, nil
}

// Recall searches the agent's own namespace plus anything it has been granted —
// which now includes the shared project brain, so a run sees what the team knows
// alongside what it worked out itself.
//
// Hybrid: vector similarity when an embedder is configured, full-text always,
// fused with reciprocal rank. Keyword-only recall misses paraphrase; vector-only
// recall misses exact identifiers like a function name — and agents search for
// identifiers constantly.
//
// Then RERANKED, when a cross-encoder is configured. The fused query is a
// recall-oriented first pass: it is asked for a wide candidate set and judged on
// whether the right row is anywhere in it, not on where. The cross-encoder reads
// each candidate against the query and decides the order that is actually
// returned. See rerank.go for why the two passes cannot be one.
func (s *Store) Recall(ctx context.Context, agentSlug, query string, limit int) ([]Memory, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	own, namespaces, err := s.readable(ctx, agentSlug)
	if err != nil {
		return nil, err
	}
	if len(namespaces) == 0 {
		return nil, nil
	}

	// How many rows to carry out of Postgres. Only worth widening when something
	// downstream can tell the extra rows apart — without a reranker the fused
	// order IS the answer, and fetching 50 to return 10 would just be work.
	cand := limit
	if s.rr != nil {
		cand = Candidates(limit)
	}
	// Each arm of the fusion stays deep regardless. RRF combines two RANKED
	// lists, and a list truncated to 10 gives a row that placed 11th in both a
	// score of zero rather than a middling one — shallow arms do not make the
	// fusion faster, they make it wrong.
	arm := cand
	if arm < DefaultCandidates {
		arm = DefaultCandidates
	}

	var vec any
	if s.emb != nil {
		if vs, err := s.emb.Embed(ctx, []string{query}); err == nil && len(vs) == 1 {
			vec = vecLiteral(vs[0])
		} else if err != nil {
			// Not fatal: the full-text arm still runs, so recall degrades to
			// keyword rather than returning nothing. Logged because a silent
			// degradation here looks identical to a brain that knows nothing.
			s.log.Warn("embedding the query failed; recall is keyword-only for this call", "err", err)
		}
	}

	// RRF with k=60. Two ranked lists, each contributing 1/(60+rank), so a row
	// that both methods rank moderately beats one that a single method loves.
	const rrf = `
WITH vec AS (
  SELECT id, row_number() OVER (ORDER BY embedding <=> $2::vector) AS r
    FROM builder_memories
   WHERE namespace = ANY($1::text[]) AND invalid_at IS NULL
     -- $2 is cast to text here and to vector below: an uncast parameter that is
     -- also used as ::vector leaves Postgres unable to infer a type (42P08).
     AND $2::text IS NOT NULL AND embedding IS NOT NULL
     -- The relevance floor. Without it every query matches everything.
     AND (embedding <=> $2::vector) < $5
     -- Only vectors from the embedder currently in use. A row embedded by a
     -- different model shares the column and the distance operator but not the
     -- space, so its distance to this query is a number with no meaning — and
     -- 0.4 of no meaning outranks 0.5 of a real match. Migration 0018 records
     -- which model wrote each vector precisely so this filter can exist; rows
     -- from an older embedder stay findable by full text until the backfill
     -- re-embeds them.
     AND embedding_model IS NOT DISTINCT FROM $7::text
   LIMIT $8
),
fts AS (
  SELECT id, row_number() OVER (
           ORDER BY ts_rank(tsv, plainto_tsquery('simple', $3)) DESC) AS r
    FROM builder_memories
   WHERE namespace = ANY($1::text[]) AND invalid_at IS NULL
     AND tsv @@ plainto_tsquery('simple', $3)
   LIMIT $8
),
fused AS (
  SELECT id, sum(w) AS score FROM (
    SELECT id, 1.0/(60+r) AS w FROM vec
    UNION ALL
    SELECT id, 1.0/(60+r) AS w FROM fts
  ) x GROUP BY id
)
SELECT m.id, m.namespace, m.content, m.source_kind, m.source_ref,
       m.importance, f.score, m.created_at
  FROM fused f JOIN builder_memories m ON m.id = f.id
 -- Agent-scoped results first, then everything granted (the project brain, and
 -- any other namespace this agent may read), each group by relevance.
 --
 -- The two scopes are not comparable on score alone: RRF ranks within a result
 -- set, so a project memory's score says how it fared against other project
 -- memories, not whether it beats something the agent concluded itself. Ordering
 -- by scope first says what the fleet actually believes — an agent's own finding
 -- outranks shared background on the same question.
 --
 -- The cost is real and deliberate: an agent with a full page of strong hits of
 -- its own sees no project memory on that query. Raise the limit to widen it.
 -- Postgres sorts false before true, so the own-namespace group leads.
 ORDER BY (m.namespace <> $6), f.score DESC, m.importance DESC
 LIMIT $4`

	rows, err := s.db.QueryContext(ctx, rrf,
		pgArray(namespaces), vec, query, cand, maxDistance(s.emb), own, embeddingModel(s.emb), arm)
	if err != nil {
		return nil, fmt.Errorf("recall: %w", err)
	}
	defer rows.Close()

	out := []Memory{}
	for rows.Next() {
		var m Memory
		if err := rows.Scan(&m.ID, &m.Namespace, &m.Content, &m.SourceKind,
			&m.SourceRef, &m.Importance, &m.Score, &m.CreatedAt); err != nil {
			continue
		}
		out = append(out, m)
	}

	out = s.rerank(ctx, query, own, out, limit)

	if len(out) == 0 {
		// A miss is information. Recording it builds a backlog of what the team
		// keeps asking and cannot answer, which is where the next retain should go.
		//
		// Always against the agent's OWN namespace. `namespaces` comes from a
		// UNION with no ORDER BY, so namespaces[0] is whichever row Postgres
		// happened to return first — often the shared project brain, which is
		// exactly where this gap does NOT belong.
		if own, err := s.Writable(ctx, agentSlug); err == nil {
			s.recordGap(ctx, own, query)
		}
	} else {
		ids := make([]string, 0, len(out))
		for _, m := range out {
			ids = append(ids, m.ID)
		}
		_, _ = s.db.ExecContext(ctx,
			`UPDATE builder_memories SET access_count = access_count + 1
			  WHERE id = ANY($1::uuid[])`, pgArray(ids))
		_, _ = s.db.ExecContext(ctx,
			`UPDATE builder_brains SET last_recall_at = now() WHERE agent_slug = $1`, agentSlug)
	}
	return out, nil
}

// rerank reorders the candidate set with the cross-encoder and trims it to what
// the caller asked for. Returns the input unchanged, trimmed, when there is no
// reranker or the reranker fails — the fused order is a worse answer, not a
// broken one, and a recall that errors because a ranking service is down is the
// wrong trade for a component whose entire job is improving an order.
func (s *Store) rerank(ctx context.Context, query, own string, in []Memory, limit int) []Memory {
	if s.rr == nil || len(in) < 2 {
		return trim(in, limit)
	}
	texts := make([]string, len(in))
	for i, m := range in {
		texts[i] = m.Content
	}
	hits, err := s.rr.Rerank(ctx, query, texts)
	if err != nil {
		s.log.Warn("rerank failed; returning the fused order", "err", err, "reranker", s.rr.Name())
		return trim(in, limit)
	}
	if len(hits) != len(in) {
		// A partial ranking cannot be merged with the fused order — the two
		// score scales are unrelated, so the unscored rows would sort by an
		// accident of which number happened to be smaller.
		s.log.Warn("rerank returned a partial ranking; returning the fused order",
			"scored", len(hits), "candidates", len(in))
		return trim(in, limit)
	}

	floor := rerankFloor()
	out := make([]Memory, 0, len(hits))
	for _, h := range hits {
		if h.Score < floor {
			// Below the floor is not "the worst of the good ones", it is a row
			// the cross-encoder read against this query and rejected. Dropping
			// it is what lets a question the brain cannot answer come back empty
			// and be recorded as a gap, instead of returning ten confident
			// irrelevancies.
			continue
		}
		m := in[h.Index]
		// The rerank score replaces the fusion score. They are not comparable —
		// RRF's is 1/(60+rank) summed, an artefact of position that says nothing
		// about the query — and a screen showing 0.016 next to a memory is worse
		// than useless. This one is the model's judgement of this pair.
		m.Score = h.Score
		out = append(out, m)
	}

	// Scope first, exactly as the SQL did. The cross-encoder ranks relevance to
	// the query; it has no idea that an agent's own conclusion outranks shared
	// background on the same question, and that ordering was a deliberate call
	// made where the query is built. Stable, so rerank order survives inside
	// each group.
	sort.SliceStable(out, func(i, j int) bool {
		// Postgres sorted false before true on the same expression; this is that
		// comparison, not a relevance one.
		granted, otherGranted := out[i].Namespace != own, out[j].Namespace != own
		return !granted && otherGranted
	})
	return trim(out, limit)
}

func trim(in []Memory, limit int) []Memory {
	if limit > 0 && len(in) > limit {
		return in[:limit]
	}
	return in
}

// maxDistance is the cosine-distance cutoff for the embedder in use.
//
// It takes the embedder because the cutoff is a property of the model, not of
// this code: the same 0.85 that cleanly separates hash-bow's hits from its
// misses admits the entire table when bge-m3 produced the vectors. See
// MaxDistance and SemanticMaxDistance for both measurements.
func maxDistance(e Embedder) float64 {
	if v := strings.TrimSpace(os.Getenv("BUILDER_RECALL_MAX_DISTANCE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
		}
	}
	if IsSemantic(e) {
		return SemanticMaxDistance
	}
	return MaxDistance
}

// rerankFloor is the minimum cross-encoder score a memory needs to be returned.
//
// NO FLOOR by default — negative infinity, not zero. A cross-encoder's output
// scale is entirely server-dependent and the two in front of us do not even
// share a sign convention: TEI applies a sigmoid and answers 0.997 / 0.0000163,
// while llama.cpp returns the raw logits, 6.71 / -10.78. A default of 0 reads
// as "no floor" against the first and deletes every result against the second,
// which is precisely what it did the first time this was written — recall
// returned nothing and looked like an empty brain.
//
// So: off unless an operator has looked at the scores their own model gives a
// query it should not answer. A floor guessed rather than measured silently
// deletes correct answers, which is a far more expensive failure than returning
// a weak one.
func rerankFloor() float64 {
	if v := strings.TrimSpace(os.Getenv("BUILDER_RERANK_MIN_SCORE")); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return math.Inf(-1)
}

// embeddingModel is the identity written into builder_memories.embedding_model
// and matched against on recall. The embedder's own name, so the two can never
// disagree about what produced a vector.
func embeddingModel(e Embedder) any {
	if e == nil {
		return nil
	}
	return e.Name()
}

// readable is the agent's own namespace plus every read grant. It returns the
// own namespace separately as well as inside the list.
//
// Callers need to know WHICH of these is the agent's own, and the list cannot
// tell them: it comes from a UNION with no ORDER BY, so its order is whatever
// Postgres happened to produce. Recall ranks by scope and recordGap picks a
// namespace to write to — both were one arbitrary row order away from treating
// the shared project brain as the agent's own.
//
// The own namespace is resolved WITHOUT can_write, unlike Writable: an agent
// whose brain is read-only still reads its own memories, it just cannot add to
// them.
func (s *Store) readable(ctx context.Context, agentSlug string) (string, []string, error) {
	var own string
	if err := s.db.QueryRowContext(ctx,
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1`,
		agentSlug).Scan(&own); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", nil, fmt.Errorf("resolve own namespace: %w", err)
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1
		 UNION
		 SELECT namespace FROM builder_brain_grants WHERE agent_slug = $1 AND can_read`,
		agentSlug)
	if err != nil {
		return "", nil, fmt.Errorf("resolve namespaces: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var ns string
		if rows.Scan(&ns) == nil && ns != "" {
			out = append(out, ns)
		}
	}
	return own, out, nil
}

// ReadableNamespaces is what an agent may recall from: its own brain first, then
// every namespace it has been granted. Exposed so a screen can show an agent
// which brains it reads without duplicating the grant logic.
func (s *Store) ReadableNamespaces(ctx context.Context, agentSlug string) (string, []string, error) {
	return s.readable(ctx, agentSlug)
}

// Writable is the agent's own namespace only. A read grant never implies write:
// the shared project brain is readable by everyone and writable by no agent.
func (s *Store) Writable(ctx context.Context, agentSlug string) (string, error) {
	var ns string
	err := s.db.QueryRowContext(ctx,
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1 AND can_write`,
		agentSlug).Scan(&ns)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("agent %s has no writable brain", agentSlug)
	}
	return ns, err
}

func (s *Store) recordGap(ctx context.Context, ns, query string) {
	norm := strings.Join(strings.Fields(strings.ToLower(query)), " ")
	if norm == "" {
		return
	}
	_, _ = s.db.ExecContext(ctx,
		`INSERT INTO builder_memory_gaps (namespace, norm_query, query)
		 VALUES ($1,$2,$3)
		 ON CONFLICT (namespace, norm_query)
		 DO UPDATE SET hits = builder_memory_gaps.hits + 1, last_seen = now()`,
		ns, norm, query)
	_, _ = s.db.ExecContext(ctx,
		`UPDATE builder_brains
		    SET open_gaps = (SELECT count(*) FROM builder_memory_gaps g
		                      WHERE g.namespace = $1 AND g.status = 'open')
		  WHERE namespace = $1`, ns)
}

// Forget marks a memory invalid rather than deleting it, so a wrong conclusion
// leaves a trace of having been believed.
func (s *Store) Forget(ctx context.Context, id, agentSlug string) error {
	ns, err := s.Writable(ctx, agentSlug)
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE builder_memories SET invalid_at = now()
		  WHERE id = $1 AND namespace = $2 AND invalid_at IS NULL`, id, ns)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("no such memory in a namespace you can write")
	}
	return nil
}

func vecLiteral(v []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%g", f)
	}
	b.WriteByte(']')
	return b.String()
}

func pgArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	esc := make([]string, 0, len(xs))
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	for _, x := range xs {
		esc = append(esc, `"`+r.Replace(x)+`"`)
	}
	return "{" + strings.Join(esc, ",") + "}"
}
