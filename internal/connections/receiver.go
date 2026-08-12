// Package connections is the successor to internal/sources.
//
// A source could only ever PULL. A connection is a connector that may also be
// pushed to (Receiver) or act outward (Actor) — the three verbs discovered by
// type assertion rather than declared up front, so a connector implements only
// what it actually does.
//
// This file is the Receiver half, and it starts here because the schema for it
// has existed since migration 0013 with zero Go references. Push ingestion was
// designed carefully — hashed path tokens, vault-held signing keys, a namespace
// CHECK that stops an unauthenticated POST reaching a private brain, a rate
// limit, sources that land disabled — and then never built.
package connections

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"log/slog"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"strings"
	"time"
)

// MaxBody caps what a delivery may carry.
//
// The endpoint is public and unauthenticated by construction — the URL's path
// token IS the credential — so an unbounded read is a memory-exhaustion vector
// that needs no valid signature to fire. The cap applies BEFORE the signature
// check for exactly that reason.
const MaxBody = 1 << 20 // 1 MiB

// Retainer is the brain, narrowed to the one call this package makes.
type Retainer interface {
	Retain(ctx context.Context, namespace, text string, importance float64) (string, error)
}

// Revealer is the vault, narrowed the same way.
type Revealer interface {
	RevealFor(ctx context.Context, name, principal, runID string) (string, error)
}

// Receiver serves webhook deliveries.
type Receiver struct {
	db    *sql.DB
	log   *slog.Logger
	brain Retainer
	vault Revealer
}

func NewReceiver(db *sql.DB, log *slog.Logger, brain Retainer, vault Revealer) *Receiver {
	return &Receiver{db: db, log: log, brain: brain, vault: vault}
}

type source struct {
	ID               string
	Slug             string
	SigningSecretRef string
	SignatureHeader  string
	SignatureAlgo    string
	Template         string
	Namespace        string
	Importance       float64
	RateLimitPerMin  int
	Enabled          bool
}

// Deliver handles POST /api/builder/hooks/{token}.
//
// Unauthenticated by design: the path token is the credential. Everything that
// follows is therefore written for a caller who is not trusted.
func (r *Receiver) Deliver(w http.ResponseWriter, req *http.Request) {
	ctx := req.Context()
	token := strings.TrimSpace(chiParam(req, "token"))

	// Read under the cap first. An unbounded read happens before any check
	// could reject it, so the cap has to come before the checks.
	body, err := io.ReadAll(io.LimitReader(req.Body, MaxBody+1))
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}
	if len(body) > MaxBody {
		http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
		return
	}
	sum := sha256.Sum256(body)
	bodyHash := hex.EncodeToString(sum[:])

	src, err := r.lookup(ctx, token)
	if err != nil {
		// One response for "no such token" and "token belongs to a disabled
		// source". Distinguishing them tells an attacker which of their guesses
		// named a real endpoint, and the operator can see the difference in the
		// delivery log, where it is actually useful.
		r.logDelivery(ctx, "", "rejected", http.StatusNotFound, req, bodyHash, len(body), "", "", "unknown or disabled endpoint")
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if over, count := r.overRateLimit(ctx, src); over {
		r.logDelivery(ctx, src.ID, "rate_limited", http.StatusTooManyRequests, req, bodyHash, len(body), "", "",
			fmt.Sprintf("%d deliveries in the last minute, limit %d", count, src.RateLimitPerMin))
		w.Header().Set("Retry-After", "60")
		http.Error(w, "rate limited", http.StatusTooManyRequests)
		return
	}

	if err := r.verify(ctx, src, req, body); err != nil {
		r.logDelivery(ctx, src.ID, "rejected", http.StatusUnauthorized, req, bodyHash, len(body), "", "", err.Error())
		http.Error(w, "signature verification failed", http.StatusUnauthorized)
		return
	}

	text, err := render(src.Template, body)
	if err != nil {
		r.logDelivery(ctx, src.ID, "failed", http.StatusUnprocessableEntity, req, bodyHash, len(body), "", "", err.Error())
		http.Error(w, "could not render the delivery", http.StatusUnprocessableEntity)
		return
	}

	memID, err := r.brain.Retain(ctx, src.Namespace, text, src.Importance)
	if err != nil {
		r.logDelivery(ctx, src.ID, "failed", http.StatusInternalServerError, req, bodyHash, len(body), text, "", err.Error())
		http.Error(w, "could not retain", http.StatusInternalServerError)
		return
	}

	r.logDelivery(ctx, src.ID, "accepted", http.StatusAccepted, req, bodyHash, len(body), text, memID, "")
	_, _ = r.db.ExecContext(ctx,
		`UPDATE builder_webhook_sources
		    SET last_delivery_at = now(), delivery_count = delivery_count + 1, updated_at = now()
		  WHERE id = $1`, src.ID)
	w.WriteHeader(http.StatusAccepted)
}

func (r *Receiver) lookup(ctx context.Context, token string) (*source, error) {
	if token == "" {
		return nil, errors.New("no token")
	}
	// The stored form is a hash; the URL carries the plaintext. Hash the
	// candidate and look THAT up, so a leaked database yields no working URLs —
	// the same contract as builder_mcp_tokens.
	sum := sha256.Sum256([]byte(token))
	h := hex.EncodeToString(sum[:])

	var s source
	err := r.db.QueryRowContext(ctx,
		`SELECT id, slug, signing_secret_ref, signature_header, signature_algo,
		        template, namespace, importance, rate_limit_per_min, enabled
		   FROM builder_webhook_sources
		  WHERE path_token_hash = $1`, h).
		Scan(&s.ID, &s.Slug, &s.SigningSecretRef, &s.SignatureHeader, &s.SignatureAlgo,
			&s.Template, &s.Namespace, &s.Importance, &s.RateLimitPerMin, &s.Enabled)
	if err != nil {
		return nil, err
	}
	if !s.Enabled {
		return nil, errors.New("source disabled")
	}
	return &s, nil
}

