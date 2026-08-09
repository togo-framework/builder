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

	var vec any
	if s.emb != nil {
		vs, err := s.emb.Embed(ctx, []string{content})
		if err != nil {
			// Degrade rather than fail: a memory without an embedding is still
			// findable by keyword, and losing the write entirely is worse.
			s.log.Warn("embed failed; retaining without a vector", "err", err)
		} else if len(vs) == 1 {
			vec = vecLiteral(vs[0])
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
		`INSERT INTO builder_memories (namespace, content, source_kind, source_ref, importance, embedding)
		 VALUES ($1,$2,$3,$4,$5,$6::vector)
		 ON CONFLICT (namespace, source_ref) WHERE source_ref <> ''
		 DO UPDATE SET content = EXCLUDED.content, importance = EXCLUDED.importance,
		               embedding = EXCLUDED.embedding, valid_at = now()
		 RETURNING id`,
		ns, content, sourceKind, sourceRef, importance, vec).Scan(&id)
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

	var vec any
	if s.emb != nil {
		if vs, err := s.emb.Embed(ctx, []string{query}); err == nil && len(vs) == 1 {
			vec = vecLiteral(vs[0])
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
   LIMIT 50
),
fts AS (
  SELECT id, row_number() OVER (
           ORDER BY ts_rank(tsv, plainto_tsquery('simple', $3)) DESC) AS r
    FROM builder_memories
   WHERE namespace = ANY($1::text[]) AND invalid_at IS NULL
     AND tsv @@ plainto_tsquery('simple', $3)
   LIMIT 50
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

	rows, err := s.db.QueryContext(ctx, rrf, pgArray(namespaces), vec, query, limit, MaxDistance, own)
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
