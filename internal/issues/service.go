// Package issues owns the issue plane: the public feedback ingress the SDK
// posts to, and the per-route listing it reads back.
package issues

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/togo-framework/auth"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
)

// Ingress limits. The public endpoint is unauthenticated by design — a bug
// reporter may not be logged in — so every limit here is load-bearing.
const (
	maxFormBytes  = 128 << 20 // 128 MB: one 100 MB video plus overhead
	maxTitleBytes = 255
	maxBodyBytes  = 32 << 10
	maxPins       = 8
	maxAttach     = 10

	rateWindow = 10 * time.Minute
	rateBurst  = 5  // per window per IP hash
	rateDaily  = 60 // per day per IP hash
)

type Service struct {
	db  *sql.DB
	log *slog.Logger
	// allowedOrigins gates the unauthenticated ingress. Empty means same-origin
	// only, which is the safe default; autopilot's equivalent endpoint has no
	// origin check and no rate limit at all.
	allowedOrigins map[string]bool
	// dev relaxes the origin check to any loopback host, because a dev server
	// proxying to the API legitimately has Origin != Host.
	dev bool
	// nil when the auth plugin is absent; actorFrom degrades to "anonymous".
	auth *auth.Service
}

func New(db *sql.DB, log *slog.Logger, origins []string, dev bool) *Service {
	set := make(map[string]bool, len(origins))
	for _, o := range origins {
		if o = strings.TrimSpace(o); o != "" {
			set[strings.ToLower(o)] = true
		}
	}
	return &Service{db: db, log: log, allowedOrigins: set, dev: dev}
}

// SetAuth supplies the auth service so comments can be attributed to the
// signed-in user. Optional: without it every comment reads "anonymous".
func (s *Service) SetAuth(a *auth.Service) { s.auth = a }

// PublicRoutes carries the one surface that must answer an UNAUTHENTICATED
// request: feedback ingress.
//
// It is split out because the fix that put every builder surface behind auth
// swept this route up with the rest, and the two intents look identical at the
// mount site. A widget on a customer's marketing page is used by visitors who
// have no account and never will — an authenticated ingress is a feedback
// widget that silently cannot receive feedback, which is indistinguishable from
// a working one until someone checks the table.
//
// It is not unguarded. handleFeedback still enforces originAllowed() and
// underRateLimit(); what it does not require is a session. Everything that
// READS — the board, the listing, attachments — stays in Routes, behind auth,
// because "anyone may report a bug" and "anyone may read every bug ever filed"
// are different claims.
func (s *Service) PublicRoutes(r chi.Router) {
	r.Post("/", s.handleFeedback)
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/issues", s.handleList)    // per-route listing (the SDK sidebar)
	r.Get("/board", s.handleBoard)    // every issue, grouped by column
	r.Post("/issues", s.handleCreate) // filed by hand from the board
	r.Get("/issues/{number}", s.handleDetail)
	r.Patch("/issues/{number}", s.handlePatch)
	r.Post("/issues/{number}/comments", s.handleComment)
	r.Delete("/issues/{number}", s.handleDelete)
	r.Post("/issues/bulk-delete", s.handleBulkDelete)
	r.Get("/attachments/{id}", s.handleAttachment)
}

// ---------------------------------------------------------------------------

type pin struct {
	Testid   string   `json:"testid,omitempty"`
	DomID    string   `json:"domId,omitempty"`
	Role     string   `json:"role,omitempty"`
	Name     string   `json:"name,omitempty"`
	CSS      string   `json:"css,omitempty"`
	Hint     string   `json:"hint,omitempty"`
	Tag      string   `json:"tag,omitempty"`
	ScrollY  int      `json:"scrollY,omitempty"`
	Href     string   `json:"href,omitempty"`
	Verified []string `json:"verified,omitempty"`
	Rect     *struct {
		X, Y, W, H float64
	} `json:"rect,omitempty"`
	Viewport *struct {
		W, H int
		DPR  float64
	} `json:"viewport,omitempty"`
}

