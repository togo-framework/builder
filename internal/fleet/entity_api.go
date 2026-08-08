package fleet

import (
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// Shape only — Postgres decides whether the id exists. This exists so that a
// wrong id is a 404 rather than a cast error surfacing as a 500.
var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// entityDetail is one node of the graph, opened.
//
// The graph could be looked at but not interrogated: a dot labelled "claim.go"
// mentioned nine times gave no way to see WHICH nine things the agent remembers
// about it. Clicking a node asks that question; this answers it.
type entityDetail struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	Mentions int    `json:"mentions"`
	LastSeen string `json:"lastSeen"`
	// The memories this entity was extracted from, newest first.
	Memories []brainMemory `json:"memories"`
	// Entities that co-occur with it, heaviest link first — the 1-hop
	// neighbourhood, which is what "related" means in this graph.
	Neighbours []neighbour `json:"neighbours"`
}

type neighbour struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Weight int    `json:"weight"`
}

// handleEntity returns one entity of one agent's brain.
//
// Scoped through the agent's namespace rather than looked up by bare id: an
// entity belonging to a different agent's brain must not become readable by
// guessing an id.
func (s *AgentsService) handleEntity(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	id := chi.URLParam(r, "id")

	// Checked here rather than left to Postgres. The column is uuid, so a
	// malformed id fails the cast and surfaces as a 500 — a broken link would
	// report itself as a server fault instead of a missing entity.
	if !uuidRe.MatchString(id) {
		httpErr(w, http.StatusNotFound, "no such entity in this agent's brain")
		return
	}

	var ns string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT namespace FROM builder_brains WHERE agent_slug = $1`, slug).Scan(&ns); err != nil {
		httpErr(w, http.StatusNotFound, "this agent has no brain")
		return
	}

	limit := 25
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	d := entityDetail{
		// Allocated rather than nil: Go marshals a nil slice as null and the
		// panel reads .length on both.
		Memories:   make([]brainMemory, 0, 8),
		Neighbours: make([]neighbour, 0, 8),
	}
	err := s.db.QueryRowContext(r.Context(),
		`SELECT id, name, kind, mention_count, btrim(to_json(last_seen)::text, '"')
		   FROM builder_entities
		  WHERE namespace = $1 AND id = $2`,
		ns, id).Scan(&d.ID, &d.Name, &d.Kind, &d.Mentions, &d.LastSeen)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such entity in this agent's brain")
		return
	}
	if err != nil {
		s.log.Error("read entity", "agent", slug, "entity", id, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the entity")
		return
	}

	if rows, err := s.db.QueryContext(r.Context(),
		`SELECT m.id, m.content, m.source_kind, m.source_ref, m.importance,
		        btrim(to_json(m.created_at)::text, '"')
		   FROM builder_memory_entities me
		   JOIN builder_memories m ON m.id = me.memory_id
		  WHERE me.entity_id = $1
		    AND m.namespace = $2
		    -- A superseded memory is history, not what the agent believes now.
		    AND m.invalid_at IS NULL
		  ORDER BY m.created_at DESC
		  LIMIT $3`, id, ns, limit); err == nil {
		defer rows.Close()
		for rows.Next() {
			var m brainMemory
			if rows.Scan(&m.ID, &m.Content, &m.SourceKind, &m.SourceRef,
				&m.Importance, &m.CreatedAt) == nil {
				d.Memories = append(d.Memories, m)
			}
		}
	}

	// Undirected in effect: the edge table stores one direction per pair, so
	// both ends are matched and the other id is selected.
	if rows, err := s.db.QueryContext(r.Context(),
		`SELECT e2.id, e2.name, e2.kind, x.weight
		   FROM (
		     SELECT to_id   AS other, weight FROM builder_entity_edges
		      WHERE namespace = $1 AND from_id = $2
		     UNION ALL
		     SELECT from_id AS other, weight FROM builder_entity_edges
		      WHERE namespace = $1 AND to_id = $2
		   ) x
		   JOIN builder_entities e2 ON e2.id = x.other
		  ORDER BY x.weight DESC
		  LIMIT 20`, ns, id); err == nil {
		defer rows.Close()
		for rows.Next() {
			var n neighbour
			if rows.Scan(&n.ID, &n.Name, &n.Kind, &n.Weight) == nil {
				d.Neighbours = append(d.Neighbours, n)
			}
		}
	}

	writeJSON(w, http.StatusOK, d)
}
