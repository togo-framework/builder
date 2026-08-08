package fleet

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

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
	r.Post("/agents", s.handleCreate)
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

// ── hiring ──────────────────────────────────────────────────────────────────

// newAgent is the hire form.
//
// Deliberately small: a slug, who they are, and what they own. Everything else
// has a working default, because an operator who has just realised they need a
// specialist should be able to create one in one step and refine it afterwards
// on the profile page.
type newAgent struct {
	Slug        string   `json:"slug"`
	DisplayName string   `json:"displayName"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Model       string   `json:"model"`
	Areas       []string `json:"areas"`
	Skills      []string `json:"skills"`
	Persona     string   `json:"persona"`
	Workdir     string   `json:"workdir"`
	Color       string   `json:"color"`
	Enabled     bool     `json:"enabled"`
}

// handleCreate hires a new agent into the fleet.
//
// The fleet used to be fixed at setup: generated once by the wizard, with no
// way to add to it. An operator who discovered a gap — nobody owns the app's
// UI, nobody owns search — had no move except editing Postgres by hand, and an
// agent asked to "hire a specialist" could only explain that it could not.
//
// Order matters and is not obvious: builder_brains.agent_slug is a foreign key
// to builder_agents, while an ENABLED builder must already have a brain. The
// two constraints point at each other, so the row is filled in three steps.
func (s *AgentsService) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in newAgent
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}

	in.Slug = strings.ToLower(strings.TrimSpace(in.Slug))
	if !slugRe.MatchString(in.Slug) {
		httpErr(w, http.StatusUnprocessableEntity,
			"a slug must be lowercase letters, digits and hyphens, starting with a letter")
		return
	}
	if in.Model == "" {
		in.Model = "sonnet"
	}
	if !allowedModels[in.Model] {
		httpErr(w, http.StatusUnprocessableEntity, "unknown model — use haiku, sonnet or opus")
		return
	}
	if strings.TrimSpace(in.DisplayName) == "" {
		in.DisplayName = in.Slug
	}
	areas := cleanList(in.Areas, 40)
	if len(areas) == 0 {
		httpErr(w, http.StatusUnprocessableEntity,
			"give the agent at least one area — an agent that owns nothing can never claim work")
		return
	}
	// Enabling requires a persona: the dispatcher skips agents whose persona is
	// empty, so an enabled one without it would sit idle looking healthy.
	if strings.TrimSpace(in.Persona) == "" {
		if in.Enabled {
			httpErr(w, http.StatusUnprocessableEntity,
				"an enabled agent needs a persona — it is the system prompt it runs with")
			return
		}
		in.Persona = defaultPersona(in)
	}
	if in.Color != "" && !colorRe.MatchString(in.Color) {
		httpErr(w, http.StatusUnprocessableEntity, "colour must be #rrggbb")
		return
	}
	if in.Workdir != "" && !strings.HasPrefix(in.Workdir, "/") {
		httpErr(w, http.StatusUnprocessableEntity, "a working directory must be an absolute path")
		return
	}

	var exists bool
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT true FROM builder_agents WHERE slug = $1`, in.Slug).Scan(&exists); err == nil {
		httpErr(w, http.StatusConflict, "an agent with that slug already exists")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not hire the agent")
		return
	}
	defer func() { _ = tx.Rollback() }()

	// 1. The agent, DISABLED — it has no brain yet, and the CHECK forbids an
	//    enabled builder without one.
	spec := ".claude/agents/" + in.Slug + ".md"
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO builder_agents
		   (slug, display_name, title, description, role, model, spec_path,
		    persona_md, areas, skills, workdir, color, enabled, generated_by)
		 VALUES ($1,$2,$3,$4,'builder',$5,$6,$7,$8,$9,$10,$11,false,'operator')`,
		in.Slug, truncate(in.DisplayName, 120), truncate(in.Title, 120),
		truncate(in.Description, 2000), in.Model, spec, in.Persona,
		encodePGArray(areas), encodePGArray(cleanList(in.Skills, 60)),
		truncate(in.Workdir, 500), in.Color); err != nil {
		s.log.Error("hire agent", "slug", in.Slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not hire the agent")
		return
	}

	// 2. Its brain. Isolated namespace, same shape the wizard produces.
	var brainID string
	if err := tx.QueryRowContext(r.Context(),
		`INSERT INTO builder_brains (agent_slug, namespace, embedding_dim)
		 VALUES ($1, 'default:'||$1, 1024) RETURNING id`, in.Slug).Scan(&brainID); err != nil {
		s.log.Error("create brain", "slug", in.Slug, "err", err)
		httpErr(w, http.StatusInternalServerError, "the agent was created but its brain was not")
		return
	}

	// 3. Link, and only now honour `enabled`.
	if _, err := tx.ExecContext(r.Context(),
		`UPDATE builder_agents SET brain_id = $1, enabled = $2 WHERE slug = $3`,
		brainID, in.Enabled, in.Slug); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not finish hiring the agent")
		return
	}
	if err := tx.Commit(); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not hire the agent")
		return
	}

	// The spec file is best-effort and written AFTER the commit: the database is
	// the source of truth for dispatch, and a read-only checkout must not stop an
	// operator from growing the fleet.
	s.writeSpec(in, spec)

	s.log.Info("hired an agent", "slug", in.Slug, "areas", areas, "enabled", in.Enabled)
	writeJSON(w, http.StatusCreated, map[string]any{
		"slug": in.Slug, "enabled": in.Enabled, "specPath": spec,
	})
}

// writeSpec mirrors the persona to .claude/agents/<slug>.md so the file tree and
// the database agree. Failure is logged, never fatal.
func (s *AgentsService) writeSpec(in newAgent, spec string) {
	repo := strings.TrimSpace(in.Workdir)
	if repo == "" {
		repo = os.Getenv("BUILDER_WORKDIR")
	}
	if repo == "" {
		return
	}
	full := filepath.Join(repo, spec)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		s.log.Warn("could not create the agents directory", "path", full, "err", err)
		return
	}
	if err := os.WriteFile(full, []byte(in.Persona), 0o644); err != nil {
		s.log.Warn("could not write the agent spec", "path", full, "err", err)
	}
}

// defaultPersona is the starting point for an agent hired without one.
//
// It is written to be edited, not to be used as-is: the areas are filled in, the
// boundaries are stated, and the parts only the operator knows are marked.
func defaultPersona(in newAgent) string {
	return fmt.Sprintf(`---
name: %s
description: "%s"
model: %s
tools: Read, Write, Edit, Grep, Glob, Bash
---

# %s

**Areas:** %s

%s

## What you own

Describe the files and surfaces this agent is responsible for. Be specific —
an agent that does not know its boundaries will edit a neighbour's code.

## What you do NOT own

List the areas that belong to other agents. If a report spans yours and
someone else's, do YOUR half and say plainly in the verdict which part belongs
to whom.

## How you work

1. **Reproduce first.** Confirm the problem is real before changing anything.
   If you cannot reproduce it, say so and stop.
2. Make the smallest change that fixes it.
3. Run the project's tests and state the exact command you ran.
4. If the fix needs a decision that is the operator's to make, stop and ask
   rather than guessing.
`, in.Slug, strings.ReplaceAll(in.Description, `"`, `'`), in.Model,
		orDefault(in.DisplayName, in.Slug), strings.Join(cleanList(in.Areas, 40), ", "),
		in.Description)
}

func orDefault(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}
