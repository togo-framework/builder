package fleet

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

// The agents surface: a roster an operator can read, and a profile they can
// edit.
//
// The fleet is generated once by the wizard and was then unreachable — the only
// way to see who existed, what they owned, or whether one was mid-run was to
// query Postgres. An operator who cannot see the roster cannot tell that an
// area is unowned, that an agent is disabled, or that one has been burning
// budget on the same issue all afternoon.

type AgentsService struct {
	db  *sql.DB
	log *slog.Logger
}

func NewAgentsService(db *sql.DB, log *slog.Logger) *AgentsService {
	return &AgentsService{db: db, log: log}
}

func (s *AgentsService) Routes(r chi.Router) {
	r.Get("/agents", s.handleList)
	r.Get("/agents/{slug}", s.handleGet)
	r.Patch("/agents/{slug}", s.handlePatch)
}

type agentRow struct {
	Slug        string   `json:"slug"`
	DisplayName string   `json:"displayName"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Role        string   `json:"role"`
	Model       string   `json:"model"`
	Areas       []string `json:"areas"`
	Skills      []string `json:"skills"`
	Tools       []string `json:"tools"`
	Enabled     bool     `json:"enabled"`
	Color       string   `json:"color"`
	AvatarURL   string   `json:"avatarUrl"`
	MaxBudget   float64  `json:"maxBudgetUsd"`
	MaxTurns    int      `json:"maxTurns"`
	SpecPath    string   `json:"specPath"`
	Workdir     string   `json:"workdir"`
	HasBrain    bool     `json:"hasBrain"`
	Memories    int      `json:"memories"`
	LastRunAt   *string  `json:"lastRunAt"`

	// Live state, which is the thing an operator actually wants at a glance.
	Busy       bool    `json:"busy"`
	BusyIssue  *int64  `json:"busyIssue,omitempty"`
	Runs       int     `json:"runs"`
	SpendUSD   float64 `json:"spendUsd"`
	LastStatus string  `json:"lastStatus"`
}

const agentSelect = `
SELECT a.slug, a.display_name, a.title, a.description, a.role::text, a.model,
       a.areas, a.skills, a.tools, a.enabled, a.color, a.avatar_url,
       a.max_budget_usd, a.max_turns, a.spec_path, a.workdir,
       (a.brain_id IS NOT NULL) AS has_brain,
       coalesce((SELECT count(*) FROM builder_memories m
                  JOIN builder_brains b ON b.namespace = m.namespace
                 WHERE b.id = a.brain_id), 0) AS memories,
       to_char(a.last_run_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS last_run_at,
       -- A run is only "live" while it is actually running; a crashed runner's
       -- row would otherwise read as busy forever.
       -- Belt and braces with the reconciler: a run whose heartbeat has stopped
       -- must not pin an agent to "busy" on the roster even if a sweep is late.
       coalesce((SELECT count(*) > 0 FROM builder_runs r
                  WHERE r.agent_slug = a.slug AND r.status = 'running'
                    AND coalesce(r.heartbeat_at, r.started_at) > now() - interval '30 minutes'), false) AS busy,
       (SELECT i.number FROM builder_runs r
          JOIN builder_issues i ON i.id = r.issue_id
         WHERE r.agent_slug = a.slug AND r.status = 'running'
           AND coalesce(r.heartbeat_at, r.started_at) > now() - interval '30 minutes'
         ORDER BY r.started_at DESC LIMIT 1) AS busy_issue,
       coalesce((SELECT count(*) FROM builder_runs r WHERE r.agent_slug = a.slug), 0) AS runs,
       coalesce((SELECT sum(r.cost_usd) FROM builder_runs r WHERE r.agent_slug = a.slug), 0) AS spend,
       coalesce((SELECT r.status::text FROM builder_runs r
                  WHERE r.agent_slug = a.slug ORDER BY r.started_at DESC LIMIT 1), '') AS last_status
  FROM builder_agents a`

func (s *AgentsService) scan(rows *sql.Rows) (agentRow, error) {
	var a agentRow
	var areas, skills, tools sql.NullString
	var lastRun sql.NullString
	var busyIssue sql.NullInt64
	err := rows.Scan(&a.Slug, &a.DisplayName, &a.Title, &a.Description, &a.Role, &a.Model,
		&areas, &skills, &tools, &a.Enabled, &a.Color, &a.AvatarURL,
		&a.MaxBudget, &a.MaxTurns, &a.SpecPath, &a.Workdir, &a.HasBrain, &a.Memories, &lastRun,
		&a.Busy, &busyIssue, &a.Runs, &a.SpendUSD, &a.LastStatus)
	if err != nil {
		return a, err
	}
	a.Areas, a.Skills, a.Tools = parsePGArray(areas.String), parsePGArray(skills.String), parsePGArray(tools.String)
	if lastRun.Valid {
		v := lastRun.String
		a.LastRunAt = &v
	}
	if busyIssue.Valid {
		v := busyIssue.Int64
		a.BusyIssue = &v
	}
	return a, nil
}

func (s *AgentsService) handleList(w http.ResponseWriter, r *http.Request) {
	// Enabled first, then busy, then alphabetical: the roster is read top-down
	// and the agents that can actually take work belong at the top.
	rows, err := s.db.QueryContext(r.Context(), agentSelect+`
	 ORDER BY a.enabled DESC, a.slug ASC`)
	if err != nil {
		s.log.Error("list agents", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list agents")
		return
	}
	defer rows.Close()

	out := make([]agentRow, 0, 8)
	for rows.Next() {
		a, err := s.scan(rows)
		if err != nil {
			s.log.Error("scan agent", "err", err)
			httpErr(w, http.StatusInternalServerError, "could not read agents")
			return
		}
		out = append(out, a)
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": out})
}

type agentActivity struct {
	Kind      string  `json:"kind"`
	Status    string  `json:"status"`
	Issue     *int64  `json:"issue,omitempty"`
	Title     string  `json:"title"`
	Files     int     `json:"files"`
	Added     int     `json:"added"`
	Removed   int     `json:"removed"`
	CostUSD   float64 `json:"costUsd"`
	Branch    string  `json:"branch"`
	Terminal  string  `json:"terminal"`
	StartedAt string  `json:"startedAt"`
}

func (s *AgentsService) handleGet(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	rows, err := s.db.QueryContext(r.Context(), agentSelect+` WHERE a.slug = $1`, slug)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not load the agent")
		return
	}
	defer rows.Close()
	if !rows.Next() {
		httpErr(w, http.StatusNotFound, "no such agent")
		return
	}
	a, err := s.scan(rows)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not read the agent")
		return
	}
	rows.Close()

	// Its persona, and what it has actually been doing.
	var persona string
	_ = s.db.QueryRowContext(r.Context(),
		`SELECT persona_md FROM builder_agents WHERE slug = $1`, slug).Scan(&persona)

	arows, err := s.db.QueryContext(r.Context(),
		`SELECT r.kind::text, r.status::text, i.number, coalesce(i.title,''),
		        r.files_changed, r.lines_added, r.lines_removed, r.cost_usd,
		        coalesce(r.branch,''), coalesce(r.terminal_reason,''),
		        to_char(r.started_at, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM builder_runs r
		   LEFT JOIN builder_issues i ON i.id = r.issue_id
		  WHERE r.agent_slug = $1
		  ORDER BY r.started_at DESC
		  LIMIT 25`, slug)
	activity := make([]agentActivity, 0, 8)
	if err == nil {
		defer arows.Close()
		for arows.Next() {
			var it agentActivity
			var num sql.NullInt64
			if arows.Scan(&it.Kind, &it.Status, &num, &it.Title, &it.Files, &it.Added,
				&it.Removed, &it.CostUSD, &it.Branch, &it.Terminal, &it.StartedAt) != nil {
				continue
			}
			if num.Valid {
				v := num.Int64
				it.Issue = &v
			}
			activity = append(activity, it)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"agent": a, "persona": persona, "activity": activity,
	})
}

// patchAgent is the editable surface. Every field is a pointer so that "not
// sent" and "set to empty" stay distinguishable — sending {} must not wipe the
// persona.
type patchAgent struct {
	DisplayName *string   `json:"displayName"`
	Title       *string   `json:"title"`
	Description *string   `json:"description"`
	Model       *string   `json:"model"`
	Color       *string   `json:"color"`
	AvatarURL   *string   `json:"avatarUrl"`
	Enabled     *bool     `json:"enabled"`
	Areas       *[]string `json:"areas"`
	Skills      *[]string `json:"skills"`
	Persona     *string   `json:"persona"`
	MaxBudget   *float64  `json:"maxBudgetUsd"`
	MaxTurns    *int      `json:"maxTurns"`
	Workdir     *string   `json:"workdir"`
}

// Models the runner understands. An arbitrary string here would fail at spawn
// time, mid-run, after the issue was already claimed.
var allowedModels = map[string]bool{
	"haiku": true, "sonnet": true, "opus": true,
}

var colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *AgentsService) handlePatch(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var in patchAgent
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	sets := []string{}
	args := []any{}
	add := func(frag string, v any) {
		args = append(args, v)
		sets = append(sets, frag+"$"+itoa(len(args)))
	}

	if in.DisplayName != nil {
		if strings.TrimSpace(*in.DisplayName) == "" {
			httpErr(w, http.StatusUnprocessableEntity, "a name cannot be empty")
			return
		}
		add("display_name = ", truncate(*in.DisplayName, 120))
	}
	if in.Title != nil {
		add("title = ", truncate(*in.Title, 120))
	}
	if in.Description != nil {
		add("description = ", truncate(*in.Description, 2000))
	}
	if in.Model != nil {
		if !allowedModels[*in.Model] {
			httpErr(w, http.StatusUnprocessableEntity,
				"unknown model — use haiku, sonnet or opus")
			return
		}
		add("model = ", *in.Model)
	}
	if in.Color != nil {
		c := strings.TrimSpace(*in.Color)
		if c != "" && !colorRe.MatchString(c) {
			httpErr(w, http.StatusUnprocessableEntity, "colour must be #rrggbb")
			return
		}
		add("color = ", c)
	}
	if in.AvatarURL != nil {
		u := strings.TrimSpace(*in.AvatarURL)
		// http(s) or a same-origin path only. A data: or javascript: URL here
		// would be rendered into an <img src> on every roster row.
		if u != "" && !strings.HasPrefix(u, "https://") &&
			!strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "/") {
			httpErr(w, http.StatusUnprocessableEntity,
				"an avatar must be an http(s) URL or a path beginning with /")
			return
		}
		add("avatar_url = ", truncate(u, 500))
	}
	if in.Areas != nil {
		add("areas = ", encodePGArray(cleanList(*in.Areas, 40)))
	}
	if in.Skills != nil {
		add("skills = ", encodePGArray(cleanList(*in.Skills, 60)))
	}
	if in.Persona != nil {
		add("persona_md = ", *in.Persona)
	}
	if in.MaxBudget != nil {
		if *in.MaxBudget < 0 || *in.MaxBudget > 1000 {
			httpErr(w, http.StatusUnprocessableEntity, "a per-run budget must be between 0 and 1000")
			return
		}
		add("max_budget_usd = ", *in.MaxBudget)
	}
	if in.Workdir != nil {
		dir := strings.TrimSpace(*in.Workdir)
		// Absolute or empty. A relative path resolves against the API process's
		// cwd, which the operator cannot see and which changes with the deploy.
		if dir != "" && !strings.HasPrefix(dir, "/") {
			httpErr(w, http.StatusUnprocessableEntity,
				"a working directory must be an absolute path")
			return
		}
		add("workdir = ", truncate(dir, 500))
	}
	if in.MaxTurns != nil {
		// 2000 rather than 200. The old cap was a guess, and it bound before the
		// thing that actually matters: a run stops at whichever of turns or
		// budget it reaches first, and the per-run budget is the real circuit
		// breaker. Capping turns low just made long, cheap sessions fail for the
		// wrong reason.
		if *in.MaxTurns < 1 || *in.MaxTurns > 2000 {
			httpErr(w, http.StatusUnprocessableEntity, "turns must be between 1 and 2000")
			return
		}
		add("max_turns = ", *in.MaxTurns)
	}

	// Enabling is checked last because it depends on the row's final state: the
	// database CHECK requires an enabled builder to have a brain, and a 500 from
	// a constraint violation is a worse answer than saying why.
	if in.Enabled != nil {
		if *in.Enabled {
			var hasBrain bool
			var persona string
			if err := s.db.QueryRowContext(r.Context(),
				`SELECT brain_id IS NOT NULL, persona_md FROM builder_agents WHERE slug=$1`,
				slug).Scan(&hasBrain, &persona); err != nil {
				httpErr(w, http.StatusNotFound, "no such agent")
				return
			}
			if !hasBrain {
				httpErr(w, http.StatusUnprocessableEntity,
					"this agent has no brain yet, and an enabled builder must have one")
				return
			}
			if strings.TrimSpace(persona) == "" && (in.Persona == nil || strings.TrimSpace(*in.Persona) == "") {
				httpErr(w, http.StatusUnprocessableEntity,
					"give the agent a persona before enabling it — the dispatcher skips agents with an empty one")
				return
			}
		}
		add("enabled = ", *in.Enabled)
	}

	if len(sets) == 0 {
		httpErr(w, http.StatusBadRequest, "nothing to change")
		return
	}
	sets = append(sets, "updated_at = now()")
	args = append(args, slug)

	res, err := s.db.ExecContext(r.Context(),
		"UPDATE builder_agents SET "+strings.Join(sets, ", ")+
			" WHERE slug = $"+itoa(len(args)), args...)
	if err != nil {
		s.log.Error("patch agent", "slug", slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not save the agent")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such agent")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── helpers ────────────────────────────────────────────────────────────────

func cleanList(xs []string, max int) []string {
	out := make([]string, 0, len(xs))
	seen := map[string]bool{}
	for _, x := range xs {
		x = strings.ToLower(strings.TrimSpace(x))
		if x == "" || seen[x] || len(out) >= max {
			continue
		}
		seen[x] = true
		out = append(out, x)
	}
	return out
}

func encodePGArray(xs []string) string {
	if len(xs) == 0 {
		return "{}"
	}
	q := make([]string, len(xs))
	for i, x := range xs {
		q[i] = `"` + strings.ReplaceAll(strings.ReplaceAll(x, `\`, `\\`), `"`, `\"`) + `"`
	}
	return "{" + strings.Join(q, ",") + "}"
}

// parsePGArray decodes Postgres's text[] literal. generate.go owns pgArray,
// which ENCODES in the other direction — same name, opposite meaning.
func parsePGArray(s string) []string {
	if len(s) < 2 || s[0] != '{' || s[len(s)-1] != '}' {
		return []string{}
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return []string{}
	}
	out := []string{}
	cur, inQ := "", false
	for _, r := range s {
		switch {
		case r == '"':
			inQ = !inQ
		case r == ',' && !inQ:
			out = append(out, cur)
			cur = ""
		default:
			cur += string(r)
		}
	}
	return append(out, cur)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

var errNotFound = errors.New("not found")
