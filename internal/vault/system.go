package vault

// Reads the SYSTEM performs, as distinct from reads an agent performs.
//
// # Why this exists
//
// RevealFor answers "may this agent read this secret?" by looking for a grant
// in builder_secret_grants, keyed by agent_slug. That is the right question for
// an agent, and the wrong question for an OAuth client secret: nothing is
// asking on an agent's behalf. The operator pressed Authorize, and the server
// needs its own application credential to complete the exchange it was asked to
// perform.
//
// Forcing that through the agent path would mean inventing a fake agent to hold
// a grant to a credential that is not an agent's — and it is blocked anyway,
// because builder_secret_grants.agent_slug is a foreign key to
// builder_agents(slug) (finding SF-001), so the grant row cannot be inserted
// for a non-agent principal at all.
//
// # What keeps this from being a hole
//
// Three things, and they are the whole justification:
//
//  1. The NAME is not caller-supplied. Every system read passes a constant
//     declared in Go (see integrations/oauth.go). There is no endpoint that
//     takes a secret name and returns its value through this path, so an
//     attacker who reaches the process cannot ask it for an arbitrary secret.
//  2. It is audited exactly like an agent read, with the reason recorded in
//     place of the agent. builder_secret_reads.agent_slug is nullable and
//     carries no foreign key, so "system:oauth" is a legal, greppable value —
//     the audit trail stays complete rather than acquiring a blind spot.
//  3. It never returns the value to a caller over HTTP. It is used in-process,
//     to sign a request that then leaves. Nothing renders it.

import (
	"context"
	"fmt"
	"strings"
)

// SystemReader is the narrow capability a subsystem needs to read the
// installation's own credentials.
type SystemReader interface {
	RevealSystem(ctx context.Context, name, reason string) (string, error)
}

// RevealSystem decrypts a secret held by the installation itself.
//
// `reason` names the subsystem asking and lands in the audit row. It is
// required — an unattributed system read is exactly the thing this design is
// trying not to become.
func (s *Store) RevealSystem(ctx context.Context, name, reason string) (string, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return "", fmt.Errorf("a system read must name its reason")
	}
	var id, ct, aad string
	if err := s.db.QueryRowContext(ctx,
		`SELECT id, ciphertext, aad FROM builder_secrets WHERE name=$1 AND current`,
		name).Scan(&id, &ct, &aad); err != nil {
		// Deliberately the same shape as RevealFor's miss: "no such secret" and
		// nothing about whether one nearly matched.
		return "", fmt.Errorf("no such secret %q", name)
	}

	// Audited BEFORE the plaintext exists, so a decrypt that panics or fails
	// still leaves a record that the read was attempted. Recording after would
	// make the interesting failures the invisible ones.
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO builder_secret_reads (secret_id, agent_slug, outcome)
		 VALUES ($1,$2,'ok')`, id, "system:"+reason); err != nil {
		return "", fmt.Errorf("could not record the read: %w", err)
	}

	plain, err := s.svc.Open(ct, aad)
	if err != nil {
		return "", fmt.Errorf("could not decrypt %q: %w", name, err)
	}
	return string(plain), nil
}

// PutSystem stores (or rotates) a secret the installation owns.
//
// The write half of RevealSystem, and it exists for the same reason: an OAuth
// client secret is configuration the server holds, not a credential granted to
// an agent, so it has no agent to attribute the write to.
//
// Rotation semantics match handleStore exactly — the previous version stays,
// marked not-current — because "what was live when this ran?" has to stay
// answerable after somebody replaces a key.
func (s *Store) PutSystem(ctx context.Context, name, value, reason string) error {
	name, value = strings.TrimSpace(name), strings.TrimSpace(value)
	if name == "" || value == "" {
		return fmt.Errorf("a secret needs a name and a value")
	}
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("a system write must name its reason")
	}

	const scope = "project"
	aad := AAD(scope, "", name)
	ct, err := s.svc.Seal([]byte(value), aad)
	if err != nil {
		return fmt.Errorf("could not encrypt the secret: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var version int
	_ = tx.QueryRowContext(ctx,
		`SELECT coalesce(max(version),0)+1 FROM builder_secrets
		  WHERE scope=$1 AND coalesce(agent_slug,'')='' AND name=$2`, scope, name).Scan(&version)
	if version == 0 {
		version = 1
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE builder_secrets SET current=false
		  WHERE scope=$1 AND coalesce(agent_slug,'')='' AND name=$2 AND current`, scope, name); err != nil {
		return fmt.Errorf("could not rotate: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_secrets
		   (scope, agent_slug, name, kind, ciphertext, aad, hint, version, current)
		 VALUES ($1,NULL,$2,'token',$3,$4,$5,$6,true)`,
		scope, name, ct, aad, Hint(value), version); err != nil {
		return fmt.Errorf("could not store the secret: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	// The HINT is logged, never the value. Hint is a few characters, which is
	// enough to confirm the right key landed and useless to anyone reading logs.
	s.log.Info("system secret stored", "name", name, "version", version,
		"hint", Hint(value), "reason", reason)
	return nil
}

// HasSecret reports whether a named secret exists, without decrypting it.
//
// The gallery needs to answer "is this provider configured?" on every page
// load. Doing that with RevealSystem would decrypt a client secret, and write
// an audit row, purely to decide whether to enable a button — a read that
// happens dozens of times a day and never uses the value.
func (s *Store) HasSecret(ctx context.Context, name string) bool {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM builder_secrets WHERE name=$1 AND current`, name).Scan(&n)
	return err == nil
}
