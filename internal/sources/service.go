package sources

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// The operator's view of a source.
//
// Everything in this package was reachable by nothing before this file existed:
// the registry could construct a GitHub connector, the scheduler could lease and
// run one, and no route anywhere let a person create the row that would make
// either happen. A subsystem with no surface is indistinguishable from one that
// was never written.
//
// Deliberately absent: any endpoint that returns `config` for a kind that could
// hold a credential. config is written, never read back — see handleList.

// maxNameBytes mirrors the CHECK in 0011_sources.sql, so a bad request is
// answered with a sentence rather than a constraint violation dressed as a 500.
const maxNameBytes = 200

type view struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"`
	Name        string     `json:"name"`
	Namespace   string     `json:"namespace"`
	Schedule    string     `json:"schedule"`
	Enabled     bool       `json:"enabled"`
	NextRunAt   time.Time  `json:"nextRunAt"`
	LastRunAt   *time.Time `json:"lastRunAt"`
	LastStatus  string     `json:"lastStatus"`
	LastError   string     `json:"lastError"`
	Failures    int        `json:"consecutiveFailures"`
	TotalRuns   int64      `json:"totalRuns"`
	TotalAdded  int64      `json:"totalAdded"`
	CreatedAt   time.Time  `json:"createdAt"`
	Description string     `json:"description"`
}

// Routes mounts the source surface. Read and write are both admin-only at the
// mount point: a source holds the name of a vault secret and a target brain
// namespace, and creating one is how an operator points this system at somebody
// else's database.
func (s *Store) Routes(r chi.Router) {
	r.Get("/", s.handleList)
	r.Get("/kinds", s.handleKinds)
	r.Post("/", s.handleCreate)
	r.Get("/{id}/runs", s.handleRuns)
	r.Post("/{id}/refresh", s.handleRefresh)
	r.Patch("/{id}", s.handlePatch)
	r.Delete("/{id}", s.handleDelete)
}

// handleKinds lists what this build can actually run.
//
// Read from the registry rather than from a hardcoded list, so a kind that has
// been compiled in but not registered — the exact failure that left the GitHub
// connector unreachable — shows up as an absence here instead of as a source
// that saves fine and never runs.
func (s *Store) handleKinds(w http.ResponseWriter, r *http.Request) {
	kinds := Kinds()
	// The whole-result kinds are dispatched by execute() rather than the
	// registry, so they are not in Kinds() and would otherwise be unofferable.
	kinds = append(kinds, "sql")
	writeJSON(w, http.StatusOK, map[string]any{"kinds": kinds})
}

