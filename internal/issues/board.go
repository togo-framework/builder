package issues

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Board columns, in display order. These are the `builder_issue_status` values
// a card can sit in; `triage` is included because a human needs to see what the
// triage agent has not classified yet.
var boardColumns = []string{"triage", "ready", "in_progress", "blocked", "in_review", "done", "rejected"}

type boardCard struct {
	ID           string   `json:"id"`
	Number       int64    `json:"number"`
	Title        string   `json:"title"`
	Type         string   `json:"type"`
	Status       string   `json:"status"`
	Priority     string   `json:"priority"`
	Area         string   `json:"area"`
	HumanOnly    bool     `json:"humanOnly"`
	Busy         bool     `json:"busy"`
	Source       string   `json:"source"`
	Route        string   `json:"route"`
	CommentCount int      `json:"commentCount"`
	VoteCount    int      `json:"voteCount"`
	Assignee     string   `json:"assignee"`
	Attempts     int      `json:"attempts"`
	Labels       []string `json:"labels"`
	CreatedAt    string   `json:"createdAt"`
}

func (s *Service) handleBoard(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT i.id, i.number, i.title, i.type::text, i.status::text, i.priority::text,
		        i.area, i.human_only,
		        (i.status = 'in_progress' AND i.lease_expires_at > now()) AS busy,
		        i.source, i.route, i.comment_count, i.vote_count,
		        coalesce(i.assignee_agent_id, '') AS assignee,
		        i.attempt_count, i.labels, i.created_at
		   FROM builder_issues i
		  ORDER BY
		    CASE i.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
		                    WHEN 'normal' THEN 2 ELSE 3 END,
		    i.board_rank
		  LIMIT 500`)
	if err != nil {
		s.log.Error("board query", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not load the board")
		return
	}
	defer rows.Close()

	// Pre-seed every column so an empty one still renders as a column rather
	// than vanishing from the board.
	cols := make(map[string][]boardCard, len(boardColumns))
	for _, c := range boardColumns {
		cols[c] = []boardCard{}
	}

	for rows.Next() {
		var c boardCard
		var labels sql.NullString
		if err := rows.Scan(&c.ID, &c.Number, &c.Title, &c.Type, &c.Status, &c.Priority,
			&c.Area, &c.HumanOnly, &c.Busy, &c.Source, &c.Route, &c.CommentCount,
			&c.VoteCount, &c.Assignee, &c.Attempts, &labels, &c.CreatedAt); err != nil {
			s.log.Error("board scan", "err", err)
			httpErr(w, http.StatusInternalServerError, "could not read the board")
			return
		}
		c.Labels = parsePGArray(labels.String)
		cols[c.Status] = append(cols[c.Status], c)
	}
	if err := rows.Err(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not read the board")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"columns": boardColumns, "cards": cols})
}

type pinOut struct {
	Testid   string   `json:"testid"`
	CSS      string   `json:"css"`
	Role     string   `json:"role"`
	Name     string   `json:"name"`
	Hint     string   `json:"hint"`
	Tag      string   `json:"tag"`
	Href     string   `json:"href"`
	Verified []string `json:"verified"`
	Resolved string   `json:"resolvedState"`
	Attempts int      `json:"resolveAttempts"`
	Hits     int      `json:"resolveHits"`
	RectX    float64  `json:"rectX"`
	RectY    float64  `json:"rectY"`
	RectW    float64  `json:"rectW"`
	RectH    float64  `json:"rectH"`
	ScrollY  int      `json:"scrollY"`
	Viewport [2]int   `json:"viewport"`
	DPR      float64  `json:"dpr"`
	Ordinal  int      `json:"ordinal"`
}

type commentOut struct {
	ID        string `json:"id"`
	Author    string `json:"author"`
	Kind      string `json:"kind"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

type activityOut struct {
	Action    string `json:"action"`
	ActorKind string `json:"actorKind"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

type issueDetail struct {
	boardCard
	Body     string        `json:"body"`
	PageURL  string        `json:"pageUrl"`
	Locale   string        `json:"locale"`
	Branch   string        `json:"branch"`
	PRURL    string        `json:"prUrl"`
	Pins     []pinOut      `json:"pins"`
	Comments []commentOut  `json:"comments"`
	Activity []activityOut `json:"activity"`
}

func (s *Service) handleDetail(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}

	var d issueDetail
	var labels sql.NullString
	err = s.db.QueryRowContext(r.Context(),
		`SELECT i.id, i.number, i.title, i.body_md, i.type::text, i.status::text,
		        i.priority::text, i.area, i.human_only,
		        (i.status = 'in_progress' AND i.lease_expires_at > now()) AS busy,
		        i.source, i.route, i.page_url, i.locale, i.branch, i.pr_url,
		        i.comment_count, i.vote_count, coalesce(i.assignee_agent_id,''),
		        i.attempt_count, i.labels, i.created_at
		   FROM builder_issues i WHERE i.number = $1`, num,
	).Scan(&d.ID, &d.Number, &d.Title, &d.Body, &d.Type, &d.Status, &d.Priority,
		&d.Area, &d.HumanOnly, &d.Busy, &d.Source, &d.Route, &d.PageURL, &d.Locale,
		&d.Branch, &d.PRURL, &d.CommentCount, &d.VoteCount, &d.Assignee,
		&d.Attempts, &labels, &d.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such issue")
		return
	}
	if err != nil {
		s.log.Error("issue detail", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not load the issue")
		return
	}
	d.Labels = parsePGArray(labels.String)
	d.Pins = s.loadPins(r, d.ID)
	d.Comments = s.loadComments(r, d.ID)
	d.Activity = s.loadActivity(r, d.ID)
	writeJSON(w, http.StatusOK, d)
}

func (s *Service) loadPins(r *http.Request, issueID string) []pinOut {
	out := []pinOut{}
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT ordinal, testid, css_path, aria_role, aria_name, text_hint, tag_name,
		        href, strategies_verified, resolved_state, resolve_attempts, resolve_hits,
		        rect_x, rect_y, rect_w, rect_h, scroll_y, viewport_w, viewport_h, dpr
		   FROM builder_issue_pins WHERE issue_id = $1 ORDER BY ordinal`, issueID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p pinOut
		var verified sql.NullString
		var vw, vh int
		if err := rows.Scan(&p.Ordinal, &p.Testid, &p.CSS, &p.Role, &p.Name, &p.Hint,
			&p.Tag, &p.Href, &verified, &p.Resolved, &p.Attempts, &p.Hits,
			&p.RectX, &p.RectY, &p.RectW, &p.RectH, &p.ScrollY, &vw, &vh, &p.DPR); err != nil {
			continue
		}
		p.Verified = parsePGArray(verified.String)
		p.Viewport = [2]int{vw, vh}
		out = append(out, p)
	}
	return out
}

