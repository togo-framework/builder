package mcp

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// Routes mounts both MCP servers and the token management the dashboard uses.
//
// The two servers are separate URLs rather than one server with per-tool
// permission checks. A client asks a server what it can do; if the answer
// depended on the token, the same URL would advertise different capabilities to
// different callers, and an operator reading the connect instructions could not
// tell what they were about to grant.
func (s *Service) Routes(r chi.Router) {
	// Streamable HTTP: the transport in the current MCP spec, and the one every
	// remote-capable client speaks. It replaced the old HTTP+SSE pair.
	feedback := sdk.NewStreamableHTTPHandler(
		func(req *http.Request) *sdk.Server { return s.feedbackServer(callerFrom(req.Context())) },
		streamableOpts())
	agents := sdk.NewStreamableHTTPHandler(
		func(req *http.Request) *sdk.Server { return s.agentsServer(callerFrom(req.Context())) },
		streamableOpts())

	r.Mount("/feedback", s.requireToken("feedback", feedback))
	r.Mount("/agents", s.requireToken("agents", agents))

	// Token management. Session-authenticated like the rest of the dashboard —
	// these routes are how an operator MINTS an MCP token, so they cannot
	// themselves require one.
	r.Get("/tokens", s.handleListTokens)
	r.Post("/tokens", s.handleCreateToken)
	r.Delete("/tokens/{id}", s.handleRevokeToken)
}

// streamableOpts is the transport configuration both servers are built with.
//
// DisableLocalhostProtection is the whole of it, and it is the difference
// between this surface working behind a reverse proxy and not working at all.
//
// The SDK (v1.4.0 onward) added DNS-rebinding protection: if the ACCEPTED
// CONNECTION's local address is loopback and the request's Host header is not,
// it answers 403 `Forbidden: invalid Host header "<host>"` before the handler
// runs. The trigger is the connection's local address, not the listen address —
// so every standard deployment fires it. Caddy (or nginx, or any same-host
// proxy) terminates TLS for builder.example.com and dials 127.0.0.1:PORT; the
// local address of that connection is loopback, the Host header is the public
// domain, and the SDK refuses the request. This was found in production: the
// surface returned 401 to every unauthenticated probe — correctly — and 403 to
// the one client that presented a VALID token, because only a valid token gets
// far enough to reach the SDK. The client reported it as a rejected credential,
// which is the opposite of what had happened.
//
// Turning the guard off here is safe because of where it sits. Every request
// that reaches these handlers has already passed requireToken, so the guard is
// unreachable without a live `bldr_mcp_` token. DNS rebinding is an attack on
// AMBIENT authority: it lets a page in someone's browser borrow that browser's
// network position against a server that trusts the network, or a cookie, or
// nothing at all. This surface trusts none of those. A rebound page cannot read
// a token it was never given, and a cross-origin request carrying an
// Authorization header does not leave the browser without a preflight this
// server never answers with the origin. The guard therefore protects nothing
// here and costs every proxied install.
//
// Everything else stays on the SDK's defaults, MaxRequestBodyBytes included.
func streamableOpts() *sdk.StreamableHTTPOptions {
	return &sdk.StreamableHTTPOptions{DisableLocalhostProtection: true}
}

type tokenRow struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	Scope      string  `json:"scope"`
	CreatedAt  string  `json:"createdAt"`
	LastUsedAt *string `json:"lastUsedAt"`
}

func (s *Service) handleListTokens(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, name, prefix, scope,
		        btrim(to_json(created_at)::text,'"'),
		        CASE WHEN last_used_at IS NULL THEN NULL
		             ELSE btrim(to_json(last_used_at)::text,'"') END
		   FROM builder_mcp_tokens
		  WHERE revoked_at IS NULL
		  ORDER BY created_at DESC`)
	if err != nil {
		s.log.Error("list mcp tokens", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list the tokens")
		return
	}
	defer rows.Close()

	// Allocated, not nil: Go marshals a nil slice as null and the page reads
	// .length on it.
	out := make([]tokenRow, 0, 4)
	for rows.Next() {
		var t tokenRow
		if rows.Scan(&t.ID, &t.Name, &t.Prefix, &t.Scope, &t.CreatedAt, &t.LastUsedAt) == nil {
			out = append(out, t)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tokens": out})
}

func (s *Service) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name  string `json:"name"`
		Scope string `json:"scope"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpErr(w, http.StatusUnprocessableEntity, "name the token, so you know which one to revoke later")
		return
	}
	switch in.Scope {
	case "agents", "feedback", "all":
	default:
		// Default to the narrower surface. A token minted by accident should
		// reach the issue board, not the personas and the memory.
		in.Scope = "feedback"
	}

	plain, hash, prefix, err := newToken()
	if err != nil {
		s.log.Error("generate mcp token", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not generate a token")
		return
	}

	var id string
	if err := s.db.QueryRowContext(r.Context(),
		`INSERT INTO builder_mcp_tokens (name, token_hash, prefix, scope)
		 VALUES ($1,$2,$3,$4) RETURNING id`,
		truncate(in.Name, 120), hash, prefix, in.Scope).Scan(&id); err != nil {
		s.log.Error("store mcp token", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not store the token")
		return
	}

	s.log.Info("mcp token created", "name", in.Name, "scope", in.Scope)
	// The plaintext appears in this response and nowhere else, ever.
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "name": in.Name, "scope": in.Scope, "token": plain,
	})
}

func (s *Service) handleRevokeToken(w http.ResponseWriter, r *http.Request) {
	// Revoked rather than deleted: the row is the record that the token
	// existed and when it was last used, which is exactly what an operator
	// wants after revoking one in a hurry.
	res, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_mcp_tokens SET revoked_at = now()
		  WHERE id = $1 AND revoked_at IS NULL`, chi.URLParam(r, "id"))
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not revoke the token")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no live token with that id")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
