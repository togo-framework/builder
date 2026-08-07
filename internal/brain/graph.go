package brain

import (
	"context"
	"database/sql"
	"regexp"
	"sort"
	"strings"
)

// The entity graph.
//
// Hybrid recall (vector + BM25) finds memories that resemble the query. It
// cannot find the one that is ABOUT the same thing in different words — the
// note about `dispatch.go` when the question is "why did the fleet go idle".
// cabrain closes that gap with a 1-hop entity expansion, and this is that.
//
// Extraction is deterministic: file paths, symbols, issue refs, agent slugs.
// A model call per retain would make the brain slow, expensive, and unusable
// offline — three good reasons nobody would leave it switched on.

var (
	// Paths: internal/orchestrator/dispatch.go, web/src/routes/issues.tsx
	reFile = regexp.MustCompile(`\b[\w.-]+(?:/[\w.-]+)+\.\w{1,5}\b`)
	// A bare filename with a code-ish extension, for "in dispatch.go" prose.
	reBareFile = regexp.MustCompile(`\b[\w-]+\.(?:go|ts|tsx|js|jsx|sql|sh|yaml|yml|json|md|css)\b`)
	// Backticked spans are almost always identifiers worth indexing.
	reTicked = regexp.MustCompile("`([^`\n]{2,80})`")
	// Issue references.
	reIssue = regexp.MustCompile(`#(\d{1,6})\b`)
	// Go/TS identifiers with internal capitals or underscores: reapExpiredLeases,
	// builder_runs, MarkdownRenderer. Plain lowercase words are excluded — BM25
	// already covers those and they would swamp the graph.
	reSymbol = regexp.MustCompile(`\b(?:[a-z]+(?:[A-Z][a-z0-9]+)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[a-z]+(?:_[a-z0-9]+)+)\b`)
)

// stopEntities are too common to carry meaning in this domain. An entity that
// appears in every memory connects everything to everything, which is the same
// as connecting nothing.
var stopEntities = map[string]bool{
	"the": true, "this": true, "that": true, "run": true, "runs": true,
	"issue": true, "issues": true, "agent": true, "agents": true,
	"file": true, "files": true, "code": true, "error": true,
	"true": true, "false": true, "null": true, "nil": true,
}

type entity struct {
	name string
	kind string
}

// extractEntities pulls the identifiers worth linking out of a memory.
//
// Order matters: the most specific pattern claims a span first, so
// `internal/db/x.go` is recorded as one file rather than also as the bare file
// `x.go`. Capped, because a memory that mentions forty things links to
// everything and ranks nothing.
func extractEntities(content string) []entity {
	seen := map[string]entity{}
	claimed := content

	add := func(raw, kind string) {
		n := strings.ToLower(strings.Trim(strings.TrimSpace(raw), ".,;:()[]{}\"'`"))
		if len(n) < 2 || len(n) > 200 || stopEntities[n] {
			return
		}
		// A pure number is never a useful entity on its own.
		if strings.Trim(n, "0123456789") == "" {
			return
		}
		if _, ok := seen[n]; !ok {
			seen[n] = entity{name: n, kind: kind}
		}
	}

	for _, m := range reFile.FindAllString(claimed, -1) {
		add(m, "file")
		claimed = strings.ReplaceAll(claimed, m, " ")
	}
	for _, m := range reBareFile.FindAllString(claimed, -1) {
		add(m, "file")
		claimed = strings.ReplaceAll(claimed, m, " ")
	}
	for _, m := range reTicked.FindAllStringSubmatch(claimed, -1) {
		inner := m[1]
		// A backticked path or filename is still a file.
		switch {
		case reFile.MatchString(inner) || reBareFile.MatchString(inner):
			add(inner, "file")
		default:
			add(inner, "symbol")
		}
	}
	for _, m := range reIssue.FindAllStringSubmatch(claimed, -1) {
		add("#"+m[1], "issue")
	}
	for _, m := range reSymbol.FindAllString(claimed, -1) {
		add(m, "symbol")
	}

	out := make([]entity, 0, len(seen))
	for _, e := range seen {
		out = append(out, e)
	}
	// Deterministic order so a re-extraction of the same content produces the
	// same graph, which makes the tests meaningful.
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	if len(out) > 24 {
		out = out[:24]
	}
	return out
}

