package skills

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// skillUse is one appearance of a skill in an agent's working context.
//
// Deliberately NOT called an invocation. The runner reads Claude Code with
// --output-format json, which returns the terminal result and says nothing
// about which tools were reached for inside the session. What is true, and all
// that is claimed here, is that the skill was loaded for that run.
type skillUse struct {
	Agent       string `json:"agent"`
	RunID       string `json:"runId"`
	IssueNumber int64  `json:"issueNumber"`
	IssueTitle  string `json:"issueTitle"`
	RunStatus   string `json:"runStatus"`
	LoadedAt    string `json:"loadedAt"`
}

type activityPage struct {
	Uses  []skillUse `json:"uses"`
	Total int        `json:"total"`
	// Agents that have ever loaded it, which answers a different question from
	// "agents who currently hold it" — a skill can be assigned to nobody today
	// and still have done work last week.
	Agents int `json:"agents"`
}

// handleActivity serves the usage log for one skill, newest first.
func (s *Service) handleActivity(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	var id string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT id FROM builder_skills WHERE name = $1`, name).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "no such skill")
		return
	}
	if err != nil {
		s.log.Error("find skill for activity", "skill", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill")
		return
	}

	limit, offset := 50, 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, e := strconv.Atoi(v); e == nil && n >= 0 {
			offset = n
		}
	}

	out := activityPage{
		// Allocated rather than nil: Go marshals a nil slice as null and the page
		// reads .length on it.
		Uses: make([]skillUse, 0, 16),
	}
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT count(*), count(DISTINCT agent_slug) FROM builder_skill_uses WHERE skill_id = $1`,
		id).Scan(&out.Total, &out.Agents); err != nil {
		s.log.Error("count skill uses", "skill", name, "err", err)
	}

	// LEFT JOINs throughout: a use row outlives the run and the issue it came
	// from (both are ON DELETE SET NULL), and losing the history when an issue
	// is deleted would defeat the point of keeping the log.
	rows, err := s.db.QueryContext(r.Context(), `
SELECT u.agent_slug,
       coalesce(u.run_id::text, ''),
       coalesce(u.issue_number, 0),
       coalesce(i.title, ''),
       coalesce(r.status::text, ''),
       btrim(to_json(u.loaded_at)::text, '"')
  FROM builder_skill_uses u
  LEFT JOIN builder_issues i ON i.id = u.issue_id
  LEFT JOIN builder_runs   r ON r.id = u.run_id
 WHERE u.skill_id = $1
 ORDER BY u.loaded_at DESC
 LIMIT $2 OFFSET $3`, id, limit, offset)
	if err != nil {
		s.log.Error("list skill uses", "skill", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill's activity")
		return
	}
	defer rows.Close()

	for rows.Next() {
		var u skillUse
		if err := rows.Scan(&u.Agent, &u.RunID, &u.IssueNumber, &u.IssueTitle,
			&u.RunStatus, &u.LoadedAt); err != nil {
			s.log.Error("scan skill use", "skill", name, "err", err)
			httpErr(w, http.StatusInternalServerError, "could not read the skill's activity")
			return
		}
		out.Uses = append(out.Uses, u)
	}
	if err := rows.Err(); err != nil {
		s.log.Error("iterate skill uses", "skill", name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not read the skill's activity")
		return
	}

	writeJSON(w, http.StatusOK, out)
}
