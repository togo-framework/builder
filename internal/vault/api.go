package vault

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Store is the vault's persistence + audit layer.
type Store struct {
	svc *Service
	db  *sql.DB
	log *slog.Logger
}

func NewStore(svc *Service, db *sql.DB, log *slog.Logger) *Store {
	return &Store{svc: svc, db: db, log: log}
}

func (s *Store) Routes(r chi.Router) {
	r.Get("/secrets", s.handleList)
	r.Post("/secrets", s.handleStore)
	r.Post("/secrets/{name}/reveal", s.handleReveal)
	r.Delete("/secrets/{name}", s.handleDelete)
	r.Post("/secrets/{name}/grant", s.handleGrant)
	r.Get("/audit", s.handleAudit)
}

type secretRow struct {
	ID        string `json:"id"`
	Scope     string `json:"scope"`
	AgentSlug string `json:"agentSlug,omitempty"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	// Hint is a masked, non-reversible preview: sk-…a1b2. Never the value.
	Hint      string `json:"hint"`
	Version   int    `json:"version"`
	CreatedAt string `json:"createdAt"`
	Reads     int    `json:"reads"`
}

func (s *Store) handleList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT s.id, s.scope, coalesce(s.agent_slug,''), s.name, s.kind, s.hint,
		        s.version, s.created_at,
		        (SELECT count(*) FROM builder_secret_reads x
		          WHERE x.secret_id = s.id AND x.outcome = 'ok')
		   FROM builder_secrets s
		  WHERE s.current
		  ORDER BY s.scope, s.name`)
	if err != nil {
		s.log.Error("list secrets", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list secrets")
		return
	}
	defer rows.Close()

	out := []secretRow{}
	for rows.Next() {
		var x secretRow
		if rows.Scan(&x.ID, &x.Scope, &x.AgentSlug, &x.Name, &x.Kind, &x.Hint,
			&x.Version, &x.CreatedAt, &x.Reads) == nil {
			out = append(out, x)
		}
	}
	// The list never contains ciphertext, let alone plaintext: a listing endpoint
	// that returns encrypted material invites offline attack on the key.
	writeJSON(w, http.StatusOK, map[string]any{"secrets": out})
}

type storeReq struct {
	Scope     string `json:"scope"` // project | agent
	AgentSlug string `json:"agentSlug"`
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	Value     string `json:"value"`
}

func (s *Store) handleStore(w http.ResponseWriter, r *http.Request) {
	var in storeReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || in.Value == "" {
		httpErr(w, http.StatusUnprocessableEntity, "name and value are required")
		return
	}
	if in.Scope != "agent" {
		in.Scope = "project"
		in.AgentSlug = ""
	}

	aad := AAD(in.Scope, in.AgentSlug, in.Name)
	ct, err := s.svc.Seal([]byte(in.Value), aad)
	if err != nil {
		s.log.Error("seal", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not encrypt the secret")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not store the secret")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// Rotation keeps history: the previous version stays, marked not-current, so
	// an audit can answer "what was live when this ran?" after a rotation.
	var version int
	_ = tx.QueryRowContext(r.Context(),
		`SELECT coalesce(max(version),0)+1 FROM builder_secrets
		  WHERE scope=$1 AND coalesce(agent_slug,'')=$2 AND name=$3`,
		in.Scope, in.AgentSlug, in.Name).Scan(&version)
	if version == 0 {
		version = 1
	}
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_secrets SET current=false
		  WHERE scope=$1 AND coalesce(agent_slug,'')=$2 AND name=$3 AND current`,
		in.Scope, in.AgentSlug, in.Name); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not rotate")
		return
	}

	var id string
	if err := tx.QueryRowContext(r.Context(),
		`INSERT INTO builder_secrets
		   (scope, agent_slug, name, kind, ciphertext, aad, hint, version, current)
		 VALUES ($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8,true) RETURNING id`,
		in.Scope, in.AgentSlug, in.Name, in.Kind, ct, aad, Hint(in.Value), version,
	).Scan(&id); err != nil {
		s.log.Error("insert secret", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not store the secret")
		return
	}
	if err := tx.Commit(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not store the secret")
		return
	}

	s.log.Info("secret stored", "name", in.Name, "scope", in.Scope, "version", version)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "version": version, "hint": Hint(in.Value)})
}

type revealReq struct {
	AgentSlug string `json:"agentSlug"`
	RunID     string `json:"runId"`
	IssueID   string `json:"issueId"`
}

// handleReveal decrypts a secret — the only endpoint that ever returns plaintext.
//
// The audit row is written in the SAME TRANSACTION as the read, so a reveal that
// is not recorded does not happen. cabrain's equivalent emits only a transient
// event, which means there is no durable answer to "who read this key?".
func (s *Store) handleReveal(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var in revealReq
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in)

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not reveal")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var id, scope, agentSlug, ct, aad string
	err = tx.QueryRowContext(r.Context(),
		`SELECT id, scope, coalesce(agent_slug,''), ciphertext, aad
		   FROM builder_secrets WHERE name=$1 AND current`, name).
		Scan(&id, &scope, &agentSlug, &ct, &aad)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such secret")
		return
	}
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not reveal")
		return
	}

	// An agent needs an explicit reveal grant. Reveal is deliberately separate
	// from can_list and from any write capability — cabrain requires WRITE on a
	// brain to reveal a secret, so a read-only agent cannot read a credential,
	// which is backwards.
	outcome := "ok"
	if in.AgentSlug != "" {
		var canReveal bool
		var maxPerRun int
		err := tx.QueryRowContext(r.Context(),
			`SELECT can_reveal, max_reveals_per_run FROM builder_secret_grants
			  WHERE secret_id=$1 AND agent_slug=$2
			    AND (expires_at IS NULL OR expires_at > now())`,
			id, in.AgentSlug).Scan(&canReveal, &maxPerRun)
		switch {
		case errors.Is(err, sql.ErrNoRows), err == nil && !canReveal:
			outcome = "denied"
		case err != nil:
			outcome = "denied"
		default:
			if in.RunID != "" {
				var used int
				_ = tx.QueryRowContext(r.Context(),
					`SELECT count(*) FROM builder_secret_reads
					  WHERE secret_id=$1 AND run_id=$2 AND outcome='ok'`,
					id, in.RunID).Scan(&used)
				if used >= maxPerRun {
					outcome = "rate_limited"
				}
			}
		}
	}

	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_secret_reads (secret_id, agent_slug, run_id, issue_id, ip, outcome)
		 VALUES ($1,NULLIF($2,''),NULLIF($3,'')::uuid,NULLIF($4,'')::uuid,$5,$6)`,
		id, in.AgentSlug, in.RunID, in.IssueID, clientIP(r), outcome); err != nil {
		s.log.Error("audit write failed — refusing the reveal", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not record the read")
		return
	}

	if outcome != "ok" {
		if err := tx.Commit(); err != nil { // the denial is still recorded
			s.log.Error("commit denial", "err", err)
		}
		s.log.Warn("reveal denied", "secret", name, "agent", in.AgentSlug, "outcome", outcome)
		httpErr(w, http.StatusForbidden, "not permitted to reveal this secret: "+outcome)
		return
	}

	plain, err := s.svc.Open(ct, aad)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not decrypt")
		return
	}
	if err := tx.Commit(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not record the read")
		return
	}

	s.log.Info("secret revealed", "secret", name, "agent", in.AgentSlug)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "value": string(plain)})
}

