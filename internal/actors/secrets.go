package actors

import (
	"context"
	"fmt"
)

// This file is the ONLY place in this package that knows how a connection reads
// its credential, and it is deliberately one function.
//
// SF-001 (docs/security-findings.md) makes that read impossible today:
// `builder_secret_grants.agent_slug` is a foreign key into `builder_agents`, so
// a grant for a principal like `connection:slack:ops` cannot be inserted, the
// lookup always fails, and RevealFor takes the deny branch. Every credentialed
// connection has therefore never once authenticated.
//
// The fix is a choice between three designs — widen the principal with a new
// table, materialise fake agent rows, or reveal as a configured RunAs — one of
// which carries a migration. That is a design call, it is `security`-labelled,
// and Rule 33 puts it outside an agent's remit. It is not made here.
//
// What IS here is the seam. Every actor takes a Secrets and none of them import
// the vault, so when a human picks a fix exactly one implementation changes and
// the five providers start working untouched. Until then this returns a named
// error rather than a nil string, because an actor that silently sends with an
// empty token produces a 401 from a provider and a bug report about the
// provider.

// Blocked is a Secrets that refuses, with the reason.
//
// It is the default wiring, so an operator who configures a connection before
// SF-001 is resolved gets a precise message instead of a puzzling auth failure
// from Slack.
type Blocked struct {
	// Kind and Name name the connection, so the error says which one.
	Kind string
	Name string
}

func (b Blocked) Reveal(_ context.Context, name string) (string, error) {
	return "", fmt.Errorf("%w (connection %s/%s wanted secret %q)", ErrBlockedSF001, b.Kind, b.Name, name)
}

// Static is a Secrets backed by an in-memory map.
//
// For TESTS and for DryRun paths only. It is exported because the actor tests
// need to render a payload without a vault, and giving them a fake here is
// better than each one inventing its own — but it must never be wired into a
// live send: a credential in a Go map is a credential in a core dump, a heap
// snapshot, and every backup of the process that held it (Rule 34).
type Static map[string]string

func (s Static) Reveal(_ context.Context, name string) (string, error) {
	v, ok := s[name]
	if !ok || v == "" {
		return "", fmt.Errorf("%w: no secret named %q", ErrNotConfigured, name)
	}
	return v, nil
}
