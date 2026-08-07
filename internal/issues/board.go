package issues

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/togo-framework/auth"
	"net/http"
	"regexp"
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
		        (i.status = 'in_progress' AND i.lease_expires_at IS NOT NULL AND i.lease_expires_at > now()) AS busy,
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
		        (i.status = 'in_progress' AND i.lease_expires_at IS NOT NULL AND i.lease_expires_at > now()) AS busy,
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
		// Name each author by what it actually is. The old expression fell all
		// the way through to the literal 'someone' whenever the email was blank,
		// which — since nothing recorded an email or an agent slug — was every
		// single comment.
		`SELECT id,
		        CASE author_kind
		          WHEN 'agent'  THEN coalesce(nullif(author_agent_id,''), 'an agent')
		          WHEN 'system' THEN 'builder'
		          ELSE coalesce(nullif(author_email,''), 'anonymous')
		        END,
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
	// Assignee is an agent slug, or "" to unassign. Assigning to a person is
	// expressed as humanOnly — there is no per-user assignment, because the
	// dispatcher's question is only ever "may an agent take this, and which".
	Assignee *string `json:"assignee,omitempty"`
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
	clearHumanOnly := false
	if in.Assignee != nil {
		// Refuse while an agent holds a live lease. Reassigning mid-run does not
		// stop the agent that is actually working — it just makes the row lie
		// about who owns the issue, and the finishing run (fenced by its claim
		// token) then writes results that contradict the assignee. Same reason
		// delete refuses here.
		var leased bool
		if err := s.db.QueryRowContext(r.Context(),
			`SELECT status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now()
			   FROM builder_issues WHERE id = $1`, id).Scan(&leased); err == nil && leased {
			httpErr(w, http.StatusConflict,
				"an agent is working on this right now — wait for the run to finish before reassigning")
			return
		}
		slug := strings.TrimSpace(*in.Assignee)
		if slug != "" {
			// Must exist AND be able to work: pinning an issue to a disabled or
			// brainless agent silently parks it, because the dispatcher only
			// considers enabled builders and the claim requires the assignee to
			// match. Better to refuse with a reason.
			var ok bool
			if err := s.db.QueryRowContext(r.Context(),
				`SELECT enabled AND role = 'builder' AND persona_md <> ''
				   FROM builder_agents WHERE slug = $1`, slug).Scan(&ok); err != nil {
				httpErr(w, http.StatusUnprocessableEntity, "no such agent")
				return
			}
			if !ok {
				httpErr(w, http.StatusUnprocessableEntity,
					"that agent cannot take work — enable it first, and give it a persona")
				return
			}
			// An issue cannot be both human-only and assigned to an agent, so
			// assigning clears the flag. Recorded as an intent rather than
			// appended to `sets` here: the caller usually sends humanOnly in the
			// same PATCH (the assignee control is one dropdown covering both),
			// and emitting the column twice makes Postgres reject the whole
			// statement with "multiple assignments to same column".
			clearHumanOnly = true
		}
		add("assignee_agent_id = ", nullIfEmpty(slug))
	}
	switch {
	case in.HumanOnly != nil && clearHumanOnly:
		// Assigning to an agent wins: it is the more specific instruction, and
		// the two together are contradictory.
		add("human_only = ", false)
	case in.HumanOnly != nil:
		add("human_only = ", *in.HumanOnly)
	case clearHumanOnly:
		add("human_only = ", false)
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
	Body string `json:"body"`
	// Author is accepted for backwards compatibility and DELIBERATELY IGNORED.
	// Identity is taken from the session: a client-supplied name is a claim, not
	// a fact, and anyone could post as anyone. The SDK sends "" here anyway,
	// which is how every human comment ended up displayed as "someone".
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

	userID, email := s.actorFrom(r)
	mentioned := s.resolveMentions(r.Context(), in.Body)
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_issue_comments (issue_id, author_kind, author_user_id, author_email, body_md, mentions)
		 VALUES ($1,'human',$2,$3,$4,$5)`,
		id, nullIfEmpty(userID), email, truncate(in.Body, maxBodyBytes),
		encodeArray(mentioned)); err != nil {
		s.log.Error("insert comment", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not comment")
		return
	}
	// Denormalized count keeps the board query from joining on every render.
	//
	// A human comment also WAKES a blocked issue. Answering an agent's question
	// used to change nothing but a counter: the issue stayed blocked, no agent
	// could claim it, and the reply sat there unread forever — which reads to
	// the operator as "the agent ignored me".
	//
	// Deliberately narrow. It only revives an issue that is blocked with no
	// pending decision (a real decision has its own answer flow), never one
	// marked human_only (the operator said agents must keep out), and it clears
	// attempt_count so the clarification actually gets a run rather than hitting
	// an already-exhausted budget.
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_issues
		    SET comment_count = comment_count + 1, updated_at = now(),
		        status = CASE
		          WHEN status = 'blocked' AND human_only = false
		               AND blocked_on_decision_id IS NULL
		          THEN 'ready'::builder_issue_status ELSE status END,
		        attempt_count = CASE
		          WHEN status = 'blocked' AND human_only = false
		               AND blocked_on_decision_id IS NULL
		          THEN 0 ELSE attempt_count END,
		        status_entered_at = CASE
		          WHEN status = 'blocked' AND human_only = false
		               AND blocked_on_decision_id IS NULL
		          THEN now() ELSE status_entered_at END
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

	// Routing on a mention happens AFTER the commit: the comment is the record
	// and must survive even if the routing update fails.
	if routed := s.assignFromMention(r.Context(), id, mentioned); routed != "" {
		s.log.Info("routed by mention", "issue", num, "agent", routed)
		_, _ = s.db.ExecContext(r.Context(),
			`INSERT INTO builder_issue_comments (issue_id, author_kind, body_md)
			 VALUES ($1,'system',$2)`,
			id, "**Assigned to `"+routed+"`** — named in the comment above.")
		_, _ = s.db.ExecContext(r.Context(),
			`UPDATE builder_issues SET comment_count = comment_count + 1 WHERE id = $1`, id)
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
		`SELECT id, (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now())
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
			    AND NOT (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now())`,
			pgInt64Array(in.Numbers))
	case in.Status != "":
		res, err = s.db.ExecContext(r.Context(),
			`DELETE FROM builder_issues
			  WHERE status = $1::builder_issue_status
			    AND NOT (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now())`, in.Status)
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

// actorFrom resolves who is making this request, from the session only.
//
// SOFT authentication: these routes are deliberately not behind auth.Middleware,
// because the SDK posts feedback from the host page with no session at all.
// So the token is resolved when present and the request proceeds either way —
// an unattributed comment says "anonymous", which is honest, rather than
// borrowing whatever name the caller put in the request body.
//
// IdentityFrom is checked first in case a future mount does sit behind the
// middleware; otherwise the token is verified directly.
func (s *Service) actorFrom(r *http.Request) (userID, email string) {
	if id, ok := auth.IdentityFrom(r.Context()); ok && id != nil {
		return id.ID, displayName(id)
	}
	if s.auth == nil {
		return "", "anonymous"
	}
	tok := ""
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		tok = strings.TrimSpace(h[7:])
	}
	if tok == "" {
		if c, err := r.Cookie(auth.SessionCookie); err == nil {
			tok = c.Value
		}
	}
	if tok == "" {
		return "", "anonymous"
	}
	id, err := s.auth.Verify(tok)
	if err != nil || id == nil {
		// A session store keeps an opaque id in the cookie rather than the
		// token, so this legitimately fails; "anonymous" is the safe answer.
		return "", "anonymous"
	}
	return id.ID, displayName(id)
}