func (s *Store) handleDelete(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	res, err := s.db.ExecContext(r.Context(),
		`DELETE FROM builder_secrets WHERE name=$1`, name)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not delete")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such secret")
		return
	}
	s.log.Info("secret deleted", "name", name)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Store) handleGrant(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var in struct {
		AgentSlug string `json:"agentSlug"`
		CanReveal bool   `json:"canReveal"`
		MaxPerRun int    `json:"maxPerRun"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	if in.MaxPerRun <= 0 {
		in.MaxPerRun = 3
	}
	var id string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT id FROM builder_secrets WHERE name=$1 AND current`, name).Scan(&id); err != nil {
		httpErr(w, http.StatusNotFound, "no such secret")
		return
	}
	if _, err := s.db.ExecContext(r.Context(),
		`INSERT INTO builder_secret_grants (secret_id, agent_slug, can_reveal, can_list, max_reveals_per_run)
		 VALUES ($1,$2,$3,true,$4)
		 ON CONFLICT (secret_id, agent_slug) DO UPDATE SET
		   can_reveal = EXCLUDED.can_reveal, max_reveals_per_run = EXCLUDED.max_reveals_per_run`,
		id, in.AgentSlug, in.CanReveal, in.MaxPerRun); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not grant")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"granted": true})
}

func (s *Store) handleAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT s.name, coalesce(x.agent_slug,''), coalesce(x.run_id::text,''),
		        x.outcome, coalesce(host(x.ip),''), x.created_at
		   FROM builder_secret_reads x JOIN builder_secrets s ON s.id = x.secret_id
		  ORDER BY x.created_at DESC LIMIT 200`)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not read the audit log")
		return
	}
	defer rows.Close()
	type entry struct {
		Secret, Agent, RunID, Outcome, IP, At string
	}
	out := []entry{}
	for rows.Next() {
		var e entry
		if rows.Scan(&e.Secret, &e.Agent, &e.RunID, &e.Outcome, &e.IP, &e.At) == nil {
			out = append(out, e)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reads": out})
}

// RevealFor is the in-process path agents use, bypassing HTTP. Same contract:
// the audit row and the decrypt share a transaction.
func (s *Store) RevealFor(ctx context.Context, name, agentSlug, runID string) (string, error) {
	var id, ct, aad string
	if err := s.db.QueryRowContext(ctx,
		`SELECT id, ciphertext, aad FROM builder_secrets WHERE name=$1 AND current`,
		name).Scan(&id, &ct, &aad); err != nil {
		return "", fmt.Errorf("no such secret %q", name)
	}
	var canReveal bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT can_reveal FROM builder_secret_grants
		  WHERE secret_id=$1 AND agent_slug=$2 AND (expires_at IS NULL OR expires_at > now())`,
		id, agentSlug).Scan(&canReveal); err != nil || !canReveal {
		_, _ = s.db.ExecContext(ctx,
			`INSERT INTO builder_secret_reads (secret_id, agent_slug, run_id, outcome)
			 VALUES ($1,$2,NULLIF($3,'')::uuid,'denied')`, id, agentSlug, runID)
		return "", fmt.Errorf("agent %s may not reveal %q", agentSlug, name)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO builder_secret_reads (secret_id, agent_slug, run_id, outcome)
		 VALUES ($1,$2,NULLIF($3,'')::uuid,'ok')`, id, agentSlug, runID); err != nil {
		return "", fmt.Errorf("could not record the read: %w", err)
	}
	plain, err := s.svc.Open(ct, aad)
	return string(plain), err
}

func clientIP(r *http.Request) string {
	ip := r.Header.Get("X-Forwarded-For")
	if i := strings.IndexByte(ip, ','); i >= 0 {
		ip = ip[:i]
	}
	if ip == "" {
		if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			ip = h
		}
	}
	if net.ParseIP(strings.TrimSpace(ip)) == nil {
		return "127.0.0.1"
	}
	return strings.TrimSpace(ip)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