// overRateLimit answers "how many in the last minute?" — the range scan the
// deliveries index exists for.
//
// A stuck integration must not flood the brain: a deploy notifier in a crash
// loop can POST thousands of times a minute, and without a ceiling the brain
// fills with one message repeated until recall is useless.
func (r *Receiver) overRateLimit(ctx context.Context, s *source) (bool, int) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT count(*) FROM builder_webhook_deliveries
		  WHERE source_id = $1 AND received_at > now() - interval '1 minute'`, s.ID).Scan(&n)
	if err != nil {
		// Fail OPEN on a counting error. The limiter protects the brain from
		// volume; refusing every delivery because a COUNT failed turns a
		// degraded database into a silent outage of the whole integration.
		r.log.Warn("webhook: rate-limit count failed, allowing", "source", s.Slug, "err", err)
		return false, 0
	}
	return n >= s.RateLimitPerMin, n
}

func (r *Receiver) verify(ctx context.Context, s *source, req *http.Request, body []byte) error {
	// The schema's CHECK already forbids an enabled source with no signing ref,
	// so this cannot normally fire — it is here because "cannot normally" is
	// not "cannot", and the failure mode is an open pipe into project memory.
	if s.SigningSecretRef == "" {
		return errors.New("source has no signing secret")
	}
	got := strings.TrimSpace(req.Header.Get(s.SignatureHeader))
	if got == "" {
		return fmt.Errorf("missing %s", s.SignatureHeader)
	}
	// Tolerate the common "sha256=..." prefix GitHub and others send.
	if i := strings.IndexByte(got, '='); i > 0 && !isHex(got) {
		got = got[i+1:]
	}

	key, err := r.vault.RevealFor(ctx, s.SigningSecretRef, "connection:webhook:"+s.Slug, "")
	if err != nil {
		// NOTE: this is the SF-001 path. Until the vault's grant principal is
		// fixed, a webhook source cannot be granted its signing key, so this
		// returns an error and every delivery is refused. Refusing is the
		// correct behaviour for an unverifiable delivery — the bug is that the
		// grant cannot be created, not that this check is too strict.
		return fmt.Errorf("cannot read signing secret: %w", err)
	}

	var mac hash.Hash
	switch s.SignatureAlgo {
	case "hmac-sha512":
		mac = hmac.New(sha512.New, []byte(key))
	default:
		mac = hmac.New(sha256.New, []byte(key))
	}
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))

	// Constant time. A byte-by-byte compare leaks the correct prefix through
	// timing, and a signature is exactly the kind of value that gets brute
	// forced one byte at a time.
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(got)), []byte(want)) != 1 {
		return errors.New("signature mismatch")
	}
	return nil
}

// logDelivery records what happened. Header NAMES only, never values — that is
// where an Authorization header lives — and a hash of the body rather than the
// body, per the schema's own reasoning.
func (r *Receiver) logDelivery(
	ctx context.Context, sourceID, status string, httpStatus int,
	req *http.Request, bodyHash string, bodyBytes int, rendered, memoryID, errMsg string,
) {
	names := make([]string, 0, len(req.Header))
	for k := range req.Header {
		names = append(names, k)
	}
	sort.Strings(names)

	var srcArg any
	if sourceID != "" {
		srcArg = sourceID
	}
	// A rejected delivery with no known source has nothing to hang off — the
	// FK is NOT NULL — so it is logged and dropped rather than invented.
	if srcArg == nil {
		r.log.Info("webhook: rejected unknown endpoint", "status", status, "bodySha256", bodyHash)
		return
	}
	var mem any
	if memoryID != "" {
		mem = memoryID
	}
	if _, err := r.db.ExecContext(ctx,
		`INSERT INTO builder_webhook_deliveries
		   (source_id, status, http_status, header_names, body_sha256, body_bytes,
		    rendered_text, memory_id, error)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		srcArg, status, httpStatus, pgTextArray(names), bodyHash, bodyBytes, rendered, mem, errMsg,
	); err != nil {
		// The delivery already succeeded or failed on its own terms; losing the
		// log entry must not change the response the caller gets.
		r.log.Warn("webhook: could not record delivery", "err", err)
	}
}

func isHex(s string) bool {
	_, err := hex.DecodeString(s)
	return err == nil
}

// pgTextArray renders a Go slice as a Postgres text[] literal.
func pgTextArray(vals []string) string {
	if len(vals) == 0 {
		return "{}"
	}
	q := make([]string, len(vals))
	for i, v := range vals {
		q[i] = `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(v) + `"`
	}
	return "{" + strings.Join(q, ",") + "}"
}

// Routes mounts the public delivery endpoint.
//
// PUBLIC on purpose, and it must stay that way: a webhook sender has no session
// and never will. The path token is the credential and the HMAC is the
// authentication, which is why both are enforced above rather than delegated to
// a middleware that a future refactor could mount this behind.
func (r *Receiver) Routes(router chi.Router) {
	router.Post("/{token}", r.Deliver)
}

func chiParam(req *http.Request, name string) string {
	return chi.URLParam(req, name)
}

var _ = time.Minute
