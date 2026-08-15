package sources

// The seam that lets a collector reach an OAuth access token.
//
// A Factory receives `(cfg, Secrets)` — the vault, for credentials a human
// placed there. An OAuth token is not that: it is issued by the provider, it
// expires hourly, it refreshes itself, and it lives in `builder_oauth_tokens`
// rather than the vault (see migration 0021 and SF-001). So an OAuth collector
// needs a second, narrower capability, and this is it.
//
// # Why a package-level setter rather than a Factory parameter
//
// Widening `Factory` to `func(cfg, Secrets, Tokens)` touches every existing
// connector, every test that builds one, and the registry — for a dependency
// six of them do not use. That is a large diff whose only content is threading
// a nil through call sites, and Rule 35 is explicit that a cap being hit is a
// signal to reconsider rather than to write the change anyway.
//
// The cost of the global is real and worth stating: a collector built before
// SetTokens has run gets a nil and fails at Fetch rather than at Open. The
// provider sets it during boot, before the scheduler starts, and the error
// below names the situation precisely so that failure is legible rather than a
// nil dereference.

import (
	"context"
	"errors"
	"sync"
)

// Tokens hands out a valid access token for an integration, refreshing it
// first when it is close to expiry. *integrations.Tokens satisfies it.
type Tokens interface {
	AccessToken(ctx context.Context, integration string) (string, error)
}

var (
	tokensMu sync.RWMutex
	tokens   Tokens
)

// SetTokens installs the token source. Called once during boot.
func SetTokens(t Tokens) {
	tokensMu.Lock()
	defer tokensMu.Unlock()
	tokens = t
}

// ErrNoTokens means an OAuth collector ran before a token source was installed.
var ErrNoTokens = errors.New(
	"this build has no OAuth token source wired up — the collector cannot authenticate")

// accessToken is what an OAuth collector calls at the top of Fetch.
//
// Deliberately fetched per-Fetch rather than held on the connector: a source
// object outlives many runs, and a token captured at Open would be an hour
// stale by the second one.
func accessToken(ctx context.Context, integration string) (string, error) {
	tokensMu.RLock()
	t := tokens
	tokensMu.RUnlock()
	if t == nil {
		return "", ErrNoTokens
	}
	return t.AccessToken(ctx, integration)
}
