// Package notify pushes agent events to a logged-in admin in real time.
//
// SSE rather than WebSockets: the traffic is one-directional (server tells the
// browser something happened), SSE reconnects on its own, and it needs no
// protocol upgrade through whatever proxy sits in front. A WebSocket would be
// more machinery for a strictly simpler job.
package notify

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
)

// Event is one push.
type Event struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`     // decision_opened | run_finished | issue_moved | mention
	Severity string `json:"severity"` // info | warn | action_required
	Title    string `json:"title"`
	Preview  string `json:"preview"`
	Link     string `json:"link"`
	// Sound names a clip the browser plays. Empty means silent — most events
	// should be silent, or the alert stops meaning anything.
	Sound   string `json:"sound"`
	Urgency string `json:"urgency"`
	IssueID string `json:"issueId,omitempty"`
	At      string `json:"at"`
}

type subscriber struct {
	userID string
	ch     chan Event
}

type Service struct {
	db  *sql.DB
	log *slog.Logger

	mu   sync.RWMutex
	subs map[*subscriber]struct{}
}

func New(db *sql.DB, log *slog.Logger) *Service {
	return &Service{db: db, log: log, subs: map[*subscriber]struct{}{}}
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/events", s.handleStream)
	r.Get("/notifications", s.handleList)
	r.Post("/notifications/{id}/read", s.handleRead)
	r.Get("/decisions", s.handleDecisions)
	r.Post("/decisions/{id}/answer", s.handleAnswer)
}

// handleStream is the SSE endpoint.
func (s *Service) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Without this an nginx in front buffers the whole stream and nothing
	// arrives until the connection closes — which looks exactly like a bug.
	w.Header().Set("X-Accel-Buffering", "no")

	sub := &subscriber{userID: r.URL.Query().Get("user"), ch: make(chan Event, 16)}
	s.mu.Lock()
	s.subs[sub] = struct{}{}
	n := len(s.subs)
	s.mu.Unlock()
	s.log.Info("sse client connected", "subscribers", n)

	defer func() {
		s.mu.Lock()
		delete(s.subs, sub)
		s.mu.Unlock()
		close(sub.ch)
	}()

	fmt.Fprintf(w, "event: ready\ndata: {\"ok\":true}\n\n")
	flusher.Flush()

	// A comment every 25s keeps intermediaries from reaping an idle connection.
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev := <-sub.ch:
			b, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\nid: %s\ndata: %s\n\n", ev.Kind, ev.ID, b)
			flusher.Flush()
		}
	}
}

// Publish records the notification and pushes it to every live subscriber.
//
// The database write comes first: a browser that is closed must still find the
// notification waiting when it opens. SSE is the fast path, not the record.
func (s *Service) Publish(ctx context.Context, userID string, ev Event) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO builder_notifications
		   (recipient_user_id, kind, severity, title, preview, link, issue_id, sound, urgency)
		 VALUES (NULLIF($1,'')::uuid,$2,$3,$4,$5,$6,NULLIF($7,'')::uuid,$8,$9)
		 RETURNING id`,
		userID, ev.Kind, ev.Severity, ev.Title, ev.Preview, ev.Link,
		ev.IssueID, ev.Sound, ev.Urgency).Scan(&id)
	if err != nil {
		s.log.Error("record notification", "err", err)
		// Still push it — a live admin seeing the alert matters more than the row.
	}
	ev.ID = id
	ev.At = time.Now().UTC().Format(time.RFC3339)

	s.mu.RLock()
	defer s.mu.RUnlock()
	for sub := range s.subs {
		select {
		case sub.ch <- ev:
		default:
			// A slow client must never block an agent run. It will pick the
			// notification up from the database on reconnect.
			s.log.Warn("dropped an event for a slow subscriber")
		}
	}
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, kind, severity, title, preview, link, coalesce(issue_id::text,''),
		        sound, urgency, created_at, (read_at IS NOT NULL)
		   FROM builder_notifications ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not list notifications")
		return
	}
	defer rows.Close()
	type row struct {
		Event
		Read bool `json:"read"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if rows.Scan(&x.ID, &x.Kind, &x.Severity, &x.Title, &x.Preview, &x.Link,
			&x.IssueID, &x.Sound, &x.Urgency, &x.At, &x.Read) == nil {
			out = append(out, x)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": out})
}

func (s *Service) handleRead(w http.ResponseWriter, r *http.Request) {
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_notifications SET read_at = now() WHERE id = $1`,
		chi.URLParam(r, "id")); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not mark read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type decisionRow struct {
	ID          string   `json:"id"`
	IssueID     string   `json:"issueId"`
	IssueNumber int64    `json:"issueNumber"`
	IssueTitle  string   `json:"issueTitle"`
	AgentSlug   string   `json:"agentSlug"`
	Kind        string   `json:"kind"`
	Question    string   `json:"question"`
	Context     string   `json:"context"`
	Options     []string `json:"options"`
	Urgency     string   `json:"urgency"`
	AskedAt     string   `json:"askedAt"`
}

