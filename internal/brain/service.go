package brain

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// The project brain's own surface.
//
// Every agent brain already had a page. The project brain — the one every
// agent reads and every source writes into — had none, so the thing the whole
// ingestion effort feeds was the one brain nobody could look at.
//
// What this adds over the per-agent view is PROVENANCE. An agent's memory came
// from that agent; a project memory came from a repository, a feed, a crawl or
// an uploaded document, and "where did this claim come from?" is the first
// question anyone asks of a shared knowledge base they did not write.

// Provenance is where one memory came from, in a form a screen can render.
type Provenance struct {
	// Kind is the connector or origin: github, rss, crawl, slack, sql,
	// document, issue, agent.
	Kind string `json:"kind"`
	// Source names the specific thing — the repository, the feed URL, the
	// document's filename.
	Source string `json:"source"`
	// Ref is the item within that source: a path, an entry id, a chunk.
	Ref string `json:"ref"`
	// Label is the one-line rendering, so every surface says it the same way.
	Label string `json:"label"`
}

// provenanceOf reads a memory's origin out of the fields it already carries.
//
// No new table, and none needed: sources write `source:<kind>:<name>:<ref>` and
// documents write `doc:<name>#<index>`, which between them name the connector,
// the specific source and the item. The decision to parse rather than join was
// made deliberately — a join would need a foreign key onto a source row that
// may since have been deleted, and a memory outliving its pipe is the normal
// case, not an error.
// ProvenanceFor is exported for the chat surface, which cites the same origins
// on screen that this package renders in the brain view. One implementation, so
// a memory is described identically wherever it appears.
func ProvenanceFor(kind, ref string) Provenance { return provenanceOf(kind, ref) }

func provenanceOf(kind, ref string) Provenance {
	p := Provenance{Kind: kind, Ref: ref}

	switch {
	case strings.HasPrefix(ref, "source:"):
		// source:<kind>:<name>:<ref>, and <name> may itself contain colons
		// (a feed URL does), so the split is bounded at the front and the
		// remainder is put back together.
		rest := strings.TrimPrefix(ref, "source:")
		parts := strings.SplitN(rest, ":", 2)
		p.Kind = parts[0]
		if len(parts) == 2 {
			// The item ref is everything after the LAST colon only when that
			// looks like a path or an id; a feed URL ends in no colon at all.
			if i := strings.LastIndex(parts[1], ":"); i > 0 {
				p.Source, p.Ref = parts[1][:i], parts[1][i+1:]
			} else {
				p.Source = parts[1]
			}
		}
		p.Label = p.Kind + " · " + p.Source
		if p.Ref != "" {
			p.Label += " · " + p.Ref
		}

	case strings.HasPrefix(ref, "doc:"):
		name := strings.TrimPrefix(ref, "doc:")
		if i := strings.LastIndex(name, "#"); i > 0 {
			name = name[:i]
		}
		p.Kind, p.Source, p.Label = "document", name, "document · "+name

	case kind == "issue" || strings.HasPrefix(ref, "#"):
		p.Kind, p.Source, p.Label = "issue", ref, "issue "+ref

	default:
		p.Source = ref
		p.Label = kind
		if ref != "" {
			p.Label += " · " + ref
		}
		if p.Label == "" {
			p.Label = "written directly"
		}
	}
	return p
}

type memoryView struct {
	ID         string     `json:"id"`
	Content    string     `json:"content"`
	Importance float64    `json:"importance"`
	CreatedAt  time.Time  `json:"createdAt"`
	From       Provenance `json:"from"`
}