type newIssue struct {
	Type          string `json:"type"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	Route         string `json:"route"`
	PageURL       string `json:"page_url"`
	Locale        string `json:"locale"`
	Pins          []pin  `json:"pins"`
	ReporterEmail string `json:"reporter_email"`
	// Context is the browser snapshot a bridge-mode SDK volunteers — console,
	// network, viewport, userAgent, locale. Kept raw here; sanitizeContext
	// (context.go) bounds and re-shapes it before anything reaches the row.
	// The SDK's report form discloses that this is attached and offers sending
	// without it, in which case the field is simply absent.
	Context json.RawMessage `json:"context"`
}

var validType = map[string]bool{
	"bug": true, "feature": true, "enhancement": true,
	"question": true, "discussion": true, "chore": true,
}

func (s *Service) handleFeedback(w http.ResponseWriter, r *http.Request) {
	if !s.originAllowed(r) {
		httpErr(w, http.StatusForbidden, "origin not allowed")
		return
	}
	ipHash := hashIP(r)
	if ok, err := s.underRateLimit(r.Context(), ipHash); err != nil {
		s.log.Error("feedback rate check", "err", err)
		httpErr(w, http.StatusInternalServerError, "rate check failed")
		return
	} else if !ok {
		httpErr(w, http.StatusTooManyRequests, "too many reports; try again later")
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		httpErr(w, http.StatusBadRequest, "expected multipart/form-data")
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	var in newIssue
	if err := json.Unmarshal([]byte(r.FormValue("issue")), &in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed issue payload")
		return
	}

	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		httpErr(w, http.StatusUnprocessableEntity, "title is required")
		return
	}
	in.Title = truncate(in.Title, maxTitleBytes)
	in.Body = truncate(in.Body, maxBodyBytes)
	if !validType[in.Type] {
		in.Type = "bug"
	}
	if len(in.Pins) > maxPins {
		in.Pins = in.Pins[:maxPins]
	}
	if in.Route == "" {
		in.Route = "/"
	}
	in.Route = truncate(in.Route, 512)

	id, number, err := s.create(r.Context(), in, ipHash, r.MultipartForm)
	if err != nil {
		s.log.Error("create issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}

	s.log.Info("feedback received", "issue", number, "route", in.Route, "type", in.Type)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "number": number})
}

// create inserts the issue, its pins and its activity row in one transaction.
//
// The issue lands in `triage`, never `ready`: the triage agent classifies it
// before any implementer can claim it. Feedback ingress is the only path that
// may set `triage`, which is what stops an anonymous reporter from injecting
// work straight into the agent queue.
func (s *Service) create(ctx context.Context, in newIssue, ipHash string, form *multipart.Form) (string, int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var number int64
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO builder_issue_counters (scope, next_seq) VALUES ('default', 2)
		 ON CONFLICT (scope) DO UPDATE SET next_seq = builder_issue_counters.next_seq + 1
		 RETURNING next_seq - 1`).Scan(&number); err != nil {
		return "", 0, fmt.Errorf("allocate number: %w", err)
	}

	// The context is garnish on the report, never a gate: an oversized or
	// malformed snapshot is dropped (and logged, so a broken SDK is visible)
	// while the issue itself still lands — the same policy saveAttachments
	// applies to a screenshot that fails its checks.
	browserCtx, ctxProblem := sanitizeContext(in.Context)
	if ctxProblem != "" {
		s.log.Warn("browser context dropped", "reason", ctxProblem, "route", in.Route)
	}

	var id string
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO builder_issues
		   (number, title, body_md, status, type, board_rank, source,
		    route, page_url, locale, reporter_kind, reporter_email, browser_context)
		 VALUES ($1,$2,$3,'triage',$4::builder_issue_type,$5,'feedback',$6,$7,$8,'anon',$9,$10::jsonb)
		 RETURNING id`,
		number, in.Title, in.Body, in.Type, rankFor(number),
		in.Route, truncate(in.PageURL, 2048), localeOr(in.Locale),
		truncate(in.ReporterEmail, 320), nullIfEmpty(string(browserCtx)),
	).Scan(&id); err != nil {
		return "", 0, fmt.Errorf("insert issue: %w", err)
	}

	for i, p := range in.Pins {
		var rx, ry, rw, rh float64
		if p.Rect != nil {
			rx, ry, rw, rh = p.Rect.X, p.Rect.Y, p.Rect.W, p.Rect.H
		}
		var vw, vh int
		var dpr float64 = 1
		if p.Viewport != nil {
			vw, vh, dpr = p.Viewport.W, p.Viewport.H, p.Viewport.DPR
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO builder_issue_pins
			   (issue_id, ordinal, testid, css_path, aria_role, aria_name, text_hint, tag_name,
			    rect_x, rect_y, rect_w, rect_h, scroll_y, viewport_w, viewport_h, dpr,
			    href, strategies_verified)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
			id, i, truncate(p.Testid, 200), truncate(p.CSS, 512),
			truncate(p.Role, 64), truncate(p.Name, 200), truncate(p.Hint, 120),
			truncate(p.Tag, 40), rx, ry, rw, rh, p.ScrollY, vw, vh, dpr,
			truncate(p.Href, 2048), pgTextArray(p.Verified),
		); err != nil {
			return "", 0, fmt.Errorf("insert pin: %w", err)
		}
	}

	// Attachments share the issue's transaction: a report that references a
	// screenshot which was never stored is worse than one with no screenshot.
	stored, problems := s.saveAttachments(ctx, tx, id, form)
	if len(problems) > 0 {
		s.log.Warn("some attachments were rejected", "issue", number, "problems", problems)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,'created','anon',$2::jsonb)`,
		id, fmt.Sprintf(`{"source":"feedback","route":%q,"pins":%d,"attachments":%d,"context":%t}`,
			in.Route, len(in.Pins), len(stored), len(browserCtx) > 0),
	); err != nil {
		return "", 0, fmt.Errorf("insert activity: %w", err)
	}

	// Bucket per MINUTE, not per hour.
	//
	// The bucket granularity must be finer than the shortest window that reads
	// it. With an hourly bucket and a 10-minute burst window, `window_start`
	// sits at the top of the hour while the cutoff is `now() - 10 min`, so for
	// 50 minutes out of every 60 the bucket falls outside its own window and
	// the burst limit silently never fires.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO builder_feedback_rate (ip_hash, window_start, count)
		 VALUES ($1, date_trunc('minute', now()), 1)
		 ON CONFLICT (ip_hash, window_start) DO UPDATE SET count = builder_feedback_rate.count + 1`,
		ipHash,
	); err != nil {
		return "", 0, fmt.Errorf("record rate: %w", err)
	}

	return id, number, tx.Commit()
}

type issueRow struct {
	ID           string `json:"id"`
	Number       int64  `json:"number"`
	Title        string `json:"title"`
	Type         string `json:"type"`
	Status       string `json:"status"`
	Busy         bool   `json:"busy"`
	CommentCount int    `json:"commentCount"`
	// Agent is the agent currently holding the lease. Empty unless Busy.
	// "An agent is working on this" is far less useful than "amr is working on
	// this" — the operator wants to know WHO, so they can judge whether the
	// right specialist picked it up.
	Agent string `json:"agent,omitempty"`
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	route := r.URL.Query().Get("route")
	if route == "" {
		route = "/"
	}
	rows, err := s.db.QueryContext(r.Context(),
		// assignee_agent_id is the agent slug (builder_agents.slug is the key the
		// claim writes). It is reported ONLY while the lease is live: a stale
		// assignee on a finished issue would read as "still working".
		`SELECT id, number, title, type::text, status::text,
		        (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now()) AS busy,
		        comment_count,
		        CASE WHEN status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now()
		             THEN coalesce(assignee_agent_id, '') ELSE '' END AS agent
		   FROM builder_issues
		  WHERE route = $1 AND status <> 'rejected'
		  ORDER BY created_at DESC
		  LIMIT 50`, truncate(route, 512))
	if err != nil {
		s.log.Error("list issues", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list issues")
		return
	}
	defer rows.Close()

	out := make([]issueRow, 0, 16)
	for rows.Next() {
		var it issueRow
		if err := rows.Scan(&it.ID, &it.Number, &it.Title, &it.Type, &it.Status,
			&it.Busy, &it.CommentCount, &it.Agent); err != nil {
			s.log.Error("scan issue", "err", err)
			httpErr(w, http.StatusInternalServerError, "could not read issues")
			return
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not read issues")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"issues": out})
}

// ---------------------------------------------------------------------------

// originAllowed gates the unauthenticated ingress.
//
// Parses the Origin rather than matching substrings. An earlier version used
// `strings.HasSuffix(origin, "//"+host)`, which both rejected legitimate
// proxied requests (a dev server on :3000 forwarding to :8080 has Origin !=
// Host) and would have accepted a crafted origin that merely *ended* with the
// expected text.
func (s *Service) originAllowed(r *http.Request) bool {
	raw := r.Header.Get("Origin")
	if raw == "" {
		// No Origin: a non-browser client, or a same-origin navigation. There is
		// nothing to check, and browsers always send it for a cross-origin POST.
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return false
	}

	// Exact allowlist entry wins.
	if s.allowedOrigins[strings.ToLower(raw)] {
		return true
	}
	// Same origin as the request host.
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	// Development convenience: any loopback origin, whatever the port. A dev
	// server proxying to the API is the normal setup and must not need
	// configuration. Never enabled outside development.
	if s.dev && isLoopback(u.Hostname()) {
		return true
	}
	return false
}

func isLoopback(host string) bool {
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

func (s *Service) underRateLimit(ctx context.Context, ipHash string) (bool, error) {
	var windowCount, dayCount int
	err := s.db.QueryRowContext(ctx,
		`SELECT
		   coalesce(sum(count) FILTER (WHERE window_start > now() - $2::interval), 0),
		   coalesce(sum(count) FILTER (WHERE window_start > now() - interval '1 day'), 0)
		 FROM builder_feedback_rate WHERE ip_hash = $1`,
		ipHash, rateWindow.String()).Scan(&windowCount, &dayCount)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	return windowCount < rateBurst && dayCount < rateDaily, nil
}

// hashIP stores a hash, never the address: an issue tracker should not
// accumulate a log of who visited which page from where.
func hashIP(r *http.Request) string {
	ip := r.Header.Get("X-Forwarded-For")
	if i := strings.IndexByte(ip, ','); i >= 0 {
		ip = ip[:i]
	}
	if ip == "" {
		if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			ip = h
		} else {
			ip = r.RemoteAddr
		}
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(ip)))
	return hex.EncodeToString(sum[:16])
}

// rankFor produces a LexoRank-ish key that never ends in 'a', so a new rank can
// always be subdivided between any two neighbours.
func rankFor(n int64) string {
	return fmt.Sprintf("m%08dz", n)
}

// RankFor and Truncate are the exported faces of the two helpers above, for
// code that files issues from OUTSIDE this package — today, the wizard's
// plan-import pass in internal/fleet. Exposed as wrappers rather than letting
// callers re-implement them, because the rank format carries the board's
// subdivision invariant (never ends in 'a') and truncate carries the
// rune-boundary fix; a second copy of either would drift.
//
// TitleLimit and BodyLimit are the byte caps the columns are actually sized
// for, exported for the same reason — a caller inventing its own numbers
// would either reject titles this package accepts or trip the CHECK.
const (
	TitleLimit = maxTitleBytes
	BodyLimit  = maxBodyBytes
)

func RankFor(n int64) string          { return rankFor(n) }
func Truncate(s string, n int) string { return truncate(s, n) }

func localeOr(l string) string {
	if l == "" {
		return "en"
	}
	return truncate(l, 12)
}

// truncate cuts to at most n BYTES without splitting a character.
//
// Plain s[:n] cuts mid-rune whenever the boundary lands inside a multi-byte
// character, leaving invalid UTF-8. Postgres refuses to store that, so a pin
// whose captured text contained an emoji failed the INSERT and took the whole
// issue with it — "could not create the issue" for every report filed from that
// element. Arabic, which this product renders throughout, is multi-byte in its
// entirety, so this was never only an emoji problem.
//
// The limit stays in bytes because that is what the columns are sized in; only
// the cut point moves back to a character boundary.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

func pgTextArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	esc := make([]string, 0, len(xs))
	for _, x := range xs {
		esc = append(esc, `"`+strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(x)+`"`)
	}
	return "{" + strings.Join(esc, ",") + "}"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
