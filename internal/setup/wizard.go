// Package setup owns the welcome wizard.
//
// The wizard runs BEFORE the dashboard is usable. That ordering is the point:
// the fleet is generated from the operator's plan first, so by the time the
// first issue is filed there is already a team to work it. A dashboard that
// opens before the fleet exists just accumulates issues nothing will claim.
package setup

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/builder/internal/fleet"
	"github.com/togo-framework/builder/internal/runner"
)

// Steps, in order.
const (
	StepWelcome   = "welcome"
	StepPreflight = "preflight"
	StepPlan      = "plan"
	StepFleet     = "fleet"
	StepDone      = "done"
)

type Service struct {
	db  *sql.DB
	log *slog.Logger
	gen *fleet.Generator

	// Generation runs for minutes. It is held in memory and polled rather than
	// blocking an HTTP request, which would time out at every proxy in between.
	mu       sync.Mutex
	running  bool
	progress genProgress
}

type genProgress struct {
	Running bool      `json:"running"`
	Started time.Time `json:"started,omitempty"`
	Done    bool      `json:"done"`
	Err     string    `json:"error,omitempty"`
	Summary string    `json:"summary,omitempty"`
	Agents  int       `json:"agents"`
	Skills  int       `json:"skills"`
	CostUSD float64   `json:"costUsd"`
	// Stage and Step/Total make a ten-minute run legible instead of looking hung.
	Stage string `json:"stage,omitempty"`
	Step  int    `json:"step"`
	Total int    `json:"total"`
}

func New(db *sql.DB, log *slog.Logger, gen *fleet.Generator) *Service {
	return &Service{db: db, log: log, gen: gen}
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/state", s.handleState)
	r.Post("/preflight", s.handlePreflight)
	r.Post("/plan", s.handlePlan)
	r.Post("/generate", s.handleGenerate)
	r.Get("/generate/status", s.handleGenStatus)
	r.Post("/complete", s.handleComplete)
	r.Post("/reset", s.handleReset)
}

type state struct {
	Step      string          `json:"step"`
	Completed bool            `json:"completed"`
	PlanMD    string          `json:"planMd"`
	FleetName string          `json:"fleetName"`
	Agents    []agentSummary  `json:"agents"`
	Preflight json.RawMessage `json:"preflight,omitempty"`
	Progress  genProgress     `json:"progress"`
}

type agentSummary struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	Role        string `json:"role"`
	Model       string `json:"model"`
	Enabled     bool   `json:"enabled"`
	Namespace   string `json:"brainNamespace"`
	Memories    int    `json:"memories"`
}

func (s *Service) handleState(w http.ResponseWriter, r *http.Request) {
	st, err := s.load(r.Context())
	if err != nil {
		s.log.Error("load setup state", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not load setup state")
		return
	}
	s.mu.Lock()
	st.Progress = s.progress
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, st)
}

func (s *Service) load(ctx context.Context) (*state, error) {
	var st state
	var plan sql.NullString
	var pre []byte
	var completed sql.NullTime
	err := s.db.QueryRowContext(ctx,
		`SELECT step, plan_md, preflight, completed_at FROM builder_setup_state WHERE id='singleton'`,
	).Scan(&st.Step, &plan, &pre, &completed)
	if errors.Is(err, sql.ErrNoRows) {
		st.Step = StepWelcome
	} else if err != nil {
		return nil, err
	}
	st.PlanMD = plan.String
	st.Completed = completed.Valid
	if len(pre) > 0 {
		st.Preflight = json.RawMessage(pre)
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT a.slug, a.display_name, a.description, a.role::text, a.model, a.enabled,
		        coalesce(b.namespace,''), coalesce(b.memory_count,0)
		   FROM builder_agents a
		   LEFT JOIN builder_brains b ON b.agent_slug = a.slug
		  ORDER BY a.created_at`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var a agentSummary
			if rows.Scan(&a.Slug, &a.DisplayName, &a.Description, &a.Role,
				&a.Model, &a.Enabled, &a.Namespace, &a.Memories) == nil {
				st.Agents = append(st.Agents, a)
			}
		}
	}
	_ = s.db.QueryRowContext(ctx, `SELECT name FROM builder_fleets ORDER BY created_at LIMIT 1`).
		Scan(&st.FleetName)
	return &st, nil
}

// handlePreflight runs the probes and stores the report on the wizard row, so
// the operator's answer survives a reload and an auditor can see what the
// machine looked like when the project was set up.
func (s *Service) handlePreflight(w http.ResponseWriter, r *http.Request) {
	report := runner.Preflight(r.Context())
	raw, _ := json.Marshal(report)

	step := StepPreflight
	if report.OK() {
		step = StepPlan
	}
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_setup_state SET preflight=$1::jsonb, step=$2, updated_at=now()
		  WHERE id='singleton'`, string(raw), step); err != nil {
		s.log.Error("save preflight", "err", err)
	}

	code := http.StatusOK
	if !report.OK() {
		// The environment is not ready. Not a server error — nothing here failed.
		code = http.StatusFailedDependency
	}
	writeJSON(w, code, map[string]any{"report": report, "ok": report.OK(), "step": step})
}