func (s *Store) handleList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		// config is NOT selected. For kind='sql' it names a vault secret, and
		// for a webhook it holds the signing secret's name; neither belongs in
		// a list payload that a browser will cache. An operator who needs to
		// change one sends a new value rather than reading the old.
		`SELECT id, kind, name, namespace, schedule, enabled, next_run_at,
		        last_run_at, last_status, last_error, consecutive_failures,
		        total_runs, total_added, created_at
		   FROM builder_sources ORDER BY kind, name`)
	if err != nil {
		s.log.Error("list sources", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not list the sources")
		return
	}
	defer rows.Close()

	out := []view{}
	for rows.Next() {
		var v view
		if err := rows.Scan(&v.ID, &v.Kind, &v.Name, &v.Namespace, &v.Schedule,
			&v.Enabled, &v.NextRunAt, &v.LastRunAt, &v.LastStatus, &v.LastError,
			&v.Failures, &v.TotalRuns, &v.TotalAdded, &v.CreatedAt); err != nil {
			s.log.Error("scan source", "err", Scrub(err.Error()))
			httpErr(w, http.StatusInternalServerError, "could not read the sources")
			return
		}
		v.Description = describe(v)
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sources": out})
}

// describe says in one sentence what an operator most wants to know: is this
// thing working, and when does it next run. Assembled server-side so every
// surface says the same thing about the same row.
func describe(v view) string {
	switch {
	case !v.Enabled:
		return "Off. Nothing is collected until you turn it on."
	case v.LastStatus == "error" && v.Failures > 1:
		return fmt.Sprintf("Failing — %d runs in a row. Retries are backing off.", v.Failures)
	case v.LastStatus == "error":
		return "Last run failed. It will be retried on the next schedule."
	case v.LastRunAt == nil:
		return "On, and has not run yet."
	default:
		return fmt.Sprintf("Collected %d times. Next run %s.",
			v.TotalRuns, humanUntil(time.Until(v.NextRunAt)))
	}
}

func humanUntil(d time.Duration) string {
	switch {
	case d <= 0:
		return "is due now"
	case d < time.Minute:
		return "in under a minute"
	case d < time.Hour:
		return fmt.Sprintf("in %d minutes", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("in %d hours", int(d.Hours()))
	default:
		return fmt.Sprintf("in %d days", int(d.Hours()/24))
	}
}

type createReq struct {
	Kind      string          `json:"kind"`
	Name      string          `json:"name"`
	Namespace string          `json:"namespace"`
	Schedule  string          `json:"schedule"`
	Config    json.RawMessage `json:"config"`
	Enabled   bool            `json:"enabled"`
}

func (s *Store) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in createReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	in.Kind = strings.TrimSpace(in.Kind)
	in.Name = strings.TrimSpace(in.Name)
	in.Namespace = strings.TrimSpace(in.Namespace)

	if in.Kind == "" || in.Name == "" {
		httpErr(w, http.StatusUnprocessableEntity, "a source needs a kind and a name")
		return
	}
	if len(in.Name) > maxNameBytes {
		httpErr(w, http.StatusUnprocessableEntity, "that name is too long — keep it under 200 characters")
		return
	}
	// Refuse a kind nothing can run, at the point of creation. Saving it would
	// produce a row that looks configured, is claimed on every pass, and fails
	// with "no runner for source kind" forever.
	if !isPlugin(in.Kind) && in.Kind != "sql" {
		httpErr(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("no runner for %q — this build knows: %s, sql",
				in.Kind, strings.Join(Kinds(), ", ")))
		return
	}
	// A source writes into the project brain and nowhere else. Letting one
	// target an agent's private namespace would put unvetted external content
	// where no other agent can see it and no operator thinks to look — the same
	// rule ingestion applies to an uploaded document.
	if !strings.HasSuffix(in.Namespace, ":project") {
		httpErr(w, http.StatusUnprocessableEntity,
			"a source must collect into a project brain (a \"<fleet>:project\" namespace), not an agent's private one")
		return
	}
	if len(in.Config) == 0 {
		in.Config = json.RawMessage(`{}`)
	}
	if in.Schedule == "" {
		in.Schedule = "@hourly"
	}
	// Validate the config by building the thing it configures. A connector that
	// cannot be opened is a source that will fail on a schedule at 3am instead
	// of in the form the operator is looking at.
	if isPlugin(in.Kind) {
		if _, err := Open(in.Kind, in.Config, sourceSecrets{v: s.vault, kind: in.Kind, name: in.Name}); err != nil {
			httpErr(w, http.StatusUnprocessableEntity, "that configuration is not valid: "+Scrub(err.Error()))
			return
		}
	}

	var id string
	err := s.db.QueryRowContext(r.Context(),
		`INSERT INTO builder_sources (kind, name, config, namespace, schedule, enabled)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		in.Kind, in.Name, []byte(in.Config), in.Namespace, in.Schedule, in.Enabled).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "builder_sources_uniq") {
			httpErr(w, http.StatusConflict, "a source of that kind and name already exists")
			return
		}
		s.log.Error("create source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not create the source")
		return
	}
	s.log.Info("source created", "kind", in.Kind, "name", in.Name, "enabled", in.Enabled)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type patchReq struct {
	Namespace *string          `json:"namespace"`
	Schedule  *string          `json:"schedule"`
	Enabled   *bool            `json:"enabled"`
	Config    *json.RawMessage `json:"config"`
}

func (s *Store) handlePatch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var in patchReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		httpErr(w, http.StatusBadRequest, "send a JSON body")
		return
	}
	if in.Namespace != nil && !strings.HasSuffix(*in.Namespace, ":project") {
		httpErr(w, http.StatusUnprocessableEntity,
			"a source must collect into a project brain, not an agent's private one")
		return
	}

	// COALESCE so an absent field means "leave it", not "set it to zero". A
	// PATCH that blanked the schedule because the form only sent `enabled`
	// would silently reset every source it touched.
	res, err := s.db.ExecContext(r.Context(),
		`UPDATE builder_sources SET
		     namespace = COALESCE($2, namespace),
		     schedule  = COALESCE($3, schedule),
		     enabled   = COALESCE($4, enabled),
		     config    = COALESCE($5, config),
		     -- Turning a source on should collect promptly rather than at the
		     -- end of whatever interval it was parked on.
		     next_run_at = CASE WHEN $4::boolean IS TRUE AND NOT enabled
		                        THEN now() ELSE next_run_at END,
		     updated_at = now()
		   WHERE id = $1`,
		id, in.Namespace, in.Schedule, in.Enabled, rawOrNil(in.Config))
	if err != nil {
		s.log.Error("patch source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not update the source")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such source")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func rawOrNil(m *json.RawMessage) any {
	if m == nil || len(*m) == 0 {
		return nil
	}
	return []byte(*m)
}

func (s *Store) handleDelete(w http.ResponseWriter, r *http.Request) {
	res, err := s.db.ExecContext(r.Context(),
		`DELETE FROM builder_sources WHERE id = $1`, chi.URLParam(r, "id"))
	if err != nil {
		s.log.Error("delete source", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not delete the source")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpErr(w, http.StatusNotFound, "no such source")
		return
	}
	// The memories it collected are deliberately left in the brain. They are
	// what the project knows; deleting the pipe that carried them is not a
	// statement that the knowledge was wrong.
	w.WriteHeader(http.StatusNoContent)
}

// handleRefresh runs one source now. This is the "does my configuration work?"
// path, and being unable to test a source before trusting it to a schedule is
// how a broken one runs unnoticed until somebody asks why the brain is stale.
func (s *Store) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var kind, name string
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT kind, name FROM builder_sources WHERE id = $1`,
		chi.URLParam(r, "id")).Scan(&kind, &name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such source")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not read the source")
		return
	}
	if err := s.RefreshNow(r.Context(), kind, name); err != nil {
		// 200 with the error in the body, not 500: the request succeeded, the
		// refresh is what failed, and the operator needs to read why. A 500
		// here would be indistinguishable from the server falling over.
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": Scrub(err.Error())})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type runView struct {
	ID        string     `json:"id"`
	Status    string     `json:"status"`
	Trigger   string     `json:"trigger"`
	RowsRead  int        `json:"rowsRead"`
	Truncated bool       `json:"truncated"`
	Error     string     `json:"error"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
}

// handleRuns is the history a single last_error cannot give: a source that
// fails at 03:00 and succeeds at 04:00 looks like it has always been fine.
func (s *Store) handleRuns(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, status, trigger, rows_read, truncated, error, started_at, ended_at
		   FROM builder_source_runs WHERE source_id = $1
		  ORDER BY started_at DESC LIMIT 50`, chi.URLParam(r, "id"))
	if err != nil {
		s.log.Error("list source runs", "err", Scrub(err.Error()))
		httpErr(w, http.StatusInternalServerError, "could not read the run history")
		return
	}
	defer rows.Close()

	out := []runView{}
	for rows.Next() {
		var v runView
		if err := rows.Scan(&v.ID, &v.Status, &v.Trigger, &v.RowsRead,
			&v.Truncated, &v.Error, &v.StartedAt, &v.EndedAt); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the run history")
			return
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": out})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