// linkEntities records a memory's entities and the edges between them.
//
// Runs inside Retain's transaction so a memory and its graph land together — a
// memory with no entities is invisible to expansion, and an entity with no
// memory is a dangling node.
func (s *Store) linkEntities(ctx context.Context, tx *sql.Tx, ns, memoryID, content string) error {
	ents := extractEntities(content)
	if len(ents) == 0 {
		return nil
	}

	ids := make([]string, 0, len(ents))
	for _, e := range ents {
		var id string
		// ON CONFLICT keeps one row per (namespace, name) and counts the mention,
		// so mention_count doubles as "how central is this to the brain".
		if err := tx.QueryRowContext(ctx,
			`INSERT INTO builder_entities (namespace, name, kind, mention_count)
			 VALUES ($1,$2,$3,1)
			 ON CONFLICT (namespace, name) DO UPDATE
			   SET mention_count = builder_entities.mention_count + 1,
			       last_seen = now()
			 RETURNING id`, ns, e.name, e.kind).Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)

		if _, err := tx.ExecContext(ctx,
			`INSERT INTO builder_memory_entities (memory_id, entity_id)
			 VALUES ($1,$2) ON CONFLICT DO NOTHING`, memoryID, id); err != nil {
			return err
		}
	}

	// Co-occurrence edges, stored once per unordered pair to satisfy the
	// from_id < to_id constraint.
	for i := 0; i < len(ids); i++ {
		for j := i + 1; j < len(ids); j++ {
			a, b := ids[i], ids[j]
			if a > b {
				a, b = b, a
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO builder_entity_edges (namespace, from_id, to_id, weight)
				 VALUES ($1,$2,$3,1)
				 ON CONFLICT (from_id, to_id) DO UPDATE
				   SET weight = builder_entity_edges.weight + 1, last_seen = now()`,
				ns, a, b); err != nil {
				return err
			}
		}
	}
	return nil
}

// expandByEntities is the 1-hop walk.
//
// Given the memories hybrid search already found, pull in others that share
// their entities. This is what finds the note about `dispatch.go` when the
// query was "the fleet went idle" — no lexical overlap, no vector similarity,
// but one shared entity.
//
// Excludes what the caller already has, and orders by how many entities are
// shared so the strongest connection surfaces first.
func (s *Store) expandByEntities(
	ctx context.Context, namespaces []string, seedIDs []string, limit int,
) ([]Memory, error) {
	if len(seedIDs) == 0 || limit <= 0 {
		return nil, nil
	}
	rows, err := s.db.QueryContext(ctx,
		`WITH seed_entities AS (
		   SELECT DISTINCT me.entity_id
		     FROM builder_memory_entities me
		    WHERE me.memory_id = ANY($1::uuid[])
		 )
		 SELECT m.id, m.namespace, m.content, m.source_kind, m.source_ref,
		        m.importance, count(*) AS shared
		   FROM builder_memory_entities me
		   JOIN seed_entities se ON se.entity_id = me.entity_id
		   JOIN builder_memories m ON m.id = me.memory_id
		  WHERE m.namespace = ANY($2::text[])
		    AND m.invalid_at IS NULL
		    AND NOT (m.id = ANY($1::uuid[]))
		  GROUP BY m.id, m.namespace, m.content, m.source_kind, m.source_ref, m.importance
		  ORDER BY shared DESC, m.importance DESC
		  LIMIT $3`,
		pgArray(seedIDs), pgArray(namespaces), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Memory
	for rows.Next() {
		var m Memory
		var shared int
		if err := rows.Scan(&m.ID, &m.Namespace, &m.Content, &m.SourceKind,
			&m.SourceRef, &m.Importance, &shared); err != nil {
			continue
		}
		// Score carries how many entities were shared, so a caller can tell a
		// strong association from a single incidental overlap.
		m.Score = float64(shared)
		out = append(out, m)
	}
	return out, nil
}

// GraphNode and GraphEdge are the shape the UI draws.
type GraphNode struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Mentions int    `json:"mentions"`
}

type GraphEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Weight int    `json:"weight"`
}

// Graph returns the strongest part of a brain's entity graph.
//
// Capped hard: a graph with 400 nodes is not a picture, it is a hairball. The
// most-mentioned entities and the heaviest edges between them are what an
// operator can actually read.
func (s *Store) Graph(ctx context.Context, namespace string, maxNodes int) ([]GraphNode, []GraphEdge, error) {
	if maxNodes <= 0 || maxNodes > 120 {
		maxNodes = 60
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, kind, mention_count
		   FROM builder_entities
		  WHERE namespace = $1
		  ORDER BY mention_count DESC, last_seen DESC
		  LIMIT $2`, namespace, maxNodes)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var nodes []GraphNode
	ids := make([]string, 0, maxNodes)
	for rows.Next() {
		var n GraphNode
		if rows.Scan(&n.ID, &n.Name, &n.Kind, &n.Mentions) == nil {
			nodes = append(nodes, n)
			ids = append(ids, n.ID)
		}
	}
	rows.Close()
	if len(ids) == 0 {
		return nodes, nil, nil
	}

	// Only edges BETWEEN the nodes being drawn — an edge to a node that is not
	// on screen renders as a line into nowhere.
	erows, err := s.db.QueryContext(ctx,
		`SELECT from_id, to_id, weight
		   FROM builder_entity_edges
		  WHERE namespace = $1
		    AND from_id = ANY($2::uuid[]) AND to_id = ANY($2::uuid[])
		  ORDER BY weight DESC
		  LIMIT 400`, namespace, pgArray(ids))
	if err != nil {
		return nodes, nil, nil
	}
	defer erows.Close()
	var edges []GraphEdge
	for erows.Next() {
		var e GraphEdge
		if erows.Scan(&e.From, &e.To, &e.Weight) == nil {
			edges = append(edges, e)
		}
	}
	return nodes, edges, nil
}
