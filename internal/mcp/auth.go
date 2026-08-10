// Package mcp exposes the builder over the Model Context Protocol, so an agent
// running anywhere — Claude Code, Codex, any MCP client — can read the issue
// board and talk to this fleet and its memory.
//
// Two servers rather than one, because they have very different blast radii:
//
//	/mcp/feedback — the issue plane. File issues, read them, comment, move them.
//	/mcp/agents   — the fleet: personas, skills, each agent's brain, and the
//	                custom apps an agent can add to this builder mid-run.
//
// A token wired into a shared editor should be able to file bugs without also
// being able to read what every agent has learned — or to put executable code on
// a dashboard screen — so the scope is part of the credential rather than a
// convention.
package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/togo-framework/builder/customapps"
)

type Service struct {
	db  *sql.DB
	log *slog.Logger

	// The live custom-app registry, wired by SetApps after boot. Guarded
	// because the apps provider sets it while these servers are already
	// mountable — see apps.go for why there must be exactly one.
	appsMu sync.RWMutex
	apps   *customapps.Service
}

func New(db *sql.DB, log *slog.Logger) *Service {
	return &Service{db: db, log: log}
}

// tokenPrefix marks our tokens so one pasted into the wrong field is
// recognisable, and so a secret scanner can be taught to spot it.
const tokenPrefix = "bldr_mcp_"

// newToken returns the plaintext token and its storage hash.
//
// 32 bytes from crypto/rand, base64url without padding. The plaintext is
// returned once and never stored — see the migration.
func newToken() (plain, hash, prefix string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", "", err
	}
	plain = tokenPrefix + base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256([]byte(plain))
	hash = hex.EncodeToString(sum[:])
	// Enough to identify a row, far too little to reconstruct the token.
	prefix = plain[:len(tokenPrefix)+6]
	return plain, hash, prefix, nil
}

func hashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

// caller is a verified token.
type caller struct {
	id    string
	name  string
	scope string // agents | feedback | all
}

// authenticate resolves the bearer token on a request.
//
// The lookup is by hash, which is an indexed equality match — the comparison
// that matters for timing is inside Postgres, and the token is high-entropy
// random rather than a guessable secret. The constant-time compare below is on
// the prefix only, as a cheap sanity check that we were handed OUR kind of
// token rather than someone's session JWT.
func (s *Service) authenticate(r *http.Request, want string) (*caller, bool) {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return nil, false
	}
	tok := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	if len(tok) < len(tokenPrefix)+16 {
		return nil, false
	}
	if subtle.ConstantTimeCompare([]byte(tok[:len(tokenPrefix)]), []byte(tokenPrefix)) != 1 {
		return nil, false
	}

	var c caller
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT id, name, scope FROM builder_mcp_tokens
		  WHERE token_hash = $1 AND revoked_at IS NULL`,
		hashToken(tok)).Scan(&c.id, &c.name, &c.scope); err != nil {
		return nil, false
	}

	// 'all' opens both surfaces; anything else must match exactly. Checked here
	// rather than per tool, so a new tool cannot be added to the wrong server
	// and quietly inherit the wrong audience.
	if c.scope != "all" && c.scope != want {
		s.log.Warn("mcp token used on the wrong surface",
			"token", c.name, "scope", c.scope, "wanted", want)
		return nil, false
	}

	// Best-effort, and deliberately not in the request path's error handling:
	// "when was this last used" is what makes a token safe to revoke, but
	// failing to record it must never fail the call.
	go func() {
		_, _ = s.db.Exec(
			`UPDATE builder_mcp_tokens SET last_used_at = now() WHERE id = $1`, c.id)
	}()

	return &c, true
}

// requireToken wraps an MCP handler with bearer auth for one surface.
func (s *Service) requireToken(want string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, ok := s.authenticate(r, want)
		if !ok {
			// The WWW-Authenticate header is what makes a client prompt for a
			// token rather than reporting an opaque failure.
			w.Header().Set("WWW-Authenticate", `Bearer realm="builder-mcp"`)
			http.Error(w, `{"error":"a valid MCP token is required"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), callerKey{}, c)))
	})
}

type callerKey struct{}

func callerFrom(ctx context.Context) *caller {
	c, _ := ctx.Value(callerKey{}).(*caller)
	return c
}