func (s *Service) loadComments(r *http.Request, issueID string) []commentOut {
	out := []commentOut{}
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, coalesce(nullif(author_email,''), coalesce(author_agent_id,'someone')),
		        author_kind::text, body_md, created_at
		   FROM builder_issue_comments WHERE issue_id = $1 ORDER BY created_at`, issueID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c commentOut
		if err := rows.Scan(&c.ID, &c.Author, &c.Kind, &c.Body, &c.CreatedAt); err == nil {
			out = append(out, c)
		}
	}
	return out
}

func (s *Service) loadActivity(r *http.Request, issueID string) []activityOut {
	out := []activityOut{}
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT action, actor_kind::text, detail::text, created_at
		   FROM builder_issue_activity WHERE issue_id = $1 ORDER BY created_at DESC LIMIT 50`, issueID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var a activityOut
		if err := rows.Scan(&a.Action, &a.ActorKind, &a.Detail, &a.CreatedAt); err == nil {
			out = append(out, a)
		}
	}
	return out
}

// ---------------------------------------------------------------------------

// Legal status transitions.
//
// autopilot's equivalent validates membership only, so it happily accepts
// backlog -> done. A board that can skip review is not a review gate.
var transitions = map[string][]string{
	"triage":      {"ready", "rejected", "blocked"},
	"ready":       {"in_progress", "blocked", "rejected", "triage"},
	"in_progress": {"in_review", "blocked", "ready", "rejected"},
	"blocked":     {"ready", "rejected"},
	"in_review":   {"done", "in_progress", "blocked", "rejected"},
	"done":        {"ready"}, // reopen
	"rejected":    {"triage"},
}

func canTransition(from, to string) bool {
	if from == to {
		return true
	}
	for _, t := range transitions[from] {
		if t == to {
			return true
		}
	}
	return false
}

type patchIssue struct {
	Status    *string `json:"status,omitempty"`
	Priority  *string `json:"priority,omitempty"`
	Type      *string `json:"type,omitempty"`
	Area      *string `json:"area,omitempty"`
	HumanOnly *bool   `json:"humanOnly,omitempty"`
}

func (s *Service) handlePatch(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}
	var in patchIssue
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	var id, current string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT id, status::text FROM builder_issues WHERE number = $1`, num).Scan(&id, &current); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such issue")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not load the issue")
		return
	}

	sets := []string{"updated_at = now()"}
	args := []any{}
	n := 1
	add := func(frag string, v any) {
		sets = append(sets, frag+"$"+strconv.Itoa(n))
		args = append(args, v)
		n++
	}

	if in.Status != nil {
		if !canTransition(current, *in.Status) {
			httpErr(w, http.StatusConflict,
				"illegal transition "+current+" -> "+*in.Status)
			return
		}
		add("status = ", *in.Status)
		sets[len(sets)-1] += "::builder_issue_status"
		sets = append(sets, "status_entered_at = now()")
	}
	if in.Priority != nil {
		add("priority = ", *in.Priority)
		sets[len(sets)-1] += "::builder_issue_priority"
	}
	if in.Type != nil {
		add("type = ", *in.Type)
		sets[len(sets)-1] += "::builder_issue_type"
	}
	if in.Area != nil {
		add("area = ", truncate(*in.Area, 120))
	}
	if in.HumanOnly != nil {
		add("human_only = ", *in.HumanOnly)
	}
	if len(args) == 0 {
		httpErr(w, http.StatusBadRequest, "nothing to update")
		return
	}

	args = append(args, num)
	if _, err := s.db.ExecContext(r.Context(),
		"UPDATE builder_issues SET "+strings.Join(sets, ", ")+
			" WHERE number = $"+strconv.Itoa(n), args...); err != nil {
		s.log.Error("patch issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not update the issue")
		return
	}

	action := "edited"
	if in.Status != nil {
		action = "moved"
	}
	_, _ = s.db.ExecContext(r.Context(),
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind, detail)
		 VALUES ($1,$2,'human',$3::jsonb)`,
		id, action, `{"from":"`+current+`"}`)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type newComment struct {
	Body   string `json:"body"`
	Author string `json:"author"`
}