type projectView struct {
	Namespace string `json:"namespace"`
	Embedder  string `json:"embedder"`
	Semantic  bool   `json:"semantic"`
	// Reranker is empty when recall returns the fused order unchanged. Shown
	// separately from Embedder because the two fail independently: a live
	// embedder with a dead reranker is still semantic recall, just a worse
	// ordering of it, and collapsing them into one badge would report an
	// outage that has not happened.
	Reranker string `json:"reranker,omitempty"`
	// Pending is how many memories still hold a vector from an older embedder
	// and are therefore invisible to the vector arm of recall until the
	// backfill reaches them. Non-zero is a progress reading, not an error.
	Pending  int           `json:"pendingReembed"`
	Memories int           `json:"memories"`
	Entities int           `json:"entities"`
	Edges    int           `json:"edges"`
	Recent   []memoryView  `json:"recent"`
	Sources  []sourceCount `json:"sources"`
	Graph    struct {
		Nodes []GraphNode `json:"nodes"`
		Edges []GraphEdge `json:"edges"`
	} `json:"graph"`
}

// sourceCount drives the filter. Built from what is actually in the brain
// rather than from the sources table, so a source that was deleted still
// explains the memories it left behind.
type sourceCount struct {
	Kind     string `json:"kind"`
	Source   string `json:"source"`
	Label    string `json:"label"`
	Memories int    `json:"memories"`
}

// Routes mounts the project brain surface.
func (s *Store) Routes(r chi.Router) {
	r.Get("/", s.handleProject)
	r.Get("/entities/{id}", s.handleEntity)
}

func (s *Store) handleProject(w http.ResponseWriter, r *http.Request) {
	ns := s.ProjectNamespaceFor(r.Context())
	v := projectView{Namespace: ns, Embedder: s.EmbedderName(), Reranker: s.RerankerName()}
	// Said plainly rather than left to be inferred from the embedder's name.
	// Recall over a hashed bag of words is keyword overlap, and a page that
	// shows a graph without saying so invites the operator to trust it.
	//
	// This used to be `_, hashed := s.emb.(HashEmbedder); v.Semantic = !hashed`,
	// which was true in two cases it should not have been: a store built with no
	// embedder at all (a nil interface is not a HashEmbedder, so the page claimed
	// semantic recall over a table of NULL vectors), and a real embedder whose
	// endpoint had since stopped answering. IsSemantic covers all three.
	v.Semantic = s.Semantic()
	if n, err := s.PendingReembed(r.Context()); err == nil {
		v.Pending = n
	}

	_ = s.db.QueryRowContext(r.Context(),
		`SELECT count(*) FROM builder_memories WHERE namespace=$1 AND invalid_at IS NULL`, ns).
		Scan(&v.Memories)
	_ = s.db.QueryRowContext(r.Context(),
		`SELECT count(*) FROM builder_entities WHERE namespace=$1`, ns).Scan(&v.Entities)
	_ = s.db.QueryRowContext(r.Context(),
		`SELECT count(*) FROM builder_entity_edges WHERE namespace=$1`, ns).Scan(&v.Edges)

	v.Recent = s.recentMemories(r, ns, r.URL.Query().Get("source"))
	v.Sources = s.sourceBreakdown(r, ns)

	nodes, edges, err := s.Graph(r.Context(), ns, 60)
	if err != nil {
		s.log.Error("project graph", "err", err)
	}
	// Never nil: a JSON null here makes the graph component render nothing and
	// report no error, which looks exactly like an empty brain.
	v.Graph.Nodes = nodes
	v.Graph.Edges = edges
	if v.Graph.Nodes == nil {
		v.Graph.Nodes = []GraphNode{}
	}
	if v.Graph.Edges == nil {
		v.Graph.Edges = []GraphEdge{}
	}

	writeJSON(w, http.StatusOK, v)
}