func displayName(id *auth.Identity) string {
	if id.Email == "" {
		return "a signed-in user"
	}
	return truncate(id.Email, 320)
}

// nullIfEmpty keeps a uuid column NULL rather than storing "", which would fail
// the type cast.
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// mentionRe matches @slug. Slugs are lowercase with hyphens, which keeps this
// from matching an email address's local part or a decorative "@" in prose.
var mentionRe = regexp.MustCompile(`(^|[^\w@/])@([a-z][a-z0-9-]{1,63})\b`)

// resolveMentions returns the agent slugs named in a comment that actually
// exist. Unknown handles are dropped rather than stored: a mentions array full
// of typos would make "who was asked" unanswerable, and the wake logic below
// would have nothing to act on.
func (s *Service) resolveMentions(ctx context.Context, body string) []string {
	ms := mentionRe.FindAllStringSubmatch(body, -1)
	if len(ms) == 0 {
		return nil
	}
	want := make([]string, 0, len(ms))
	seen := map[string]bool{}
	for _, m := range ms {
		if !seen[m[2]] {
			seen[m[2]] = true
			want = append(want, m[2])
		}
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT slug FROM builder_agents WHERE slug = ANY($1::text[])`, encodeArray(want))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var slug string
		if rows.Scan(&slug) == nil {
			out = append(out, slug)
		}
	}
	return out
}

// assignFromMention hands the issue to the first mentioned agent that can
// actually take it.
//
// A mention is a request, so it routes as well as records: naming an agent in a
// comment is the most direct way an operator can say "you, specifically". It is
// skipped while a lease is live (the running agent owns the issue) and for
// human-only issues (the operator already said agents keep out).
func (s *Service) assignFromMention(ctx context.Context, issueID string, mentioned []string) string {
	if len(mentioned) == 0 {
		return ""
	}
	var slug string
	err := s.db.QueryRowContext(ctx,
		`SELECT a.slug FROM builder_agents a
		  WHERE a.slug = ANY($1::text[])
		    AND a.enabled AND a.role = 'builder' AND a.persona_md <> ''
		  ORDER BY array_position($1::text[], a.slug)
		  LIMIT 1`, encodeArray(mentioned)).Scan(&slug)
	if err != nil || slug == "" {
		return ""
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE builder_issues
		    SET assignee_agent_id = $1, human_only = false, updated_at = now(),
		        status = CASE WHEN status = 'blocked' AND blocked_on_decision_id IS NULL
		                      THEN 'ready'::builder_issue_status ELSE status END,
		        attempt_count = CASE WHEN status = 'blocked' AND blocked_on_decision_id IS NULL
		                             THEN 0 ELSE attempt_count END
		  WHERE id = $2
		    AND human_only = false
		    AND NOT (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at > now())`,
		slug, issueID)
	if err != nil {
		return ""
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ""
	}
	return slug
}

func encodeArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	q := make([]string, len(xs))
	for i, x := range xs {
		q[i] = `"` + strings.ReplaceAll(strings.ReplaceAll(x, `\`, `\\`), `"`, `\"`) + `"`
	}
	return "{" + strings.Join(q, ",") + "}"
}
