package brain

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// ProjectSlot is what a project brain puts where an agent brain puts its slug.
//
// A project namespace is `<fleet>:project` — the same shape as `<fleet>:<slug>`,
// not a second convention. Three spellings were live before this constant
// existed: the issue said `project:<name>`, generate.go built `<fleet>:project`,
// and agents_api.go hardcoded the fleet as `default`. They disagreed about which
// string a grant pointed at, which is the whole reason the shared brain was
// unreachable. Everything that needs the name now comes through here.
//
// `project` is a legal agent slug, so the namespaces could in principle collide
// with an agent actually called "project". builder_brains.namespace is UNIQUE,
// so that collision is a loud insert failure rather than two brains quietly
// sharing memories.
const ProjectSlot = "project"

// ProjectNamespace is the project brain for a fleet.
func ProjectNamespace(fleet string) string {
	fleet = strings.TrimSpace(fleet)
	if fleet == "" {
		// The name the wizard uses. Returning "" here would build ":project",
		// which is a namespace nothing else in the system ever writes.
		fleet = "default"
	}
	return fleet + ":" + ProjectSlot
}

// IsProjectNamespace reports whether a namespace is a project brain rather than
// an agent's private one. It matches the CHECK constraint in migration 0010.
func IsProjectNamespace(ns string) bool {
	return strings.HasSuffix(ns, ":"+ProjectSlot)
}

// FleetName is the current fleet, or "default" when the wizard has not run.
//
// Ordered by created_at like the wizard's own lookup, so both agree on which
// fleet is "the" fleet when someone has generated twice.
func FleetName(ctx context.Context, db *sql.DB) string {
	var name string
	if err := db.QueryRowContext(ctx,
		`SELECT name FROM builder_fleets ORDER BY created_at LIMIT 1`).Scan(&name); err != nil {
		return "default"
	}
	if strings.TrimSpace(name) == "" {
		return "default"
	}
	return name
}

// ProjectNamespaceFor is the project brain this installation reads.
func (s *Store) ProjectNamespaceFor(ctx context.Context) string {
	return ProjectNamespace(FleetName(ctx, s.db))
}

// EnsureProjectBrain creates the project brain row if it is missing and returns
// its namespace. Idempotent, so both the wizard and the hire path can call it
// without either owning it.
//
// It is deliberately NOT an error for the row to be absent-and-uncreatable: on a
// database that has not run migration 0010 the INSERT fails the NOT NULL on
// agent_slug, and the caller still gets the namespace back. A fleet that cannot
// count its project memories yet is a smaller problem than a wizard run that
// refuses to finish.
func (s *Store) EnsureProjectBrain(ctx context.Context, fleet string) string {
	ns := ProjectNamespace(fleet)
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO builder_brains (agent_slug, namespace, driver, can_read, can_write, embedding_dim)
		 VALUES (NULL, $1, 'pgvector', true, true, $2)
		 ON CONFLICT (namespace) DO NOTHING`, ns, Dim); err != nil {
		s.log.Warn("could not ensure the project brain; run migration 0010",
			"namespace", ns, "err", err)
	}
	return ns
}

// GrantProjectRead gives an agent read-only access to the project brain.
//
// Read-only is not a default that a caller may override: it is the invariant the
// whole split exists for. An agent that could write the shared brain would make
// its own wrong conclusion every other agent's premise, which is exactly what
// separate namespaces were built to prevent.
func (s *Store) GrantProjectRead(ctx context.Context, ns, agentSlug string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO builder_brain_grants (namespace, agent_slug, can_read, can_write)
		 VALUES ($1,$2,true,false)
		 ON CONFLICT (namespace, agent_slug) DO NOTHING`, ns, agentSlug)
	return err
}

// RetainProject writes to the project brain. This is the INGESTION path, and it
// is the only way anything writes there.
//
// It takes no agent slug, and that is the point. `Retain` is reached by agents
// through Writable(), which resolves a namespace by agent_slug — a project brain
// has none, so no agent can route a write here however it is called. Ingestion
// (sources, webhooks, documents) has no agent to be, and calls this instead.
//
// sourceRef is required. An agent memory without one is merely a duplicate risk;
// a project memory without one is unattributable — nobody reading the shared
// brain can tell where a claim about the project came from, and nobody can
// re-ingest a corrected version over it.
func (s *Store) RetainProject(ctx context.Context, fleet, content, sourceKind, sourceRef string, importance float64) (string, error) {
	if strings.TrimSpace(sourceRef) == "" {
		return "", errors.New("a project memory needs a source_ref: it is what makes a shared claim attributable")
	}
	if strings.TrimSpace(sourceKind) == "" {
		sourceKind = "ingest"
	}
	ns := s.EnsureProjectBrain(ctx, fleet)

	var writable bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT can_write FROM builder_brains WHERE namespace = $1 AND agent_slug IS NULL`,
		ns).Scan(&writable); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", fmt.Errorf("no project brain %s: apply migration 0010", ns)
		}
		return "", fmt.Errorf("retain into %s: %w", ns, err)
	}
	if !writable {
		return "", fmt.Errorf("the project brain %s is read-only", ns)
	}
	return s.Retain(ctx, ns, content, sourceKind, sourceRef, importance)
}