func (s *Service) handlePlan(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Plan  string `json:"plan"`
		Fleet string `json:"fleet"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "malformed body")
		return
	}
	in.Plan = strings.TrimSpace(in.Plan)
	if len(in.Plan) < 40 {
		// A one-line plan produces a generic fleet, which is worse than none:
		// it looks like a team and behaves like a random assortment.
		httpErr(w, http.StatusUnprocessableEntity,
			"describe the project in a few sentences at least — the fleet is only as specific as the plan")
		return
	}
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_setup_state SET plan_md=$1, step=$2, updated_at=now() WHERE id='singleton'`,
		in.Plan, StepFleet); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not save the plan")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"step": StepFleet})
}

func (s *Service) handleGenerate(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		httpErr(w, http.StatusConflict, "generation is already running")
		return
	}
	s.running = true
	s.progress = genProgress{Running: true, Started: time.Now()}
	s.mu.Unlock()

	var plan, name string
	_ = s.db.QueryRowContext(r.Context(),
		`SELECT plan_md FROM builder_setup_state WHERE id='singleton'`).Scan(&plan)
	name = "default"
	if v := strings.TrimSpace(r.URL.Query().Get("fleet")); v != "" {
		name = v
	}

	// Detached: generation takes minutes and must survive the request.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Minute)
		defer cancel()

		m, cost, err := s.gen.Generate(ctx, name, plan, "",
			func(stage string, done, total int, spent float64) {
				s.mu.Lock()
				s.progress.Stage, s.progress.Step, s.progress.Total = stage, done, total
				s.progress.CostUSD = spent // visible while it runs, not only at the end
				s.mu.Unlock()
			})

		s.mu.Lock()
		s.running = false
		s.progress.Running = false
		s.progress.Done = true
		s.progress.Stage = "finished"
		s.progress.CostUSD = cost
		if err != nil {
			s.progress.Err = err.Error()
			s.log.Error("fleet generation failed", "err", err)
		} else {
			s.progress.Summary = m.Summary
			s.progress.Agents = len(m.Agents)
			s.progress.Skills = len(m.Skills)
		}
		s.mu.Unlock()
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{"started": true})
}

func (s *Service) handleGenStatus(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	p := s.progress
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, p)
}

func (s *Service) handleComplete(w http.ResponseWriter, r *http.Request) {
	var n int
	_ = s.db.QueryRowContext(r.Context(), `SELECT count(*) FROM builder_agents`).Scan(&n)
	if n == 0 {
		httpErr(w, http.StatusPreconditionFailed,
			"no agents exist yet — generate the fleet before finishing setup")
		return
	}
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_setup_state SET step=$1, completed_at=now(), updated_at=now()
		  WHERE id='singleton'`, StepDone); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not complete setup")
		return
	}
	s.log.Info("setup complete", "agents", n)
	writeJSON(w, http.StatusOK, map[string]any{"completed": true})
}

func (s *Service) handleReset(w http.ResponseWriter, r *http.Request) {
	if _, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_setup_state
		    SET step='welcome', completed_at=NULL, plan_md='', preflight='{}'::jsonb, updated_at=now()
		  WHERE id='singleton'`); err != nil {
		httpErr(w, http.StatusInternalServerError, "could not reset")
		return
	}
	s.mu.Lock()
	s.progress = genProgress{}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"reset": true})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