// recentMemories reads the newest memories, optionally filtered to one source.
//
// The filter matches on the ref PREFIX rather than on a parsed source column,
// because the prefix is what actually identifies a source in the data
// (`source:crawl:go.dev/ref/mod:` covers every chunk of every page of it).
func (s *Store) recentMemories(r *http.Request, ns, source string) []memoryView {
	q := `SELECT id, content, importance, created_at, source_kind, source_ref
	        FROM builder_memories
	       WHERE namespace = $1 AND invalid_at IS NULL`
	args := []any{ns}
	if source != "" {
		q += ` AND source_ref LIKE $2`
		args = append(args, source+"%")
	}
	q += ` ORDER BY created_at DESC LIMIT 60`

	rows, err := s.db.QueryContext(r.Context(), q, args...)
	if err != nil {
		s.log.Error("recent project memories", "err", err)
		return []memoryView{}
	}
	defer rows.Close()

	out := []memoryView{}
	for rows.Next() {
		var m memoryView
		var kind, ref string
		if rows.Scan(&m.ID, &m.Content, &m.Importance, &m.CreatedAt, &kind, &ref) != nil {
			continue
		}
		m.From = provenanceOf(kind, ref)
		out = append(out, m)
	}
	return out
}

// sourceBreakdown counts memories per source.
//
// Grouped in Go rather than in SQL: the source key comes out of parsing the
// ref, and expressing that parse as a Postgres expression would put the same
// rule in two languages, to drift apart the first time a connector changes its
// ref format.
func (s *Store) sourceBreakdown(r *http.Request, ns string) []sourceCount {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT source_kind, source_ref FROM builder_memories
		  WHERE namespace = $1 AND invalid_at IS NULL`, ns)
	if err != nil {
		return []sourceCount{}
	}
	defer rows.Close()

	type key struct{ kind, source string }
	counts := map[key]int{}
	for rows.Next() {
		var kind, ref string
		if rows.Scan(&kind, &ref) != nil {
			continue
		}
		p := provenanceOf(kind, ref)
		counts[key{p.Kind, p.Source}]++
	}

	out := make([]sourceCount, 0, len(counts))
	for k, n := range counts {
		label := k.kind
		if k.source != "" {
			label += " · " + k.source
		}
		out = append(out, sourceCount{Kind: k.kind, Source: k.source, Label: label, Memories: n})
	}
	// Biggest first: the filter is a way to find where the bulk came from.
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j].Memories > out[i].Memories {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

type entityView struct {
	ID       string       `json:"id"`
	Name     string       `json:"name"`
	Kind     string       `json:"kind"`
	Mentions int          `json:"mentions"`
	LastSeen time.Time    `json:"lastSeen"`
	Memories []memoryView `json:"memories"`
}

// handleEntity is what makes a node worth clicking: the memories behind it,
// each carrying where it came from.
func (s *Store) handleEntity(w http.ResponseWriter, r *http.Request) {
	ns := s.ProjectNamespaceFor(r.Context())
	id := chi.URLParam(r, "id")

	var v entityView
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT id, name, kind, mention_count, last_seen
		   FROM builder_entities WHERE id = $1 AND namespace = $2`, id, ns).
		Scan(&v.ID, &v.Name, &v.Kind, &v.Mentions, &v.LastSeen); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErrJSON(w, http.StatusNotFound, "no such entity in the project brain")
			return
		}
		httpErrJSON(w, http.StatusInternalServerError, "could not read the entity")
		return
	}

	rows, err := s.db.QueryContext(r.Context(),
		`SELECT m.id, m.content, m.importance, m.created_at, m.source_kind, m.source_ref
		   FROM builder_memory_entities me
		   JOIN builder_memories m ON m.id = me.memory_id
		  WHERE me.entity_id = $1 AND m.invalid_at IS NULL
		  ORDER BY m.created_at DESC LIMIT 40`, id)
	if err != nil {
		httpErrJSON(w, http.StatusInternalServerError, "could not read the memories")
		return
	}
	defer rows.Close()

	v.Memories = []memoryView{}
	for rows.Next() {
		var m memoryView
		var kind, ref string
		if rows.Scan(&m.ID, &m.Content, &m.Importance, &m.CreatedAt, &kind, &ref) != nil {
			continue
		}
		m.From = provenanceOf(kind, ref)
		v.Memories = append(v.Memories, m)
	}
	writeJSON(w, http.StatusOK, v)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErrJSON(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
