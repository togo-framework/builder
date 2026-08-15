package sources

// Creating and testing a connection from somewhere other than the HTTP form.
//
// Smart connect needs to do exactly what handleCreate does — validate the kind,
// default the namespace, build the connector to prove the config is real, and
// insert the row — without going back out through HTTP to do it. Duplicating
// that logic there would put the two copies one bug fix apart, and the one that
// drifts is always the copy that fewer people read.
//
// So the checks live here and handleCreate is one of two callers.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/togo-framework/builder/internal/brain"
)

// CreateFromPlan inserts a connection after validating it the same way the form
// does, and returns its id.
//
// DISABLED on create, always, and not negotiable from the caller: a connection
// that a model proposed from a sentence must not begin polling somebody's
// database because the sentence sounded confident. Turning it on stays a
// separate, human act — the same rule the form follows.
func (s *Store) CreateFromPlan(ctx context.Context, kind, name string, config json.RawMessage) (string, error) {
	kind, name = strings.TrimSpace(kind), strings.TrimSpace(name)
	if kind == "" || name == "" {
		return "", errors.New("a connection needs a kind and a name")
	}
	if len(name) > maxNameBytes {
		return "", errors.New("that name is too long — keep it under 200 characters")
	}
	if !isPlugin(kind) && kind != "sql" {
		return "", fmt.Errorf("no runner for %q — this build knows: %s, sql",
			kind, strings.Join(Kinds(), ", "))
	}
	if len(config) == 0 {
		config = json.RawMessage(`{}`)
	}

	// Build the thing the config configures, exactly as handleCreate does. A
	// connector that cannot be opened is a connection that would fail on a
	// schedule at 3am rather than in the answer to the request that made it.
	if isPlugin(kind) {
		if _, err := Open(kind, config, sourceSecrets{v: s.vault, kind: kind, name: name}); err != nil {
			return "", fmt.Errorf("that configuration is not valid: %s", Scrub(err.Error()))
		}
	}

	ns := brain.ProjectNamespace(brain.FleetName(ctx, s.db))
	var id string
	if err := s.db.QueryRowContext(ctx, `
		INSERT INTO builder_sources (kind, name, direction, namespace, schedule, config, enabled)
		VALUES ($1,$2,'source',$3,'@hourly',$4,false)
		RETURNING id`, kind, name, ns, []byte(config)).Scan(&id); err != nil {
		// The unique constraint is (kind, name), and hitting it is the most
		// likely failure here by a distance: a model asked to name an RSS feed
		// from "the Laravel News feed" will produce "Laravel News" every time,
		// which is correct and collides with the last one.
		//
		// Said in those words rather than as the driver's. An operator who
		// reads `duplicate key value violates unique constraint
		// "builder_sources_uniq" (SQLSTATE 23505)` learns nothing they can act
		// on, and the action here is simply to pick a different name.
		if strings.Contains(err.Error(), "builder_sources_uniq") ||
			strings.Contains(err.Error(), "23505") {
			return "", fmt.Errorf("a %s connection called %q already exists — give this one a different name", kind, name)
		}
		return "", fmt.Errorf("could not save the connection: %s", Scrub(err.Error()))
	}
	s.log.Info("connection created from a plan", "kind", kind, "name", name)
	return id, nil
}

// TestConnection runs one fetch against a connection and reports what happened.
//
// The point of smart connect is to hand back something that demonstrably works,
// and "saved" is not that. A feed URL with a typo, a token with the wrong
// scope, a database the host cannot reach — all of them save fine and all of
// them are worth knowing about while the operator is still looking at the
// screen.
func (s *Store) TestConnection(ctx context.Context, id string) error {
	var kind, name string
	if err := s.db.QueryRowContext(ctx,
		`SELECT kind, name FROM builder_sources WHERE id = $1`, id).Scan(&kind, &name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("no such connection")
		}
		return err
	}
	return s.RefreshNow(ctx, kind, name)
}
