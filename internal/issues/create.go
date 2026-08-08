package issues

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Filing an issue by hand, from the board.
//
// Everything on the board arrived through /feedback — the widget's public
// ingress: multipart, origin-checked, IP rate-limited, and shaped around a
// reporter standing on a page with elements pinned. That is the right design
// for a stranger reporting a bug on your product and the wrong one for the
// operator who is already signed in, looking at the board, and wants to write
// down a piece of work. There was no way to do the second thing at all.
//
// So: a JSON endpoint alongside it. Same table, same numbering, but it accepts
// the fields the board actually sorts by — priority, area, human-only — which
// the widget has no business collecting from a passer-by.

type manualIssue struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Priority  string `json:"priority"`
	Area      string `json:"area"`
	HumanOnly bool   `json:"humanOnly"`
	// Optional. A hand-filed issue is usually not about a page, so this is blank
	// far more often than not — unlike everything the widget files.
	Route string `json:"route"`
}

var validPriority = map[string]bool{
	"low": true, "normal": true, "high": true, "critical": true,
}

// handleCreate files an issue directly, with no page and no reporter.
func (s *Service) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in manualIssue
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed issue")
		return
	}

	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" {
		httpErr(w, http.StatusUnprocessableEntity, "give the issue a title")
		return
	}
	// Byte-truncation on rune boundaries. The board has already had one 500 from
	// slicing a title mid-emoji, and an operator writing Arabic is entirely
	// multi-byte.
	in.Title = truncate(in.Title, maxTitleBytes)
	in.Body = truncate(strings.TrimSpace(in.Body), maxBodyBytes)

	if !validType[in.Type] {
		in.Type = "bug"
	}
	if !validPriority[in.Priority] {
		in.Priority = "normal"
	}
	area := truncate(strings.TrimSpace(in.Area), 120)
	route := truncate(strings.TrimSpace(in.Route), 512)

	var number int64
	var id string

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		s.log.Error("begin manual issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// Same counter as the widget's path, so hand-filed and reported issues share
	// one sequence. Two sequences would mean two issues called #12.
	if err := tx.QueryRowContext(r.Context(),
		`INSERT INTO builder_issue_counters (scope, next_seq) VALUES ('default', 2)
		 ON CONFLICT (scope) DO UPDATE SET next_seq = builder_issue_counters.next_seq + 1
		 RETURNING next_seq - 1`).Scan(&number); err != nil {
		s.log.Error("allocate issue number", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}

	// status 'triage', like everything else: an operator filing work still wants
	// the triage agent to route it to an area and an owner. Setting it 'ready'
	// here would hand it straight to whichever agent polls first.
	if err := tx.QueryRowContext(r.Context(),
		`INSERT INTO builder_issues
		   (number, title, body_md, status, type, priority, area, human_only,
		    board_rank, source, route, page_url, locale, reporter_kind)
		 -- source 'manual' and reporter_kind 'human'. Both are constrained —
		 -- source by a CHECK (manual|feedback|self_heal|agent|import) and
		 -- reporter_kind by the builder_actor_kind enum (human|agent|anon|system)
		 -- — and 'operator', which is what this path is called everywhere else,
		 -- is a member of neither.
		 VALUES ($1,$2,$3,'triage',$4::builder_issue_type,$5::builder_issue_priority,
		         $6,$7,$8,'manual',$9,'','en','human')
		 RETURNING id`,
		number, in.Title, in.Body, in.Type, in.Priority, area, in.HumanOnly,
		rankFor(number), route,
	).Scan(&id); err != nil {
		s.log.Error("insert manual issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}

	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,'created','human','{"via":"board"}'::jsonb)`, id); err != nil {
		s.log.Error("record manual issue activity", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}

	if err := tx.Commit(); err != nil {
		s.log.Error("commit manual issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not create the issue")
		return
	}

	s.log.Info("issue filed from the board", "issue", number, "type", in.Type,
		"priority", in.Priority, "area", area, "humanOnly", in.HumanOnly)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "number": number})
}