func (s *Service) handleComment(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}
	var in newComment
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	in.Body = strings.TrimSpace(in.Body)
	if in.Body == "" {
		httpErr(w, http.StatusUnprocessableEntity, "a comment needs a body")
		return
	}

	var id string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT id FROM builder_issues WHERE number = $1`, num).Scan(&id); err != nil {
		httpErr(w, http.StatusNotFound, "no such issue")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_comments (issue_id, author_kind, author_email, body_md)
		 VALUES ($1,'human',$2,$3)`,
		id, truncate(in.Author, 320), truncate(in.Body, maxBodyBytes)); err != nil {
		s.log.Error("insert comment", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	// Denormalized count keeps the board query from joining on every render.
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_issues SET comment_count = comment_count + 1, updated_at = now()
		 WHERE id = $1`, id); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_activity (issue_id, action, actor_kind)
		 VALUES ($1,'commented','human')`, id); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	if err := tx.Commit(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true})
}

// parsePGArray reads Postgres's text-array wire form: {a,b,"c d"}.
func parsePGArray(s string) []string {
	s = strings.TrimSpace(s)
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return []string{}
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return []string{}
	}
	out := []string{}
	var cur strings.Builder
	inQ, esc := false, false
	for _, r := range s {
		switch {
		case esc:
			cur.WriteRune(r)
			esc = false
		case r == '\\':
			esc = true
		case r == '"':
			inQ = !inQ
		case r == ',' && !inQ:
			out = append(out, cur.String())
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	out = append(out, cur.String())
	return out
}

// handleDelete removes an issue and everything hanging off it.
//
// Hard delete, not a soft flag: the `rejected` column already exists for "we
// looked and it is not work", so a second, invisible dead state would just be
// a place for rows to accumulate unseen. Cascades handle comments, pins,
// attachments and activity.
func (s *Service) handleDelete(w http.ResponseWriter, r *http.Request) {
	num, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil {
		httpErr(w, http.StatusBadRequest, "not an issue number")
		return
	}

	// Refuse while an agent holds a live lease: deleting the row out from under
	// a running session leaves an orphaned worktree and a branch nobody owns.
	var busy bool
	var id string
	err = s.db.QueryRowContext(r.Context(),
		`SELECT id, (status = 'in_progress' AND lease_expires_at > now())
		   FROM builder_issues WHERE number = $1`, num).Scan(&id, &busy)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such issue")
		return
	}
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not load the issue")
		return
	}
	if busy {
		httpErr(w, http.StatusConflict,
			"an agent is working on this issue; cancel the run before deleting it")
		return
	}

	if _, err := s.db.ExecContext(r.Context(),
		`DELETE FROM builder_issues WHERE number = $1`, num); err != nil {
		s.log.Error("delete issue", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete the issue")
		return
	}
	s.log.Info("issue deleted", "issue", num)
	w.WriteHeader(http.StatusNoContent)
}

// handleBulkDelete clears many at once — the realistic need after testing.
func (s *Service) handleBulkDelete(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Numbers []int64 `json:"numbers"`
		Status  string  `json:"status"` // or: everything in one column
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	var res sql.Result
	var err error
	switch {
	case len(in.Numbers) > 0:
		res, err = s.db.ExecContext(r.Context(),
			`DELETE FROM builder_issues
			  WHERE number = ANY($1::bigint[])
			    AND NOT (status = 'in_progress' AND lease_expires_at > now())`,
			pgInt64Array(in.Numbers))
	case in.Status != "":
		res, err = s.db.ExecContext(r.Context(),
			`DELETE FROM builder_issues
			  WHERE status = $1::builder_issue_status
			    AND NOT (status = 'in_progress' AND lease_expires_at > now())`, in.Status)
	default:
		httpErr(w, http.StatusBadRequest, "pass numbers[] or status")
		return
	}
	if err != nil {
		s.log.Error("bulk delete", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not delete")
		return
	}
	n, _ := res.RowsAffected()
	s.log.Info("bulk delete", "count", n)
	writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
}

func pgInt64Array(xs []int64) string {
	parts := make([]string, 0, len(xs))
	for _, x := range xs {
		parts = append(parts, strconv.FormatInt(x, 10))
	}
	return "{" + strings.Join(parts, ",") + "}"
}