func (s *Service) handleDecisions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT d.id, d.issue_id, i.number, i.title, coalesce(d.agent_slug,''),
		        d.kind::text, d.question_md, d.context_md, d.urgency, d.asked_at
		   FROM builder_decisions d JOIN builder_issues i ON i.id = d.issue_id
		  WHERE d.state = 'pending' ORDER BY d.asked_at`)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not list decisions")
		return
	}
	defer rows.Close()
	out := []decisionRow{}
	for rows.Next() {
		var d decisionRow
		if rows.Scan(&d.ID, &d.IssueID, &d.IssueNumber, &d.IssueTitle, &d.AgentSlug,
			&d.Kind, &d.Question, &d.Context, &d.Urgency, &d.AskedAt) == nil {
			out = append(out, d)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"decisions": out})
}

// handleAnswer resolves a decision and unblocks the issue.
//
// Clearing blocked_on_decision_id is what actually releases the work: the claim
// statement joins against pending decisions, so until this runs the issue is
// structurally unclaimable rather than merely skipped.
func (s *Service) handleAnswer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in struct {
		Answer string `json:"answer"`
		State  string `json:"state"` // answered | approved | rejected
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	if strings.TrimSpace(in.Answer) == "" {
		httpErr(w, http.StatusUnprocessableEntity, "an answer is required")
		return
	}
	switch in.State {
	case "approved", "rejected", "answered":
	default:
		in.State = "answered"
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not answer")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var issueID string
	var agentSlug sql.NullString
	if err := tx.QueryRowContext(r.Context(),
		`UPDATE builder_decisions
		    SET state = $1::builder_decision_state, answer_text = $2, answered_at = now()
		  WHERE id = $3 AND state = 'pending'
		 RETURNING issue_id, agent_slug`,
		in.State, in.Answer, id).Scan(&issueID, &agentSlug); err != nil {
		httpErr(w, http.StatusNotFound, "no pending decision with that id")
		return
	}

	// Unblock and return the issue to the queue so an agent can pick it up.
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_issues
		    SET blocked_on_decision_id = NULL,
		        status = CASE WHEN status = 'blocked' THEN 'ready'::builder_issue_status ELSE status END,
		        human_only = false,
		        status_entered_at = now(), updated_at = now()
		  WHERE id = $1`, issueID); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not unblock the issue")
		return
	}

	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_comments (issue_id, author_kind, body_md)
		 VALUES ($1,'human',$2)`, issueID,
		"**Answered:** "+in.Answer); err == nil {
		_, _ = tx.ExecContext(r.Context(),
			`UPDATE builder_issues SET comment_count = comment_count + 1 WHERE id = $1`, issueID)
	}
	_, _ = tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,'unblocked','human',$2::jsonb)`,
		issueID, fmt.Sprintf(`{"state":%q}`, in.State))

	if err := tx.Commit(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not answer")
		return
	}

	s.log.Info("decision answered", "decision", id, "state", in.State, "agent", agentSlug.String)
	writeJSON(w, http.StatusOK, map[string]any{"answered": true, "issueId": issueID})
}

// NotifyDecision is what the orchestrator calls when an agent needs a human.
//
// This is the one event that always makes a sound: it is the only class where
// nothing proceeds until a person acts, so it is the only one that has earned
// the right to interrupt.
func (s *Service) NotifyDecision(ctx context.Context, userID string, issueID string, issueNumber int64, agent, question string) {
	s.Publish(ctx, userID, Event{
		Kind:     "decision_opened",
		Severity: "action_required",
		Title:    fmt.Sprintf("#%d needs your decision", issueNumber),
		Preview:  truncate(question, 160),
		Link:     fmt.Sprintf("/issues/%d", issueNumber),
		Sound:    "alert-blocked",
		Urgency:  "critical",
		IssueID:  issueID,
	})
}

// truncate cuts to at most n BYTES without splitting a character.
//
// Plain s[:n] cuts mid-rune when the boundary lands inside a multi-byte
// character, leaving invalid UTF-8 that Postgres refuses to store. See the
// note in internal/issues — an emoji in a pin failed every report from that
// element, and Arabic is multi-byte throughout.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n] + "…"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
